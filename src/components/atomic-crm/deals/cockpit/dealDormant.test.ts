import { describe, expect, it } from "vitest";

import { getDormantDeals, sumDormantAmounts } from "./dealDormant";
import type { ActivityOptions } from "./dealFields";
import { TEST_PIPELINE_STATUSES, makeDeal } from "./testFixtures";

const TODAY = new Date(2026, 7, 20);

const activityOptions: ActivityOptions = {
  pipelineStatuses: TEST_PIPELINE_STATUSES,
  thresholdDays: 14,
  today: TODAY,
};

/** `daysAgo(n)` is the ISO timestamp of local midnight, n days back. */
const daysAgo = (days: number) => new Date(2026, 7, 20 - days).toISOString();

describe("getDormantDeals", () => {
  it("keeps open deals past the threshold, most neglected first", () => {
    const deals = [
      makeDeal({ name: "Tiède", last_activity_at: daysAgo(20) }),
      makeDeal({ name: "Oubliée", last_activity_at: daysAgo(90) }),
      makeDeal({ name: "Active", last_activity_at: daysAgo(3) }),
    ];

    expect(
      getDormantDeals(deals, activityOptions).map((d) => d.deal.name),
    ).toEqual(["Oubliée", "Tiède"]);
  });

  it("ignores closed deals — a won deal is not neglected", () => {
    const deals = [
      makeDeal({
        name: "Gagnée",
        stage: "closed-won",
        last_activity_at: daysAgo(200),
      }),
      makeDeal({
        name: "Perdue",
        stage: "perdu",
        last_activity_at: daysAgo(200),
      }),
    ];

    expect(getDormantDeals(deals, activityOptions)).toEqual([]);
  });

  it("respects the configured threshold", () => {
    const deals = [makeDeal({ last_activity_at: daysAgo(20) })];

    expect(
      getDormantDeals(deals, { ...activityOptions, thresholdDays: 30 }),
    ).toEqual([]);
  });
});

describe("sumDormantAmounts", () => {
  it("totals the amounts, counting a missing amount as zero", () => {
    const dormant = getDormantDeals(
      [
        makeDeal({ amount: 1500, last_activity_at: daysAgo(30) }),
        makeDeal({ amount: null, last_activity_at: daysAgo(30) }),
        makeDeal({ amount: 500, last_activity_at: daysAgo(30) }),
      ],
      activityOptions,
    );

    expect(sumDormantAmounts(dormant)).toBe(2000);
  });
});
