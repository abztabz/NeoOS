import { z } from "zod";

/**
 * Gold price basis.
 *
 * "The gold price" is not one number. A London spot quote for unallocated
 * metal, a futures settlement, an ETF's net asset value, and a retail bar
 * price in Dubai can differ by several percent at the same instant, and they
 * carry different counterparty, storage, and delivery risks. Reporting one as
 * though it were another is a category error that looks like a rounding
 * difference — which is precisely why it needs to be stated explicitly rather
 * than assumed.
 *
 * NeoOS therefore never says "gold is at X". It says which basis, in which
 * currency, per which unit, from which source, at which time.
 */

export const goldBases = [
  "london_spot_unallocated",
  "futures_settlement",
  "etf_nav",
  "physical_allocated",
  "retail_physical",
] as const;
export type GoldBasis = (typeof goldBases)[number];

export const goldBasisLabels: Record<GoldBasis, string> = {
  london_spot_unallocated: "London spot, unallocated",
  futures_settlement: "Futures settlement",
  etf_nav: "ETF net asset value",
  physical_allocated: "Allocated physical, vaulted",
  retail_physical: "Retail physical",
};

export const goldBasisNotes: Record<GoldBasis, string> = {
  london_spot_unallocated:
    "The over-the-counter benchmark for unallocated metal. It is a claim on a bullion bank, not on a specific bar, and carries that counterparty exposure.",
  futures_settlement:
    "A dated contract, not spot. It embeds financing cost and time to delivery, so it is not interchangeable with a spot quote.",
  etf_nav:
    "The fund's own valuation of its holdings, after fees. It tracks metal but is a security with a manager, a custodian, and an expense ratio.",
  physical_allocated:
    "Specific bars held in a named account. It closes the counterparty gap and opens a storage and insurance cost.",
  retail_physical:
    "What a person actually pays at a dealer, including premium over spot. Usually the only basis at which an individual can genuinely transact, and usually the one omitted from analysis.",
};

/** The unit NeoOS states gold in. Everything converts to this before comparison. */
export const CANONICAL_GOLD_UNIT = "troy_ounce" as const;

/**
 * Exact conversion factors. These are definitional constants, not measurements:
 * a troy ounce is exactly 31.1034768 grams by international agreement.
 */
export const GRAMS_PER_TROY_OUNCE = 31.1034768;
export const TROY_OUNCES_PER_KILOGRAM = 1000 / GRAMS_PER_TROY_OUNCE;

export const goldUnits = ["troy_ounce", "gram", "kilogram", "tola"] as const;
export type GoldUnit = (typeof goldUnits)[number];

/** One tola = 11.6638038 grams, the standard used across the Gulf and South Asia. */
export const GRAMS_PER_TOLA = 11.6638038;

const GRAMS_PER_UNIT: Record<GoldUnit, number> = {
  troy_ounce: GRAMS_PER_TROY_OUNCE,
  gram: 1,
  kilogram: 1000,
  tola: GRAMS_PER_TOLA,
};

/**
 * Convert a price expressed per one unit into price per troy ounce.
 *
 * Deliberately total and exact — no rounding, no tolerance. A silent unit
 * mismatch here would move a gold valuation by a factor of thirty-one, and it
 * would look entirely plausible on the way past.
 */
export function toPricePerTroyOunce(price: number, unit: GoldUnit): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Refusing to convert an implausible gold price: ${price}`);
  }
  return (price / GRAMS_PER_UNIT[unit]) * GRAMS_PER_TROY_OUNCE;
}

export const goldPriceBasisSchema = z.object({
  basis: z.enum(goldBases),
  currency: z.string().length(3),
  unit: z.literal(CANONICAL_GOLD_UNIT),
  /** Benchmark or venue the quote is struck against. */
  reference: z.string(),
  quotedAt: z.iso.datetime({ offset: true }),
  pricePerTroyOunce: z.number().positive(),
  /** Where the number came from. Always shown alongside the price. */
  sourceName: z.string(),
  /** Retail premium over spot, where the basis is retail. Never assumed. */
  premiumOverSpotPercent: z.number().nullable(),
});
export type GoldPriceBasis = z.infer<typeof goldPriceBasisSchema>;

/**
 * Gold's live-state ceiling.
 *
 * The two-input test for `live_verified` requires a current official filing and
 * a current price. Gold has no issuer and files nothing with any regulator, so
 * the filing half can never be satisfied — not because the evidence is missing
 * today, but because it does not exist and never will.
 *
 * `partial_live` is therefore gold's honest maximum, permanently. It is not a
 * gap waiting to be closed, and it should not be reported as one.
 */
export const GOLD_MAXIMUM_LIVE_STATE = "partial_live" as const;

export const GOLD_LIVE_STATE_REASON =
  "Gold has no issuer and files no accounts, so the official-filing half of live verification can never be satisfied. A current price with no filing is partial live evidence, and that is gold's permanent ceiling rather than a temporary shortfall.";

/**
 * Describe a quote in full, for display.
 *
 * Every gold price NeoOS renders goes through this, so the basis travels with
 * the number and cannot be separated from it by a layout change.
 */
export function describeGoldQuote(basis: GoldPriceBasis): string {
  const premium =
    basis.premiumOverSpotPercent !== null
      ? `, including a ${basis.premiumOverSpotPercent.toFixed(1)}% premium over spot`
      : "";
  return `${basis.pricePerTroyOunce.toFixed(2)} ${basis.currency} per troy ounce — ${goldBasisLabels[basis.basis]} (${basis.reference}), quoted ${basis.quotedAt} by ${basis.sourceName}${premium}.`;
}

/**
 * Whether two gold quotes describe the same thing well enough to compare.
 *
 * They do not if the basis differs. A spot quote and an ETF NAV moving apart is
 * information about fees and tracking, not a price discrepancy, and treating it
 * as a conflict would generate noise the user cannot act on.
 */
export function basesAreComparable(a: GoldPriceBasis, b: GoldPriceBasis): boolean {
  return a.basis === b.basis && a.currency === b.currency;
}
