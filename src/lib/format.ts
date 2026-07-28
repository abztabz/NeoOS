export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Money in the currency it is actually denominated in.
 *
 * `formatMoney` assumes USD, which is fine for the demo universe and wrong for
 * a household whose gold is priced in AED and whose house is priced in NPR.
 * Anywhere a currency is known, use this.
 */
export function formatCurrency(
  value: number,
  currency: string,
  maximumFractionDigits = 0,
): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits,
    }).format(value);
  } catch {
    // An unrecognised code is shown beside the number rather than swallowed.
    return `${value.toLocaleString("en-US", { maximumFractionDigits })} ${currency}`;
  }
}

export function formatRange(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null || high == null) return "Not modeled";
  return `${formatMoney(low)}–${formatMoney(high)}`;
}

export function formatAsOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}
