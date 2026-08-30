// Reads the local calendar fields. `toISOString().slice(0, 10)` would read UTC
// and shift the day for anyone east of Greenwich — a dormancy threshold
// computed at midnight in Paris landed a full day early. `expected_closing_date`
// and `next_action_date` are `date` columns with no timezone of their own, so
// local is the only correct reading.
import { toISODateString as isoDay } from "./cockpit/dealDates";

/**
 * The filter vocabulary shared by the dashboard and the Opportunités list.
 *
 * NOS-955 requires that every "Voir" button and every forecast bar navigate to
 * the Opportunités tab **with the matching filter already applied**. That makes
 * the dashboard a caller of the list's filter syntax, and without a contract
 * the two would drift: `ra-data-postgrest` encodes operators by suffixing the
 * field (`field@operator`), so a typo produces no error — just a filter that
 * quietly matches everything.
 *
 * This module is the single place that knows how a filter is spelled. The
 * dashboard builds `DealFilterState` and links through `toDealsLink`; the list
 * turns the same state into `<List filter>` values through `toListFilter`.
 * Neither reads the other's code.
 *
 * Frozen after the socle: consumers compose, nobody edits. Rouvert une fois,
 * pour NOS-1053 — les deux filtres de prochaine action visaient des colonnes
 * que personne n'écrit, et contredisaient donc l'écran qu'ils prétendaient
 * filtrer. Le gel protège la *syntaxe* d'une dérive entre appelants, pas une
 * cible fausse.
 */

/** Valeur simple ou multiple pour un filtre d'égalité (NOS-1051). */
export type FilterSelection = string | number | (string | number)[] | null;

/** Selection shared by both screens. Every field is optional. */
export interface DealFilterState {
  /** ISO dates bounding `expected_closing_date`. */
  periodStart?: string | null;
  periodEnd?: string | null;
  /** Scalaire → `@eq`, tableau → `@in` (NOS-1051). Idem pour les trois suivants. */
  salesId?: FilterSelection;
  category?: FilterSelection;
  /** Multi-select. Matches deals carrying *any* of these products. */
  products?: string[] | null;
  /** Stored slugs: `urgent` (P0) / `important` (P1) / `normal` (P2). */
  priority?: FilterSelection;
  stage?: FilterSelection;
  /** Deals with no activity for at least this many days. */
  staleForDays?: number | null;
  /** Next action past due — read from the deal's open tasks (NOS-1053). */
  overdueAction?: boolean | null;
  /** `expected_closing_date` missing. */
  missingClosingDate?: boolean | null;
  /** No next action at all: no open task, and no imported typed value. */
  missingNextAction?: boolean | null;

  /**
   * Les opportunités visées, une par une (NOS-1193).
   *
   * Le seul filtre qui ne peut pas diverger de ce qui l a produit. Les autres
   * REDECRIVENT un critère : « sans prochaine action » se traduit ici en deux
   * colonnes nulles, alors que la cloche compte les actions ABSENTES et le
   * tableau de bord les actions absentes OU non datées. Trois definitions,
   * trois ensembles, et un lien qui ment sur son propre chiffre.
   *
   * Un producteur qui connait deja ses lignes les nomme donc, plutot que de
   * tenter de reformuler son critere dans le vocabulaire de la liste.
   */
  ids?: (string | number)[] | null;
}

/**
 * Écrit `field` (égalité) ou `field@in` (appartenance) selon la forme reçue.
 *
 * Un tableau vide n'écrit rien : `in.()` est rejeté par PostgREST avec un 400,
 * et « aucune valeur cochée » veut dire « pas de filtre », pas « rien ne
 * correspond ». Même piège que `products@ov` sur un tableau vide.
 */
function assignIn(
  filter: Record<string, unknown>,
  field: string,
  value: FilterSelection | undefined,
): void {
  if (value == null || value === "") return;
  if (!Array.isArray(value)) {
    filter[field] = value;
    return;
  }
  const values = value.filter((entry) => entry != null && entry !== "");
  if (values.length === 0) return;
  filter[`${field}@in`] = `(${values.join(",")})`;
}

/**
 * Translate a selection into `ra-data-postgrest` filter values.
 *
 * The result is meant to be **merged into** the list's existing filter, not to
 * replace it: `DealList` already pins `archived_at@is: null` and the
 * non-commercial exclusion from `getCommercialDealsFilter`, and dropping those
 * would surface archived deals and the investisseur/partenaire pipelines in the
 * commercial board.
 */
