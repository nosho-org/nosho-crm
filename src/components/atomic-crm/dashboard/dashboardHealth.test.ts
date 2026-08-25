import { computeHealthAlerts, countHealthAlerts } from "./dashboardHealth";
import { makeDeal } from "../deals/cockpit/testFixtures";
import { toListFilter } from "../deals/dealFilterContract";

const TODAY = new Date(2026, 7, 23); // 23 août 2026, local

const STAGES = [
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualifié" },
  { value: "demo-poc", label: "Démo / POC" },
  { value: "proposal", label: "Proposition" },
  { value: "negociation", label: "Négociation" },
  { value: "closed-won", label: "Close Won" },
  { value: "lost", label: "Lost" },
];

const TERMINAL = ["closed-won", "lost", "churn"];

const options = (
  overrides: Partial<Parameters<typeof computeHealthAlerts>[1]> = {},
) => ({
  pipelineStatuses: TERMINAL,
  inactivityThresholdDays: 14,
  nextActionOptions: {
    dealStages: STAGES,
    pipelineStatuses: TERMINAL,
    fromStage: "qualified",
    today: TODAY,
  },
  today: TODAY,
  ...overrides,
});

/** Open, recently active, fully filled in: triggers nothing. */
const healthy = (extra: Record<string, unknown> = {}) =>
  makeDeal({
    stage: "qualified",
    amount: 1000,
    last_activity_at: "2026-08-22T10:00:00.000Z",
    next_action: "Relancer",
    next_action_date: "2026-09-01",
    expected_closing_date: "2026-09-30",
    ...extra,
  });

describe("computeHealthAlerts", () => {
  it("returns nothing when every open deal is in order", () => {
    expect(computeHealthAlerts([healthy(), healthy()], options())).toEqual([]);
  });

  it("flags an overdue next action as critical", () => {
    const alerts = computeHealthAlerts(
      [healthy({ next_action_date: "2026-08-01", amount: 5000 })],
      options(),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: "overdue-action",
      severity: "critical",
      count: 1,
      amount: 5000,
      criterion: "Date dépassée et action non terminée",
    });
    expect(alerts[0].title).toBe("1 prochaine tâche en retard");
  });

  it("flags a dormant deal and names the configured threshold", () => {
    const alerts = computeHealthAlerts(
      [healthy({ last_activity_at: "2026-06-01T10:00:00.000Z", amount: 8000 })],
      options(),
    );

    expect(alerts[0]).toMatchObject({
      id: "dormant",
      severity: "attention",
      count: 1,
      amount: 8000,
    });
    expect(alerts[0].criterion).toContain("14 jours");
  });

  it("treats a dated-but-actionless deal and an undated action alike", () => {
    // "prochaine action = vide OU date prochaine action = vide"
    const alerts = computeHealthAlerts(
      [
        healthy({ next_action: null, next_action_date: null }),
        healthy({ next_action: "Relancer", next_action_date: null }),
      ],
      options(),
    );

    const missing = alerts.find((a) => a.id === "missing-next-action");
    expect(missing?.count).toBe(2);
  });

  it("exempts stages before the configured one from the next-action rule", () => {
    // `fromStage` is "qualified": a lead is not neglected, it is early.
    const alerts = computeHealthAlerts(
      [healthy({ stage: "lead", next_action: null, next_action_date: null })],
      options(),
    );
    expect(alerts.find((a) => a.id === "missing-next-action")).toBeUndefined();
  });

  it("flags a missing closing date", () => {
    const alerts = computeHealthAlerts(
      [healthy({ expected_closing_date: null, amount: 14_600 })],
      options(),
    );

    expect(alerts.find((a) => a.id === "missing-closing-date")).toMatchObject({
      severity: "anomaly",
      count: 1,
      amount: 14_600,
    });
  });

  it("ignores closed deals entirely", () => {
    // A won or lost opportunity with no next action is finished, not neglected.
    const closed = [
      healthy({
        stage: "closed-won",
        next_action: null,
        next_action_date: null,
        expected_closing_date: null,
        last_activity_at: "2026-01-01T10:00:00.000Z",
      }),
      healthy({
        stage: "lost",
        next_action: null,
        next_action_date: null,
        expected_closing_date: null,
        last_activity_at: "2026-01-01T10:00:00.000Z",
      }),
    ];
    expect(computeHealthAlerts(closed, options())).toEqual([]);
  });

  it("orders alerts by severity, worst first", () => {
    const alerts = computeHealthAlerts(
      [
        healthy({ expected_closing_date: null }),
        healthy({ last_activity_at: "2026-06-01T10:00:00.000Z" }),
        healthy({ next_action_date: "2026-08-01" }),
      ],
      options(),
    );

    expect(alerts.map((a) => a.severity)).toEqual([
      "critical",
      "attention",
      "anomaly",
    ]);
  });

  it("caps the list at three by default and honours maxAlerts", () => {
    const deals = [
      healthy({ next_action_date: "2026-08-01" }),
      healthy({ last_activity_at: "2026-06-01T10:00:00.000Z" }),
      healthy({ next_action: null, next_action_date: null }),
      healthy({ expected_closing_date: null }),
    ];

    expect(computeHealthAlerts(deals, options())).toHaveLength(3);
    expect(computeHealthAlerts(deals, options({ maxAlerts: 5 }))).toHaveLength(
      4,
    );
  });

  it("counts the alerts that the cap hides", () => {
    // Silently truncating would read as "there are only three problems".
    const deals = [
      healthy({ next_action_date: "2026-08-01" }),
      healthy({ last_activity_at: "2026-06-01T10:00:00.000Z" }),
      healthy({ next_action: null, next_action_date: null }),
      healthy({ expected_closing_date: null }),
    ];
    expect(countHealthAlerts(deals, options())).toBe(4);
    expect(computeHealthAlerts(deals, options())).toHaveLength(3);
  });

  it("sums ARR over the deals concerned, ignoring those without an amount", () => {
    const alerts = computeHealthAlerts(
      [
        healthy({ next_action_date: "2026-08-01", amount: 1000 }),
        healthy({ next_action_date: "2026-08-02", amount: null }),
      ],
      options(),
    );
    expect(alerts[0]).toMatchObject({ count: 2, amount: 1000 });
  });

  it("produces a filter that resolves to the deals it counted", () => {
    // The number shown and the list the "Voir" button opens must describe the
    // same set — that is the whole point of routing through the contract.
    const alerts = computeHealthAlerts(
      [healthy({ last_activity_at: "2026-06-01T10:00:00.000Z" })],
      options({ inactivityThresholdDays: 30 }),
    );

    expect(toListFilter(alerts[0].filter, { today: TODAY })).toEqual({
      "last_activity_at@lt": "2026-07-24",
    });
  });
});
