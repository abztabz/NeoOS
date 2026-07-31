import { fetchGoldPrice } from "@/server/gold/gold-api-provider";
import type { GoldObservation } from "@/server/gold/gold-api-provider";
import type { InstrumentIdentity } from "@/server/pricing/instrument";
import type {
  PricingProvider,
  ProviderDescriptor,
  ProviderHealth,
} from "@/server/pricing/provider";
import type { MarketQuote } from "@/server/pricing/quote";

/**
 * Gold spot for the price-display path — free, keyless.
 *
 * The retrieval, parsing, plausibility band and move-limit checks already exist
 * in `gold-api-provider.ts`, which the gold board uses. This is the translation
 * layer that lets the *pricing service* use the same retrieval, for the same
 * reason `LicensedPricingProvider` wraps the older adapter: two clients that
 * both claim to be "the gold price" eventually disagree, and one of them
 * relaxes a guard the other kept.
 *
 * Before this existed, `buildPricingProviders()` would only construct a metals
 * provider when `METALS_BASE_URL` and `METALS_API_KEY` were both set — so a
 * deployment with no metals subscription could show gold on the gold board and
 * "price unavailable" on the same asset's opportunity card, from the same
 * retrieval, in the same session.
 */

export const PUBLIC_GOLD_PROVIDER_ID = "gold-api-public";
export const PUBLIC_GOLD_PROVIDER_NAME = "Gold-API.com public spot";
export const PUBLIC_GOLD_ATTRIBUTION =
  "XAU/USD spot published by Gold-API.com, retrieved without credentials. Free public " +
  "data, not a licensed metals feed. Quoted per troy ounce; see GOLD_PRICE_BASIS.md for " +
  "the basis and for why a futures settlement is never substituted for spot.";

export interface PublicGoldProviderOptions {
  fetchImpl?: typeof fetch;
  priority?: number;
}

export class PublicGoldPricingProvider implements PricingProvider {
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly priority: number;
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastFailureReason: string | null = null;

  constructor(options: PublicGoldProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl;
    this.priority = options.priority ?? 60;
  }

  describe(): ProviderDescriptor {
    return {
      providerId: PUBLIC_GOLD_PROVIDER_ID,
      providerName: PUBLIC_GOLD_PROVIDER_NAME,
      sourceName: PUBLIC_GOLD_PROVIDER_NAME,
      assetTypes: ["commodity"],
      requiresCredentials: false,
      requiresPaidSubscription: false,
      outboundHosts: ["api.gold-api.com"],
      attribution: PUBLIC_GOLD_ATTRIBUTION,
      priority: this.priority,
    };
  }

  async getHealthStatus(): Promise<ProviderHealth> {
    return {
      providerId: PUBLIC_GOLD_PROVIDER_ID,
      providerName: PUBLIC_GOLD_PROVIDER_NAME,
      state: this.lastFailureReason && !this.lastSuccessAt ? "failing" : "ok",
      reason: this.lastFailureReason,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
    };
  }

  async getQuote(instrument: InstrumentIdentity): Promise<MarketQuote> {
    const result = await fetchGoldPrice(
      this.fetchImpl ? { fetchImpl: this.fetchImpl } : {},
    );

    if (!result.ok) {
      this.lastFailureAt = new Date().toISOString();
      this.lastFailureReason = result.reason;
      throw new Error(result.reason);
    }

    this.lastSuccessAt = result.observation.retrievedAt;
    this.lastFailureReason = null;
    return toGoldMarketQuote(result.observation, instrument);
  }
}

/**
 * The translation, exported so a test can hold it directly.
 *
 * `delayed` rather than `live`: this is a free public aggregator, not an
 * exchange feed, and understating timeliness is the safe direction to be wrong
 * in. `delayed` is still decision-grade, so nothing is lost but the claim.
 */
export function toGoldMarketQuote(
  observation: GoldObservation,
  instrument: InstrumentIdentity,
): MarketQuote {
  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    name: instrument.name,
    assetType: "commodity",
    price: observation.xauUsdPerTroyOunce,
    currency: "USD",
    unit: "troy_ounce",
    quoteTimestamp: observation.sourceUpdatedAt,
    retrievedAt: observation.retrievedAt,
    sourceId: observation.sourceId,
    sourceName: observation.sourceName,
    providerInstrumentId: observation.symbol,
    // Spot metal quotes continuously through the trading week, so it is aged on
    // the commodity open-market allowance rather than an end-of-session one.
    marketState: "open",
    freshness: "delayed",
  };
}
