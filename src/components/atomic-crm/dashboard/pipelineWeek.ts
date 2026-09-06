import type { Identifier } from "ra-core";
import type { DealStage } from "../types";

/**
 * ---------------------------------------------------------------------------
 * La semaine du pipeline (NOS-1378)
 * ---------------------------------------------------------------------------
 * Marc-Henri, le 06/09/2026 : « chaque lundi, pouvoir voir immédiatement
 * combien de nouveaux leads avons-nous générés, combien d'opportunités ont
 * avancé, où le pipeline bouge, combien avons-nous gagné/perdu. Aucun
 * reporting Excel manuel. »
 *
 * ## Pourquoi aucun instantané n'est stocké
 *
 * La demande décrivait un cron dominical figeant le stock par étape dans une
 * table. Ce module calcule à la volée depuis `deal_change_log`, et c'est un
 * choix, pas un raccourci.
 *
 * Le journal enregistre chaque changement d'étape depuis mars 2026 et n'est
 * jamais écrasé. Il permet donc de reconstituer le stock à **n'importe quelle**
 * date, y compris rétroactivement — un instantané ne sait rien de plus. Il
 * ajoute en revanche trois façons de mentir : une semaine perdue à jamais si le
 * job saute, une définition qu'on ne peut plus corriger après coup, et une
 * seconde source de vérité qui peut diverger de la première.
 *
 * Le lundi matin, les chiffres sont ceux de l'instant, pas ceux de dimanche 17h.
 *
 * ## Les définitions, telles que tranchées
 *
 * Elles viennent de Simon (06/09/2026) et ne sont pas négociables ici — c'est
 * précisément pour qu'elles vivent en un seul endroit que ce module existe.
 *
 * **« Entrées » et « vs W-1 » ne sont pas la même chose**, et c'est le point
 * que Marc-Henri a insisté pour distinguer. Une étape peut recevoir cinq
 * opportunités et n'en gagner que deux en stock : trois en sont reparties. Les
 * entrées mesurent un flux, la variation mesure un solde.
 *
 * **« Ayant bougé » compte tout changement d'étape**, y compris un passage en
 * Lost. J'avais recommandé de l'exclure — une perte n'est pas une avancée ;
 * Simon a tranché l'inverse, et il a une raison : la question posée est « où le
 * pipeline bouge-t-il », et une affaire perdue a bougé. Une opportunité qui
 * change deux fois d'étape dans la semaine ne compte qu'une fois.
 *
 * ## Seuls les changements humains comptent
 *
 * Tout ici ignore les lignes `source <> 'user'`. La reprise du 06/09/2026
 * (NOS-1377), qui a redécoupé « Démo / POC », a écrit 14 lignes
 * `demo-poc -> demo` en une seconde. Sans ce filtre, le tableau aurait annoncé
 * le lundi suivant « 14 opportunités ayant avancé » et « Démo +13 vs W-1 »,
 * pour un pipeline où rien n'avait bougé.
 *
 * Le filtre vaut aussi pour la **reconstitution** du stock, pas seulement pour
 * les compteurs : rembobiner en tenant compte de la migration replacerait ces
 * 14 opportunités dans une étape qui n'existe plus, et afficherait la création
 * de l'étape comme un mouvement commercial.
 *
 * ## Ce dont ce module n'a PAS besoin
 *
 * D'un journal complet depuis l'origine. J'avais annoncé qu'un backfill des
 * 75 opportunités sans ligne de création était un prérequis : la mesure dit le
 * contraire. `deals.created_at` suffit à savoir si une opportunité existait au
 * début de la semaine, et son étape d'alors se déduit en rembobinant ses
 * changements. Une opportunité sans aucun changement depuis lundi était déjà
 * dans son étape actuelle — l'absence de ligne est elle-même l'information.
 */

/** Une ligne de `deal_change_log`. `old_value` / `new_value` sont du jsonb. */
export interface StageChangeRow {
  deal_id: Identifier;
  field: string;
  operation?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  changed_at: string;
  source?: string | null;
}

/** Ce qu'une opportunité doit porter pour entrer dans ce calcul. */
export interface WeekDeal {
  id: Identifier;
  stage?: string | null;
  amount?: number | null;
  created_at?: string | null;
  entered_at?: string | null;
}

export interface MouvementEtape {
  /** Opportunités ayant REJOINT l'étape pendant la semaine — un flux. */
  entrees: number;
  /** Stock d'aujourd'hui moins stock de lundi matin — un solde, souvent négatif. */
  variation: number;
}

