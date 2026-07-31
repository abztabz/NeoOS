import type { InstrumentIdentity } from "@/server/pricing/instrument";
import type {
  PricingProvider,
  ProviderDescriptor,
  ProviderHealth,
} from "@/server/pricing/provider";
import type { MarketQuote } from "@/server/pricing/quote";

/**
 * Public end-of-day equity prices — free, keyless, no registration.
 *
 * This exists because equities were the one asset class with no free path.
 * Gold has Gold-API, FX has the ECB, yields have the Treasury; AAPL and SPY had
 * only a licensed feed, so an unconfigured deployment could price everything
 * except the shares it actually holds.
 *
 * ## What this provider will and will not claim
 *
 * It reports a **settled session close**, and says so. It never claims an
 * intraday or real-time price, because the free tier is not one, and a
 * previous close labelled `live` is exactly the kind of plausible fiction the
 * pricing rules exist to prevent. `previous_close` is a decision-grade
 * freshness (see `canUsePriceForDecision`), so a close is usable — it is simply
 * usable *as a close*, and the UI names it that way.
 *
 * ## Why the timestamp is derived rather than parsed
 *
 * The upstream CSV carries a time field whose timezone is not documented and
 * differs by listing. Parsing it would mean guessing an offset, and a quote is
 * aged off its timestamp — so a wrong offset silently ages every price by hours
 * in the wrong direction. Instead only the **session date** is taken from the
 * feed, and the instant is derived from the documented US equity session close
 * (16:00 America/New_York) for that date, DST resolved via `Intl`.
 *
 * That is a narrower claim than the feed offers, and it is one that can be
 * checked: given the date, anybody can verify the close time independently.
 *
 * ## Fail closed, always
 *
 * Unknown symbol, non-numeric price, non-positive price, a price outside the
 * plausible band, an unparseable date, or a session that has not closed yet all
 * produce a thrown failure with a stated reason. None of them produce a number.
 * The service records the reason and the surface shows the price as
 * unavailable, which is the correct outcome and not a degraded one.
 */

export const STOOQ_BASE_URL = "https://stooq.com/q/l/";
export const PUBLIC_EQUITY_PROVIDER_ID = "stooq-public";
export const PUBLIC_EQUITY_PROVIDER_NAME = "Stooq public end-of-day quotes";
export const PUBLIC_EQUITY_SOURCE_NAME = "Stooq (public end-of-day close)";
export const PUBLIC_EQUITY_ATTRIBUTION =
  "End-of-day close published by Stooq (stooq.com), retrieved without credentials. " +
  "Free public data, not a licensed real-time feed. The timestamp is the US equity " +
  "session close (16:00 America/New_York) for the session date the feed returned.";

/**
 * Sanity band for a single share or ETF unit, in USD.
 *
 * Not a forecast and not a valuation. It is a feed-malfunction guard: a parser
 * that picks up a volume column instead of a close returns something wildly
 * outside this range, and that must fail rather than size a position.
 */
const MIN_PLAUSIBLE_PRICE = 0.01;
const MAX_PLAUSIBLE_PRICE = 1_000_000;

