import {
  getDealProbability,
  getWeightedAmount,
  sanitizeStageProbabilities,
  sumWeighted,
  type WeightingConfig,
} from "./dealWeighting";
import { TEST_PIPELINE_STATUSES, makeDeal } from "./testFixtures";

const config: WeightingConfig = {
  stageProbabilities: { qualified: 20, "follow-up": 40, trial: 70 },
  pipelineStatuses: TEST_PIPELINE_STATUSES,
};

const unconfigured: WeightingConfig = {
  stageProbabilities: {},
  pipelineStatuses: TEST_PIPELINE_STATUSES,
};

describe("getDealProbability", () => {
  it("prefers the per-deal probability over the stage default", () => {
    const probability = getDealProbability(
      makeDeal({ stage: "qualified", probability: 65 }),
      config,
    );
    expect(probability).toEqual({ value: 0.65, source: "deal" });
  });

  it("treats a closed outcome as a fact, not an estimate", () => {
    expect(
      getDealProbability(makeDeal({ stage: "closed-won" }), config),
    ).toEqual({ value: 1, source: "won-stage" });
    expect(getDealProbability(makeDeal({ stage: "perdu" }), config)).toEqual({
      value: 0,
      source: "lost-stage",
    });
    expect(
      getDealProbability(makeDeal({ stage: "declined" }), unconfigured),
    ).toEqual({ value: 0, source: "lost-stage" });
  });

  it("falls back to the configured stage probability", () => {
    expect(getDealProbability(makeDeal({ stage: "trial" }), config)).toEqual({
      value: 0.7,
      source: "stage-config",
    });
  });

  it("reports no probability instead of assuming one", () => {
    expect(getDealProbability(makeDeal({ stage: "rdv-prix" }), config)).toEqual(
      { value: null, source: "none" },
    );
    expect(
      getDealProbability(makeDeal({ stage: "qualified" }), unconfigured),
    ).toEqual({ value: null, source: "none" });
  });

  it("ignores non-numeric values and clamps out-of-range percentages", () => {
    expect(
      getDealProbability(
        makeDeal({ stage: "qualified", probability: 140 }),
        config,
      ).value,
    ).toBe(1);
    expect(
      getDealProbability(
        makeDeal({ stage: "qualified", probability: -10 }),
        config,
      ).value,
    ).toBe(0);
    // NaN must not shadow the stage default.
    expect(
      getDealProbability(
        makeDeal({ stage: "qualified", probability: Number.NaN }),
        config,
      ),
    ).toEqual({ value: 0.2, source: "stage-config" });
  });
});

describe("priority is never a probability", () => {
  it("weighs two deals identically whatever their priority", () => {
    const base = { stage: "trial" as const, amount: 10_000 };
    const weights = ["urgent", "important", "normal", undefined].map(
      (priority) => getWeightedAmount(makeDeal({ ...base, priority }), config),
    );
    expect(new Set(weights)).toEqual(new Set([7000]));
  });

  it("does not let priority stand in for a missing probability", () => {
    expect(
      getWeightedAmount(
        makeDeal({ stage: "rdv-prix", priority: "urgent" }),
        config,
      ),
    ).toBeNull();
  });

  it("does not let priority reorder the weighted total", () => {
    const deals = [
      makeDeal({ stage: "trial", amount: 1000, priority: "urgent" }),
      makeDeal({ stage: "qualified", amount: 1000, priority: "normal" }),
    ];
    const flipped = [
      makeDeal({ stage: "trial", amount: 1000, priority: "normal" }),
      makeDeal({ stage: "qualified", amount: 1000, priority: "urgent" }),
    ];
    expect(sumWeighted(deals, config).amount).toBe(
      sumWeighted(flipped, config).amount,
    );
  });
});

describe("sumWeighted", () => {
  it("sums what it can and reports what it could not weigh", () => {
    const total = sumWeighted(
      [
        makeDeal({ stage: "trial", amount: 10_000 }), // 70%
        makeDeal({ stage: "qualified", amount: 5_000 }), // 20%
        makeDeal({ stage: "rdv-prix", amount: 8_000 }), // no probability
      ],
      config,
    );
    expect(total.amount).toBe(8_000);
    expect(total.weightedCount).toBe(2);
    expect(total.unweightedCount).toBe(1);
    expect(total.unweightedAmount).toBe(8_000);
    // 8 000 weighted out of 15 000 of covered pipeline.
    expect(total.averageProbability).toBeCloseTo(0.5333, 4);
  });

  it("reports no average when nothing could be weighted", () => {
    const total = sumWeighted([makeDeal({ stage: "qualified" })], unconfigured);
    expect(total.amount).toBe(0);
    expect(total.averageProbability).toBeNull();
  });

  it("treats a missing amount as zero without dropping the deal", () => {
    const total = sumWeighted(
      [makeDeal({ stage: "trial", amount: undefined as unknown as number })],
      config,
    );
    expect(total.amount).toBe(0);
    expect(total.weightedCount).toBe(1);
  });
});

describe("sanitizeStageProbabilities", () => {
  it("drops blank entries instead of storing them as zero", () => {
    expect(
      sanitizeStageProbabilities({
        qualified: "",
        trial: null,
        lead: undefined,
      }),
    ).toEqual({});
  });

  it("keeps an explicit zero, which is a real statement", () => {
    expect(sanitizeStageProbabilities({ lead: 0 })).toEqual({ lead: 0 });
  });

  it("rounds and clamps to 0–100", () => {
    expect(
      sanitizeStageProbabilities({ a: 20.4, b: 150, c: -5, d: "70" }),
    ).toEqual({ a: 20, b: 100, c: 0, d: 70 });
  });

  it("ignores values that are not numbers", () => {
    expect(sanitizeStageProbabilities({ a: "beaucoup", b: {} })).toEqual({});
  });

  it("tolerates a missing configuration", () => {
    expect(sanitizeStageProbabilities(undefined)).toEqual({});
    expect(sanitizeStageProbabilities(null)).toEqual({});
  });
});
