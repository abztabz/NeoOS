import {
  CONFLICT_RATING_CAP,
  CRITICAL_FACTORS,
  ENGINE_VERSION,
  FACTOR_NAMES,
  FACTOR_WEIGHTS,
  GOVERNANCE_VETO_BELOW,
  INSUFFICIENT_EVIDENCE,
  PENALTIES,
  STRONG_BUY_GATE,
  type FactorName,
} from "@/engine/constants";
import { effectiveConfidence, evidenceIntegrity, freshnessOf } from "@/engine/evidence";
import { valuationGrade } from "@/engine/valuation";
import type {
  AssetRecommendation,
  CanonicalAsset,
  ConflictRecord,
  EvidenceRecord,
  FactorScore,
  GateCheck,
  ValuationResult,
} from "@/engine/models";
import { ratingFromScoreEnum } from "@/domain/scoring";
import type { AssetRating } from "@/schemas/neoos-report";

/**
 * Deterministic asset scoring. Raw factor inputs come from evidence records
 * (the engine never invents fundamentals); the engine's job is adjustment,
 * weighting, gating, and full trace. Intermediate values keep full precision
 * — rounding happens only at display time.
 */

export interface AssetScoringContext {
  asset: CanonicalAsset;
  evidence: EvidenceRecord[];
  conflicts: ConflictRecord[];
  valuation: ValuationResult | null;
  /** Narrative cases (from research evidence), shown in the trace. */
  cases?: { downside: string; base: string; upside: string; portfolioFit: string };
  invalidationConditions?: string[];
  now: Date;
}

const RATING_ORDER: AssetRating[] = [
  "Sell",
  "Avoid",
  "Reduce",
  "Hold",
  "Accumulate",
  "Buy",
  "Strong Buy",
];

function capRating(rating: AssetRating, cap: AssetRating): AssetRating {
  return RATING_ORDER.indexOf(rating) > RATING_ORDER.indexOf(cap) ? cap : rating;
}

/** Tier- and freshness-weighted mean of factor input evidence. */
function factorInputs(evidence: EvidenceRecord[], factor: FactorName, now: Date) {
  const inputs = evidence.filter(
    (r) => r.factor === factor && r.normalizedValue !== null && freshnessOf(r, now) !== "expired",
  );
  if (inputs.length === 0) return null;
  let weightSum = 0;
  let valueSum = 0;
  let confidenceSum = 0;
  for (const record of inputs) {
    const weight = (1 + (6 - record.sourceTier) * 0.4) * (effectiveConfidence(record, now) / 100);
    weightSum += weight;
    valueSum += weight * (record.normalizedValue as number);
    confidenceSum += effectiveConfidence(record, now);
  }
  return {
    records: inputs,
    rawScore: valueSum / weightSum,
    confidence: confidenceSum / inputs.length,
  };
}

