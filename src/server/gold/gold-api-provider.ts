/**
 * Gold-API.com — XAU/USD, free and keyless.
 *
 * `GET https://api.gold-api.com/price/XAU`, server-side only. There is no
 * credential to leak, but the call still never happens from the browser: a
 * client-side fetch would bypass the cache, the validation and the plausibility
 * guard below, which is to say it would bypass everything that makes the number
 * trustworthy.
 *
 * ## Why the parser discovers field names instead of hardcoding them
 *
 * The response schema could not be observed while this was written — the build
 * environment's egress policy blocks `api.gold-api.com`, so no live call was
 * possible. Rather than guess `price` and `updatedAt` and ship something that
 * silently mis-parses, this reads a *candidate list* of plausible keys,
 * validates whatever it finds, and **refuses when nothing validates** — and the
 * refusal carries the keys the payload actually had.
 *
 * That makes the first real call self-diagnosing: if the schema differs, the
 * board says unavailable and `/api/gold/metal-value` reports the observed keys,
 * instead of showing a wrong number. `parsedFrom` records which key was used,
 * so what got parsed is never a matter of inference.
 *
 * The guard that makes this safe is not the key list — it is `validate()`. A
 * mis-parsed field has to survive being finite, positive, inside a plausible
 * XAU/USD band, and carrying a sane timestamp. Almost nothing does that by
 * accident.
 */

export const GOLD_API_URL = "https://api.gold-api.com/price/XAU";
export const GOLD_API_SOURCE_ID = "gold-api-com";
export const GOLD_API_SOURCE_NAME = "Gold-API.com XAU/USD";

/** Ten seconds. A dashboard that hangs on a metal price is worse than one that says it cannot get one. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Sanity band for XAU/USD, in dollars per troy ounce.
 *
 * Deliberately wide — this is not a forecast, it is a "did we parse a gold
 * price or a percentage change" check. A field holding 2.3 or 45000 is not gold
 * and must not reach the conversion.
 */
export const XAU_USD_PLAUSIBLE_MIN = 100;
export const XAU_USD_PLAUSIBLE_MAX = 100_000;

/** Rule 8: a move this large against the last verified figure is refused. */
export const MAX_MOVE_FRACTION = 0.2;

/** Candidate keys, most specific first. Recorded in `parsedFrom` when one hits. */
const PRICE_KEYS = ["price", "value", "rate", "ask", "last", "close", "amount", "usd"] as const;
const TIMESTAMP_KEYS = [
  "updatedAt",
  "updated_at",
  "timestamp",
  "time",
  "date",
  "updatedAtUtc",
  "lastUpdated",
  "last_updated",
] as const;
const SYMBOL_KEYS = ["symbol", "name", "metal", "ticker", "code"] as const;

export interface GoldObservation {
  xauUsdPerTroyOunce: number;
  /** When the source says the figure was struck. */
  sourceUpdatedAt: string;
  /** When NeoOS received it. Recorded separately, never substituted. */
  retrievedAt: string;
  symbol: string;
  sourceId: string;
  sourceName: string;
  /** Which response keys the values came from. Makes parsing auditable. */
  parsedFrom: { price: string; timestamp: string; symbol: string | null };
  /** The untouched payload, stored so a stored valuation stays checkable. */
  raw: unknown;
}

export type GoldFetchResult =
  | { ok: true; observation: GoldObservation }
  | {
      ok: false;
      reason: string;
      /** Present on a parse failure: what the payload actually contained. */
      observedKeys?: string[];
      rawSample?: string;
    };

/* ---------------- parsing ---------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A number, from a number or a numeric string.
 *
 * Strings are accepted because JSON APIs commonly quote decimals to dodge
 * float issues; `"3421.55"` is a price, `"n/a"` is not, and `Number()` on the
 * latter gives NaN which the caller rejects.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Normalise a timestamp to ISO 8601.
 *
 * Accepts ISO strings and epoch seconds/milliseconds, because both are common
 * and the difference is unambiguous at any plausible date. Anything else is
 * refused rather than defaulted to "now" — a quote stamped with its own arrival
 * time can never be aged, which defeats the entire freshness model.
 */
export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Below ~10^11 it is seconds; above, milliseconds. The boundary sits far
    // from any date this system will see.
    const ms = value < 100_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") return toIsoTimestamp(numeric);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function findKey<T>(
  payload: Record<string, unknown>,
  candidates: readonly string[],
  convert: (value: unknown) => T | null,
): { key: string; value: T } | null {
  for (const key of candidates) {
    if (!(key in payload)) continue;
    const converted = convert(payload[key]);
    if (converted !== null) return { key, value: converted };
  }
  return null;
}

