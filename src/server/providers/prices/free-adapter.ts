import { fetchGoldPrice } from "@/server/gold/gold-api-provider";
import {
  PUBLIC_EQUITY_PROVIDER_ID,
  PUBLIC_EQUITY_ATTRIBUTION,
  STOOQ_BASE_URL,
  parsePublicEquityCsv,
  sessionCloseInstant,
} from "@/server/pricing/public-equity-provider";
import { priceQuoteToRecord } from "@/server/providers/prices/adapter";
import type { PriceFailure, PriceQuote } from "@/server/providers/prices/types";
import type {
  ProviderAdapter,
  ProviderDescriptor,
  ProviderFetchRequest,
  ProviderFetchResult,
} from "@/intelligence/types/provider";

/**
 * Free price evidence for the **evidence pipeline**.
 *
 * There are two pipelines that both deal in prices, and they are not the same:
 *
 *   buildPricingProviders() → PricingService → /api/pricing/quote
 *   buildLiveAdapters()     → ingest → normalize → engine → report → the cards
 *
 * The opportunity cards read the *report*. `quoteFromReport()` takes its number
 * from `valuationInput.marketPrice` and its provenance from a `marketData`
 * evidence record inside the report — neither of which the PricingService ever
 * touches. So a free provider registered only on the first path leaves the
 * cards exactly as they were, which is precisely what happened before this file
 * existed.
 *
 * This adapter closes that gap. It reuses the same retrieval and the same
 * validation as the display path, and hands the result to the existing
 * `priceQuoteToRecord` mapper rather than building a second raw-record shape —
 * two mappers that both claim to produce "the price record" would eventually
 * disagree about `claimKey`, and `claimKey` is load-bearing: `marketPriceFrom()`
 * in `server/api/run.ts` selects on `price:` to populate the valuation.
 *
 * ## What it claims
 *
 * Equities: a settled end-of-day close, timeliness `end_of_day`, market status
 * `closed`. Never real-time, because the source is not.
 *
 * Gold: spot, timeliness `delayed`. Note that `filingValuationConfig` only
 * builds valuations for `assetClass === "Equity"`, so gold price evidence lands
 * in the report and is inspectable, but does not itself produce a gold
 * valuation — the gold board remains its own path.
 *
 * ## Mode honesty
 *
 * `mode` is `live` only when something was genuinely retrieved. A run where
 * every fetch failed reports `error` with the reasons attached, never `live`
 * with an empty record set, because `modeCountsAsLive` gates the whole
 * application's live-verified state on this field.
 */

export const FREE_PRICE_PROVIDER_ID = "free-public-prices";
export const FREE_PRICE_ADAPTER_VERSION = "1.0.0";

/**
 * Canonical asset id → the symbol the public equity feed knows it by.
 *
 * Explicit, never derived from a ticker. A guessed suffix silently prices a
 * different listing of the same company on another venue.
 */
export const FREE_EQUITY_SYMBOLS: Record<string, string> = {
  apple: "aapl.us",
  "us-etf": "spy.us",
};

/** Asset ids this adapter prices as a metal rather than a listed security. */
export const FREE_METAL_ASSET_IDS = new Set(["gold"]);

export interface FreePriceAdapterOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
}

