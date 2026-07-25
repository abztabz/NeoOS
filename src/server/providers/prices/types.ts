import { z } from "zod";
import { marketStatuses, quoteTimeliness } from "@/server/types/live-state";

/**
 * Normalized market quote.
 *
 * Prices are the one input NeoOS can never derive, infer, interpolate, or
 * carry forward. A missing price is a missing price: the asset reports
 * `partial_live` and the margin-of-safety calculation does not run. There is no
 * code path in this module that produces a number the provider did not send.
 *
 * `timeliness` is whatever the provider states about its own feed, and defaults
 * to `unknown` — which the staleness model treats conservatively. Asserting
 * real-time on a delayed feed would misrepresent both the data and the licence
 * it was obtained under.
 */

export const priceQuoteSchema = z.object({
  assetId: z.string(),
  /** Symbol as the provider knows it, kept for the audit trail. */
  providerSymbol: z.string(),
  price: z.number().positive(),
  currency: z.string().length(3),
  /**
   * The unit one `price` buys. "share" for equities and funds; "troy_ounce"
   * for gold. Explicit because a gold quote without a stated unit is
   * meaningless and has been the source of real-world errors.
   */
  priceUnit: z.string(),
  /** Provider-stated time of the quote, not the time NeoOS asked for it. */
  quotedAt: z.iso.datetime({ offset: true }),
  retrievedAt: z.iso.datetime({ offset: true }),
  timeliness: z.enum(quoteTimeliness),
  marketStatus: z.enum(marketStatuses),
  /** Previous close, where the provider supplies it. Never inferred. */
  previousClose: z.number().positive().nullable(),
  /** Venue or benchmark the quote is struck against. */
  venue: z.string().nullable(),
  providerId: z.string(),
});
export type PriceQuote = z.infer<typeof priceQuoteSchema>;

export type PriceFailureKind =
  | "unconfigured"
  | "unsupported_symbol"
  | "rate_limited"
  | "timeout"
  | "network"
  | "bad_status"
  | "malformed_response"
  | "implausible_value";

export interface PriceFailure {
  assetId: string;
  kind: PriceFailureKind;
  message: string;
}

export interface PriceFetchOutcome {
  quotes: PriceQuote[];
  failures: PriceFailure[];
}

/**
 * Sanity bounds on a quote.
 *
 * A provider returning zero, a negative number, or a NaN is malfunctioning, and
 * a malfunctioning price feed is more dangerous than no price feed: it produces
 * a plausible-looking margin of safety from a fictional number. Rejected here
 * rather than downstream, where the shape would already look legitimate.
 */
export function quoteIsPlausible(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

/**
 * Guard against a price moving further in one step than any real market does.
 *
 * This does not smooth or correct the value — it refuses it, so a decimal-shift
 * or currency-mixup in a vendor feed cannot silently become a Strong Buy. The
 * bound is deliberately loose: real markets do gap, and the goal is catching
 * corruption, not second-guessing volatility.
 */
export const MAX_PLAUSIBLE_SINGLE_STEP_MOVE = 0.6;

export function moveIsPlausible(price: number, previous: number | null): boolean {
  if (previous === null || previous <= 0) return true;
  return Math.abs(price - previous) / previous <= MAX_PLAUSIBLE_SINGLE_STEP_MOVE;
}
