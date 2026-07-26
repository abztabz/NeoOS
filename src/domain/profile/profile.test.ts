import { describe, expect, it } from "vitest";
import { emptyProfile, type AssetHolding, type IntakeProfile } from "@/domain/intake/types";
import {
  calculateProfile,
  concentrationRisk,
  currencyExposure,
  debtBurden,
  deploymentStatus,
  investableCash,
  liquidNetWorth,
  monthlyCashFlow,
  netWorth,
  portfolioAllocation,
  reserveCoverage,
  riskCapacity,
} from "@/domain/profile/calculations";
import { assessPersonalisation } from "@/domain/profile/personalisation";
import { derive, modelAssumption, unknown, userAssumption, userFact, weakest } from "@/domain/profile/provenance";

const SUBJECT = "subject-operator";
const today = "2026-07-25";

function asset(over: Partial<AssetHolding> & { assetHoldingId: string; amount: number | null }): AssetHolding {
  const { amount, ...rest } = over;
  return {
    subjectId: SUBJECT,
    kind: "cash",
    label: rest.assetHoldingId,
    value: { amount, currency: "AED", basis: "statement_balance", asOf: today, note: null },
    registryAssetId: null,
    identifier: null,
    quantity: null,
    liquidity: "immediate",
    jurisdiction: "AE",
    custodian: "Bank A",
    encumberedBy: null,
    restricted: false,
    notes: null,
    ...rest,
  } as AssetHolding;
}

/** A position complete enough that every core output can be computed. */
function completeProfile(over: Partial<IntakeProfile> = {}): IntakeProfile {
  const base = emptyProfile(SUBJECT, "profile-1", "2026-07-25T00:00:00.000Z");
  return {
    ...base,
    assets: [
      asset({ assetHoldingId: "cash", amount: 400_000 }),
      asset({ assetHoldingId: "equities", kind: "listed_equity", liquidity: "days", amount: 600_000 }),
    ],
    incomeSources: [
      {
        subjectId: SUBJECT,
        incomeId: "salary",
        kind: "salary",
        label: "Salary",
        gross: { amount: 60_000, currency: "AED", basis: "statement_balance", asOf: today, note: null },
        frequency: "monthly",
        stability: "stable",
        producedByAssetId: null,
        dependsOnSubjectWorking: "yes",
        jurisdiction: "AE",
        expectedUntil: null,
        notes: null,
      },
    ],
    liabilities: [
      {
        subjectId: SUBJECT,
        liabilityId: "mortgage",
        kind: "mortgage",
        label: "Mortgage",
        outstanding: { amount: 900_000, currency: "AED", basis: "statement_balance", asOf: today, note: null },
        paymentAmount: 8_000,
        paymentFrequency: "monthly",
        interestRatePercent: 4.5,
        securedAgainstAssetId: null,
        maturityDate: "2040-01-01",
        notes: null,
      },
    ],
    household: {
      ...base.household,
      monthlyObligations: { amount: 22_000, currency: "AED", basis: "subject_estimate", asOf: today, note: null },
    },
    objective: {
      ...base.objective,
      baseCurrency: "AED",
      reserveMonths: 6,
      horizonYears: 25,
      maxDrawdownTolerancePercent: 35,
    },
    ...over,
  };
}

describe("provenance", () => {
  it("returns the weakest of several kinds", () => {
    expect(weakest(["user_fact", "calculated"])).toBe("calculated");
    expect(weakest(["user_fact", "model_assumption", "calculated"])).toBe("model_assumption");
    expect(weakest(["calculated", "missing"])).toBe("missing");
  });

  it("never makes a result stronger than its weakest input", () => {
    // One assumption in a chain of arithmetic makes the whole result an
    // assumption, however many verified figures were involved. Uncertainty
    // propagates through arithmetic even though decimal places do not show it.
    const result = derive(
      [userFact(10, "declared"), modelAssumption(2, "NeoOS supplied this")],
      "ten times two",
      () => 20,
    );
    expect(result.provenance).toBe("model_assumption");
    expect(result.value).toBe(20);
  });

  it("promotes pure facts to a calculation and nothing further", () => {
    const result = derive([userFact(10, "a"), userFact(2, "b")], "sum", () => 12);
    expect(result.provenance).toBe("calculated");
  });

  it("keeps a user assumption a user assumption", () => {
    const result = derive([userFact(10, "a"), userAssumption(3.67, "your rate")], "converted", () => 36.7);
    expect(result.provenance).toBe("user_assumption");
  });

  it("makes the whole result missing when any input is missing", () => {
    // Computing around a gap by treating it as zero is how an incomplete
    // position becomes a confident number.
    const result = derive([userFact(10, "a"), unknown<number>("b", ["objective.baseCurrency"])], "sum", () => 10);
    expect(result.value).toBeNull();
    expect(result.provenance).toBe("missing");
    expect(result.missing).toEqual(["objective.baseCurrency"]);
  });
});

