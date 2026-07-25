import { describe, expect, it, vi } from "vitest";
import companyFactsFixture from "@/server/providers/sec-edgar/fixtures/fixture-issuer-companyfacts.json";
import submissionsFixture from "@/server/providers/sec-edgar/fixtures/fixture-issuer-submissions.json";
import raggedFixture from "@/server/providers/sec-edgar/fixtures/fixture-issuer-submissions-ragged.json";
import { EdgarClient, EDGAR_MAX_ATTEMPTS, type FetchLike } from "@/server/providers/sec-edgar/client";
import { mapCompanyFacts, mapSubmissions } from "@/server/providers/sec-edgar/map";
import { SecEdgarAdapter, EDGAR_NON_COVERAGE } from "@/server/providers/sec-edgar/adapter";
import { companyFactsSchema, submissionsSchema, padCik, filingUrl } from "@/server/providers/sec-edgar/types";
import { verifyChecksum } from "@/intelligence/ingestion/ingest";
import { isSupportedUnit } from "@/intelligence/normalization/units";

/**
 * Contract tests for the EDGAR provider.
 *
 * These run entirely against the recorded fixtures — see
 * `fixtures/README.md`, which is explicit that the fixtures are hand-authored
 * to EDGAR's documented shape rather than captured from the live endpoint. No
 * test here touches the network, deliberately: a suite whose result depends on
 * a public agency's uptime is a suite that fails for reasons unrelated to the
 * code under test.
 */

const RETRIEVED_AT = "2026-07-25T09:00:00.000Z";
const MAP_OPTIONS = {
  ticker: "FIXT",
  exchange: "NASDAQ",
  retrievedAt: RETRIEVED_AT,
  responseLastModified: "Fri, 01 Nov 2024 21:00:00 GMT",
};

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

/** No real waiting: the client's sleep is injected so retries run instantly. */
function testClient(fetchImpl: FetchLike, now = () => Date.parse(RETRIEVED_AT)) {
  return new EdgarClient({
    userAgent: "NeoOS CIO test suite contact@example.com",
    fetchImpl,
    now,
    sleep: async () => undefined,
  });
}

describe("EDGAR response schemas", () => {
  it("accepts the documented company-facts shape", () => {
    expect(companyFactsSchema.safeParse(companyFactsFixture).success).toBe(true);
  });

  it("accepts the documented submissions shape", () => {
    expect(submissionsSchema.safeParse(submissionsFixture).success).toBe(true);
  });

  it("pads a CIK to the ten digits EDGAR's paths require", () => {
    expect(padCik(320193)).toBe("0000320193");
    expect(padCik("0000320193")).toBe("0000320193");
  });

  it("builds a citation URL with the accession number stripped of dashes", () => {
    expect(filingUrl("0001234567", "0001234567-24-000010", "fixt-20240928.htm")).toBe(
      "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000010/fixt-20240928.htm",
    );
  });
});

