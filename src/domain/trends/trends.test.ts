import { describe, expect, it } from "vitest";
import { emptyProfile, type AssetHolding, type IncomeSource, type IntakeProfile } from "@/domain/intake/types";
import {
  absentSources,
  computePositionTrends,
  detectStructuralConditions,
} from "@/domain/trends/position-history";
import {
  assessSufficiency,
  OPPORTUNITY_SHARE_POINTS,
  THREAT_SHARE_POINTS,
} from "@/domain/trends/types";

const SUBJECT = "subject-operator";

function asset(over: Partial<AssetHolding> & { assetHoldingId: string; amount: number | null }): AssetHolding {
  const { amount, ...rest } = over;
  return {
    subjectId: SUBJECT,
    kind: "listed_equity",
    label: rest.assetHoldingId,
    value: { amount, currency: "AED", basis: "market_price", asOf: "2026-01-01", note: null },
    registryAssetId: null,
    identifier: null,
    quantity: null,
    liquidity: "days",
    jurisdiction: "AE",
    custodian: "Bank A",
    encumberedBy: null,
    restricted: false,
    notes: null,
    ...rest,
  } as AssetHolding;
}

function income(over: Partial<IncomeSource> & { incomeId: string; amount: number }): IncomeSource {
  const { amount, ...rest } = over;
  return {
    subjectId: SUBJECT,
    kind: "salary",
    label: rest.incomeId,
    gross: { amount, currency: "AED", basis: "statement_balance", asOf: "2026-01-01", note: null },
    frequency: "monthly",
    stability: "stable",
    producedByAssetId: null,
    dependsOnSubjectWorking: "yes",
    jurisdiction: "AE",
    expectedUntil: null,
    notes: null,
    ...rest,
  } as IncomeSource;
}

/** A profile at a point in time, with the given holdings. */
function version(id: string, recordedAt: string, assets: AssetHolding[], over: Partial<IntakeProfile> = {}) {
  return { ...emptyProfile(SUBJECT, id, recordedAt), assets, ...over };
}

/** Equity share drifting from 40% to 68% over eighteen months, in six versions. */
function driftingConcentration(): IntakeProfile[] {
  const shares = [0.4, 0.45, 0.52, 0.58, 0.63, 0.68];
  return shares.map((equityShare, index) =>
    version(
      `profile-${index}`,
      new Date(Date.parse("2025-01-15T00:00:00.000Z") + index * 110 * 86_400_000).toISOString(),
      [
        asset({ assetHoldingId: "equities", kind: "listed_equity", amount: equityShare * 1_000_000 }),
        asset({ assetHoldingId: "cash", kind: "cash", amount: (1 - equityShare) * 1_000_000, liquidity: "immediate" }),
      ],
    ),
  );
}

describe("sufficiency", () => {
  it("calls two points what they are", () => {
    // The commonest way to mislead with a trend is to fit one to too few points.
    expect(assessSufficiency(2, 900)).toBe("insufficient");
  });

  it("refuses a short window however many points it has", () => {
    expect(assessSufficiency(12, 30)).toBe("insufficient");
  });

  it("calls three points over three months a direction, not a pattern", () => {
    expect(assessSufficiency(3, 120)).toBe("indicative");
  });

  it("requires both count and span before calling anything established", () => {
    expect(assessSufficiency(6, 700)).toBe("indicative");
    expect(assessSufficiency(5, 800)).toBe("indicative");
    expect(assessSufficiency(6, 730)).toBe("established");
  });
});

