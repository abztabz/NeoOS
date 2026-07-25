import type { EvidenceRecord } from "@/engine/models";
import { CRITICAL_FACTORS } from "@/engine/constants";
import { freshnessOf } from "@/engine/evidence";
import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import type { ValidationIssue } from "@/intelligence/types/validation";
import type { ProviderDescriptor } from "@/intelligence/types/provider";
import type { UniverseInputs } from "@/engine/generate";
import type { EngineReportFile } from "@/engine/generate";

/**
 * Staged validation. Each stage returns issues rather than throwing, so a run
 * always produces a complete picture of what went wrong instead of stopping at
 * the first problem.
 */

function issue(
  code: ValidationIssue["code"],
  severity: ValidationIssue["severity"],
  stage: ValidationIssue["stage"],
  message: string,
  subject: { type: ValidationIssue["subjectType"]; id: string | null; assetId?: string | null },
  detail: string | null = null,
): ValidationIssue {
  return {
    code,
    severity,
    stage,
    message,
    subjectType: subject.type,
    subjectId: subject.id,
    assetId: subject.assetId ?? null,
    detail,
  };
}

/** Stage 1 — raw input, before anything is interpreted. */
export function validateRawRecord(
  record: RawEvidenceRecord,
  provider: ProviderDescriptor | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!record.sourceRef.trim()) {
    issues.push(
      issue("missing_provenance", "blocking", "raw_input", "Record has no source reference.", {
        type: "raw_evidence",
        id: record.rawEvidenceId,
      }),
    );
  }

  if (provider === undefined) {
    issues.push(
      issue(
        "missing_provenance",
        "blocking",
        "raw_input",
        `Record claims provider "${record.providerId}", which is not registered for this run.`,
        { type: "raw_evidence", id: record.rawEvidenceId },
      ),
    );
    return issues;
  }

  // The honesty check: a record may not claim a mode its provider is not in.
  if (record.providerMode !== provider.mode) {
    issues.push(
      issue(
        "provider_mode_misrepresented",
        "blocking",
        "raw_input",
        `Record declares mode "${record.providerMode}" but provider ${provider.providerId} is in mode "${provider.mode}".`,
        { type: "raw_evidence", id: record.rawEvidenceId },
        "Fixture or manual data must never be presented as live.",
      ),
    );
  }

  if (record.assetIdentifiers.length === 0 && record.evidenceCategory !== "macro_indicator") {
    issues.push(
      issue(
        "unknown_asset_identity",
        "blocking",
        "raw_input",
        "Non-macro record supplies no asset identifiers.",
        { type: "raw_evidence", id: record.rawEvidenceId },
      ),
    );
  }

  return issues;
}

/** Stage 3 — normalized evidence, in engine terms. */
export function validateNormalizedEvidence(
  evidence: EvidenceRecord[],
  now: Date,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Critical factors resting only on expired evidence cannot support a rating.
  const byAsset = new Map<string, EvidenceRecord[]>();
  for (const record of evidence) {
    if (record.assetId === null) continue;
    byAsset.set(record.assetId, [...(byAsset.get(record.assetId) ?? []), record]);
  }

  for (const [assetId, records] of byAsset) {
    for (const factor of CRITICAL_FACTORS) {
      const forFactor = records.filter((r) => r.factor === factor);
      if (forFactor.length === 0) continue;
      const usable = forFactor.filter((r) => freshnessOf(r, now) !== "expired");
      if (usable.length === 0) {
        issues.push(
          issue(
            "stale_critical_evidence",
            "blocking",
            "normalized_evidence",
            `Every ${factor} record for ${assetId} has expired.`,
            { type: "asset", id: assetId, assetId },
            `${forFactor.length} record(s), all past their freshness horizon.`,
          ),
        );
      }
    }
  }

  // Two records asserting the same claim for the same asset with different
  // fiscal periods is a real contradiction, not a conflict to average.
  const periods = new Map<string, Set<string>>();
  for (const record of evidence) {
    const period = (record.notes ?? "").match(/fiscal:(\S+)/)?.[1];
    if (!period || !record.claimKey || record.assetId === null) continue;
    const key = `${record.assetId}::${record.claimKey}`;
    periods.set(key, (periods.get(key) ?? new Set()).add(period));
  }
  for (const [key, set] of periods) {
    if (set.size > 1) {
      const assetId = key.split("::")[0]!;
      issues.push(
        issue(
          "conflicting_fiscal_period",
          "warning",
          "normalized_evidence",
          `Records for ${key} span multiple fiscal periods: ${[...set].join(", ")}.`,
          { type: "asset", id: assetId, assetId },
        ),
      );
    }
  }

  return issues;
}

/** Stage 4 — the assembled UniverseInputs, before the engine sees them. */
export function validateUniverseInputs(inputs: UniverseInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (inputs.entries.length === 0) {
    issues.push(
      issue("no_usable_evidence", "blocking", "universe_inputs", "No assets survived the pipeline.", {
        type: "run",
        id: null,
      }),
    );
  }

  for (const entry of inputs.entries) {
    const valuation = entry.valuationInput;
    if (valuation === null) continue;
    // A valuation must be reproducible: it needs cited evidence and assumptions.
    if (valuation.evidenceIds.length === 0 || valuation.assumptions.length === 0) {
      issues.push(
        issue(
          "non_reproducible_valuation_input",
          "blocking",
          "universe_inputs",
          `Valuation for ${entry.asset.assetId} cannot be reproduced: it cites no evidence or states no assumptions.`,
          { type: "asset", id: entry.asset.assetId, assetId: entry.asset.assetId },
        ),
      );
    }
  }

  const allocationTotal = Object.values(inputs.portfolio.allocations).reduce((a, b) => a + b, 0);
  if (allocationTotal > 1.0001) {
    issues.push(
      issue(
        "malformed_numeric_value",
        "warning",
        "universe_inputs",
        `Portfolio allocations sum to ${(allocationTotal * 100).toFixed(1)}%, above 100%.`,
        { type: "run", id: null },
      ),
    );
  }

  return issues;
}

/** Stage 5 — the generated report. */
export function validateGeneratedReport(file: EngineReportFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { engine, view } = file;

  for (const rec of engine.recommendations) {
    if (rec.status !== "rated") continue;
    if (rec.totalScore === null || rec.finalRating === null) {
      issues.push(
        issue(
          "schema_violation",
          "blocking",
          "generated_report",
          `${rec.assetId} is marked rated but carries no score or rating.`,
          { type: "asset", id: rec.assetId, assetId: rec.assetId },
        ),
      );
    }
    // Every displayed score must be reproducible from its own trace.
    const contributing = rec.factorScores.filter((f) => f.weightedContribution !== null);
    if (contributing.length === 0) {
      issues.push(
        issue(
          "non_reproducible_valuation_input",
          "blocking",
          "generated_report",
          `${rec.assetId} has a score with no contributing factors.`,
          { type: "asset", id: rec.assetId, assetId: rec.assetId },
        ),
      );
    }
  }

  const viewIds = new Set(view.assets.map((a) => a.id));
  for (const rec of engine.recommendations) {
    if (!viewIds.has(rec.assetId)) {
      issues.push(
        issue(
          "schema_violation",
          "warning",
          "generated_report",
          `${rec.assetId} is scored but missing from the presentation view.`,
          { type: "asset", id: rec.assetId, assetId: rec.assetId },
        ),
      );
    }
  }

  return issues;
}
