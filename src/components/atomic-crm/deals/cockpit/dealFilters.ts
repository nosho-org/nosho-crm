import type { DealRecord } from "./dealFields";
import { getDealPriority, getDealType } from "./dealFields";

/**
 * ---------------------------------------------------------------------------
 * Cockpit filters
 * ---------------------------------------------------------------------------
 * Filters split in two, by necessity rather than by taste:
 *
 *  - `sales_id` (responsable), `category` and the period bounds map to real
 *    columns, so they run server-side through the list query. The period is
 *    always expressed on `expected_closing_date` — see `dealPeriods.ts`.
 *
 *  - `priority` and `type` have no column yet (the Socle workspace owns the
 *    schema). Sending them to PostgREST would 400 the whole list, so they are
 *    applied here, on the rows the query returned.
 *
 * Both halves converge on a single array, which then feeds the banner, the
 * forecast, the board and the dense list. Nothing recomputes its own subset.
 *
 * Once the columns land, moving a facet server-side means deleting its branch
 * below and adding a `filter` entry — the components do not change.
 */

/** Facet value meaning "no constraint". */
export const FACET_ALL = "all";
/** Facet value matching deals where the field is absent. */
export const FACET_UNSET = "unset";

export interface DealFacets {
  priority: string;
  type: string;
}

export const EMPTY_FACETS: DealFacets = {
  priority: FACET_ALL,
  type: FACET_ALL,
};

const matches = (facet: string, value: string | null): boolean => {
  if (facet === FACET_ALL) return true;
  if (facet === FACET_UNSET) return value === null;
  return value === facet;
};

export const applyDealFacets = (
  deals: DealRecord[],
  facets: DealFacets,
): DealRecord[] => {
  if (facets.priority === FACET_ALL && facets.type === FACET_ALL) return deals;
  return deals.filter(
    (deal) =>
      matches(facets.priority, getDealPriority(deal)) &&
      matches(facets.type, getDealType(deal)),
  );
};

export const countActiveFacets = (facets: DealFacets): number =>
  Object.values(facets).filter((value) => value !== FACET_ALL).length;
