import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CompiledQuery, db } from "../_shared/db.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * ---------------------------------------------------------------------------
 * Fusionner deux societes (NOS-1176)
 * ---------------------------------------------------------------------------
 * L'audit du 29 aout 2026 : « Un CRM avec des doublons visibles perd la
 * confiance du commercial en une semaine. » La mesure en production : 85
 * groupes, 172 fiches.
 *
 * Ecrit sur le modele de `merge_contacts`, avec deux differences qui viennent
 * de ce qu'une societe est referencee par cinq tables et par elle-meme.
 *
 * ## Pourquoi une fonction serveur et non une suite d'appels au dataProvider
 *
 * La fusion touche `contacts`, `deals`, `contracts`, `prospects`, la table
 * `companies` elle-meme, puis supprime la perdante. Fait depuis le navigateur,
 * un rechargement de page au milieu laisserait des contacts orphelins pointant
 * vers une societe supprimee -- pire etat que le doublon qu'on voulait
 * corriger. Ici tout tient dans une transaction : ca passe ou rien ne bouge.
 *
 * ## Le piege de la hierarchie
 *
 * `companies.parent_company_id` pointe vers `companies`. Reaffecter naivement
 * produit deux accidents :
 *
 *   - si la perdante etait le parent de la gagnante, la gagnante devient son
 *     propre parent ;
 *   - si la gagnante etait le parent de la perdante, le lien disparait avec
 *     elle, ce qui est correct.
 *
 * Le premier cas est traite explicitement plus bas. Une societe qui se declare
 * son propre parent casse tout affichage de groupe, en general en boucle
 * infinie.
 *
 * ## Kysely ne connait pas ces tables
 *
 * `_shared/db.ts` ne declare que contacts, tasks, contact_notes et deals. Les
 * requetes ci-dessous passent donc par `CompiledQuery.raw` avec des parametres
 * lies -- jamais d'interpolation de chaine. Declarer cinq tables de plus dans
 * le type juste pour cette fonction aurait fige ici un schema qui vit ailleurs.
 */

/** Les colonnes texte ou la valeur non vide gagne, gagnante d'abord. */
const TEXT_FIELDS = [
  "name",
  "sector",
  "type",
  "establishment_type",
  "linkedin_url",
  "website",
  "phone_number",
  "address",
  "zipcode",
  "city",
  "state_abbr",
  "country",
  "revenue",
  "tax_identifier",
  "vat_number",
] as const;

interface CompanyRow {
  id: number;
  parent_company_id: number | null;
  description: string | null;
  description_source: string | null;
  logo: unknown | null;
  context_links: string[] | null;
  size: number | null;
  sales_id: number | null;
  [key: string]: unknown;
}

/**
 * Ce que la fiche gagnante vaudra apres fusion.
 *
 * Regle generale : la valeur de la gagnante si elle en a une, celle de la
 * perdante sinon. Une fusion ne doit jamais faire PERDRE une information -- un
 * champ vide chez la gagnante et rempli chez la perdante se remplit.
 */
function mergeCompanyData(winner: CompanyRow, loser: CompanyRow) {
  const merged: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    const own = winner[field];
    const other = loser[field];
    const ownIsSet = typeof own === "string" && own.trim() !== "";
    merged[field] = ownIsSet ? own : (other ?? own ?? null);
  }

  /*
   * Le descriptif et sa provenance voyagent ensemble.
   *
   * `description_source` vaut 'ai' quand un modele l'a redige, et la fiche
   * affiche « Redige par IA ». Prendre le texte de la perdante en gardant la
   * source de la gagnante presenterait une inference comme une donnee verifiee
   * -- exactement ce que cette colonne existe pour eviter.
   */
  const winnerHasDescription =
    typeof winner.description === "string" && winner.description.trim() !== "";
  merged.description = winnerHasDescription
    ? winner.description
    : (loser.description ?? null);
  merged.description_source = winnerHasDescription
    ? winner.description_source
    : (loser.description_source ?? null);

  // Le logo : celui de la gagnante s'il existe, sinon celui de la perdante.
  const winnerLogo = winner.logo as { src?: string } | null;
  merged.logo = winnerLogo?.src ? winner.logo : (loser.logo ?? null);

  // Liens de contexte : union, ordre de la gagnante d'abord.
  merged.context_links = [
    ...new Set([...(winner.context_links ?? []), ...(loser.context_links ?? [])]),
  ];

  merged.size = winner.size ?? loser.size ?? null;
  merged.sales_id = winner.sales_id ?? loser.sales_id ?? null;

  /*
   * Le parent, avec le garde-fou.
   *
   * Si le parent retenu est la fiche gagnante elle-meme, on n'en met aucun :
   * une societe qui se declare son propre parent casse l'affichage de groupe,
   * en general en boucle infinie.
   */
  const parent = winner.parent_company_id ?? loser.parent_company_id ?? null;
  merged.parent_company_id = parent === winner.id ? null : parent;

  return merged;
}

