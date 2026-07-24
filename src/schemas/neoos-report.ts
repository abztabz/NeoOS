import { z } from "zod";

/**
 * Zod contract for NeoOS daily reports.
 *
 * v1.0 (schemas/neoos-report.schema.json): deployment, scores, radar, assets.
 * v1.1 (schemas/neoos-report-v1.1.schema.json): adds OPTIONAL workspace
 * sections — regime, commentary, markets, portfolio, gold, cash, timeline,
 * tiers, deploymentPlan. Every section is optional so a v1.0 report (or a
 * partial v1.1 report) still imports; the UI falls back to labeled demo
 * content per missing section.
 *
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

/* ---------- v1.1 workspace sections (all optional) ---------- */

export const regionSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: score0to100,
  stance: z.string(),
  note: z.string(),
});

export const marketsSectionSchema = z.object({
  macroContext: z.string(),
  regions: z.array(regionSchema),
});

export const holdingDetailSchema = z.object({
  assetId: z.string(),
  allocation: z.string(),
  targetRange: z.string(),
  thesisStatus: z.string(),
  keyRisks: z.array(z.string()),
  reviewTrigger: z.string(),
  role: z.string(),
  tier: z.string(),
});

export const goldFactorSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: score0to100,
  note: z.string(),
});

export const goldSectionSchema = z.object({
  factors: z.array(goldFactorSchema),
  fairValueLow: z.number().nullable(),
  fairValueHigh: z.number().nullable(),
  role: z.string(),
});

export const cashSectionSchema = z.object({
  available: z.number(),
  emergencyReserve: z.number(),
  deployable: z.number(),
  monthlySurplus: z.number(),
  cashYieldPct: z.number(),
  opportunityCost: z.string(),
  recommendation: z.string(),
});

export const timelineKinds = ["deployment", "cash", "rating", "decision", "evidence"] as const;
export type TimelineKind = (typeof timelineKinds)[number];

export const timelineEventSchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  kind: z.enum(timelineKinds),
  cashScore: z.number().nullable(),
  deploymentPct: z.number().nullable(),
  detail: z.string(),
});

export const tierStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: score0to100,
  status: z.string(),
});

export const deploymentPlanRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  note: z.string(),
});

/* ---------- report versions ---------- */

const coreShape = {
  asOf: z.iso.datetime({ offset: true }),
  mode: z.enum(["demo", "live"]),
  deployment: deploymentSchema,
  scores: scoresSchema,
  radar: z.array(radarItemSchema),
  assets: z.array(assetSchema),
};

export const neoosReportV10Schema = z.object({
  schemaVersion: z.literal("1.0"),
  ...coreShape,
});

export const neoosReportV11Schema = z.object({
  schemaVersion: z.literal("1.1"),
  ...coreShape,
  regime: z.string().optional(),
  commentary: z.string().optional(),
  markets: marketsSectionSchema.optional(),
  portfolio: z.array(holdingDetailSchema).optional(),
  gold: goldSectionSchema.optional(),
  cash: cashSectionSchema.optional(),
  timeline: z.array(timelineEventSchema).optional(),
  tiers: z.array(tierStatusSchema).optional(),
  deploymentPlan: z.array(deploymentPlanRowSchema).optional(),
});

/** The application always works with the latest report shape. */
export type NeoosReport = z.infer<typeof neoosReportV11Schema>;
export type NeoosReportV10 = z.infer<typeof neoosReportV10Schema>;
export type NeoosAsset = z.infer<typeof assetSchema>;
export type RadarItem = z.infer<typeof radarItemSchema>;
export type RegionCard = z.infer<typeof regionSchema>;
export type HoldingDetail = z.infer<typeof holdingDetailSchema>;
export type GoldFactor = z.infer<typeof goldFactorSchema>;
export type GoldSection = z.infer<typeof goldSectionSchema>;
export type CashSection = z.infer<typeof cashSectionSchema>;
export type MarketsSection = z.infer<typeof marketsSectionSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type TierStatus = z.infer<typeof tierStatusSchema>;
export type DeploymentPlanRow = z.infer<typeof deploymentPlanRowSchema>;

/** Lift a validated v1.0 report to the v1.1 shape (sections stay absent). */
export function migrateV10toV11(report: NeoosReportV10): NeoosReport {
  return { ...report, schemaVersion: "1.1" };
}

export interface ParseReportSuccess {
  ok: true;
  report: NeoosReport;
  /** Version the file declared before any migration. */
  sourceVersion: "1.0" | "1.1";
}
export interface ParseReportFailure {
  ok: false;
  error: string;
}
export type ParseReportResult = ParseReportSuccess | ParseReportFailure;

/** Maximum accepted import size — a daily report is a few KB; 1 MB is generous. */
export const MAX_REPORT_BYTES = 1_000_000;

function firstIssueMessage(error: z.ZodError, version: string): string {
  const first = error.issues[0];
  const path = first && first.path.length > 0 ? first.path.join(".") : "report";
  const message = first ? first.message : "Unknown validation error";
  return `Report does not match schema v${version} — ${path}: ${message}`;
}

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

  const declared =
    typeof raw === "object" && raw !== null && "schemaVersion" in raw
      ? (raw as { schemaVersion: unknown }).schemaVersion
      : undefined;

  if (declared === "1.0") {
    const result = neoosReportV10Schema.safeParse(raw);
    if (!result.success) return { ok: false, error: firstIssueMessage(result.error, "1.0") };
    return { ok: true, report: migrateV10toV11(result.data), sourceVersion: "1.0" };
  }

  const result = neoosReportV11Schema.safeParse(raw);
  if (!result.success) {
    if (declared !== "1.1") {
      return {
        ok: false,
        error: `Report does not match schema v1.0 or v1.1 — unsupported schemaVersion ${JSON.stringify(declared ?? null)}.`,
      };
    }
    return { ok: false, error: firstIssueMessage(result.error, "1.1") };
  }
  return { ok: true, report: result.data, sourceVersion: "1.1" };
}
