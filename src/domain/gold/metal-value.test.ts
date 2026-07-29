import { describe, expect, it } from "vitest";
import {
  CALCULATION_VERSION,
  classifyGoldStatus,
  computeMetalValues,
  DELAYED_AFTER_MINUTES,
  METAL_VALUE_EXPLANATION,
  NOT_A_RESALE_QUOTE,
  PURITY_22K,
  PURITY_24K,
  pureGoldAedPerGram,
  STALE_AFTER_MINUTES,
  TROY_OUNCE_GRAMS,
  USD_AED,
  valueGoldHolding,
} from "@/domain/gold/metal-value";

/**
 * The arithmetic that turns a dollar quote into what this household's gold is
 * worth, and the labelling that stops it being read as a shop price.
 */

const NOW = new Date("2026-07-29T12:00:00.000Z");
const XAU = 3400;

describe("the conversion", () => {
  it("uses the exact constants, not rounded ones", () => {
    expect(TROY_OUNCE_GRAMS).toBe(31.1034768);
    expect(USD_AED).toBe(3.6725);
    expect(PURITY_24K).toBe(0.999);
    expect(PURITY_22K).toBe(0.916);
  });

  it("converts USD per troy ounce to AED per gram", () => {
    expect(pureGoldAedPerGram(XAU)).toBeCloseTo((XAU * 3.6725) / 31.1034768, 10);
  });

  it("computes 24K as pure metal times its own purity", () => {
    const v = computeMetalValues(XAU);
    expect(v.aedPerGram24K).toBeCloseTo(v.pureAedPerGram * 0.999, 10);
  });

  it("computes 22K from the pure value, never from the 24K figure", () => {
    const v = computeMetalValues(XAU);
    expect(v.aedPerGram22K).toBeCloseTo(v.pureAedPerGram * 0.916, 10);

    // The distinction that matters: chaining would give pure*0.999*0.916, a
    // different and wrong number. This asserts we did not chain.
    const chained = v.pureAedPerGram * PURITY_24K * PURITY_22K;
    expect(v.aedPerGram22K).not.toBeCloseTo(chained, 6);
  });

  it("prices 22K below 24K", () => {
    const v = computeMetalValues(XAU);
    expect(v.aedPerGram22K).toBeLessThan(v.aedPerGram24K);
  });

  it("stamps a calculation version and keeps every input", () => {
    const v = computeMetalValues(XAU);
    expect(v.calculationVersion).toBe(CALCULATION_VERSION);
    // A stored valuation must be recomputable by hand later.
    expect(v.inputs).toEqual({
      xauUsdPerTroyOunce: XAU,
      usdAed: 3.6725,
      troyOunceGrams: 31.1034768,
      purity24K: 0.999,
      purity22K: 0.916,
    });
  });

  it("worked example: 3400 USD/oz", () => {
    const v = computeMetalValues(3400);
    // 3400 * 3.6725 / 31.1034768 = 401.450297 AED/g pure
    expect(v.pureAedPerGram).toBeCloseTo(401.450297, 5);
    expect(v.aedPerGram24K).toBeCloseTo(401.048847, 5);
    expect(v.aedPerGram22K).toBeCloseTo(367.728472, 5);
  });
});

describe("status by age", () => {
  const at = (minutesAgo: number) =>
    new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

  it("is live inside the delay window", () => {
    expect(classifyGoldStatus(at(0), NOW)).toBe("live");
    expect(classifyGoldStatus(at(DELAYED_AFTER_MINUTES - 1), NOW)).toBe("live");
  });

  it("becomes delayed after thirty minutes", () => {
    expect(classifyGoldStatus(at(DELAYED_AFTER_MINUTES + 1), NOW)).toBe("delayed");
  });

  it("becomes stale after six hours", () => {
    expect(classifyGoldStatus(at(STALE_AFTER_MINUTES + 1), NOW)).toBe("stale");
    expect(classifyGoldStatus(at(STALE_AFTER_MINUTES - 1), NOW)).toBe("delayed");
  });

  it("refuses an unparseable or future-dated timestamp", () => {
    expect(classifyGoldStatus("not a date", NOW)).toBe("unavailable");
    // A figure struck in the future would never age.
    expect(classifyGoldStatus(at(-60), NOW)).toBe("unavailable");
  });
});

describe("valuing a holding", () => {
  const values = computeMetalValues(XAU);

  it("values 24K at the 24K figure", () => {
    const r = valueGoldHolding({ weightGrams: 100, purity: "24K" }, values);
    expect(r.ok && r.valueAed).toBeCloseTo(100 * values.aedPerGram24K, 6);
  });

  it("values 22K at the 22K figure, never the 24K one", () => {
    const r = valueGoldHolding({ weightGrams: 100, purity: "22K" }, values);
    expect(r.ok && r.valueAed).toBeCloseTo(100 * values.aedPerGram22K, 6);
    // The ~9% overstatement this exists to prevent.
    expect(r.ok && r.valueAed).toBeLessThan(100 * values.aedPerGram24K);
  });

  it("applies an ownership share", () => {
    const r = valueGoldHolding({ weightGrams: 100, purity: "24K", ownershipPercent: 0.5 }, values);
    expect(r.ok && r.valueAed).toBeCloseTo(50 * values.aedPerGram24K, 6);
  });

  it("carries the calculation version onto the holding valuation", () => {
    const r = valueGoldHolding({ weightGrams: 10, purity: "24K" }, values);
    expect(r.ok && r.calculationVersion).toBe(CALCULATION_VERSION);
  });

  it("refuses without a purity, a weight, or a price", () => {
    expect(valueGoldHolding({ weightGrams: 100, purity: null }, values).ok).toBe(false);
    expect(valueGoldHolding({ weightGrams: null, purity: "24K" }, values).ok).toBe(false);
    expect(valueGoldHolding({ weightGrams: 0, purity: "24K" }, values).ok).toBe(false);
    expect(valueGoldHolding({ weightGrams: 100, purity: "24K" }, null).ok).toBe(false);
  });

  it("says the price is unavailable rather than valuing at zero", () => {
    const r = valueGoldHolding({ weightGrams: 100, purity: "24K" }, null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("temporarily unavailable");
  });
});

describe("what the figure is not", () => {
  it("says plainly that it is not the DJG retail rate", () => {
    expect(METAL_VALUE_EXPLANATION).toContain("not the Dubai Jewellery Group suggested retail rate");
  });

  it("names every charge it excludes", () => {
    for (const term of ["making charges", "retailer premiums", "VAT", "dealer buyback spread"]) {
      expect(METAL_VALUE_EXPLANATION).toContain(term);
    }
  });

  it("refuses to imply a guaranteed resale value", () => {
    expect(NOT_A_RESALE_QUOTE).toContain("Not a guaranteed resale value");
  });
});