/** The instant a US equity session closes, resolved for DST on that date. */
export function sessionCloseInstant(sessionDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return null;

  // Anchor at 20:00 UTC — inside the US afternoon on either offset — purely to
  // ask Intl which offset New York was on that day. The anchor never appears in
  // the result.
  const anchor = new Date(`${sessionDate}T20:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return null;

  const offset = newYorkOffset(anchor);
  if (!offset) return null;

  return `${sessionDate}T16:00:00${offset}`;
}

/** "-04:00" or "-05:00" for the given instant, from the IANA database. */
function newYorkOffset(at: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  }).formatToParts(at);

  const name = parts.find((p) => p.type === "timeZoneName")?.value;
  if (!name) return null;

  // Intl renders "GMT-04:00", and "GMT" exactly when the offset is zero.
  if (name === "GMT") return "+00:00";
  const match = /^GMT([+-]\d{2}:\d{2})$/.exec(name);
  return match ? match[1]! : null;
}

export interface PublicEquityQuoteRow {
  symbol: string;
  date: string;
  close: number;
}

export type PublicEquityParse =
  | { ok: true; row: PublicEquityQuoteRow }
  | { ok: false; reason: string };

/**
 * Parse the CSV the feed returns for `f=sd2t2ohlcv`.
 *
 * Header: Symbol,Date,Time,Open,High,Low,Close,Volume
 *
 * The feed signals "I do not know this symbol" with `N/D` in the data columns
 * rather than an error status, so an unrecognised ticker arrives looking like a
 * successful response. That case is caught explicitly.
 */
export function parsePublicEquityCsv(body: string): PublicEquityParse {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { ok: false, reason: "Feed returned no data row." };
  }

  const header = lines[0]!.toLowerCase().split(",");
  const cells = lines[1]!.split(",");

  const at = (name: string): string | null => {
    const i = header.indexOf(name);
    return i >= 0 && i < cells.length ? cells[i]!.trim() : null;
  };

  const symbol = at("symbol");
  const date = at("date");
  const close = at("close");

  if (!symbol || !date || close === null) {
    return { ok: false, reason: "Feed response did not contain symbol, date and close columns." };
  }

  // The documented not-found marker. Never treat it as a value.
  if ([symbol, date, close].some((v) => v.toUpperCase() === "N/D")) {
    return { ok: false, reason: `Feed does not recognise symbol "${symbol}".` };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, reason: `Feed returned an unparseable session date "${date}".` };
  }

  const price = Number(close);
  if (!Number.isFinite(price)) {
    return { ok: false, reason: `Feed returned a non-numeric close "${close}".` };
  }
  if (price <= 0) {
    return { ok: false, reason: `Feed returned a non-positive close (${price}).` };
  }
  if (price < MIN_PLAUSIBLE_PRICE || price > MAX_PLAUSIBLE_PRICE) {
    return {
      ok: false,
      reason: `Feed returned ${price}, outside the plausible range for a share price. The column parsed may not be a close.`,
    };
  }

  return { ok: true, row: { symbol, date, close: price } };
}

export interface PublicEquityProviderOptions {
  /** Injected so tests exercise the real parser without network access. */
  fetchImpl?: typeof fetch;
  /** Free public data sits above licensed feeds only by cost, not by quality. */
  priority?: number;
  baseUrl?: string;
}

export class PublicEquityPricingProvider implements PricingProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly priority: number;
  private readonly baseUrl: string;
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastFailureReason: string | null = null;

  constructor(options: PublicEquityProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.priority = options.priority ?? 60;
    this.baseUrl = options.baseUrl ?? STOOQ_BASE_URL;
  }

  describe(): ProviderDescriptor {
    return {
      providerId: PUBLIC_EQUITY_PROVIDER_ID,
      providerName: PUBLIC_EQUITY_PROVIDER_NAME,
      sourceName: PUBLIC_EQUITY_SOURCE_NAME,
      assetTypes: ["stock", "etf", "index"],
      requiresCredentials: false,
      requiresPaidSubscription: false,
      outboundHosts: ["stooq.com"],
      attribution: PUBLIC_EQUITY_ATTRIBUTION,
      priority: this.priority,
    };
  }

  async getHealthStatus(): Promise<ProviderHealth> {
    return {
      providerId: PUBLIC_EQUITY_PROVIDER_ID,
      providerName: PUBLIC_EQUITY_PROVIDER_NAME,
      state: this.lastFailureReason && !this.lastSuccessAt ? "failing" : "ok",
      reason: this.lastFailureReason,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
    };
  }

  async getQuote(instrument: InstrumentIdentity): Promise<MarketQuote> {
    const mapped = instrument.providerMappings[PUBLIC_EQUITY_PROVIDER_ID];
    if (!mapped) {
      throw this.fail(
        `No mapping for ${instrument.symbol} on ${PUBLIC_EQUITY_PROVIDER_ID}. NeoOS will not guess a public-feed symbol.`,
      );
    }

    const url = `${this.baseUrl}?s=${encodeURIComponent(mapped)}&f=sd2t2ohlcv&h&e=csv`;
    const retrievedAt = new Date();

    let body: string;
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: "text/csv" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw this.fail(`Feed returned HTTP ${response.status} for ${mapped}.`);
      }
      body = await response.text();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Feed returned HTTP")) throw error;
      throw this.fail(
        `Could not reach the public quote feed for ${mapped}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const parsed = parsePublicEquityCsv(body);
    if (!parsed.ok) throw this.fail(parsed.reason);

    const quoteTimestamp = sessionCloseInstant(parsed.row.date);
    if (!quoteTimestamp) {
      throw this.fail(`Could not resolve a session close instant for "${parsed.row.date}".`);
    }

    // A close that has not happened yet is a feed or clock error. Rejecting it
    // here gives a precise reason; letting it through would trip the service's
    // future-dated guard with a vaguer one.
    if (Date.parse(quoteTimestamp) > retrievedAt.getTime() + 60_000) {
      throw this.fail(
        `Feed returned session ${parsed.row.date}, whose close has not occurred yet. No settled close is available.`,
      );
    }

    this.lastSuccessAt = retrievedAt.toISOString();
    this.lastFailureReason = null;

    return {
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      name: instrument.name,
      ...(instrument.exchange ? { venue: instrument.exchange } : {}),
      assetType: instrument.assetType,
      price: parsed.row.close,
      currency: instrument.currency,
      unit: "share",
      quoteTimestamp,
      retrievedAt: retrievedAt.toISOString(),
      sourceId: PUBLIC_EQUITY_PROVIDER_ID,
      sourceName: PUBLIC_EQUITY_SOURCE_NAME,
      providerInstrumentId: parsed.row.symbol,
      // A settled close is reported against a closed session, which is what
      // makes `classifyQuoteFreshness` age it on the closed-market allowance
      // rather than the 20-minute intraday one.
      marketState: "closed",
      freshness: "previous_close",
    };
  }

  private fail(reason: string): Error {
    this.lastFailureAt = new Date().toISOString();
    this.lastFailureReason = reason;
    return new Error(reason);
  }
}
