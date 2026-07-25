import { computeRawChecksum } from "@/intelligence/ingestion/ingest";
import type {
  ProviderAdapter,
  ProviderDescriptor,
  ProviderFetchRequest,
  ProviderFetchResult,
} from "@/intelligence/types/provider";
import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import {
  moveIsPlausible,
  quoteIsPlausible,
  type PriceFailure,
  type PriceFetchOutcome,
  type PriceQuote,
} from "@/server/providers/prices/types";
import type { MarketStatus, QuoteTimeliness } from "@/server/types/live-state";

/**
 * Licensed market-data adapter.
 *
 * Deliberately vendor-neutral. Price vendors differ in field names and little
 * else, so the response mapping is configuration rather than a class per
 * vendor, and swapping vendors is an environment change instead of a code
 * change.
 *
 * The adapter ships **unconfigured**. Every price vendor NeoOS could use
 * requires a paid licence, and the terms of that licence — particularly whether
 * quotes may be described as real-time and whether they may be redistributed —
 * are the operator's to accept, not the build's. Without credentials the
 * adapter reports `disabled`, makes no request, and returns nothing. It never
 * substitutes a fixture, a cached value, or a last-known price, because a stale
 * price presented as current is the single most expensive lie this system
 * could tell.
 */

export const PRICE_ADAPTER_VERSION = "1.0.0";

/** Where to find each field in the vendor's JSON. Dotted paths. */
export interface PriceFieldMapping {
  price: string;
  currency: string;
  quotedAt: string;
  previousClose?: string;
  marketStatus?: string;
  venue?: string;
}

export const DEFAULT_FIELD_MAPPING: PriceFieldMapping = {
  price: "price",
  currency: "currency",
  quotedAt: "quotedAt",
  previousClose: "previousClose",
  marketStatus: "marketStatus",
  venue: "venue",
};

export interface PriceSymbolEntry {
  assetId: string;
  providerSymbol: string;
  /** What one unit of price buys. "share", "unit", "troy_ounce". */
  priceUnit: string;
}

export interface MarketDataAdapterOptions {
  providerId?: string;
  providerName?: string;
  baseUrl: string | null;
  apiKey: string | null;
  /**
   * Timeliness the operator's licence actually grants. Never guessed: an
   * unset value stays `unknown`, which the staleness model treats as delayed.
   */
  timeliness?: QuoteTimeliness;
  symbols: PriceSymbolEntry[];
  fieldMapping?: PriceFieldMapping;
  legalNotes?: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
}

export const PRICE_TIMEOUT_MS = 10_000;

export class MarketDataAdapter implements ProviderAdapter {
  private readonly providerId: string;
  private readonly providerName: string;
  private readonly mapping: PriceFieldMapping;
  private readonly configured: boolean;
  private readonly now: () => number;
  private lastSuccess: string | null = null;
  private lastFailure: string | null = null;

  constructor(private readonly options: MarketDataAdapterOptions) {
    this.providerId = options.providerId ?? "market-data";
    this.providerName = options.providerName ?? "Licensed market data provider";
    this.mapping = options.fieldMapping ?? DEFAULT_FIELD_MAPPING;
    this.configured = Boolean(options.baseUrl && options.apiKey);
    this.now = options.now ?? (() => Date.now());
  }

  describe(): ProviderDescriptor {
    return {
      providerId: this.providerId,
      providerName: this.providerName,
      providerType: "market_data",
      // Tier 2: an authoritative venue quote, but not the issuer's own filing.
      sourceTier: 2,
      capabilities: ["prices"],
      supportedAssetClasses: ["Equity", "ETF", "Commodity"],
      mode: this.configured ? "live" : "disabled",
      configured: this.configured,
      authenticated: this.configured,
      health: this.configured ? (this.lastFailure ? "degraded" : "ok") : "unconfigured",
      lastSuccessfulRetrieval: this.lastSuccess,
      failureReason: this.configured
        ? this.lastFailure
        : "No market-data credentials are configured. NeoOS will not estimate, carry forward, or substitute a price, so priced assets stay partial until a licensed feed is connected.",
      legalNotes:
        this.options.legalNotes ??
        "Market data is licensed, not public. Redistribution terms and whether quotes may be described as real-time are set by the vendor agreement, and NeoOS reports only the timeliness the operator has configured.",
      rateLimit: null,
    };
  }

