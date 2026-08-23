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
 * Frozen after the socle: consumers compose, nobody edits.
 */

/** Selection shared by both screens. Every field is optional. */
export interface DealFilterState {
  /** ISO dates bounding `expected_closing_date`. */
  periodStart?: string | null;
  periodEnd?: string | null;
  salesId?: number | string | null;
  category?: string | null;
  /** Multi-select. Matches deals carrying *any* of these products. */
  products?: string[] | null;
  /** Stored slugs: `urgent` (P0) / `important` (P1) / `normal` (P2). */
  priority?: string | null;
  stage?: string | null;
  /** Deals with no activity for at least this many days. */
  staleForDays?: number | null;
  /** Next action past due. */
  overdueAction?: boolean | null;
  /** `expected_closing_date` missing. */
  missingClosingDate?: boolean | null;
  /** No next action, or no date on it. */
  missingNextAction?: boolean | null;
}

/** Today, as an ISO date. Injectable so tests can pin it. */
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

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

  if (state.periodStart) {
    filter["expected_closing_date@gte"] = state.periodStart;
  }
  if (state.periodEnd) {
    filter["expected_closing_date@lte"] = state.periodEnd;
  }
  if (state.salesId != null && state.salesId !== "") {
    filter.sales_id = state.salesId;
  }
  if (state.category) {
    filter.category = state.category;
  }
  if (state.priority) {
    filter.priority = state.priority;
  }
  if (state.stage) {
    filter.stage = state.stage;
  }

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

  if (state.overdueAction) {
    filter["next_action_date@lt"] = isoDay(today);
    // A next action still on the deal is by definition not done: completing one
    // clears the three next_action fields and files it in the timeline.
    filter["next_action@not.is"] = null;
  }

  if (state.missingClosingDate) {
    filter["expected_closing_date@is"] = null;
  }

  if (state.missingNextAction) {
    filter["next_action@is"] = null;
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
 * The four pipeline-health alerts of NOS-955, as filter selections.
 *
 * Named here so the dashboard's alert cards and their "Voir" buttons cannot
 * disagree about what each alert counts: the same entry produces the number
 * shown and the list that opens.
 *
 * `dormant` is a function because its threshold is configurable
 * (`dealInactivityAlertDays`, 14 by default).
 */
export const HEALTH_FILTERS = {
  dormant: (days: number): DealFilterState => ({ staleForDays: days }),
  overdueAction: (): DealFilterState => ({ overdueAction: true }),
  missingClosingDate: (): DealFilterState => ({ missingClosingDate: true }),
  missingNextAction: (): DealFilterState => ({ missingNextAction: true }),
} as const;

export type DealHealthAlert = keyof typeof HEALTH_FILTERS;
