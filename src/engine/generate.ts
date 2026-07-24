import { ENGINE_VERSION } from "@/engine/constants";
import { detectConflicts, summarizeEvidence } from "@/engine/evidence";
import { computeCapitalPosture } from "@/engine/deployment";
import { scoreAsset } from "@/engine/scoring";
import { computeValuation, type ValuationInput } from "@/engine/valuation";
import { fnv1a64, stableStringify } from "@/engine/hash";
import type {
  AssetRecommendation,
  CanonicalAsset,
  DecisionJournalEntry,
  EngineReport,
  EvidenceRecord,
} from "@/engine/models";
import type {
  CashSection,
  GoldSection,
  HoldingDetail,
  MarketsSection,
  NeoosAsset,
  NeoosReport,
  RadarItem,
  TierStatus,
  TimelineEvent,
} from "@/schemas/neoos-report";

/**
 * Deterministic daily report pipeline: same inputs → byte-identical output
 * (verified by unit test). All scores flow from the scoring engine; the
 * v1.1 view the UI renders is DERIVED here, never hand-authored.
 */

export interface AssetUniverseEntry {
  asset: CanonicalAsset;
  valuationInput: ValuationInput | null;
  cases?: { downside: string; base: string; upside: string; portfolioFit: string };
  invalidationConditions?: string[];
}

export interface UniverseInputs {
  now: string;
  mode: "demo" | "live";
  entries: AssetUniverseEntry[];
  evidence: EvidenceRecord[];
  cashPosition: {
    available: number;
    emergencyReserve: number;
    deployable: number;
    monthlySurplus: number;
    targetReserve: number;
    cashYieldPct: number;
    inflationPct: number;
  };
  macro: {
    regime: string;
    riskScore: number; // 0 calm … 100 severe
    macroContext: string;
    regions: { id: string; name: string; score: number; stance: string; note: string }[];
  };
  portfolio: {
    holdings: HoldingDetail[];
    /** Allocation fractions per assetId, for concentration math. */
    allocations: Record<string, number>;
    liquidityRisk: number;
    tierTargets: { id: string; name: string; memberAssetIds: string[]; status: string }[];
  };
  editorial: {
    commentary: string;
    goldRole: string;
    cashOpportunityCost: string;
    cashRecommendation: string;
    reserveRequirement: string;
  };
  /** Prior journal entries — immutable history carried forward. */
  journalHistory: DecisionJournalEntry[];
  previous?: EngineReport | null;
}

/** Versioned on-disk format for engine reports: engine truth + derived view. */
export interface EngineReportFile {
  schemaVersion: "2.0";
  engine: EngineReport;
  view: NeoosReport;
}

/**
 * Price thresholds derive from the valuation trace (see SCORING_METHODOLOGY):
 * Buy Below = price where the valuation factor reaches Buy grade (raw 85 ⇒
 * MoS 25%); Strong Buy Below = Strong Buy grade (raw 95 ⇒ MoS ~32.1%).
 */
