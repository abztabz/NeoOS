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

/**
 * Asset identity: a row is either a SPECIFIC INSTRUMENT (real ticker, real
 * exchange) or a generic CATEGORY (e.g. "Developed-market value ETF" as a
 * bucket). A category must never be labeled with a ticker as though it were
 * a specific instrument.
 */
export const assetKinds = ["instrument", "category"] as const;
export type AssetKind = (typeof assetKinds)[number];

export const assetSchema = z.object({
  id: z.string(),
  kind: z.enum(assetKinds).optional(),
  ticker: z.string().optional(),
  exchange: z.string().optional(),
  currency: z.string().optional(),
  assetClass: z.string().optional(),
  category: z.string().optional(),
  region: z.string().optional(),
  name: z.string(),
  /**
   * Null when the engine returned Insufficient Evidence: the app shows that
   * state rather than a fabricated number. Numeric values from v1.0/v1.1
   * files remain valid — this is a widening, not a breaking change.
   */
  score: score0to100.nullable(),
  rating: z.enum(assetRatings).nullable(),
  status: z.enum(["rated", "insufficient_evidence"]).optional(),
  insufficientReasons: z.array(z.string()).optional(),
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

/** Reject duplicate asset ids and categories masquerading as tickers. */
function assetIntegrityRefine(
  assets: { id: string; kind?: AssetKind; ticker?: string }[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  assets.forEach((asset, index) => {
    if (seen.has(asset.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["assets", index, "id"],
        message: `Duplicate asset id "${asset.id}" — each asset must appear once.`,
      });
    }
    seen.add(asset.id);
    if (asset.kind === "category" && asset.ticker) {
      ctx.addIssue({
        code: "custom",
        path: ["assets", index, "ticker"],
        message: `Asset "${asset.id}" is a generic category and must not carry a ticker.`,
      });
    }
  });
}

export const neoosReportV10Schema = z
  .object({
    schemaVersion: z.literal("1.0"),
    ...coreShape,
  })
  .superRefine((report, ctx) => assetIntegrityRefine(report.assets, ctx));

export const neoosReportV11Schema = z.object({
  schemaVersion: z.literal("1.1"),
  ...coreShape,
  /** When the underlying evidence set was last refreshed (may lag asOf). */
  evidenceUpdatedAt: z.iso.datetime({ offset: true }).optional(),
  /** Version of the scoring engine that produced the report, e.g. "2.0.0". */
  engineVersion: z.string().optional(),
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

export const neoosReportV11Checked = neoosReportV11Schema.superRefine((report, ctx) =>
  assetIntegrityRefine(report.assets, ctx),
);

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
  sourceVersion: "1.0" | "1.1" | "2.0";
  /**
   * Full engine payload — present only for v2.0 files, which carry the
   * auditable calculation trace alongside the presentation view.
   */
  engine?: unknown;
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

  if (declared === "2.0") {
    // Engine report file: { schemaVersion, engine, view }. The view is
    // validated with the same v1.1 contract; the engine payload is validated
    // by the caller (parsing it here would pull the engine into every import).
    const shape = z.object({
      schemaVersion: z.literal("2.0"),
      engine: z.unknown(),
      view: neoosReportV11Checked,
    });
    const result = shape.safeParse(raw);
    if (!result.success) return { ok: false, error: firstIssueMessage(result.error, "2.0") };
    return { ok: true, report: result.data.view, sourceVersion: "2.0", engine: result.data.engine };
  }

  if (declared === "1.0") {
    const result = neoosReportV10Schema.safeParse(raw);
    if (!result.success) return { ok: false, error: firstIssueMessage(result.error, "1.0") };
    return { ok: true, report: migrateV10toV11(result.data), sourceVersion: "1.0" };
  }

  const result = neoosReportV11Checked.safeParse(raw);
  if (!result.success) {
    if (declared !== "1.1") {
      return {
        ok: false,
        error: `Unsupported schemaVersion ${JSON.stringify(declared ?? null)} — NeoOS accepts v1.0, v1.1, and v2.0 engine reports.`,
      };
    }
    return { ok: false, error: firstIssueMessage(result.error, "1.1") };
  }
  return { ok: true, report: result.data, sourceVersion: "1.1" };
}
