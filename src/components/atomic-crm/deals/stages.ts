import type { ConfigurationContextValue } from "../root/ConfigurationContext";
import type { Deal } from "../types";

export type DealsByStage = Record<Deal["stage"], Deal[]>;

export interface DealsByStageResult {
  byStage: DealsByStage;
  /**
   * Deals whose stage matches no configured column.
   *
   * They used to be folded into the first column so the board never lost a
   * card. That was survivable while the first column was "Lead"; it stopped
   * being so once "À reclasser" took that slot, since a deal would then be
   * *displayed* as needing reclassification without being so in the database —
   * and a bulk edit from that column would have written the lie back.
   *
   * In practice this should stay empty: the commercial board already excludes
   * the investisseur and partenaire views, and every retired slug was migrated.
   * A non-empty list means the configuration and the data disagree, which the
   * board surfaces rather than hides.
   */
  unclassified: Deal[];
}

export const getDealsByStage = (
  unorderedDeals: Deal[],
  dealStages: ConfigurationContextValue["dealStages"],
): DealsByStageResult => {
  if (!dealStages?.length) return { byStage: {}, unclassified: [] };

  const byStage = dealStages.reduce(
    (obj, stage) => ({ ...obj, [stage.value]: [] }),
    {} as DealsByStage,
  );
  const unclassified: Deal[] = [];

  for (const deal of unorderedDeals) {
    const column = deal.stage ? byStage[deal.stage] : undefined;
    if (column) column.push(deal);
    else unclassified.push(deal);
  }

  // Order each column by index.
  for (const stage of dealStages) {
    byStage[stage.value].sort((a, b) => a.index - b.index);
  }

  return { byStage, unclassified };
};
