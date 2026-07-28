import { z } from "zod";

/**
 * How a number came to be a number.
 *
 * The distinction this enforces: a price somebody typed and a price a venue
 * struck are not the same claim, and once they are rendered in the same font
 * they become indistinguishable. A house valued by its owner at 25.2 million
 * NPR is a real and useful figure; describing it as a market price would be a
 * lie about what kind of thing it is.
 *
 * So the method travels with the value everywhere, and the vocabulary for
 * describing a manual estimate never includes "live", "verified" or "market".
 */

export const valuationMethods = [
  "market_price",
  "reference_price",
  "manual_estimate",
  "appraisal",
  "cost_basis",
  "unpriced",
] as const;
export type ValuationMethod = (typeof valuationMethods)[number];

export const valuationMethodLabels: Record<ValuationMethod, string> = {
  market_price: "Market price",
  reference_price: "Reference price",
  manual_estimate: "Manual estimate",
  appraisal: "Appraisal",
  cost_basis: "Cost basis",
  unpriced: "Not priced",
};

export const valuationMethodMeaning: Record<ValuationMethod, string> = {
  market_price:
    "A price struck on a venue for this instrument, retrieved from a named source and validated. The only method that may be described as a market price.",
  reference_price:
    "A benchmark for the underlying, not a quote for this specific holding. Gold per gram is a reference: it prices the metal, not the bar in your safe, and not what a dealer would pay for it.",
  manual_estimate:
    "Somebody's judgement, recorded with a date and a source. Useful, and never verified. Property and unitemized holdings sit here.",
  appraisal: "A professional valuation, with the appraiser and date recorded.",
  cost_basis: "What was paid. A fact about the past, not about what it is worth now.",
  unpriced:
    "Not enough is known to value this at all — a missing quantity, purity, or identity. Reported as unpriced rather than estimated.",
};

/** Methods that may ever be described to the user as verified market data. */
const MARKET_METHODS: ValuationMethod[] = ["market_price"];

export function isMarketPriced(method: ValuationMethod): boolean {
  return MARKET_METHODS.includes(method);
}

/**
 * Guard against the specific mislabelling this module exists to prevent.
 *
 * Called by display code before applying "live" or "verified" wording. Exists
 * as a function rather than a convention so a test can hold it.
 */
export function mayDescribeAsLive(method: ValuationMethod): boolean {
  return isMarketPriced(method);
}

export const valuationRecordSchema = z.object({
  method: z.enum(valuationMethods),
  value: z.number().finite(),
  currency: z.string().length(3),
  valuedAt: z.iso.datetime({ offset: true }),
  sourceId: z.string().optional(),
  sourceName: z.string().optional(),
  sourceTimestamp: z.iso.datetime({ offset: true }).optional(),
  confidence: z.enum(["high", "medium", "low"]),
  freshnessStatus: z.enum(["fresh", "stale", "expired", "unknown"]),
});
export type ValuationRecord = z.infer<typeof valuationRecordSchema>;

/**
 * The valuation method an asset kind gets by default.
 *
 * Property is the interesting one: it defaults to `manual_estimate` and can be
 * upgraded to `appraisal`, but there is no path to `market_price` because no
 * market prices a specific house. That ceiling is permanent and is not a gap
 * waiting to be closed.
 */
export function defaultMethodFor(assetKind: string, isItemized: boolean): ValuationMethod {
  switch (assetKind) {
    case "listed_equity":
    case "fund":
      // Only once the specific instrument is known. A lump sum labelled
      // "stocks" cannot be market priced, because nothing identifies what to
      // price.
      return isItemized ? "market_price" : "manual_estimate";
    case "metals":
      return "reference_price";
    case "real_estate":
      return "manual_estimate";
    case "cash":
      return "cost_basis";
    default:
      return isItemized ? "manual_estimate" : "unpriced";
  }
}

/** A manual valuation, built so it cannot accidentally claim to be more. */
export function manualEstimate(input: {
  value: number;
  currency: string;
  valuedAt: string;
  sourceName?: string;
  confidence?: "high" | "medium" | "low";
}): ValuationRecord {
  return {
    method: "manual_estimate",
    value: input.value,
    currency: input.currency.toUpperCase(),
    valuedAt: input.valuedAt,
    sourceName: input.sourceName ?? "Owner estimate",
    // Manual figures default to low confidence. An owner's estimate of their
    // own house is informed and is not an appraisal.
    confidence: input.confidence ?? "low",
    // Freshness of a manual figure is about the date it describes, and nothing
    // refreshes it except the owner revisiting it.
    freshnessStatus: "unknown",
  };
}

export function unpriced(reason: string): { method: ValuationMethod; reason: string } {
  return { method: "unpriced", reason };
}
