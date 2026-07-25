import { fnv1a64, stableStringify } from "@/engine/hash";
import type { ProviderAdapter } from "@/intelligence/types/provider";
import { runDailyMorpheusCycle, type DailyCycleInput, type DailyCycleResult } from "@/intelligence/orchestration/cycle";
import { assessAssets, type AssetContext } from "@/server/orchestration/assess";
import type { ReportStore, JournalRecord } from "@/server/persistence/store";
import { signReportContent, verifyEnvelope } from "@/server/signing/sign";
import { contextPermitsLive, type ExecutionContextRecord } from "@/server/types/execution-context";
import {
  PIPELINE_VERSION,
  REPORT_ENVELOPE_SCHEMA_VERSION,
  type ProviderVersion,
  type ReportContent,
  type ReportEnvelope,
} from "@/server/types/report-envelope";
import { rollUpReportState, type ReportLiveState } from "@/server/types/live-state";

/**
 * The server cycle.
 *
 * It wraps the existing daily Morpheus cycle rather than replacing it — the
 * engine and the pipeline are untouched, and every score still comes from the
 * engine. What this layer adds is everything that only a server can do
 * honestly: retrieve credentialed evidence, judge how live the result actually
 * is, version it, sign it, and store it where the person reading it cannot
 * quietly edit it.
 *
 * Order matters and is not incidental. Assessment happens before the envelope
 * is built, the envelope is signed before it is stored, and the run is only
 * called live after the assessment says so. Reversing any of those would let a
 * report be labelled before it was judged.
 */

export interface ServerCycleInput extends Omit<DailyCycleInput, "adapters"> {
  adapters: ProviderAdapter[];
  execution: ExecutionContextRecord;
  assets: AssetContext[];
  store: ReportStore;
  /** Base64url PKCS#8 private key, or null when signing is unconfigured. */
  signingKey: string | null;
  /** Trusted public keys by key id, for the post-store verification pass. */
  trustedKeys: Record<string, string>;
  /** Assets no configured provider covers. */
  unsupportedAssetIds: string[];
}

export interface ServerCycleResult {
  cycle: DailyCycleResult;
  envelope: ReportEnvelope | null;
  liveState: ReportLiveState;
  stored: boolean;
  storeReason: string;
  /** Problems worth telling a human about. Drives notifications. */
  alerts: string[];
}

