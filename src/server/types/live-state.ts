import { z } from "zod";

/**
 * The live-data honesty model.
 *
 * A global "live" report does NOT imply every asset is live. The two state
 * scales below are deliberately separate so the report can say, truthfully,
 * "the run was live, and gold is still partial" — rather than rounding the
 * whole thing up or down to one comfortable word.
 *
 * The governing rule for this entire sprint: prefer `partial_live` or
 * `insufficient_evidence` over false completeness.
 */

/* ---------------- global report state ---------------- */

export const reportLiveStates = [
  "live_verified",
  "partial_live",
  "live_stale",
  "manual_verified",
  "fixture",
  "insufficient_evidence",
  "failed",
] as const;
export type ReportLiveState = (typeof reportLiveStates)[number];

export const reportLiveStateLabels: Record<ReportLiveState, string> = {
  live_verified: "Live verified",
  partial_live: "Partial live",
  live_stale: "Live but stale",
  manual_verified: "Manual evidence",
  fixture: "Fixture intelligence",
  insufficient_evidence: "Insufficient evidence",
  failed: "Run failed",
};

/* ---------------- asset-level state ---------------- */

export const assetLiveStates = [
  "live_verified",
  "partial_live",
  "stale",
  "conflicted",
  "insufficient_evidence",
  "unsupported",
  "provider_error",
] as const;
export type AssetLiveState = (typeof assetLiveStates)[number];

export const assetLiveStateLabels: Record<AssetLiveState, string> = {
  live_verified: "Live verified",
  partial_live: "Partial live",
  stale: "Stale",
  conflicted: "Conflicted evidence",
  insufficient_evidence: "Insufficient evidence",
  unsupported: "Not supported by any configured provider",
  provider_error: "Provider error",
};

/** Tone per asset state. Text always carries the meaning; colour is secondary. */
export const assetLiveStateTones: Record<AssetLiveState, "green" | "cyan" | "amber" | "red"> = {
  live_verified: "green",
  partial_live: "cyan",
  stale: "amber",
  conflicted: "amber",
  insufficient_evidence: "amber",
  unsupported: "amber",
  provider_error: "red",
};

/* ---------------- quote and filing freshness ---------------- */

/**
 * A price feed is either genuinely real-time or it is delayed. There is no
 * third option, and "unknown" is treated as delayed — claiming real-time
 * without the licence to do so is exactly the failure mode this guards.
 */
export const quoteTimeliness = ["real_time", "delayed", "end_of_day", "unknown"] as const;
export type QuoteTimeliness = (typeof quoteTimeliness)[number];

export const quoteTimelinessLabels: Record<QuoteTimeliness, string> = {
  real_time: "Real-time",
  delayed: "Delayed",
  end_of_day: "End of day",
  unknown: "Timeliness not stated by provider",
};

export const marketStatuses = ["open", "closed", "pre_market", "post_market", "unknown"] as const;
export type MarketStatus = (typeof marketStatuses)[number];

/**
 * Staleness thresholds in minutes, by timeliness class. A real-time quote goes
 * stale quickly; an end-of-day mark is expected to be hours old and should not
 * be flagged for it.
 */
export const QUOTE_STALE_AFTER_MINUTES: Record<QuoteTimeliness, number> = {
  real_time: 30,
  delayed: 120,
  end_of_day: 36 * 60,
  unknown: 60,
};

/** An official filing older than this is stale for live-rating purposes. */
export const FILING_STALE_AFTER_DAYS = 120;

export function quoteIsStale(
  quotedAt: string,
  timeliness: QuoteTimeliness,
  now: Date,
): boolean {
  const quoted = new Date(quotedAt).getTime();
  if (Number.isNaN(quoted)) return true;
  const ageMinutes = (now.getTime() - quoted) / 60_000;
  return ageMinutes > QUOTE_STALE_AFTER_MINUTES[timeliness];
}

export function ageMinutes(iso: string, now: Date): number | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, (now.getTime() - then) / 60_000);
}

/* ---------------- per-asset live assessment ---------------- */

export const assetLiveAssessmentSchema = z.object({
  assetId: z.string(),
  state: z.enum(assetLiveStates),
  /** Providers that actually contributed evidence for this asset. */
  contributingProviders: z.array(z.string()),
  /** Most recent retrieval across this asset's evidence. */
  lastRetrievedAt: z.iso.datetime({ offset: true }).nullable(),
  /** Age of the newest official filing used, in days. */
  filingAgeDays: z.number().nullable(),
  /** Age of the price quote used, in minutes. */
  quoteAgeMinutes: z.number().nullable(),
  quoteTimeliness: z.enum(quoteTimeliness).nullable(),
  marketStatus: z.enum(marketStatuses).nullable(),
  /** What is absent that would be needed for live_verified. */
  missingInputs: z.array(z.string()),
  /** Conflicts preventing a confident conclusion. */
  blockingConflicts: z.array(z.string()),
  reason: z.string(),
});
export type AssetLiveAssessment = z.infer<typeof assetLiveAssessmentSchema>;

