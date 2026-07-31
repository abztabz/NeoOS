import { describe, expect, it } from "vitest";
import { resolveIdentity } from "@/server/pricing/instrument";
import {
  PUBLIC_EQUITY_PROVIDER_ID,
  PublicEquityPricingProvider,
  parsePublicEquityCsv,
  sessionCloseInstant,
} from "@/server/pricing/public-equity-provider";
import { canUsePriceForDecision, validateQuote } from "@/server/pricing/quote";

/**
 * Recorded feed responses. Shapes are taken from the documented `f=sd2t2ohlcv`
 * output so the parser is exercised for real; no test asserts a market price is
 * any particular number, because that would encode a fixture as a fact.
 */
const HEADER = "Symbol,Date,Time,Open,High,Low,Close,Volume";
const GOOD = `${HEADER}\nAAPL.US,2026-07-30,22:00:04,330.00,335.00,329.00,333.43,45000000`;
const NOT_FOUND = `${HEADER}\nNOPE.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D`;

function identity() {
  return resolveIdentity({
    symbol: "AAPL",
    name: "Apple Inc.",
    assetType: "stock",
    exchange: "NASDAQ",
    mic: "XNAS",
    currency: "USD",
    providerMappings: { [PUBLIC_EQUITY_PROVIDER_ID]: "aapl.us" },
  });
}

function providerReturning(body: string, status = 200) {
  const fetchImpl = (async () =>
    new Response(body, { status, headers: { "content-type": "text/csv" } })) as typeof fetch;
  return new PublicEquityPricingProvider({ fetchImpl });
}

describe("public equity feed parsing", () => {
  it("reads the close and session date from a well-formed row", () => {
    const parsed = parsePublicEquityCsv(GOOD);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.row.close).toBe(333.43);
    expect(parsed.row.date).toBe("2026-07-30");
  });

  it("refuses the not-found marker instead of reading it as a value", () => {
    const parsed = parsePublicEquityCsv(NOT_FOUND);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/does not recognise/i);
  });

  it.each([
    ["a non-numeric close", `${HEADER}\nAAPL.US,2026-07-30,22:00:04,1,1,1,abc,1`],
    ["a zero close", `${HEADER}\nAAPL.US,2026-07-30,22:00:04,1,1,1,0,1`],
    ["a negative close", `${HEADER}\nAAPL.US,2026-07-30,22:00:04,1,1,1,-5,1`],
    ["an implausible close", `${HEADER}\nAAPL.US,2026-07-30,22:00:04,1,1,1,99999999,1`],
    ["an unparseable date", `${HEADER}\nAAPL.US,30/07/2026,22:00:04,1,1,1,333.43,1`],
    ["no data row", HEADER],
  ])("refuses %s", (_label, body) => {
    expect(parsePublicEquityCsv(body).ok).toBe(false);
  });
});

describe("session close instant", () => {
  it("resolves a summer session to the daylight-time offset", () => {
    expect(sessionCloseInstant("2026-07-30")).toBe("2026-07-30T16:00:00-04:00");
  });

  it("resolves a winter session to the standard-time offset", () => {
    expect(sessionCloseInstant("2026-01-15")).toBe("2026-01-15T16:00:00-05:00");
  });

  it("refuses a malformed date rather than defaulting an offset", () => {
    expect(sessionCloseInstant("30-07-2026")).toBeNull();
  });
});

describe("public equity provider", () => {
  it("produces a quote that passes the service validator", async () => {
    const quote = await providerReturning(GOOD).getQuote(identity());
    const validation = validateQuote(quote);
    expect(validation.ok).toBe(true);
  });

  it("names its source and carries the derived session-close timestamp", async () => {
    const quote = await providerReturning(GOOD).getQuote(identity());
    expect(quote.sourceId).toBe(PUBLIC_EQUITY_PROVIDER_ID);
    expect(quote.sourceName).toMatch(/Stooq/);
    expect(quote.quoteTimestamp).toBe("2026-07-30T16:00:00-04:00");
    expect(quote.providerInstrumentId).toBe("AAPL.US");
  });

  it("reports a settled close as previous_close, never as live", async () => {
    const quote = await providerReturning(GOOD).getQuote(identity());
    expect(quote.freshness).toBe("previous_close");
    expect(quote.marketState).toBe("closed");
  });

  it("yields a close that is decision-grade", async () => {
    const quote = await providerReturning(GOOD).getQuote(identity());
    expect(canUsePriceForDecision(quote)).toBe(true);
  });

  it("declares itself free and keyless", () => {
    const d = new PublicEquityPricingProvider().describe();
    expect(d.requiresCredentials).toBe(false);
    expect(d.requiresPaidSubscription).toBe(false);
    expect(d.attribution).toMatch(/not a licensed real-time feed/i);
  });

  it("refuses an instrument it has no mapping for rather than guessing a symbol", async () => {
    const unmapped = resolveIdentity({
      symbol: "AAPL",
      assetType: "stock",
      exchange: "NASDAQ",
      currency: "USD",
      providerMappings: { other: "AAPL" },
    });
    await expect(providerReturning(GOOD).getQuote(unmapped)).rejects.toThrow(/will not guess/i);
  });

  it("surfaces an unrecognised symbol as a failure, not as a price", async () => {
    await expect(providerReturning(NOT_FOUND).getQuote(identity())).rejects.toThrow(
      /does not recognise/i,
    );
  });

  it("surfaces an HTTP failure rather than returning a number", async () => {
    await expect(providerReturning("", 503).getQuote(identity())).rejects.toThrow(/HTTP 503/);
  });

  it("refuses a session whose close has not happened yet", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const body = `${HEADER}\nAAPL.US,${future},22:00:04,1,1,1,333.43,1`;
    await expect(providerReturning(body).getQuote(identity())).rejects.toThrow(
      /has not occurred yet/i,
    );
  });

  it("reports failing health only after a failure with no prior success", async () => {
    const provider = providerReturning(NOT_FOUND);
    await expect(provider.getQuote(identity())).rejects.toThrow();
    const health = await provider.getHealthStatus();
    expect(health.state).toBe("failing");
    expect(health.reason).toMatch(/does not recognise/i);
  });
});