describe("net worth", () => {
  it("is missing rather than zero when nothing is declared", () => {
    const result = netWorth(emptyProfile(SUBJECT, "p", "2026-07-25T00:00:00.000Z"));
    expect(result.value).toBeNull();
    expect(result.missing).toContain("assets");
  });

  it("subtracts liabilities from assets, per currency", () => {
    const result = netWorth(completeProfile());
    expect(result.value?.AED).toBe(100_000);
    expect(result.provenance).toBe("calculated");
  });

  it("excludes a holding with no declared value and names it", () => {
    // Counting it as zero would shrink the position and make concentration look
    // better than it is.
    const profile = completeProfile();
    profile.assets.push(asset({ assetHoldingId: "The family business", kind: "private_business", amount: null }));
    const result = netWorth(profile);
    expect(result.value?.AED).toBe(100_000);
    expect(result.missing.join(" ")).toMatch(/The family business/);
  });
});

describe("liquid net worth", () => {
  it("drops to a model assumption when a debt has no maturity date", () => {
    // NeoOS chooses the cautious reading; the subject did not say it, so the
    // measure must not be presented as a plain calculation.
    const profile = completeProfile();
    profile.liabilities[0]!.maturityDate = null;
    const result = liquidNetWorth(profile);
    expect(result.provenance).toBe("model_assumption");
    expect(result.basis).toMatch(/no maturity date/i);
  });

  it("stays a calculation when every debt is dated", () => {
    expect(liquidNetWorth(completeProfile()).provenance).toBe("calculated");
  });

  it("excludes debt maturing beyond a year", () => {
    // The mortgage matures in 2040, so it is not netted against liquid assets.
    expect(liquidNetWorth(completeProfile()).value?.AED).toBe(1_000_000);
  });
});

describe("monthly cash flow", () => {
  it("nets income against every recurring outflow", () => {
    const result = monthlyCashFlow(completeProfile());
    expect(result.value?.income.AED).toBe(60_000);
    expect(result.value?.debtService.AED).toBe(8_000);
    expect(result.value?.householdObligations.AED).toBe(22_000);
    expect(result.value?.net.AED).toBe(30_000);
  });

  it("refuses to annualise income the subject called irregular", () => {
    // Turning irregular income into a monthly figure invents a certainty they
    // explicitly denied.
    const profile = completeProfile();
    profile.incomeSources[0]!.frequency = "irregular";
    const result = monthlyCashFlow(profile);
    expect(result.value?.income.AED).toBeUndefined();
    expect(result.missing.join(" ")).toMatch(/irregular/);
  });
});

