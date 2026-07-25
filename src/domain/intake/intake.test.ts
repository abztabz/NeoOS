import { describe, expect, it } from "vitest";
import {
  emptyProfile,
  incomeSourceSchema,
  intakeProfileSchema,
  INCOME_DEPENDS_ON_WORKING,
  ASSET_KIND_PRICEABLE,
  VALUATION_BASIS_CONFIDENCE,
  assetKinds,
  type AssetHolding,
  type IncomeSource,
  type IntakeProfile,
  type Liability,
} from "@/domain/intake/types";
import {
  assessCompleteness,
  assetTotals,
  byAssetKind,
  byJurisdiction,
  concentrationBy,
  deployableCapital,
  incomeBreakdown,
  priceableSplit,
} from "@/domain/intake/assessment";

const NOW = "2026-07-25T09:00:00.000Z";

function profile(overrides: Partial<IntakeProfile> = {}): IntakeProfile {
  return { ...emptyProfile("subject-1", "profile-1", NOW), ...overrides };
}

function income(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return {
    incomeId: `income-${Math.random().toString(36).slice(2, 8)}`,
    subjectId: "subject-1",
    kind: "salary",
    label: "Salary",
    gross: { amount: 10_000, currency: "AED", basis: "statement_balance", asOf: "2026-07-01", note: null },
    frequency: "monthly",
    stability: "contracted",
    producedByAssetId: null,
    dependsOnSubjectWorking: "yes",
    jurisdiction: "AE",
    expectedUntil: null,
    notes: null,
    ...overrides,
  };
}

function asset(overrides: Partial<AssetHolding> = {}): AssetHolding {
  return {
    assetHoldingId: `asset-${Math.random().toString(36).slice(2, 8)}`,
    subjectId: "subject-1",
    kind: "cash",
    label: "Current account",
    value: { amount: 100_000, currency: "AED", basis: "statement_balance", asOf: "2026-07-01", note: null },
    registryAssetId: null,
    identifier: null,
    quantity: null,
    liquidity: "immediate",
    jurisdiction: "AE",
    custodian: "Bank",
    encumberedBy: null,
    restricted: false,
    notes: null,
    ...overrides,
  };
}

function liability(overrides: Partial<Liability> = {}): Liability {
  return {
    liabilityId: "liability-1",
    subjectId: "subject-1",
    kind: "mortgage",
    label: "Flat mortgage",
    outstanding: { amount: 500_000, currency: "AED", basis: "statement_balance", asOf: "2026-07-01", note: null },
    paymentAmount: 5_000,
    paymentFrequency: "monthly",
    interestRatePercent: 4.5,
    securedAgainstAssetId: null,
    maturityDate: null,
    notes: null,
    ...overrides,
  };
}

describe("the model", () => {
  it("accepts a complete profile", () => {
    const full = profile({
      incomeSources: [income()],
      assets: [asset()],
      liabilities: [liability()],
    });
    expect(intakeProfileSchema.safeParse(full).success).toBe(true);
  });

  it("separates income from the asset that produces it, and links them", () => {
    const flat = asset({ assetHoldingId: "asset-flat", kind: "real_estate", liquidity: "months" });
    const rent = income({ kind: "rent", producedByAssetId: flat.assetHoldingId, dependsOnSubjectWorking: "no" });
    expect(incomeSourceSchema.safeParse(rent).success).toBe(true);
    expect(rent.producedByAssetId).toBe(flat.assetHoldingId);
  });

  it("treats an unknown value as unknown, never as zero", () => {
    const unknown = asset({ value: { ...asset().value, amount: null } });
    expect(intakeProfileSchema.safeParse(profile({ assets: [unknown] })).success).toBe(true);
    const { totals, unvalued } = assetTotals(profile({ assets: [unknown] }));
    expect(totals).toEqual({});
    expect(unvalued).toEqual(["Current account"]);
  });

  it("scores a stated estimate below a market price", () => {
    expect(VALUATION_BASIS_CONFIDENCE.subject_estimate).toBeLessThan(
      VALUATION_BASIS_CONFIDENCE.market_price,
    );
  });

  it("defaults business revenue to partly dependent on the subject working", () => {
    // An owner-operated business degrades without its owner; a managed one does
    // not. The subject states which rather than NeoOS assuming.
    expect(INCOME_DEPENDS_ON_WORKING.business_revenue).toBe("partly");
    expect(INCOME_DEPENDS_ON_WORKING.salary).toBe("yes");
    expect(INCOME_DEPENDS_ON_WORKING.rent).toBe("no");
    expect(INCOME_DEPENDS_ON_WORKING.interest).toBe("no");
  });

  it("knows which asset kinds it cannot price itself", () => {
    expect(ASSET_KIND_PRICEABLE.private_business).toBe(false);
    expect(ASSET_KIND_PRICEABLE.real_estate).toBe(false);
    expect(ASSET_KIND_PRICEABLE.listed_equity).toBe(true);
    expect(ASSET_KIND_PRICEABLE.metals).toBe(true);
  });

  it("covers every kind the subject listed, and more", () => {
    for (const kind of ["real_estate", "metals", "listed_equity", "cash", "private_business"] as const) {
      expect(assetKinds).toContain(kind);
    }
  });
});

