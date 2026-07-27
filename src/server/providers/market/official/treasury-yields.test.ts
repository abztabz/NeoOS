import { describe, expect, it } from "vitest";
import {
  parseTreasuryRecord,
  TreasuryYieldProvider,
} from "@/server/providers/market/official/treasury-yields";

/**
 * Contract tests for the U.S. Treasury Fiscal Data adapter. Hermetic: the
 * response is a fixture, `fetchImpl` is injected, nothing leaves the process.
 *
 * The fixture mirrors the documented Fiscal Data envelope, including the detail
 * that numeric fields arrive as strings. That is not incidental — `Number("")`
 * is zero, and a zero interest rate accepted silently would be indistinguishable
 * from a real one, so the parser has to refuse it explicitly.
 */

const treasuryFixture = {
  data: [
    {
      record_date: "2026-06-30",
      security_type_desc: "Marketable",
      security_desc: "Total Marketable",
      avg_interest_rate_amt: "3.351",
    },
  ],
  meta: { count: 1 },
  links: { self: "&page%5Bnumber%5D=1&page%5Bsize%5D=1" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const NOW = Date.parse("2026-07-24T12:00:00Z");

describe("parseTreasuryRecord", () => {
  it("converts the string rate and keeps the record date", () => {
    expect(parseTreasuryRecord(treasuryFixture)).toEqual({
      recordDate: "2026-06-30",
      rate: 3.351,
    });
  });

  it("refuses an empty or non-numeric rate rather than reading it as zero", () => {
    const blank = { data: [{ record_date: "2026-06-30", avg_interest_rate_amt: "" }] };
    const words = { data: [{ record_date: "2026-06-30", avg_interest_rate_amt: "null" }] };
    expect(parseTreasuryRecord(blank)).toBeNull();
    expect(parseTreasuryRecord(words)).toBeNull();
  });

  it("returns null for an empty or malformed envelope", () => {
    expect(parseTreasuryRecord({ data: [] })).toBeNull();
    expect(parseTreasuryRecord({})).toBeNull();
    expect(parseTreasuryRecord(null)).toBeNull();
  });

  it("requires a record date, because an undated rate cannot be aged", () => {
    expect(parseTreasuryRecord({ data: [{ avg_interest_rate_amt: "3.351" }] })).toBeNull();
  });
});

describe("TreasuryYieldProvider", () => {
  it("declares itself free and needing no credentials", () => {
    const descriptor = new TreasuryYieldProvider({ series: [] }).describe();
    expect(descriptor.requiresPaidSubscription).toBe(false);
    expect(descriptor.requiresCredentials).toBe(false);
    expect(descriptor.configured).toBe(true);
    expect(descriptor.assetClasses).toContain("government_bond_yield");
  });

  it("states the series accurately rather than as a par yield curve", () => {
    const descriptor = new TreasuryYieldProvider({ series: [] }).describe();
    // Naming it accurately matters more than naming it impressively: a reader
    // who thinks this is today's 10-year yield will misread every comparison.
    expect(descriptor.attribution).toContain("not the daily par yield curve");
  });

  it("observes the rate as a percent per annum, dated by the record", async () => {
    const provider = new TreasuryYieldProvider({
      series: [{ assetId: "us-treasury-marketable", securityDescription: "Total Marketable" }],
      fetchImpl: async () => jsonResponse(treasuryFixture),
      now: () => NOW,
    });

    const { observations, failures } = await provider.observe({
      assetIds: ["us-treasury-marketable"],
      asOf: "2026-07-24T12:00:00Z",
      horizon: "strategic",
    });

    expect(failures).toHaveLength(0);
    const observation = observations[0]!;
    expect(observation.price).toBe(3.351);
    // A rate is not a price, and the unit is what stops the two being compared.
    expect(observation.priceUnit).toBe("percent_per_annum");
    expect(observation.currency).toBe("USD");
    expect(observation.observedAt).toBe("2026-06-30T00:00:00Z");
    expect(observation.sourceClass).toBe("official_primary");
    expect(observation.observationClass).toBe("latest_official");
  });

  it("percent-encodes bracketed query parameters so proxies do not mangle them", async () => {
    let requested = "";
    const provider = new TreasuryYieldProvider({
      series: [{ assetId: "us-treasury-marketable", securityDescription: "Total Marketable" }],
      fetchImpl: async (url) => {
        requested = url;
        return jsonResponse(treasuryFixture);
      },
      now: () => NOW,
    });

    await provider.observe({
      assetIds: ["us-treasury-marketable"],
      asOf: "2026-07-24T12:00:00Z",
      horizon: "daily",
    });

    expect(requested).toContain("page%5Bsize%5D=1");
    expect(requested).not.toContain("page[size]");
  });

  it("distinguishes an unmapped series from a provider failure", async () => {
    const provider = new TreasuryYieldProvider({
      series: [{ assetId: "us-treasury-marketable", securityDescription: "Total Marketable" }],
      fetchImpl: async () => jsonResponse(treasuryFixture),
      now: () => NOW,
    });

    const { failures } = await provider.observe({
      assetIds: ["some-other-series"],
      asOf: "2026-07-24T12:00:00Z",
      horizon: "daily",
    });
    expect(failures[0]!.kind).toBe("instrument_not_covered");
  });

  it("reports blocked egress on the descriptor without removing the provider", () => {
    const descriptor = new TreasuryYieldProvider({
      series: [],
      egressBlockedReason: "This is a CI environment with egress deliberately disabled.",
    }).describe();

    // Still listed, still free, still credential-free — only unreachable. A
    // provider that vanished here could not explain why the outage is not a
    // licensing problem.
    expect(descriptor.configured).toBe(true);
    expect(descriptor.requiresPaidSubscription).toBe(false);
    expect(descriptor.unavailableReason).toContain("egress");
  });
});
