import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware } from "../_shared/authentication.ts";

/**
 * ---------------------------------------------------------------------------
 * « Compléter avec l'IA » — enrichissement d'une société (NOS-1151)
 * ---------------------------------------------------------------------------
 * Remplace `enrich-mistral-company`, qui n'a jamais fonctionné en production :
 * elle lisait `MISTRAL_API_KEY`, absente du projet, et n'avait de toute façon
 * jamais été déployée (404 sur son endpoint). Le bouton échouait donc depuis
 * toujours. `ANTHROPIC_API_KEY` est en revanche configurée.
 *
 * ## Deux sources, et la raison du partage
 *
 * **Pappers** pour les identifiants légaux — SIRET, SIREN, TVA — plus adresse
 * et effectif. Ce sont des faits enregistrés : ils se lisent dans un registre,
 * ils ne se devinent pas. Demander un SIRET à un modèle produirait un nombre
 * à quatorze chiffres parfaitement formé et parfaitement faux, qu'aucune
 * relecture humaine ne rattraperait — c'est exactement le mauvais SIRET que
 * NOS-1148 s'est employé à éviter.
 *
 * **Claude** pour ce qu'aucun registre ne contient : ce que fait l'entreprise,
 * pour qui, son secteur, sa typologie. Consigne stricte de renvoyer `null`
 * plutôt que d'inventer, comme pour la reprise des descriptifs (NOS-1149) où
 * elle a écarté 101 sociétés sur 159.
 *
 * Les deux appels partent en parallèle : ils ne dépendent pas l'un de l'autre,
 * et l'utilisateur attend devant son écran.
 *
 * ## Priorité en cas de désaccord
 *
 * Pappers gagne sur tout ce qu'il fournit. Un registre prime sur une
 * inférence, sans discussion.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";
const PAPPERS_BASE = "https://api.pappers.fr/v2";

type LabeledValue = { value: string; label: string };

interface RequestBody {
  name?: string;
  sectors?: LabeledValue[];
  types?: LabeledValue[];
  /**
   * Second appel : l'etablissement choisi dans la liste (NOS-1152).
   *
   * Sa presence bascule la fonction en mode "registre seul" -- le qualitatif
   * est deja a l'ecran, le regenerer couterait un appel pour reecrire la meme
   * chose.
   */
  siren?: string;
}

/** Un etablissement propose a l'utilisateur quand le nom ne tranche pas. */
interface LegalCandidate {
  siren: string;
  siret?: string;
  name: string;
  city?: string;
  zipcode?: string;
  forme_juridique?: string;
  date_creation?: string;
}

interface Enrichment {
  name?: string;
  website?: string;
  linkedin_url?: string;
  phone_number?: string;
  description?: string;
  description_source?: "ai";
  sector?: string;
  type?: string;
  size?: 1 | 10 | 50 | 250 | 500;
  address?: string;
  city?: string;
  zipcode?: string;
  country?: string;
  tax_identifier?: string;
  vat_number?: string;
  revenue?: string;
  not_found?: boolean;
  /**
   * Etablissements proposes quand le nom ne tranche pas (NOS-1152).
   *
   * Message pour l'interface, jamais une donnee de societe : le formulaire le
   * retire avant d'ecrire.
   */
  legal_candidates?: LegalCandidate[];
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
};

/**
 * Chiffre d'affaires en libelle court, dans le meme format que celui deja
 * saisi a la main sur les fiches ("$1M", "1,2 M EUR"...). On reste sur les
 * ordres de grandeur : le CA d'un exercice passe n'a pas vocation a etre lu
 * a l'euro pres dans un CRM.
 */
function formatRevenue(ca: number): string {
  if (ca >= 1_000_000_000) return `${Math.round(ca / 100_000_000) / 10} Md EUR`;
  if (ca >= 1_000_000) return `${Math.round(ca / 100_000) / 10} M EUR`;
  if (ca >= 1_000) return `${Math.round(ca / 1_000)} k EUR`;
  return `${ca} EUR`;
}

/**
 * Effectif Pappers vers les paliers du CRM (1, 10, 50, 250, 500).
 *
 * `effectif_max` est retenu plutot que `effectif`, qui arrive en libelle
 * ("0 salarie", "10 a 19 salaries") et demanderait un analyseur de chaines.
 */
