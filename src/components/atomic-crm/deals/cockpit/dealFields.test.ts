import {
  DEFAULT_INACTIVITY_ALERT_DAYS,
  compareByPriority,
  getDealActivity,
  getDealNextAction,
  getDealPriority,
  getDealType,
  getDealTypeLabel,
  isLostStage,
  isNextActionExpected,
  isOpenStage,
  isWonStage,
} from "./dealFields";
import { TEST_PIPELINE_STATUSES, TEST_STAGES, makeDeal } from "./testFixtures";

const TODAY = new Date(2026, 7, 20); // 20 August 2026, local time

// `updated_at`/`created_at` are timestamptz. Fixtures below use midday UTC so
// that the local calendar day is the same one from UTC-11 to UTC+11, and the
// day-boundary assertions do not depend on where the suite runs.
const at = (day: string) => `${day}T12:00:00.000Z`;

const nextActionOptions = {
  dealStages: TEST_STAGES,
  pipelineStatuses: TEST_PIPELINE_STATUSES,
  fromStage: "qualified",
  today: TODAY,
};

const activityOptions = {
  pipelineStatuses: TEST_PIPELINE_STATUSES,
  thresholdDays: DEFAULT_INACTIVITY_ALERT_DAYS,
  today: TODAY,
};

describe("stage classification", () => {
  it("splits the pipeline into open, won and lost", () => {
    expect(isOpenStage("qualified", TEST_PIPELINE_STATUSES)).toBe(true);
    expect(isOpenStage("closed-won", TEST_PIPELINE_STATUSES)).toBe(false);
    expect(isWonStage("closed-won")).toBe(true);
    expect(isWonStage("perdu")).toBe(false);
    expect(isLostStage("perdu", TEST_PIPELINE_STATUSES)).toBe(true);
    expect(isLostStage("closed-won", TEST_PIPELINE_STATUSES)).toBe(false);
    expect(isLostStage("qualified", TEST_PIPELINE_STATUSES)).toBe(false);
  });
});

describe("getDealPriority", () => {
  it("reads the three levels of issue #93, case and accent insensitive", () => {
    expect(getDealPriority(makeDeal({ priority: "urgent" }))).toBe("urgent");
    expect(getDealPriority(makeDeal({ priority: "URGENT" }))).toBe("urgent");
    expect(getDealPriority(makeDeal({ priority: " Important " }))).toBe(
      "important",
    );
    expect(getDealPriority(makeDeal({ priority: "Normal" }))).toBe("normal");
  });

  it("returns null rather than defaulting to normal when unset", () => {
    expect(getDealPriority(makeDeal())).toBeNull();
    expect(getDealPriority(makeDeal({ priority: null }))).toBeNull();
    expect(getDealPriority(makeDeal({ priority: "" }))).toBeNull();
    expect(getDealPriority(makeDeal({ priority: "critique" }))).toBeNull();
  });

  it("sorts urgent first and unprioritised deals last", () => {
    const deals = [
      makeDeal({ name: "none" }),
      makeDeal({ name: "normal", priority: "normal" }),
      makeDeal({ name: "urgent", priority: "urgent" }),
      makeDeal({ name: "important", priority: "important" }),
    ];
    expect([...deals].sort(compareByPriority).map((d) => d.name)).toEqual([
      "urgent",
      "important",
      "normal",
      "none",
    ]);
  });
});

