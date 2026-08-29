import type { DealStage } from "../../types";
import type { DealRecord } from "./dealFields";
import { isOpenStage } from "./dealFields";
import type { WeightingConfig } from "./dealWeighting";
import { getWeightedAmount } from "./dealWeighting";

/**
 * ARR and deal count per pipeline stage.
 *
 * Shared on purpose. The dashboard's "Pipeline par étape" funnel (NOS-955) and
 * the kanban column headers (NOS-956) are the same aggregate — "ARR total +
 * nombre d'opportunités, par étape" — asked for twice in two specs. Computing
 * it twice is how this repository ended up with three divergent ARR engines
 * (`KPICards` inline, `DealsChart` inline, `dealRevenue`); this module exists so
 * the funnel and the column headers can never disagree.
 *
 * Frozen after the socle: consumers compose, nobody edits.
 */

export interface DealStageBucket {
  stage: string;
  label: string;
  count: number;
  /** Summed ARR, in euros. Deals with no amount count towards `count` only. */
  amount: number;
  /** True when at least one deal in the bucket has no amount recorded. */
  hasUnvaluedDeals: boolean;
  /**
   * ARR pondéré de l'étape (NOS-1178, demandé par Simon).
   *
   * Le bandeau affichait « Pipeline brut » ET « Pipeline pondéré », puis trois
   * étapes en brut seulement : on ne pouvait pas rapprocher les cartes entre
   * elles. Chaque étape porte donc les deux.
   *
   * Somme deal par deal, et non `amount × probabilité de l'étape` : une
   * opportunité peut porter sa propre probabilité, qui prime sur celle de son
   * étape. Multiplier le total effacerait ces arbitrages.
   *
   * Zéro quand aucune pondération n'est demandée — voir `weightedAvailable`,
   * qui distingue « pas de pondération » de « pondération nulle ».
   */
  weightedAmount: number;
  /** Au moins une affaire du lot a pu être pondérée. */
  weightedAvailable: boolean;
}

export interface StageBreakdownOptions {
  /**
   * Drop terminal stages (won / lost / churn). The funnel asks for open
   * opportunities only; the kanban shows every column, Close Won and Lost
   * included.
   */
  openOnly?: boolean;
  /**
   * Keep stages with no deal. An empty column is information — "rien n'est
   * passé en Proposition" is a commercial signal, not an absence of data.
   *
   * Every consumer now keeps them. The funnel used to drop them, until
   * NOS-1084: in production `proposal`, `negociation` and `a-reclasser` hold no
   * deal at all, so it listed three stages out of six while the KPI banner
   * above it announced "ARR en Proposition : 0 €". Two widgets, one aggregate,
   * two answers — the exact disagreement this module exists to prevent.
   */
  includeEmpty?: boolean;
  /**
   * Pondération à appliquer.
   *
   * Absente, `weightedAmount` reste à zéro et `weightedAvailable` à faux : le
   * lecteur doit pouvoir distinguer « pas de pondération demandée » de
   * « pondération nulle ».
   */
  weighting?: WeightingConfig;
}

/**
 * Bucket deals by stage, in the order the stages are configured.
 *
 * A deal whose stage is not in `stages` is **skipped, not reassigned**. That is
 * the deliberate difference with `getDealsByStage`, which folds unknown stages
 * into the first column so the board never loses a card: acceptable for a
 * kanban, wrong for an aggregate, where it would silently inflate "Lead" —
 * or "À reclasser", which now sits first.
 *
 * `amount` is null for deals with no ARR. Those still count in `count`, and
 * `hasUnvaluedDeals` lets the caller say "12 opportunités · 40 k€ (3 sans
 * montant)" instead of implying the total is complete.
 */
export function computeStageBreakdown(
  deals: DealRecord[],
  stages: DealStage[],
  pipelineStatuses: string[],
  options: StageBreakdownOptions = {},
): DealStageBucket[] {
  const { openOnly = false, includeEmpty = true, weighting } = options;

  const buckets = new Map<string, DealStageBucket>();
  for (const stage of stages) {
    if (openOnly && !isOpenStage(stage.value, pipelineStatuses)) continue;
    buckets.set(stage.value, {
      stage: stage.value,
      label: stage.label || stage.value,
      count: 0,
      amount: 0,
      hasUnvaluedDeals: false,
      weightedAmount: 0,
      weightedAvailable: false,
    });
  }

  for (const deal of deals) {
    const bucket = deal.stage ? buckets.get(deal.stage) : undefined;
    if (!bucket) continue;
    bucket.count += 1;
    if (typeof deal.amount === "number" && Number.isFinite(deal.amount)) {
      bucket.amount += deal.amount;
    } else {
      bucket.hasUnvaluedDeals = true;
    }

    if (weighting) {
      // `null` — et non zéro — quand la probabilité est inconnue : une affaire
      // qu'on ne sait pas pondérer ne vaut pas zéro, elle sort du total.
      const weighted = getWeightedAmount(deal, weighting);
      if (weighted !== null) {
        bucket.weightedAmount += weighted;
        bucket.weightedAvailable = true;
      }
    }
  }

  const ordered = [...buckets.values()];
  return includeEmpty ? ordered : ordered.filter((b) => b.count > 0);
}

export interface DealStageTotals {
  count: number;
  amount: number;
  hasUnvaluedDeals: boolean;
}

/** Totals across a breakdown, for the "137 opportunités • 1,2 M€" strap line. */
export function totalStageBreakdown(
  buckets: DealStageBucket[],
): DealStageTotals {
  return buckets.reduce<DealStageTotals>(
    (total, bucket) => ({
      count: total.count + bucket.count,
      amount: total.amount + bucket.amount,
      hasUnvaluedDeals: total.hasUnvaluedDeals || bucket.hasUnvaluedDeals,
    }),
    { count: 0, amount: 0, hasUnvaluedDeals: false },
  );
}