function sizeFromHeadcount(max: unknown): 1 | 10 | 50 | 250 | 500 | undefined {
  if (typeof max !== "number" || max <= 0) return undefined;
  if (max < 2) return 1;
  if (max < 10) return 10;
  if (max < 50) return 50;
  if (max < 250) return 250;
  return 500;
}

/**
 * Fiche complete d'un etablissement choisi par l'utilisateur (NOS-1152).
 *
 * Appelee apres son clic, sur `/entreprise` : c'est la seule route qui porte
 * le numero de TVA, et elle rend aussi les finances et l'effectif. Ici plus
 * aucune heuristique -- un humain a designe l'entreprise, on lit sa fiche.
 */
async function fetchLegalBySiren(
  siren: string,
): Promise<Partial<Enrichment> | null> {
  const token = Deno.env.get("PAPPERS_API_KEY");
  if (!token) return null;
  try {
    const res = await fetch(
      `${PAPPERS_BASE}/entreprise?siren=${encodeURIComponent(siren)}&api_token=${token}`,
    );
    if (!res.ok) {
      console.warn(`[enrich-company-ai] Pappers detail HTTP ${res.status}`);
      return null;
    }
    const d = await res.json();
    const siege = (d["siege"] ?? {}) as Record<string, never>;
    const finance = ((d["finances"] ?? []) as Record<string, never>[])[0];
    const ca = finance?.["chiffre_affaires"] ?? d["chiffre_affaires"];

    return {
      name: str(d["denomination"]) ?? str(d["nom_entreprise"]),
      tax_identifier: str(siege["siret"]) ?? str(d["siret_siege"]),
      vat_number: str(d["numero_tva_intracommunautaire"]),
      address: str(siege["adresse_ligne_1"]),
      city: str(siege["ville"]),
      zipcode: str(siege["code_postal"]),
      country: str(siege["pays"]) ?? "France",
      revenue: typeof ca === "number" && ca > 0 ? formatRevenue(ca) : undefined,
      size: sizeFromHeadcount(d["effectif_max"]),
    };
  } catch (e) {
    console.warn("[enrich-company-ai] Pappers detail indisponible:", e);
    return null;
  }
}

/** Normalisation pour comparer deux raisons sociales. */
const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\b(SAS|SARL|SA|SCI|SELARL|SELAS|EURL|SASU|SNC|SCM|SCP)\b/g, "")
    .replace(/[^A-Z0-9]/g, "");

/**
 * Identifiants légaux, lus chez Pappers.
 *
 * Le nom doit correspondre **exactement** une fois normalisé, et un seul
 * candidat doit survivre. Même sévérité que la reprise de NOS-1148, et pour la
 * même raison : ici on écrit un SIRET dans une fiche neuve que personne ne
 * relira. Un doute, et on ne renvoie rien.
 */