describe("drift detection", () => {
  const report = computePositionTrends(driftingConcentration());
  const concentration = report.trends.find((t) => t.trendId === "asset-kind-share-listed-equity-aed");

  it("finds the concentration drift and names it a threat", () => {
    expect(concentration).toBeDefined();
    expect(concentration?.direction).toBe("rising");
    expect(concentration?.changePoints).toBeCloseTo(28, 5);
    expect(concentration?.signal).toBe("threat");
  });

  it("reads the series oldest first, so a rise is not reported as a fall", () => {
    // The store returns newest first. A trend read backwards inverts every
    // signal and looks entirely plausible doing it.
    const reversed = computePositionTrends([...driftingConcentration()].reverse());
    const same = reversed.trends.find((t) => t.trendId === "asset-kind-share-listed-equity-aed");
    expect(same?.direction).toBe("rising");
    expect(same?.changePoints).toBeCloseTo(concentration?.changePoints ?? 0, 5);
  });

  it("tracks a named bucket rather than whichever is largest", () => {
    // The trap this replaced: a "largest share" line changes which bucket it is
    // measuring when equities overtake cash, so the same 40% → 68% drift reports
    // an 8-point move. The chart looks entirely reasonable and understates the
    // drift by two thirds.
    const cash = report.trends.find((t) => t.trendId === "asset-kind-share-cash-aed");
    expect(concentration?.changePoints).toBeCloseTo(28, 5);
    expect(cash?.changePoints).toBeCloseTo(-28, 5);
    // Every point in a series belongs to the same bucket, start to finish.
    expect(concentration?.series[0]?.value).toBeCloseTo(0.4, 5);
    expect(concentration?.series.at(-1)?.value).toBeCloseTo(0.68, 5);
  });

  it("leaves the decision link unanswered rather than assuming", () => {
    // "You never decided that" needs the journal, which the domain cannot see.
    expect(concentration?.decisionLinked).toBeNull();
  });

  it("never extends the line past the last observation", () => {
    for (const trend of report.trends) expect(trend.projection).toBeNull();
  });

  it("carries the window and the point count on every observation", () => {
    expect(concentration?.observationCount).toBe(6);
    expect(concentration?.spanDays).toBe(550);
    expect(concentration?.sufficiency).toBe("indicative");
    expect(concentration?.caveats[0]).toMatch(/direction, not an established pattern/i);
  });

  it("puts threats before opportunities", () => {
    const signals = report.trends.map((t) => t.signal);
    const firstNeutral = signals.indexOf("neutral");
    if (firstNeutral !== -1) expect(signals.slice(firstNeutral)).not.toContain("threat");
  });
});

describe("threat and opportunity asymmetry", () => {
  /** Two versions a year apart with the given start and end share of one kind. */
  function shift(from: number, to: number): IntakeProfile[] {
    return [from, to].map((equityShare, index) =>
      version(`profile-${index}`, index === 0 ? "2025-01-01T00:00:00.000Z" : "2026-01-01T00:00:00.000Z", [
        asset({ assetHoldingId: "equities", kind: "listed_equity", amount: equityShare * 1_000_000 }),
        asset({ assetHoldingId: "cash", kind: "cash", amount: (1 - equityShare) * 1_000_000 }),
      ]),
    );
  }

  function concentrationSignal(from: number, to: number) {
    return computePositionTrends(shift(from, to)).trends.find(
      (t) => t.trendId === "asset-kind-share-listed-equity-aed",
    )?.signal;
  }

  it("names a threat at half the movement it needs for an opportunity", () => {
    // Care, expressed as behaviour, is asymmetric attention to ruin.
    const adverse = THREAT_SHARE_POINTS / 100;
    expect(concentrationSignal(0.5, 0.5 + adverse + 0.005)).toBe("threat");
    // The same magnitude the other way is not yet worth calling an opportunity.
    expect(concentrationSignal(0.6, 0.6 - adverse - 0.005)).toBe("neutral");
  });

  it("names an opportunity once the movement is large enough", () => {
    const favourable = OPPORTUNITY_SHARE_POINTS / 100;
    expect(concentrationSignal(0.75, 0.75 - favourable - 0.01)).toBe("opportunity");
  });

  it("still signals a large move on a thin record, and says the record is thin", () => {
    // Suppressing a threat because the series is short would hide the threat and
    // keep the caveat, which is the wrong way round.
    const trend = computePositionTrends(shift(0.4, 0.7)).trends.find(
      (t) => t.trendId === "asset-kind-share-listed-equity-aed",
    );
    expect(trend?.signal).toBe("threat");
    expect(trend?.sufficiency).toBe("insufficient");
    expect(trend?.caveats[0]).toMatch(/two points are a line/i);
  });
});

