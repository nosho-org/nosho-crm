import { format } from "date-fns";
import { toSlug } from "@/lib/toSlug";

import type { ConfigurationContextValue } from "../root/ConfigurationContext";
import type { CustomView } from "../root/ConfigurationContext";
import type {
  CompanyType,
  DealPriority,
  DealPriorityValue,
  EstablishmentType,
} from "../types";
import { defaultDealPriorities } from "../root/defaultConfiguration";

export function getDefaultDealStage(
  dealStages: ConfigurationContextValue["dealStages"],
  visibleStages?: string[],
) {
  return (
    visibleStages?.find((stage) =>
      dealStages.some((dealStage) => dealStage.value === stage),
    ) ?? dealStages[0]?.value
  );
}

/**
 * Choices for the "Vue" menu (NOS-801).
 *
 * Two custom views that resolve to the same company type — or a view whose
 * label matches a configured company type — used to produce visually identical
 * entries, because only the company types were deduplicated and only by value.
 * Entries are now unique on both their value and their normalised label, with
 * the custom views taking precedence since they carry the wording the user chose.
 */
export function getCompanyTypeChoices(
  companyTypes: ConfigurationContextValue["companyTypes"],
  customViews: ConfigurationContextValue["customViews"],
) {
  const choices: { value: string; label: string }[] = [];
  const seenValues = new Set<string>();
  const seenLabels = new Set<string>();

  const push = (value: string, label: string) => {
    const labelKey = toSlug(label);
    if (!value || seenValues.has(value) || seenLabels.has(labelKey)) return;
    choices.push({ value, label });
    seenValues.add(value);
    seenLabels.add(labelKey);
  };

  customViews.forEach((view) => {
    push(
      getCustomViewCompanyType(view, customViews),
      view.label || view.companyType,
    );
  });
  companyTypes.forEach((type) => push(type.value, type.label));

  return choices;
}

export function getCustomViewCompanyType(
  view: CustomView,
  customViews: ConfigurationContextValue["customViews"],
) {
  const labelSlug = toSlug(view.label);
  const duplicateCompanyType =
    customViews.filter(
      (candidate) => candidate.companyType === view.companyType,
    ).length > 1;
  const needsDedicatedLeadView =
    /^leads?-/.test(labelSlug) ||
    labelSlug === "lead" ||
    labelSlug === "referral" ||
    labelSlug === "refferal";

  if (labelSlug && (duplicateCompanyType || needsDedicatedLeadView)) {
    return labelSlug;
  }

  return view.companyType;
}

/**
 * Slugs that are known to designate non-commercial objects (NOS-797).
 *
 * The authoritative source is the `commercial` flag on the configured company
 * types. This list is only a safety net for custom views created before that
 * flag existed, whose slug was derived from a free-text label — so the spelling
 * variants that exist in production are all covered.
 */
const NON_COMMERCIAL_SLUGS = new Set([
  "investisseur",
  "investisseurs",
  "partenaire",
  "partenaires",
  "partenariat",
  "partenariats",
  "ressource",
  "ressources",
  "presse",
  "leads-santexpo",
  "lead-santexpo",
  "santexpo",
  "logiciels-brique",
  "logiciel-brique",
  "logiciels-briques",
  "logiciel-briques",
]);

/**
 * True when a company type designates a non-commercial object: investors,
 * partnerships, resources, press, Santexpo leads and software bricks.
 *
 * These keep their own views and their data, but they never show up in the
 * Opportunités board/list, nor in any ARR aggregate.
 */
export function isNonCommercialCompanyType(
  companyType: string | null | undefined,
  companyTypes: CompanyType[],
): boolean {
  if (!companyType) return false; // untyped deals are plain opportunities
  const configured = companyTypes.find((type) => type.value === companyType);
  if (configured?.commercial === false) return true;
  // An explicit `commercial: true` overrides the built-in list, so an admin can
  // reclaim a slug without renaming the view.
  if (configured?.commercial === true) return false;
  return NON_COMMERCIAL_SLUGS.has(companyType);
}

/** Every non-commercial slug currently in play, from the config and the views. */
export function getNonCommercialCompanyTypes(
  companyTypes: CompanyType[],
  customViews: CustomView[],
): string[] {
  const candidates = new Set<string>([
    ...companyTypes.map((type) => type.value),
    ...customViews.map((view) => getCustomViewCompanyType(view, customViews)),
  ]);
  return [...candidates].filter((value) =>
    isNonCommercialCompanyType(value, companyTypes),
  );
}

/**
 * PostgREST filter restricting a deal list to the commercial pipeline.
 *
 * Deals with no company type are plain opportunities and always belong here;
 * the others are kept unless their type is flagged non-commercial.
 *
 * Filtering happens on `deals_summary.company_type_key`, which is
 * `coalesce(company_type, '')`. Filtering the raw column would silently drop
 * every untyped deal, because PostgREST evaluates `not.in.(…)` as NULL — and
 * therefore false — when the column itself is NULL.
 */
export function getCommercialDealsFilter(
  companyTypes: CompanyType[],
  customViews: CustomView[],
): Record<string, string> {
  const excluded = getNonCommercialCompanyTypes(companyTypes, customViews);
  if (excluded.length === 0) return {};
  return {
    "company_type_key@not.in": `(${excluded.join(",")})`,
  };
}

/**
 * Resolve a stored priority slug to its configured choice.
 *
 * Returns `null` when the value is missing or unknown — the "Priorité à
 * définir" case the spec asks for. It used to fall back to `list[0]`, which was
 * survivable while the list started at "Normal" but became actively wrong once
 * P0/P1/P2 reordered it most-urgent-first: every unset deal would have been
 * displayed as P0 Critique.
 */