export interface KpisSemaine {
  nouveauxLeads: number;
  /** Opportunités ayant changé d'étape, dédoublonnées. Lost inclus. */
  ayantBouge: number;
  won: { count: number; amount: number };
  lost: { count: number; amount: number };
}

export interface SemainePipeline {
  /** Lundi 00h00, heure locale. */
  debut: Date;
  parEtape: Record<string, MouvementEtape>;
  kpis: KpisSemaine;
}

/**
 * Lundi 00h00 **locale**, jamais UTC.
 *
 * Passer par `toISOString()` ferait basculer la frontière d'un jour pendant
 * l'heure d'été à Paris : un mouvement du lundi 01h serait rangé dans la
 * semaine précédente. Le CRM a déjà connu ce défaut sur la file d'actions, où
 * « aujourd'hui » s'affichait « hier ».
 */
export function debutDeSemaine(now: Date): Date {
  // getDay() rend 0 pour dimanche ; on veut lundi comme premier jour.
  const reculJours = (now.getDay() + 6) % 7;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - reculJours,
    0,
    0,
    0,
    0,
  );
}

/** Un instant, ou `null` si la date est absente ou illisible. */
function instant(valeur: string | null | undefined): Date | null {
  if (!valeur) return null;
  // Une date nue (`2026-09-06`) est lue à midi UTC : à minuit, le décalage
  // horaire la ferait basculer la veille dans les fuseaux à l'ouest.
  const brut = /^\d{4}-\d{2}-\d{2}$/.test(valeur.trim())
    ? `${valeur.trim()}T12:00:00Z`
    : valeur;
  const date = new Date(brut);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Le jsonb du journal rend une chaîne pour une étape, `null` sinon — puis la
 * chaîne est résolue à travers les renommages.
 *
 * ## Pourquoi cette résolution est nécessaire
 *
 * Le journal traverse les renommages d'étapes, et il les traverse **au milieu
 * d'une semaine**. Constaté en production le 06/09/2026 : le redécoupage de
 * « Démo / POC » (NOS-1377) a eu lieu un dimanche, mais l'opportunité 301
 * avait été déplacée vers `demo-poc` le mardi précédent, **par un humain**.
 *
 * Cette ligne-là n'est pas une reprise de migration : elle décrit un vrai
 * mouvement commercial. Sans résolution, sa destination `demo-poc` devient une
 * étape inconnue, l'entrée est perdue — pendant que l'opportunité, elle, compte
 * bien dans le stock actuel de Démo. Le bloc affichait « Démo + 2 vs W-1 » pour
 * « 1 entrée » : un solde plus grand que son flux, ce qui est impossible et
 * saute aux yeux du lecteur.
 *
 * `legacyDealStages` porte déjà ces correspondances. Le prochain renommage
 * produira le même artefact, et sera couvert par le même mécanisme.
 */
function etapeDe(valeur: unknown, alias: Record<string, string>): string | null {
  if (typeof valeur !== "string" || valeur.length === 0) return null;
  return alias[valeur] ?? valeur;
}

/**
 * La date qui compte pour l'entrée en pipeline.
 *
 * `entered_at` est saisie par le commercial, `created_at` est le moment où la
 * fiche a été tapée. Elles diffèrent à chaque reprise d'historique, et c'est la
 * première qui décrit l'activité commerciale — même règle que le KPI mensuel
 * « Nouveaux leads » (NOS-1178), pour que les deux chiffres se rapprochent.
 */
function dateDEntree(deal: WeekDeal): Date | null {
  return instant(deal.entered_at) ?? instant(deal.created_at);
}

/** Étape gagnée. Les deux issues ont leur propre KPI dans le bloc. */
const ETAPE_GAGNEE = "closed-won";

/**
 * Étape perdue.
 *
 * `churn` en est exclu volontairement : c'est une perte APRÈS signature, qui ne
 * raconte pas la même chose qu'une affaire jamais gagnée. La mélanger au Lost
 * de la semaine ferait lire une défaite commerciale là où il y a une
 * résiliation.
 */
const ETAPE_PERDUE = "lost";

export function computePipelineWeek(
  deals: WeekDeal[],
  changements: StageChangeRow[],
  stages: DealStage[],
  now: Date = new Date(),
  /**
   * Correspondances des étapes renommées — en pratique `legacyDealStages`.
   *
   * S'applique aux valeurs lues DANS LE JOURNAL, jamais à l'étape actuelle des
   * opportunités : celle-ci a déjà été reprise en base par la migration qui a
   * accompagné le renommage.
   */
  alias: Record<string, string> = {},
): SemainePipeline {
  const debut = debutDeSemaine(now);
  const etapesConnues = new Set(stages.map((s) => s.value));

  /*
   * Les changements d'étape humains de la semaine, par opportunité et dans
   * l'ordre chronologique. L'ordre porte le sens : le premier donne l'étape de
   * lundi matin, chacun donne une entrée.
   */
  const parDeal = new Map<string, StageChangeRow[]>();
  for (const ligne of changements) {
    if (ligne.field !== "stage") continue;
    if ((ligne.source ?? "user") !== "user") continue;
    // Les lignes de création ne portent pas de mouvement : `created_at` dit
    // déjà qu'une opportunité est apparue, et son étape se déduit plus bas.
    if (ligne.operation === "insert") continue;
    const quand = instant(ligne.changed_at);
    if (!quand || quand < debut) continue;

    const cle = String(ligne.deal_id);
    const liste = parDeal.get(cle);
    if (liste) liste.push(ligne);
    else parDeal.set(cle, [ligne]);
  }
  for (const liste of parDeal.values()) {
    liste.sort(
      (a, b) =>
        (instant(a.changed_at)?.getTime() ?? 0) -
        (instant(b.changed_at)?.getTime() ?? 0),
    );
  }

  const entrees = new Map<string, number>();
  const stockDebut = new Map<string, number>();
  const stockActuel = new Map<string, number>();
  const incremente = (carte: Map<string, number>, etape: string | null) => {
    if (!etape || !etapesConnues.has(etape)) return;
    carte.set(etape, (carte.get(etape) ?? 0) + 1);
  };

  const kpis: KpisSemaine = {
    nouveauxLeads: 0,
    ayantBouge: 0,
    won: { count: 0, amount: 0 },
    lost: { count: 0, amount: 0 },
  };

  for (const deal of deals) {
    const sesChangements = parDeal.get(String(deal.id)) ?? [];
    const etapeActuelle = deal.stage ?? null;

    /*
     * L'étape de lundi matin : l'ancienne valeur du PREMIER changement de la
     * semaine. Sans changement, l'opportunité n'a pas bougé — elle était déjà
     * dans son étape actuelle. C'est ce raisonnement qui rend inutile un
     * journal remontant à l'origine.
     */
    const etapeAuDebut =
      sesChangements.length > 0
        ? etapeDe(sesChangements[0].old_value, alias)
        : etapeActuelle;

    const entree = dateDEntree(deal);
    const creeeCetteSemaine = entree != null && entree >= debut;

    incremente(stockActuel, etapeActuelle);
    // Une opportunité créée cette semaine n'existait pas lundi : elle ne compte
    // pas dans le stock de départ, sans quoi sa création se lirait comme une
    // absence de mouvement.
    if (!creeeCetteSemaine) incremente(stockDebut, etapeAuDebut);
    else {
      // Elle est bien ENTRÉE quelque part : dans l'étape où elle est née.
      incremente(entrees, etapeAuDebut);
      kpis.nouveauxLeads += 1;
    }

    if (sesChangements.length > 0) kpis.ayantBouge += 1;

    let gagnee = false;
    let perdue = false;
    for (const ligne of sesChangements) {
      const destination = etapeDe(ligne.new_value, alias);
      incremente(entrees, destination);
      if (destination === ETAPE_GAGNEE) gagnee = true;
      if (destination === ETAPE_PERDUE) perdue = true;
    }

    // Dédoublonné : une affaire passée en Won puis rouverte puis re-gagnée
    // dans la même semaine reste une seule victoire.
    const montant = typeof deal.amount === "number" ? deal.amount : 0;
    if (gagnee) {
      kpis.won.count += 1;
      kpis.won.amount += montant;
    }
    if (perdue) {
      kpis.lost.count += 1;
      kpis.lost.amount += montant;
    }
  }

  const parEtape: Record<string, MouvementEtape> = {};
  for (const stage of stages) {
    parEtape[stage.value] = {
      entrees: entrees.get(stage.value) ?? 0,
      variation:
        (stockActuel.get(stage.value) ?? 0) - (stockDebut.get(stage.value) ?? 0),
    };
  }

  return { debut, parEtape, kpis };
}

/** « + 5 », « - 3 », « = 0 » — le signe doit se lire sans effort. */
export function formatVariation(valeur: number): string {
  if (valeur > 0) return `+ ${valeur}`;
  if (valeur < 0) return `- ${Math.abs(valeur)}`;
  return "= 0";
}
