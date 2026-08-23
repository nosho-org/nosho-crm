import {
  computeStageBreakdown,
  totalStageBreakdown,
} from "./dealStageBreakdown";
import { makeDeal } from "./testFixtures";
import type { DealStage } from "../../types";

/** The v2 pipeline, as configured by 20260823093000. */
const STAGES: DealStage[] = [
  { value: "a-reclasser", label: "À reclasser" },
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualifié" },
  { value: "demo-poc", label: "Démo / POC" },
  { value: "proposal", label: "Proposition" },
  { value: "negociation", label: "Négociation" },
  { value: "closed-won", label: "Close Won" },
  { value: "lost", label: "Lost" },
  { value: "churn", label: "Churn" },
];

const TERMINAL = ["closed-won", "lost", "churn"];

describe("computeStageBreakdown", () => {
  it("sums ARR and counts deals per stage, in configured order", () => {
    const buckets = computeStageBreakdown(
      [
        makeDeal({ stage: "lead", amount: 1000 }),
        makeDeal({ stage: "lead", amount: 500 }),
        makeDeal({ stage: "proposal", amount: 20_000 }),
      ],
      STAGES,
      TERMINAL,
    );

    expect(buckets.map((b) => b.stage)).toEqual(STAGES.map((s) => s.value));
    expect(buckets.find((b) => b.stage === "lead")).toMatchObject({
      count: 2,
      amount: 1500,
    });
    expect(buckets.find((b) => b.stage === "proposal")).toMatchObject({
      count: 1,
      amount: 20_000,
    });
  });

  it("skips deals whose stage is not configured, rather than reassigning them", () => {
    // getDealsByStage folds unknown stages into the first column so the board
    // never loses a card. Doing that here would inflate "À reclasser", which is
    // now the first entry — a silently wrong number instead of a missing one.
    const buckets = computeStageBreakdown(
      [
        makeDeal({ stage: "lead", amount: 1000 }),
        makeDeal({ stage: "invest", amount: 190_000 }),
      ],
      STAGES,
      TERMINAL,
    );

    expect(buckets.find((b) => b.stage === "a-reclasser")).toMatchObject({
      count: 0,
      amount: 0,
    });
    expect(totalStageBreakdown(buckets).amount).toBe(1000);
  });

  it("drops terminal stages when openOnly is set", () => {
    const buckets = computeStageBreakdown(
      [
        makeDeal({ stage: "lead", amount: 1000 }),
        makeDeal({ stage: "closed-won", amount: 50_000 }),
        makeDeal({ stage: "lost", amount: 9000 }),
        makeDeal({ stage: "churn", amount: 4000 }),
      ],
      STAGES,
      TERMINAL,
      { openOnly: true },
    );

    expect(buckets.map((b) => b.stage)).not.toContain("closed-won");
    expect(buckets.map((b) => b.stage)).not.toContain("lost");
    expect(buckets.map((b) => b.stage)).not.toContain("churn");
    expect(totalStageBreakdown(buckets).amount).toBe(1000);
  });

  it("keeps empty stages by default and drops them on request", () => {
    // `negociation` is new and starts empty after the migration. The kanban
    // must still render its column; the funnel does not need the row.
    const deals = [makeDeal({ stage: "lead", amount: 1000 })];

    expect(
      computeStageBreakdown(deals, STAGES, TERMINAL).map((b) => b.stage),
    ).toContain("negociation");

    expect(
      computeStageBreakdown(deals, STAGES, TERMINAL, {
        includeEmpty: false,
      }).map((b) => b.stage),
    ).toEqual(["lead"]);
  });

  it("counts a deal with no amount without pretending its ARR is zero", () => {
    const buckets = computeStageBreakdown(
      [
        makeDeal({ stage: "lead", amount: 1000 }),
        makeDeal({ stage: "lead", amount: null }),
        makeDeal({ stage: "lead", amount: undefined }),
      ],
      STAGES,
      TERMINAL,
    );

    const lead = buckets.find((b) => b.stage === "lead")!;
    expect(lead).toMatchObject({ count: 3, amount: 1000 });
    // The caller can then say "3 opportunités · 1 000 € (2 sans montant)"
    // instead of implying the total is complete.
    expect(lead.hasUnvaluedDeals).toBe(true);
  });

  it("reports no unvalued deals when every amount is present", () => {
    const buckets = computeStageBreakdown(
      [makeDeal({ stage: "lead", amount: 0 })],
      STAGES,
      TERMINAL,
    );
    // 0 € is a recorded amount, not a missing one.
    expect(buckets.find((b) => b.stage === "lead")!.hasUnvaluedDeals).toBe(
      false,
    );
  });

  it("falls back to the slug when a stage has no label", () => {
    const buckets = computeStageBreakdown(
      [],
      [{ value: "negociation", label: "" }],
      TERMINAL,
    );
    expect(buckets[0].label).toBe("negociation");
  });
});

describe("totalStageBreakdown", () => {
  it("adds up counts and amounts, and propagates the unvalued flag", () => {
    const buckets = computeStageBreakdown(
      [
        makeDeal({ stage: "lead", amount: 1000 }),
        makeDeal({ stage: "proposal", amount: null }),
      ],
      STAGES,
      TERMINAL,
    );

    expect(totalStageBreakdown(buckets)).toEqual({
      count: 2,
      amount: 1000,
      hasUnvaluedDeals: true,
    });
  });

  it("returns zeroes for an empty breakdown", () => {
    expect(totalStageBreakdown([])).toEqual({
      count: 0,
      amount: 0,
      hasUnvaluedDeals: false,
    });
  });
});
