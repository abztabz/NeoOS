import { describe, expect, it } from "vitest";
import { rawEvidenceRecordSchema } from "@/intelligence/types/raw-evidence";
import { normalizeRecord } from "@/intelligence/normalization/normalize";
import {
  FREE_PRICE_PROVIDER_ID,
  FreePriceAdapter,
} from "@/server/providers/prices/free-adapter";

/**
 * These tests exist because the previous attempt at this wired a provider to
 * the wrong pipeline and nothing changed on screen. So they assert the *chain*,
 * not the fetch: that a record this adapter emits carries the `price:` claimKey
 * `marketPriceFrom()` selects on, and normalizes to the `marketData` type that
 * `priceEvidenceFor()` requires. Either one silently changing would restore the
 * original bug with every unit test still green.
 */

const HEADER = "Symbol,Date,Time,Open,High,Low,Close,Volume";
const CLOSE = `${HEADER}\nAAPL.US,2026-07-30,22:00:04,330.00,335.00,329.00,333.43,45000000`;

const NOW = Date.parse("2026-07-31T12:00:00Z");

function adapterReturning(body: string, status = 200) {
  const fetchImpl = (async () =>
    new Response(body, { status, headers: { "content-type": "text/csv" } })) as typeof fetch;
  return new FreePriceAdapter({ fetchImpl, now: () => NOW });
}

const request = { assetIds: ["apple"], asOf: "2026-07-31T12:00:00Z" };

describe("free price adapter", () => {
  it("is configured without credentials but never claims to be authenticated", () => {
    const d = new FreePriceAdapter().describe();
    expect(d.configured).toBe(true);
    expect(d.authenticated).toBe(false);
    expect(d.capabilities).toContain("prices");
  });

  it("emits a schema-valid raw evidence record", async () => {
    const result = await adapterReturning(CLOSE).fetch(request);
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(rawEvidenceRecordSchema.safeParse(result.records[0]).success).toBe(true);
  });

  it("reports live only when something was actually retrieved", async () => {
    const ok = await adapterReturning(CLOSE).fetch(request);
    expect(ok.mode).toBe("live");

    const failed = await adapterReturning("", 503).fetch(request);
    expect(failed.mode).toBe("error");
    expect(failed.ok).toBe(false);
    expect(failed.records).toHaveLength(0);
    expect(failed.failureReason).toMatch(/503/);
  });

  it("carries the price: claimKey that populates valuation marketPrice", async () => {
    // `marketPriceFrom()` in server/api/run.ts selects on this prefix. If the
    // key drifts, valuations silently lose their market price.
    const result = await adapterReturning(CLOSE).fetch(request);
    const record = result.records[0] as { payloadMetadata: Record<string, unknown> };
    expect(record.payloadMetadata.claimKey).toBe("price:apple");
  });

  it("normalizes to the marketData type that priceEvidenceFor requires", async () => {
    const result = await adapterReturning(CLOSE).fetch(request);
    const parsed = rawEvidenceRecordSchema.parse(result.records[0]);

    const outcome = normalizeRecord(
      parsed,
      {
        outcome: "matched",
        assetId: "apple",
        method: "exact_ticker_exchange",
        confidence: 100,
        matchedIdentifiers: ["AAPL"],
        candidates: [],
        warnings: [],
        conflictingAssetIds: [],
      },
      { now: request.asOf, baseCurrency: "USD", fxTable: [] },
    );

    const evidence = outcome.normalized?.evidence;
    expect(evidence).toBeDefined();
    expect(evidence?.evidenceType).toBe("marketData");
    expect(evidence?.normalizedValue).toBe(333.43);
    // priceEvidenceFor() also demands verified status and a non-empty source.
    expect(evidence?.verificationStatus).toBe("verified");
    expect(evidence?.sourceName.length).toBeGreaterThan(0);
    expect(evidence?.sourceRef.length).toBeGreaterThan(0);
  });

  it("timestamps the close at the session close, not the fetch time", async () => {
    const result = await adapterReturning(CLOSE).fetch(request);
    const parsed = rawEvidenceRecordSchema.parse(result.records[0]);
    expect(parsed.publishedAt).toBe("2026-07-30T16:00:00-04:00");
  });

  it("returns no record for an asset no free source covers", async () => {
    const result = await adapterReturning(CLOSE).fetch({
      assetIds: ["ai-basket"],
      asOf: request.asOf,
    });
    expect(result.records).toHaveLength(0);
    expect(result.mode).toBe("error");
  });

  it("attributes every record to the free provider", async () => {
    const result = await adapterReturning(CLOSE).fetch(request);
    const parsed = rawEvidenceRecordSchema.parse(result.records[0]);
    expect(parsed.providerId).toBe(FREE_PRICE_PROVIDER_ID);
    expect(parsed.providerMode).toBe("live");
  });
});
