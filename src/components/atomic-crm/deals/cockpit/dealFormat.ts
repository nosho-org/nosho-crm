import { parseISODateLocal } from "./dealDates";

const LOCALE = "fr-FR";

/** Placeholder for a value the CRM does not have. Never a zero. */
export const UNKNOWN = "—";

export const formatAmount = (
  amount: number | null | undefined,
  currency: string,
): string => {
  if (amount == null || !Number.isFinite(amount)) return UNKNOWN;
  return amount.toLocaleString(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

/** Compact form for the banner headlines, e.g. "80 k€". */
export const formatCompactAmount = (
  amount: number | null | undefined,
  currency: string,
): string => {
  if (amount == null || !Number.isFinite(amount)) return UNKNOWN;
  return amount.toLocaleString(LOCALE, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
};

/** Ratio in [0, 1] to a rounded percentage. */
export const formatPercent = (ratio: number | null | undefined): string => {
  if (ratio == null || !Number.isFinite(ratio)) return UNKNOWN;
  return `${Math.round(ratio * 100)} %`;
};

/**
 * Goes through the same local-time parser as every computation, so a timestamp
 * is displayed on the day it happened locally — not on its UTC day.
 */
export const formatDate = (value: string | null | undefined): string => {
  const date = parseISODateLocal(value);
  if (!date) return UNKNOWN;
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
};

export const pluralize = (
  count: number,
  singular: string,
  plural = `${singular}s`,
): string => `${count} ${count > 1 ? plural : singular}`;

/** "il y a 3 jours" / "aujourd'hui" — for the last-activity column. */
export const formatDaysAgo = (days: number | null): string => {
  if (days == null) return UNKNOWN;
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
};

/** "dans 5 jours" / "en retard de 2 jours" — for the next action date. */
export const formatDaysUntil = (days: number | null): string => {
  if (days == null) return UNKNOWN;
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days > 1) return `dans ${days} jours`;
  const late = Math.abs(days);
  return late === 1 ? "en retard d'1 jour" : `en retard de ${late} jours`;
};
