import { MarketDataAdapter } from "@/server/providers/prices/adapter";
import type { PriceQuote } from "@/server/providers/prices/types";
import type { InstrumentIdentity } from "@/server/pricing/instrument";
import type {
  PricingProvider,
  ProviderDescriptor,
  ProviderHealth,
} from "@/server/pricing/provider";
import type { MarketQuote, MarketState, PriceFreshness } from "@/server/pricing/quote";

/**
 * The licensed feed, speaking the pricing service's language.
 *
 * `MarketDataAdapter` already exists and already refuses to invent a price. It
 * predates the pricing service and produces `PriceQuote`, so rather than write
 * a second vendor client this is a translation layer: one place where the older
 * shape becomes the newer one, and one place to read when the two disagree.
 *
 * Writing a parallel adapter instead would have meant two code paths that both
 * claim to be "the price from the vendor", and eventually one of them would
 * relax a guard the other kept.
 *
 * Nothing here softens anything. Where the older type has no answer — no stated
 * timeliness, no venue — the newer field is filled with the honest value rather
 * than a plausible default, and the service's validator sees it either way.
 */

/**
 * Timeliness the vendor stated → the freshness vocabulary the UI reads.
 *
 * `unknown` becomes `stale`, which is deliberate and slightly brutal: a feed
 * that will not say how old its quotes are cannot support a Buy, and treating
 * silence as "probably fine" is how an hour-old price ends up sizing a
 * position.
 */
const FRESHNESS_FROM_TIMELINESS: Record<string, PriceFreshness> = {
  real_time: "live",
  delayed: "delayed",
  end_of_day: "previous_close",
  unknown: "stale",
};

const MARKET_STATE_FROM_STATUS: Record<string, MarketState> = {
  open: "open",
  closed: "closed",
  pre_market: "pre_market",
  post_market: "after_hours",
  unknown: "unknown",
};

export interface LicensedPricingProviderOptions {
  adapter: MarketDataAdapter;
  /** Fallback order. Licensed feeds sit below free official sources. */
  priority?: number;
}

export class LicensedPricingProvider implements PricingProvider {
  private readonly adapter: MarketDataAdapter;
  private readonly priority: number;

  constructor(options: LicensedPricingProviderOptions) {
    this.adapter = options.adapter;
    this.priority = options.priority ?? 50;
  }

  describe(): ProviderDescriptor {
    const d = this.adapter.describe();
    return {
      providerId: d.providerId,
      providerName: d.providerName,
      sourceName: d.providerName,
      // The asset types this feed sells quotes for, in the pricing service's
      // vocabulary rather than the evidence pipeline's.
      assetTypes: ["stock", "etf", "fund", "index", "commodity"],
      requiresCredentials: true,
      requiresPaidSubscription: true,
      outboundHosts: [],
      attribution: d.legalNotes,
      priority: this.priority,
    };
  }

  async getHealthStatus(): Promise<ProviderHealth> {
    const d = this.adapter.describe();
    return {
      providerId: d.providerId,
      providerName: d.providerName,
      // The adapter's health vocabulary is already the same four states.
      state: d.health,
      reason: d.failureReason,
      lastSuccessAt: d.lastSuccessfulRetrieval,
      lastFailureAt: null,
    };
  }

  /**
   * One quote, or a thrown error the service records in its trail.
   *
   * Throwing rather than returning null is what the service expects: a failure
   * here is a fact about this provider, and it belongs in the trail beside the
   * providers that were tried next.
   *
   * The lookup key is `providerMappings[providerId]`, **not** the instrument's
   * canonical id. The adapter holds its own `assetId → vendor symbol` table, so
   * the mapping's value is the key into that table. Passing the canonical id
   * instead would make every request report `unsupported_symbol`, which reads
   * as "the vendor does not cover this asset" when the truth is that nobody
   * told the adapter what to call it.
   */
  async getQuote(instrument: InstrumentIdentity): Promise<MarketQuote> {
    const providerId = this.adapter.describe().providerId;
    const mapped = instrument.providerMappings[providerId];
    if (!mapped) {
      throw new Error(
        `No mapping for ${instrument.symbol} on ${providerId}. NeoOS will not guess a vendor symbol.`,
      );
    }

    const outcome = await this.adapter.quotes([mapped], new Date().toISOString());

    const quote = outcome.quotes[0];
    if (!quote) {
      const failure = outcome.failures[0];
      throw new Error(
        failure ? `${failure.kind}: ${failure.message}` : "Provider returned no quote and no reason.",
      );
    }

    return toMarketQuote(quote, instrument);
  }
}

/** The translation itself, exported so a test can hold it directly. */
export function toMarketQuote(quote: PriceQuote, instrument: InstrumentIdentity): MarketQuote {
  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    name: instrument.name,
    // `venue` is nullable upstream and optional here — omitted rather than
    // filled with "unknown", which would read as a venue named Unknown.
    ...(quote.venue ? { venue: quote.venue } : {}),
    assetType: instrument.assetType,
    price: quote.price,
    currency: quote.currency,
    unit: quote.priceUnit,
    quoteTimestamp: quote.quotedAt,
    retrievedAt: quote.retrievedAt,
    sourceId: quote.providerId,
    sourceName: quote.providerId,
    providerInstrumentId: quote.providerSymbol,
    marketState: MARKET_STATE_FROM_STATUS[quote.marketStatus] ?? "unknown",
    freshness: FRESHNESS_FROM_TIMELINESS[quote.timeliness] ?? "stale",
  };
}
