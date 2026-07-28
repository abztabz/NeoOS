import { describe, expect, it } from "vitest";
import {
  deriveUaeGoldPrices,
  goodBuyPrice22K,
  GOLD_PURITY,
  GOLD_REFERENCE_EXCLUSIONS,
  GRAMS_PER_TOLA,
  GRAMS_PER_TROY_OUNCE,
  toGrams,
  valuePhysicalGold,
  type UaeGoldPrice,
} from "@/domain/gold/uae-gold";

/**
 * Gold as the person holding it thinks about it: AED per gram, by karat.
 *
 * The error these guard against is quiet and expensive — valuing 22K at the 24K
 * price overstates a holding by about 9%, and the result looks entirely
 * plausible. On this household's gold that is thousands of dirhams of wealth
 * that does not exist.
 */

const SPOT_USD_PER_OZ = 2400;
const USD_AED = 3.6725;

function prices(): Record<"24K" | "22K", UaeGoldPrice> {
  const result = deriveUaeGoldPrices({
    goldSpotUsdPerTroyOunce: SPOT_USD_PER_OZ,
    usdAedRate: USD_AED,
    spotSourceId: "test-metals",
    spotSourceName: "Test metals source",
    quoteTimestamp: "2026-07-28T11:00:00.000Z",
    retrievedAt: "2026-07-28T11:01:00.000Z",
    freshness: "delayed",
  });
  if (!result.ok) throw new Error(result.reason);
  return result.prices;
}

describe("USD per troy ounce to AED per gram", () => {
  it("converts through the exact troy-ounce constant", () => {
    const expected = (SPOT_USD_PER_OZ / GRAMS_PER_TROY_OUNCE) * USD_AED;
    expect(prices()["24K"].pricePerGram).toBeCloseTo(expected, 10);
  });

  it("uses the definitional troy ounce, not a rounded one", () => {
    expect(GRAMS_PER_TROY_OUNCE).toBe(31.1034768);
  });

  it("derives 22K from 24K by exact purity", () => {
    const p = prices();
    expect(GOLD_PURITY["22K"]).toBe(22 / 24);
    expect(p["22K"].pricePerGram).toBeCloseTo(p["24K"].pricePerGram * (22 / 24), 10);
  });

  it("keeps XAU/USD as the underlying reference rather than the headline", () => {
    const p = prices()["24K"];
    expect(p.currency).toBe("AED");
    expect(p.unit).toBe("gram");
    // The USD figure is retained for the evidence view, not shown as the price.
    expect(p.underlyingReference).toBe("XAU_USD");
    expect(p.underlyingPrice).toBe(SPOT_USD_PER_OZ);
    expect(p.fxPair).toBe("USD/AED");
  });

  it("labels a policy-fallback FX rate rather than passing it off as live", () => {
    const result = deriveUaeGoldPrices({
      goldSpotUsdPerTroyOunce: SPOT_USD_PER_OZ,
      usdAedRate: USD_AED,
      spotSourceId: "s",
      spotSourceName: "Source",
      quoteTimestamp: "2026-07-28T11:00:00.000Z",
      retrievedAt: "2026-07-28T11:01:00.000Z",
      freshness: "delayed",
      fxIsPolicyFallback: true,
    });
    expect(result.ok && result.prices["24K"].sourceName).toContain("documented peg");
    expect(result.ok && result.prices["24K"].sourceName).toContain("not a live FX quote");
  });

  it("refuses to derive a price with no verified spot", () => {
    const result = deriveUaeGoldPrices({
      goldSpotUsdPerTroyOunce: 0,
      usdAedRate: USD_AED,
      spotSourceId: "s",
      spotSourceName: "Source",
      quoteTimestamp: "2026-07-28T11:00:00.000Z",
      retrievedAt: "2026-07-28T11:01:00.000Z",
      freshness: "delayed",
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("no verified spot price");
  });

  it("refuses to derive a price with no verified FX", () => {
    const result = deriveUaeGoldPrices({
      goldSpotUsdPerTroyOunce: SPOT_USD_PER_OZ,
      usdAedRate: 0,
      spotSourceId: "s",
      spotSourceName: "Source",
      quoteTimestamp: "2026-07-28T11:00:00.000Z",
      retrievedAt: "2026-07-28T11:01:00.000Z",
      freshness: "delayed",
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("AED conversion unavailable");
  });
});

describe("weight conversion", () => {
  it("converts grams, tolas and troy ounces", () => {
    expect(toGrams(10, "gram")).toBe(10);
    expect(toGrams(1, "tola")).toBeCloseTo(GRAMS_PER_TOLA, 10);
    expect(toGrams(1, "troy_ounce")).toBeCloseTo(GRAMS_PER_TROY_OUNCE, 10);
  });
});

describe("valuing a physical holding", () => {
  it("values a 24K holding at the 24K price", () => {
    const p = prices();
    const result = valuePhysicalGold(
      { karat: "24K", weight: 100, weightUnit: "gram", ownershipPercent: 1 },
      p,
    );
    expect(result.ok && result.valueAed).toBeCloseTo(100 * p["24K"].pricePerGram, 6);
  });

  it("values a 22K holding at the 22K price, never the 24K one", () => {
    const p = prices();
    const result = valuePhysicalGold(
      { karat: "22K", weight: 100, weightUnit: "gram", ownershipPercent: 1 },
      p,
    );
    expect(result.ok && result.valueAed).toBeCloseTo(100 * p["22K"].pricePerGram, 6);
    // The mistake this exists to prevent: ~9% of imaginary wealth.
    expect(result.ok && result.valueAed).toBeLessThan(100 * p["24K"].pricePerGram);
  });

  it("applies ownership share", () => {
    const p = prices();
    const half = valuePhysicalGold(
      { karat: "24K", weight: 100, weightUnit: "gram", ownershipPercent: 0.5 },
      p,
    );
    expect(half.ok && half.valueAed).toBeCloseTo(50 * p["24K"].pricePerGram, 6);
  });

  it("blocks valuation when karat is missing", () => {
    const result = valuePhysicalGold({ weight: 100, weightUnit: "gram" }, prices());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe(
      "Gold valuation unavailable — select 24K or 22K purity.",
    );
  });

  it("blocks valuation when weight is missing", () => {
    const result = valuePhysicalGold({ karat: "24K" }, prices());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("Gold valuation unavailable — enter the gold weight.");
  });

  it("blocks valuation when no reference price is available", () => {
    const result = valuePhysicalGold({ karat: "24K", weight: 100, weightUnit: "gram" }, null);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("no verified gold reference price");
  });
});

describe("Good Buy price by purity", () => {
  it("scales the 22K discipline by purity", () => {
    expect(goodBuyPrice22K(300)).toBeCloseTo(300 * (22 / 24), 10);
  });
});

describe("what the reference excludes", () => {
  it("states every charge that separates a reference from a shop price", () => {
    for (const term of ["making charges", "premiums", "taxes", "dealer spreads"]) {
      expect(GOLD_REFERENCE_EXCLUSIONS.toLowerCase()).toContain(term);
    }
  });
});
