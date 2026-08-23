import type { DealRecord } from "../deals/cockpit/dealFields";
import { isWonStage } from "../deals/cockpit/dealFields";
import { arrToMrr } from "../misc/formatCurrency";

/**
 * ---------------------------------------------------------------------------
 * The MRR figures of the KPI banner (NOS-955 §1)
 * ---------------------------------------------------------------------------
 * The four ARR figures come straight from `computeRevenueSnapshot` — signed,
 * potential, weighted, lost map one-to-one onto the spec. Only the MRR pair
 * needs its own module, and it needs a caveat.
 *
 * **This is bookings, not live MRR.** The CRM stores opportunities, not
 * contracts: no subscription, no billing period, no end of service. A client
 * who left last month still counts here. `dealRevenue.ts` refuses to compute a
 * recurring figure at all for that reason, and this module does not overrule
 * that judgement — it labels it. Every consumer must render `label`, which says
 * "MRR signé cumulé", never "MRR actuel".
 */

export interface MrrProgress {
  /** Cumulated monthly revenue of signed deals, in euros. */
  signedMrr: number;
  /** Number of signed deals behind that figure. */
  signedCount: number;
  /** Target, in euros per month. From `mrrTarget` in the configuration. */
  target: number;
  /** Ratio in [0, 1], capped for display. Null when no target is configured. */
  progress: number | null;
  /** target - signedMrr. Positive means there is still ground to cover. */
  gap: number | null;
  /** Wording that must be used, so no screen can claim this is live MRR. */
  label: string;
  /** Shown next to the value, spelling out the caveat. */
  caveat: string;
}

export const MRR_LABEL = "MRR signé cumulé";

const MRR_CAVEAT =
  "Somme des MRR des opportunités gagnées. Le CRM ne stocke pas les fins de contrat : une résiliation reste comptée.";

/**
 * Cumulated MRR of won deals, against the configured target.
 *
 * `mrr` is a generated column (`amount / 12`), so it is normally present. It is
 * absent on records read outside `deals_summary` — FakeRest, fixtures — hence
 * the `arrToMrr` fallback rather than a zero.
 */
export function computeMrrProgress(
  deals: DealRecord[],
  target: number | null | undefined,
): MrrProgress {
  const won = deals.filter((deal) => isWonStage(deal.stage));

  const signedMrr = won.reduce((total, deal) => {
    const mrr = typeof deal.mrr === "number" ? deal.mrr : arrToMrr(deal.amount);
    return total + (mrr ?? 0);
  }, 0);

  const hasTarget =
    typeof target === "number" && Number.isFinite(target) && target > 0;

  return {
    signedMrr,
    signedCount: won.length,
    target: hasTarget ? target : 0,
    // Uncapped on purpose: exceeding the target is worth seeing. Callers cap
    // the *bar*, not the number.
    progress: hasTarget ? signedMrr / target : null,
    gap: hasTarget ? target - signedMrr : null,
    label: MRR_LABEL,
    caveat: MRR_CAVEAT,
  };
}