export async function runServerCycle(input: ServerCycleInput): Promise<ServerCycleResult> {
  const cycle = await runDailyMorpheusCycle({ ...input, adapters: input.adapters });
  const alerts: string[] = [];

  /* ---------- 1. honesty gate on the execution context ---------- */

  const claimsLive = cycle.contributingModes.includes("live");
  if (claimsLive && !contextPermitsLive(input.execution.context)) {
    // A client context cannot hold credentials, so a live record arriving in
    // one means something is wired wrong. Refusing is the only safe response:
    // the alternative is publishing a live claim the environment cannot back.
    throw new Error(
      `A ${input.execution.context} run produced records claiming live retrieval. Only a credentialed server run may claim live data.`,
    );
  }

  /* ---------- 2. per-asset live assessment ---------- */

  const assessments = assessAssets({
    assets: input.assets,
    rawRecords: cycle.rawRecords,
    identityTraces: cycle.identityTraces,
    engineInsufficientAssetIds: insufficientAssets(cycle),
    unresolvedConflictsByAsset: conflictsByAsset(cycle),
    providerErrorsByAsset: providerErrorsByAsset(cycle, input.assets),
    unsupportedAssetIds: input.unsupportedAssetIds,
    now: new Date(input.now),
  });

  const liveState = rollUpReportState(assessments, {
    anyLiveProvider: claimsLive,
    anyManualProvider: cycle.contributingModes.includes("manual_import"),
    runFailed: cycle.state === "failed",
  });

  /* ---------- 3. envelope ---------- */

  if (!cycle.report) {
    // Operational alerts are gathered BEFORE returning. A failed run is exactly
    // when an operator needs to know which provider broke, and an earlier
    // version of this function skipped them on the failure path — leaving the
    // one message that mattered saying only that nothing was produced.
    alerts.push(`Run ${cycle.runId} produced no report (${cycle.state}). The previous report is unchanged.`);
    alerts.push(...operationalAlerts(cycle, liveState, input.adapters));
    return { cycle, envelope: null, liveState, stored: false, storeReason: "No report to store.", alerts };
  }

  const previous = await input.store.getLatestReport();
  const content: ReportContent = {
    schemaVersion: REPORT_ENVELOPE_SCHEMA_VERSION,
    reportId: reportIdFor(cycle.runId, cycle.report),
    runId: cycle.runId,
    generatedAt: cycle.completedAt,
    evidenceCutoff: evidenceCutoff(cycle, input.now),
    engineVersion: cycle.report.engine.metadata.engineVersion,
    pipelineVersion: PIPELINE_VERSION,
    executionContext: input.execution.context,
    providerVersions: providerVersions(cycle),
    dataModes: [...new Set(cycle.contributingModes)],
    liveState,
    assetLiveStates: assessments,
    priorReportId: previous?.content.reportId ?? null,
    report: cycle.report,
  };

  /* ---------- 4. signature ---------- */

  const signature = input.signingKey ? signReportContent(content, input.signingKey, input.now) : null;
  if (!signature) {
    alerts.push(
      "This report is unsigned because no signing key is configured. It is stored, but its integrity cannot be verified later.",
    );
  }

  const envelope: ReportEnvelope = {
    content,
    signature,
    verification: { status: signature ? "not_checked" : "unsigned", checkedAt: null, detail: "" },
  };

  // Verify what we just signed. Catching a broken signing configuration here
  // is far better than discovering it when someone tries to audit a report.
  if (signature) {
    const outcome = verifyEnvelope(envelope, input.trustedKeys);
    envelope.verification = { status: outcome.status, checkedAt: input.now, detail: outcome.detail };
    if (outcome.status !== "verified") {
      alerts.push(`Signature self-check failed immediately after signing: ${outcome.detail}`);
    }
  }

  /* ---------- 5. store, then journal ---------- */

  const { stored, reason } = await input.store.saveReport(envelope);
  if (stored) {
    await input.store.appendJournalEntry(journalEntryFor(envelope, cycle));
  }

  alerts.push(...operationalAlerts(cycle, liveState, input.adapters));

  return { cycle, envelope, liveState, stored, storeReason: reason, alerts };
}

/**
 * A content-addressed report id.
 *
 * Derived from the run and the report's own content, so two runs producing
 * identical output collide deliberately — a re-run that changed nothing should
 * not create a second artefact claiming to be new information.
 */
export function reportIdFor(runId: string, report: unknown): string {
  return `report-${runId}-${fnv1a64(stableStringify(report)).slice(0, 12)}`;
}

/**
 * The latest instant any evidence in this run was published.
 *
 * Distinct from the run time. A 06:00 run working from a filing published at
 * 21:00 the previous evening has a cutoff of 21:00, and saying otherwise makes
 * the report look fresher than its evidence.
 */
function evidenceCutoff(cycle: DailyCycleResult, fallback: string): string {
  let latest = Number.NEGATIVE_INFINITY;
  for (const record of cycle.rawRecords) {
    const stamp = Date.parse(record.publishedAt ?? record.retrievedAt);
    if (!Number.isNaN(stamp) && stamp > latest) latest = stamp;
  }
  return latest === Number.NEGATIVE_INFINITY ? fallback : new Date(latest).toISOString();
}

function providerVersions(cycle: DailyCycleResult): ProviderVersion[] {
  return cycle.providers.map((provider) => {
    const contributed = cycle.rawRecords.filter((r) => r.providerId === provider.providerId);
    const adapterVersion = contributed
      .map((r) => r.payloadMetadata?.adapterVersion)
      .find((v): v is string => typeof v === "string");
    return {
      providerId: provider.providerId,
      providerName: provider.providerName,
      adapterVersion: adapterVersion ?? "unversioned",
      mode: provider.mode,
      sourceVersion: null,
      recordsContributed: contributed.length,
    };
  });
}

function insufficientAssets(cycle: DailyCycleResult): string[] {
  const excluded = cycle.excludedAssets.map((a) => a.assetId);
  const unrated = (cycle.report?.engine.recommendations ?? [])
    .filter((r) => r.status === "insufficient_evidence" || r.finalRating === null)
    .map((r) => r.assetId);
  return [...new Set([...excluded, ...unrated])];
}