describe("what the profile can support", () => {
  it("refuses to call an empty profile anything but general", () => {
    const assessment = assessCompleteness(profile());
    expect(assessment.level).toBe("general");
    expect(assessment.summary).toMatch(/does not know your position/);
    expect(assessment.completeness).toBe(0);
  });

  it("names what is missing and what answering it unlocks", () => {
    const assessment = assessCompleteness(profile());
    const fields = assessment.missing.map((m) => m.field);
    expect(fields).toContain("assets");
    expect(fields).toContain("incomeSources");
    for (const item of assessment.missing) {
      expect(item.unlocks.length).toBeGreaterThan(20);
    }
  });

  it("reaches personal only when nothing blocking is missing", () => {
    const complete = profile({
      incomeSources: [income()],
      assets: [asset()],
      liabilities: [liability()],
      objective: { ...profile().objective, baseCurrency: "AED", reserveMonths: 6, horizonYears: 30 },
    });
    const assessment = assessCompleteness(complete);
    expect(assessment.level).toBe("personal");
    expect(assessment.completeness).toBeGreaterThan(80);
  });

  it("sits at directional when one blocking input is absent", () => {
    const partial = profile({
      assets: [asset()],
      objective: { ...profile().objective, baseCurrency: "AED" },
    });
    expect(assessCompleteness(partial).level).toBe("directional");
  });
});

describe("income that survives you not working", () => {
  it("separates earned from passive and reports the share", () => {
    const p = profile({
      incomeSources: [
        income({ kind: "salary", gross: { ...income().gross, amount: 30_000 } }),
        income({ kind: "rent", dependsOnSubjectWorking: "no", gross: { ...income().gross, amount: 10_000 } }),
      ],
    });
    const breakdown = incomeBreakdown(p);
    expect(breakdown.earned.AED).toBe(30_000 * 12);
    expect(breakdown.passive.AED).toBe(10_000 * 12);
    expect(breakdown.passiveShare).toBeCloseTo(0.25, 6);
  });

  it("counts partly-dependent income in its own bucket rather than either extreme", () => {
    const p = profile({
      incomeSources: [income({ kind: "business_revenue", dependsOnSubjectWorking: "partly" })],
    });
    const breakdown = incomeBreakdown(p);
    expect(breakdown.partial.AED).toBeGreaterThan(0);
    expect(breakdown.passive.AED).toBeUndefined();
    expect(breakdown.earned.AED).toBeUndefined();
  });

  it("does not annualise income the subject called irregular", () => {
    const p = profile({ incomeSources: [income({ frequency: "irregular", label: "Consulting" })] });
    const breakdown = incomeBreakdown(p);
    // Annualising it would invent a certainty the subject explicitly denied.
    expect(breakdown.excluded).toEqual(["Consulting"]);
    expect(breakdown.passiveShare).toBeNull();
  });

  it("refuses a share across currencies rather than assuming a rate", () => {
    const p = profile({
      incomeSources: [
        income({ gross: { ...income().gross, currency: "AED" } }),
        income({ kind: "dividend", dependsOnSubjectWorking: "no", gross: { ...income().gross, currency: "USD" } }),
      ],
    });
    expect(incomeBreakdown(p).passiveShare).toBeNull();
  });
});

