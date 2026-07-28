import { z } from "zod";
import type { PriceFreshness } from "@/server/pricing/quote";

/**
 * Gold, priced the way the person holding it actually thinks about it.
 *
 * The subject holds physical gold in Nepal and the UAE and buys it in Dubai.
 * Nobody in that position asks what XAU/USD is doing per troy ounce. They ask
 * what 24K is per gram in dirhams today, and what 22K is, because those are the
 * two numbers on the board in every shop on the Gold Souk.
 *
 * So AED per gram, by karat, is the headline. XAU/USD is retained as the
 * underlying reference and shown in the evidence detail, where it belongs: it
 * is how the number was derived, not the number.
 *
 * The exclusions matter as much as the price. A reference value is not what a
 * shop will sell at or buy back at, and the gap — making charges, design,
 * stones, retail premium, VAT, dealer spread — is large enough on jewellery to
 * swamp any market move. Reporting a reference value as though it were a
 * realisable one would overstate this household's wealth by a material margin.
 */

/** Definitional, not measured: a troy ounce is exactly this by agreement. */
export const GRAMS_PER_TROY_OUNCE = 31.1034768;
/** The Gulf and South Asian standard. */
export const GRAMS_PER_TOLA = 11.6638038;

export const goldKarats = ["24K", "22K"] as const;
export type GoldKarat = (typeof goldKarats)[number];

/**
 * Purity by karat. 22K is 22 parts gold in 24, exactly.
 *
 * Used as a multiplier on the 24K price. Valuing 22K at the 24K price
 * overstates it by about 9%, which on this household's holding is thousands of
 * dirhams of imaginary wealth.
 */
export const GOLD_PURITY: Record<GoldKarat, number> = {
  "24K": 1,
  "22K": 22 / 24,
};

export const GOLD_REFERENCE_EXCLUSIONS =
  "Reference gold value only. Jewellery purchase and resale prices may differ because of making charges, premiums, taxes, and dealer spreads.";

/* ---------------- the price ---------------- */

export const uaeGoldPriceSchema = z.object({
  jurisdiction: z.literal("UAE"),
  currency: z.literal("AED"),
  unit: z.literal("gram"),
  karat: z.enum(goldKarats),
  pricePerGram: z.number().positive().finite(),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  underlyingReference: z.enum(["XAU_USD", "UAE_GOLD_BENCHMARK"]),
  underlyingPrice: z.number().positive().optional(),
  underlyingCurrency: z.string().length(3).optional(),
  underlyingUnit: z.string().optional(),
  fxRate: z.number().positive().optional(),
  fxPair: z.literal("USD/AED").optional(),
  quoteTimestamp: z.iso.datetime({ offset: true }),
  retrievedAt: z.iso.datetime({ offset: true }),
  freshness: z.custom<PriceFreshness>(),
});
export type UaeGoldPrice = z.infer<typeof uaeGoldPriceSchema>;

export type GoldPriceResult =
  | { ok: true; prices: Record<GoldKarat, UaeGoldPrice> }
  | { ok: false; reason: string };

/**
 * Derive AED-per-gram prices from a spot quote in USD per troy ounce.
 *
 * Both inputs must be verified. The USD/AED peg is well known and stable, and
 * NeoOS still will not hardcode it and present the result as a live quote — a
 * peg is a policy that has held, not a rate that was observed, and the two
 * become different on exactly the day it matters. A documented peg may be used
 * where source policy allows, and it is then labelled a policy fallback.
 */