describe("reserve coverage and investable cash", () => {
  it("measures liquid assets against monthly outflow", () => {
    const result = reserveCoverage(completeProfile());
    expect(result.value?.monthlyOutflow).toBe(30_000);
    expect(result.value?.months).toBeCloseTo(1_000_000 / 30_000, 5);
    expect(result.value?.funded).toBe(true);
  });

  it("is missing when the reserve requirement was never stated", () => {
    const profile = completeProfile();
    profile.objective.reserveMonths = null;
    const result = reserveCoverage(profile);
    expect(result.value).toBeNull();
    expect(result.missing).toContain("objective.reserveMonths");
  });

  it("holds back the reserve, the liquidity floor and committed near-term obligations", () => {
    const profile = completeProfile();
    profile.objective.minimumLiquidHolding = {
      amount: 50_000, currency: "AED", basis: "subject_estimate", asOf: today, note: null,
    };
    profile.futureObligations = [
      {
        subjectId: SUBJECT,
        obligationId: "school",
        kind: "education",
        label: "School fees",
        amount: { amount: 120_000, currency: "AED", basis: "subject_estimate", asOf: today, note: null },
        dueYear: new Date().getFullYear() + 1,
        certainty: "committed",
        fundedByAssetId: null,
        notes: null,
      },
    ];
    const result = investableCash(profile);
    // 1,000,000 liquid − 180,000 reserve − 50,000 floor − 120,000 committed.
    expect(result.value?.amount).toBe(650_000);
    expect(result.value?.nearTermObligationsHeldBack).toBe(120_000);
  });

  it("marks investable cash an assumption when no reserve was deducted", () => {
    // A figure with nothing held back is materially more optimistic, so it must
    // not be presented as a plain calculation.
    const profile = completeProfile();
    profile.objective.reserveMonths = null;
    expect(investableCash(profile).provenance).toBe("model_assumption");
  });

  it("ignores an obligation the subject only called possible", () => {
    const profile = completeProfile();
    profile.futureObligations = [
      {
        subjectId: SUBJECT,
        obligationId: "maybe",
        kind: "property_purchase",
        label: "Maybe a second flat",
        amount: { amount: 500_000, currency: "AED", basis: "subject_estimate", asOf: today, note: null },
        dueYear: new Date().getFullYear() + 1,
        certainty: "possible",
        fundedByAssetId: null,
        notes: null,
      },
    ];
    expect(investableCash(profile).value?.nearTermObligationsHeldBack).toBe(0);
  });
});

describe("debt burden", () => {
  it("reports service ratio, leverage and weighted rate", () => {
    const result = debtBurden(completeProfile());
    expect(result.value?.serviceRatio).toBeCloseTo(8_000 / 60_000, 5);
    expect(result.value?.debtToAssets).toBeCloseTo(0.9, 5);
    expect(result.value?.weightedRatePercent).toBeCloseTo(4.5, 5);
  });

  it("records no debt as a fact rather than a gap", () => {
    const profile = completeProfile({ liabilities: [] });
    const result = debtBurden(profile);
    expect(result.value?.serviceRatio).toBe(0);
    expect(result.provenance).toBe("calculated");
  });
});

describe("allocation, concentration and currency", () => {
  it("shares add to one", () => {
    const rows = portfolioAllocation(completeProfile()).value!;
    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 6);
    expect(rows[0]?.bucket).toBe("listed_equity");
  });

  it("reports a breach of the subject's own limit", () => {
    const profile = completeProfile();
    profile.objective.maxAssetKindPercent = 50;
    const result = concentrationRisk(profile);
    expect(result.value?.breaches[0]?.bucket).toBe("Listed shares");
    expect(result.value?.breaches[0]?.share).toBeCloseTo(0.6, 5);
  });

  it("still measures concentration when no limit was set, and says the limit is missing", () => {
    // The concentration is real and worth showing. What is absent is the
    // subject's view of what would be too much, which is a different absence.
    const result = concentrationRisk(completeProfile());
    expect(result.value?.largest).not.toBeNull();
    expect(result.missing).toContain("objective.maxAssetKindPercent");
  });

  it("cannot produce currency exposure without a rate, and refuses to guess", () => {
    const profile = completeProfile();
    profile.assets.push(
      asset({
        assetHoldingId: "usd-cash",
        amount: 100_000,
        value: { amount: 100_000, currency: "USD", basis: "statement_balance", asOf: today, note: null },
      }),
    );
    const result = currencyExposure(profile);
    expect(result.value).toBeNull();
    expect(result.missing).toContain("objective.exchangeRatesToBase.USD");
  });

  it("marks exposure a user assumption once the subject supplies a rate", () => {
    const profile = completeProfile();
    profile.assets.push(
      asset({
        assetHoldingId: "usd-cash",
        amount: 100_000,
        value: { amount: 100_000, currency: "USD", basis: "statement_balance", asOf: today, note: null },
      }),
    );
    profile.objective.exchangeRatesToBase = { USD: 3.67 };
    const result = currencyExposure(profile);
    expect(result.provenance).toBe("user_assumption");
    expect(result.value?.find((row) => row.currency === "USD")?.value).toBeCloseTo(367_000, 3);
  });
});

