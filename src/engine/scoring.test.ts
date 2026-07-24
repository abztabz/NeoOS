import { describe, expect, it } from "vitest";
import {
  CRITICAL_FACTORS,
  FACTOR_WEIGHTS,
  GOVERNANCE_VETO_BELOW,
  INSUFFICIENT_EVIDENCE,
  PENALTIES,
  STRONG_BUY_GATE,
} from "@/engine/constants";
import {
  computeFactorScores,
  evaluateStrongBuyGate,
  scoreAsset,
  type AssetScoringContext,
} from "@/engine/scoring";
import { computeValuation } from "@/engine/valuation";
import type { CanonicalAsset, ConflictRecord, EvidenceRecord } from "@/engine/models";
import type { FactorName } from "@/engine/constants";

const NOW = new Date("2026-07-24T12:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

const testAsset: CanonicalAsset = {
  assetId: "test",
  name: "Test Asset",
  kind: "instrument",
  ticker: "TEST",
  exchange: "NYSE",
  currency: "USD",
  assetClass: "Equity",
  category: "Test",
  sector: null,
  industry: null,
  country: "US",
  region: "US",
  benchmark: null,
  status: "active",
  sourceIdentifiers: {},
};

let seq = 0;
function evidence(
  factor: FactorName,
  value: number,
  opts: Partial<EvidenceRecord> & { ageDays?: number } = {},
): EvidenceRecord {
  seq += 1;
  const { ageDays = 1, ...rest } = opts;
  return {
    evidenceId: `e${seq}`,
    assetId: "test",
    evidenceType: "officialFiling",
    sourceTier: 1,
    sourceName: "Test filing",
    sourceRef: "ref",
    publicationDate: daysAgo(ageDays),
    retrievedAt: daysAgo(0),
    effectiveDate: daysAgo(ageDays),
    expiresAt: null,
    factor,
    claimKey: null,
    factualClaim: `${factor} claim`,
    normalizedValue: value,
    unit: "score",
    confidence: 90,
    verificationStatus: "verified",
    conflictGroupId: null,
    notes: null,
    ...rest,
  };
}

/** Three records per factor so coverage is full and penalties isolate cleanly. */
function fullEvidence(scores: Partial<Record<FactorName, number>>): EvidenceRecord[] {
  return Object.entries(scores).flatMap(([factor, value]) =>
    [0, 1, 2].map(() => evidence(factor as FactorName, value as number)),
  );
}

function valuationFor(
  marketPrice: number,
  evidenceIds: string[],
  conservativeMultiple = 20,
) {
  return computeValuation({
    method: "earningsMultiple",
    calculationDate: NOW.toISOString(),
    currency: "USD",
    marketPrice,
    evidenceIds,
    confidence: 92,
    eps: 10,
    conservativeMultiple,
    baseMultiple: conservativeMultiple + 4,
    optimisticMultiple: conservativeMultiple + 8,
    assumptions: ["Test assumption"],
    invalidationConditions: ["Test invalidation"],
  });
}

function ctx(overrides: Partial<AssetScoringContext> = {}): AssetScoringContext {
  const records = fullEvidence({
    financialStrength: 90,
    businessQuality: 85,
    growth: 70,
    macro: 70,
    technical: 60,
    portfolioFit: 80,
    governance: 85,
  });
  return {
    asset: testAsset,
    evidence: records,
    conflicts: [],
    // Valuation cites a real tier-1 record so the gate's evidence check is
    // exercised against actual provenance, not a dangling id.
    valuation: valuationFor(120, [records[0]!.evidenceId]),
    now: NOW,
    ...overrides,
  };
}

describe("factor weighting", () => {
  it("weights sum to exactly 1", () => {
    const sum = Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("weighted contribution equals adjusted score times weight", () => {
    const factors = computeFactorScores(ctx());
    for (const factor of factors) {
      if (factor.adjustedScore === null) continue;
      expect(factor.weightedContribution).toBeCloseTo(factor.adjustedScore * factor.weight, 10);
    }
  });

  it("total equals the sum of contributions over contributing weight", () => {
    const rec = scoreAsset(ctx());
    const contributing = rec.factorScores.filter((f) => f.weightedContribution !== null);
    const weightSum = contributing.reduce((s, f) => s + f.weight, 0);
    const expected =
      contributing.reduce((s, f) => s + (f.weightedContribution as number), 0) / weightSum;
    expect(rec.totalScore).toBeCloseTo(expected, 10);
  });

  it("does not round intermediate values", () => {
    const records = fullEvidence({ financialStrength: 83, businessQuality: 77 });
    const rec = scoreAsset({
      ...ctx({ evidence: records }),
      valuation: valuationFor(137, [records[0]!.evidenceId]),
    });
    // Contributions carry full precision; a weighted mean of these inputs
    // lands well away from a whole number.
    expect(rec.totalScore).not.toBeNull();
    expect(Number.isInteger(rec.totalScore)).toBe(false);
    const fs = rec.factorScores.find((f) => f.factorName === "valuation")!;
    expect(Number.isInteger(fs.rawScore)).toBe(false);
  });
});

describe("penalties", () => {
  it("thin coverage costs points, full coverage costs none", () => {
    const thin = computeFactorScores(
      ctx({ evidence: [evidence("financialStrength", 90)] }),
    ).find((f) => f.factorName === "financialStrength")!;
    expect(thin.evidenceCoverage).toBeCloseTo(1 / 3, 5);
    expect(thin.coveragePenalty).toBeCloseTo((1 - 1 / 3) * PENALTIES.maxCoverage, 5);

    const full = computeFactorScores(ctx()).find((f) => f.factorName === "financialStrength")!;
    expect(full.evidenceCoverage).toBe(1);
    expect(full.coveragePenalty).toBe(0);
  });

  it("stale evidence costs points proportional to the stale share", () => {
    // officialFiling horizon is 120 days: 150 days old is stale, not expired.
    const factors = computeFactorScores(
      ctx({
        evidence: [
          evidence("financialStrength", 90, { ageDays: 150 }),
          evidence("financialStrength", 90, { ageDays: 1 }),
          evidence("financialStrength", 90, { ageDays: 1 }),
        ],
      }),
    );
    const fs = factors.find((f) => f.factorName === "financialStrength")!;
    expect(fs.freshnessPenalty).toBeCloseTo((1 / 3) * PENALTIES.maxFreshness, 5);
  });

  it("expired evidence is excluded entirely rather than decayed", () => {
    const factors = computeFactorScores(
      ctx({ evidence: [evidence("financialStrength", 90, { ageDays: 400 })] }),
    );
    const fs = factors.find((f) => f.factorName === "financialStrength")!;
    expect(fs.rawScore).toBeNull();
    expect(fs.evidenceCoverage).toBe(0);
  });

  it("conflicts touching a factor cost points, capped", () => {
    const base = ctx();
    const target = base.evidence.find((r) => r.factor === "growth")!;
    const conflict = (id: string, evidenceId: string): ConflictRecord => ({
      conflictId: id,
      claimKey: "k",
      evidenceIds: [evidenceId],
      prevailingEvidenceId: evidenceId,
      severity: "low",
      resolution: "resolved_by_tier",
      confidenceEffect: "",
      note: "",
    });

    const one = computeFactorScores({ ...base, conflicts: [conflict("c1", target.evidenceId)] });
    expect(one.find((f) => f.factorName === "growth")!.conflictPenalty).toBe(
      PENALTIES.perConflict,
    );

    // Three conflicts would be 18 points; the cap holds it at maxConflict.
    const many = computeFactorScores({
      ...base,
      conflicts: ["c1", "c2", "c3"].map((id) => conflict(id, target.evidenceId)),
    });
    expect(many.find((f) => f.factorName === "growth")!.conflictPenalty).toBe(
      PENALTIES.maxConflict,
    );
  });
});

describe("confidence propagation", () => {
  it("low-confidence evidence lowers the recommendation confidence", () => {
    const high = scoreAsset(ctx());
    const low = scoreAsset(
      ctx({
        evidence: fullEvidence({
          financialStrength: 90,
          businessQuality: 85,
          growth: 70,
          macro: 70,
          technical: 60,
          portfolioFit: 80,
          governance: 85,
        }).map((r) => ({ ...r, confidence: 45 })),
      }),
    );
    expect(low.confidence).toBeLessThan(high.confidence);
  });
});

describe("rating mapping", () => {
  it.each([
    [96, "Strong Buy"],
    [95, "Strong Buy"],
    [94, "Buy"],
    [85, "Buy"],
    [84, "Accumulate"],
    [70, "Accumulate"],
    [69, "Hold"],
    [55, "Hold"],
    [54, "Reduce"],
    [40, "Reduce"],
    [39, "Avoid"],
  ])("score %i maps to %s", async (score, expected) => {
    const { ratingFromScoreEnum } = await import("@/domain/scoring");
    expect(ratingFromScoreEnum(score)).toBe(expected);
  });
});

describe("Strong Buy gate", () => {
  /** Inputs strong enough to clear 95 on score alone. */
  function strongEvidence(overrides: Partial<Record<FactorName, number>> = {}) {
    return fullEvidence({
      financialStrength: 96,
      businessQuality: 96,
      growth: 92,
      macro: 92,
      technical: 92,
      portfolioFit: 95,
      governance: 95,
      ...overrides,
    });
  }

  function strongCtx(overrides: Partial<AssetScoringContext> = {}): AssetScoringContext {
    const records = strongEvidence();
    return ctx({
      evidence: records,
      // 50% margin of safety vs the conservative value of 200.
      valuation: valuationFor(100, [records[0]!.evidenceId]),
      ...overrides,
    });
  }

  it("a qualifying asset can reach Strong Buy", () => {
    const rec = scoreAsset(strongCtx());
    expect(rec.totalScore).toBeGreaterThanOrEqual(STRONG_BUY_GATE.minScore);
    expect(rec.finalRating).toBe("Strong Buy");
    expect(rec.eligibilityChecks.every((c) => c.passed)).toBe(true);
  });

  it("a thin margin of safety fails the gate even at a qualifying score", () => {
    // Reaching 95 with no discount is arithmetically impossible once valuation
    // carries 30% of the weight, so the check is proven directly: a passing
    // score with a thin margin still fails the gate.
    const records = strongEvidence();
    const factors = computeFactorScores({
      ...strongCtx({ evidence: records }),
      valuation: valuationFor(200, [records[0]!.evidenceId]),
    });
    const checks = evaluateStrongBuyGate({
      totalScore: 96,
      confidence: 95,
      integrity: 95,
      factors,
      valuation: valuationFor(200, [records[0]!.evidenceId]),
      conflicts: [],
      evidence: records,
      now: NOW,
    });
    const mos = checks.find((c) => c.id === "margin-of-safety")!;
    expect(mos.passed).toBe(false);
    expect(mos.required).toContain(String(STRONG_BUY_GATE.minMarginOfSafety * 100));
  });

  it("a 95+ score is downgraded when valuation evidence is only low-tier", () => {
    const records = strongEvidence();
    const weak: EvidenceRecord = {
      ...evidence("valuation" as FactorName, 90),
      evidenceType: "sentiment",
      sourceTier: 6,
    };
    const rec = scoreAsset(
      strongCtx({
        evidence: [...records, weak],
        valuation: valuationFor(100, [weak.evidenceId]),
      }),
    );
    expect(rec.provisionalRating).toBe("Strong Buy");
    expect(rec.eligibilityChecks.find((c) => c.id === "valuation-evidence")?.passed).toBe(false);
    expect(rec.finalRating).toBe("Buy");
    expect(rec.vetoes.join(" ")).toMatch(/Strong Buy gate failed/);
  });

  it("an unresolved high-severity conflict caps the rating at Hold", () => {
    const conflicts: ConflictRecord[] = [
      {
        conflictId: "c-high",
        claimKey: "k",
        evidenceIds: ["e1"],
        prevailingEvidenceId: "e1",
        severity: "high",
        resolution: "unresolved",
        confidenceEffect: "",
        note: "",
      },
    ];
    const rec = scoreAsset(strongCtx({ conflicts }));
    expect(rec.finalRating).toBe("Hold");
    expect(rec.vetoes.join(" ")).toMatch(/conflict/i);
  });

  it("governance below the veto floor caps the rating at Reduce", () => {
    const records = strongEvidence({ governance: GOVERNANCE_VETO_BELOW - 1 });
    const rec = scoreAsset(
      strongCtx({
        evidence: records,
        valuation: valuationFor(100, [records[0]!.evidenceId]),
      }),
    );
    expect(rec.finalRating).toBe("Reduce");
    expect(rec.vetoes.join(" ")).toMatch(/Governance veto/);
  });

  it("records every failed condition, not just the first", () => {
    // Two independent failures while the score still clears 95: the valuation
    // rests on a sentiment-tier source, and one critical input has gone stale.
    const records = strongEvidence();
    const staleCritical = records.find((r) => r.factor === "financialStrength")!;
    staleCritical.publicationDate = daysAgo(150);
    staleCritical.effectiveDate = daysAgo(150);
    const weak: EvidenceRecord = {
      ...evidence("valuation" as FactorName, 90),
      evidenceType: "sentiment",
      sourceTier: 6,
    };
    const rec = scoreAsset(
      strongCtx({
        evidence: [...records, weak],
        valuation: valuationFor(100, [weak.evidenceId]),
      }),
    );
    expect(rec.provisionalRating).toBe("Strong Buy");
    const failed = rec.eligibilityChecks.filter((c) => !c.passed);
    expect(failed.map((c) => c.id)).toEqual(
      expect.arrayContaining(["valuation-evidence", "freshness"]),
    );
    expect(failed.length).toBeGreaterThan(1);
    for (const check of failed) {
      expect(rec.vetoes.join(" ")).toContain(check.label);
    }
  });
});

describe("insufficient evidence gate", () => {
  it("returns insufficient evidence when a critical factor has no evidence", () => {
    const rec = scoreAsset(ctx({ valuation: null }));
    expect(rec.status).toBe("insufficient_evidence");
    expect(rec.totalScore).toBeNull();
    expect(rec.finalRating).toBeNull();
    expect(rec.insufficientReasons.join(" ")).toMatch(/valuation/);
  });

  it("names every critical factor that is missing", () => {
    const rec = scoreAsset(ctx({ valuation: null, evidence: [] }));
    for (const factor of CRITICAL_FACTORS) {
      expect(rec.insufficientReasons.join(" ")).toContain(factor);
    }
  });

  it("returns insufficient evidence when confidence falls below the floor", () => {
    const low = INSUFFICIENT_EVIDENCE.minOverallConfidence - 10;
    const records = fullEvidence({ financialStrength: 80, businessQuality: 80 }).map((r) => ({
      ...r,
      confidence: low,
    }));
    const rec = scoreAsset(
      ctx({
        evidence: records,
        valuation: { ...valuationFor(120, [records[0]!.evidenceId]), confidence: low },
      }),
    );
    expect(rec.status).toBe("insufficient_evidence");
    expect(rec.insufficientReasons.join(" ")).toMatch(/confidence/i);
  });

  it("never emits a fabricated score alongside insufficient evidence", () => {
    const rec = scoreAsset(ctx({ valuation: null }));
    expect(rec.totalScore).toBeNull();
    expect(rec.provisionalRating).toBeNull();
    expect(rec.marginOfSafety).toBeNull();
  });
});

describe("calculation trace", () => {
  it("explains every factor including the ones with no evidence", () => {
    const rec = scoreAsset(ctx({ evidence: fullEvidence({ financialStrength: 90 }) }));
    expect(rec.factorScores).toHaveLength(Object.keys(FACTOR_WEIGHTS).length);
    for (const factor of rec.factorScores) {
      expect(factor.rationale.length).toBeGreaterThan(0);
      if (factor.rawScore === null && factor.factorName !== "valuation") {
        expect(factor.missingInputs.length).toBeGreaterThan(0);
      }
    }
  });

  it("cites the evidence ids behind each scored factor", () => {
    const rec = scoreAsset(ctx());
    const fs = rec.factorScores.find((f) => f.factorName === "financialStrength")!;
    expect(fs.evidenceIds.length).toBe(3);
  });
});
