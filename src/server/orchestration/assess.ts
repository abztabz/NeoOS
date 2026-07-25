import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import type { IdentityTrace } from "@/intelligence/types/cycle";
import { maximumClaimForAsset } from "@/server/config/source-policy";
import {
  ageMinutes,
  assessAssetLiveState,
  FILING_STALE_AFTER_DAYS,
  quoteIsStale,
  type AssetLiveAssessment,
  type AssetLiveState,
  type MarketStatus,
  type QuoteTimeliness,
} from "@/server/types/live-state";

/**
 * Turn a completed cycle into per-asset live assessments.
 *
 * The inputs are the raw records and their identity resolutions rather than the
 * normalized evidence, because only the raw record knows which provider mode it
 * arrived under — and mode is the whole question. A record that has been
 * normalized looks identical whether it came from EDGAR or a fixture file, which
 * is correct for scoring and useless for honesty.
 */

export interface AssetContext {
  assetId: string;
  country: string | null;
  region: string | null;
  assetClass: string;
}

export interface AssessmentInput {
  assets: AssetContext[];
  rawRecords: RawEvidenceRecord[];
  identityTraces: IdentityTrace[];
  /** Assets the engine could not rate, whatever the data state. */
  engineInsufficientAssetIds: string[];
  unresolvedConflictsByAsset: Record<string, string[]>;
  providerErrorsByAsset: Record<string, string[]>;
  /** Assets no configured provider covers at all. */
  unsupportedAssetIds: string[];
  now: Date;
}

/** Rank used to clamp an assessment down to its policy ceiling. */
const STATE_RANK: Record<AssetLiveState, number> = {
  live_verified: 5,
  partial_live: 4,
  stale: 3,
  conflicted: 2,
  insufficient_evidence: 1,
  provider_error: 0,
  unsupported: 0,
};

const CEILING_STATE: Record<string, AssetLiveState> = {
  live_verified: "live_verified",
  partial_live: "partial_live",
  manual_verified: "partial_live",
  unsupported: "unsupported",
};

export function assessAssets(input: AssessmentInput): AssetLiveAssessment[] {
  const assetOf = new Map<string, string | null>();
  for (const trace of input.identityTraces) {
    assetOf.set(trace.rawEvidenceId, trace.resolution.assetId);
  }

  return input.assets.map((asset) => {
    const records = input.rawRecords.filter((r) => assetOf.get(r.rawEvidenceId) === asset.assetId);
    const live = records.filter((r) => r.providerMode === "live");

    const filings = live.filter(
      (r) => r.evidenceCategory === "filing" || r.evidenceCategory === "fundamental",
    );
    const prices = live.filter((r) => r.evidenceCategory === "price");

    const newestFiling = newestBy(filings, (r) => r.publishedAt ?? r.retrievedAt);
    const newestPrice = newestBy(prices, (r) => r.publishedAt ?? r.retrievedAt);

    const filingAgeDays = newestFiling
      ? daysBetween(newestFiling.publishedAt ?? newestFiling.retrievedAt, input.now)
      : null;
    const quoteAt = newestPrice?.publishedAt ?? newestPrice?.retrievedAt ?? null;
    const quoteAgeMin = quoteAt ? ageMinutes(quoteAt, input.now) : null;
    const timeliness = readTimeliness(newestPrice);

    const raw = assessAssetLiveState({
      assetId: asset.assetId,
      // A filing older than the horizon is not "current", so it does not
      // satisfy the live half; the assessor then reports it as stale.
      hasLiveFiling: filingAgeDays !== null,
      hasLivePrice: quoteAt !== null,
      filingAgeDays,
      quoteAgeMinutes: quoteAgeMin,
      quoteTimeliness: timeliness,
      quoteStale: quoteAt !== null && timeliness !== null ? quoteIsStale(quoteAt, timeliness, input.now) : false,
      marketStatus: readMarketStatus(newestPrice),
      contributingProviders: [...new Set(records.map((r) => r.providerId))],
      lastRetrievedAt: newestBy(records, (r) => r.retrievedAt)?.retrievedAt ?? null,
      providerErrors: input.providerErrorsByAsset[asset.assetId] ?? [],
      unresolvedConflicts: input.unresolvedConflictsByAsset[asset.assetId] ?? [],
      unsupported: input.unsupportedAssetIds.includes(asset.assetId),
      engineInsufficient: input.engineInsufficientAssetIds.includes(asset.assetId),
    });

    return clampToPolicy(raw, asset);
  });
}

/**
 * Clamp an assessment to the ceiling its jurisdiction permits.
 *
 * An asset can fall short of its ceiling for evidence reasons. It can never
 * exceed it, however good the evidence looks — a UAE issuer with a beautifully
 * complete manual filing set is still `partial_live` at best, because NeoOS did
 * not retrieve that evidence from a structured official endpoint. Clamping here
 * rather than at the point of display means no rendering path can bypass it.
 */
function clampToPolicy(assessment: AssetLiveAssessment, asset: AssetContext): AssetLiveAssessment {
  const ceilingName = maximumClaimForAsset(asset);
  const ceiling = CEILING_STATE[ceilingName] ?? "partial_live";
  if (STATE_RANK[assessment.state] <= STATE_RANK[ceiling]) return assessment;

  return {
    ...assessment,
    state: ceiling,
    reason: `${assessment.reason} Capped at ${ceiling.replace("_", " ")} by source policy for this asset's jurisdiction and class.`,
  };
}

function newestBy<T>(items: T[], key: (item: T) => string | null): T | null {
  let best: T | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const value = key(item);
    const time = value ? Date.parse(value) : Number.NaN;
    if (!Number.isNaN(time) && time > bestTime) {
      best = item;
      bestTime = time;
    }
  }
  return best;
}

function daysBetween(iso: string, now: Date): number | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, (now.getTime() - then) / 86_400_000);
}

/**
 * Read the provider's own timeliness claim off the record.
 *
 * Absent or unrecognised becomes `unknown`, which the staleness model treats
 * conservatively. There is deliberately no path that infers real-time.
 */
function readTimeliness(record: RawEvidenceRecord | null): QuoteTimeliness | null {
  if (!record) return null;
  const stated = record.payloadMetadata?.timeliness;
  const known: QuoteTimeliness[] = ["real_time", "delayed", "end_of_day"];
  return known.find((t) => t === stated) ?? "unknown";
}

function readMarketStatus(record: RawEvidenceRecord | null): MarketStatus | null {
  if (!record) return null;
  const stated = (record.rawPayload as { marketStatus?: unknown } | null)?.marketStatus;
  const known: MarketStatus[] = ["open", "closed", "pre_market", "post_market"];
  return known.find((s) => s === stated) ?? "unknown";
}

export { FILING_STALE_AFTER_DAYS };
