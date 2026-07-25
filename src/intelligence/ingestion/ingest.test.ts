import { describe, expect, it } from "vitest";
import { ingestProviderResult, superseding, verifyChecksum } from "@/intelligence/ingestion/ingest";
import {
  validateRawRecord,
  validateUniverseInputs,
  validateNormalizedEvidence,
} from "@/intelligence/validation/validate";
import { computeRawChecksum } from "@/intelligence/ingestion/ingest";
import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import type { ProviderDescriptor, ProviderFetchResult } from "@/intelligence/types/provider";
import type { UniverseInputs } from "@/engine/generate";
import type { EvidenceRecord } from "@/engine/models";

const NOW = "2026-07-24T12:00:00Z";

function raw(overrides: Partial<RawEvidenceRecord> = {}): RawEvidenceRecord {
  const base: Omit<RawEvidenceRecord, "checksum"> = {
    rawEvidenceId: "r1",
    providerId: "p1",
    providerMode: "fixture",
    providerRecordId: "1",
    retrievedAt: NOW,
    publishedAt: "2026-07-20T00:00:00Z",
    sourceRef: "test://ref",
    rawTitle: "A claim",
    rawText: null,
    rawPayload: null,
    assetIdentifiers: [{ scheme: "ticker", value: "AAPL" }],
    evidenceCategory: "filing",
    rawValue: 80,
    rawUnit: "score",
    rawCurrency: null,
    geographicScope: null,
    rawConfidence: 90,
    ingestionStatus: "ingested",
    parsingWarnings: [],
    payloadMetadata: {},
    supersedesRawEvidenceId: null,
    ...overrides,
  };
  return { ...base, checksum: computeRawChecksum(base) };
}

function fetchResult(records: unknown[], providerId = "p1"): ProviderFetchResult {
  return {
    providerId,
    mode: "fixture",
    ok: true,
    respondedAt: NOW,
    rawPayloadRef: "test",
    records,
    failureReason: null,
    warnings: [],
  };
}

const provider: ProviderDescriptor = {
  providerId: "p1",
  providerName: "Test provider",
  providerType: "official_filing",
  sourceTier: 1,
  capabilities: ["filings"],
  supportedAssetClasses: ["Equity"],
  mode: "fixture",
  configured: true,
  authenticated: false,
  health: "ok",
  lastSuccessfulRetrieval: null,
  failureReason: null,
  legalNotes: "test",
  rateLimit: null,
};

describe("ingestion", () => {
  it("assigns a checksum and freezes the record", () => {
    const result = ingestProviderResult(fetchResult([stripChecksum(raw())]), new Map());
    expect(result.records).toHaveLength(1);
    const record = result.records[0]!;
    expect(record.checksum.length).toBeGreaterThan(0);
    expect(Object.isFrozen(record)).toBe(true);
    expect(verifyChecksum(record)).toBe(true);
  });

  it("detects mutation of a supposedly immutable record", () => {
    const record = raw();
    expect(verifyChecksum(record)).toBe(true);
    expect(verifyChecksum({ ...record, rawValue: 99 })).toBe(false);
  });

  it("drops an identical record arriving twice, keeping the first", () => {
    const seen = new Map<string, RawEvidenceRecord>();
    const payload = stripChecksum(raw());
    const result = ingestProviderResult(
      fetchResult([payload, { ...payload, rawEvidenceId: "r1-copy" }]),
      seen,
    );
    expect(result.records).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.issues.map((i) => i.code)).toContain("duplicate_source_record");
  });

  it("treats two providers reporting the same fact as separate records", () => {
    const seen = new Map<string, RawEvidenceRecord>();
    const a = ingestProviderResult(fetchResult([stripChecksum(raw())], "p1"), seen);
    const b = ingestProviderResult(
      fetchResult([stripChecksum(raw({ providerId: "p2", rawEvidenceId: "r2" }))], "p2"),
      seen,
    );
    expect(a.records).toHaveLength(1);
    expect(b.records).toHaveLength(1);
    expect(b.duplicates).toHaveLength(0);
  });

  it("rejects a record that does not match the schema, with the failing path", () => {
    const result = ingestProviderResult(fetchResult([{ nonsense: true }]), new Map());
    expect(result.records).toHaveLength(0);
    expect(result.issues[0]!.code).toBe("schema_violation");
    expect(result.issues[0]!.severity).toBe("blocking");
    expect(result.issues[0]!.detail).toBeTruthy();
  });

  it("a correction supersedes the original instead of editing it", () => {
    const original = raw();
    const { superseded, correction } = superseding(original, { rawValue: 85 }, "r1-v2");
    expect(superseded.ingestionStatus).toBe("superseded");
    expect(superseded.rawValue).toBe(80);
    expect(correction.rawValue).toBe(85);
    expect(correction.supersedesRawEvidenceId).toBe("r1");
    expect(verifyChecksum(correction)).toBe(true);
  });
});