describe("nominal figures are not real ones", () => {
  /** Net position moving by the given multiple over one year. */
  function netPositionOver(multiple: number) {
    const profiles = [1, multiple].map((factor, index) =>
      version(`profile-${index}`, index === 0 ? "2025-01-01T00:00:00.000Z" : "2026-01-01T00:00:00.000Z", [
        asset({ assetHoldingId: "a", amount: 1_000_000 * factor }),
      ]),
    );
    return computePositionTrends(profiles).trends.find((t) => t.trendId === "net-position-aed");
  }

  it("never calls a nominal rise an opportunity", () => {
    // Up 12% in a year with prices up 15% is erosion. With no purchasing-power
    // series connected, NeoOS cannot tell which happened, and asserting the good
    // reading would be asserting something it has no basis for.
    const rising = netPositionOver(1.12);
    expect(rising?.direction).toBe("rising");
    expect(rising?.signal).toBe("neutral");
  });

  it("still calls a nominal fall a threat", () => {
    // Sound on the evidence available: whenever inflation is non-negative, a
    // nominal fall is a real fall of at least the same size.
    const falling = netPositionOver(0.88);
    expect(falling?.direction).toBe("falling");
    expect(falling?.signal).toBe("threat");
  });

  it("says the figure is nominal on every currency series", () => {
    expect(netPositionOver(1.12)?.caveats.join(" ")).toMatch(/Nominal\..*real growth or erosion/i);
  });

  it("leaves share-based trends free to signal an opportunity", () => {
    // Shares are ratios within one currency, so purchasing power cancels out.
    const profiles = [0.75, 0.6].map((equityShare, index) =>
      version(`profile-${index}`, index === 0 ? "2025-01-01T00:00:00.000Z" : "2026-01-01T00:00:00.000Z", [
        asset({ assetHoldingId: "equities", kind: "listed_equity", amount: equityShare * 1_000_000 }),
        asset({ assetHoldingId: "cash", kind: "cash", amount: (1 - equityShare) * 1_000_000 }),
      ]),
    );
    const trend = computePositionTrends(profiles).trends.find(
      (t) => t.trendId === "asset-kind-share-listed-equity-aed",
    );
    expect(trend?.signal).toBe("opportunity");
  });
});

describe("currency discipline", () => {
  it("keeps each currency on its own line rather than summing them", () => {
    const profiles = [0, 1].map((index) =>
      version(`profile-${index}`, index === 0 ? "2025-01-01T00:00:00.000Z" : "2026-01-01T00:00:00.000Z", [
        asset({ assetHoldingId: "aed", amount: 1_000_000 }),
        asset({
          assetHoldingId: "usd",
          amount: 500_000 + index * 400_000,
          value: { amount: 500_000 + index * 400_000, currency: "USD", basis: "market_price", asOf: "2026-01-01", note: null },
        }),
      ]),
    );
    const ids = computePositionTrends(profiles).trends.map((t) => t.trendId);
    expect(ids).toContain("net-position-aed");
    expect(ids).toContain("net-position-usd");
    // No combined line exists, because building one needs a rate NeoOS has not
    // verified — the resulting series would trend on the exchange rate.
    expect(ids.some((id) => id === "net-position")).toBe(false);
  });

  it("skips the passive share where income spans currencies, and says how often", () => {
    const mixed = [0, 1, 2].map((index) =>
      version(`profile-${index}`, `202${5 + index}-01-01T00:00:00.000Z`, [asset({ assetHoldingId: "a", amount: 100 })], {
        incomeSources: [
          income({ incomeId: "salary", amount: 40_000 }),
          income({
            incomeId: "rent",
            kind: "rent",
            dependsOnSubjectWorking: "no",
            amount: 10_000,
            gross:
              index === 1
                ? { amount: 10_000, currency: "USD", basis: "statement_balance", asOf: "2026-01-01", note: null }
                : { amount: 10_000, currency: "AED", basis: "statement_balance", asOf: "2026-01-01", note: null },
          }),
        ],
      }),
    );
    const passive = computePositionTrends(mixed).trends.find((t) => t.trendId === "passive-income-share");
    expect(passive?.observationCount).toBe(2);
    expect(passive?.caveats.join(" ")).toMatch(/more than one currency/i);
  });

  it("excludes holdings with no declared value instead of counting them as zero", () => {
    const profiles = [0, 1].map((index) =>
      version(`profile-${index}`, index === 0 ? "2025-01-01T00:00:00.000Z" : "2026-01-01T00:00:00.000Z", [
        asset({ assetHoldingId: "valued", amount: 1_000_000 }),
        asset({ assetHoldingId: "The family business", amount: null }),
      ]),
    );
    const net = computePositionTrends(profiles).trends.find((t) => t.trendId === "net-position-aed");
    expect(net?.caveats.join(" ")).toMatch(/The family business/);
  });
});

