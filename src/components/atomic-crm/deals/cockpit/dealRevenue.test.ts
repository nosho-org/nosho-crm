import {
  computeForecast,
  computeRevenueSnapshot,
  isDealAtRisk,
  type RevenueSnapshotOptions,
} from "./dealRevenue";
import { getPeriodBuckets, resolvePeriod } from "./dealPeriods";
import type { WeightingConfig } from "./dealWeighting";
import { TEST_PIPELINE_STATUSES, makeDeal } from "./testFixtures";

const TODAY = new Date(2026, 7, 20);

const weighting: WeightingConfig = {
  stageProbabilities: { qualified: 20, trial: 70 },
  pipelineStatuses: TEST_PIPELINE_STATUSES,
};

const options: RevenueSnapshotOptions = {
  weighting,
  inactivityThresholdDays: 14,
  today: TODAY,
};

/** Recent enough never to be flagged dormant by accident. */
const active = { updated_at: "2026-08-19T12:00:00.000Z" };

describe("computeRevenueSnapshot", () => {
  const deals = [
    makeDeal({ stage: "qualified", amount: 5_000, ...active }),
    makeDeal({ stage: "trial", amount: 10_000, ...active }),
    makeDeal({ stage: "closed-won", amount: 20_000, ...active }),
    makeDeal({ stage: "perdu", amount: 3_000, ...active }),
    makeDeal({ stage: "declined", amount: 1_000, ...active }),
  ];

  it("separates signed, open pipeline and lost deals", () => {
    const snapshot = computeRevenueSnapshot(deals, options);
    expect(snapshot.signed).toEqual({
      available: true,
      amount: 20_000,
      count: 1,
    });
    expect(snapshot.potential).toEqual({
      available: true,
      amount: 15_000,
      count: 2,
    });
    expect(snapshot.lost).toEqual({ available: true, amount: 4_000, count: 2 });
  });

  it("weighs the open pipeline only, never double-counting won deals", () => {
    const snapshot = computeRevenueSnapshot(deals, options);
    // 5 000 × 20% + 10 000 × 70% = 8 000. The 20 000 already signed is out.
    expect(snapshot.weighted).toMatchObject({ available: true, amount: 8_000 });
  });

  it("declares the weighted figure unavailable instead of showing zero", () => {
    const snapshot = computeRevenueSnapshot(deals, {
      ...options,
      weighting: {
        stageProbabilities: {},
        pipelineStatuses: TEST_PIPELINE_STATUSES,
      },
    });
    expect(snapshot.weighted.available).toBe(false);
    expect(snapshot.weighted).toHaveProperty("reason");
  });

  it("weights on per-deal probabilities even with no stage configured", () => {
    const snapshot = computeRevenueSnapshot(
      [
        makeDeal({
          stage: "rdv-prix",
          amount: 10_000,
          probability: 45,
          ...active,
        }),
      ],
      {
        ...options,
        weighting: {
          stageProbabilities: {},
          pipelineStatuses: TEST_PIPELINE_STATUSES,
        },
      },
    );
    expect(snapshot.weighted).toMatchObject({ available: true, amount: 4_500 });
  });

  it("reports how much pipeline carries no probability", () => {
    const snapshot = computeRevenueSnapshot(
      [...deals, makeDeal({ stage: "rdv-prix", amount: 7_000, ...active })],
      options,
    );
    expect(snapshot.weighted).toMatchObject({
      unweightedCount: 1,
      unweightedAmount: 7_000,
    });
  });

  it("never invents current recurring revenue", () => {
    const snapshot = computeRevenueSnapshot(deals, options);
    expect(snapshot.recurring.available).toBe(false);
    expect(snapshot.recurring.reason).toMatch(/contrat récurrent/i);
  });

  it("returns zeroes, not errors, on an empty selection", () => {
    const snapshot = computeRevenueSnapshot([], options);
    expect(snapshot.potential).toEqual({
      available: true,
      amount: 0,
      count: 0,
    });
    expect(snapshot.weighted.available).toBe(false);
  });
});

