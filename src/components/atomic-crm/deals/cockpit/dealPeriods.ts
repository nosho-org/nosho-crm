import {
  addMonths,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "date-fns";

import { parseISODateLocal, toISODateString } from "./dealDates";

/**
 * ---------------------------------------------------------------------------
 * Period model
 * ---------------------------------------------------------------------------
 * Every period in the cockpit is a range over `expected_closing_date`, and
 * nothing else. That is the only date that answers "when could this revenue
 * land", which is what the banner and the forecast are for.
 *
 * In particular the signed figure is *not* bucketed by `won_at`: mixing two
 * date axes in one banner would make the columns non-comparable. The UI states
 * the axis explicitly next to the period selector.
 */

export type PeriodId =
  | "current-month"
  | "next-month"
  | "current-quarter"
  | "next-quarter"
  | "current-semester"
  | "current-year"
  | "all";

export type BucketGranularity = "month" | "quarter";

export interface ResolvedPeriod {
  id: PeriodId;
  label: string;
  /** Null on "all", which applies no bound. */
  start: Date | null;
  end: Date | null;
}

export const DEFAULT_PERIOD_ID: PeriodId = "current-quarter";

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

const monthLabel = (date: Date): string =>
  capitalize(
    new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(date),
  );

const quarterLabel = (date: Date): string =>
  `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;

const semesterLabel = (date: Date): string =>
  `S${date.getMonth() < 6 ? 1 : 2} ${date.getFullYear()}`;

const startOfSemester = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);

const endOfSemester = (date: Date): Date =>
  endOfMonth(new Date(date.getFullYear(), date.getMonth() < 6 ? 5 : 11, 1));

export const resolvePeriod = (id: PeriodId, now: Date): ResolvedPeriod => {
  switch (id) {
    case "current-month":
      return {
        id,
        label: `Mois en cours (${monthLabel(now)})`,
        start: startOfMonth(now),
        end: endOfMonth(now),
      };
    case "next-month": {
      const next = addMonths(now, 1);
      return {
        id,
        label: `Mois prochain (${monthLabel(next)})`,
        start: startOfMonth(next),
        end: endOfMonth(next),
      };
    }
    case "current-quarter":
      return {
        id,
        label: `Trimestre en cours (${quarterLabel(now)})`,
        start: startOfQuarter(now),
        end: endOfQuarter(now),
      };
    case "next-quarter": {
      const next = addMonths(now, 3);
      return {
        id,
        label: `Trimestre prochain (${quarterLabel(next)})`,
        start: startOfQuarter(next),
        end: endOfQuarter(next),
      };
    }
    case "current-semester":
      return {
        id,
        label: `Semestre en cours (${semesterLabel(now)})`,
        start: startOfSemester(now),
        end: endOfSemester(now),
      };
    case "current-year":
      return {
        id,
        label: `Année en cours (${now.getFullYear()})`,
        start: startOfYear(now),
        end: endOfYear(now),
      };
    case "all":
    default:
      return { id: "all", label: "Toutes périodes", start: null, end: null };
  }
};

export const PERIOD_IDS: PeriodId[] = [
  "current-month",
  "next-month",
  "current-quarter",
  "next-quarter",
  "current-semester",
  "current-year",
  "all",
];

export const getPeriodChoices = (
  now: Date,
): { value: PeriodId; label: string }[] =>
  PERIOD_IDS.map((id) => ({ value: id, label: resolvePeriod(id, now).label }));

/**
 * PostgREST filter for the list query. Bounds are inclusive on both ends and
 * expressed as local `YYYY-MM-DD`, matching the `date` column.
 *
 * Deals with a null `expected_closing_date` are excluded by these bounds. That
 * is intentional — they cannot be placed on a timeline — and the cockpit
 * reports how many were left out instead of hiding them silently.
 */
export const getPeriodFilter = (
  period: ResolvedPeriod,
): Record<string, string> => {
  if (!period.start || !period.end) return {};
  return {
    "expected_closing_date@gte": toISODateString(period.start),
    "expected_closing_date@lte": toISODateString(period.end),
  };
};

export const isWithinPeriod = (
  value: string | null | undefined,
  period: ResolvedPeriod,
): boolean => {
  const date = parseISODateLocal(value);
  if (!date) return false;
  if (period.start && date < period.start) return false;
  if (period.end && date > period.end) return false;
  return true;
};

export interface PeriodBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

/** Longest span the forecast will enumerate, to keep the table readable. */
const MAX_BUCKETS = 12;

/**
 * Splits a period into forecast columns. "Toutes périodes" has no bounds, so it
 * falls back to the current year — the table says which range it covers, and
 * `computeForecast` counts whatever falls outside it.
 */
export const getPeriodBuckets = (
  period: ResolvedPeriod,
  granularity: BucketGranularity,
  now: Date,
): PeriodBucket[] => {
  const start = period.start ?? startOfYear(now);
  const end = period.end ?? endOfYear(now);
  const buckets: PeriodBucket[] = [];
  const step = granularity === "month" ? 1 : 3;

  let cursor =
    granularity === "month" ? startOfMonth(start) : startOfQuarter(start);
  while (cursor <= end && buckets.length < MAX_BUCKETS) {
    const bucketEnd =
      granularity === "month" ? endOfMonth(cursor) : endOfQuarter(cursor);
    buckets.push({
      key: toISODateString(cursor),
      label:
        granularity === "month" ? monthLabel(cursor) : quarterLabel(cursor),
      start: cursor,
      end: bucketEnd,
    });
    cursor = addMonths(cursor, step);
  }

  return buckets;
};