export class FreePriceAdapter implements ProviderAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => number;
  private lastSuccess: string | null = null;
  private lastFailure: string | null = null;

  constructor(options: FreePriceAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? STOOQ_BASE_URL;
    this.now = options.now ?? (() => Date.now());
  }

  describe(): ProviderDescriptor {
    return {
      providerId: FREE_PRICE_PROVIDER_ID,
      providerName: "Free public price sources",
      providerType: "market_data",
      // Tier 2 alongside other market data. Being free does not make a
      // published close weaker evidence than a paid one of the same close.
      sourceTier: 2,
      capabilities: ["prices"],
      supportedAssetClasses: ["Equity", "Commodity"],
      mode: "live",
      // Nothing to configure, so it is always configured. `authenticated` is
      // false and stays false: there is no credential, and claiming otherwise
      // would misreport the trust basis in the provider panel.
      configured: true,
      authenticated: false,
      health: this.lastFailure && !this.lastSuccess ? "failing" : "ok",
      lastSuccessfulRetrieval: this.lastSuccess,
      failureReason: this.lastFailure,
      legalNotes: PUBLIC_EQUITY_ATTRIBUTION,
      rateLimit: null,
    };
  }

  async fetch(request: ProviderFetchRequest): Promise<ProviderFetchResult> {
    const quotes: PriceQuote[] = [];
    const failures: PriceFailure[] = [];

    for (const assetId of request.assetIds) {
      try {
        const quote = FREE_METAL_ASSET_IDS.has(assetId)
          ? await this.metalQuote(assetId)
          : await this.equityQuote(assetId);
        if (quote) quotes.push(quote);
      } catch (error) {
        failures.push({
          assetId,
          kind: "network",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const respondedAt = new Date(this.now()).toISOString();
    if (quotes.length > 0) {
      this.lastSuccess = respondedAt;
      this.lastFailure = null;
    } else if (failures.length > 0) {
      this.lastFailure = failures[0]!.message;
    }

    return {
      providerId: FREE_PRICE_PROVIDER_ID,
      // Never `live` on an empty result set.
      mode: quotes.length > 0 ? "live" : "error",
      ok: quotes.length > 0,
      respondedAt,
      rawPayloadRef: `${FREE_PRICE_PROVIDER_ID}:${quotes.length} quotes`,
      records: quotes.map((q) => priceQuoteToRecord(q, FREE_PRICE_PROVIDER_ID)),
      failureReason:
        quotes.length > 0 ? null : (failures[0]?.message ?? "No free source covers the requested assets."),
      warnings: failures.map((f) => `${f.assetId}: ${f.message}`),
    };
  }

  /** An end-of-day equity close, or null when no free symbol is mapped. */
  private async equityQuote(assetId: string): Promise<PriceQuote | null> {
    const symbol = FREE_EQUITY_SYMBOLS[assetId];
    if (!symbol) return null;

    const url = `${this.baseUrl}?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
    const response = await this.fetchImpl(url, {
      headers: { accept: "text/csv" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status} for ${symbol}.`);

    const parsed = parsePublicEquityCsv(await response.text());
    if (!parsed.ok) throw new Error(parsed.reason);

    const quotedAt = sessionCloseInstant(parsed.row.date);
    if (!quotedAt) throw new Error(`Could not resolve a session close for "${parsed.row.date}".`);

    const retrievedAt = new Date(this.now());
    if (Date.parse(quotedAt) > retrievedAt.getTime() + 60_000) {
      throw new Error(
        `Feed returned session ${parsed.row.date}, whose close has not occurred yet.`,
      );
    }

    return {
      assetId,
      providerSymbol: parsed.row.symbol,
      price: parsed.row.close,
      currency: "USD",
      priceUnit: "share",
      quotedAt,
      retrievedAt: retrievedAt.toISOString(),
      timeliness: "end_of_day",
      marketStatus: "closed",
      // The feed supplies an open, not a prior close. Left null rather than
      // substituting a different field that happens to be a number.
      previousClose: null,
      venue: PUBLIC_EQUITY_PROVIDER_ID,
      providerId: FREE_PRICE_PROVIDER_ID,
    };
  }

  private async metalQuote(assetId: string): Promise<PriceQuote | null> {
    const result = await fetchGoldPrice({ fetchImpl: this.fetchImpl });
    if (!result.ok) throw new Error(result.reason);

    return {
      assetId,
      providerSymbol: result.observation.symbol,
      price: result.observation.xauUsdPerTroyOunce,
      currency: "USD",
      priceUnit: "troy_ounce",
      quotedAt: result.observation.sourceUpdatedAt,
      retrievedAt: result.observation.retrievedAt,
      timeliness: "delayed",
      marketStatus: "open",
      previousClose: null,
      venue: result.observation.sourceName,
      providerId: FREE_PRICE_PROVIDER_ID,
    };
  }
}
