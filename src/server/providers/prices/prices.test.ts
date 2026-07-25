import { describe, expect, it, vi } from "vitest";
import { MarketDataAdapter, priceQuoteToRecord } from "@/server/providers/prices/adapter";
import { moveIsPlausible, quoteIsPlausible } from "@/server/providers/prices/types";
import { verifyChecksum } from "@/intelligence/ingestion/ingest";
import { quoteIsStale, QUOTE_STALE_AFTER_MINUTES } from "@/server/types/live-state";
import {
  basesAreComparable,
  describeGoldQuote,
  GOLD_MAXIMUM_LIVE_STATE,
  GRAMS_PER_TROY_OUNCE,
  toPricePerTroyOunce,
  type GoldPriceBasis,
} from "@/server/providers/gold/basis";

const ASOF = "2026-07-25T14:00:00.000Z";
const SYMBOLS = [
  { assetId: "apple", providerSymbol: "AAPL", priceUnit: "share" },
  { assetId: "gold", providerSymbol: "XAUUSD", priceUnit: "troy_ounce" },
];

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function configured(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  overrides: Partial<ConstructorParameters<typeof MarketDataAdapter>[0]> = {},
) {
  return new MarketDataAdapter({
    baseUrl: "https://prices.example.com/v1",
    apiKey: "test-key",
    symbols: SYMBOLS,
    fetchImpl,
    now: () => Date.parse(ASOF),
    ...overrides,
  });
}

describe("price plausibility guards", () => {
  it("rejects zero, negative, NaN, and non-numbers", () => {
    expect(quoteIsPlausible(0)).toBe(false);
    expect(quoteIsPlausible(-5)).toBe(false);
    expect(quoteIsPlausible(Number.NaN)).toBe(false);
    expect(quoteIsPlausible("125.40")).toBe(false);
    expect(quoteIsPlausible(125.4)).toBe(true);
  });

  it("accepts a real market gap but refuses a decimal shift", () => {
    expect(moveIsPlausible(150, 120)).toBe(true);
    // A tenfold jump is a feed error, not a market.
    expect(moveIsPlausible(1250, 125)).toBe(false);
    expect(moveIsPlausible(12.5, 125)).toBe(false);
  });

  it("does not judge a move when there is nothing to compare against", () => {
    expect(moveIsPlausible(9999, null)).toBe(true);
  });
});

describe("MarketDataAdapter without credentials", () => {
  const adapter = new MarketDataAdapter({ baseUrl: null, apiKey: null, symbols: SYMBOLS });

  it("reports itself disabled and explains the consequence", () => {
    const descriptor = adapter.describe();
    expect(descriptor.mode).toBe("disabled");
    expect(descriptor.configured).toBe(false);
    expect(descriptor.failureReason).toMatch(/will not estimate, carry forward, or substitute/);
  });

  it("makes no request and returns no quote", async () => {
    const fetchImpl = vi.fn(async () => ok({}));
    const unconfigured = new MarketDataAdapter({
      baseUrl: null,
      apiKey: null,
      symbols: SYMBOLS,
      fetchImpl,
    });
    const result = await unconfigured.quotes(["apple"], ASOF);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.quotes).toHaveLength(0);
    expect(result.failures[0]?.kind).toBe("unconfigured");
  });

  it("substitutes nothing into the evidence stream", async () => {
    const result = await adapter.fetch({ assetIds: ["apple", "gold"], asOf: ASOF });
    expect(result.records).toHaveLength(0);
    expect(result.mode).toBe("disabled");
    expect(result.ok).toBe(false);
  });
});

