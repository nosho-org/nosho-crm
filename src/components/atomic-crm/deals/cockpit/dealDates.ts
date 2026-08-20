import { differenceInCalendarDays } from "date-fns";

/**
 * `expected_closing_date`, `won_at` and `next_action_date` are Postgres `date`
 * columns, serialized as `YYYY-MM-DD`. `new Date("2026-08-20")` parses that as
 * UTC midnight, which lands on the previous day for any negative UTC offset —
 * so a deal closing on the 1st would be bucketed in the previous month for
 * users in the Americas.
 *
 * Every date read by the cockpit goes through this parser:
 *   - a `YYYY-MM-DD` value is built directly in the local timezone;
 *   - a full timestamp (`updated_at`, `created_at`, which are `timestamptz`)
 *     is converted from UTC to local time and then truncated, so a deal
 *     touched at 01:00 Paris time counts as touched today, not yesterday.
 *
 * The result is always local midnight, which is what day-granularity
 * comparisons need.
 */
export const parseISODateLocal = (
  value: string | null | undefined,
): Date | null => {
  if (!value) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return new Date(
    timestamp.getFullYear(),
    timestamp.getMonth(),
    timestamp.getDate(),
  );
};

/** Local-time `YYYY-MM-DD`, the format PostgREST expects for `date` columns. */
export const toISODateString = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/** Today at local midnight — the reference point for every "days since" count. */
export const startOfToday = (now: Date = new Date()): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate());

/**
 * Whole days from `value` to `reference`. Positive when `value` is in the past,
 * which is how both the inactivity alert and the overdue next action read.
 * Returns null when the date is missing or unparseable, so callers can render
 * an explicit "unknown" state instead of a misleading 0.
 */
export const daysSince = (
  value: string | null | undefined,
  reference: Date,
): number | null => {
  const date = parseISODateLocal(value);
  if (!date) return null;
  return differenceInCalendarDays(reference, date);
};

/** Whole days from `reference` to `value`. Negative when `value` is overdue. */
export const daysUntil = (
  value: string | null | undefined,
  reference: Date,
): number | null => {
  const date = parseISODateLocal(value);
  if (!date) return null;
  return differenceInCalendarDays(date, reference);
};
