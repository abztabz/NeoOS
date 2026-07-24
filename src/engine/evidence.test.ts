import { describe, expect, it } from "vitest";
import { FRESHNESS_HORIZON_DAYS, SOURCE_TIERS } from "@/engine/constants";
import {
  detectConflicts,
  effectiveConfidence,
  evidenceIntegrity,
  freshnessOf,
  summarizeEvidence,
} from "@/engine/evidence";
import type { EvidenceRecord } from "@/engine/models";

const NOW = new Date("2026-07-24T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

let seq = 0;
function record(overrides: Partial<EvidenceRecord> & { ageDays?: number } = {}): EvidenceRecord {
  seq += 1;
  const { ageDays = 1, ...rest } = overrides;
  return {
    evidenceId: `e${seq}`,
    assetId: "a",
    evidenceType: "officialFiling",
    sourceTier: SOURCE_TIERS.officialFiling,
    sourceName: "Filing",
    sourceRef: "ref",
    publicationDate: daysAgo(ageDays),
    retrievedAt: daysAgo(0),
    effectiveDate: daysAgo(ageDays),
    expiresAt: null,
    factor: "financialStrength",
    claimKey: null,
    factualClaim: "claim",
    normalizedValue: 80,
    unit: "score",
    confidence: 90,
    verificationStatus: "verified",
    conflictGroupId: null,
    notes: null,
    ...rest,
  };
}

describe("freshness", () => {
  it("classifies by the per-type horizon", () => {
    const horizon = FRESHNESS_HORIZON_DAYS.officialFiling;
    expect(freshnessOf(record({ ageDays: 1 }), NOW)).toBe("fresh");
    expect(freshnessOf(record({ ageDays: horizon * 0.9 }), NOW)).toBe("aging");
    expect(freshnessOf(record({ ageDays: horizon + 1 }), NOW)).toBe("stale");
    expect(freshnessOf(record({ ageDays: horizon * 2 + 1 }), NOW)).toBe("expired");
  });

  it("applies a much shorter horizon to market data than to filings", () => {
    const marketRecord = record({
      ageDays: 30,
      evidenceType: "marketData",
      sourceTier: SOURCE_TIERS.marketData,
    });
    const filing = record({ ageDays: 30 });
    expect(freshnessOf(marketRecord, NOW)).toBe("expired");
    expect(freshnessOf(filing, NOW)).toBe("fresh");
  });

  it("an explicit expiry always wins", () => {
    const expired = record({ ageDays: 1, expiresAt: daysAgo(0.5) });
    expect(freshnessOf(expired, NOW)).toBe("expired");
  });

  it("unparseable dates are expired, never fresh", () => {
    expect(freshnessOf(record({ publicationDate: "nonsense", effectiveDate: null }), NOW)).toBe(
      "expired",
    );
  });

  it("decays confidence with age and zeroes it when expired", () => {
    const fresh = record({ ageDays: 1 });
    const stale = record({ ageDays: FRESHNESS_HORIZON_DAYS.officialFiling + 5 });
    const expired = record({ ageDays: 400 });
    expect(effectiveConfidence(fresh, NOW)).toBe(90);
    expect(effectiveConfidence(stale, NOW)).toBeLessThan(90);
    expect(effectiveConfidence(expired, NOW)).toBe(0);
  });
});

describe("conflict detection", () => {
  it("flags disagreement on the same claim and preserves both records", () => {
    const a = record({ claimKey: "eps", normalizedValue: 100, sourceTier: 1 });
    const b = record({ claimKey: "eps", normalizedValue: 60, sourceTier: 3 });
    const conflicts = detectConflicts([a, b], NOW);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.evidenceIds).toEqual([a.evidenceId, b.evidenceId]);
    expect(conflicts[0]!.prevailingEvidenceId).toBe(a.evidenceId);
  });

  it("ranks the stronger source as prevailing regardless of input order", () => {
    const weak = record({ claimKey: "k", normalizedValue: 50, sourceTier: 6 });
    const strong = record({ claimKey: "k", normalizedValue: 90, sourceTier: 1 });
    expect(detectConflicts([weak, strong], NOW)[0]!.prevailingEvidenceId).toBe(strong.evidenceId);
    expect(detectConflicts([strong, weak], NOW)[0]!.prevailingEvidenceId).toBe(strong.evidenceId);
  });

  it("treats a wide tier gap as resolvable by hierarchy", () => {
    const filing = record({ claimKey: "k", normalizedValue: 90, sourceTier: 1 });
    const blog = record({ claimKey: "k", normalizedValue: 40, sourceTier: 6 });
    const conflict = detectConflicts([filing, blog], NOW)[0]!;
    expect(conflict.severity).toBe("low");
    expect(conflict.resolution).toBe("resolved_by_tier");
  });

  it("treats disagreement between peers as unresolved and high severity", () => {
    const one = record({ claimKey: "k", normalizedValue: 90, sourceTier: 1 });
    const two = record({ claimKey: "k", normalizedValue: 40, sourceTier: 1 });
    const conflict = detectConflicts([one, two], NOW)[0]!;
    expect(conflict.severity).toBe("high");
    expect(conflict.resolution).toBe("unresolved");
  });

  it("a disputed record is a high-severity conflict even without a value gap", () => {
    const one = record({ claimKey: "k", normalizedValue: 90, sourceTier: 1 });
    const two = record({
      claimKey: "k",
      normalizedValue: 90,
      sourceTier: 4,
      verificationStatus: "disputed",
    });
    const conflict = detectConflicts([one, two], NOW)[0]!;
    expect(conflict.severity).toBe("high");
  });

  it("tolerates small measurement differences", () => {
    const one = record({ claimKey: "k", normalizedValue: 100, sourceTier: 1 });
    const two = record({ claimKey: "k", normalizedValue: 98, sourceTier: 2 });
    expect(detectConflicts([one, two], NOW)).toHaveLength(0);
  });

  it("does not pair claims across different assets", () => {
    const one = record({ assetId: "a", claimKey: "k", normalizedValue: 100 });
    const two = record({ assetId: "b", claimKey: "k", normalizedValue: 20 });
    expect(detectConflicts([one, two], NOW)).toHaveLength(0);
  });

  it("ignores expired records when detecting conflicts", () => {
    const live = record({ claimKey: "k", normalizedValue: 100, sourceTier: 1 });
    const dead = record({ claimKey: "k", normalizedValue: 10, sourceTier: 1, ageDays: 400 });
    expect(detectConflicts([live, dead], NOW)).toHaveLength(0);
  });
});