export function computeFactorScores(ctx: AssetScoringContext): FactorScore[] {
  return FACTOR_NAMES.map((factorName) => {
    const weight = FACTOR_WEIGHTS[factorName];
    const conflictHits = ctx.conflicts.filter((c) =>
      c.evidenceIds.some((id) =>
        ctx.evidence.some((r) => r.evidenceId === id && r.factor === factorName),
      ),
    );

    // Valuation raw score is derived from the margin of safety of the
    // valuation model — never typed in directly.
    if (factorName === "valuation") {
      const raw = valuationGrade(ctx.valuation);
      const missing = ctx.valuation === null;
      const conflictPenalty = Math.min(PENALTIES.maxConflict, conflictHits.length * PENALTIES.perConflict);
      const adjusted = raw === null ? null : Math.max(0, raw - conflictPenalty);
      return {
        factorName,
        rawScore: raw,
        adjustedScore: adjusted,
        weight,
        weightedContribution: adjusted === null ? null : adjusted * weight,
        confidence: ctx.valuation?.confidence ?? 0,
        freshnessPenalty: 0,
        coveragePenalty: 0,
        conflictPenalty,
        evidenceCoverage: missing ? 0 : 1,
        evidenceIds: ctx.valuation?.evidenceIds ?? [],
        rationale:
          ctx.valuation === null
            ? "No valuation model could be computed for this asset."
            : ctx.valuation.method === "cashEquivalentYield"
              ? `cashEquivalentYield: real yield ${Number(ctx.valuation.inputs.realYieldPct ?? 0).toFixed(2)}% → raw ${raw?.toFixed(1)} (no margin-of-safety case for cash).`
              : ctx.valuation.marginOfSafety === null
                ? `${ctx.valuation.method}: no margin of safety measurable (no market price / no case values).`
                : `${ctx.valuation.method}: margin of safety ${(ctx.valuation.marginOfSafety * 100).toFixed(1)}% vs conservative value → raw ${raw?.toFixed(1)}.`,
        missingInputs: missing ? ["valuation model"] : [],
        limitations: ctx.valuation?.limitations ?? [],
      } satisfies FactorScore;
    }

    const inputs = factorInputs(ctx.evidence, factorName, ctx.now);
    if (inputs === null) {
      return {
        factorName,
        rawScore: null,
        adjustedScore: null,
        weight,
        weightedContribution: null,
        confidence: 0,
        freshnessPenalty: 0,
        coveragePenalty: 0,
        conflictPenalty: 0,
        evidenceCoverage: 0,
        evidenceIds: [],
        rationale: "No usable (non-expired) evidence informs this factor.",
        missingInputs: [`${factorName} evidence`],
        limitations: [],
      } satisfies FactorScore;
    }

    // Freshness penalty: share of inputs that are stale (not fresh/aging).
    const staleShare =
      inputs.records.filter((r) => freshnessOf(r, ctx.now) === "stale").length /
      inputs.records.length;
    const freshnessPenalty = staleShare * PENALTIES.maxFreshness;

    // Coverage: one strong record is thin; three or more is solid.
    const coverage = Math.min(1, inputs.records.length / 3);
    const coveragePenalty = (1 - coverage) * PENALTIES.maxCoverage;

    const conflictPenalty = Math.min(PENALTIES.maxConflict, conflictHits.length * PENALTIES.perConflict);

    const adjusted = Math.max(0, inputs.rawScore - freshnessPenalty - coveragePenalty - conflictPenalty);
    return {
      factorName,
      rawScore: inputs.rawScore,
      adjustedScore: adjusted,
      weight,
      weightedContribution: adjusted * weight,
      confidence: inputs.confidence,
      freshnessPenalty,
      coveragePenalty,
      conflictPenalty,
      evidenceCoverage: coverage,
      evidenceIds: inputs.records.map((r) => r.evidenceId),
      rationale: `${inputs.records.length} evidence record(s), tier-weighted raw ${inputs.rawScore.toFixed(1)}${
        freshnessPenalty > 0 ? `, −${freshnessPenalty.toFixed(1)} freshness` : ""
      }${coveragePenalty > 0 ? `, −${coveragePenalty.toFixed(1)} coverage` : ""}${
        conflictPenalty > 0 ? `, −${conflictPenalty.toFixed(1)} conflicts` : ""
      } → ${adjusted.toFixed(1)}.`,
      missingInputs: [],
      limitations: [],
    } satisfies FactorScore;
  });
}

/** Insufficient-evidence gate: refuse to rate rather than fake precision. */
export function evaluateInsufficientEvidence(
  factors: FactorScore[],
  confidence: number,
  integrity: number,
): string[] {
  const reasons: string[] = [];
  for (const critical of CRITICAL_FACTORS) {
    const factor = factors.find((f) => f.factorName === critical)!;
    if (factor.evidenceCoverage < INSUFFICIENT_EVIDENCE.minCriticalCoverage) {
      reasons.push(
        `Critical factor "${critical}" has insufficient evidence coverage (${(factor.evidenceCoverage * 100).toFixed(0)}% < ${INSUFFICIENT_EVIDENCE.minCriticalCoverage * 100}%).`,
      );
    }
  }
  if (confidence < INSUFFICIENT_EVIDENCE.minOverallConfidence) {
    reasons.push(
      `Overall confidence ${confidence.toFixed(0)} is below the ${INSUFFICIENT_EVIDENCE.minOverallConfidence} floor.`,
    );
  }
  if (integrity < INSUFFICIENT_EVIDENCE.minEvidenceIntegrity) {
    reasons.push(
      `Evidence integrity ${integrity.toFixed(0)} is below the ${INSUFFICIENT_EVIDENCE.minEvidenceIntegrity} floor.`,
    );
  }
  return reasons;
}

