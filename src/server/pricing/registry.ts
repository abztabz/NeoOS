import { MarketDataAdapter } from "@/server/providers/prices/adapter";
import { LicensedPricingProvider } from "@/server/pricing/licensed-provider";
import { PricingService, QuoteCache } from "@/server/pricing/service";
import type { PricingProvider } from "@/server/pricing/provider";
import {
  marketDataApiKey,
  marketDataBaseUrl,
  marketDataTimeliness,
  metalsApiKey,
  metalsBaseUrl,
} from "@/server/config/env";
import type { QuoteTimeliness } from "@/server/types/live-state";

/**
 * The pricing providers this deployment actually has.
 *
 * Deliberately different from `buildLiveAdapters()` in `runtime.ts`, which
 * builds the *evidence* pipeline's adapters. This builds the price-display
 * path, and the two are separate because they answer different questions: one
 * feeds the scoring engine's evidence record, the other decides what number
 * appears next to an asset on screen.
 *
 * A provider is constructed only when its credentials are present. That is not
 * a convenience: an unconfigured provider that still appeared in the fallback
 * order would consume a rung of the hierarchy and fail on every request, which
 * reads to an operator as an outage rather than as a missing subscription.
 *
 * When nothing is configured this returns an empty list, and the service says
 * so in the exact production wording rather than serving a fixture.
 */

function parseTimeliness(value: string | null): QuoteTimeliness {
  // Never guessed. An operator who has not stated what their licence grants
  // gets `unknown`, which the freshness model treats as unusable.
  return value === "real_time" || value === "delayed" || value === "end_of_day"
    ? value
    : "unknown";
}

export function buildPricingProviders(): PricingProvider[] {
  const providers: PricingProvider[] = [];
  const timeliness = parseTimeliness(marketDataTimeliness());

  const baseUrl = marketDataBaseUrl();
  const apiKey = marketDataApiKey();
  if (baseUrl && apiKey) {
    providers.push(
      new LicensedPricingProvider({
        adapter: new MarketDataAdapter({
          baseUrl,
          apiKey,
          timeliness,
          symbols: [
            { assetId: "apple", providerSymbol: "AAPL", priceUnit: "share" },
            { assetId: "us-etf", providerSymbol: "SPY", priceUnit: "share" },
          ],
        }),
        priority: 50,
      }),
    );
  }

  const metalsUrl = metalsBaseUrl();
  const metalsKey = metalsApiKey();
  if (metalsUrl && metalsKey) {
    providers.push(
      new LicensedPricingProvider({
        adapter: new MarketDataAdapter({
          providerId: "metals",
          providerName: "Precious metals price provider",
          baseUrl: metalsUrl,
          apiKey: metalsKey,
          timeliness,
          // Unit is explicit. A gold quote with an unstated unit is meaningless.
          symbols: [{ assetId: "gold", providerSymbol: "XAUUSD", priceUnit: "troy_ounce" }],
          legalNotes:
            "Spot metal prices are licensed market data. The basis (London spot, unallocated) is recorded with every quote — see GOLD_PRICE_BASIS.md.",
        }),
        priority: 40,
      }),
    );
  }

  return providers;
}

/**
 * One service per process.
 *
 * The cache is the reason. A service rebuilt per request would hold a cache
 * that never hits, so every page view would pay for a fresh vendor call — and
 * on a metered feed that is the difference between a subscription that works
 * and one that exhausts its quota by lunchtime.
 */
let cached: PricingService | null = null;

export function pricingService(): PricingService {
  if (cached) return cached;
  cached = new PricingService({
    providers: buildPricingProviders(),
    cache: new QuoteCache(300),
  });
  return cached;
}

/** Test seam. Not called in production. */
export function resetPricingService(): void {
  cached = null;
}