describe("deployment status", () => {
  it("puts the reserve before any opportunity", () => {
    // Capital posture precedes asset selection. An unfunded reserve outranks
    // everything, because being wrong about it means forced selling.
    const profile = completeProfile();
    profile.assets = [asset({ assetHoldingId: "cash", amount: 60_000 })];
    const result = deploymentStatus(profile);
    expect(result.value?.status).toBe("reserve_first");
    expect(result.value?.reasons[0]).toMatch(/before deploying/i);
  });

  it("limits deployment when a stated limit is already breached", () => {
    const profile = completeProfile();
    profile.objective.maxAssetKindPercent = 50;
    const result = deploymentStatus(profile);
    expect(result.value?.status).toBe("limited");
    expect(result.value?.reasons[0]).toMatch(/should not go there/i);
  });

  it("says it does not know rather than guessing", () => {
    const result = deploymentStatus(emptyProfile(SUBJECT, "p", "2026-07-25T00:00:00.000Z"));
    expect(result.value).toBeNull();
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("clears for deployment when the reserve is funded and nothing is breached", () => {
    const result = deploymentStatus(completeProfile());
    expect(result.value?.status).toBe("ready");
  });
});

describe("risk capacity", () => {
  it("reports the subject's own reading alongside the structural one", () => {
    const profile = completeProfile();
    profile.objective.statedRiskCapacity = "high";
    const result = riskCapacity(profile);
    expect(result.value?.stated).toBe("high");
    expect(result.value?.calculated).toBeDefined();
  });

  it("flags a subject who believes they can take more risk than the structure supports", () => {
    // The gap between tolerance and capacity is where forced selling comes from,
    // so it is reported rather than reconciled.
    const profile = completeProfile();
    profile.assets = [asset({ assetHoldingId: "cash", amount: 30_000 })];
    profile.objective.statedRiskCapacity = "high";
    profile.objective.horizonYears = 3;
    const result = riskCapacity(profile);
    expect(result.value?.calculated).toBe("low");
    expect(result.value?.disagreement).toBe(true);
  });
});

describe("personalisation gating", () => {
  it("is unavailable when nothing has been declared", () => {
    const state = assessPersonalisation(emptyProfile(SUBJECT, "p", "2026-07-25T00:00:00.000Z"));
    expect(state.state).toBe("unavailable");
    expect(state.meaning).toMatch(/not advice about your money/i);
  });

  it("names the most useful next inputs rather than listing every blank", () => {
    const state = assessPersonalisation(emptyProfile(SUBJECT, "p", "2026-07-25T00:00:00.000Z"));
    expect(state.nextInputs.slice(0, 3)).toEqual(
      expect.arrayContaining(["assets", "incomeSources", "objective.baseCurrency"]),
    );
  });

  it("is available only when every core output is computable and clean", () => {
    const profile = completeProfile();
    const state = assessPersonalisation(profile);
    expect(state.state).toBe("available");
    expect(state.uncomputable).toEqual([]);
  });

  it("falls back to provisional when a core output rests on a NeoOS assumption", () => {
    // A single undated debt is enough. Presenting an answer as personal when it
    // rests on an assumption is the specific failure this gate exists for.
    const profile = completeProfile();
    profile.liabilities[0]!.maturityDate = null;
    const state = assessPersonalisation(profile);
    expect(state.state).toBe("provisional");
    expect(state.restingOnAssumptions).toContain("liquidNetWorth");
  });

  it("is unavailable while a blocking input is absent, however much else is filled in", () => {
    const profile = completeProfile();
    profile.objective.baseCurrency = null;
    expect(assessPersonalisation(profile).state).toBe("unavailable");
  });
});

describe("the whole set", () => {
  it("computes every required output for a complete position", () => {
    const calculations = calculateProfile(completeProfile());
    for (const [name, value] of Object.entries(calculations)) {
      expect(value.value, `${name} should be computable`).not.toBeNull();
    }
  });

  it("returns missing rather than throwing for an empty one", () => {
    const calculations = calculateProfile(emptyProfile(SUBJECT, "p", "2026-07-25T00:00:00.000Z"));
    for (const [name, value] of Object.entries(calculations)) {
      if (name === "debtBurden") continue; // No debt declared is a fact, not a gap.
      expect(value.value, `${name} should be missing`).toBeNull();
      expect(value.missing.length, `${name} should say what it needs`).toBeGreaterThan(0);
    }
  });
});
