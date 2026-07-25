import { generateReport, type EngineReportFile, type UniverseInputs } from "@/engine/generate";
import type { EngineReport, EvidenceRecord, DecisionJournalEntry } from "@/engine/models";
import { fnv1a64, stableStringify } from "@/engine/hash";
import type { ProviderAdapter, ProviderDescriptor, ProviderMode } from "@/intelligence/types/provider";
import { providerModeLabels } from "@/intelligence/types/provider";
import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import type { ValidationIssue, RejectedRecord } from "@/intelligence/types/validation";
import type { AuditStep, CycleState, EvidenceCounts, IdentityTrace } from "@/intelligence/types/cycle";
import type { ReportDiff } from "@/intelligence/types/diff";
import type { MorpheusBriefing } from "@/intelligence/types/briefing";
import { ingestProviderResult } from "@/intelligence/ingestion/ingest";
import { resolveIdentity } from "@/intelligence/identity/resolver";
import { normalizeRecord, type NormalizationContext } from "@/intelligence/normalization/normalize";
import {
  validateGeneratedReport,
  validateNormalizedEvidence,
  validateRawRecord,
  validateUniverseInputs,
} from "@/intelligence/validation/validate";
import { detectPipelineConflicts } from "@/intelligence/conflicts/pipeline-conflicts";
import {
  buildUniverseInputs,
  type PortfolioContext,
  type ValuationConfig,
} from "@/intelligence/universe/build-universe";
import { compareReports } from "@/intelligence/comparison/compare";
import { generateBriefing } from "@/intelligence/briefing/briefing";
import { registryAssets } from "@/intelligence/identity/registry";
import type { FxTable } from "@/intelligence/normalization/units";

/**
 * The daily Morpheus cycle.
 *
 * ingest → identify → normalize → validate → resolve conflicts →
 * build UniverseInputs → score → generate report → compare → brief → draft journal
 *
 * The orchestrator owns sequencing and state; it computes nothing itself. Every
 * score comes from the existing engine, and a failed run returns the previous
 * report untouched rather than a blank one.
 */

export interface DailyCycleInput {
  runId: string;
  /** Cycle clock. Nothing downstream reads the wall clock. */
  now: string;
  adapters: ProviderAdapter[];
  context: PortfolioContext;
  valuationConfig: ValuationConfig;
  fxTable: FxTable;
  baseCurrency: string;
  journalHistory: DecisionJournalEntry[];
  previousReport: EngineReport | null;
}

export interface DailyCycleResult {
  schemaVersion: "3.0";
  runId: string;
  state: CycleState;
  startedAt: string;
  completedAt: string;
  providers: ProviderDescriptor[];
  contributingModes: ProviderMode[];
  /** Honest label for the whole run, derived from contributing modes. */
  dataLabel: string;
  evidenceCounts: EvidenceCounts;
  rawRecords: RawEvidenceRecord[];
  normalizedEvidence: EvidenceRecord[];
  rejectedRecords: RejectedRecord[];
  identityTraces: IdentityTrace[];
  issues: ValidationIssue[];
  excludedAssets: { assetId: string; reason: string }[];
  excludedEvidence: { evidenceId: string; reason: string }[];
  warnings: string[];
  blockingErrors: ValidationIssue[];
  universeInputs: UniverseInputs | null;
  report: EngineReportFile | null;
  diff: ReportDiff | null;
  briefing: MorpheusBriefing | null;
  draftJournalEntry: DecisionJournalEntry | null;
  auditTrace: AuditStep[];
}

/**
 * Run-level provenance label. A run is only "Live verified" when every
 * contributing record actually came from a live provider; any fixture or
 * manual contribution downgrades the label.
 */
export function labelForModes(modes: ProviderMode[]): string {
  const set = new Set(modes);
  if (set.size === 0) return "No data";
  if (set.size === 1) return providerModeLabels[[...set][0]!];
  if (set.has("live")) return "Partial live";
  if (set.has("fixture") && set.has("manual_import")) return "Fixture and manual evidence";
  return [...set].map((m) => providerModeLabels[m]).join(" + ");
}