/** Strong Buy gate — every check must pass; the score alone never suffices. */
export function evaluateStrongBuyGate(args: {
  totalScore: number;
  confidence: number;
  integrity: number;
  factors: FactorScore[];
  valuation: ValuationResult | null;
  conflicts: ConflictRecord[];
  evidence: EvidenceRecord[];
  now: Date;
}): GateCheck[] {
  const factor = (name: FactorName) => args.factors.find((f) => f.factorName === name)!;
  const g = STRONG_BUY_GATE;
  const mos = args.valuation?.marginOfSafety ?? null;
  const valuationTiers = (args.valuation?.evidenceIds ?? [])
    .map((id) => args.evidence.find((r) => r.evidenceId === id)?.sourceTier)
    .filter((t): t is number => t !== undefined);
  const bestValuationTier = valuationTiers.length > 0 ? Math.min(...valuationTiers) : null;
  const highConflicts = args.conflicts.filter(
    (c) => c.severity === "high" && c.resolution === "unresolved",
  );
  const staleCritical = CRITICAL_FACTORS.some((name) => factor(name).freshnessPenalty > 0);
  const missingFactor = args.factors.some(
    (f) => CRITICAL_FACTORS.includes(f.factorName) && f.rawScore === null,
  );

  const checks: GateCheck[] = [
    check("score", "Total score", args.totalScore >= g.minScore, args.totalScore.toFixed(1), `≥ ${g.minScore}`),
    check("integrity", "Evidence integrity", args.integrity >= g.minEvidenceIntegrity, args.integrity.toFixed(0), `≥ ${g.minEvidenceIntegrity}`),
    check("confidence", "Confidence", args.confidence >= g.minConfidence, args.confidence.toFixed(0), `≥ ${g.minConfidence}`),
    check(
      "margin-of-safety",
      "Margin of safety (vs conservative value)",
      mos !== null && mos >= g.minMarginOfSafety,
      mos === null ? "not measurable" : `${(mos * 100).toFixed(1)}%`,
      `≥ ${g.minMarginOfSafety * 100}%`,
    ),
    check(
      "financial-strength",
      "Financial strength",
      (factor("financialStrength").adjustedScore ?? 0) >= g.minFinancialStrength,
      (factor("financialStrength").adjustedScore ?? 0).toFixed(1),
      `≥ ${g.minFinancialStrength}`,
    ),
    check(
      "governance",
      "Governance",
      (factor("governance").adjustedScore ?? 0) >= g.minGovernance,
      (factor("governance").adjustedScore ?? 0).toFixed(1),
      `≥ ${g.minGovernance}`,
    ),
    check(
      "portfolio-fit",
      "Portfolio fit",
      (factor("portfolioFit").adjustedScore ?? 0) >= g.minPortfolioFit,
      (factor("portfolioFit").adjustedScore ?? 0).toFixed(1),
      `≥ ${g.minPortfolioFit}`,
    ),
    check(
      "valuation-evidence",
      "Primary valuation evidence",
      bestValuationTier !== null && bestValuationTier <= g.maxValuationEvidenceTier,
      bestValuationTier === null ? "none" : `tier ${bestValuationTier}`,
      `tier ≤ ${g.maxValuationEvidenceTier}`,
    ),
    check(
      "conflicts",
      "No unresolved high-severity conflicts",
      highConflicts.length === 0,
      `${highConflicts.length} unresolved`,
      "0",
    ),
    check("freshness", "Critical evidence current", !staleCritical, staleCritical ? "stale inputs present" : "current", "no stale critical inputs"),
    check("completeness", "No critical factor missing", !missingFactor, missingFactor ? "missing" : "complete", "complete"),
  ];
  return checks;
}

function check(id: string, label: string, passed: boolean, actual: string, required: string): GateCheck {
  return { id, label, passed, actual, required };
}

