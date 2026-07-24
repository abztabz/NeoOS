import { z } from "zod";

/**
 * Zod mirror of schemas/neoos-report.schema.json (v1.0).
 * Imported JSON is untrusted: this schema is the only gate between a file
 * on disk and application state.
 */

const score0to100 = z.number().min(0).max(100);

export const radarSeverities = ["info", "positive", "caution", "risk"] as const;
export type RadarSeverity = (typeof radarSeverities)[number];

export const assetRatings = [
  "Strong Buy",
  "Buy",
  "Accumulate",
  "Hold",
  "Reduce",
  "Sell",
  "Avoid",
] as const;
export type AssetRating = (typeof assetRatings)[number];

export const deploymentSchema = z.object({
  score: score0to100,
  recommendation: z.string(),
  posture: z.string(),
  reasons: z.array(z.string()).min(1),
});

export const scoresSchema = z
  .object({
    cash: score0to100,
    market: score0to100,
    opportunity: score0to100,
    confidence: score0to100,
    evidenceIntegrity: score0to100,
    reserveHealth: score0to100,
  })
  .catchall(score0to100);

export const radarItemSchema = z.object({
  id: z.string(),
  severity: z.enum(radarSeverities),
  title: z.string(),
  detail: z.string(),
});

export const assetSchema = z.object({
  id: z.string(),
  ticker: z.string().optional(),
  name: z.string(),
  score: score0to100,
  rating: z.enum(assetRatings),
  confidence: score0to100,
  intrinsicValueLow: z.number().nullable().optional(),
  intrinsicValueHigh: z.number().nullable().optional(),
  buyBelow: z.number().nullable().optional(),
  strongBuyBelow: z.number().nullable().optional(),
});

export const neoosReportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  asOf: z.iso.datetime({ offset: true }),
  mode: z.enum(["demo", "live"]),
  deployment: deploymentSchema,
  scores: scoresSchema,
  radar: z.array(radarItemSchema),
  assets: z.array(assetSchema),
});

export type NeoosReport = z.infer<typeof neoosReportSchema>;
export type NeoosAsset = z.infer<typeof assetSchema>;
export type RadarItem = z.infer<typeof radarItemSchema>;

export interface ParseReportSuccess {
  ok: true;
  report: NeoosReport;
}
export interface ParseReportFailure {
  ok: false;
  error: string;
}
export type ParseReportResult = ParseReportSuccess | ParseReportFailure;

/** Maximum accepted import size — a daily report is a few KB; 1 MB is generous. */
export const MAX_REPORT_BYTES = 1_000_000;

/** Safely parse untrusted JSON text into a validated report. Never throws. */
export function parseReport(text: string): ParseReportResult {
  if (new TextEncoder().encode(text).byteLength > MAX_REPORT_BYTES) {
    return { ok: false, error: "File is too large. NeoOS reports are under 1 MB." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON. Check the file and try again." };
  }
  const result = neoosReportSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first && first.path.length > 0 ? first.path.join(".") : "report";
    const message = first ? first.message : "Unknown validation error";
    return {
      ok: false,
      error: `Report does not match schema v1.0 — ${path}: ${message}`,
    };
  }
  return { ok: true, report: result.data };
}
