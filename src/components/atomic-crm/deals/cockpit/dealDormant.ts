import {
  getDealActivity,
  type ActivityOptions,
  type DealRecord,
} from "./dealFields";

export interface DormantDeal {
  deal: DealRecord;
  /** Null when no date on the deal could be read as an activity date. */
  daysSinceActivity: number | null;
}

/**
 * Open deals nobody has touched for at least the configured threshold, the
 * most neglected first.
 *
 * Extracted so the inactivity panel and the cockpit banner always describe the
 * same set — the "Cockpit dense" and "Surfaces calmes" skins surface the count
 * as a figure next to the other metrics, and a second implementation would
 * eventually disagree with the list printed right underneath it.
 */
export const getDormantDeals = (
  deals: DealRecord[],
  activityOptions: ActivityOptions,
): DormantDeal[] =>
  deals
    .map((deal) => ({ deal, activity: getDealActivity(deal, activityOptions) }))
    .filter(({ activity }) => activity.isStale)
    .map(({ deal, activity }) => ({
      deal,
      daysSinceActivity: activity.daysSinceActivity,
    }))
    .sort((a, b) => (b.daysSinceActivity ?? 0) - (a.daysSinceActivity ?? 0));

/** Total amount at stake in a dormant set; deals without an amount count as 0. */
export const sumDormantAmounts = (dormant: DormantDeal[]): number =>
  dormant.reduce((total, { deal }) => total + (deal.amount ?? 0), 0);
