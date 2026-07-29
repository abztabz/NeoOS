/**
 * Gold metal value — what the metal in a holding is worth, before anybody's
 * margin.
 *
 * This is deliberately **not** the Dubai Jewellery Group suggested retail rate.
 * It is the market-linked intrinsic value of the metal, converted from XAU/USD
 * into AED per gram. The two differ by making charges, retailer premium, VAT
 * and the dealer buyback spread, and on jewellery that gap is large. Presenting
 * one as the other would misstate what this household could actually realise.
 *
 * The distinction is carried in the naming everywhere — "Metal Value", never
 * "rate" — so a reader is never invited to treat it as a shop price.
 */

/** Definitional, not measured: a troy ounce is exactly this many grams. */
export const TROY_OUNCE_GRAMS = 31.1034768;

/**
 * The UAE dirham's documented peg to the US dollar.
 *
 * In force since 1997 and published by the UAE Central Bank. It is a *policy
 * rate*, not an observed quote, and it is labelled as such wherever the derived
 * value is shown. On any ordinary day the distinction is invisible; on the day
 * it stops being true it is the whole story.
 */
export const USD_AED = 3.6725;

/**
 * Purity factors.
 *
 * Applied to the pure-metal value independently — 22K is **never** derived from
 * the 24K figure. Chaining them would mean a rounding or error in 24K silently
 * propagating into 22K, and the two would stop being independently checkable.
 *
 * 0.999 is the fineness of what is sold as 24K (three nines), rather than a
 * theoretical 1.0: no refined bar is perfectly pure.
 */
export const PURITY_24K = 0.999;
export const PURITY_22K = 0.916;

/**
 * Stamped onto every stored valuation.
 *
 * If a constant or a formula here ever changes, stored values carrying the old
 * version stay interpretable instead of becoming silently incomparable with
 * new ones.
 */
export const CALCULATION_VERSION = "gold-metal-value/1.0.0";

export const METAL_VALUE_EXPLANATION =
  "Market-linked gold value converted from live XAU/USD into AED per gram. Excludes making charges, retailer premiums, VAT and dealer buyback spread. It is not the Dubai Jewellery Group suggested retail rate.";

export const GOLD_UNAVAILABLE_MESSAGE = "Gold price temporarily unavailable.";

/* ---------------- the calculation ---------------- */

/**
 * Pure gold, AED per gram, from XAU/USD per troy ounce.
 *
 * One multiplication and one division, kept in its own function so the three
 * karat figures cannot drift apart by being computed slightly differently in
 * three places.
 */
export function pureGoldAedPerGram(xauUsdPerTroyOunce: number): number {
  return (xauUsdPerTroyOunce * USD_AED) / TROY_OUNCE_GRAMS;
}

export interface MetalValues {
  pureAedPerGram: number;
  aedPerGram24K: number;
  aedPerGram22K: number;
  calculationVersion: string;
  /** The inputs, retained so a displayed figure can be recomputed by hand. */
  inputs: {
    xauUsdPerTroyOunce: number;
    usdAed: number;
    troyOunceGrams: number;
    purity24K: number;
    purity22K: number;
  };
}

export function computeMetalValues(xauUsdPerTroyOunce: number): MetalValues {
  const pure = pureGoldAedPerGram(xauUsdPerTroyOunce);
  return {
    pureAedPerGram: pure,
    // Both from `pure`, independently. Never 22K from 24K.
    aedPerGram24K: pure * PURITY_24K,
    aedPerGram22K: pure * PURITY_22K,
    calculationVersion: CALCULATION_VERSION,
    inputs: {
      xauUsdPerTroyOunce,
      usdAed: USD_AED,
      troyOunceGrams: TROY_OUNCE_GRAMS,
      purity24K: PURITY_24K,
      purity22K: PURITY_22K,
    },
  };
}

/* ---------------- freshness ---------------- */

export const DELAYED_AFTER_MINUTES = 30;
export const STALE_AFTER_MINUTES = 6 * 60;

export const goldStatuses = ["live", "delayed", "stale", "unavailable"] as const;
export type GoldStatus = (typeof goldStatuses)[number];

export const goldStatusLabels: Record<GoldStatus, string> = {
  live: "Live",
  delayed: "Delayed",
  stale: "Stale",
  unavailable: "Unavailable",
};

/**
 * Age a quote by the clock, never by what the source claimed when it arrived.
 *
 * Applied on read rather than on write, so a cached value degrades by sitting
 * still. Trusting the status stamped at fetch time is how a figure retrieved at
 * 09:00 is still labelled "Live" at 16:00.
 */
export function classifyGoldStatus(sourceUpdatedAt: string, now: Date): GoldStatus {
  const struck = Date.parse(sourceUpdatedAt);
  if (Number.isNaN(struck)) return "unavailable";

  const ageMinutes = (now.getTime() - struck) / 60_000;
  // A future-dated timestamp is a clock error somewhere. Treating it as fresh
  // would produce a value that never ages, so it is refused instead.
  if (ageMinutes < -5) return "unavailable";
  if (ageMinutes > STALE_AFTER_MINUTES) return "stale";
  if (ageMinutes > DELAYED_AFTER_MINUTES) return "delayed";
  return "live";
}

/* ---------------- valuing a holding ---------------- */

export const goldPurities = ["24K", "22K"] as const;
export type GoldPurity = (typeof goldPurities)[number];

export type HoldingValuation =
  | {
      ok: true;
      valueAed: number;
      grams: number;
      purity: GoldPurity;
      aedPerGram: number;
      calculationVersion: string;
    }
  | { ok: false; reason: string };

/**
 * Value one gold holding at the metal value for its own purity.
 *
 * Karat-matched, always. Valuing 22K at the 24K figure overstates a holding by
 * roughly 9% and the result looks entirely reasonable, which is what makes it
 * the most dangerous arithmetic error available here.
 *
 * What this deliberately does not do is add back historical making charges.
 * What somebody paid a jeweller years ago is a fact about the past, not part of
 * what the metal is worth now, and including it would inflate the position by
 * money that cannot be recovered.
 */
export function valueGoldHolding(
  holding: { weightGrams: number | null; purity: GoldPurity | null; ownershipPercent?: number | null },
  values: MetalValues | null,
): HoldingValuation {
  if (values === null) return { ok: false, reason: GOLD_UNAVAILABLE_MESSAGE };
  if (!holding.purity) {
    return { ok: false, reason: "Gold valuation unavailable — select 24K or 22K purity." };
  }
  if (holding.weightGrams === null || !(holding.weightGrams > 0)) {
    return { ok: false, reason: "Gold valuation unavailable — enter the gold weight in grams." };
  }

  const aedPerGram = holding.purity === "24K" ? values.aedPerGram24K : values.aedPerGram22K;
  const ownership = holding.ownershipPercent ?? 1;

  return {
    ok: true,
    grams: holding.weightGrams,
    purity: holding.purity,
    aedPerGram,
    valueAed: holding.weightGrams * aedPerGram * ownership,
    calculationVersion: values.calculationVersion,
  };
}

/**
 * What a metal value is not.
 *
 * Shown wherever a holding total appears. A number this large invites being
 * read as "what I would get", and the gap between metal value and buyback is
 * exactly where that reading goes wrong.
 */
export const NOT_A_RESALE_QUOTE =
  "Metal value at the current market price. Not a guaranteed resale value — a buyer sets their own spread.";
