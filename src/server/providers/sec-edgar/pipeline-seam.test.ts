// @vitest-environment node
import { describe, expect, it } from "vitest";
import companyFactsFixture from "@/server/providers/sec-edgar/fixtures/fixture-issuer-companyfacts.json";
import { companyFactsSchema } from "@/server/providers/sec-edgar/types";
import { mapCompanyFacts } from "@/server/providers/sec-edgar/map";
import { normalizeRecord, type NormalizationContext } from "@/intelligence/normalization/normalize";
import type { IdentityResolution } from "@/intelligence/types/identity";
import type { EvidenceRecord } from "@/engine/models";
import { effectiveConfidence, freshnessOf } from "@/engine/evidence";
import { readFundamentals, valuationFromFilings } from "@/server/valuation/from-filings";

/**
 * The seam: EDGAR mapper → normalizer → fundamental analysis.
 *
 * This test exists because its absence let a defect reach production. The
 * mapper was tested against EDGAR's vocabulary, and the valuation was tested
 * against the same vocabulary, and both passed — but the normalizer sits
 * between them and speaks a third one. On the first live run it rejected 70 of
 * 78 records as `unsupported_unit`, leaving only the value-less filing records,
 * and the report came back `insufficient_evidence`.
 *
 * Two components agreeing with each other proves nothing when neither talks to
 * the thing that sits between them. So this walks the whole path with no
 * shortcuts and asserts on what comes out the far end.
 */

const NOW = "2024-11-15T09:00:00.000Z";

const CONTEXT: NormalizationContext = {
  now: NOW,
  baseCurrency: "USD",
  // Empty on purpose: EDGAR reports USD and the base currency is USD, so no
  // conversion should be attempted. A rate table would hide a currency bug.
  fxTable: [],
};

const MATCHED: IdentityResolution = {
  outcome: "matched",
  assetId: "apple",
  method: "provider_id",
  confidence: 100,
  matchedIdentifiers: ["SEC-CIK-0001234567"],
  candidates: [],
  warnings: [],
  conflictingAssetIds: [],
};

/** Walk the real path: map, then normalize each record exactly as the cycle does. */
function runPipeline(now: string = NOW): { evidence: EvidenceRecord[]; rejected: string[] } {
  const facts = companyFactsSchema.parse(companyFactsFixture);
  const mapped = mapCompanyFacts(facts, {
    ticker: "FIXT",
    exchange: "NASDAQ",
    retrievedAt: now,
    responseLastModified: null,
  });
  const context: NormalizationContext = { ...CONTEXT, now };

  const evidence: EvidenceRecord[] = [];
  const rejected: string[] = [];
  for (const record of mapped.records) {
    const outcome = normalizeRecord(record, MATCHED, context);
    if (outcome.normalized === null) {
      const reason = outcome.issues.find((i) => i.severity === "blocking");
      rejected.push(`${record.rawEvidenceId}: ${reason?.code ?? "unknown"} — ${reason?.detail ?? ""}`);
      continue;
    }
    evidence.push(outcome.normalized.evidence);
  }
  return { evidence, rejected };
}

