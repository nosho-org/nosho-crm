/**
 * Money formatting helpers (NOS-807/808).
 *
 * Amounts are stored in euros and rendered in euros. Nothing here converts
 * between currencies — `currency` only selects the symbol used for display.
 */

export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_LOCALE = "fr-FR";

const baseOptions: Intl.NumberFormatOptions = {
  style: "currency",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
};

/** Full amount, e.g. `12 000 €`. */
export const formatCurrency = (
  amount: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  options: Intl.NumberFormatOptions = {},
) => {
  if (amount == null || Number.isNaN(amount)) return "–";
  return amount.toLocaleString(DEFAULT_LOCALE, {
    ...baseOptions,
    currency,
    ...options,
  });
};

/** Shortened amount for dense UI (cards, column headers), e.g. `12 k€`. */
export const formatCurrencyCompact = (
  amount: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
) => formatCurrency(amount, currency, { notation: "compact" });

/**
 * Monthly Recurring Revenue derived from an ARR.
 *
 * The database computes the same value in the generated `deals.mrr` column;
 * this mirrors it for records that have not been reloaded yet, and for the
 * FakeRest provider.
 */
export const arrToMrr = (arr: number | null | undefined) => {
  if (arr == null || Number.isNaN(arr)) return null;
  return Math.round((arr / 12) * 100) / 100;
};

/** `Intl` options for a euro amount, for components that take an options bag. */
export const currencyFieldOptions = (
  currency: string = DEFAULT_CURRENCY,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormatOptions => ({ ...baseOptions, currency, ...options });

/** The narrow symbol of a currency, e.g. `€`, for use in labels. */
export const currencySymbol = (currency: string = DEFAULT_CURRENCY) =>
  new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value ?? currency;