export function buyThresholds(conservativeValue: number | null): {
  buyBelow: number | null;
  strongBuyBelow: number | null;
} {
  if (conservativeValue === null || conservativeValue <= 0) {
    return { buyBelow: null, strongBuyBelow: null };
  }
  return {
    buyBelow: conservativeValue * (1 - 25 / 140),
    strongBuyBelow: conservativeValue * (1 - 45 / 140),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function generateReport(inputs: UniverseInputs): EngineReportFile {
  const now = new Date(inputs.now);
  const conflicts = detectConflicts(inputs.evidence, now);

  // Score every asset with its scoped evidence and conflicts.
  const recommendations: AssetRecommendation[] = inputs.entries.map((entry) => {
    const assetEvidence = inputs.evidence.filter(
      (r) => r.assetId === entry.asset.assetId || r.assetId === null,
    );
    const assetConflicts = conflicts.filter((c) =>
      c.evidenceIds.some((id) => assetEvidence.some((r) => r.evidenceId === id)),
    );
    const valuation = entry.valuationInput ? computeValuation(entry.valuationInput) : null;
    return scoreAsset({
      asset: entry.asset,
      evidence: assetEvidence,
      conflicts: assetConflicts,
      valuation,
      cases: entry.cases,
      invalidationConditions: entry.invalidationConditions,
      now,
    });
  });

  const rated = recommendations.filter(
    (r): r is AssetRecommendation & { totalScore: number } => r.totalScore !== null,
  );
  const insufficient = recommendations.filter((r) => r.status === "insufficient_evidence");

  // Market score: breadth-weighted mean of region scores (macro evidence).
  const marketScore =
    inputs.macro.regions.reduce((sum, r) => sum + r.score, 0) /
    Math.max(1, inputs.macro.regions.length);

  // Opportunity index (same formula as the deployment engine uses).
  const attractive = rated.filter((r) => r.totalScore >= 70);
  const breadth = rated.length === 0 ? 0 : attractive.length / rated.length;
  const meanAttractive =
    attractive.length === 0
      ? 0
      : attractive.reduce((s, r) => s + r.totalScore, 0) / attractive.length;
  const opportunityIndex = breadth * 60 + (meanAttractive / 100) * 40;

  /**
   * Cash score (documented formula): real yield on cash equivalents plus the
   * thinness of the opportunity set. 30 base + 15 per point of real yield +
   * 0.3 per point of missing opportunity. High = waiting is being paid for.
   */
  const realYield = inputs.cashPosition.cashYieldPct - inputs.cashPosition.inflationPct;
  const cashScore = Math.max(
    0,
    Math.min(100, 30 + realYield * 15 + (100 - opportunityIndex) * 0.3),
  );

  const reserveHealth = Math.max(
    0,
    Math.min(
      100,
      (inputs.cashPosition.emergencyReserve / Math.max(1, inputs.cashPosition.targetReserve)) * 100,
    ),
  );

  // Concentration: normalized Herfindahl of allocations, 0 (spread) – 100 (single asset).
  const allocations = Object.values(inputs.portfolio.allocations);
  const herfindahl = allocations.reduce((sum, a) => sum + a * a, 0);
  const concentrationRisk = Math.max(0, Math.min(100, herfindahl * 100));

  const posture = computeCapitalPosture({
    recommendations,
    cashScore,
    marketScore,
    macroRiskScore: inputs.macro.riskScore,
    reserveHealth,
    concentrationRisk,
    liquidityRisk: inputs.portfolio.liquidityRisk,
    reserveRequirement: inputs.editorial.reserveRequirement,
    generatedAt: inputs.now,
  });

  // ----- Change log vs previous report (never rewrites history) -----
  const changeLog: string[] = [];
  const previous = inputs.previous ?? null;
  if (previous) {
    const prevBand = previous.posture.deploymentBand;
    if (prevBand !== posture.deploymentBand) {
      changeLog.push(
        `Deployment posture: ${prevBand} (${round1(previous.posture.deploymentScore)}) → ${posture.deploymentBand} (${round1(posture.deploymentScore)}).`,
      );
    }
    for (const rec of rated) {
      const prev = previous.recommendations.find((p) => p.assetId === rec.assetId);
      if (!prev) {
        changeLog.push(`New asset rated: ${rec.assetId} (${rec.finalRating}).`);
        continue;
      }
      if (prev.finalRating !== rec.finalRating) {
        changeLog.push(`${rec.assetId}: rating ${prev.finalRating} → ${rec.finalRating}.`);
      } else if (prev.totalScore !== null && Math.abs(prev.totalScore - rec.totalScore) >= 2) {
        changeLog.push(
          `${rec.assetId}: score ${round1(prev.totalScore)} → ${round1(rec.totalScore)}.`,
        );
      }
    }
    if (previous.metadata.engineVersion !== ENGINE_VERSION) {
      changeLog.push(
        `Engine version ${previous.metadata.engineVersion} → ${ENGINE_VERSION}: scores are not directly comparable.`,
      );
    }
  }

  // ----- Warnings -----
  const warnings: string[] = [];
  for (const conflict of conflicts.filter((c) => c.resolution === "unresolved")) {
    warnings.push(`Unresolved evidence conflict: ${conflict.note}`);
  }
  for (const rec of insufficient) {
    warnings.push(
      `${rec.assetId}: insufficient evidence — ${rec.insufficientReasons.join(" ")}`,
    );
  }
  const staleEvidence = summarizeEvidence(inputs.evidence, now);
  if ((staleEvidence.byFreshness.stale ?? 0) + (staleEvidence.byFreshness.expired ?? 0) > 0) {
    warnings.push(
      `${(staleEvidence.byFreshness.stale ?? 0) + (staleEvidence.byFreshness.expired ?? 0)} of ${staleEvidence.total} evidence records are stale or expired.`,
    );
  }

  // ----- Journal entry (immutable; hash covers the full engine payload) -----
  const journalDraft = {
    entryId: `journal:${inputs.now}`,
    recommendationId: `posture:${inputs.now}`,
    timestamp: inputs.now,
    summary: `${posture.deploymentBand} at ${round1(posture.deploymentScore)} — ${posture.strongBuyCount} Strong Buys, cash score ${round1(cashScore)}.`,
    deploymentScore: posture.deploymentScore,
    recommendation: posture.recommendation,
    engineVersion: ENGINE_VERSION,
    modelVersion: ENGINE_VERSION,
    userDecision: null,
    executionDetails: null,
    outcome: null,
    reviewNotes: null,
    supersedes: null,
  };
  const reportHash = fnv1a64(
    stableStringify({ recommendations, posture, evidence: inputs.evidence.map((e) => e.evidenceId) }),
  );
  const journalEntry: DecisionJournalEntry = {
    ...journalDraft,
    reportHash,
    integrityHash: fnv1a64(stableStringify({ ...journalDraft, reportHash })),
  };

  const engine: EngineReport = {
    schemaVersion: "2.0",
    metadata: {
      generatedAt: inputs.now,
      evidenceUpdatedAt: inputs.evidence
        .map((e) => e.retrievedAt)
        .sort()
        .at(-1) ?? inputs.now,
      engineVersion: ENGINE_VERSION,
      mode: inputs.mode,
      previousReportHash: previous ? previous.journalEntry.reportHash : null,
    },
    assets: inputs.entries.map((e) => e.asset),
    evidence: inputs.evidence,
    conflicts,
    recommendations,
    posture,
    evidenceSummary: staleEvidence,
    changeLog,
    warnings,
    insufficientEvidenceItems: insufficient.map(
      (r) => `${r.assetId}: ${r.insufficientReasons.join(" ")}`,
    ),
    journalEntry,
  };

  return { schemaVersion: "2.0", engine, view: deriveViewReport(engine, inputs) };
}

/* ------------------------------------------------------------------ */
/*  View derivation: v1.1 presentation report from engine truth        */
/* ------------------------------------------------------------------ */

function deriveRadar(engine: EngineReport): RadarItem[] {
  const items: RadarItem[] = [];
  // Nearest-to-Buy asset: smallest positive premium over its Buy Below level.
  let nearest: { name: string; premium: number } | null = null;
  for (const rec of engine.recommendations) {
    if (rec.status !== "rated" || rec.valuation?.conservativeValue == null) continue;
    const { buyBelow } = buyThresholds(rec.valuation.conservativeValue);
    const price = rec.valuation.marketPrice;
    if (buyBelow === null || price === null || price <= buyBelow) continue;
    const premium = (price - buyBelow) / buyBelow;
    const asset = engine.assets.find((a) => a.assetId === rec.assetId)!;
    if (nearest === null || premium < nearest.premium) {
      nearest = { name: asset.name, premium };
    }
  }
  if (nearest && nearest.premium <= 0.45) {
    items.push({
      id: "radar-nearest-buy",
      severity: "positive",
      title: `${nearest.name} moved closer to Buy`,
      detail: `Price is ${(nearest.premium * 100).toFixed(0)}% above the Buy Below level — margin of safety remains insufficient.`,
    });
  }
  for (const line of engine.changeLog.slice(0, 3)) {
    items.push({
      id: `radar-change-${items.length}`,
      severity: "info",
      title: "Changed since previous report",
      detail: line,
    });
  }
  for (const item of engine.insufficientEvidenceItems.slice(0, 2)) {
    items.push({
      id: `radar-insufficient-${items.length}`,
      severity: "caution",
      title: "Insufficient evidence",
      detail: item,
    });
  }
  for (const constraint of engine.posture.constraints) {
    items.push({
      id: `radar-constraint-${constraint.id}`,
      severity: "risk",
      title: "Deployment constrained",
      detail: constraint.description,
    });
  }
  if (engine.posture.strongBuyCount === 0) {
    items.push({
      id: "radar-no-strong-buy",
      severity: "info",
      title: "Deployment unchanged — no Strong Buys",
      detail: "No asset clears the full evidence bar; no new evidence justifies pressing harder today.",
    });
  }
  return items.slice(0, 6);
}

export function deriveViewReport(engine: EngineReport, inputs: UniverseInputs): NeoosReport {
  // Every asset appears, including those the engine refused to rate —
  // Insufficient Evidence is a visible outcome, not a hidden one.
  const viewAssets: NeoosAsset[] = engine.recommendations.map((rec) => {
    const asset = engine.assets.find((a) => a.assetId === rec.assetId)!;
    const insufficient = rec.status === "insufficient_evidence";
    // Price thresholds require a valuation trace; without one they are omitted
    // entirely rather than shown without provenance.
    const thresholds = insufficient
      ? { buyBelow: null, strongBuyBelow: null }
      : buyThresholds(rec.valuation?.conservativeValue ?? null);
    return {
      id: asset.assetId,
      kind: asset.kind,
      name: asset.name,
      ticker: asset.ticker ?? undefined,
      exchange: asset.exchange ?? undefined,
      currency: asset.currency,
      assetClass: asset.assetClass,
      category: asset.category,
      region: asset.region,
      score: insufficient ? null : Math.round(rec.totalScore as number),
      rating: insufficient ? null : rec.finalRating,
      status: rec.status,
      insufficientReasons: insufficient ? rec.insufficientReasons : undefined,
      confidence: Math.round(rec.confidence),
      intrinsicValueLow: insufficient ? null : (rec.valuation?.conservativeValue ?? null),
      intrinsicValueHigh: insufficient ? null : (rec.valuation?.optimisticValue ?? null),
      buyBelow: thresholds.buyBelow,
      strongBuyBelow: thresholds.strongBuyBelow,
    };
  });

  const markets: MarketsSection = {
    macroContext: inputs.macro.macroContext,
    regions: inputs.macro.regions,
  };

  const goldRec = engine.recommendations.find((r) => r.assetId === "gold");
  const gold: GoldSection = {
    factors: inputs.evidence
      .filter((r) => r.assetId === "gold" && r.factor !== null && r.normalizedValue !== null)
      .map((r) => ({
        id: r.evidenceId,
        name: r.factualClaim,
        score: Math.round(r.normalizedValue as number),
        note: r.notes ?? r.sourceName,
      })),
    fairValueLow: goldRec?.valuation?.conservativeValue ?? null,
    fairValueHigh: goldRec?.valuation?.optimisticValue ?? null,
    role: inputs.editorial.goldRole,
  };

  const cash: CashSection = {
    available: inputs.cashPosition.available,
    emergencyReserve: inputs.cashPosition.emergencyReserve,
    deployable: inputs.cashPosition.deployable,
    monthlySurplus: inputs.cashPosition.monthlySurplus,
    cashYieldPct: inputs.cashPosition.cashYieldPct,
    opportunityCost: inputs.editorial.cashOpportunityCost,
    recommendation: inputs.editorial.cashRecommendation,
  };

  // Tiers: mean engine score of member assets; status from portfolio targets.
  const tiers: TierStatus[] = inputs.portfolio.tierTargets.map((tier) => {
    const memberScores = tier.memberAssetIds
      .map((id) => engine.recommendations.find((r) => r.assetId === id)?.totalScore)
      .filter((s): s is number => s != null);
    const score =
      memberScores.length === 0
        ? 0
        : memberScores.reduce((a, b) => a + b, 0) / memberScores.length;
    return { id: tier.id, name: tier.name, score: Math.round(score), status: tier.status };
  });

  // Timeline: immutable journal history plus today's entry.
  const timeline: TimelineEvent[] = [
    ...inputs.journalHistory.map((entry) => ({
      id: entry.entryId,
      date: new Date(entry.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      title: entry.summary,
      kind: "decision" as const,
      cashScore: null,
      deploymentPct: entry.deploymentScore,
      detail: `${entry.recommendation} · engine ${entry.engineVersion} · integrity ${entry.integrityHash.slice(0, 8)}`,
    })),
    {
      id: engine.journalEntry.entryId,
      date: "Today",
      title: engine.journalEntry.summary,
      kind: "decision",
      cashScore: Math.round(engine.posture.cashScore),
      deploymentPct: engine.posture.deploymentScore,
      detail: `${engine.posture.recommendation} · engine ${ENGINE_VERSION} · integrity ${engine.journalEntry.integrityHash.slice(0, 8)}`,
    },
  ];

  return {
    schemaVersion: "1.1",
    asOf: engine.metadata.generatedAt,
    mode: engine.metadata.mode,
    evidenceUpdatedAt: engine.metadata.evidenceUpdatedAt,
    engineVersion: engine.metadata.engineVersion,
    deployment: {
      score: engine.posture.deploymentScore,
      recommendation: engine.posture.recommendation,
      posture: engine.posture.acceleratorPosture,
      reasons: engine.posture.rationale,
    },
    scores: {
      cash: Math.round(engine.posture.cashScore),
      market: Math.round(engine.posture.marketScore),
      opportunity: Math.round(engine.posture.opportunityIndex),
      confidence: Math.round(engine.posture.confidence),
      evidenceIntegrity: Math.round(engine.posture.evidenceIntegrity),
      reserveHealth: Math.round(
        Math.max(
          0,
          Math.min(
            100,
            (inputs.cashPosition.emergencyReserve / Math.max(1, inputs.cashPosition.targetReserve)) * 100,
          ),
        ),
      ),
    },
    radar: deriveRadar(engine),
    assets: viewAssets,
    regime: inputs.macro.regime,
    commentary: inputs.editorial.commentary,
    markets,
    portfolio: inputs.portfolio.holdings,
    gold,
    cash,
    timeline,
    tiers,
    deploymentPlan: [
      {
        id: "tranche",
        label: "Initial tranche",
        value: `${Math.round(engine.posture.maximumInitialTranche * 100)}%`,
        note: "Maximum share of deployable cash in the first tranche",
      },
      { id: "method", label: "Method", value: "3 steps", note: "Price and evidence triggered" },
      {
        id: "reserve",
        label: "Reserve rule",
        value: "Mandatory",
        note: engine.posture.reserveRequirement,
      },
    ],
  };
}