export function toListFilter(
  state: DealFilterState,
  options: { today?: Date } = {},
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  // Nommer les lignes rend tout autre critere superflu : on sait deja
  // lesquelles on veut.
  assignIn(filter, "id", state.ids ?? undefined);

  if (state.periodStart) {
    filter["expected_closing_date@gte"] = state.periodStart;
  }
  if (state.periodEnd) {
    filter["expected_closing_date@lte"] = state.periodEnd;
  }
  // Scalaire ou tableau, au choix de l'appelant (NOS-1051). Le dashboard
  // continue d'envoyer une valeur unique — « voir les Qualifié » — et produit
  // toujours un `@eq` ; la barre de filtres envoie un tableau et produit un
  // `@in`. Les deux orthographes coexistent volontairement plutôt que de
  // forcer `@in` partout : un `@eq` reste plus lisible dans une URL partagée,
  // et `@in` est déjà supporté de bout en bout (cf. `activity.ts`, l'adaptateur
  // FakeRest et ses tests).
  assignIn(filter, "sales_id", state.salesId);
  assignIn(filter, "category", state.category);
  assignIn(filter, "priority", state.priority);
  assignIn(filter, "stage", state.stage);

  // `ov` (overlaps) is the OR the spec asks for: "Produit = No-show + Entrant"
  // means either, not both. `cs` (contains) would demand both and quietly
  // return far fewer rows.
  if (state.products?.length) {
    filter["products@ov"] = `{${state.products.join(",")}}`;
  }

  const today = options.today ?? new Date();

  if (state.staleForDays != null) {
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() - state.staleForDays);
    // `last_activity_at` is computed by `deals_summary` — the real last
    // activity, not the `updated_at` proxy, which no trigger maintained before
    // 20260823110000 and which still reads as the creation date on old rows.
    filter["last_activity_at@lt"] = isoDay(threshold);
  }

  // ---------------------------------------------------------------------
  // Prochaine action : lire les tâches, pas les colonnes typées (NOS-1053)
  // ---------------------------------------------------------------------
  //
  // Ces deux filtres visaient `next_action` / `next_action_date`. Personne
  // n'écrit ces colonnes — 0 des 44 opportunités commerciales ouvertes en
  // portait une — alors que la fiche et la liste, elles, affichent l'action en
  // retombant sur les tâches (`getDealNextAction`). Les filtres contredisaient
  // donc l'écran : « sans prochaine action » les retournait toutes, « action en
  // retard » aucune.
  //
  // `deals_summary` calcule déjà `next_task_date` / `next_task_text` pour cette
  // raison exacte : « ce que l'équipe devrait remplir » contre « ce qu'elle
  // enregistre réellement » (20260824150000). C'est là qu'il faut lire.

  if (state.overdueAction) {
    filter["next_task_date@lt"] = isoDay(today);
    // Une tâche ouverte est par définition non faite : `next_task_date` ne
    // remonte que des tâches sans `done_date`.
    //
    // Angle mort assumé : une opportunité importée portant un `next_action_date`
    // typé dépassé, et aucune tâche, n'est pas retournée ici. PostgREST ne sait
    // pas filtrer sur un `coalesce`, et le cas est absent de la production. S'il
    // apparaît, la réponse est une colonne dérivée dans `deals_summary`, pas un
    // second filtre qui redivergerait.
  }

  if (state.missingClosingDate) {
    filter["expected_closing_date@is"] = null;
  }

  if (state.missingNextAction) {
    // « Aucune action **datée** », des deux côtés de la cascade. C'est la règle
    // que `dashboardHealth` applique déjà en mémoire (`missing` OU `undated`) :
    // une action sans échéance est aussi inexploitable qu'une action absente.
    // Les deux clés, pas une : sans la première, une valeur typée héritée d'un
    // import ferait remonter l'opportunité alors qu'elle porte bien une action.
    filter["next_action_date@is"] = null;
    filter["next_task_date@is"] = null;

    // La restriction d'étape ne se décide PAS ici : ce contrat ne connaît pas
    // `dealNextActionFromStage`. C'est `HEALTH_FILTERS` qui la reçoit de
    // `dashboardHealth`, lequel sait quelles étapes il a réellement comptées.
  }

  return filter;
}

/**
 * A `<Link to>` target opening the Opportunités list with `state` applied.
 *
 * Mirrors the encoding `src/components/admin/count.tsx` uses, which is what
 * ra-core's `useListParams` parses back out of the URL.
 */
