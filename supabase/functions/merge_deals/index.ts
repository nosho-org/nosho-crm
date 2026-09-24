import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sql } from "https://esm.sh/kysely@0.27.2";
import { db, CompiledQuery } from "../_shared/db.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import {
  calculerFusion,
  noteDeFusion,
  refusDeFusion,
  type OpportuniteFusionnable,
} from "./fusionOpportunites.ts";

/**
 * ---------------------------------------------------------------------------
 * Fusionner deux opportunites -- l'ordre des ecritures
 * ---------------------------------------------------------------------------
 * Les regles vivent dans `fusionOpportunites.ts`, testees sans base. Ici, une
 * transaction et rien d'autre : ou tout passe, ou rien ne bouge. Une fusion
 * interrompue au milieu laisserait les taches d'un cote et les notes de
 * l'autre, sans qu'aucun ecran ne le signale.
 *
 * Meme prologue que `merge_contacts` : on redescend sur le role
 * `authenticated` et on pose `request.jwt.claim.sub`, pour que les RLS
 * s'appliquent a l'utilisateur qui demande la fusion et non au role de
 * service. Une fusion est une operation de confiance, pas une dispense.
 *
 * L'absorbee est archivee, jamais supprimee -- le raisonnement est ecrit en
 * tete de `fusionOpportunites.ts`.
 */

const COLONNES_LUES = [
  "id",
  "name",
  "company_id",
  "contact_ids",
  "contact_roles",
  "products",
  "description",
  "category",
  "motion",
  "opportunity_type",
  "company_type",
  "lead_source",
  "referrer_id",
] as const;

async function mergeDeals(
  loserId: number,
  winnerId: number,
  userId: string,
): Promise<{
  success: true;
  winnerId: number;
  deplaces: Record<string, number>;
}> {
  return await db.transaction().execute(async (trx) => {
    await trx.executeQuery(CompiledQuery.raw("SET LOCAL ROLE authenticated"));
    await trx.executeQuery(
      CompiledQuery.raw(
        `SELECT set_config('request.jwt.claim.sub', '${userId}', true)`,
      ),
    );

    // 1. Les deux fiches. `OrThrow` : un identifiant inconnu -- ou masque par
    //    les RLS -- doit faire echouer la transaction, pas produire une fusion
    //    a moitie faite avec `undefined`.
    const [gagnante, perdante] = await Promise.all([
      trx
        .selectFrom("deals")
        .select(COLONNES_LUES)
        .where("id", "=", winnerId)
        .executeTakeFirstOrThrow(),
      trx
        .selectFrom("deals")
        .select(COLONNES_LUES)
        .where("id", "=", loserId)
        .executeTakeFirstOrThrow(),
    ]);

    /*
     * 2. Ce qu'on lit et ce qu'on fait suit la fiche gardee.
     *
     * `deal_change_log` et `crm_notifications` restent volontairement sur
     * l'absorbee : le premier decrirait des etapes que la gagnante n'a jamais
     * franchies, les secondes feraient croire qu'une alerte a deja ete emise
     * pour elle.
     */
    const deplaces: Record<string, number> = {};
    for (const table of [
      "deal_notes",
      "tasks",
      "contracts",
      "call_logs",
    ] as const) {
      const res = await trx
        .updateTable(table)
        .set({ deal_id: winnerId })
        .where("deal_id", "=", loserId)
        .executeTakeFirst();
      deplaces[table] = Number(res?.numUpdatedRows ?? 0);
    }

    // 3. Les colonnes de la gagnante.
    const maj = calculerFusion(
      gagnante as unknown as OpportuniteFusionnable,
      perdante as unknown as OpportuniteFusionnable,
    );
    await trx
      .updateTable("deals")
      .set({
        ...maj,
        contact_roles: JSON.stringify(maj.contact_roles) as never,
      })
      .where("id", "=", winnerId)
      .execute();

    /*
     * 4. La trace, en note sur la gagnante.
     *
     * `sales_id` vient de la table `sales`, pas de `auth.users` : c'est le
     * meme detour que partout ailleurs dans le CRM. S'il ne resout rien, la
     * note part sans auteur plutot que de faire echouer la fusion -- perdre
     * la fusion pour un nom manquant serait un mauvais echange.
     */
    const auteur = await trx
      .selectFrom("sales")
      .select("id")
      .where("user_id", "=", userId)
      .executeTakeFirst();

    await trx
      .insertInto("deal_notes")
      .values({
        deal_id: winnerId,
        text: noteDeFusion(
          { id: perdante.id, name: perdante.name },
          gagnante.company_id === perdante.company_id,
        ),
        sales_id: auteur?.id ?? null,
        date: sql`now()` as never,
      })
      .execute();

    // 5. L'absorbee quitte le board, sans perdre une ligne.
    await trx
      .updateTable("deals")
      .set({ archived_at: sql`now()` as never })
      .where("id", "=", loserId)
      .execute();

    return { success: true as const, winnerId, deplaces };
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

          const refus = refusDeFusion(winnerId, loserId);
          if (refus) {
            return createErrorResponse(400, refus);
          }

          const result = await mergeDeals(
            Number(loserId),
            Number(winnerId),
            user.id,
          );

          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          console.error("Merge failed:", error);
          return createErrorResponse(
            500,
            `Failed to merge deals: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      }),
    ),
  ),
);