async function fetchLegalIdentity(
  name: string,
): Promise<Partial<Enrichment> | null> {
  const token = Deno.env.get("PAPPERS_API_KEY");
  if (!token) {
    console.warn("[enrich-company-ai] PAPPERS_API_KEY absente");
    return null;
  }
  try {
    const url =
      `${PAPPERS_BASE}/recherche?q=${encodeURIComponent(name)}` +
      `&par_page=5&api_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[enrich-company-ai] Pappers HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const results = (data.resultats ?? []) as Array<Record<string, never>>;
    const wanted = norm(name);
    const exacts = results.filter(
      (r) => norm(String(r["nom_entreprise"] ?? "")) === wanted,
    );

    /*
     * Un seul homonyme exact : on remplit. Sinon on rend la liste et
     * l'utilisateur tranche (NOS-1152).
     *
     * C'est la difference avec la reprise en masse de NOS-1148, ou personne
     * n'etait la pour arbitrer et ou le silence etait la seule option sure.
     * Ici quelqu'un est devant son ecran : lui montrer les candidats vaut
     * mieux que de decider a sa place, et mieux encore que de ne rien dire.
     *
     * Les candidats ne sont pas restreints aux correspondances exactes.
     * "Hopital Saint Joseph Marseille" n'a aucun homonyme strict mais cinq
     * voisins plausibles, et c'est exactement le cas des 89 societes que la
     * reprise n'avait pas su rattacher : les montrer, c'est les rendre
     * rattachables a la main.
     */
    if (exacts.length !== 1) {
      return {
        legal_candidates: results.slice(0, 5).map((c) => {
          const s = (c["siege"] ?? {}) as Record<string, never>;
          return {
            siren: str(c["siren"]) ?? "",
            siret: str(s["siret"]),
            name: str(c["nom_entreprise"]) ?? "",
            city: str(s["ville"]),
            zipcode: str(s["code_postal"]),
            forme_juridique: str(c["forme_juridique"]),
            date_creation: str(c["date_creation"]),
          };
        }),
      };
    }

    const r = exacts[0] as Record<string, never>;
    const siege = (r["siege"] ?? {}) as Record<string, never>;
    const siren = str(r["siren"]);

    /*
     * Le numero de TVA n'est PAS dans la reponse de `/recherche` -- verifie :
     * ses clefs racine n'en contiennent aucune. Il faut le second appel, sur
     * `/entreprise`.
     *
     * On ne le calcule surtout pas depuis le SIREN. La regle francaise est
     * connue (FR + cle + SIREN), mais fabriquer une cle de controle
     * produirait un numero fiscal d'apparence valide que personne ne
     * verifierait -- exactement le genre de donnee fausse qui ne se signale
     * jamais.
     *
     * Second appel seulement quand un candidat unique a survecu : on ne
     * consomme pas de quota sur un doute.
     */
    let vat: string | undefined;
    if (siren) {
      try {
        const detail = await fetch(
          `${PAPPERS_BASE}/entreprise?siren=${siren}&api_token=${token}`,
        );
        if (detail.ok) {
          const d = await detail.json();
          vat = str(d["numero_tva_intracommunautaire"]);
        }
      } catch (e) {
        console.warn("[enrich-company-ai] TVA indisponible:", e);
      }
    }

    // `chiffre_affaires` et `effectif` sont, eux, bien presents sur la
    // recherche : autant les prendre sans appel supplementaire.
    const ca = r["chiffre_affaires"];
    const effectifMax = r["effectif_max"];

    return {
      tax_identifier: str(siege["siret"]),
      vat_number: vat,
      address: str(siege["adresse_ligne_1"]),
      city: str(siege["ville"]),
      zipcode: str(siege["code_postal"]),
      country: str(siege["pays"]) ?? "France",
      name: str(r["nom_entreprise"]),
      revenue: typeof ca === "number" && ca > 0 ? formatRevenue(ca) : undefined,
      size: sizeFromHeadcount(effectifMax),
    };
  } catch (e) {
    console.warn("[enrich-company-ai] Pappers indisponible:", e);
    return null;
  }
}

/** Ce qu'aucun registre ne contient : l'activité, le secteur, la typologie. */
async function fetchQualitative(
  name: string,
  sectors: LabeledValue[],
  types: LabeledValue[],
): Promise<Partial<Enrichment> | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("[enrich-company-ai] ANTHROPIC_API_KEY absente");
    return null;
  }

  const sectorList = sectors.map((s) => `- "${s.value}" (${s.label})`).join("\n");
  const typeList = types.map((t) => `- "${t.value}" (${t.label})`).join("\n");

  const system = `Tu renseignes la fiche d'une entreprise dans un CRM commercial francais du secteur de la sante.

REGLE ABSOLUE : n'invente jamais. Un champ dont tu n'es pas sur se renvoie a null.
Ces valeurs seront lues par un commercial et repetees a un client : une erreur
plausible est pire qu'un champ vide. Si tu ne connais pas du tout l'entreprise,
renvoie {"not_found": true}.

Ne demande RIEN qui releve d'un registre legal : ni SIRET, ni SIREN, ni numero
de TVA, ni chiffre d'affaires. Ces valeurs viennent d'une autre source.

Ne paraphrase pas le nom : si tu n'as rien de plus a dire que ce que le nom
indique deja, renvoie null pour la description.

Schema JSON attendu :
{
  "name": string (raison sociale officielle),
  "website": string (URL complete https://...),
  "linkedin_url": string,
  "phone_number": string (format international),
  "description": string (1-2 phrases en francais sur l'activite reelle),
  "sector": string (UNE des valeurs ci-dessous),
  "type": string (UNE des valeurs ci-dessous),
  "size": number (UN des codes 1, 10, 50, 250, 500),
  "address": string (rue uniquement),
  "city": string,
  "zipcode": string,
  "country": string,
  "not_found": boolean
}

Codes "size" : 1 = 1 employe, 10 = 2-9, 50 = 10-49, 250 = 50-249, 500 = 250+.

Valeurs autorisees pour "sector" (exactement la valeur entre guillemets) :
${sectorList}

Valeurs autorisees pour "type" :
${typeList}

Reponds UNIQUEMENT avec le JSON.`;

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: `Entreprise : "${name}"` }],
      }),
    });
    if (!res.ok) {
      console.error(`[enrich-company-ai] Anthropic HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    // Chercher le bloc `text` : la reponse commence par un bloc `thinking`, et
    // lire `content[0]` rendait une chaine vide a tous les coups.
    const text =
      (data.content ?? []).find(
        (b: { type?: string }) => b.type === "text",
      )?.text ?? "";
    const raw = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());

    if (raw.not_found === true) return { not_found: true };

    const out: Partial<Enrichment> = {
      name: str(raw.name),
      website: str(raw.website),
      linkedin_url: str(raw.linkedin_url),
      phone_number: str(raw.phone_number),
      address: str(raw.address),
      city: str(raw.city),
      zipcode: str(raw.zipcode),
      country: str(raw.country),
    };

    const description = str(raw.description);
    if (description) {
      out.description = description;
      // Tracé dès l'écriture (NOS-1149) : celui qui lira cette fiche doit
      // savoir qu'il lit une inference, pas une source.
      out.description_source = "ai";
    }

    const sector = str(raw.sector);
    if (sector && sectors.some((s) => s.value === sector)) out.sector = sector;
    const type = str(raw.type);
    if (type && types.some((t) => t.value === type)) out.type = type;
    if ([1, 10, 50, 250, 500].includes(raw.size)) out.size = raw.size;

    return out;
  } catch (e) {
    console.error("[enrich-company-ai] Anthropic illisible:", e);
    return null;
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const name = str(body.name);
  if (!name) return jsonResponse(400, { error: "name is required" });

  /*
   * Second temps : l'utilisateur a choisi son etablissement dans la liste
   * (NOS-1152). On ne rappelle QUE Pappers -- le qualitatif est deja dans son
   * ecran, et relancer le modele couterait un appel pour reecrire la meme
   * chose.
   */
  const siren = str(body.siren);
  if (siren) {
    const legalOnly = await fetchLegalBySiren(siren);
    if (!legalOnly) {
      return jsonResponse(502, {
        error: "Etablissement introuvable au registre",
      });
    }
    for (const key of Object.keys(legalOnly) as (keyof Enrichment)[]) {
      if (legalOnly[key] === undefined) delete legalOnly[key];
    }
    return jsonResponse(200, legalOnly);
  }

  const sectors = Array.isArray(body.sectors) ? body.sectors : [];
  const types = Array.isArray(body.types) ? body.types : [];

  // En parallele : les deux sources sont independantes, et l'utilisateur
  // attend devant son ecran.
  const [legal, qualitative] = await Promise.all([
    fetchLegalIdentity(name),
    fetchQualitative(name, sectors, types),
  ]);

  // La liste de candidats est un message pour l'interface, pas une donnee de
  // societe : on la met de cote avant toute fusion.
  const candidates = legal?.legal_candidates;
  const legalData = candidates ? null : legal;

  // Inconnue des deux cotes : le dire, plutot que de rendre une fiche vide qui
  // ressemblerait a une panne.
  if (qualitative?.not_found && !legalData && !candidates?.length) {
    return jsonResponse(200, { not_found: true });
  }
  if (!legal && !qualitative) {
    return jsonResponse(502, {
      error: "Aucune source d'enrichissement n'a repondu",
    });
  }

  // Pappers en dernier : un registre prime sur une inference.
  const merged: Enrichment = {
    ...(qualitative?.not_found ? {} : (qualitative ?? {})),
    ...(legalData ?? {}),
    ...(candidates?.length ? { legal_candidates: candidates } : {}),
  };
  delete merged.not_found;

  for (const key of Object.keys(merged) as (keyof Enrichment)[]) {
    if (merged[key] === undefined) delete merged[key];
  }

  return jsonResponse(200, merged);
}

Deno.serve((req) =>
  OptionsMiddleware(req, (req) => AuthMiddleware(req, handler)),
);
