import { MRR_LABEL, computeMrrProgress } from "./dashboardKpi";
import { computeRevenueSnapshot } from "../deals/cockpit/dealRevenue";
import { makeDeal } from "../deals/cockpit/testFixtures";

const TODAY = new Date(2026, 7, 23);
const TERMINAL = ["closed-won", "lost", "churn"];

const weighting = {
  stageProbabilities: { lead: 10, qualified: 30, proposal: 70 },
  pipelineStatuses: TERMINAL,
};

describe("computeMrrProgress", () => {
  it("sums the MRR of won deals only", () => {
    const progress = computeMrrProgress(
      [
        makeDeal({ stage: "closed-won", amount: 12_000, mrr: 1000 }),
        makeDeal({ stage: "closed-won", amount: 6000, mrr: 500 }),
        makeDeal({ stage: "proposal", amount: 120_000, mrr: 10_000 }),
        makeDeal({ stage: "lost", amount: 60_000, mrr: 5000 }),
      ],
      25_000,
    );

    expect(progress.signedMrr).toBe(1500);
    expect(progress.signedCount).toBe(2);
  });

  it("derives the MRR from the ARR when the generated column is absent", () => {
    // `mrr` comes from `deals_summary`; records read elsewhere (FakeRest,
    // fixtures) do not carry it, and a zero there would understate the KPI.
    const progress = computeMrrProgress(
      [makeDeal({ stage: "closed-won", amount: 12_000, mrr: undefined })],
      25_000,
    );
    expect(progress.signedMrr).toBe(1000);
  });

  it("computes progress and the remaining gap", () => {
    const progress = computeMrrProgress(
      [makeDeal({ stage: "closed-won", amount: 80_400, mrr: 6700 })],
      25_000,
    );

    expect(progress.progress).toBeCloseTo(0.268, 3);
    expect(progress.gap).toBe(18_300);
  });

  it("does not cap progress above the target", () => {
    // Beating the target is worth seeing; callers cap the bar, not the number.
    const progress = computeMrrProgress(
      [makeDeal({ stage: "closed-won", amount: 600_000, mrr: 50_000 })],
      25_000,
    );
    expect(progress.progress).toBe(2);
    expect(progress.gap).toBe(-25_000);
  });

  it("reports no progress when no target is configured", () => {
    for (const target of [null, undefined, 0, Number.NaN]) {
      const progress = computeMrrProgress(
        [makeDeal({ stage: "closed-won", amount: 12_000, mrr: 1000 })],
        target,
      );
      expect(progress.progress).toBeNull();
      expect(progress.gap).toBeNull();
      // The signed figure stands on its own even without a target.
      expect(progress.signedMrr).toBe(1000);
    }
  });

  it("carries the wording that keeps the KPI honest", () => {
    const progress = computeMrrProgress([], 25_000);
    // The CRM has no contract-termination data: a churned client still counts.
    // The label must never read "MRR actuel".
    expect(progress.label).toBe(MRR_LABEL);
    expect(progress.label).toContain("signé");
    expect(progress.caveat).toContain("résiliation");
  });

  it("returns zero, not NaN, on an empty selection", () => {
    expect(computeMrrProgress([], 25_000)).toMatchObject({
      signedMrr: 0,
      signedCount: 0,
      progress: 0,
    });
  });
});

describe("the four ARR KPIs come from computeRevenueSnapshot", () => {
  const deals = [
    makeDeal({ stage: "closed-won", amount: 56_160 }),
    makeDeal({ stage: "lead", amount: 100_000 }),
    makeDeal({ stage: "proposal", amount: 20_000 }),
    makeDeal({ stage: "lost", amount: 48_000 }),
  ];

  const snapshot = computeRevenueSnapshot(deals, {
    weighting,
    inactivityThresholdDays: 14,
    today: TODAY,
  });

  it("maps one-to-one onto the spec's four cards", () => {
    // ARR signé / pipeline brut / pipeline pondéré / ARR perdu.
    expect(snapshot.signed).toMatchObject({ amount: 56_160, count: 1 });
    expect(snapshot.potential).toMatchObject({ amount: 120_000, count: 2 });
    expect(snapshot.lost).toMatchObject({ amount: 48_000, count: 1 });
    // 100 000 × 10 % + 20 000 × 70 % = 24 000
    expect(snapshot.weighted).toMatchObject({
      available: true,
      amount: 24_000,
    });
  });

  it("reports the weighted pipeline as unavailable rather than zero", () => {
    // Nothing weighted must never render as "0 €" — that is a different claim.
    const unweighted = computeRevenueSnapshot(
      [makeDeal({ stage: "negociation", amount: 50_000 })],
      {
        weighting: { stageProbabilities: {}, pipelineStatuses: TERMINAL },
        inactivityThresholdDays: 14,
        today: TODAY,
      },
    );
    expect(unweighted.weighted.available).toBe(false);
    expect(unweighted.potential.amount).toBe(50_000);
  });
});
