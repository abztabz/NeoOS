// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LicensedPricingProvider, toMarketQuote } from "@/server/pricing/licensed-provider";
import { MarketDataAdapter } from "@/server/providers/prices/adapter";
import { buildPricingProviders, resetPricingService } from "@/server/pricing/registry";
import { canUsePriceForDecision, validateQuote } from "@/server/pricing/quote";
import { resolveIdentity } from "@/server/pricing/instrument";
import type { PriceQuote } from "@/server/providers/prices/types";

/**
 * The bridge between the older evidence-pipeline adapter and the pricing
 * service.
 *
 * A translation layer is exactly where a guard gets quietly dropped, so these
 * check the translation rather than the vendor call: that nothing gains
 * credibility on the way across, and that silence about timeliness stays
 * silence.
 */

const identity = resolveIdentity({
  symbol: "AAPL",
  name: "Apple Inc.",
  assetType: "stock",
  exchange: "NASDAQ",
  currency: "USD",
  // The mapping's value is the adapter's own assetId key, not a vendor ticker:
  // the adapter holds assetId → vendor symbol internally.
  providerMappings: { "market-data": "apple" },
});

function priceQuote(overrides: Partial<PriceQuote> = {}): PriceQuote {
  return {
    assetId: "apple",
    providerSymbol: "AAPL",
    price: 220.5,
    currency: "USD",
    priceUnit: "share",
    quotedAt: "2026-07-28T15:30:00.000Z",
    retrievedAt: "2026-07-28T15:31:00.000Z",
    timeliness: "delayed",
    marketStatus: "open",
    previousClose: 218,
    venue: "NASDAQ",
    providerId: "market-data",
    ...overrides,
  };
}

describe("translating a vendor quote", () => {
  it("produces a quote the validator accepts", () => {
    const result = validateQuote(toMarketQuote(priceQuote(), identity));
    expect(result.ok).toBe(true);
  });

  it("carries the vendor's own timestamps rather than the moment of translation", () => {
    const q = toMarketQuote(priceQuote(), identity);
    expect(q.quoteTimestamp).toBe("2026-07-28T15:30:00.000Z");
    expect(q.retrievedAt).toBe("2026-07-28T15:31:00.000Z");
  });

  it("keeps the unit, because a metal price without one is meaningless", () => {
    const q = toMarketQuote(priceQuote({ priceUnit: "troy_ounce" }), identity);
    expect(q.unit).toBe("troy_ounce");
  });

  it("records the provider's own symbol for the audit trail", () => {
    expect(toMarketQuote(priceQuote(), identity).providerInstrumentId).toBe("AAPL");
  });

  it("omits the venue rather than inventing one", () => {
    const q = toMarketQuote(priceQuote({ venue: null }), identity);
    expect(q.venue).toBeUndefined();
    // Not the string "unknown", which reads as a venue with that name.
    expect(JSON.stringify(q)).not.toContain('"venue":"unknown"');
  });
});

describe("timeliness the vendor would not state", () => {
  it("treats unstated timeliness as stale rather than as probably fine", () => {
    const q = toMarketQuote(priceQuote({ timeliness: "unknown" }), identity);
    expect(q.freshness).toBe("stale");
    // The consequence that matters: no Buy can rest on it.
    expect(canUsePriceForDecision(q)).toBe(false);
  });

  it("maps each stated class to the vocabulary the surfaces read", () => {
    const cases = [
      ["real_time", "live"],
      ["delayed", "delayed"],
      ["end_of_day", "previous_close"],
    ] as const;
    for (const [stated, expected] of cases) {
      expect(toMarketQuote(priceQuote({ timeliness: stated }), identity).freshness).toBe(expected);
    }
  });

  it("maps post_market to after_hours rather than dropping it", () => {
    expect(toMarketQuote(priceQuote({ marketStatus: "post_market" }), identity).marketState).toBe(
      "after_hours",
    );
  });
});

describe("an unconfigured licensed provider", () => {
  const provider = new LicensedPricingProvider({
    adapter: new MarketDataAdapter({ baseUrl: null, apiKey: null, symbols: [] }),
  });

  it("reports itself unconfigured instead of failing on every request", async () => {
    const health = await provider.getHealthStatus();
    expect(health.state).toBe("unconfigured");
    expect(health.reason).toContain("credentials");
  });

  it("throws with the provider's reason rather than returning a fabricated quote", async () => {
    await expect(provider.getQuote(identity)).rejects.toThrow(/unconfigured/i);
  });

  it("still declares that it costs money and needs credentials", () => {
    const d = provider.describe();
    expect(d.requiresCredentials).toBe(true);
    expect(d.requiresPaidSubscription).toBe(true);
  });
});

describe("looking the instrument up in the vendor's table", () => {
  /** A configured adapter whose HTTP call is stubbed. */
  function configuredProvider(captured: string[]) {
    return new LicensedPricingProvider({
      adapter: new MarketDataAdapter({
        baseUrl: "https://vendor.invalid",
        apiKey: "test-key",
        timeliness: "delayed",
        symbols: [{ assetId: "apple", providerSymbol: "AAPL", priceUnit: "share" }],
        fetchImpl: async (url: string) => {
          captured.push(url);
          return new Response(
            JSON.stringify({
              price: 220.5,
              currency: "USD",
              quotedAt: "2026-07-28T15:30:00.000Z",
              previousClose: 218,
              marketStatus: "open",
              venue: "NASDAQ",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      }),
    });
  }

  it("sends the vendor's symbol, not NeoOS's instrument id", async () => {
    // The bug this pins: passing `instrument.id` made every request report
    // unsupported_symbol, which reads as "the vendor does not cover this asset".
    const captured: string[] = [];
    const quote = await configuredProvider(captured).getQuote(identity);

    expect(captured[0]).toContain("symbol=AAPL");
    expect(captured[0]).not.toContain(identity.id);
    expect(quote.price).toBe(220.5);
  });

  it("refuses rather than guessing when no mapping exists", async () => {
    const unmapped = resolveIdentity({
      symbol: "AAPL",
      assetType: "stock",
      exchange: "NASDAQ",
      currency: "USD",
      providerMappings: { "some-other-provider": "apple" },
    });
    await expect(configuredProvider([]).getQuote(unmapped)).rejects.toThrow(/will not guess/i);
  });
});

describe("the registry", () => {
  it("registers no credentialled provider when no credentials are present", () => {
    // An unconfigured provider left in the fallback order would consume a rung
    // and fail every request, which reads as an outage rather than a missing
    // subscription. Free providers are exempt: there is nothing to configure,
    // so they cannot be in a half-configured state.
    const registered = buildPricingProviders().map((p) => p.describe());
    expect(registered.filter((d) => d.requiresCredentials)).toHaveLength(0);
    expect(registered.length).toBeGreaterThan(0);
    expect(registered.every((d) => !d.requiresPaidSubscription)).toBe(true);
  });

  it("is live on free sources alone, and says they are not real-time", async () => {
    resetPricingService();
    const { pricingService } = await import("@/server/pricing/registry");
    const capability = pricingService().describeCapability();
    // Live because free public sources genuinely return sourced, timestamped
    // quotes with no credential — not because anything was assumed.
    expect(capability.livePricingActive).toBe(true);
    expect(capability.detail).toMatch(/no licensed feed configured/i);
    expect(capability.detail).toMatch(/end-of-day or delayed rather than real-time/i);
  });

  it("exposes no credential in what it describes", () => {
    resetPricingService();
    const serialized = JSON.stringify(buildPricingProviders().map((p) => p.describe()));
    expect(serialized).not.toMatch(/apiKey|secret|token|password/i);
  });
});
