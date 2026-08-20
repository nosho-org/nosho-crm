import { parseISODateLocal } from "./dealDates";
import type {
  ActivityOptions,
  DealRecord,
  NextActionOptions,
} from "./dealFields";
import {
  getDealActivity,
  getDealNextAction,
  getDealPriorityRank,
} from "./dealFields";
import type { WeightingConfig } from "./dealWeighting";
import { getWeightedAmount } from "./dealWeighting";

export type DealSortField =
  | "name"
  | "stage"
  | "priority"
  | "amount"
  | "weighted"
  | "expected_closing_date"
  | "next_action_date"
  | "activity";

export type SortDirection = "asc" | "desc";

export interface DealSortContext {
  weighting: WeightingConfig;
  nextActionOptions: NextActionOptions;
  activityOptions: ActivityOptions;
  stageOrder: string[];
}

/**
 * Comparable key per column. `null` means "no value": those deals always sort
 * last, in both directions — an empty cell is not "the smallest value", and
 * flipping the direction should not promote unfilled rows to the top.
 */
const sortKey = (
  deal: DealRecord,
  field: DealSortField,
  context: DealSortContext,
): number | string | null => {
  switch (field) {
    case "name":
      return deal.name?.toLowerCase() ?? null;
    case "stage": {
      const index = context.stageOrder.indexOf(deal.stage);
      return index === -1 ? null : index;
    }
    case "priority":
      // Rank is already "urgent first"; deals with no priority get the last
      // rank here and are then pushed further down by the null-last rule.
      return getDealPriorityRank(deal);
    case "amount":
      return deal.amount ?? null;
    case "weighted":
      return getWeightedAmount(deal, context.weighting);
    case "expected_closing_date":
      return parseISODateLocal(deal.expected_closing_date)?.getTime() ?? null;
    case "next_action_date":
      return (
        parseISODateLocal(
          getDealNextAction(deal, context.nextActionOptions).date,
        )?.getTime() ?? null
      );
    case "activity":
      return getDealActivity(deal, context.activityOptions).daysSinceActivity;
    default:
      return null;
  }
};

export const sortDeals = (
  deals: DealRecord[],
  field: DealSortField,
  direction: SortDirection,
  context: DealSortContext,
): DealRecord[] => {
  const factor = direction === "asc" ? 1 : -1;
  return [...deals].sort((a, b) => {
    const left = sortKey(a, field, context);
    const right = sortKey(b, field, context);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "string" && typeof right === "string") {
      return left.localeCompare(right, "fr") * factor;
    }
    return ((left as number) - (right as number)) * factor;
  });
};

/**
 * Default direction per column: the first click should show what the user is
 * looking for. Urgent deals, the largest amounts and the oldest activity all
 * belong at the top.
 */
export const DEFAULT_SORT_DIRECTION: Record<DealSortField, SortDirection> = {
  name: "asc",
  stage: "asc",
  priority: "asc",
  amount: "desc",
  weighted: "desc",
  expected_closing_date: "asc",
  next_action_date: "asc",
  activity: "desc",
};
