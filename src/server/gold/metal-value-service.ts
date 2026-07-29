import {
  classifyGoldStatus,
  computeMetalValues,
  GOLD_UNAVAILABLE_MESSAGE,
  METAL_VALUE_EXPLANATION,
  NOT_A_RESALE_QUOTE,
  type GoldStatus,
  type MetalValues,
} from "@/domain/gold/metal-value";
import {
  fetchGoldPrice,
  GOLD_API_SOURCE_NAME,
  type GoldObservation,
  type FetchOptions,
} from "@/server/gold/gold-api-provider";

/**
 * The gold metal-value board, cached.
 *
 * Two rules shape everything here.
 *
 * **A successful figure is cached for ten minutes.** Not per user and not per
 * page load — one process-wide entry. Gold moves slowly enough that a
 * ten-minute-old figure is the same answer, and hammering a free keyless
 * endpoint once per visitor is how a free keyless endpoint stops being either.
 *
 * **A failure never erases the last good figure.** It returns the retained one,
 * aged honestly by the clock. The alternative — blanking the board on a
 * transient timeout — trains somebody to reload until a number appears, which
 * is worse than showing a number that admits how old it is.
 *
 * What is never done is the third option: showing the retained figure without
 * saying it is retained. Every response carries the source timestamp, the
 * retrieval timestamp, and a status that can only get worse with age.
 */

export const CACHE_TTL_MS = 10 * 60 * 1000;

export interface GoldMetalValueBoard {
  available: boolean;
  status: GoldStatus;
  values: MetalValues | null;
  /** Present whenever a figure is shown. */
  sourceUpdatedAt: string | null;
  retrievedAt: string | null;
  sourceName: string;
  /** True when this came from cache rather than a fresh call. */
  fromCache: boolean;
  /** Set when the newest attempt failed and a retained figure is shown. */
  lastError: string | null;
  /** The keys actually parsed, so the mapping is auditable in production. */
  parsedFrom: GoldObservation["parsedFrom"] | null;
  explanation: string;
  resaleCaveat: string;
  unavailableReason: string | null;
}

interface CacheEntry {
  observation: GoldObservation;
  values: MetalValues;
  /** When this entry stops being reused. Independent of the quote's own age. */
  expiresAt: number;
}

/** Process-wide. One warm instance serves every visitor. */
let cache: CacheEntry | null = null;
let lastError: string | null = null;

/** Test seam. Not called in production. */
export function resetGoldCache(): void {
  cache = null;
  lastError = null;
}

export interface BoardOptions extends FetchOptions {
  /** Skip the cache and force a call. Used by the diagnostic route. */
  forceRefresh?: boolean;
}

function present(
  entry: CacheEntry,
  now: Date,
  fromCache: boolean,
  error: string | null,
): GoldMetalValueBoard {
  // Status is recomputed from the clock on every read. A cached figure goes
  // stale by sitting still, which is the entire point of not trusting the
  // status stamped when it arrived.
  const status = classifyGoldStatus(entry.observation.sourceUpdatedAt, now);
  const usable = status !== "unavailable";

  return {
    available: usable,
    status,
    values: usable ? entry.values : null,
    sourceUpdatedAt: entry.observation.sourceUpdatedAt,
    retrievedAt: entry.observation.retrievedAt,
    sourceName: GOLD_API_SOURCE_NAME,
    fromCache,
    lastError: error,
    parsedFrom: entry.observation.parsedFrom,
    explanation: METAL_VALUE_EXPLANATION,
    resaleCaveat: NOT_A_RESALE_QUOTE,
    unavailableReason: usable ? null : GOLD_UNAVAILABLE_MESSAGE,
  };
}

function unavailable(reason: string): GoldMetalValueBoard {
  return {
    available: false,
    status: "unavailable",
    values: null,
    sourceUpdatedAt: null,
    retrievedAt: null,
    sourceName: GOLD_API_SOURCE_NAME,
    fromCache: false,
    lastError: reason,
    parsedFrom: null,
    explanation: METAL_VALUE_EXPLANATION,
    resaleCaveat: NOT_A_RESALE_QUOTE,
    // Shown verbatim. Never a number, never a blank.
    unavailableReason: GOLD_UNAVAILABLE_MESSAGE,
  };
}

export async function getGoldMetalValues(options: BoardOptions = {}): Promise<GoldMetalValueBoard> {
  const now = (options.now ?? (() => new Date()))();

  if (!options.forceRefresh && cache && cache.expiresAt > now.getTime()) {
    return present(cache, now, true, lastError);
  }

  const result = await fetchGoldPrice({
    ...options,
    now: () => now,
    // The movement guard compares against the last figure NeoOS actually
    // verified, so a feed glitch cannot walk the price somewhere absurd one
    // acceptable step at a time.
    previousPrice: options.previousPrice ?? cache?.observation.xauUsdPerTroyOunce ?? null,
  });

  if (result.ok) {
    lastError = null;
    cache = {
      observation: result.observation,
      values: computeMetalValues(result.observation.xauUsdPerTroyOunce),
      expiresAt: now.getTime() + CACHE_TTL_MS,
    };
    return present(cache, now, false, null);
  }

  lastError = result.reason;

  // Retain the last verified figure through a transient failure, aged honestly.
  if (cache) return present(cache, now, true, result.reason);

  return unavailable(result.reason);
}

/** What the diagnostic route reports. Never includes a fabricated price. */
export async function describeGoldSource(options: BoardOptions = {}): Promise<{
  url: string;
  reachable: boolean;
  detail: string;
  board: GoldMetalValueBoard;
}> {
  const board = await getGoldMetalValues({ ...options, forceRefresh: true });
  return {
    url: "https://api.gold-api.com/price/XAU",
    reachable: board.available,
    detail: board.available
      ? `Parsed price from "${board.parsedFrom?.price}" and timestamp from "${board.parsedFrom?.timestamp}".`
      : (board.lastError ?? "No detail recorded."),
    board,
  };
}
