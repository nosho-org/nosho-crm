import type { DealRecord } from "./dealFields";
import { isLostStage, isWonStage } from "./dealFields";

/**
 * ---------------------------------------------------------------------------
 * Weighting model
 * ---------------------------------------------------------------------------
 * A weighted amount is `amount × probability`. Probability is a *forecast*
 * input; commercial priority (issue #93) is a *triage* input. They are never
 * the same thing: an urgent deal is not a likely deal, and a normal deal is not
 * an unlikely one.
 *
 * This module therefore never reads `priority`, and `dealWeighting.test.ts`
 * asserts that two deals differing only by priority weigh exactly the same.
 *
 * Probability is resolved from, in order:
 *   1. `deal.probability` — l'exception saisie sur l'opportunité. La colonne
 *      existe depuis 20260823090000, et NOS-817 lui a donné son champ dans le
 *      formulaire : cette branche n'est plus théorique. `source: "deal"` est ce
 *      qui permet au cockpit de dire d'où vient le pourcentage affiché ;
 *   2. the won/lost stage, which is a fact, not an estimate (100% / 0%);
 *   3. the `dealStageProbabilities` setting, an explicit business input;
 *   4. nothing — in which case the deal is reported as *unweighted* rather
 *      than silently weighted at 0% or 100%.
 */

export type ProbabilitySource =
  | "deal"
  | "won-stage"
  | "lost-stage"
  | "stage-config"
  | "none";

export interface DealProbability {
  /** Ratio in [0, 1], or null when no source could provide one. */
  value: number | null;
  source: ProbabilitySource;
}

export interface WeightingConfig {
  /** Per-stage win probability, in percent (0–100). Configured in Settings. */
  stageProbabilities: Record<string, number>;
  pipelineStatuses: string[];
}

/** Percent (0–100) to ratio (0–1), rejecting anything not a finite number. */
const toRatio = (percent: unknown): number | null => {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  return Math.min(Math.max(percent, 0), 100) / 100;
};

export const getDealProbability = (
  deal: DealRecord,
  { stageProbabilities, pipelineStatuses }: WeightingConfig,
): DealProbability => {
  const fromDeal = toRatio(deal.probability);
  if (fromDeal !== null) return { value: fromDeal, source: "deal" };

  // A closed deal's outcome is known — no estimate involved.
  if (isWonStage(deal.stage)) return { value: 1, source: "won-stage" };
  if (isLostStage(deal.stage, pipelineStatuses)) {
    return { value: 0, source: "lost-stage" };
  }

  const fromStage = toRatio(stageProbabilities?.[deal.stage]);
  if (fromStage !== null) return { value: fromStage, source: "stage-config" };

  return { value: null, source: "none" };
};

/** Null — not 0 — when the deal cannot be weighted, so totals stay honest. */
export const getWeightedAmount = (
  deal: DealRecord,
  config: WeightingConfig,
): number | null => {
  const { value } = getDealProbability(deal, config);
  if (value === null) return null;
  return (deal.amount ?? 0) * value;
};

export interface WeightedTotal {
  /** Sum over the deals that could be weighted. */
  amount: number;
  /** Deals that contributed to `amount`. */
  weightedCount: number;
  /** Deals left out for lack of a probability. */
  unweightedCount: number;
  /** Amount left out, so the UI can say how much is unaccounted for. */
  unweightedAmount: number;
  /**
   * Average applied probability over the weighted deals, amount-weighted.
   * Null when nothing could be weighted.
   */
  averageProbability: number | null;
}

export const sumWeighted = (
  deals: DealRecord[],
  config: WeightingConfig,
): WeightedTotal => {
  let amount = 0;
  let weightedBase = 0;
  let weightedCount = 0;
  let unweightedCount = 0;
  let unweightedAmount = 0;

  for (const deal of deals) {
    const weighted = getWeightedAmount(deal, config);
    if (weighted === null) {
      unweightedCount += 1;
      unweightedAmount += deal.amount ?? 0;
      continue;
    }
    amount += weighted;
    weightedBase += deal.amount ?? 0;
    weightedCount += 1;
  }

  return {
    amount,
    weightedCount,
    unweightedCount,
    unweightedAmount,
    averageProbability: weightedBase > 0 ? amount / weightedBase : null,
  };
};

/**
 * Normalizes the probabilities coming out of the settings form: entries left
 * blank are dropped rather than stored as 0, since "not configured" and "no
 * chance of winning" are different statements and the cockpit renders them
 * differently.
 */
export const sanitizeStageProbabilities = (
  input: Record<string, unknown> | undefined | null,
): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const [stage, raw] of Object.entries(input ?? {})) {
    if (raw === "" || raw == null) continue;
    const percent = Number(raw);
    if (!Number.isFinite(percent)) continue;
    result[stage] = Math.min(Math.max(Math.round(percent), 0), 100);
  }
  return result;
};