export interface ParseOptions {
  retrievedAt: string;
}

/** Turn a decoded payload into an observation, or say precisely why not. */
export function parseGoldResponse(payload: unknown, options: ParseOptions): GoldFetchResult {
  const record = asRecord(payload);
  if (!record) {
    return { ok: false, reason: "Gold-API returned a payload that was not a JSON object." };
  }

  const observedKeys = Object.keys(record);
  const price = findKey(record, PRICE_KEYS, toNumber);
  if (!price) {
    return {
      ok: false,
      reason: "No numeric price field was found in the Gold-API response.",
      observedKeys,
      rawSample: JSON.stringify(record).slice(0, 400),
    };
  }

  const timestamp = findKey(record, TIMESTAMP_KEYS, toIsoTimestamp);
  if (!timestamp) {
    // Rule 8: a missing timestamp is a rejection, not a defaulted "now".
    return {
      ok: false,
      reason: "No usable source timestamp was found in the Gold-API response.",
      observedKeys,
      rawSample: JSON.stringify(record).slice(0, 400),
    };
  }

  const symbol = findKey(record, SYMBOL_KEYS, (v) => (typeof v === "string" && v ? v : null));

  return {
    ok: true,
    observation: {
      xauUsdPerTroyOunce: price.value,
      sourceUpdatedAt: timestamp.value,
      retrievedAt: options.retrievedAt,
      symbol: symbol?.value ?? "XAU",
      sourceId: GOLD_API_SOURCE_ID,
      sourceName: GOLD_API_SOURCE_NAME,
      parsedFrom: { price: price.key, timestamp: timestamp.key, symbol: symbol?.key ?? null },
      raw: payload,
    },
  };
}

/* ---------------- validation ---------------- */

export interface ValidateOptions {
  /** The last figure NeoOS verified, for the movement guard. */
  previousPrice?: number | null;
}

/** Rule 8, in one place so every caller is held to the same bar. */
export function validateObservation(
  observation: GoldObservation,
  options: ValidateOptions = {},
): { ok: true } | { ok: false; reason: string } {
  const price = observation.xauUsdPerTroyOunce;

  if (!Number.isFinite(price)) {
    return { ok: false, reason: "Gold-API returned a non-numeric price." };
  }
  if (price <= 0) {
    // A zero or negative price is a malfunctioning feed, and a malfunctioning
    // feed is more dangerous than none: it produces a plausible-looking
    // valuation out of a fiction.
    return { ok: false, reason: `Gold-API returned a non-positive price (${price}).` };
  }
  if (price < XAU_USD_PLAUSIBLE_MIN || price > XAU_USD_PLAUSIBLE_MAX) {
    return {
      ok: false,
      reason: `Gold-API returned ${price} USD/oz, outside the plausible range for XAU/USD. The field parsed may not be a gold price.`,
    };
  }
  if (!observation.symbol.toUpperCase().includes("XAU") && observation.symbol !== "XAU") {
    return {
      ok: false,
      reason: `Gold-API returned symbol "${observation.symbol}", which is not XAU.`,
    };
  }

  const previous = options.previousPrice;
  if (previous !== null && previous !== undefined && previous > 0) {
    const move = Math.abs(price - previous) / previous;
    if (move > MAX_MOVE_FRACTION) {
      return {
        ok: false,
        reason: `Gold-API returned ${price} USD/oz, a ${(move * 100).toFixed(1)}% move from the last verified ${previous}. Refused as implausible.`,
      };
    }
  }

  return { ok: true };
}

/* ---------------- fetching ---------------- */

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  previousPrice?: number | null;
  timeoutMs?: number;
}

/**
 * One request, parsed and validated.
 *
 * Uses the platform `fetch` — no SDK, no Python, no subprocess — so it runs
 * unchanged in a Vercel Node serverless function.
 */
export async function fetchGoldPrice(options: FetchOptions = {}): Promise<GoldFetchResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);

  try {
    const response = await doFetch(GOLD_API_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, reason: `Gold-API returned HTTP ${response.status}.` };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: "Gold-API returned a body that was not valid JSON." };
    }

    const parsed = parseGoldResponse(payload, { retrievedAt: now().toISOString() });
    if (!parsed.ok) return parsed;

    const valid = validateObservation(parsed.observation, { previousPrice: options.previousPrice });
    if (!valid.ok) return { ok: false, reason: valid.reason };

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: message.includes("abort")
        ? "Gold-API did not respond within the timeout."
        : `Gold-API request failed: ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
