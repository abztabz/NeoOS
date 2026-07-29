import { describe, expect, it } from "vitest";
import { isValuableGoldHolding, valueGoldHoldings } from "@/domain/gold/holding-metal-value";
import { computeMetalValues } from "@/domain/gold/metal-value";
import type { AssetHolding } from "@/domain/intake/types";

const values = computeMetalValues(3400);

function gold(overrides: Partial<AssetHolding> = {}): AssetHolding {
  return {
    assetHoldingId: "gold-1",
    subjectId: "subject-1",
    kind: "metals",
    label: "Gold jewellery",
    value: {
      amount: 87_500,
      currency: "AED",
      basis: "subject_estimate",
      asOf: "2026-07-01",
      note: null,
    },
    registryAssetId: null,
    identifier: null,
    quantity: null,
    liquidity: "days",
    jurisdiction: "AE",
    custodian: null,
    encumberedBy: null,
    restricted: false,
    goldPurity: "22K",
    goldWeightGrams: 200,
    notes: null,
    ...overrides,
  } as AssetHolding;
}

describe("which holdings can be valued", () => {
  it("accepts gold with a purity and a weight", () => {
    expect(isValuableGoldHolding(gold())).toBe(true);
  });

  it("rejects gold missing its karat or its weight", () => {
    expect(isValuableGoldHolding(gold({ goldPurity: null }))).toBe(false);
    expect(isValuableGoldHolding(gold({ goldWeightGrams: null }))).toBe(false);
  });

  it("ignores holdings that are not metal", () => {
    expect(isValuableGoldHolding(gold({ kind: "real_estate" }))).toBe(false);
  });
});

describe("valuing the household's gold", () => {
  it("values 22K at the 22K figure", () => {
    const summary = valueGoldHoldings([gold()], values);
    expect(summary.valued).toHaveLength(1);
    expect(summary.valued[0]!.valueAed).toBeCloseTo(200 * values.aedPerGram22K, 6);
    expect(summary.totalAed).toBeCloseTo(200 * values.aedPerGram22K, 6);
  });

  it("values 24K higher than the same weight in 22K", () => {
    const asPure = valueGoldHoldings([gold({ goldPurity: "24K" })], values);
    const asAlloy = valueGoldHoldings([gold({ goldPurity: "22K" })], values);
    expect(asPure.totalAed).toBeGreaterThan(asAlloy.totalAed);
  });

  it("applies an ownership share", () => {
    const summary = valueGoldHoldings([gold({ ownershipPercent: 0.5 })], values);
    expect(summary.totalAed).toBeCloseTo(100 * values.aedPerGram22K, 6);
  });

  it("names a holding it cannot value instead of skipping it", () => {
    // Skipping would make the total quietly too small; assuming a karat would
    // make it wrong in a way nobody could see.
    const summary = valueGoldHoldings([gold({ goldPurity: null })], values);
    expect(summary.valued).toHaveLength(0);
    expect(summary.gaps[0]!.reason).toContain("24K or 22K");
    expect(summary.totalAed).toBe(0);
  });

  it("reports every holding as a gap when no price is available", () => {
    const summary = valueGoldHoldings([gold()], null);
    expect(summary.valued).toHaveLength(0);
    expect(summary.gaps[0]!.reason).toContain("temporarily unavailable");
  });

  it("carries the calculation version onto each valued holding", () => {
    const summary = valueGoldHoldings([gold()], values);
    expect(summary.valued[0]!.calculationVersion).toBe(values.calculationVersion);
  });

  it("does not add back what was paid for making charges", () => {
    // The declared value is 87,500 AED, which included a jeweller's margin.
    // Metal value is the metal, and must not inherit that.
    const summary = valueGoldHoldings([gold()], values);
    expect(summary.totalAed).not.toBeCloseTo(87_500, 0);
    expect(summary.totalAed).toBeCloseTo(200 * values.aedPerGram22K, 6);
  });
});