export function deriveUaeGoldPrices(input: {
  goldSpotUsdPerTroyOunce: number;
  usdAedRate: number;
  spotSourceId: string;
  spotSourceName: string;
  quoteTimestamp: string;
  retrievedAt: string;
  freshness: PriceFreshness;
  fxIsPolicyFallback?: boolean;
}): GoldPriceResult {
  if (!Number.isFinite(input.goldSpotUsdPerTroyOunce) || input.goldSpotUsdPerTroyOunce <= 0) {
    return { ok: false, reason: "Gold valuation unavailable — no verified spot price." };
  }
  if (!Number.isFinite(input.usdAedRate) || input.usdAedRate <= 0) {
    return {
      ok: false,
      reason: "AED conversion unavailable — the required FX rate could not be verified.",
    };
  }

  const price24 = (input.goldSpotUsdPerTroyOunce / GRAMS_PER_TROY_OUNCE) * input.usdAedRate;

  const base = {
    jurisdiction: "UAE" as const,
    currency: "AED" as const,
    unit: "gram" as const,
    sourceId: input.spotSourceId,
    sourceName: input.fxIsPolicyFallback
      ? `${input.spotSourceName} (USD/AED taken from documented peg, not a live FX quote)`
      : input.spotSourceName,
    underlyingReference: "XAU_USD" as const,
    underlyingPrice: input.goldSpotUsdPerTroyOunce,
    underlyingCurrency: "USD",
    underlyingUnit: "troy_ounce",
    fxRate: input.usdAedRate,
    fxPair: "USD/AED" as const,
    quoteTimestamp: input.quoteTimestamp,
    retrievedAt: input.retrievedAt,
    freshness: input.freshness,
  };

  return {
    ok: true,
    prices: {
      "24K": { ...base, karat: "24K", pricePerGram: price24 },
      "22K": { ...base, karat: "22K", pricePerGram: price24 * GOLD_PURITY["22K"] },
    },
  };
}

/* ---------------- physical holdings ---------------- */

export const goldWeightUnits = ["gram", "tola", "troy_ounce"] as const;
export type GoldWeightUnit = (typeof goldWeightUnits)[number];

const GRAMS_PER_UNIT: Record<GoldWeightUnit, number> = {
  gram: 1,
  tola: GRAMS_PER_TOLA,
  troy_ounce: GRAMS_PER_TROY_OUNCE,
};

export interface PhysicalGoldPosition {
  id: string;
  portfolioId: string;
  location: "UAE" | "Nepal" | string;
  weight: number;
  weightUnit: GoldWeightUnit;
  karat: GoldKarat;
  /** 0–1. A jointly-held holding is not wholly the subject's. */
  ownershipPercent: number;
}

export function toGrams(weight: number, unit: GoldWeightUnit): number {
  return weight * GRAMS_PER_UNIT[unit];
}

export type GoldValuation =
  | { ok: true; valueAed: number; grams: number; pricePerGram: number; karat: GoldKarat }
  | { ok: false; reason: string };

/**
 * Value one physical holding.
 *
 * Karat-matched, always. Valuing 22K at the 24K price is the single most likely
 * gold error and the least visible, because the answer looks entirely
 * reasonable — about 9% too high.
 */
export function valuePhysicalGold(
  position: Partial<PhysicalGoldPosition>,
  prices: Record<GoldKarat, UaeGoldPrice> | null,
): GoldValuation {
  if (!position.karat) {
    return { ok: false, reason: "Gold valuation unavailable — select 24K or 22K purity." };
  }
  if (position.weight === undefined || position.weight === null || position.weight <= 0) {
    return { ok: false, reason: "Gold valuation unavailable — enter the gold weight." };
  }
  if (prices === null) {
    return { ok: false, reason: "Gold valuation unavailable — no verified gold reference price." };
  }

  const price = prices[position.karat];
  const grams = toGrams(position.weight, position.weightUnit ?? "gram");
  const ownership = position.ownershipPercent ?? 1;

  return {
    ok: true,
    grams,
    pricePerGram: price.pricePerGram,
    karat: position.karat,
    valueAed: grams * price.pricePerGram * ownership,
  };
}

/**
 * The Good Buy price for 22K, derived from the 24K level.
 *
 * Purity scales the discipline as well as the price. A buyer willing to pay X
 * per gram for pure metal should not pay X for metal that is 22 parts in 24.
 */
export function goodBuyPrice22K(goodBuyPrice24K: number): number {
  return goodBuyPrice24K * GOLD_PURITY["22K"];
}