export function toDealsLink(
  state: DealFilterState,
  options: { pathname?: string; today?: Date } = {},
): { pathname: string; search: string } {
  const filter = toListFilter(state, { today: options.today });
  return {
    pathname: options.pathname ?? "/deals",
    search: `filter=${encodeURIComponent(JSON.stringify(filter))}`,
  };
}

/**
 * Les clés posées par une alerte, distinguées pour pouvoir le *dire* à l'écran.
 *
 * Les trois dernières ne sont plus écrites depuis NOS-1053 — elles visaient les
 * colonnes `next_action*` que personne ne remplit. Elles restent listées parce
 * que `ra-core` persiste les filtres dans le navigateur : un utilisateur qui a
 * cliqué « actions en retard » avant ce correctif porte encore
 * `next_action@not.is` dans son store, sur une liste vide, sans aucun moyen de
 * s'en défaire. Les oublier ici, ce serait corriger le bug pour les nouveaux
 * venus et le laisser intact pour ceux qui l'ont signalé.
 */
export const HEALTH_FILTER_KEYS = [
  "last_activity_at@lt",
  "next_task_date@lt",
  "expected_closing_date@is",
  "next_action_date@is",
  "next_task_date@is",
  // Héritées, plus jamais écrites — voir ci-dessus.
  "next_action@not.is",
  "next_action@is",
  "next_action_date@lt",
] as const;

/**
 * Toutes les clés que `toListFilter` peut écrire (NOS-1058).
 *
 * Le contrat savait *écrire* des filtres, il ne savait pas dire *lesquels*. La
 * barre de filtres avait donc sa propre liste, qui ne couvrait que les six axes
 * qu'elle affiche — pas les quatre alertes du dashboard. Conséquence : cliquer
 * « actions en retard » posait un filtre que la barre ne montrait pas, que
 * « Réinitialiser » n'effaçait pas, et que `ra-core` persiste dans le
 * navigateur. L'utilisateur revenait sur une liste vide en étant convaincu
 * qu'aucun filtre n'était appliqué — et il avait raison de le croire, rien à
 * l'écran ne disait le contraire.
 *
 * Une seule liste, exportée par le module qui écrit ces clés : c'est la même
 * raison d'être que le contrat lui-même.
 */
export const LIST_FILTER_KEYS = [
  "expected_closing_date@gte",
  "expected_closing_date@lte",
  "sales_id",
  "sales_id@in",
  "category",
  "category@in",
  "priority",
  "priority@in",
  "stage",
  "stage@in",
  "products@ov",
  ...HEALTH_FILTER_KEYS,
] as const;

/**
 * The four pipeline-health alerts of NOS-955, as filter selections.
 *
 * Named here so the dashboard's alert cards and their "Voir" buttons cannot
 * disagree about what each alert counts: the same entry produces the number
 * shown and the list that opens.
 *
 * `dormant` is a function because its threshold is configurable
 * (`dealInactivityAlertDays`, 14 by default).
 */
/**
 * Chaque alerte porte AUSSI les etapes qu'elle a comptees (NOS-1184).
 *
 * Sans elles, « 4 opportunites sans prochaine action » ouvrait une liste de
 * 15 : le compteur ne regarde que les affaires ouvertes, et seulement a partir
 * de `dealNextActionFromStage`, tandis que le lien ne restreignait rien du
 * tout -- ni les leads, ni les affaires closes.
 *
 * Le contrat ne connait pas la configuration, et n'a pas a la connaitre :
 * c'est `dashboardHealth` qui passe les etapes REELLEMENT retenues, relevees
 * sur les opportunites qu'il vient de compter. Le lien ne peut donc pas
 * diverger du chiffre affiche a cote -- il est construit a partir de lui.
 */
export const HEALTH_FILTERS = {
  dormant: (days: number, stages?: string[]): DealFilterState => ({
    staleForDays: days,
    ...(stages?.length ? { stage: stages } : {}),
  }),
  overdueAction: (stages?: string[]): DealFilterState => ({
    overdueAction: true,
    ...(stages?.length ? { stage: stages } : {}),
  }),
  missingClosingDate: (stages?: string[]): DealFilterState => ({
    missingClosingDate: true,
    ...(stages?.length ? { stage: stages } : {}),
  }),
  missingNextAction: (stages?: string[]): DealFilterState => ({
    missingNextAction: true,
    ...(stages?.length ? { stage: stages } : {}),
  }),
} as const;

export type DealHealthAlert = keyof typeof HEALTH_FILTERS;
