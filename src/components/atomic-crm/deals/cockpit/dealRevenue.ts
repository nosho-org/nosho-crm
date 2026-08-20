import type { DealRecord } from "./dealFields";
import {
  getDealActivity,
  isLostStage,
  isOpenStage,
  isWonStage,
} from "./dealFields";
import type { PeriodBucket } from "./dealPeriods";
import { parseISODateLocal } from "./dealDates";
import type { WeightingConfig, WeightedTotal } from "./dealWeighting";
import { sumWeighted } from "./dealWeighting";

/**
 * ---------------------------------------------------------------------------
 * Revenue aggregation
 * ---------------------------------------------------------------------------
 * Every figure below is a sum over deals actually present in the database.
 * A figure that cannot be derived from the current schema is not approximated:
 * it is returned as `{ available: false }` with the reason, and the banner
 * renders that reason.
 *
 * These are pure functions over an already-filtered deal array, so the banner,
 * the forecast and the list are guaranteed to describe the same set of deals.
 */

export interface AvailableMetric {
  available: true;
  amount: number;
  count: number;
}

export interface UnavailableMetric {
  available: false;
  /** Shown in place of the value. Must state what is missing, not "N/A". */
  reason: string;
}

export type Metric = AvailableMetric | UnavailableMetric;

export interface WeightedMetric extends WeightedTotal {
  available: true;
}

export type MaybeWeightedMetric = WeightedMetric | UnavailableMetric;

export interface RevenueSnapshotOptions {
  weighting: WeightingConfig;
  /** Days without activity before an open deal counts as at risk. */
  inactivityThresholdDays: number;
  today: Date;
}

export interface RevenueSnapshot {
  /** Won deals whose expected closing date falls in the selected period. */
  signed: AvailableMetric;
  /** Open pipeline in the period. */
  potential: AvailableMetric;
  /** Open pipeline × probability, or unavailable when nothing is weighted. */
  weighted: MaybeWeightedMetric;
  /** Lost deals in the period. */
  lost: AvailableMetric;
  /** Open deals that are dormant or past their expected closing date. */
  atRisk: AvailableMetric;
  /** Recurring revenue in force — not derivable from this schema. */
  recurring: UnavailableMetric;
}

const sum = (deals: DealRecord[]): AvailableMetric => ({
  available: true,
  amount: deals.reduce((total, deal) => total + (deal.amount ?? 0), 0),
  count: deals.length,
});

/**
 * The CRM stores opportunities, not contracts: there is no subscription table,
 * no billing period and no start/end of service. Current recurring revenue and
 * churn therefore cannot be computed, and claiming a number here would mean
 * passing cumulative bookings off as live ARR.
 */
const RECURRING_UNAVAILABLE: UnavailableMetric = {
  available: false,
  reason:
    "Aucune donnée de contrat récurrent dans le CRM (ni abonnement, ni période de facturation).",
};

export const isDealAtRisk = (
  deal: DealRecord,
  { weighting, inactivityThresholdDays, today }: RevenueSnapshotOptions,
): boolean => {
  if (!isOpenStage(deal.stage, weighting.pipelineStatuses)) return false;
  const { isStale } = getDealActivity(deal, {
    pipelineStatuses: weighting.pipelineStatuses,
    thresholdDays: inactivityThresholdDays,
    today,
  });
  if (isStale) return true;
  const closing = parseISODateLocal(deal.expected_closing_date);
  return closing !== null && closing < today;
};

export const computeRevenueSnapshot = (
  deals: DealRecord[],
  options: RevenueSnapshotOptions,
): RevenueSnapshot => {
  const { weighting } = options;
  const open = deals.filter((deal) =>
    isOpenStage(deal.stage, weighting.pipelineStatuses),
  );
  const won = deals.filter((deal) => isWonStage(deal.stage));
  const lost = deals.filter((deal) =>
    isLostStage(deal.stage, weighting.pipelineStatuses),
  );

  // Only open deals are weighted, so `weightedCount` is exactly "how many deals
  // still in play carry a probability". Zero means the forecast has no basis at
  // all — reported as such, never as a weighted total of 0.
  const weightedTotal = sumWeighted(open, weighting);
  const weighted: MaybeWeightedMetric =
    weightedTotal.weightedCount > 0
      ? { available: true, ...weightedTotal }
      : {
          available: false,
          reason:
            "Aucune probabilité de gain définie — à renseigner dans Paramètres › Opportunités.",
        };

  return {
    signed: sum(won),
    potential: sum(open),
    weighted,
    lost: sum(lost),
    atRisk: sum(open.filter((deal) => isDealAtRisk(deal, options))),
    recurring: RECURRING_UNAVAILABLE,
  };
};

/* -------------------------------------------------------------------------- */
/* Forecast                                                                    */
/* -------------------------------------------------------------------------- */

export interface ForecastCell {
  potential: number;
  count: number;
  /** Null when no deal in the bucket carries a probability. */
  weighted: number | null;
  unweightedCount: number;
  /** Amount-weighted average probability, in [0, 1]. Null when unweighted. */
  averageProbability: number | null;
}

export interface ForecastColumn extends ForecastCell {
  key: string;
  label: string;
}

export interface Forecast {
  columns: ForecastColumn[];
  total: ForecastCell;
  /**
   * Open deals in the current selection that no column covers: either they
   * carry no expected closing date, or they fall outside the displayed range.
   * Surfaced by the table so the columns never look like the whole story.
   */
  undated: AvailableMetric;
  outOfRange: AvailableMetric;
}

const toCell = (
  deals: DealRecord[],
  weighting: WeightingConfig,
): ForecastCell => {
  const weightedTotal = sumWeighted(deals, weighting);
  const potential = deals.reduce(
    (total, deal) => total + (deal.amount ?? 0),
    0,
  );
  return {
    potential,
    count: deals.length,
    weighted: weightedTotal.weightedCount > 0 ? weightedTotal.amount : null,
    unweightedCount: weightedTotal.unweightedCount,
    averageProbability: weightedTotal.averageProbability,
  };
};

/**
 * Monthly or quarterly projection of the *open* pipeline, bucketed strictly by
 * `expected_closing_date`. Won and lost deals are excluded: they are outcomes,
 * not forecasts, and they already have their own cards in the banner.
 */
export const computeForecast = (
  deals: DealRecord[],
  buckets: PeriodBucket[],
  { weighting }: Pick<RevenueSnapshotOptions, "weighting">,
): Forecast => {
  const open = deals.filter((deal) =>
    isOpenStage(deal.stage, weighting.pipelineStatuses),
  );

  const undated: DealRecord[] = [];
  const covered = new Set<DealRecord>();
  const columns: ForecastColumn[] = buckets.map((bucket) => {
    const inBucket = open.filter((deal) => {
      const closing = parseISODateLocal(deal.expected_closing_date);
      if (!closing) return false;
      return closing >= bucket.start && closing <= bucket.end;
    });
    inBucket.forEach((deal) => covered.add(deal));
    return {
      key: bucket.key,
      label: bucket.label,
      ...toCell(inBucket, weighting),
    };
  });

  const outOfRange: DealRecord[] = [];
  for (const deal of open) {
    if (covered.has(deal)) continue;
    if (parseISODateLocal(deal.expected_closing_date)) outOfRange.push(deal);
    else undated.push(deal);
  }

  return {
    columns,
    total: toCell(
      open.filter((deal) => covered.has(deal)),
      weighting,
    ),
    undated: sum(undated),
    outOfRange: sum(outOfRange),
  };
};
