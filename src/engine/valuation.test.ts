import { describe, expect, it } from "vitest";
import {
  computeValuation,
  valuationGrade,
  valuationRawScore,
  type ValuationInput,
} from "@/engine/valuation";
import { buyThresholds } from "@/engine/generate";
import { STRONG_BUY_GATE } from "@/engine/constants";

const BASE = {
  calculationDate: "2026-07-24T12:00:00Z",
  currency: "USD",
  evidenceIds: ["e1"],
  confidence: 88,
  assumptions: ["assumption"],
  invalidationConditions: ["invalidation"],
};

describe("valuation methods", () => {
  it("earnings multiple produces three ordered cases", () => {
    const result = computeValuation({
      ...BASE,
      method: "earningsMultiple",
      marketPrice: 150,
      eps: 10,
      conservativeMultiple: 15,
      baseMultiple: 20,
      optimisticMultiple: 25,
    } satisfies ValuationInput);
    expect(result.conservativeValue).toBe(150);
    expect(result.baseValue).toBe(200);
    expect(result.optimisticValue).toBe(250);
    expect(result.marginOfSafety).toBeCloseTo(0, 10);
  });

  it("net asset value applies the conservative haircut", () => {
    const result = computeValuation({
      ...BASE,
      method: "netAssetValue",
      marketPrice: 80,
      navPerUnit: 100,
      conservativeDiscount: 0.2,
      optimisticPremium: 0.1,
    } satisfies ValuationInput);
    expect(result.conservativeValue).toBe(80);
    expect(result.baseValue).toBe(100);
    expect(result.optimisticValue).toBeCloseTo(110, 10);
    expect(result.marginOfSafety).toBeCloseTo(0, 10);
  });

  it("gold model discounts for positive real yields", () => {
    const cheapCarry = computeValuation({
      ...BASE,
      method: "goldStrategicAllocation",
      marketPrice: 2000,
      centralBankDemandScore: 80,
      realYieldAnchor: 0,
      baseFairValue: 2500,
    } satisfies ValuationInput);
    const costlyCarry = computeValuation({
      ...BASE,
      method: "goldStrategicAllocation",
      marketPrice: 2000,
      centralBankDemandScore: 80,
      realYieldAnchor: 3,
      baseFairValue: 2500,
    } satisfies ValuationInput);
    expect(costlyCarry.baseValue!).toBeLessThan(cheapCarry.baseValue!);
  });

  it("cash equivalents expose no margin of safety but still grade on real yield", () => {
    const result = computeValuation({
      ...BASE,
      method: "cashEquivalentYield",
      marketPrice: null,
      nominalYieldPct: 5,
      inflationPct: 2,
    } satisfies ValuationInput);
    expect(result.marginOfSafety).toBeNull();
    expect(result.conservativeValue).toBeNull();
    // 3% real yield: 50 + 3 × 12 = 86.
    expect(valuationGrade(result)).toBeCloseTo(86, 10);
  });

  it("negative real yield grades cash below fair", () => {
    const result = computeValuation({
      ...BASE,
      method: "cashEquivalentYield",
      marketPrice: null,
      nominalYieldPct: 1,
      inflationPct: 4,
    } satisfies ValuationInput);
    expect(valuationGrade(result)!).toBeLessThan(50);
  });

  it("every method exposes a complete trace", () => {
    const inputs: ValuationInput[] = [
      { ...BASE, method: "earningsMultiple", marketPrice: 100, eps: 10, conservativeMultiple: 12, baseMultiple: 15, optimisticMultiple: 18 },
      { ...BASE, method: "netAssetValue", marketPrice: 90, navPerUnit: 100, conservativeDiscount: 0.1, optimisticPremium: 0.1 },
      { ...BASE, method: "goldStrategicAllocation", marketPrice: 2000, centralBankDemandScore: 70, realYieldAnchor: 1, baseFairValue: 2400 },
      { ...BASE, method: "cashEquivalentYield", marketPrice: null, nominalYieldPct: 4, inflationPct: 2 },
      { ...BASE, method: "yieldSpread", marketPrice: 98, assetYieldPct: 6, referenceYieldPct: 4, parValue: 100 },
    ];
    for (const input of inputs) {
      const result = computeValuation(input);
      expect(result.method).toBe(input.method);
      expect(result.modelVersion.length).toBeGreaterThan(0);
      expect(result.assumptions.length).toBeGreaterThan(0);
      expect(result.invalidationConditions.length).toBeGreaterThan(0);
      expect(result.limitations.length).toBeGreaterThan(0);
      expect(result.sensitivity.length).toBeGreaterThan(0);
      expect(Object.keys(result.inputs).length).toBeGreaterThan(0);
    }
  });
});

describe("margin of safety to score", () => {
  it("a fair price scores 50", () => {
    expect(valuationRawScore(0)).toBe(50);
  });

  it("a premium scores below fair, a discount above", () => {
    expect(valuationRawScore(-0.2)!).toBeLessThan(50);
    expect(valuationRawScore(0.2)!).toBeGreaterThan(50);
  });

  it("the Strong Buy margin threshold reaches Buy-grade valuation", () => {
    expect(valuationRawScore(STRONG_BUY_GATE.minMarginOfSafety)).toBeCloseTo(85, 10);
  });

  it("clamps to the 0–100 range", () => {
    expect(valuationRawScore(-5)).toBe(0);
    expect(valuationRawScore(5)).toBe(100);
  });

  it("is null when no margin can be measured", () => {
    expect(valuationRawScore(null)).toBeNull();
    expect(valuationGrade(null)).toBeNull();
  });
});

describe("derived price thresholds", () => {
  it("Buy Below is the price at which valuation reaches Buy grade", () => {
    const conservative = 200;
    const { buyBelow, strongBuyBelow } = buyThresholds(conservative);
    // At Buy Below, margin of safety must produce a raw valuation score of 85.
    const mosAtBuy = (conservative - buyBelow!) / conservative;
    expect(valuationRawScore(mosAtBuy)).toBeCloseTo(85, 6);
    const mosAtStrongBuy = (conservative - strongBuyBelow!) / conservative;
    expect(valuationRawScore(mosAtStrongBuy)).toBeCloseTo(95, 6);
    expect(strongBuyBelow!).toBeLessThan(buyBelow!);
  });

  it("no thresholds without a conservative value", () => {
    expect(buyThresholds(null)).toEqual({ buyBelow: null, strongBuyBelow: null });
    expect(buyThresholds(0)).toEqual({ buyBelow: null, strongBuyBelow: null });
  });
});
