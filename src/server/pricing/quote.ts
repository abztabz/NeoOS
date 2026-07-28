import { z } from "zod";

/**
 * The normalized market quote, and the gate every price must pass.
 *
 * One rule governs this file: **a price with no verifiable identity, source or
 * timestamp is not a weaker price, it is not a price.** It is rejected, and the
 * surface says so.
 *
 * That is stricter than it sounds. A quote missing its `quoteTimestamp` cannot
 * be aged, so it cannot be shown as current without lying. A quote missing its
 * `sourceId` cannot be attributed, so a reader cannot check it. A zero price is
 * a malfunctioning feed, and a malfunctioning feed is more dangerous than no
 * feed at all because it produces a plausible margin of safety from a fiction.
 */

export const priceFreshnessValues = [
  "live",
  "delayed",
  "previous_close",
  "stale",
  "manual",
  "unavailable",
] as const;
export type PriceFreshness = (typeof priceFreshnessValues)[number];

export const priceFreshnessLabels: Record<PriceFreshness, string> = {
  live: "Live",
  delayed: "Delayed",
  previous_close: "Previous close",
  stale: "Stale",
  manual: "Manually entered",
  unavailable: "Unavailable",
};

export const marketStates = ["open", "closed", "pre_market", "after_hours", "unknown"] as const;
export type MarketState = (typeof marketStates)[number];

export const marketQuoteSchema = z.object({
  instrumentId: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().optional(),
  venue: z.string().optional(),
  mic: z.string().optional(),
  assetType: z.string().min(1),
  // Positive and finite. Zero is not a cheap asset, it is a broken feed.
  price: z.number().positive().finite(),
  currency: z.string().length(3),
  unit: z.string().optional(),
  quoteTimestamp: z.iso.datetime({ offset: true }),
  retrievedAt: z.iso.datetime({ offset: true }),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  providerInstrumentId: z.string().optional(),
  marketState: z.enum(marketStates),
  freshness: z.enum(priceFreshnessValues),
});
export type MarketQuote = z.infer<typeof marketQuoteSchema>;

export interface QuoteRejection {
  reason: string;
  field: string | null;
}

export type QuoteValidation =
  | { ok: true; quote: MarketQuote }
  | { ok: false; rejection: QuoteRejection };

/**
 * Validate a provider's response into a quote, or refuse it with a reason.
 *
 * Refusals are data rather than exceptions, because "this provider returned
 * something unusable" is a fact the evidence view should be able to display,
 * not a crash.
 */
export function validateQuote(candidate: unknown): QuoteValidation {
  const parsed = marketQuoteSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") ?? null;
    return {
      ok: false,
      rejection: {
        field,
        reason: `Quote rejected — ${field ?? "payload"}: ${issue?.message ?? "invalid"}.`,
      },
    };
  }

  const quote = parsed.data;

  // A quote struck after it was retrieved is a clock or mapping error. Allowing
  // it would let a provider hand NeoOS a future-dated price that never ages.
  if (Date.parse(quote.quoteTimestamp) > Date.parse(quote.retrievedAt) + 60_000) {
    return {
      ok: false,
      rejection: {
        field: "quoteTimestamp",
        reason: "Quote rejected — the quote is timestamped after it was retrieved.",
      },
    };
  }

  return { ok: true, quote };
}

/* ---------------- the decision gate ---------------- */

/**
 * Whether a quote may support a recommendation.
 *
 * `stale`, `manual` and `unavailable` all fail. Manual fails not because the
 * figure is wrong but because it is unverified: somebody typed it, and a Buy
 * issued on a number the system cannot check is a Buy issued on nothing.
 *
 * This is the single gate. Every Buy, Strong Buy, distance calculation and
 * opportunity ranking passes through it, so there is one place to read and one
 * place to change.
 */
export function canUsePriceForDecision(quote: MarketQuote | null): boolean {
  return Boolean(
    quote &&
      quote.price > 0 &&
      quote.quoteTimestamp &&
      quote.sourceId &&
      (["live", "delayed", "previous_close"] as PriceFreshness[]).includes(quote.freshness),
  );
}

export const PRICE_UNVERIFIED_MESSAGE =
  "Decision unavailable — current market price could not be verified.";

export const IDENTITY_UNVERIFIED_MESSAGE =
  "Price unavailable — instrument identity not verified.";

export const PRICE_UNAVAILABLE_MESSAGE = "Price unavailable";

/* ---------------- freshness ---------------- */

/**
 * How long a quote of each asset type stays current while its market is open.
 *
 * Asset-specific because the honest answer differs: an equity quote goes stale
 * in minutes during a session, an FX reference rate is published once a day and
 * is not stale for being hours old, and a metals reference moves continuously.
 */
export const MAX_QUOTE_AGE_MINUTES: Record<string, { open: number; closed: number }> = {
  stock: { open: 20, closed: 24 * 60 },
  etf: { open: 20, closed: 24 * 60 },
  fund: { open: 24 * 60, closed: 3 * 24 * 60 },
  index: { open: 20, closed: 24 * 60 },
  commodity: { open: 60, closed: 24 * 60 },
  fx: { open: 24 * 60, closed: 4 * 24 * 60 },
};

const DEFAULT_MAX_AGE = { open: 30, closed: 24 * 60 };

/**
 * Reclassify a quote by its age.
 *
 * Applied on read rather than on write, so a cached quote goes stale by sitting
 * still. The alternative — trusting the freshness the provider stamped on it —
 * means a quote cached at 9am is still labelled `live` at 4pm.
 */
export function classifyQuoteFreshness(quote: MarketQuote, now: Date): PriceFreshness {
  if (quote.freshness === "manual" || quote.freshness === "unavailable") return quote.freshness;

  const struck = Date.parse(quote.quoteTimestamp);
  if (Number.isNaN(struck)) return "stale";

  const ageMinutes = (now.getTime() - struck) / 60_000;
  const limits = MAX_QUOTE_AGE_MINUTES[quote.assetType] ?? DEFAULT_MAX_AGE;
  const allowed = quote.marketState === "open" ? limits.open : limits.closed;

  if (ageMinutes > allowed) return "stale";
  // Outside a session the best available truth is the previous close, and it is
  // labelled as such rather than as live.
  if (quote.marketState === "closed" && quote.freshness === "live") return "previous_close";
  return quote.freshness;
}

/** A quote re-stamped with its current freshness. Never re-stamps the timestamp. */
export function withCurrentFreshness(quote: MarketQuote, now: Date): MarketQuote {
  return { ...quote, freshness: classifyQuoteFreshness(quote, now) };
}