describe("raw validation", () => {
  it("blocks a record with no source reference", () => {
    const issues = validateRawRecord(raw({ sourceRef: "  " }), provider);
    expect(issues.map((i) => i.code)).toContain("missing_provenance");
  });

  it("blocks a record from an unregistered provider", () => {
    const issues = validateRawRecord(raw(), undefined);
    expect(issues[0]!.code).toBe("missing_provenance");
    expect(issues[0]!.severity).toBe("blocking");
  });

  it("blocks a record claiming a mode its provider is not in", () => {
    // This is the honesty control: fixture data asserting it is live.
    const issues = validateRawRecord(raw({ providerMode: "live" }), provider);
    const misrepresented = issues.find((i) => i.code === "provider_mode_misrepresented");
    expect(misrepresented).toBeDefined();
    expect(misrepresented!.severity).toBe("blocking");
  });

  it("blocks a non-macro record with no identifiers", () => {
    const issues = validateRawRecord(raw({ assetIdentifiers: [] }), provider);
    expect(issues.map((i) => i.code)).toContain("unknown_asset_identity");
  });

  it("allows a macro record with no identifiers", () => {
    const issues = validateRawRecord(
      raw({ assetIdentifiers: [], evidenceCategory: "macro_indicator" }),
      provider,
    );
    expect(issues.map((i) => i.code)).not.toContain("unknown_asset_identity");
  });
});

describe("normalized-evidence validation", () => {
  function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
    return {
      evidenceId: "e1",
      assetId: "apple",
      evidenceType: "officialFiling",
      sourceTier: 1,
      sourceName: "Filing",
      sourceRef: "ref",
      publicationDate: "2026-07-20T00:00:00Z",
      retrievedAt: NOW,
      effectiveDate: "2026-07-20T00:00:00Z",
      expiresAt: null,
      factor: "valuation",
      claimKey: null,
      factualClaim: "claim",
      normalizedValue: 70,
      unit: "score",
      confidence: 90,
      verificationStatus: "verified",
      conflictGroupId: null,
      notes: null,
      ...overrides,
    };
  }

  it("blocks an asset whose critical-factor evidence has all expired", () => {
    const expired = evidence({
      publicationDate: "2024-01-01T00:00:00Z",
      effectiveDate: "2024-01-01T00:00:00Z",
    });
    const issues = validateNormalizedEvidence([expired], new Date(NOW));
    const stale = issues.find((i) => i.code === "stale_critical_evidence");
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe("blocking");
    expect(stale!.assetId).toBe("apple");
  });

  it("passes when at least one critical record is usable", () => {
    const issues = validateNormalizedEvidence([evidence()], new Date(NOW));
    expect(issues.filter((i) => i.code === "stale_critical_evidence")).toHaveLength(0);
  });

  it("warns when the same claim spans multiple fiscal periods", () => {
    const issues = validateNormalizedEvidence(
      [
        evidence({ evidenceId: "e1", claimKey: "eps", notes: "fiscal:2025Q4" }),
        evidence({ evidenceId: "e2", claimKey: "eps", notes: "fiscal:2026Q1" }),
      ],
      new Date(NOW),
    );
    const conflict = issues.find((i) => i.code === "conflicting_fiscal_period");
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe("warning");
  });
});

describe("universe-inputs validation", () => {
  function inputs(overrides: Partial<UniverseInputs> = {}): UniverseInputs {
    return {
      now: NOW,
      mode: "demo",
      entries: [],
      evidence: [],
      cashPosition: {
        available: 1,
        emergencyReserve: 1,
        deployable: 0,
        monthlySurplus: 0,
        targetReserve: 1,
        cashYieldPct: 4,
        inflationPct: 2,
      },
      macro: { regime: "x", riskScore: 10, macroContext: "x", regions: [] },
      portfolio: { holdings: [], allocations: {}, liquidityRisk: 10, tierTargets: [] },
      editorial: {
        commentary: "x",
        goldRole: "x",
        cashOpportunityCost: "x",
        cashRecommendation: "x",
        reserveRequirement: "x",
      },
      journalHistory: [],
      previous: null,
      ...overrides,
    };
  }

  it("blocks an empty universe", () => {
    const issues = validateUniverseInputs(inputs());
    expect(issues.map((i) => i.code)).toContain("no_usable_evidence");
  });

  it("blocks a valuation that cannot be reproduced", () => {
    const issues = validateUniverseInputs(
      inputs({
        entries: [
          {
            asset: {
              assetId: "apple",
              name: "Apple",
              kind: "instrument",
              ticker: "AAPL",
              exchange: "NASDAQ",
              currency: "USD",
              assetClass: "Equity",
              category: "x",
              sector: null,
              industry: null,
              country: "US",
              region: "US",
              benchmark: null,
              status: "active",
              sourceIdentifiers: {},
            },
            valuationInput: {
              method: "earningsMultiple",
              calculationDate: NOW,
              currency: "USD",
              marketPrice: 100,
              // No cited evidence and no assumptions: not reproducible.
              evidenceIds: [],
              confidence: 80,
              assumptions: [],
              invalidationConditions: [],
              eps: 10,
              conservativeMultiple: 10,
              baseMultiple: 12,
              optimisticMultiple: 14,
            },
          },
        ],
      }),
    );
    const issue = issues.find((i) => i.code === "non_reproducible_valuation_input");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("blocking");
  });

  it("warns when allocations exceed 100%", () => {
    const issues = validateUniverseInputs(
      inputs({
        entries: [],
        portfolio: { holdings: [], allocations: { a: 0.7, b: 0.6 }, liquidityRisk: 1, tierTargets: [] },
      }),
    );
    expect(issues.map((i) => i.code)).toContain("malformed_numeric_value");
  });
});

/** Ingestion receives payloads without a checksum; it computes its own. */
function stripChecksum(record: RawEvidenceRecord): Omit<RawEvidenceRecord, "checksum"> {
  const copy: Omit<RawEvidenceRecord, "checksum"> = { ...record };
  delete (copy as Partial<RawEvidenceRecord>).checksum;
  return copy;
}