function step(
  name: string,
  startedAt: string,
  ok: boolean,
  detail: string,
  counts: Record<string, number> | null = null,
): AuditStep {
  return { step: name, startedAt, completedAt: new Date().toISOString(), ok, detail, counts };
}

export async function runDailyMorpheusCycle(input: DailyCycleInput): Promise<DailyCycleResult> {
  const startedAt = input.now;
  const audit: AuditStep[] = [];
  const issues: ValidationIssue[] = [];
  const rejected = new Map<string, RejectedRecord>();

  const addRejection = (rawEvidenceId: string, providerId: string, reason: ValidationIssue) => {
    const existing = rejected.get(rawEvidenceId);
    if (existing) existing.reasons.push(reason);
    else rejected.set(rawEvidenceId, { rawEvidenceId, providerId, reasons: [reason] });
  };

  const fail = (state: CycleState, providers: ProviderDescriptor[]): DailyCycleResult => ({
    schemaVersion: "3.0",
    runId: input.runId,
    state,
    startedAt,
    completedAt: new Date().toISOString(),
    providers,
    contributingModes: [],
    dataLabel: "No data",
    evidenceCounts: emptyCounts(),
    rawRecords: [],
    normalizedEvidence: [],
    rejectedRecords: [...rejected.values()],
    identityTraces: [],
    issues,
    excludedAssets: [],
    excludedEvidence: [],
    warnings: [],
    blockingErrors: issues.filter((i) => i.severity === "blocking"),
    universeInputs: null,
    report: null,
    diff: null,
    briefing: null,
    draftJournalEntry: null,
    auditTrace: audit,
  });

  /* ---------- 1. provider configuration ---------- */
  let stepStart = new Date().toISOString();
  const providers = input.adapters.map((a) => a.describe());
  audit.push(
    step("load_provider_configuration", stepStart, true, `${providers.length} provider(s) registered.`, {
      providers: providers.length,
    }),
  );

  /* ---------- 2. ingest ---------- */
  stepStart = new Date().toISOString();
  const seen = new Map<string, RawEvidenceRecord>();
  const rawRecords: RawEvidenceRecord[] = [];
  const contributingModes: ProviderMode[] = [];
  let duplicatesDropped = 0;
  let providerFailures = 0;

  const assetIds = registryAssets().map((a) => a.assetId);
  for (const adapter of input.adapters) {
    const descriptor = adapter.describe();
    const result = await adapter.fetch({ assetIds, asOf: input.now });
    if (!result.ok) {
      providerFailures += 1;
      issues.push({
        code: "missing_provenance",
        severity: "warning",
        stage: "raw_input",
        message: `Provider ${descriptor.providerName} returned no data: ${result.failureReason ?? "unknown reason"}.`,
        subjectType: "run",
        subjectId: descriptor.providerId,
        assetId: null,
        detail: `mode ${result.mode}`,
      });
      continue;
    }
    const ingestion = ingestProviderResult(result, seen);
    duplicatesDropped += ingestion.duplicates.length;
    issues.push(...ingestion.issues);
    for (const rec of ingestion.records) {
      const rawIssues = validateRawRecord(rec, providers.find((p) => p.providerId === rec.providerId));
      const blocking = rawIssues.filter((i) => i.severity === "blocking");
      issues.push(...rawIssues);
      if (blocking.length > 0) {
        for (const b of blocking) addRejection(rec.rawEvidenceId, rec.providerId, b);
        continue;
      }
      rawRecords.push(rec);
      if (!contributingModes.includes(rec.providerMode)) contributingModes.push(rec.providerMode);
    }
  }
  audit.push(
    step("ingest_raw_evidence", stepStart, rawRecords.length > 0, `${rawRecords.length} record(s) ingested.`, {
      ingested: rawRecords.length,
      duplicates: duplicatesDropped,
      providerFailures,
    }),
  );

  if (rawRecords.length === 0) {
    issues.push({
      code: "no_usable_evidence",
      severity: "blocking",
      stage: "raw_input",
      message: "No provider returned usable evidence; the previous report is preserved.",
      subjectType: "run",
      subjectId: input.runId,
      assetId: null,
      detail: null,
    });
    audit.push(step("cycle_failed", stepStart, false, "No usable evidence."));
    return fail("failed", providers);
  }

  /* ---------- 3. identity ---------- */
  stepStart = new Date().toISOString();
  const identityTraces: IdentityTrace[] = [];
  const identityByRecord = new Map<string, IdentityTrace["resolution"]>();
  for (const record of rawRecords) {
    // Macro evidence is global by design and carries no asset identifiers, so
    // it is not put through identity resolution at all.
    if (record.evidenceCategory === "macro_indicator") {
      identityByRecord.set(record.rawEvidenceId, {
        outcome: "matched",
        assetId: null,
        method: null,
        confidence: 100,
        matchedIdentifiers: [],
        candidates: [],
        warnings: [],
        conflictingAssetIds: [],
      });
      continue;
    }

    const resolution = resolveIdentity(record.assetIdentifiers);
    identityByRecord.set(record.rawEvidenceId, resolution);
    identityTraces.push({
      rawEvidenceId: record.rawEvidenceId,
      suppliedIdentifiers: record.assetIdentifiers.map((i) => `${i.scheme}:${i.value}`),
      resolution,
    });

    if (resolution.outcome === "matched") continue;

    // The record is NOT attached to any asset — never a guess. It is dropped
    // with a warning naming the candidates considered. Whether that shortfall
    // matters is then decided by the engine's own insufficient-evidence gate:
    // an asset left without critical-factor coverage cannot be rated, while an
    // asset with ample other evidence is unaffected by one unusable record.
    const candidates = resolution.candidates.map((c) => `${c.assetId}@${c.confidence}`);
    issues.push({
      code:
        resolution.outcome === "ambiguous"
          ? "ambiguous_asset_identity"
          : resolution.outcome === "conflicted"
            ? "conflicting_asset_identity"
            : "unknown_asset_identity",
      severity: "warning",
      stage: "identity",
      message: `Evidence ${record.rawEvidenceId} was not attributed to any asset (${resolution.outcome}): ${resolution.warnings.join(" ")}`,
      subjectType: "raw_evidence",
      subjectId: record.rawEvidenceId,
      assetId: null,
      detail: `candidates considered: ${candidates.join(", ") || "none"}`,
    });
  }
  const identityCounts = {
    matched: identityTraces.filter((t) => t.resolution.outcome === "matched").length,
    ambiguous: identityTraces.filter((t) => t.resolution.outcome === "ambiguous").length,
    unmatched: identityTraces.filter((t) => t.resolution.outcome === "unmatched").length,
    conflicted: identityTraces.filter((t) => t.resolution.outcome === "conflicted").length,
  };
  audit.push(
    step("resolve_identity", stepStart, true, `${identityCounts.matched} matched.`, identityCounts),
  );

  /* ---------- 4/5. normalize + validate ---------- */
  stepStart = new Date().toISOString();
  const ctx: NormalizationContext = {
    now: input.now,
    baseCurrency: input.baseCurrency,
    fxTable: input.fxTable,
  };
  const normalized: EvidenceRecord[] = [];
  const rawById = new Map(rawRecords.map((r) => [r.rawEvidenceId, r]));
  for (const record of rawRecords) {
    const resolution = identityByRecord.get(record.rawEvidenceId)!;
    const outcome = normalizeRecord(record, resolution, ctx);
    issues.push(...outcome.issues);
    if (outcome.normalized === null) {
      for (const i of outcome.issues.filter((x) => x.severity === "blocking")) {
        addRejection(record.rawEvidenceId, record.providerId, i);
      }
      continue;
    }
    normalized.push(outcome.normalized.evidence);
  }
  const normalizationIssues = validateNormalizedEvidence(normalized, new Date(input.now));
  issues.push(...normalizationIssues);
  audit.push(
    step("normalize_and_validate", stepStart, normalized.length > 0, `${normalized.length} evidence record(s).`, {
      normalized: normalized.length,
      rejected: rejected.size,
    }),
  );

  /* ---------- 6. conflicts ---------- */
  stepStart = new Date().toISOString();
  const conflictOutcome = detectPipelineConflicts(normalized, rawById, new Date(input.now));
  issues.push(...conflictOutcome.issues);
  const unresolvedConflicts = conflictOutcome.conflicts.filter((c) => c.resolution === "unresolved");
  audit.push(
    step("resolve_conflicts", stepStart, true, `${conflictOutcome.conflicts.length} conflict(s).`, {
      total: conflictOutcome.conflicts.length,
      unresolved: unresolvedConflicts.length,
    }),
  );

  /* ---------- 7. UniverseInputs ---------- */
  stepStart = new Date().toISOString();
  const built = buildUniverseInputs({
    now: input.now,
    // Fixture and manual runs are demo-mode as far as the engine is concerned;
    // only a genuinely live run may claim otherwise.
    mode: contributingModes.every((m) => m === "live") ? "live" : "demo",
    evidence: normalized,
    identityTraces,
    issues,
    context: input.context,
    valuationConfig: input.valuationConfig,
    providers,
    journalHistory: input.journalHistory,
    previous: input.previousReport,
  });
  built.conflictSummary = {
    total: conflictOutcome.conflicts.length,
    unresolved: unresolvedConflicts.length,
  };
  const universeIssues = validateUniverseInputs(built.inputs);
  issues.push(...universeIssues);
  audit.push(
    step("build_universe_inputs", stepStart, built.inputs.entries.length > 0, `${built.inputs.entries.length} asset(s) enter scoring.`, {
      entries: built.inputs.entries.length,
      excluded: built.excludedAssets.length,
    }),
  );

  if (universeIssues.some((i) => i.severity === "blocking") || built.inputs.entries.length === 0) {
    audit.push(step("cycle_failed", stepStart, false, "UniverseInputs failed validation."));
    return { ...fail("insufficient_evidence", providers), rawRecords, normalizedEvidence: normalized, identityTraces, universeInputs: built.inputs, excludedAssets: built.excludedAssets, excludedEvidence: built.excludedEvidence, warnings: built.warnings, contributingModes, dataLabel: labelForModes(contributingModes), evidenceCounts: counts(rawRecords, rejected.size, duplicatesDropped, normalized, identityCounts, conflictOutcome.conflicts.length, unresolvedConflicts.length) };
  }

  /* ---------- 8/9. score + generate ---------- */
  stepStart = new Date().toISOString();
  const reportFile = generateReport(built.inputs);
  const reportIssues = validateGeneratedReport(reportFile);
  issues.push(...reportIssues);
  audit.push(
    step("generate_report", stepStart, reportIssues.every((i) => i.severity !== "blocking"), `Report generated by engine ${reportFile.engine.metadata.engineVersion}.`, {
      recommendations: reportFile.engine.recommendations.length,
    }),
  );

  if (reportIssues.some((i) => i.severity === "blocking")) {
    audit.push(step("cycle_failed", stepStart, false, "Generated report failed validation; previous report preserved."));
    return { ...fail("failed", providers), rawRecords, normalizedEvidence: normalized, identityTraces, contributingModes, dataLabel: labelForModes(contributingModes) };
  }

  /* ---------- 10. compare ---------- */
  stepStart = new Date().toISOString();
  const diff = compareReports(input.previousReport, reportFile.engine);
  audit.push(step("compare_reports", stepStart, true, `${diff.summary.total} change(s).`, diff.summary));

  /* ---------- 11. briefing ---------- */
  stepStart = new Date().toISOString();
  const dataLabel = labelForModes(contributingModes);
  const briefing = generateBriefing({
    runId: input.runId,
    report: reportFile.engine,
    diff,
    issues,
    providers,
    dataLabel,
    excludedAssets: built.excludedAssets,
  });
  audit.push(step("generate_briefing", stepStart, true, `${briefing.sections.length} section(s).`));

  /* ---------- 12. draft journal entry ---------- */
  stepStart = new Date().toISOString();
  const draft = draftJournalEntry(reportFile.engine, input.runId);
  audit.push(step("draft_journal_entry", stepStart, true, `Draft entry ${draft.entryId}.`));

  /* ---------- state selection ---------- */
  const insufficientCount = reportFile.engine.recommendations.filter(
    (r) => r.status === "insufficient_evidence",
  ).length;
  const hasBlocking = issues.some((i) => i.severity === "blocking");
  const state: CycleState =
    insufficientCount === reportFile.engine.recommendations.length
      ? "insufficient_evidence"
      : providerFailures > 0 || hasBlocking || built.excludedAssets.length > 0 || rejected.size > 0
        ? "partial_success"
        : "success";

  return {
    schemaVersion: "3.0",
    runId: input.runId,
    state,
    startedAt,
    completedAt: new Date().toISOString(),
    providers,
    contributingModes,
    dataLabel,
    evidenceCounts: counts(
      rawRecords,
      rejected.size,
      duplicatesDropped,
      normalized,
      identityCounts,
      conflictOutcome.conflicts.length,
      unresolvedConflicts.length,
    ),
    rawRecords,
    normalizedEvidence: normalized,
    rejectedRecords: [...rejected.values()],
    identityTraces,
    issues,
    excludedAssets: built.excludedAssets,
    excludedEvidence: built.excludedEvidence,
    warnings: built.warnings,
    blockingErrors: issues.filter((i) => i.severity === "blocking"),
    universeInputs: built.inputs,
    report: reportFile,
    diff,
    briefing,
    draftJournalEntry: draft,
    auditTrace: audit,
  };
}