describe("concentration", () => {
  it("reports shares by asset kind, largest first", () => {
    const p = profile({
      assets: [
        asset({ kind: "real_estate", value: { ...asset().value, amount: 3_000_000 } }),
        asset({ kind: "cash", value: { ...asset().value, amount: 1_000_000 } }),
      ],
    });
    const rows = concentrationBy(p, byAssetKind);
    expect(rows[0]?.bucket).toBe("real_estate");
    expect(rows[0]?.share).toBeCloseTo(0.75, 6);
  });

  it("keeps currencies apart rather than summing them", () => {
    const p = profile({
      assets: [
        asset({ value: { ...asset().value, currency: "AED", amount: 100 } }),
        asset({ value: { ...asset().value, currency: "USD", amount: 100 } }),
      ],
    });
    const rows = concentrationBy(p, byAssetKind);
    // Two rows, each 100% of its own currency — not one row of 200.
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.share === 1)).toBe(true);
  });

  it("labels an unstated jurisdiction rather than dropping the asset", () => {
    const p = profile({ assets: [asset({ jurisdiction: null })] });
    expect(concentrationBy(p, byJurisdiction)[0]?.bucket).toBe("Unspecified");
  });
});

describe("what NeoOS can price versus what it must take on trust", () => {
  it("splits the two without excluding either", () => {
    const p = profile({
      assets: [
        asset({ kind: "listed_equity", value: { ...asset().value, amount: 500_000 } }),
        asset({ kind: "private_business", value: { ...asset().value, amount: 2_000_000 } }),
      ],
    });
    const split = priceableSplit(p);
    expect(split.priceable.AED).toBe(500_000);
    // The business still counts toward net worth and concentration; dropping it
    // would make the rest look like the whole picture.
    expect(split.subjectStated.AED).toBe(2_000_000);
  });
});

describe("deployable capital", () => {
  it("counts only liquid, unrestricted assets", () => {
    const p = profile({
      assets: [
        asset({ kind: "cash", liquidity: "immediate", value: { ...asset().value, amount: 200_000 } }),
        asset({ kind: "real_estate", liquidity: "months", value: { ...asset().value, amount: 3_000_000 } }),
        asset({ kind: "listed_equity", liquidity: "days", restricted: true, value: { ...asset().value, amount: 400_000 } }),
      ],
    });
    expect(deployableCapital(p).totals.AED).toBe(200_000);
  });

  it("says plainly when no reserve has been applied", () => {
    const p = profile({ assets: [asset()] });
    const result = deployableCapital(p);
    expect(result.reserveApplied).toBe(false);
    expect(result.reason).toMatch(/before any reserve/);
  });

  it("deducts the reserve once obligations and a requirement are both known", () => {
    const p = profile({
      assets: [asset({ value: { ...asset().value, amount: 200_000 } })],
      liabilities: [liability({ paymentAmount: 5_000, paymentFrequency: "monthly" })],
      objective: { ...profile().objective, baseCurrency: "AED", reserveMonths: 6 },
    });
    const result = deployableCapital(p);
    expect(result.reserveApplied).toBe(true);
    expect(result.totals.AED).toBe(200_000 - 5_000 * 6);
  });

  it("never returns a negative deployable figure", () => {
    const p = profile({
      assets: [asset({ value: { ...asset().value, amount: 10_000 } })],
      liabilities: [liability({ paymentAmount: 5_000, paymentFrequency: "monthly" })],
      objective: { ...profile().objective, baseCurrency: "AED", reserveMonths: 12 },
    });
    expect(deployableCapital(p).totals.AED).toBe(0);
  });

  it("declines to apply a reserve it cannot size", () => {
    const p = profile({
      assets: [asset()],
      liabilities: [liability({ paymentAmount: null, paymentFrequency: null })],
      objective: { ...profile().objective, baseCurrency: "AED", reserveMonths: 6 },
    });
    const result = deployableCapital(p);
    expect(result.reserveApplied).toBe(false);
    expect(result.reason).toMatch(/cannot be sized/);
  });
});