describe("EdgarClient", () => {
  it("sends the SEC-required User-Agent on every request", async () => {
    const seen: string[] = [];
    const client = testClient(async (_url, init) => {
      seen.push(String(new Headers(init?.headers).get("user-agent")));
      return jsonResponse(companyFactsFixture);
    });
    await client.companyFacts("0001234567");
    expect(seen).toEqual(["NeoOS CIO test suite contact@example.com"]);
  });

  it("reports a 403 as rate_limited and names the likely cause", async () => {
    const client = testClient(async () => new Response("", { status: 403 }));
    const result = await client.companyFacts("0001234567");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("rate_limited");
    expect(result.message).toMatch(/User-Agent/);
  });

  it("retries a transient server error and succeeds", async () => {
    let calls = 0;
    const client = testClient(async () => {
      calls++;
      return calls < 3 ? new Response("", { status: 503 }) : jsonResponse(companyFactsFixture);
    });
    const result = await client.companyFacts("0001234567");
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("gives up after the attempt ceiling", async () => {
    let calls = 0;
    const client = testClient(async () => {
      calls++;
      return new Response("", { status: 500 });
    });
    const result = await client.companyFacts("0001234567");
    expect(result.ok).toBe(false);
    expect(calls).toBe(EDGAR_MAX_ATTEMPTS);
  });

  it("does not retry a 404, because it is a settled answer", async () => {
    let calls = 0;
    const client = testClient(async () => {
      calls++;
      return new Response("", { status: 404 });
    });
    const result = await client.companyFacts("0009999999");
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("refuses an unrecognised payload rather than deriving fundamentals from it", async () => {
    let calls = 0;
    const client = testClient(async () => {
      calls++;
      return jsonResponse({ cik: "not a number", facts: "unexpected" });
    });
    const result = await client.companyFacts("0001234567");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("malformed_response");
    // A shape change will not repair itself, so hammering EDGAR is pointless.
    expect(calls).toBe(1);
  });

  it("classifies an abort as a timeout", async () => {
    const client = testClient(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const result = await client.companyFacts("0001234567");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("timeout");
  });

  it("spaces concurrent requests to respect fair access", async () => {
    let clock = 0;
    const slept: number[] = [];
    const client = new EdgarClient({
      userAgent: "NeoOS CIO test suite contact@example.com",
      fetchImpl: async () => jsonResponse(companyFactsFixture),
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    await Promise.all([
      client.companyFacts("0001234567"),
      client.companyFacts("0001234567"),
      client.companyFacts("0001234567"),
    ]);
    // The first request is free; each subsequent one waits out the spacing.
    expect(slept.filter((ms) => ms > 0)).toHaveLength(2);
  });
});

describe("mapCompanyFacts", () => {
  const parsed = companyFactsSchema.parse(companyFactsFixture);
  const mapped = mapCompanyFacts(parsed, MAP_OPTIONS);

  function valuesFor(key: string) {
    return mapped.records
      .filter((r) => r.payloadMetadata.conceptKey === key)
      .map((r) => ({ end: (r.rawPayload as { periodEnd: string }).periodEnd, val: r.rawValue }));
  }

  it("prefers the current revenue tag over the legacy one the filer still carries", () => {
    expect(mapped.tagsUsed.revenue).toBe("RevenueFromContractWithCustomerExcludingAssessedTax");
    // The legacy Revenues tag holds 300000000000 for FY2022; the current tag
    // holds 360000000000. Reporting the stale figure would be the failure.
    expect(valuesFor("revenue")).toContainEqual({ end: "2022-10-01", val: 360000000000 });
  });

  it("takes the restated value, because it is the company's current position", () => {
    const fy2023 = valuesFor("netIncome").find((v) => v.end === "2023-09-30");
    expect(fy2023?.val).toBe(90000000000);
    // And it appears exactly once, not twice.
    expect(valuesFor("netIncome").filter((v) => v.end === "2023-09-30")).toHaveLength(1);
  });

  it("excludes quarterly cash flow reported on a 10-Q", () => {
    expect(valuesFor("operatingCashFlow").map((v) => v.end)).not.toContain("2024-06-29");
  });

  it("excludes a Q4 comparative that sits inside the annual report", () => {
    const q4 = valuesFor("operatingCashFlow").find((v) => v.val === 28000000000);
    expect(q4).toBeUndefined();
  });

  it("warns by name when a concept has no usable tag, and emits no record", () => {
    expect(mapped.tagsUsed.liabilities).toBeUndefined();
    expect(valuesFor("liabilities")).toHaveLength(0);
    expect(mapped.warnings.some((w) => w.includes("Total liabilities"))).toBe(true);
  });

  it("reads concepts from the dei taxonomy as well as us-gaap", () => {
    expect(valuesFor("sharesOutstanding").map((v) => v.val)).toContain(1000000000);
  });

  it("preserves EDGAR's values exactly and translates only the unit's name", () => {
    const eps = mapped.records.find((r) => r.payloadMetadata.conceptKey === "epsDiluted");
    // The value is untouched; the unit is stated in the pipeline's vocabulary,
    // because the normalizer refuses any unit outside its canonical set.
    expect(eps?.rawValue).toBe(6.25);
    expect(eps?.rawUnit).toBe("currency_per_share");
    expect((eps?.rawPayload as { edgarUnit: string }).edgarUnit).toBe("USD/shares");

    const shares = mapped.records.find((r) => r.payloadMetadata.conceptKey === "sharesOutstanding");
    expect(shares?.rawUnit).toBe("count");
    expect((shares?.rawPayload as { edgarUnit: string }).edgarUnit).toBe("shares");
    expect(shares?.rawCurrency).toBeNull();

    const revenue = mapped.records.find((r) => r.payloadMetadata.conceptKey === "revenue");
    expect(revenue?.rawUnit).toBe("currency");
    expect(revenue?.rawCurrency).toBe("USD");
  });

  it("emits only units the normalizer accepts", () => {
    // The whole record set is worthless if the pipeline rejects it, which is
    // exactly what happened on the first live run: every valued record was
    // dropped as unsupported_unit and only the value-less filings survived.
    for (const record of mapped.records) {
      if (record.rawValue === null) continue;
      expect(isSupportedUnit(record.rawUnit), `${record.rawEvidenceId} unit ${record.rawUnit}`).toBe(true);
    }
  });

  /** Records taken straight from a filing, as opposed to derived from several. */
  const filedRecords = mapped.records.filter((r) => r.payloadMetadata.derived !== true);
  const derivedRecords = mapped.records.filter((r) => r.payloadMetadata.derived === true);

  it("cites the accession number of the filing every FILED value came from", () => {
    expect(filedRecords.length).toBeGreaterThan(10);
    for (const record of filedRecords) {
      expect(record.sourceRef).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
      expect((record.rawPayload as { accessionNumber: string }).accessionNumber).toMatch(/^\d{10}-\d{2}-\d{6}$/);
    }
  });

  it("asserts no confidence on a FILED figure, because EDGAR states none", () => {
    expect(filedRecords.every((r) => r.rawConfidence === null)).toBe(true);
  });

  it("marks derived scores as derived and cites the records behind them", () => {
    // A derived score has no single accession number — it is arithmetic over
    // several filed figures — so it cites those records instead, and still
    // points at the filing they came from.
    expect(derivedRecords.length).toBeGreaterThan(0);
    for (const record of derivedRecords) {
      expect(record.sourceRef).toMatch(/^https:\/\/www\.sec\.gov\//);
      expect((record.rawPayload as { computedFrom: string[] }).computedFrom.length).toBeGreaterThan(0);
      expect(record.rawUnit).toBe("score");
      // Stated confidence, below the tier-1 default: audited inputs, our
      // thresholds. A filed figure asserts none; a derived one must.
      expect(record.rawConfidence).not.toBeNull();
      expect(record.rawConfidence!).toBeLessThan(92);
    }
  });

  it("marks every record live, since it was genuinely retrieved", () => {
    expect(mapped.records.every((r) => r.providerMode === "live")).toBe(true);
  });

  it("produces records whose checksums verify", () => {
    expect(mapped.records.every((r) => verifyChecksum(r))).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const again = mapCompanyFacts(parsed, MAP_OPTIONS);
    expect(JSON.stringify(again.records)).toBe(JSON.stringify(mapped.records));
  });

  it("dates publication from the filing acceptance date, not retrieval", () => {
    const latest = mapped.records.find(
      (r) => r.payloadMetadata.conceptKey === "revenue" && r.payloadMetadata.isLatestAnnual === true,
    );
    expect(latest?.publishedAt).toBe("2024-11-01T00:00:00Z");
    expect(latest?.retrievedAt).toBe(RETRIEVED_AT);
  });
});

describe("mapSubmissions", () => {
  it("zips the parallel columns and keeps only periodic and current reports", () => {
    const parsed = submissionsSchema.parse(submissionsFixture);
    const mapped = mapSubmissions(parsed, MAP_OPTIONS);
    const forms = mapped.records.map((r) => (r.rawPayload as { form: string }).form);
    expect(forms).toEqual(["10-K", "10-Q", "10-Q", "10-K"]);
    // Form 4 is an insider-ownership report, not disclosure about the business.
    expect(forms).not.toContain("4");
  });

  it("refuses a response whose columns disagree in length", () => {
    const parsed = submissionsSchema.parse(raggedFixture);
    const mapped = mapSubmissions(parsed, MAP_OPTIONS);
    // Pairing the wrong form with the wrong date is worse than no records.
    expect(mapped.records).toHaveLength(0);
    expect(mapped.warnings[0]).toMatch(/disagree in length/);
  });
});

describe("SecEdgarAdapter", () => {
  const coverage = [{ assetId: "apple", cik: "0001234567", ticker: "FIXT", exchange: "NASDAQ" }];

  function adapterWith(fetchImpl: FetchLike) {
    return new SecEdgarAdapter({
      userAgent: "NeoOS CIO test suite contact@example.com",
      fetchImpl,
      now: () => Date.parse(RETRIEVED_AT),
      sleep: async () => undefined,
      coverage,
    });
  }

  const routed: FetchLike = async (url) =>
    url.includes("/submissions/") ? jsonResponse(submissionsFixture) : jsonResponse(companyFactsFixture);

  it("stays disabled without a User-Agent, and explains why", () => {
    const adapter = new SecEdgarAdapter({ userAgent: "  ", coverage });
    const descriptor = adapter.describe();
    expect(descriptor.mode).toBe("disabled");
    expect(descriptor.configured).toBe(false);
    expect(descriptor.failureReason).toMatch(/SEC_EDGAR_USER_AGENT/);
  });

  it("attempts no request at all while unconfigured", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(companyFactsFixture));
    const adapter = new SecEdgarAdapter({ userAgent: "", fetchImpl, coverage });
    const result = await adapter.fetch({ assetIds: ["apple"], asOf: RETRIEVED_AT });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.mode).toBe("disabled");
    expect(result.records).toHaveLength(0);
  });

  it("enters at evidence tier 1 as an official filing source", () => {
    expect(adapterWith(routed).describe().sourceTier).toBe(1);
  });

  it("claims no price capability — EDGAR does not know what a share is worth", () => {
    expect(adapterWith(routed).describe().capabilities).not.toContain("prices");
  });

  it("retrieves fundamentals and filings for a covered asset", async () => {
    const result = await adapterWith(routed).fetch({ assetIds: ["apple"], asOf: RETRIEVED_AT });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("live");
    expect(result.records.length).toBeGreaterThan(10);
    expect(result.records.some((r) => (r as { evidenceCategory: string }).evidenceCategory === "filing")).toBe(true);
  });

  it("explains an uncovered asset instead of failing silently", async () => {
    const result = await adapterWith(routed).fetch({
      assetIds: ["apple", "gold", "uae-equity"],
      asOf: RETRIEVED_AT,
    });
    expect(result.warnings.some((w) => w.startsWith("gold:"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Securities and Commodities Authority"))).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("names a reason for every asset it deliberately does not cover", () => {
    for (const [assetId, reason] of Object.entries(EDGAR_NON_COVERAGE)) {
      expect(reason.length, assetId).toBeGreaterThan(20);
    }
  });

  it("reports mode error, not live, when every request fails", async () => {
    const result = await adapterWith(async () => new Response("", { status: 500 })).fetch({
      assetIds: ["apple"],
      asOf: RETRIEVED_AT,
    });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("error");
    expect(result.records).toHaveLength(0);
    expect(result.failureReason).toBeTruthy();
  });

  it("degrades to partial rather than failing when only the facts endpoint breaks", async () => {
    const result = await adapterWith(async (url) =>
      url.includes("/submissions/") ? jsonResponse(submissionsFixture) : new Response("", { status: 500 }),
    ).fetch({ assetIds: ["apple"], asOf: RETRIEVED_AT });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("company facts unavailable"))).toBe(true);
    // Filing history still arrived, so the run is partial, not empty.
    expect(result.records.length).toBeGreaterThan(0);
  });
});