describe("isDealAtRisk", () => {
  it("flags an open deal left dormant past the threshold", () => {
    expect(
      isDealAtRisk(
        makeDeal({
          stage: "qualified",
          updated_at: "2026-08-01T12:00:00.000Z",
          expected_closing_date: "2026-12-01",
        }),
        options,
      ),
    ).toBe(true);
  });

  it("flags an open deal past its expected closing date", () => {
    expect(
      isDealAtRisk(
        makeDeal({
          stage: "qualified",
          expected_closing_date: "2026-08-01",
          ...active,
        }),
        options,
      ),
    ).toBe(true);
  });

  it("leaves an active, on-time deal alone", () => {
    expect(
      isDealAtRisk(
        makeDeal({
          stage: "qualified",
          expected_closing_date: "2026-12-01",
          ...active,
        }),
        options,
      ),
    ).toBe(false);
  });

  it("never flags a closed deal, however old", () => {
    expect(
      isDealAtRisk(
        makeDeal({
          stage: "closed-won",
          updated_at: "2025-01-01T12:00:00.000Z",
          expected_closing_date: "2025-01-01",
        }),
        options,
      ),
    ).toBe(false);
  });

  it("is independent from priority", () => {
    const overdue = {
      stage: "qualified",
      expected_closing_date: "2026-08-01",
      ...active,
    };
    expect(
      isDealAtRisk(makeDeal({ ...overdue, priority: "normal" }), options),
    ).toBe(isDealAtRisk(makeDeal({ ...overdue, priority: "urgent" }), options));
  });
});

describe("computeForecast", () => {
  const quarter = resolvePeriod("current-quarter", TODAY);
  const buckets = getPeriodBuckets(quarter, "month", TODAY);

  const deals = [
    makeDeal({
      stage: "qualified",
      amount: 5_000,
      expected_closing_date: "2026-07-15",
    }),
    makeDeal({
      stage: "trial",
      amount: 10_000,
      expected_closing_date: "2026-08-31",
    }),
    makeDeal({
      stage: "trial",
      amount: 4_000,
      expected_closing_date: "2026-09-01",
    }),
    // Excluded: outcomes are not forecasts.
    makeDeal({
      stage: "closed-won",
      amount: 50_000,
      expected_closing_date: "2026-08-10",
    }),
    makeDeal({
      stage: "perdu",
      amount: 9_000,
      expected_closing_date: "2026-08-10",
    }),
  ];

  it("buckets the open pipeline by expected closing date", () => {
    const forecast = computeForecast(deals, buckets, { weighting });
    expect(forecast.columns.map((column) => column.potential)).toEqual([
      5_000, 10_000, 4_000,
    ]);
    expect(forecast.columns.map((column) => column.count)).toEqual([1, 1, 1]);
  });

  it("weights each bucket and totals only what the columns cover", () => {
    const forecast = computeForecast(deals, buckets, { weighting });
    expect(forecast.columns.map((column) => column.weighted)).toEqual([
      1_000, // 5 000 × 20%
      7_000, // 10 000 × 70%
      2_800, // 4 000 × 70%
    ]);
    expect(forecast.total.potential).toBe(19_000);
    expect(forecast.total.weighted).toBe(10_800);
    expect(forecast.total.averageProbability).toBeCloseTo(10_800 / 19_000, 6);
  });

  it("keeps month boundaries exact", () => {
    const forecast = computeForecast(deals, buckets, { weighting });
    // 31 August belongs to August, 1 September to September.
    expect(forecast.columns[1].count).toBe(1);
    expect(forecast.columns[2].count).toBe(1);
  });

  it("counts deals the columns cannot show instead of dropping them", () => {
    const forecast = computeForecast(
      [
        ...deals,
        makeDeal({
          stage: "qualified",
          amount: 2_000,
          expected_closing_date: null as never,
        }),
        makeDeal({
          stage: "qualified",
          amount: 6_000,
          expected_closing_date: "2027-03-01",
        }),
      ],
      buckets,
      { weighting },
    );
    expect(forecast.undated).toEqual({
      available: true,
      amount: 2_000,
      count: 1,
    });
    expect(forecast.outOfRange).toEqual({
      available: true,
      amount: 6_000,
      count: 1,
    });
    expect(forecast.total.potential).toBe(19_000);
  });

  it("reports an unweighted bucket as unknown rather than zero", () => {
    const forecast = computeForecast(
      [
        makeDeal({
          stage: "rdv-prix",
          amount: 3_000,
          expected_closing_date: "2026-07-10",
        }),
      ],
      buckets,
      { weighting },
    );
    expect(forecast.columns[0].potential).toBe(3_000);
    expect(forecast.columns[0].weighted).toBeNull();
    expect(forecast.columns[0].unweightedCount).toBe(1);
  });
});