describe("EDGAR → normalizer → valuation", () => {
  const { evidence, rejected } = runPipeline();

  it("normalizes every mapped record — none rejected", () => {
    // The exact failure seen in production: valued records dropped wholesale.
    expect(rejected).toEqual([]);
    expect(evidence.length).toBeGreaterThan(10);
  });

  it("carries currency values through instead of discarding them", () => {
    const revenue = evidence.find((r) => r.claimKey === "revenue:2024-09-28");
    expect(revenue).toBeDefined();
    // A record asserting revenue of 400bn but holding no number is useless to
    // the valuation that needs it.
    expect(revenue?.normalizedValue).toBe(400_000_000_000);
    expect(revenue?.unit).toBe("currency");
  });

  it("keeps currency amounts out of factor scoring entirely", () => {
    // Engine scoring selects on a non-null factor. A revenue figure entering a
    // 0–100 factor scale would be catastrophic and invisible.
    const currencyRecords = evidence.filter(
      (r) => r.unit === "currency" || r.unit === "currency_per_share",
    );
    expect(currencyRecords.length).toBeGreaterThan(5);
    for (const record of currencyRecords) {
      expect(record.factor, `${record.evidenceId} must not be a factor input`).toBeNull();
    }
  });

  it("preserves the claim keys the valuation matches on", () => {
    const keys = evidence.map((r) => r.claimKey);
    expect(keys).toContain("epsDiluted:2024-09-28");
    expect(keys).toContain("stockholdersEquity:2024-09-28");
    expect(keys).toContain("sharesOutstanding:2024-09-28");
  });

  it("reads the fundamentals back out of normalized evidence", () => {
    const f = readFundamentals(evidence);
    expect(f.epsDiluted).toBe(6.25);
    expect(f.revenueLatest).toBe(400_000_000_000);
    expect(f.revenuePeriods).toBe(3);
    expect(f.sharesOutstanding).toBe(1_000_000_000);
    expect(f.stockholdersEquity).toBe(60_000_000_000);
    expect(f.currency).toBe("USD");
  });

  it("produces a valuation from the filings, end to end", () => {
    const result = valuationFromFilings(evidence, 212.5, NOW);
    expect(result.input).not.toBeNull();
    if (result.input?.method !== "earningsMultiple") throw new Error("expected earningsMultiple");
    expect(result.input.eps).toBe(6.25);
    expect(result.input.currency).toBe("USD");
    expect(result.input.conservativeMultiple).toBeLessThan(result.input.baseMultiple);
    // It cites the evidence it used, so the valuation is traceable to filings.
    expect(result.input.evidenceIds.length).toBeGreaterThan(5);
  });

  it("records the tier-1 provenance the engine trusts most", () => {
    for (const record of evidence) {
      expect(record.sourceTier).toBe(1);
      expect(record.verificationStatus).toBe("verified");
      expect(record.sourceRef).toMatch(/^https:\/\/www\.sec\.gov\//);
    }
  });
});

/**
 * The production case: annual accounts many months old.
 *
 * This is what actually failed on the first live run. The official-filing
 * freshness horizon is 120 days with expiry at 240, which suits a quarterly
 * filing. A 10-K is annual, so for most of any year the most recent one is
 * past 240 days — every fundamental was dropped as expired and no valuation
 * could be built. The fixture's own dates were recent enough to hide it.
 */
describe("annual accounts months after the period end", () => {
  // Fiscal year ended 2024-09-28; this is ~10 months later, well past the
  // 240-day expiry that would previously have discarded everything.
  const TEN_MONTHS_LATER = "2025-07-25T09:00:00.000Z";
  const { evidence, rejected } = runPipeline(TEN_MONTHS_LATER);

  it("still normalizes every record", () => {
    expect(rejected).toEqual([]);
  });

  it("does not treat the only annual accounts that exist as expired", () => {
    const now = new Date(TEN_MONTHS_LATER);
    const revenue = evidence.find((r) => r.claimKey === "revenue:2024-09-28");
    expect(revenue).toBeDefined();
    expect(freshnessOf(revenue!, now)).not.toBe("expired");
  });

  it("reports them as stale, because they genuinely are old", () => {
    // Kept, but not pretended to be current: confidence decays and the UI says
    // so. Discarding them and valuing nothing is the worse answer.
    const now = new Date(TEN_MONTHS_LATER);
    const revenue = evidence.find((r) => r.claimKey === "revenue:2024-09-28");
    expect(freshnessOf(revenue!, now)).toBe("stale");
    expect(effectiveConfidence(revenue!, now)).toBeLessThan(revenue!.confidence);
  });

  it("expires the older periods while keeping the latest, which is correct", () => {
    const now = new Date(TEN_MONTHS_LATER);
    const usable = evidence.filter((r) => freshnessOf(r, now) !== "expired");
    // Prior fiscal years have been superseded and should drop out; the most
    // recent set must not.
    expect(usable.some((r) => r.claimKey === "revenue:2024-09-28")).toBe(true);
    expect(usable.some((r) => r.claimKey === "revenue:2022-10-01")).toBe(false);
    expect(usable.length).toBeGreaterThan(8);
  });

  it("still produces a valuation from what survives the filter", () => {
    // The production path: the universe builder drops expired evidence before
    // the valuation ever sees it, so the valuation must work on the remainder.
    const now = new Date(TEN_MONTHS_LATER);
    const usable = evidence.filter((r) => freshnessOf(r, now) !== "expired");
    const result = valuationFromFilings(usable, 212.5, TEN_MONTHS_LATER);
    expect(result.input).not.toBeNull();
    if (result.input?.method !== "earningsMultiple") throw new Error("expected earningsMultiple");
    expect(result.input.eps).toBe(6.25);
  });

  it("drops the growth credit rather than inventing one when history expires", () => {
    const now = new Date(TEN_MONTHS_LATER);
    const usable = evidence.filter((r) => freshnessOf(r, now) !== "expired");
    const f = readFundamentals(usable);
    // Only the latest year survives, so there is no series to measure growth
    // from. The assumption list must say so instead of assuming a rate.
    expect(f.revenuePeriods).toBe(1);
    const result = valuationFromFilings(usable, 212.5, TEN_MONTHS_LATER);
    expect(result.input?.assumptions.join(" ")).toMatch(/no growth adjustment applied/);
  });

  it("does eventually expire, when nothing newer has been filed", () => {
    // Past the point where the next annual report was long overdue, the
    // figures stop being authoritative and the asset falls to the engine's
    // insufficient-evidence gate.
    const twoYearsLater = new Date("2026-11-01T00:00:00.000Z");
    const revenue = evidence.find((r) => r.claimKey === "revenue:2024-09-28");
    expect(freshnessOf(revenue!, twoYearsLater)).toBe("expired");
  });
});