function emptyCounts(): EvidenceCounts {
  return {
    rawIngested: 0,
    rawRejected: 0,
    duplicatesDropped: 0,
    normalized: 0,
    identityMatched: 0,
    identityAmbiguous: 0,
    identityUnmatched: 0,
    identityConflicted: 0,
    conflictsDetected: 0,
    conflictsUnresolved: 0,
  };
}

function counts(
  raw: RawEvidenceRecord[],
  rejectedCount: number,
  duplicates: number,
  normalized: EvidenceRecord[],
  identity: { matched: number; ambiguous: number; unmatched: number; conflicted: number },
  conflicts: number,
  unresolved: number,
): EvidenceCounts {
  return {
    rawIngested: raw.length,
    rawRejected: rejectedCount,
    duplicatesDropped: duplicates,
    normalized: normalized.length,
    identityMatched: identity.matched,
    identityAmbiguous: identity.ambiguous,
    identityUnmatched: identity.unmatched,
    identityConflicted: identity.conflicted,
    conflictsDetected: conflicts,
    conflictsUnresolved: unresolved,
  };
}

/**
 * A draft journal entry. It is NOT appended by the cycle: the user's decision
 * is a separate record, and appending happens only when they confirm.
 */
export function draftJournalEntry(report: EngineReport, runId: string): DecisionJournalEntry {
  const base = {
    entryId: `journal:${report.metadata.generatedAt}:${runId}`,
    recommendationId: `posture:${report.metadata.generatedAt}`,
    timestamp: report.metadata.generatedAt,
    reportHash: report.journalEntry.reportHash,
    summary: report.journalEntry.summary,
    deploymentScore: report.posture.deploymentScore,
    recommendation: report.posture.recommendation,
    engineVersion: report.metadata.engineVersion,
    modelVersion: report.metadata.engineVersion,
    userDecision: null,
    executionDetails: null,
    outcome: null,
    reviewNotes: null,
    supersedes: null,
  };
  return { ...base, integrityHash: fnv1a64(stableStringify(base)) };
}