  /** Typed price retrieval. `fetch` wraps this into the evidence contract. */
  async quotes(assetIds: string[], asOf: string): Promise<PriceFetchOutcome> {
    if (!this.configured) {
      return {
        quotes: [],
        failures: assetIds.map((assetId) => ({
          assetId,
          kind: "unconfigured" as const,
          message: "No market-data credentials are configured.",
        })),
      };
    }

    const quotes: PriceQuote[] = [];
    const failures: PriceFailure[] = [];
    const fetchImpl = this.options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));

    for (const assetId of assetIds) {
      const entry = this.options.symbols.find((s) => s.assetId === assetId);
      if (!entry) {
        failures.push({
          assetId,
          kind: "unsupported_symbol",
          message: `No provider symbol is mapped for ${assetId}. Rather than guess one, this asset is reported as unsupported by the price feed.`,
        });
        continue;
      }

      const url = `${this.options.baseUrl}/quote?symbol=${encodeURIComponent(entry.providerSymbol)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PRICE_TIMEOUT_MS);
      try {
        const response = await fetchImpl(url, {
          // The key travels in a header, never a query string: query strings
          // land in proxy logs, browser history, and error reports.
          headers: { Authorization: `Bearer ${this.options.apiKey}`, Accept: "application/json" },
          signal: controller.signal,
        });

        if (response.status === 429) {
          failures.push({ assetId, kind: "rate_limited", message: "Price provider rate limit reached." });
          continue;
        }
        if (!response.ok) {
          failures.push({
            assetId,
            kind: "bad_status",
            message: `Price provider returned HTTP ${response.status}.`,
          });
          continue;
        }

        const body: unknown = await response.json();
        const quote = this.toQuote(body, entry);
        if ("kind" in quote) failures.push(quote);
        else quotes.push(quote);
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        failures.push({
          assetId,
          kind: aborted ? "timeout" : "network",
          message: aborted
            ? `Price provider did not respond within ${PRICE_TIMEOUT_MS}ms.`
            : `Network failure reaching the price provider: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        clearTimeout(timer);
      }
    }

    if (quotes.length > 0) this.lastSuccess = asOf;
    this.lastFailure = failures.length > 0 ? (failures[0]?.message ?? null) : null;
    return { quotes, failures };
  }

  private toQuote(body: unknown, entry: PriceSymbolEntry): PriceQuote | PriceFailure {
    const price = readPath(body, this.mapping.price);
    if (!quoteIsPlausible(price)) {
      return {
        assetId: entry.assetId,
        kind: "malformed_response",
        message: `Price provider returned ${JSON.stringify(price)} for ${entry.providerSymbol}, which is not a usable price.`,
      };
    }

    const currency = readPath(body, this.mapping.currency);
    const quotedAt = readPath(body, this.mapping.quotedAt);
    if (typeof currency !== "string" || currency.length !== 3) {
      return {
        assetId: entry.assetId,
        kind: "malformed_response",
        message: `Price provider did not state a currency for ${entry.providerSymbol}. A price without a currency cannot be compared to a valuation.`,
      };
    }
    if (typeof quotedAt !== "string" || Number.isNaN(Date.parse(quotedAt))) {
      return {
        assetId: entry.assetId,
        kind: "malformed_response",
        message: `Price provider did not state when ${entry.providerSymbol} was quoted. Retrieval time is not a substitute — it would make a stale quote look current.`,
      };
    }

    const previousCloseRaw = this.mapping.previousClose
      ? readPath(body, this.mapping.previousClose)
      : null;
    const previousClose = quoteIsPlausible(previousCloseRaw) ? previousCloseRaw : null;

    if (!moveIsPlausible(price, previousClose)) {
      return {
        assetId: entry.assetId,
        kind: "implausible_value",
        message: `Price for ${entry.providerSymbol} moved from ${previousClose} to ${price} in one step. Refusing the quote rather than deriving a margin of safety from a probable feed error.`,
      };
    }

    return {
      assetId: entry.assetId,
      providerSymbol: entry.providerSymbol,
      price,
      currency: currency.toUpperCase(),
      priceUnit: entry.priceUnit,
      quotedAt: new Date(quotedAt).toISOString(),
      retrievedAt: new Date(this.now()).toISOString(),
      // Never inferred from response latency or market hours.
      timeliness: this.options.timeliness ?? "unknown",
      marketStatus: readMarketStatus(
        this.mapping.marketStatus ? readPath(body, this.mapping.marketStatus) : null,
      ),
      previousClose,
      venue: this.mapping.venue ? asStringOrNull(readPath(body, this.mapping.venue)) : null,
      providerId: this.providerId,
    };
  }

  async fetch(request: ProviderFetchRequest): Promise<ProviderFetchResult> {
    const outcome = await this.quotes(request.assetIds, request.asOf);
    const records = outcome.quotes.map((quote) => priceQuoteToRecord(quote, this.providerId));

    return {
      providerId: this.providerId,
      mode: this.configured ? (outcome.quotes.length > 0 ? "live" : "error") : "disabled",
      ok: outcome.quotes.length > 0,
      respondedAt: new Date(this.now()).toISOString(),
      rawPayloadRef: `${this.providerId}:${outcome.quotes.length} quotes`,
      records,
      failureReason: outcome.quotes.length > 0 ? null : (outcome.failures[0]?.message ?? "No quotes returned."),
      warnings: outcome.failures.map((f) => `${f.assetId}: ${f.message}`),
    };
  }
}