/**
 * Requirements for an asset to be called `live_verified`.
 *
 * Both a current official filing AND a current price are required. A price
 * without fundamentals cannot support a rating; fundamentals without a price
 * cannot support a margin of safety. Either alone is `partial_live`.
 */
export interface LiveAssessmentInput {
  assetId: string;
  hasLiveFiling: boolean;
  hasLivePrice: boolean;
  filingAgeDays: number | null;
  quoteAgeMinutes: number | null;
  quoteTimeliness: QuoteTimeliness | null;
  quoteStale: boolean;
  marketStatus: MarketStatus | null;
  contributingProviders: string[];
  lastRetrievedAt: string | null;
  providerErrors: string[];
  unresolvedConflicts: string[];
  /** True when no configured provider covers this asset at all. */
  unsupported: boolean;
  /** True when the engine could not rate it regardless of data state. */
  engineInsufficient: boolean;
}

export function assessAssetLiveState(input: LiveAssessmentInput): AssetLiveAssessment {
  const missing: string[] = [];
  if (!input.hasLiveFiling) missing.push("current official filing");
  if (!input.hasLivePrice) missing.push("current market price");

  const base = {
    assetId: input.assetId,
    contributingProviders: input.contributingProviders,
    lastRetrievedAt: input.lastRetrievedAt,
    filingAgeDays: input.filingAgeDays,
    quoteAgeMinutes: input.quoteAgeMinutes,
    quoteTimeliness: input.quoteTimeliness,
    marketStatus: input.marketStatus,
    missingInputs: missing,
    blockingConflicts: input.unresolvedConflicts,
  };

  // Order matters: the most serious honest description wins.
  if (input.unsupported) {
    return {
      ...base,
      state: "unsupported",
      reason: "No configured provider covers this asset.",
    };
  }
  if (input.providerErrors.length > 0 && !input.hasLiveFiling && !input.hasLivePrice) {
    return {
      ...base,
      state: "provider_error",
      reason: `Every provider for this asset failed: ${input.providerErrors.join("; ")}`,
    };
  }
  if (input.engineInsufficient) {
    return {
      ...base,
      state: "insufficient_evidence",
      reason: "The engine could not rate this asset from the evidence available.",
    };
  }
  if (input.unresolvedConflicts.length > 0) {
    return {
      ...base,
      state: "conflicted",
      reason: `Unresolved evidence conflict(s): ${input.unresolvedConflicts.join("; ")}`,
    };
  }
  if (input.quoteStale || (input.filingAgeDays !== null && input.filingAgeDays > FILING_STALE_AFTER_DAYS)) {
    return {
      ...base,
      state: "stale",
      reason: input.quoteStale
        ? "The price quote is older than its staleness threshold."
        : `The newest official filing is ${input.filingAgeDays?.toFixed(0)} days old.`,
    };
  }
  if (input.hasLiveFiling && input.hasLivePrice) {
    return {
      ...base,
      state: "live_verified",
      reason: "Current official filing and current price both retrieved and verified.",
    };
  }
  return {
    ...base,
    state: "partial_live",
    reason: `Live evidence retrieved, but ${missing.join(" and ")} still missing.`,
  };
}

/**
 * Roll asset states up to a global report state.
 *
 * `live_verified` globally requires EVERY supported asset to be live_verified.
 * One partial asset makes the whole report partial — the report never rounds
 * up to the most flattering description of itself.
 */
export function rollUpReportState(
  assessments: AssetLiveAssessment[],
  opts: { anyLiveProvider: boolean; anyManualProvider: boolean; runFailed: boolean },
): ReportLiveState {
  if (opts.runFailed) return "failed";
  if (assessments.length === 0) return "insufficient_evidence";

  const supported = assessments.filter((a) => a.state !== "unsupported");
  if (supported.length === 0) return "insufficient_evidence";

  const allInsufficient = supported.every((a) => a.state === "insufficient_evidence");
  if (allInsufficient) return "insufficient_evidence";

  if (!opts.anyLiveProvider) {
    return opts.anyManualProvider ? "manual_verified" : "fixture";
  }

  const anyLive = supported.some((a) => a.state === "live_verified");
  const allLive = supported.every((a) => a.state === "live_verified");
  if (allLive) return "live_verified";

  // Live evidence exists but every live-capable asset is stale.
  const liveish = supported.filter((a) => a.state === "live_verified" || a.state === "stale");
  if (!anyLive && liveish.length > 0 && liveish.every((a) => a.state === "stale")) {
    return "live_stale";
  }

  return "partial_live";
}