describe("structural conditions", () => {
  it("needs no history at all", () => {
    const report = computePositionTrends([
      version("profile-1", "2026-07-01T00:00:00.000Z", [asset({ assetHoldingId: "a", amount: 1_000_000 })]),
    ]);
    expect(report.trends).toEqual([]);
    expect(report.structural.length).toBeGreaterThan(0);
    expect(report.coverage).toMatch(/nothing can be compared over time yet/i);
  });

  it("names a single-currency position as a threat", () => {
    const found = detectStructuralConditions(
      version("p", "2026-07-01T00:00:00.000Z", [asset({ assetHoldingId: "a", amount: 1_000_000 })]),
    );
    const currency = found.find((c) => c.conditionId === "single-currency-exposure");
    expect(currency?.signal).toBe("threat");
    expect(currency?.label).toMatch(/AED/);
    expect(currency?.question.length).toBeGreaterThan(20);
  });

  it("names a single custodian and a single jurisdiction separately", () => {
    const found = detectStructuralConditions(
      version("p", "2026-07-01T00:00:00.000Z", [
        asset({ assetHoldingId: "a", amount: 500_000 }),
        asset({ assetHoldingId: "b", amount: 500_000 }),
      ]),
    );
    expect(found.map((c) => c.conditionId)).toEqual(
      expect.arrayContaining(["single-custodian", "single-jurisdiction"]),
    );
  });

  it("does not flag a custodian that is genuinely diversified", () => {
    const found = detectStructuralConditions(
      version("p", "2026-07-01T00:00:00.000Z", [
        asset({ assetHoldingId: "a", amount: 500_000, custodian: "Bank A" }),
        asset({ assetHoldingId: "b", amount: 500_000, custodian: "Bank B", jurisdiction: "GB" }),
      ]),
    );
    expect(found.map((c) => c.conditionId)).not.toContain("single-custodian");
    expect(found.map((c) => c.conditionId)).not.toContain("single-jurisdiction");
  });

  it("flags a majority that cannot be realised quickly", () => {
    const found = detectStructuralConditions(
      version("p", "2026-07-01T00:00:00.000Z", [
        asset({ assetHoldingId: "flat", kind: "real_estate", liquidity: "months", amount: 3_000_000 }),
        asset({ assetHoldingId: "cash", kind: "cash", liquidity: "immediate", amount: 500_000 }),
      ]),
    );
    expect(found.find((c) => c.conditionId === "illiquid-majority-aed")?.label).toMatch(/86%/);
  });

  it("flags a net worth built mostly from estimates without calling the figures wrong", () => {
    const found = detectStructuralConditions(
      version("p", "2026-07-01T00:00:00.000Z", [
        asset({
          assetHoldingId: "business",
          kind: "private_business",
          liquidity: "years",
          amount: 4_000_000,
          value: { amount: 4_000_000, currency: "AED", basis: "subject_estimate", asOf: "2024-01-01", note: null },
        }),
        asset({ assetHoldingId: "cash", kind: "cash", amount: 500_000 }),
      ]),
    );
    const estimate = found.find((c) => c.conditionId === "estimate-majority-aed");
    expect(estimate?.signal).toBe("threat");
    expect(estimate?.why).toMatch(/Not a doubt about the figures/);
  });

  it("treats an indefinite obligation funded by earned income as its own condition", () => {
    // An obligation with no end is a perpetuity, not a horizon. It cannot be
    // solved by working longer, which makes it a different problem.
    const profile = version("p", "2026-07-01T00:00:00.000Z", [asset({ assetHoldingId: "a", amount: 1_000_000 })], {
      incomeSources: [income({ incomeId: "salary", amount: 50_000 })],
      household: {
        ...emptyProfile(SUBJECT, "p", "2026-07-01T00:00:00.000Z").household,
        dependents: [
          {
            dependentId: "d1",
            relationship: "sibling",
            label: "Sibling",
            birthYear: null,
            financiallySupported: true,
            supportExpectedUntilYear: null,
            supportIsIndefinite: true,
            anticipatedObligation: null,
            notes: null,
          },
        ],
      },
    });
    const ids = detectStructuralConditions(profile).map((c) => c.conditionId);
    expect(ids).toContain("perpetual-obligation-finite-income");
    // Not also reported as plain earned-income dependence — one condition, not two.
    expect(ids).not.toContain("earned-income-dependence");
  });

  it("flags dependence on earned income where there is no indefinite obligation", () => {
    const profile = version("p", "2026-07-01T00:00:00.000Z", [asset({ assetHoldingId: "a", amount: 1_000_000 })], {
      incomeSources: [
        income({ incomeId: "salary", amount: 50_000 }),
        income({ incomeId: "rent", kind: "rent", dependsOnSubjectWorking: "no", amount: 5_000 }),
      ],
    });
    const found = detectStructuralConditions(profile).find((c) => c.conditionId === "earned-income-dependence");
    expect(found?.label).toMatch(/9% of income survives/);
  });

  it("flags missing succession and missing continuity", () => {
    const base = emptyProfile(SUBJECT, "p", "2026-07-01T00:00:00.000Z");
    const found = detectStructuralConditions({
      ...base,
      assets: [asset({ assetHoldingId: "a", amount: 1_000_000 })],
      household: { ...base.household, continuityContactExists: false },
    });
    const ids = found.map((c) => c.conditionId);
    expect(ids).toContain("no-succession-structure");
    expect(ids).toContain("no-continuity-contact");
  });

  it("says nothing about a profile that declares nothing", () => {
    expect(detectStructuralConditions(emptyProfile(SUBJECT, "p", "2026-07-01T00:00:00.000Z"))).toEqual([]);
  });
});

describe("stated absence", () => {
  it("names purchasing power as missing rather than omitting it", () => {
    // A trend report missing purchasing power that does not say so reads as a
    // complete one, and the reader cannot tell.
    const statistics = absentSources().find((a) => a.source === "official_statistics");
    expect(statistics?.reason).toMatch(/No statistics provider is connected/);
    expect(statistics?.unlocks).toMatch(/real terms/);
  });

  it("reports absences even when there is no position at all", () => {
    const report = computePositionTrends([]);
    expect(report.trends).toEqual([]);
    expect(report.absent.length).toBeGreaterThan(0);
    expect(report.coverage).toMatch(/no history to read/i);
  });

  it("does not claim precedent it has no corpus for", () => {
    const precedent = absentSources().find((a) => a.source === "knowledge_precedent");
    expect(precedent?.reason).toMatch(/corpus is empty/i);
  });
});
