import { z } from "zod";

/**
 * Unit, scale, and currency handling.
 *
 * The governing rule: a converted number never replaces the original. Every
 * conversion keeps the source value, source unit, the rate, where the rate came
 * from, and when — because a valuation that cannot be reproduced is not
 * evidence, it is a rumour with a decimal point.
 */

export const conversionRecordSchema = z.object({
  originalValue: z.number(),
  originalCurrency: z.string(),
  conversionRate: z.number().positive(),
  conversionSource: z.string(),
  conversionTimestamp: z.iso.datetime({ offset: true }),
  normalizedValue: z.number(),
  normalizedCurrency: z.string(),
});
export type ConversionRecord = z.infer<typeof conversionRecordSchema>;

/** A verified FX rate. Absent a rate, conversion does not happen — at all. */
export interface FxRate {
  from: string;
  to: string;
  rate: number;
  source: string;
  timestamp: string;
}

export type FxTable = FxRate[];

export function findRate(table: FxTable, from: string, to: string): FxRate | null {
  if (from === to) {
    return { from, to, rate: 1, source: "identity", timestamp: "1970-01-01T00:00:00Z" };
  }
  return table.find((r) => r.from === from && r.to === to) ?? null;
}

export interface CurrencyConversionOutcome {
  ok: boolean;
  conversion: ConversionRecord | null;
  reason: string | null;
}

/**
 * Convert only with a verified rate. When none exists the original value and
 * currency are preserved untouched and the caller must block any calculation
 * that would mix currencies.
 */
export function convertCurrency(
  value: number,
  from: string,
  to: string,
  table: FxTable,
): CurrencyConversionOutcome {
  const rate = findRate(table, from, to);
  if (rate === null) {
    return {
      ok: false,
      conversion: null,
      reason: `No verified ${from}→${to} rate available; original value preserved and dependent calculations blocked.`,
    };
  }
  return {
    ok: true,
    conversion: {
      originalValue: value,
      originalCurrency: from,
      conversionRate: rate.rate,
      conversionSource: rate.source,
      conversionTimestamp: rate.timestamp,
      normalizedValue: value * rate.rate,
      normalizedCurrency: to,
    },
    reason: null,
  };
}

/** Scale prefixes a source may use on a magnitude. */
const SCALE_FACTORS: Record<string, number> = {
  "": 1,
  unit: 1,
  units: 1,
  thousand: 1e3,
  thousands: 1e3,
  k: 1e3,
  million: 1e6,
  millions: 1e6,
  m: 1e6,
  mn: 1e6,
  billion: 1e9,
  billions: 1e9,
  bn: 1e9,
  b: 1e9,
};

export interface ScaleOutcome {
  ok: boolean;
  value: number | null;
  factor: number | null;
  reason: string | null;
}

export function applyScale(value: number, scale: string | null): ScaleOutcome {
  const key = (scale ?? "").trim().toLowerCase();
  const factor = SCALE_FACTORS[key];
  if (factor === undefined) {
    return { ok: false, value: null, factor: null, reason: `Unsupported scale "${scale}".` };
  }
  return { ok: true, value: value * factor, factor, reason: null };
}

/**
 * Units the pipeline understands. An unrecognised unit is a blocking problem,
 * not something to shrug at: silently treating basis points as percent moves a
 * number by two orders of magnitude.
 */
export const SUPPORTED_UNITS = [
  "score",
  "percent",
  "basis_points",
  "ratio",
  "currency_per_share",
  "currency_per_troy_ounce",
  "currency",
  "multiple",
  "count",
  "index_level",
] as const;
export type SupportedUnit = (typeof SUPPORTED_UNITS)[number];

export function isSupportedUnit(unit: string | null): unit is SupportedUnit {
  return unit !== null && (SUPPORTED_UNITS as readonly string[]).includes(unit);
}

/** Percent-family conversion to a plain percentage figure. */
export function toPercent(value: number, unit: SupportedUnit): number | null {
  if (unit === "percent") return value;
  if (unit === "basis_points") return value / 100;
  if (unit === "ratio") return value * 100;
  return null;
}

/**
 * Map a raw value onto the engine's 0–100 factor scale.
 *
 * Only units with a defensible mapping are accepted. A price or an absolute
 * currency amount has no intrinsic 0–100 meaning, so this returns null rather
 * than inventing one — those records inform valuation inputs instead.
 */
export function toFactorScale(value: number, unit: SupportedUnit): number | null {
  switch (unit) {
    case "score":
      return Math.max(0, Math.min(100, value));
    case "percent":
      return Math.max(0, Math.min(100, value));
    case "basis_points":
      return Math.max(0, Math.min(100, value / 100));
    case "ratio":
      return Math.max(0, Math.min(100, value * 100));
    default:
      return null;
  }
}

/**
 * Parse a date defensively. Returns null for anything unparseable rather than
 * an Invalid Date that poisons later arithmetic.
 */
export function parseDate(input: string | null): Date | null {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Normalize any parseable timestamp to a UTC ISO-8601 string. */
export function toUtcIso(input: string | null): string | null {
  const date = parseDate(input);
  return date === null ? null : date.toISOString();
}
