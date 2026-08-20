import {
  DEFAULT_SORT_DIRECTION,
  sortDeals,
  type DealSortContext,
} from "./dealSort";
import { TEST_PIPELINE_STATUSES, TEST_STAGES, makeDeal } from "./testFixtures";

const TODAY = new Date(2026, 7, 20);

const context: DealSortContext = {
  weighting: {
    stageProbabilities: { qualified: 20, trial: 70 },
    pipelineStatuses: TEST_PIPELINE_STATUSES,
  },
  nextActionOptions: {
    dealStages: TEST_STAGES,
    pipelineStatuses: TEST_PIPELINE_STATUSES,
    fromStage: "qualified",
    today: TODAY,
  },
  activityOptions: {
    pipelineStatuses: TEST_PIPELINE_STATUSES,
    thresholdDays: 14,
    today: TODAY,
  },
  stageOrder: TEST_STAGES.map((stage) => stage.value),
};

const names = (deals: ReturnType<typeof sortDeals>) =>
  deals.map((deal) => deal.name);

describe("sortDeals", () => {
  it("orders by priority, urgent first (issue #93)", () => {
    const deals = [
      makeDeal({ name: "normal", priority: "normal" }),
      makeDeal({ name: "urgent", priority: "urgent" }),
      makeDeal({ name: "important", priority: "important" }),
    ];
    expect(names(sortDeals(deals, "priority", "asc", context))).toEqual([
      "urgent",
      "important",
      "normal",
    ]);
    expect(names(sortDeals(deals, "priority", "desc", context))).toEqual([
      "normal",
      "important",
      "urgent",
    ]);
  });

  it("keeps deals with no value last whichever way the column is sorted", () => {
    const deals = [
      makeDeal({ name: "sans montant", amount: null as never }),
      makeDeal({ name: "petit", amount: 100 }),
      makeDeal({ name: "gros", amount: 900 }),
    ];
    expect(names(sortDeals(deals, "amount", "desc", context))).toEqual([
      "gros",
      "petit",
      "sans montant",
    ]);
    expect(names(sortDeals(deals, "amount", "asc", context))).toEqual([
      "petit",
      "gros",
      "sans montant",
    ]);
  });

  it("sorts by weighted amount, leaving unweighted deals last", () => {
    const deals = [
      makeDeal({ name: "trial", stage: "trial", amount: 1_000 }), // 700
      makeDeal({ name: "qualified", stage: "qualified", amount: 5_000 }), // 1 000
      makeDeal({ name: "sans probabilité", stage: "rdv-prix", amount: 9_000 }),
    ];
    expect(names(sortDeals(deals, "weighted", "desc", context))).toEqual([
      "qualified",
      "trial",
      "sans probabilité",
    ]);
  });

  it("sorts by next action date, deals without one last", () => {
    const deals = [
      makeDeal({
        name: "plus tard",
        next_action: "a",
        next_action_date: "2026-09-01",
      }),
      makeDeal({
        name: "bientôt",
        next_action: "b",
        next_action_date: "2026-08-21",
      }),
      makeDeal({ name: "aucune" }),
    ];
    expect(names(sortDeals(deals, "next_action_date", "asc", context))).toEqual(
      ["bientôt", "plus tard", "aucune"],
    );
  });

  it("sorts by dormancy, the most neglected first", () => {
    const deals = [
      makeDeal({ name: "récente", updated_at: "2026-08-19T12:00:00.000Z" }),
      makeDeal({ name: "ancienne", updated_at: "2026-06-01T12:00:00.000Z" }),
    ];
    expect(names(sortDeals(deals, "activity", "desc", context))).toEqual([
      "ancienne",
      "récente",
    ]);
  });

  it("sorts stages in pipeline order, not alphabetically", () => {
    const deals = [
      makeDeal({ name: "trial", stage: "trial" }),
      makeDeal({ name: "lead", stage: "lead" }),
      makeDeal({ name: "qualified", stage: "qualified" }),
    ];
    expect(names(sortDeals(deals, "stage", "asc", context))).toEqual([
      "lead",
      "qualified",
      "trial",
    ]);
  });

  it("sorts names with French collation", () => {
    const deals = [
      makeDeal({ name: "Zèbre" }),
      makeDeal({ name: "École" }),
      makeDeal({ name: "Avenir" }),
    ];
    expect(names(sortDeals(deals, "name", "asc", context))).toEqual([
      "Avenir",
      "École",
      "Zèbre",
    ]);
  });

  it("does not mutate the input array", () => {
    const deals = [makeDeal({ name: "b" }), makeDeal({ name: "a" })];
    sortDeals(deals, "name", "asc", context);
    expect(names(deals)).toEqual(["b", "a"]);
  });

  it("leads with what the user is looking for on first click", () => {
    expect(DEFAULT_SORT_DIRECTION.priority).toBe("asc"); // urgent first
    expect(DEFAULT_SORT_DIRECTION.amount).toBe("desc"); // biggest first
    expect(DEFAULT_SORT_DIRECTION.activity).toBe("desc"); // most dormant first
  });
});