/**
 * Attribute unresolved conflicts to assets.
 *
 * A conflict record names the evidence in disagreement, not an asset, because
 * a conflict can span macro evidence that touches several assets at once. The
 * mapping therefore goes through the evidence records, and a conflict rooted in
 * macro evidence (assetId null) affects no single asset and is skipped here —
 * the engine already reflects it in every asset's confidence.
 */
function conflictsByAsset(cycle: DailyCycleResult): Record<string, string[]> {
  const assetOfEvidence = new Map(cycle.normalizedEvidence.map((e) => [e.evidenceId, e.assetId]));
  const out: Record<string, string[]> = {};
  for (const conflict of cycle.report?.engine.conflicts ?? []) {
    if (conflict.resolution !== "unresolved") continue;
    const assetIds = new Set(
      conflict.evidenceIds.map((id) => assetOfEvidence.get(id)).filter((id): id is string => Boolean(id)),
    );
    for (const assetId of assetIds) {
      (out[assetId] ??= []).push(`${conflict.claimKey}: ${conflict.note}`);
    }
  }
  return out;
}

/**
 * Attribute provider failures to the assets they affect.
 *
 * Adapters report failures as warnings prefixed with the asset id, which is the
 * contract the fixture, EDGAR, and price adapters all follow.
 */
function providerErrorsByAsset(cycle: DailyCycleResult, assets: AssetContext[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const warning of cycle.warnings) {
    for (const asset of assets) {
      if (warning.startsWith(`${asset.assetId}:`)) {
        (out[asset.assetId] ??= []).push(warning);
      }
    }
  }
  return out;
}

function journalEntryFor(envelope: ReportEnvelope, cycle: DailyCycleResult): JournalRecord {
  const c = envelope.content;
  return {
    entryId: `journal-${c.reportId}`,
    reportId: c.reportId,
    recordedAt: c.generatedAt,
    kind: "report_generated",
    summary: `${c.liveState.replace("_", " ")} report from run ${c.runId}`,
    payload: {
      liveState: c.liveState,
      executionContext: c.executionContext,
      cycleState: cycle.state,
      dataModes: c.dataModes,
      evidenceCounts: cycle.evidenceCounts,
      priorReportId: c.priorReportId,
    },
    supersedes: null,
    // The signature is the real integrity control; this hash keeps the journal
    // self-checkable even for entries that predate a signing key.
    integrityHash: envelope.signature?.contentHash ?? fnv1a64(stableStringify(c)),
  };
}

/**
 * Things a human should be told about, phrased as findings rather than noise.
 *
 * Providers are re-described AFTER the run rather than read off the cycle's
 * snapshot. The cycle captures descriptors before it fetches, so that snapshot
 * necessarily predates every failure it might have wanted to report — an
 * unreachable endpoint shows up there as a healthy provider.
 */
function operationalAlerts(
  cycle: DailyCycleResult,
  liveState: ReportLiveState,
  adapters: ProviderAdapter[],
): string[] {
  const alerts: string[] = [];
  const afterRun = adapters.map((a) => a.describe());
  const failing = afterRun.filter(
    (p) => p.health === "failing" || p.health === "degraded" || p.mode === "error",
  );
  for (const provider of failing) {
    alerts.push(`${provider.providerName}: ${provider.failureReason ?? "failed with no reason given"}`);
  }
  // Provider warnings carry the actual retrieval errors, which is what an
  // operator acts on: a 403 from EDGAR and a timeout need different responses.
  for (const warning of cycle.warnings.slice(0, 10)) alerts.push(warning);
  if (cycle.rawRecords.length === 0) {
    alerts.push("No provider returned a single record. Check network egress and provider configuration.");
  }
  if (liveState === "live_stale") {
    alerts.push("Every live input in this run is older than its staleness horizon.");
  }
  if (liveState === "insufficient_evidence") {
    alerts.push("This run could not rate anything. The previous report stands.");
  }
  if (cycle.blockingErrors.length > 0) {
    alerts.push(`${cycle.blockingErrors.length} blocking validation error(s) in this run.`);
  }
  return alerts;
}
