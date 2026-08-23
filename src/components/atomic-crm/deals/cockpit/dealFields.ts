import type { Identifier } from "ra-core";

import type { LabeledValue } from "../../types";
import type { Deal } from "../../types";
import { daysSince, daysUntil } from "./dealDates";

/**
 * ---------------------------------------------------------------------------
 * Fields the cockpit reads
 * ---------------------------------------------------------------------------
 * This used to list three fields the cockpit read that production did not have
 * — `next_action_owner_id`, `probability` and `last_activity_at` — each with a
 * documented degradation path.
 *
 * All three now exist (20260823090000 for the first two, 20260823110000 for
 * `last_activity_at`, computed by `deals_summary`), so they live on `Deal` like
 * everything else and `DealRecord` is just `Deal`.
 *
 * The fallbacks below are deliberately kept rather than deleted:
 *
 *   - `next_action_owner_id` is NULL when the action owner is the deal owner,
 *     so falling back to `sales_id` is the intended reading, not a degradation;
 *   - `probability` is NULL unless someone recorded an exception, and the
 *     weighting cascade still resolves stage facts then `dealStageProbabilities`;
 *   - `last_activity_at` comes from the view, so it is absent from any record
 *     read straight off the `deals` table (FakeRest, fixtures, optimistic
 *     updates) — `DealActivity.source` still tells the UI which value it used.
 *
 * None of these is ever sent to PostgREST as a select list: no query selects an
 * explicit column list, and sorting is computed client-side in `dealSort.ts`.
 */
export type DealRecord = Deal;