export function scoreAsset(ctx: AssetScoringContext): AssetRecommendation {
  const factors = computeFactorScores(ctx);
  const assetEvidence = ctx.evidence;
  const integrity = evidenceIntegrity(assetEvidence, ctx.now);

  // Confidence propagation: evidence-weighted mean of factor confidences,
  // weighted by factor weight — a weak critical factor drags harder.
  const scored = factors.filter((f) => f.adjustedScore !== null);
  const weightSum = scored.reduce((sum, f) => sum + f.weight, 0);
  const confidence =
    weightSum === 0 ? 0 : scored.reduce((sum, f) => sum + f.confidence * f.weight, 0) / weightSum;

  const insufficientReasons = evaluateInsufficientEvidence(factors, confidence, integrity);
  if (insufficientReasons.length > 0) {
    return {
      assetId: ctx.asset.assetId,
      status: "insufficient_evidence",
      totalScore: null,
      provisionalRating: null,
      finalRating: null,
      confidence,
      evidenceIntegrity: integrity,
      valuationDate: ctx.valuation?.calculationDate ?? null,
      engineVersion: ENGINE_VERSION,
      modelVersion: ENGINE_VERSION,
      eligibilityChecks: [],
      vetoes: [],
      factorScores: factors,
      valuation: ctx.valuation,
      marginOfSafety: ctx.valuation?.marginOfSafety ?? null,
      downsideCase: ctx.cases?.downside ?? null,
      baseCase: ctx.cases?.base ?? null,
      upsideCase: ctx.cases?.upside ?? null,
      portfolioFit: ctx.cases?.portfolioFit ?? null,
      recommendationRationale:
        "Insufficient evidence — the engine refuses to emit a rating rather than fabricate one.",
      insufficientReasons,
      invalidationConditions: ctx.invalidationConditions ?? [],
      conflictIds: ctx.conflicts.map((c) => c.conflictId),
    };
  }

  // Weighted total, renormalized over factors that actually have evidence so
  // a missing non-critical factor doesn't silently drag the score to zero —
  // its absence shows up in coverage penalties and the trace instead.
  const total =
    scored.reduce((sum, f) => sum + (f.adjustedScore as number) * f.weight, 0) / weightSum;

  const provisional = ratingFromScoreEnum(total);
  const vetoes: string[] = [];
  let final = provisional;

  const governance = factors.find((f) => f.factorName === "governance")!;
  if (governance.rawScore !== null && governance.rawScore < GOVERNANCE_VETO_BELOW) {
    final = capRating(final, "Reduce");
    vetoes.push(
      `Governance veto: raw governance ${governance.rawScore.toFixed(0)} < ${GOVERNANCE_VETO_BELOW} caps the rating at Reduce.`,
    );
  }
  const unresolvedHigh = ctx.conflicts.filter(
    (c) => c.severity === "high" && c.resolution === "unresolved",
  );
  if (unresolvedHigh.length > 0) {
    final = capRating(final, CONFLICT_RATING_CAP);
    vetoes.push(
      `Evidence-conflict veto: ${unresolvedHigh.length} unresolved high-severity conflict(s) cap the rating at ${CONFLICT_RATING_CAP}.`,
    );
  }

  const gateChecks = evaluateStrongBuyGate({
    totalScore: total,
    confidence,
    integrity,
    factors,
    valuation: ctx.valuation,
    conflicts: ctx.conflicts,
    evidence: assetEvidence,
    now: ctx.now,
  });
  if (final === "Strong Buy") {
    const failed = gateChecks.filter((c) => !c.passed);
    if (failed.length > 0) {
      final = "Buy";
      vetoes.push(
        `Strong Buy gate failed (${failed.map((f) => f.label).join("; ")}) — downgraded to Buy.`,
      );
    }
  }

  return {
    assetId: ctx.asset.assetId,
    status: "rated",
    totalScore: total,
    provisionalRating: provisional,
    finalRating: final,
    confidence,
    evidenceIntegrity: integrity,
    valuationDate: ctx.valuation?.calculationDate ?? null,
    engineVersion: ENGINE_VERSION,
    modelVersion: ENGINE_VERSION,
    eligibilityChecks: gateChecks,
    vetoes,
    factorScores: factors,
    valuation: ctx.valuation,
    marginOfSafety: ctx.valuation?.marginOfSafety ?? null,
    downsideCase: ctx.cases?.downside ?? null,
    baseCase: ctx.cases?.base ?? null,
    upsideCase: ctx.cases?.upside ?? null,
    portfolioFit: ctx.cases?.portfolioFit ?? null,
    recommendationRationale: `Weighted total ${total.toFixed(2)} → ${provisional}${
      final !== provisional ? `, adjusted to ${final} by gates/vetoes` : ""
    }. ${factors
      .filter((f) => f.weightedContribution !== null)
      .map((f) => `${f.factorName} ${(f.weightedContribution as number).toFixed(1)}`)
      .join(" + ")}.`,
    insufficientReasons: [],
    invalidationConditions: ctx.invalidationConditions ?? [],
    conflictIds: ctx.conflicts.map((c) => c.conflictId),
  };
}
