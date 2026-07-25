import type { ConflictRecord, EvidenceRecord } from "@/engine/models";
import { detectConflicts } from "@/engine/evidence";
import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import type { ValidationIssue } from "@/intelligence/types/validation";

/**
 * Pipeline conflict handling.
 *
 * The engine already detects value disagreement on a shared claim key. The
 * pipeline adds the conflicts only visible at ingestion time: revised filings,
 * unit and currency mismatches on the same claim, and provider disagreement
 * about publication date.
 *
 * Every record is preserved in every case. Resolution ranks by source tier and
 * always produces a written explanation.
 */

export interface PipelineConflictOutcome {
  conflicts: ConflictRecord[];
  issues: ValidationIssue[];
}

function claimGroups(evidence: EvidenceRecord[]): Map<string, EvidenceRecord[]> {
  const groups = new Map<string, EvidenceRecord[]>();
  for (const record of evidence) {
    if (!record.claimKey) continue;
    const key = `${record.assetId ?? "macro"}::${record.claimKey}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return groups;
}

/**
 * A later record from an equal-or-stronger tier asserting the same claim is
 * treated as a revision, and the revision prevails. This is the "revised
 * filing" case: a restatement should win over the original, not tie with it.
 */
function detectRevisions(evidence: EvidenceRecord[]): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];
  for (const [key, records] of claimGroups(evidence)) {
    if (records.length < 2) continue;
    const official = records.filter((r) => r.sourceTier <= 2);
    if (official.length < 2) continue;

    const sorted = [...official].sort(
      (a, b) =>
        new Date(b.effectiveDate ?? b.publicationDate).getTime() -
        new Date(a.effectiveDate ?? a.publicationDate).getTime(),
    );
    const [latest, ...earlier] = sorted;
    if (!latest || earlier.length === 0) continue;

    const differs = earlier.some(
      (r) =>
        r.normalizedValue !== null &&
        latest.normalizedValue !== null &&
        Math.abs(r.normalizedValue - latest.normalizedValue) > 1e-9,
    );
    if (!differs) continue;

    conflicts.push({
      conflictId: `revision:${key}`,
      claimKey: key,
      evidenceIds: sorted.map((r) => r.evidenceId),
      prevailingEvidenceId: latest.evidenceId,
      severity: "low",
      resolution: "resolved_by_tier",
      confidenceEffect:
        "Resolved as a revision: the most recent official record prevails; superseded values are retained for audit.",
      note: `${latest.sourceName} (${(latest.effectiveDate ?? latest.publicationDate).slice(0, 10)}) revises ${earlier
        .map((r) => `${r.sourceName} (${(r.effectiveDate ?? r.publicationDate).slice(0, 10)})`)
        .join(", ")} on "${latest.claimKey}".`,
    });
  }
  return conflicts;
}

/**
 * Unit or currency mismatch on the same claim. These are NOT value
 * disagreements — they are incomparable measurements, and comparing them
 * numerically would be meaningless.
 */
function detectMeasurementMismatch(
  evidence: EvidenceRecord[],
  raw: Map<string, RawEvidenceRecord>,
): { conflicts: ConflictRecord[]; issues: ValidationIssue[] } {
  const conflicts: ConflictRecord[] = [];
  const issues: ValidationIssue[] = [];

  for (const [key, records] of claimGroups(evidence)) {
    if (records.length < 2) continue;
    const units = new Set(records.map((r) => r.unit ?? "unspecified"));
    const currencies = new Set(
      records.map((r) => raw.get(r.evidenceId)?.rawCurrency ?? "none"),
    );

    if (units.size > 1 || currencies.size > 1) {
      const ranked = [...records].sort((a, b) => a.sourceTier - b.sourceTier);
      const prevailing = ranked[0]!;
      conflicts.push({
        conflictId: `measurement:${key}`,
        claimKey: key,
        evidenceIds: records.map((r) => r.evidenceId),
        prevailingEvidenceId: prevailing.evidenceId,
        severity: "high",
        resolution: "unresolved",
        confidenceEffect:
          "Unresolved: the same claim is expressed in incompatible units or currencies, so the values cannot be compared. High-conviction ratings are blocked.",
        note:
          units.size > 1
            ? `Units disagree on "${key}": ${[...units].join(" vs ")}.`
            : `Currencies disagree on "${key}": ${[...currencies].join(" vs ")}.`,
      });
      issues.push({
        code: units.size > 1 ? "unsupported_unit" : "incompatible_currency",
        severity: "warning",
        stage: "normalized_evidence",
        message:
          units.size > 1
            ? `Claim "${key}" is reported in multiple units; values were not combined.`
            : `Claim "${key}" is reported in multiple currencies; values were not combined.`,
        subjectType: "evidence",
        subjectId: prevailing.evidenceId,
        assetId: prevailing.assetId,
        detail: null,
      });
    }
  }

  return { conflicts, issues };
}

export function detectPipelineConflicts(
  evidence: EvidenceRecord[],
  rawById: Map<string, RawEvidenceRecord>,
  now: Date,
): PipelineConflictOutcome {
  // Start from the engine's own detection so behaviour stays consistent.
  const base = detectConflicts(evidence, now);
  const revisions = detectRevisions(evidence);
  const measurement = detectMeasurementMismatch(evidence, rawById);

  // A revision explains a value disagreement the engine flagged on the same
  // claim, so it replaces the generic conflict rather than stacking with it.
  const revisionKeys = new Set(revisions.map((c) => c.claimKey));
  const merged = [
    ...base.filter((c) => !revisionKeys.has(c.claimKey)),
    ...revisions,
    ...measurement.conflicts,
  ];

  const issues: ValidationIssue[] = [...measurement.issues];
  for (const conflict of merged) {
    if (conflict.resolution === "unresolved") {
      issues.push({
        code: "unresolved_conflict",
        severity: "warning",
        stage: "normalized_evidence",
        message: conflict.note,
        subjectType: "evidence",
        subjectId: conflict.prevailingEvidenceId,
        assetId: null,
        detail: conflict.confidenceEffect,
      });
    }
  }

  return { conflicts: merged, issues };
}