/** @deprecated The three fields are real columns now; kept for import compatibility. */
export interface DealPipelineFields {
  next_action_owner_id: Identifier | null;
  probability: number | null;
  last_activity_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* Stage classification                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The won stage value, matching the convention already used by the dashboard
 * (`DealsChart`, `KPICards`) and the `won_at` column.
 */
export const WON_STAGE = "closed-won";

export const isWonStage = (stage: string | undefined): boolean =>
  stage === WON_STAGE;

/** Closed stages come from the `dealPipelineStatuses` configuration. */
export const isClosedStage = (
  stage: string | undefined,
  pipelineStatuses: string[],
): boolean => (stage ? pipelineStatuses.includes(stage) : false);

export const isLostStage = (
  stage: string | undefined,
  pipelineStatuses: string[],
): boolean => isClosedStage(stage, pipelineStatuses) && !isWonStage(stage);

/** Open = still in the pipeline, i.e. neither won nor lost. */
export const isOpenStage = (
  stage: string | undefined,
  pipelineStatuses: string[],
): boolean => !isClosedStage(stage, pipelineStatuses);

/* -------------------------------------------------------------------------- */
/* Priority (issue #93)                                                        */
/* -------------------------------------------------------------------------- */

export type DealPriority = "urgent" | "important" | "normal";

export interface DealPriorityChoice extends LabeledValue {
  value: DealPriority;
  /** Sort weight — lower sorts first. */
  rank: number;
}

/** Urgent > Important > Normal, as specified in issue #93. */
export const DEAL_PRIORITIES: DealPriorityChoice[] = [
  { value: "urgent", label: "Urgent", rank: 0 },
  { value: "important", label: "Important", rank: 1 },
  { value: "normal", label: "Normal", rank: 2 },
];

/** Deals with no priority sort after every prioritised deal. */
const UNSET_PRIORITY_RANK = DEAL_PRIORITIES.length;

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/**
 * Reads the commercial priority. Returns `null` — not a default of "normal" —
 * when the field is absent or holds an unknown value, so the UI can say
 * "non définie" rather than silently claiming the deal is a normal one.
 */
export const getDealPriority = (deal: DealRecord): DealPriority | null => {
  const raw = deal.priority;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const normalized = normalize(raw);
  return (
    DEAL_PRIORITIES.find((choice) => choice.value === normalized)?.value ?? null
  );
};

export const getDealPriorityChoice = (
  deal: DealRecord,
): DealPriorityChoice | null => {
  const priority = getDealPriority(deal);
  return DEAL_PRIORITIES.find((choice) => choice.value === priority) ?? null;
};

export const getDealPriorityRank = (deal: DealRecord): number =>
  getDealPriorityChoice(deal)?.rank ?? UNSET_PRIORITY_RANK;

/** Urgent first, then Important, then Normal, then deals with no priority. */
export const compareByPriority = (a: DealRecord, b: DealRecord): number =>
  getDealPriorityRank(a) - getDealPriorityRank(b);

/* -------------------------------------------------------------------------- */
/* Next action (issues #92 and #101)                                           */
/* -------------------------------------------------------------------------- */

export type NextActionStatus =
  /** The stage does not require a next action yet (before "Qualifié"). */
  | "not-expected"
  /** Expected but not filled in — the case the sales team must act on. */
  | "missing"
  /** An action is set but carries no date. */
  | "undated"
  | "overdue"
  | "today"
  | "upcoming";

export interface DealNextAction {
  label: string | null;
  date: string | null;
  /**
   * Who is accountable. Falls back to the deal owner (`sales_id`), which is a
   * real column today, so the owner shown on cards and in the list is never
   * invented.
   */
  ownerId: Identifier | null;
  /** True when the owner is the deal owner rather than a per-action owner. */
  ownerIsDealOwner: boolean;
  status: NextActionStatus;
  /** Negative when overdue. Null when there is no date. */
  daysUntil: number | null;
}

export interface NextActionOptions {
  dealStages: LabeledValue[];
  pipelineStatuses: string[];
  /**
   * First stage at which a next action is expected. Issue #92 asks for
   * "à partir de l'étape Qualifié"; configurable because stages are.
   */
  fromStage: string;
  today: Date;
}

/**
 * Whether a next action is expected on this deal: closed deals never need one,
 * and early stages (before `fromStage`) are exempt per issue #92.
 */
export const isNextActionExpected = (
  deal: DealRecord,
  { dealStages, pipelineStatuses, fromStage }: Omit<NextActionOptions, "today">,
): boolean => {
  if (!isOpenStage(deal.stage, pipelineStatuses)) return false;
  const fromIndex = dealStages.findIndex((stage) => stage.value === fromStage);
  // An unknown `fromStage` must not silently exempt the whole pipeline.
  if (fromIndex === -1) return true;
  const dealIndex = dealStages.findIndex((stage) => stage.value === deal.stage);
  if (dealIndex === -1) return false;
  return dealIndex >= fromIndex;
};

/**
 * The single next action/date/owner datum. Cards (issue #101) and the dense
 * list (issue #92) both render from this — there is no second computation.
 */
export const getDealNextAction = (
  deal: DealRecord,
  options: NextActionOptions,
): DealNextAction => {
  const label =
    typeof deal.next_action === "string" && deal.next_action.trim() !== ""
      ? deal.next_action.trim()
      : null;
  const date = deal.next_action_date ?? null;
  const ownerId = deal.next_action_owner_id ?? deal.sales_id ?? null;
  const ownerIsDealOwner = deal.next_action_owner_id == null;
  const remaining = daysUntil(date, options.today);

  const status: NextActionStatus = !label
    ? isNextActionExpected(deal, options)
      ? "missing"
      : "not-expected"
    : remaining === null
      ? "undated"
      : remaining < 0
        ? "overdue"
        : remaining === 0
          ? "today"
          : "upcoming";

  return {
    label,
    date,
    ownerId,
    ownerIsDealOwner,
    status,
    daysUntil: remaining,
  };
};

/* -------------------------------------------------------------------------- */
/* Activity & inactivity alert (issue #94)                                     */
/* -------------------------------------------------------------------------- */

/** Default delay before an open deal is flagged as dormant. Configurable. */
export const DEFAULT_INACTIVITY_ALERT_DAYS = 14;

export type ActivitySource =
  /** A real activity log timestamp — only once the column exists. */
  | "last_activity_at"
  /** Fallback: last write on the deal. Weaker, and labelled as such. */
  | "updated_at"
  | "created_at"
  | "none";

export interface DealActivity {
  date: string | null;
  source: ActivitySource;
  /** Null when no date could be resolved at all. */
  daysSinceActivity: number | null;
  /** True only when we know the deal is open *and* past the threshold. */
  isStale: boolean;
}

export interface ActivityOptions {
  pipelineStatuses: string[];
  thresholdDays: number;
  today: Date;
}

/**
 * Resolves the last activity date, most trustworthy source first, and reports
 * which source was used. The UI labels the value accordingly ("dernière
 * activité" vs "dernière modification") instead of passing off a write
 * timestamp as genuine commercial activity.
 */
export const getDealActivity = (
  deal: DealRecord,
  { pipelineStatuses, thresholdDays, today }: ActivityOptions,
): DealActivity => {
  const candidates: {
    value: string | null | undefined;
    source: ActivitySource;
  }[] = [
    { value: deal.last_activity_at, source: "last_activity_at" },
    { value: deal.updated_at, source: "updated_at" },
    { value: deal.created_at, source: "created_at" },
  ];
  const resolved = candidates.find(
    (candidate) => daysSince(candidate.value, today) !== null,
  );

  if (!resolved?.value) {
    return {
      date: null,
      source: "none",
      daysSinceActivity: null,
      isStale: false,
    };
  }

  const elapsed = daysSince(resolved.value, today);
  return {
    date: resolved.value,
    source: resolved.source,
    daysSinceActivity: elapsed,
    isStale:
      isOpenStage(deal.stage, pipelineStatuses) &&
      elapsed !== null &&
      elapsed >= thresholdDays,
  };
};

/* -------------------------------------------------------------------------- */
/* Opportunity type                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Growth source of the opportunity, from the real `deals.opportunity_type`
 * column (nouveau client / extension / renouvellement).
 *
 * The speculative `deal_type` this adapter used to prefer never existed; the
 * column shipped as `opportunity_type`. `company_type` stays as the fallback
 * but means something different — it routes a deal to a pipeline view — so it
 * is only used when no growth source has been set, to keep the facet usable on
 * the rows that predate the column.
 */
export const getDealType = (deal: DealRecord): string | null => {
  const value = deal.opportunity_type ?? deal.company_type ?? null;
  return typeof value === "string" && value.trim() !== "" ? value : null;
};

export const getDealTypeLabel = (
  deal: DealRecord,
  choices: LabeledValue[],
): string | null => {
  const value = getDealType(deal);
  if (!value) return null;
  return choices.find((choice) => choice.value === value)?.label ?? value;
};
