import type { Identifier } from "ra-core";

import type { LabeledValue } from "../../types";
import type { Deal } from "../../types";
import { daysSince, daysUntil } from "./dealDates";

/**
 * ---------------------------------------------------------------------------
 * Rebase seam
 * ---------------------------------------------------------------------------
 * The `Socle pipeline/données` workspace owns the `deals` schema. The cockpit
 * only *reads* the columns below, and every read goes through this module.
 *
 * They are declared as optional here (rather than added to `types.ts`) so that:
 *   - this branch ships no migration and no new business field;
 *   - the day the columns land, the adapters below start returning real values
 *     with no change to any component;
 *   - rebasing means deleting this interface, not rewriting the UI.
 *
 * Until then every adapter returns an explicit "missing" marker, and the UI
 * renders an honest empty state instead of a fabricated value.
 */
export interface DealPipelineFields {
  /** Commercial priority — never a probability. See `dealWeighting.ts`. */
  priority: string | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_owner_id: Identifier | null;
  /** Per-deal win probability, in percent. */
  probability: number | null;
  /** Opportunity type (new business, extension, renewal…). */
  deal_type: string | null;
  /** Timestamp of the last logged activity (note, call, meeting…). */
  last_activity_at: string | null;
}

export type DealRecord = Deal & Partial<DealPipelineFields>;

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
 * No dedicated `deal_type` column exists yet, so the type facet reads the
 * `company_type` contract that already drives the custom views. When the
 * Socle workspace ships `deal_type`, this adapter picks it up first and the
 * filter, the column and the aggregates follow with no further change.
 */
export const getDealType = (deal: DealRecord): string | null => {
  const value = deal.deal_type ?? deal.company_type ?? null;
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