async function mergeCompanies(
  loserId: number,
  winnerId: number,
  userId: string,
) {
  if (loserId === winnerId) {
    throw new Error("Une societe ne peut pas etre fusionnee avec elle-meme");
  }

  return await db.transaction().execute(async (trx) => {
    await trx.executeQuery(CompiledQuery.raw("SET LOCAL ROLE authenticated"));
    await trx.executeQuery(
      CompiledQuery.raw("SELECT set_config('request.jwt.claim.sub', $1, true)", [
        userId,
      ]),
    );

    const { rows } = await trx.executeQuery<CompanyRow>(
      CompiledQuery.raw(
        "select * from public.companies where id = any($1::bigint[])",
        [[winnerId, loserId]],
      ),
    );

    const winner = rows.find((row) => Number(row.id) === winnerId);
    const loser = rows.find((row) => Number(row.id) === loserId);
    if (!winner || !loser) {
      throw new Error("Societe introuvable");
    }

    // Les quatre tables qui referencent `companies` par `company_id`.
    for (const table of ["contacts", "deals", "contracts", "prospects"]) {
      await trx.executeQuery(
        CompiledQuery.raw(
          `update public.${table} set company_id = $1 where company_id = $2`,
          [winnerId, loserId],
        ),
      );
    }

    /*
     * Les filles de la perdante deviennent filles de la gagnante -- sauf la
     * gagnante elle-meme, qui deviendrait sa propre fille.
     */
    await trx.executeQuery(
      CompiledQuery.raw(
        "update public.companies set parent_company_id = $1 where parent_company_id = $2 and id <> $1",
        [winnerId, loserId],
      ),
    );
    await trx.executeQuery(
      CompiledQuery.raw(
        "update public.companies set parent_company_id = null where parent_company_id = $1 and id = $2",
        [loserId, winnerId],
      ),
    );

    /*
     * Les colonnes JSON se passent en TEXTE, avec leur cast (NOS-1202).
     *
     * `context_links` est de type `json`, `logo` de type `jsonb`. Leur passer
     * un objet ou un tableau JavaScript brut faisait echouer la requete : le
     * pilote encode un tableau en litteral Postgres `{a,b}` et un objet en
     * `[object Object]`, ni l un ni l autre n etant du JSON valide.
     *
     * Toute la transaction etait donc annulee -- ce que le message disait
     * fidelement ("aucune fiche n a ete modifiee"), sans jamais dire pourquoi.
     *
     * `JSON.stringify` produit le texte, le cast dit a Postgres comment le
     * lire. `null` reste `null` : la chaine "null" serait le JSON valide
     * representant la valeur nulle, ce qui n est pas la meme chose qu une
     * colonne vide.
     */
    const COLONNES_JSON: Record<string, string> = {
      logo: "jsonb",
      context_links: "json",
    };

    const merged = mergeCompanyData(winner, loser);
    const columns = Object.keys(merged);
    const assignments = columns
      .map((column, index) => {
        const cast = COLONNES_JSON[column];
        return `${column} = ${index + 1}${cast ? `::${cast}` : ""}`;
      })
      .join(", ");

    const valeurs = columns.map((column) => {
      const valeur = merged[column];
      if (!COLONNES_JSON[column]) return valeur;
      return valeur == null ? null : JSON.stringify(valeur);
    });

    await trx.executeQuery(
      CompiledQuery.raw(
        `update public.companies set ${assignments} where id = ${columns.length + 1}`,
        [...valeurs, winnerId],
      ),
    );

    await trx.executeQuery(
      CompiledQuery.raw("delete from public.companies where id = $1", [
        loserId,
      ]),
    );

    return { success: true, winnerId };
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        try {
          const { loserId, winnerId } = await req.json();
          if (!loserId || !winnerId) {
            return createErrorResponse(400, "Missing loserId or winnerId");
          }

          const result = await mergeCompanies(
            Number(loserId),
            Number(winnerId),
            user.id,
          );

          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("merge_companies.error", error);
          return createErrorResponse(
            500,
            error instanceof Error ? error.message : "Merge failed",
          );
        }
      }),
    ),
  ),
);