describe("MarketDataAdapter with credentials", () => {
  const goodBody = {
    price: 212.5,
    currency: "usd",
    quotedAt: "2026-07-25T13:45:00Z",
    previousClose: 209.8,
    marketStatus: "OPEN",
    venue: "NASDAQ",
  };

  it("sends the key as a header, never in the URL", async () => {
    let seenUrl = "";
    let seenAuth: string | null = null;
    const adapter = configured(async (url, init) => {
      seenUrl = url;
      seenAuth = new Headers(init?.headers).get("authorization");
      return ok(goodBody);
    });
    await adapter.quotes(["apple"], ASOF);
    expect(seenUrl).not.toContain("test-key");
    expect(seenAuth).toBe("Bearer test-key");
  });

  it("normalizes a quote and preserves the provider's own timestamp", async () => {
    const adapter = configured(async () => ok(goodBody), { timeliness: "delayed" });
    const { quotes } = await adapter.quotes(["apple"], ASOF);
    const quote = quotes[0];
    expect(quote?.price).toBe(212.5);
    expect(quote?.currency).toBe("USD");
    expect(quote?.quotedAt).toBe("2026-07-25T13:45:00.000Z");
    expect(quote?.retrievedAt).toBe(ASOF);
    expect(quote?.timeliness).toBe("delayed");
    expect(quote?.marketStatus).toBe("open");
  });

  it("defaults timeliness to unknown rather than claiming real-time", async () => {
    const adapter = configured(async () => ok(goodBody));
    const { quotes } = await adapter.quotes(["apple"], ASOF);
    expect(quotes[0]?.timeliness).toBe("unknown");
  });

  it("treats an unstated market status as unknown, not closed", async () => {
    const adapter = configured(async () => ok({ ...goodBody, marketStatus: undefined }));
    const { quotes } = await adapter.quotes(["apple"], ASOF);
    expect(quotes[0]?.marketStatus).toBe("unknown");
  });

  it("refuses a quote with no currency", async () => {
    const adapter = configured(async () => ok({ ...goodBody, currency: undefined }));
    const { quotes, failures } = await adapter.quotes(["apple"], ASOF);
    expect(quotes).toHaveLength(0);
    expect(failures[0]?.message).toMatch(/cannot be compared to a valuation/);
  });

  it("refuses a quote with no stated quote time", async () => {
    const adapter = configured(async () => ok({ ...goodBody, quotedAt: undefined }));
    const { quotes, failures } = await adapter.quotes(["apple"], ASOF);
    expect(quotes).toHaveLength(0);
    // Substituting retrieval time would make a stale quote look current.
    expect(failures[0]?.message).toMatch(/Retrieval time is not a substitute/);
  });

  it("refuses a price that moved implausibly in one step", async () => {
    const adapter = configured(async () => ok({ ...goodBody, price: 2125, previousClose: 209.8 }));
    const { quotes, failures } = await adapter.quotes(["apple"], ASOF);
    expect(quotes).toHaveLength(0);
    expect(failures[0]?.kind).toBe("implausible_value");
  });

  it("refuses an unmapped symbol rather than guessing one", async () => {
    const adapter = configured(async () => ok(goodBody));
    const { failures } = await adapter.quotes(["uae-equity"], ASOF);
    expect(failures[0]?.kind).toBe("unsupported_symbol");
    expect(failures[0]?.message).toMatch(/Rather than guess one/);
  });

  it("keeps a good quote when a sibling symbol fails", async () => {
    const adapter = configured(async (url) =>
      url.includes("XAUUSD") ? new Response("", { status: 500 }) : ok(goodBody),
    );
    const { quotes, failures } = await adapter.quotes(["apple", "gold"], ASOF);
    expect(quotes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it("reports mode error, not live, when nothing was retrieved", async () => {
    const adapter = configured(async () => new Response("", { status: 500 }));
    const result = await adapter.fetch({ assetIds: ["apple"], asOf: ASOF });
    expect(result.mode).toBe("error");
    expect(result.ok).toBe(false);
  });
});

describe("price evidence records", () => {
  it("dates freshness from the quote, not the fetch", async () => {
    const adapter = configured(async () =>
      ok({ price: 212.5, currency: "USD", quotedAt: "2026-07-25T13:45:00Z" }),
    );
    const result = await adapter.fetch({ assetIds: ["apple"], asOf: ASOF });
    const record = result.records[0] as { publishedAt: string; retrievedAt: string };
    expect(record.publishedAt).toBe("2026-07-25T13:45:00.000Z");
    expect(record.retrievedAt).toBe(ASOF);
  });

  it("produces a record whose checksum verifies", () => {
    const record = priceQuoteToRecord(
      {
        assetId: "apple",
        providerSymbol: "AAPL",
        price: 212.5,
        currency: "USD",
        priceUnit: "share",
        quotedAt: "2026-07-25T13:45:00.000Z",
        retrievedAt: ASOF,
        timeliness: "delayed",
        marketStatus: "open",
        previousClose: 209.8,
        venue: "NASDAQ",
        providerId: "market-data",
      },
      "market-data",
    );
    expect(verifyChecksum(record)).toBe(true);
    expect(record.rawUnit).toBe("share");
    expect(record.rawConfidence).toBeNull();
  });
});

describe("quote staleness by timeliness class", () => {
  const now = new Date("2026-07-25T14:00:00Z");

  it("holds a real-time quote to a tighter threshold than an end-of-day mark", () => {
    expect(QUOTE_STALE_AFTER_MINUTES.real_time).toBeLessThan(QUOTE_STALE_AFTER_MINUTES.end_of_day);
  });

  it("flags a two-hour-old real-time quote but not an end-of-day one", () => {
    const twoHoursAgo = "2026-07-25T12:00:00Z";
    expect(quoteIsStale(twoHoursAgo, "real_time", now)).toBe(true);
    expect(quoteIsStale(twoHoursAgo, "end_of_day", now)).toBe(false);
  });

  it("treats an unparseable timestamp as stale rather than fresh", () => {
    expect(quoteIsStale("not a date", "real_time", now)).toBe(true);
  });
});

describe("gold price basis", () => {
  const spot: GoldPriceBasis = {
    basis: "london_spot_unallocated",
    currency: "USD",
    unit: "troy_ounce",
    reference: "London OTC spot",
    quotedAt: "2026-07-25T13:45:00.000Z",
    pricePerTroyOunce: 2400,
    sourceName: "Metals provider",
    premiumOverSpotPercent: null,
  };

  it("converts grams to troy ounces by the definitional factor", () => {
    expect(toPricePerTroyOunce(100, "gram")).toBeCloseTo(100 * GRAMS_PER_TROY_OUNCE, 9);
    expect(toPricePerTroyOunce(2400, "troy_ounce")).toBe(2400);
  });

  it("converts a kilogram price to a per-ounce price", () => {
    expect(toPricePerTroyOunce(100_000, "kilogram")).toBeCloseTo(3110.34768, 5);
  });

  it("handles the tola, the unit Gulf markets actually quote", () => {
    expect(toPricePerTroyOunce(1000, "tola")).toBeCloseTo((1000 / 11.6638038) * GRAMS_PER_TROY_OUNCE, 6);
  });

  it("refuses to convert an implausible price instead of returning a number", () => {
    expect(() => toPricePerTroyOunce(0, "gram")).toThrow(/implausible/);
    expect(() => toPricePerTroyOunce(Number.NaN, "gram")).toThrow(/implausible/);
  });

  it("caps gold at partial live, permanently", () => {
    expect(GOLD_MAXIMUM_LIVE_STATE).toBe("partial_live");
  });

  it("carries the basis with the number whenever a price is described", () => {
    const described = describeGoldQuote(spot);
    expect(described).toContain("per troy ounce");
    expect(described).toContain("London spot, unallocated");
    expect(described).toContain("Metals provider");
  });

  it("states a retail premium rather than hiding it in the price", () => {
    const retail: GoldPriceBasis = {
      ...spot,
      basis: "retail_physical",
      pricePerTroyOunce: 2544,
      premiumOverSpotPercent: 6,
    };
    expect(describeGoldQuote(retail)).toContain("6.0% premium over spot");
  });

  it("refuses to compare quotes struck on different bases", () => {
    const nav: GoldPriceBasis = { ...spot, basis: "etf_nav", pricePerTroyOunce: 2391 };
    // A spot/NAV gap is fees and tracking, not a price conflict.
    expect(basesAreComparable(spot, nav)).toBe(false);
    expect(basesAreComparable(spot, { ...spot })).toBe(true);
  });

  it("refuses to compare quotes in different currencies", () => {
    expect(basesAreComparable(spot, { ...spot, currency: "AED" })).toBe(false);
  });
});