/** Turn a normalized quote into the pipeline's raw evidence shape. */
export function priceQuoteToRecord(quote: PriceQuote, providerId: string): RawEvidenceRecord {
  const base = {
    rawEvidenceId: `${providerId}-${quote.assetId}-${quote.quotedAt}`,
    providerId,
    providerMode: "live" as const,
    providerRecordId: quote.providerSymbol,
    retrievedAt: quote.retrievedAt,
    // The quote time, not the fetch time. Freshness is measured from when the
    // market struck the price.
    publishedAt: quote.quotedAt,
    sourceRef: `${providerId}:${quote.providerSymbol}`,
    rawTitle: `${quote.providerSymbol} — ${quote.price} ${quote.currency} per ${quote.priceUnit}`,
    rawText: null,
    rawPayload: {
      previousClose: quote.previousClose,
      marketStatus: quote.marketStatus,
      timeliness: quote.timeliness,
      venue: quote.venue,
      priceUnit: quote.priceUnit,
    },
    assetIdentifiers: [
      { scheme: "provider_id" as const, value: `${providerId}:${quote.providerSymbol}` },
      { scheme: "ticker" as const, value: quote.providerSymbol.split(/[.:]/)[0] ?? quote.providerSymbol },
    ],
    evidenceCategory: "price" as const,
    rawValue: quote.price,
    rawUnit: quote.priceUnit,
    rawCurrency: quote.currency,
    geographicScope: null,
    rawConfidence: null,
    ingestionStatus: "ingested" as const,
    parsingWarnings: [],
    payloadMetadata: {
      factorHint: "valuation",
      purpose: "Current market price for margin-of-safety measurement",
      claimKey: `price:${quote.assetId}`,
      sourceName: quote.venue ?? providerId,
      adapterVersion: PRICE_ADAPTER_VERSION,
      timeliness: quote.timeliness,
    },
    supersedesRawEvidenceId: null,
  };
  return { ...base, checksum: computeRawChecksum(base) };
}

function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Anything the provider does not clearly state is `unknown`, not a guess. */
function readMarketStatus(value: unknown): MarketStatus {
  const known: MarketStatus[] = ["open", "closed", "pre_market", "post_market"];
  const candidate = typeof value === "string" ? value.toLowerCase().replace(/[\s-]/g, "_") : "";
  return known.find((s) => s === candidate) ?? "unknown";
}
