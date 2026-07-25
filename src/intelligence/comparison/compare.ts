import type { AssetRecommendation, EngineReport } from "@/engine/models";
import {
  CHANGE_THRESHOLDS,
  type ChangeCauseKind,
  type ChangeSeverity,
  type ReportChange,
  type ReportDiff,
} from "@/intelligence/types/diff";

/**
 * Deterministic report comparison.
 *
 * A cause is only asserted when the evidence or trace proves it. Where the
 * cause cannot be established the change is labelled `unknown` — a plausible
 * guess reads as authoritative and is worse than an admission.
 */

function pct(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function severityForScore(delta: number): ChangeSeverity {
  const magnitude = Math.abs(delta);
  if (magnitude >= CHANGE_THRESHOLDS.criticalScorePoints) return "critical";
  if (magnitude >= CHANGE_THRESHOLDS.materialScorePoints) return "material";
  return "minor";
}

/**
 * Establish why an asset's score moved, using only provable signals: evidence
 * that appeared or expired, and valuation inputs that changed.
 */
function attributeAssetChange(
  previous: AssetRecommendation,
  current: AssetRecommendation,
  addedEvidence: string[],
  removedEvidence: string[],
): { cause: ChangeCauseKind; detail: string; evidenceIds: string[] } {
  const prevMos = previous.marginOfSafety;
  const currMos = current.marginOfSafety;
  const mosMoved =
    prevMos !== null && currMos !== null && Math.abs(currMos - prevMos) > 1e-9;

  const assetAdded = addedEvidence.filter((id) =>
    current.factorScores.some((f) => f.evidenceIds.includes(id)),
  );
  const assetRemoved = removedEvidence.filter((id) =>
    previous.factorScores.some((f) => f.evidenceIds.includes(id)),
  );

  if (mosMoved) {
    return {
      cause: "valuation_input_changed",
      detail: `Margin of safety moved from ${(prevMos * 100).toFixed(1)}% to ${(currMos * 100).toFixed(1)}%, changing the valuation factor.`,
      evidenceIds: current.valuation?.evidenceIds ?? [],
    };
  }
  if (assetAdded.length > 0) {
    return {
      cause: "evidence_added",
      detail: `${assetAdded.length} new evidence record(s) entered this asset's factor scores.`,
      evidenceIds: assetAdded,
    };
  }
  if (assetRemoved.length > 0) {
    return {
      cause: "evidence_expired",
      detail: `${assetRemoved.length} evidence record(s) no longer contribute.`,
      evidenceIds: assetRemoved,
    };
  }
  if (previous.conflictIds.join("|") !== current.conflictIds.join("|")) {
    return {
      cause: "conflict_state_changed",
      detail: "The set of conflicts touching this asset changed.",
      evidenceIds: [],
    };
  }
  return {
    cause: "unknown",
    detail: "No evidence or valuation change in the trace accounts for this movement.",
    evidenceIds: [],
  };
}

export function compareReports(
  previous: EngineReport | null,
  current: EngineReport,
): ReportDiff {
  const changes: ReportChange[] = [];

  if (previous === null) {
    return {
      schemaVersion: "3.0",
      previousReportHash: null,
      currentReportHash: current.journalEntry.reportHash,
      previousGeneratedAt: null,
      currentGeneratedAt: current.metadata.generatedAt,
      isFirstReport: true,
      changes: [],
      summary: { total: 0, critical: 0, material: 0, minor: 0, informational: 0 },
    };
  }

  const prevEvidenceIds = new Set(previous.evidence.map((e) => e.evidenceId));
  const currEvidenceIds = new Set(current.evidence.map((e) => e.evidenceId));
  const addedEvidence = [...currEvidenceIds].filter((id) => !prevEvidenceIds.has(id));
  const removedEvidence = [...prevEvidenceIds].filter((id) => !currEvidenceIds.has(id));

  /* ---------- versions ---------- */
  if (previous.metadata.engineVersion !== current.metadata.engineVersion) {
    changes.push({
      type: "engine_version",
      severity: "critical",
      assetId: null,
      scope: "global",
      label: "Scoring engine version",
      previousValue: previous.metadata.engineVersion,
      currentValue: current.metadata.engineVersion,
      absoluteChange: null,
      percentageChange: null,
      cause: "engine_version_changed",
      causeDetail: "The scoring engine itself changed between reports.",
      supportingEvidenceIds: [],
      explanation:
        "Scores from these two reports are not directly comparable: the engine that produced them changed.",
    });
  }
  if (previous.schemaVersion !== current.schemaVersion) {
    changes.push({
      type: "schema_version",
      severity: "material",
      assetId: null,
      scope: "global",
      label: "Report schema version",
      previousValue: previous.schemaVersion,
      currentValue: current.schemaVersion,
      absoluteChange: null,
      percentageChange: null,
      cause: "unknown",
      causeDetail: "Schema version differs.",
      supportingEvidenceIds: [],
      explanation: "The report format changed between these two reports.",
    });
  }

  /* ---------- deployment posture ---------- */
  const prevPosture = previous.posture;
  const currPosture = current.posture;
  const deploymentDelta = currPosture.deploymentScore - prevPosture.deploymentScore;
  if (Math.abs(deploymentDelta) > 1e-9) {
    const bandChanged = prevPosture.deploymentBand !== currPosture.deploymentBand;
    const severity: ChangeSeverity = bandChanged
      ? "critical"
      : Math.abs(deploymentDelta) >= CHANGE_THRESHOLDS.criticalDeploymentPoints
        ? "critical"
        : Math.abs(deploymentDelta) >= CHANGE_THRESHOLDS.materialDeploymentPoints
          ? "material"
          : "minor";

    const prevConstraints = new Set(prevPosture.constraints.map((c) => c.id));
    const currConstraints = new Set(currPosture.constraints.map((c) => c.id));
    const newConstraints = [...currConstraints].filter((c) => !prevConstraints.has(c));
    const releasedConstraints = [...prevConstraints].filter((c) => !currConstraints.has(c));

    const cause: ChangeCauseKind =
      newConstraints.length > 0
        ? "constraint_applied"
        : releasedConstraints.length > 0
          ? "constraint_released"
          : addedEvidence.length > 0 || removedEvidence.length > 0
            ? "evidence_added"
            : "unknown";

    changes.push({
      type: "deployment_posture",
      severity,
      assetId: null,
      scope: "global",
      label: "Capital deployment",
      previousValue: prevPosture.deploymentScore,
      currentValue: currPosture.deploymentScore,
      absoluteChange: deploymentDelta,
      percentageChange: pct(prevPosture.deploymentScore, currPosture.deploymentScore),
      cause,
      causeDetail:
        newConstraints.length > 0
          ? `Constraint(s) applied: ${newConstraints.join(", ")}.`
          : releasedConstraints.length > 0
            ? `Constraint(s) released: ${releasedConstraints.join(", ")}.`
            : cause === "evidence_added"
              ? "The evidence set changed, moving the underlying scores."
              : "No constraint or evidence change in the trace accounts for this movement.",
      supportingEvidenceIds: [],
      explanation: bandChanged
        ? `Deployment moved from ${prevPosture.deploymentBand} to ${currPosture.deploymentBand}.`
        : `Deployment moved ${deploymentDelta > 0 ? "up" : "down"} ${Math.abs(deploymentDelta).toFixed(1)} points within ${currPosture.deploymentBand}.`,
    });
  }

  for (const constraint of currPosture.constraints) {
    if (!prevPosture.constraints.some((c) => c.id === constraint.id)) {
      changes.push({
        type: "reserve_constraint",
        severity: "critical",
        assetId: null,
        scope: "global",
        label: `Constraint applied: ${constraint.id}`,
        previousValue: "not applied",
        currentValue: `capped at ${constraint.capApplied}`,
        absoluteChange: null,
        percentageChange: null,
        cause: "constraint_applied",
        causeDetail: constraint.description,
        supportingEvidenceIds: [],
        explanation: constraint.description,
      });
    }
  }

  const concentrationDelta = currPosture.concentrationRisk - prevPosture.concentrationRisk;
  if (Math.abs(concentrationDelta) >= CHANGE_THRESHOLDS.materialScorePoints) {
    changes.push({
      type: "concentration",
      severity: "material",
      assetId: null,
      scope: "global",
      label: "Concentration risk",
      previousValue: prevPosture.concentrationRisk,
      currentValue: currPosture.concentrationRisk,
      absoluteChange: concentrationDelta,
      percentageChange: pct(prevPosture.concentrationRisk, currPosture.concentrationRisk),
      cause: "unknown",
      causeDetail: "Portfolio allocations changed between reports.",
      supportingEvidenceIds: [],
      explanation: `Concentration risk moved from ${prevPosture.concentrationRisk.toFixed(0)} to ${currPosture.concentrationRisk.toFixed(0)}.`,
    });
  }

  /* ---------- per-asset ---------- */
  const prevById = new Map(previous.recommendations.map((r) => [r.assetId, r]));
  for (const curr of current.recommendations) {
    const prev = prevById.get(curr.assetId);
    if (!prev) continue;

    // Insufficient-evidence transitions in both directions.
    if (prev.status === "rated" && curr.status === "insufficient_evidence") {
      changes.push({
        type: "newly_insufficient",
        severity: "critical",
        assetId: curr.assetId,
        scope: "asset",
        label: `${curr.assetId} can no longer be rated`,
        previousValue: prev.finalRating,
        currentValue: "Insufficient Evidence",
        absoluteChange: null,
        percentageChange: null,
        cause: removedEvidence.length > 0 ? "evidence_expired" : "unknown",
        causeDetail: curr.insufficientReasons.join(" "),
        supportingEvidenceIds: removedEvidence,
        explanation: `${curr.assetId} lost its rating: ${curr.insufficientReasons.join(" ")}`,
      });
      continue;
    }
    if (prev.status === "insufficient_evidence" && curr.status === "rated") {
      changes.push({
        type: "restored_from_insufficient",
        severity: "material",
        assetId: curr.assetId,
        scope: "asset",
        label: `${curr.assetId} can be rated again`,
        previousValue: "Insufficient Evidence",
        currentValue: curr.finalRating,
        absoluteChange: null,
        percentageChange: null,
        cause: addedEvidence.length > 0 ? "evidence_added" : "unknown",
        causeDetail: "Enough evidence arrived to clear the insufficient-evidence gate.",
        supportingEvidenceIds: addedEvidence,
        explanation: `${curr.assetId} is rated ${curr.finalRating} after new evidence cleared the gate.`,
      });
      continue;
    }
    if (prev.status !== "rated" || curr.status !== "rated") continue;

    const attribution = attributeAssetChange(prev, curr, addedEvidence, removedEvidence);

    if (prev.finalRating !== curr.finalRating) {
      changes.push({
        type: "rating",
        severity: "critical",
        assetId: curr.assetId,
        scope: "asset",
        label: `${curr.assetId} rating`,
        previousValue: prev.finalRating,
        currentValue: curr.finalRating,
        absoluteChange: null,
        percentageChange: null,
        cause: attribution.cause,
        causeDetail: attribution.detail,
        supportingEvidenceIds: attribution.evidenceIds,
        explanation: `${curr.assetId} moved from ${prev.finalRating} to ${curr.finalRating}. ${attribution.detail}`,
      });
    }

    const scoreDelta = (curr.totalScore ?? 0) - (prev.totalScore ?? 0);
    if (Math.abs(scoreDelta) > 1e-9) {
      changes.push({
        type: "score",
        severity: severityForScore(scoreDelta),
        assetId: curr.assetId,
        scope: "asset",
        label: `${curr.assetId} score`,
        previousValue: prev.totalScore,
        currentValue: curr.totalScore,
        absoluteChange: scoreDelta,
        percentageChange: pct(prev.totalScore ?? 0, curr.totalScore ?? 0),
        cause: attribution.cause,
        causeDetail: attribution.detail,
        supportingEvidenceIds: attribution.evidenceIds,
        explanation: `${curr.assetId} scored ${(curr.totalScore ?? 0).toFixed(1)}, ${scoreDelta > 0 ? "up" : "down"} ${Math.abs(scoreDelta).toFixed(1)}. ${attribution.detail}`,
      });
    }

    const confidenceDelta = curr.confidence - prev.confidence;
    if (Math.abs(confidenceDelta) >= CHANGE_THRESHOLDS.materialConfidencePoints) {
      changes.push({
        type: "confidence",
        severity: "material",
        assetId: curr.assetId,
        scope: "asset",
        label: `${curr.assetId} confidence`,
        previousValue: prev.confidence,
        currentValue: curr.confidence,
        absoluteChange: confidenceDelta,
        percentageChange: pct(prev.confidence, curr.confidence),
        cause: attribution.cause,
        causeDetail: attribution.detail,
        supportingEvidenceIds: attribution.evidenceIds,
        explanation: `Confidence in ${curr.assetId} moved ${confidenceDelta > 0 ? "up" : "down"} ${Math.abs(confidenceDelta).toFixed(0)} points.`,
      });
    }

    const integrityDelta = curr.evidenceIntegrity - prev.evidenceIntegrity;
    if (Math.abs(integrityDelta) >= CHANGE_THRESHOLDS.materialIntegrityPoints) {
      changes.push({
        type: "evidence_integrity",
        severity: "material",
        assetId: curr.assetId,
        scope: "asset",
        label: `${curr.assetId} evidence integrity`,
        previousValue: prev.evidenceIntegrity,
        currentValue: curr.evidenceIntegrity,
        absoluteChange: integrityDelta,
        percentageChange: pct(prev.evidenceIntegrity, curr.evidenceIntegrity),
        cause: attribution.cause,
        causeDetail: attribution.detail,
        supportingEvidenceIds: attribution.evidenceIds,
        explanation: `Evidence integrity for ${curr.assetId} moved ${integrityDelta > 0 ? "up" : "down"} ${Math.abs(integrityDelta).toFixed(0)} points.`,
      });
    }

    const prevMos = prev.marginOfSafety;
    const currMos = curr.marginOfSafety;
    if (prevMos !== null && currMos !== null) {
      const mosDelta = currMos - prevMos;
      if (Math.abs(mosDelta) >= CHANGE_THRESHOLDS.materialMosPct) {
        changes.push({
          type: "margin_of_safety",
          severity: "material",
          assetId: curr.assetId,
          scope: "asset",
          label: `${curr.assetId} margin of safety`,
          previousValue: prevMos,
          currentValue: currMos,
          absoluteChange: mosDelta,
          percentageChange: pct(prevMos, currMos),
          cause: "valuation_input_changed",
          causeDetail: attribution.detail,
          supportingEvidenceIds: curr.valuation?.evidenceIds ?? [],
          explanation: `Margin of safety on ${curr.assetId} moved from ${(prevMos * 100).toFixed(1)}% to ${(currMos * 100).toFixed(1)}%.`,
        });
      }
    }

    const prevConservative = prev.valuation?.conservativeValue ?? null;
    const currConservative = curr.valuation?.conservativeValue ?? null;
    if (
      prevConservative !== null &&
      currConservative !== null &&
      Math.abs(currConservative - prevConservative) > 1e-9
    ) {
      changes.push({
        type: "valuation",
        severity: "material",
        assetId: curr.assetId,
        scope: "asset",
        label: `${curr.assetId} conservative value`,
        previousValue: prevConservative,
        currentValue: currConservative,
        absoluteChange: currConservative - prevConservative,
        percentageChange: pct(prevConservative, currConservative),
        cause: "valuation_input_changed",
        causeDetail: `Valuation method ${curr.valuation?.method} re-ran with changed inputs.`,
        supportingEvidenceIds: curr.valuation?.evidenceIds ?? [],
        explanation: `The conservative value for ${curr.assetId} changed, which moves both price thresholds.`,
      });
    }
  }

  /* ---------- evidence and conflicts ---------- */
  if (addedEvidence.length > 0) {
    changes.push({
      type: "new_evidence",
      severity: "informational",
      assetId: null,
      scope: "global",
      label: "New evidence",
      previousValue: previous.evidence.length,
      currentValue: current.evidence.length,
      absoluteChange: addedEvidence.length,
      percentageChange: null,
      cause: "evidence_added",
      causeDetail: `${addedEvidence.length} record(s) entered the evidence set.`,
      supportingEvidenceIds: addedEvidence,
      explanation: `${addedEvidence.length} new evidence record(s) were ingested.`,
    });
  }
  if (removedEvidence.length > 0) {
    changes.push({
      type: "expired_evidence",
      severity: "informational",
      assetId: null,
      scope: "global",
      label: "Evidence no longer contributing",
      previousValue: previous.evidence.length,
      currentValue: current.evidence.length,
      absoluteChange: -removedEvidence.length,
      percentageChange: null,
      cause: "evidence_expired",
      causeDetail: `${removedEvidence.length} record(s) left the evidence set.`,
      supportingEvidenceIds: removedEvidence,
      explanation: `${removedEvidence.length} evidence record(s) expired or were excluded.`,
    });
  }

  const prevConflicts = new Map(previous.conflicts.map((c) => [c.conflictId, c]));
  const currConflicts = new Map(current.conflicts.map((c) => [c.conflictId, c]));
  for (const [id, conflict] of currConflicts) {
    if (!prevConflicts.has(id)) {
      changes.push({
        type: "conflict_new",
        severity: conflict.severity === "high" ? "critical" : "material",
        assetId: null,
        scope: "global",
        label: "New evidence conflict",
        previousValue: null,
        currentValue: conflict.conflictId,
        absoluteChange: null,
        percentageChange: null,
        cause: "conflict_state_changed",
        causeDetail: conflict.note,
        supportingEvidenceIds: conflict.evidenceIds,
        explanation: conflict.note,
      });
    }
  }
  for (const [id, conflict] of prevConflicts) {
    if (!currConflicts.has(id)) {
      changes.push({
        type: "conflict_resolved",
        severity: "material",
        assetId: null,
        scope: "global",
        label: "Conflict resolved",
        previousValue: conflict.conflictId,
        currentValue: null,
        absoluteChange: null,
        percentageChange: null,
        cause: "conflict_state_changed",
        causeDetail: `The conflict on "${conflict.claimKey}" is no longer present.`,
        supportingEvidenceIds: conflict.evidenceIds,
        explanation: `A previously recorded evidence conflict on "${conflict.claimKey}" no longer applies.`,
      });
    }
  }

  const summary = {
    total: changes.length,
    critical: changes.filter((c) => c.severity === "critical").length,
    material: changes.filter((c) => c.severity === "material").length,
    minor: changes.filter((c) => c.severity === "minor").length,
    informational: changes.filter((c) => c.severity === "informational").length,
  };

  return {
    schemaVersion: "3.0",
    previousReportHash: previous.journalEntry.reportHash,
    currentReportHash: current.journalEntry.reportHash,
    previousGeneratedAt: previous.metadata.generatedAt,
    currentGeneratedAt: current.metadata.generatedAt,
    isFirstReport: false,
    changes,
    summary,
  };
}