describe("getDealNextAction", () => {
  it("is expected from the qualified stage onwards, per issue #92", () => {
    const expected = (stage: string) =>
      isNextActionExpected(makeDeal({ stage }), nextActionOptions);
    expect(expected("lead")).toBe(false);
    expect(expected("qualified")).toBe(true);
    expect(expected("trial")).toBe(true);
    expect(expected("closed-won")).toBe(false);
    expect(expected("perdu")).toBe(false);
  });

  it("flags a qualified deal with no action as missing, not as empty", () => {
    const action = getDealNextAction(
      makeDeal({ stage: "qualified" }),
      nextActionOptions,
    );
    expect(action.status).toBe("missing");
    expect(action.label).toBeNull();
  });

  /**
   * Issue #108: production had 0 of 215 opportunities with a typed next action
   * while 100 pending tasks existed, so the whole column read as broken.
   */
  it("falls back to the deal's pending task when no action was typed in", () => {
    const action = getDealNextAction(
      makeDeal({
        stage: "qualified",
        next_task_text: "Relancer pour obtenir un rdv",
        next_task_date: "2026-08-25",
      }),
      nextActionOptions,
    );
    expect(action.label).toBe("Relancer pour obtenir un rdv");
    expect(action.date).toBe("2026-08-25");
    expect(action.status).toBe("upcoming");
    expect(action.fromTask).toBe(true);
  });

  it("keeps a typed action over the task backlog", () => {
    const action = getDealNextAction(
      makeDeal({
        stage: "qualified",
        next_action: "Signer le contrat",
        next_action_date: "2026-08-22",
        next_task_text: "Relancer pour obtenir un rdv",
        next_task_date: "2026-08-25",
      }),
      nextActionOptions,
    );
    expect(action.label).toBe("Signer le contrat");
    expect(action.date).toBe("2026-08-22");
    expect(action.fromTask).toBe(false);
  });

  it("does not nag about early-stage deals", () => {
    expect(
      getDealNextAction(makeDeal({ stage: "lead" }), nextActionOptions).status,
    ).toBe("not-expected");
  });

  it("derives the due status from the action date", () => {
    const statusFor = (next_action_date: string) =>
      getDealNextAction(
        makeDeal({ next_action: "Envoyer proposition", next_action_date }),
        nextActionOptions,
      ).status;
    expect(statusFor("2026-08-18")).toBe("overdue");
    expect(statusFor("2026-08-20")).toBe("today");
    expect(statusFor("2026-08-25")).toBe("upcoming");
  });

  it("reports an action with no date instead of guessing one", () => {
    const action = getDealNextAction(
      makeDeal({ next_action: "Relancer directeur" }),
      nextActionOptions,
    );
    expect(action.status).toBe("undated");
    expect(action.daysUntil).toBeNull();
  });

  it("falls back to the deal owner, and prefers a dedicated action owner", () => {
    const fallback = getDealNextAction(
      makeDeal({ sales_id: 7 }),
      nextActionOptions,
    );
    expect(fallback.ownerId).toBe(7);
    expect(fallback.ownerIsDealOwner).toBe(true);

    const dedicated = getDealNextAction(
      makeDeal({ sales_id: 7, next_action_owner_id: 9 }),
      nextActionOptions,
    );
    expect(dedicated.ownerId).toBe(9);
    expect(dedicated.ownerIsDealOwner).toBe(false);
  });

  it("keeps cards and list on one datum: same input, same output", () => {
    const deal = makeDeal({
      next_action: "Démo direction médicale",
      next_action_date: "2026-08-28",
      sales_id: 3,
    });
    expect(getDealNextAction(deal, nextActionOptions)).toEqual(
      getDealNextAction(deal, nextActionOptions),
    );
  });
});

describe("getDealActivity", () => {
  it("prefers a real activity log over the last write", () => {
    const activity = getDealActivity(
      makeDeal({
        last_activity_at: at("2026-08-18"),
        updated_at: at("2026-08-19"),
      }),
      activityOptions,
    );
    expect(activity.source).toBe("last_activity_at");
    expect(activity.daysSinceActivity).toBe(2);
  });

  it("falls back to updated_at and says so", () => {
    const activity = getDealActivity(
      makeDeal({ updated_at: at("2026-08-01") }),
      activityOptions,
    );
    expect(activity.source).toBe("updated_at");
    expect(activity.daysSinceActivity).toBe(19);
  });

  it("flags an open deal dormant at the configured threshold, not before", () => {
    const staleAt = (updated_at: string, thresholdDays: number) =>
      getDealActivity(makeDeal({ updated_at }), {
        ...activityOptions,
        thresholdDays,
      }).isStale;

    // 14 days is the default asked for in issue #94.
    expect(staleAt(at("2026-08-07"), 14)).toBe(false); // 13 days
    expect(staleAt(at("2026-08-06"), 14)).toBe(true); // 14 days
    // …and it is configurable.
    expect(staleAt(at("2026-08-07"), 7)).toBe(true);
    expect(staleAt(at("2026-08-06"), 30)).toBe(false);
  });

  it("never flags a closed deal as dormant", () => {
    const activity = getDealActivity(
      makeDeal({ stage: "closed-won", updated_at: at("2025-01-01") }),
      activityOptions,
    );
    expect(activity.daysSinceActivity).toBeGreaterThan(14);
    expect(activity.isStale).toBe(false);
  });

  it("reports an unknown date as unknown", () => {
    const activity = getDealActivity(
      makeDeal({ created_at: "", updated_at: "" }),
      activityOptions,
    );
    expect(activity.source).toBe("none");
    expect(activity.daysSinceActivity).toBeNull();
    expect(activity.isStale).toBe(false);
  });
});

describe("getDealType", () => {
  it("reads opportunity_type first, then falls back to the company_type contract", () => {
    expect(getDealType(makeDeal({ company_type: "client" }))).toBe("client");
    expect(
      getDealType(
        makeDeal({ company_type: "client", opportunity_type: "extension" }),
      ),
    ).toBe("extension");
    expect(getDealType(makeDeal())).toBeNull();
  });

  it("labels a known type and falls back to the raw value otherwise", () => {
    const choices = [{ value: "client", label: "Client" }];
    expect(
      getDealTypeLabel(makeDeal({ company_type: "client" }), choices),
    ).toBe("Client");
    expect(getDealTypeLabel(makeDeal({ company_type: "autre" }), choices)).toBe(
      "autre",
    );
    expect(getDealTypeLabel(makeDeal(), choices)).toBeNull();
  });
});