export function getDealPriority(
  value: string | null | undefined,
  priorities: DealPriority[] = defaultDealPriorities,
): DealPriority | null {
  if (!value) return null;
  const list = priorities.length ? priorities : defaultDealPriorities;
  return list.find((priority) => priority.value === value) ?? null;
}

/**
 * Sort comparator, most urgent first. An unset priority weighs less than any
 * configured one, so undefined deals sink to the bottom rather than posing as
 * the highest priority.
 */
export function compareDealPriority(
  a: string | null | undefined,
  b: string | null | undefined,
  priorities: DealPriority[] = defaultDealPriorities,
): number {
  return (
    (getDealPriority(b, priorities)?.weight ?? -1) -
    (getDealPriority(a, priorities)?.weight ?? -1)
  );
}

export function isDealPriorityValue(
  value: unknown,
): value is DealPriorityValue {
  return value === "normal" || value === "important" || value === "urgent";
}

/**
 * ARR suggested by an establishment type (NOS-810), or null when the type is
 * unknown or has no tier configured.
 */
export function getSuggestedArr(
  establishmentType: string | null | undefined,
  establishmentTypes: EstablishmentType[],
): number | null {
  if (!establishmentType) return null;
  const tier = establishmentTypes.find(
    (type) => type.value === establishmentType,
  );
  return typeof tier?.arr === "number" ? tier.arr : null;
}

/**
 * Decide what a deal's ARR should become when the establishment type changes
 * (NOS-811/812).
 *
 * The prefill is a suggestion, never a correction: as soon as a value was typed
 * by hand — or simply is a non-zero amount that predates the flag — it wins and
 * is returned untouched.
 */
export function resolvePrefilledArr({
  currentArr,
  isManual,
  suggestedArr,
}: {
  currentArr: number | null | undefined;
  isManual: boolean | undefined;
  suggestedArr: number | null;
}): { arr: number | null | undefined; changed: boolean } {
  if (isManual) return { arr: currentArr, changed: false };
  if (currentArr != null && currentArr !== 0) {
    return { arr: currentArr, changed: false };
  }
  if (suggestedArr == null) return { arr: currentArr, changed: false };
  return { arr: suggestedArr, changed: true };
}

/** The stage that means "the contract is signed". */
export const SIGNED_DEAL_STAGE = "closed-won";

/** Today, in the `YYYY-MM-DD` form the date columns expect. */
export function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Pipeline dates set when a deal is created (NOS-805).
 *
 * A deal entering the board today entered the pipeline today, and one created
 * directly in the signed stage was signed today.
 */
export function withDealCreateDates<T extends Record<string, any>>(
  data: T,
  today: string = todayISODate(),
): T {
  const next: Record<string, any> = { ...data };
  if (next.entered_at == null) next.entered_at = today;
  if (next.stage === SIGNED_DEAL_STAGE && next.won_at == null) {
    next.won_at = today;
  }
  return next as T;
}

/**
 * Pipeline dates maintained on update (NOS-805).
 *
 * Reaching the signed stage stamps the signature date, unless one is already
 * recorded. Leaving that stage never clears it: an existing date is a fact, and
 * this migration is not in the business of erasing history. Dragging a card on
 * the Kanban board goes through here too, since it issues a plain update.
 */
export function withDealUpdateDates<T extends Record<string, any>>(
  data: T,
  previousData?: Record<string, any>,
  today: string = todayISODate(),
): T {
  const nextStage = data.stage ?? previousData?.stage;
  if (nextStage !== SIGNED_DEAL_STAGE) return data;
  if (previousData?.stage === SIGNED_DEAL_STAGE) return data;
  if (data.won_at != null || previousData?.won_at != null) return data;
  return { ...data, won_at: today };
}

export function getRelativeTimeString(dateString: string): string {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = date.getTime() - today.getTime();
  const unitDiff = Math.round(diff / (1000 * 60 * 60 * 24));

  // Check if the date is more than one week old
  if (Math.abs(unitDiff) > 7) {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
    }).format(date);
  }

  // Intl.RelativeTimeFormat for dates within the last week
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return ucFirst(rtf.format(unitDiff, "day"));
}

function ucFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const isoDateStringRegex = /^\d{4}-\d{2}-\d{2}$/;

export function formatISODateString(dateString: string | null | undefined) {
  if (!dateString) {
    return "–";
  }
  // Handle both YYYY-MM-DD and full ISO timestamps (e.g. 2025-03-15T00:00:00.000Z)
  const normalizedDate = dateString.split("T")[0];
  if (!isoDateStringRegex.test(normalizedDate)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }
  // Some browsers will consider a date in the format YYYY-MM-DD as UTC, which can cause off-by-one-day issues depending on the user's timezone.
  // To avoid this, we can parse the date components manually and create a date object in the local timezone.
  const [year, month, day] = normalizedDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return format(date, "PP");
}

/**
 * Format a task `due_date` for the read-only "Prochain meeting" line.
 *
 * Task due dates come in two shapes: a full `timestamptz` when the task was
 * created with a time, and a bare `YYYY-MM-DD` when it was postponed from the
 * task list. Only the first carries a meaningful time of day, so only the first
 * gets one displayed — showing "12:00 AM" for a date-only value would be a
 * fabricated detail.
 */
export function formatDealMeetingDate(
  dueDate: string | null | undefined,
): string {
  if (!dueDate) {
    return "–";
  }
  if (isoDateStringRegex.test(dueDate)) {
    return formatISODateString(dueDate);
  }

  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) {
    return "–";
  }

  return format(date, "PP · p");
}