describe("evidence integrity", () => {
  it("is zero with no evidence", () => {
    expect(evidenceIntegrity([], NOW)).toBe(0);
  });

  it("rewards fresh, verified, high-tier sources", () => {
    const strong = evidenceIntegrity([record({ ageDays: 1 })], NOW);
    const weak = evidenceIntegrity(
      [
        record({
          ageDays: 6,
          evidenceType: "sentiment",
          sourceTier: 6,
          verificationStatus: "unverified",
        }),
      ],
      NOW,
    );
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(90);
  });

  it("penalises disputed evidence", () => {
    const verified = evidenceIntegrity([record()], NOW);
    const disputed = evidenceIntegrity([record({ verificationStatus: "disputed" })], NOW);
    expect(disputed).toBeLessThan(verified);
  });
});

describe("evidence summary", () => {
  it("counts by freshness and reports the verified share", () => {
    const summary = summarizeEvidence(
      [
        record({ ageDays: 1 }),
        record({ ageDays: 400 }),
        record({ ageDays: 1, verificationStatus: "unverified" }),
      ],
      NOW,
    );
    expect(summary.total).toBe(3);
    expect(summary.byFreshness.fresh).toBe(2);
    expect(summary.byFreshness.expired).toBe(1);
    expect(summary.verifiedShare).toBeCloseTo(2 / 3, 5);
  });
});
