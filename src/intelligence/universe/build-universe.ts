import type { EngineReport, EvidenceRecord } from "@/engine/models";
import type { AssetUniverseEntry, UniverseInputs } from "@/engine/generate";
import type { ValuationInput } from "@/engine/valuation";
import { freshnessOf } from "@/engine/evidence";
import { ASSET_REGISTRY, type RegistryEntry } from "@/intelligence/identity/registry";
import type { IdentityTrace } from "@/intelligence/types/cycle";
import type { ValidationIssue } from "@/intelligence/types/validation";
import type { ProviderDescriptor } from "@/intelligence/types/provider";
import { blockingAssetIds } from "@/intelligence/types/validation";

/**
 * UniverseInputs generator.
 *
 * Turns normalized evidence plus portfolio context into the exact contract the
 * scoring engine consumes. This is the ONLY place UniverseInputs is composed —
 * no UI component builds one, and this module never computes a score.
 *
 * Assets are excluded rather than guessed at: an asset whose evidence was
 * blocked is dropped from the entry list with a stated reason, which the engine
 * then reports as Insufficient Evidence.
 */

/** Portfolio and mandate context supplied by configuration, not by providers. */
export interface PortfolioContext {
  cashPosition: UniverseInputs["cashPosition"];
  macro: UniverseInputs["macro"];
  portfolio: UniverseInputs["portfolio"];
  editorial: UniverseInputs["editorial"];
}

/** Per-asset valuation configuration, keyed by canonical assetId. */
export type ValuationConfig = Record<
  string,
  {
    build: (evidence: EvidenceRecord[]) => ValuationInput | null;
    cases?: AssetUniverseEntry["cases"];
    invalidationConditions?: string[];
  }
>;

export interface BuildUniverseArgs {
  now: string;
  /** Fixture and manual runs are never "live" — the caller passes the truth. */
  mode: "demo" | "live";
  evidence: EvidenceRecord[];
  identityTraces: IdentityTrace[];
  issues: ValidationIssue[];
  context: PortfolioContext;
  valuationConfig: ValuationConfig;
  providers: ProviderDescriptor[];
  journalHistory: UniverseInputs["journalHistory"];
  previous: EngineReport | null;
  registry?: RegistryEntry[];
}

export interface EvidenceCoverageRow {
  assetId: string;
  records: number;
  factorsCovered: string[];
  freshRecords: number;
  staleRecords: number;
  expiredRecords: number;
}

export interface BuildUniverseResult {
  inputs: UniverseInputs;
  excludedAssets: { assetId: string; reason: string }[];
  excludedEvidence: { evidenceId: string; reason: string }[];
  warnings: string[];
  blockingErrors: ValidationIssue[];
  evidenceCoverage: EvidenceCoverageRow[];
  freshnessSummary: Record<string, number>;
  identitySummary: { matched: number; ambiguous: number; unmatched: number; conflicted: number };
  conflictSummary: { total: number; unresolved: number };
  providerHealth: { providerId: string; mode: string; health: string }[];
}

export function buildUniverseInputs(args: BuildUniverseArgs): BuildUniverseResult {
  const registry = args.registry ?? ASSET_REGISTRY;
  const now = new Date(args.now);
  const blocked = blockingAssetIds(args.issues);

  const excludedAssets: { assetId: string; reason: string }[] = [];
  const excludedEvidence: { evidenceId: string; reason: string }[] = [];
  const warnings: string[] = [];

  // Drop expired evidence from the engine's input set, but record why.
  const usableEvidence: EvidenceRecord[] = [];
  for (const record of args.evidence) {
    if (freshnessOf(record, now) === "expired") {
      excludedEvidence.push({
        evidenceId: record.evidenceId,
        reason: "Past its freshness horizon by more than a full expiry period.",
      });
      continue;
    }
    usableEvidence.push(record);
  }

  const entries: AssetUniverseEntry[] = [];
  const coverage: EvidenceCoverageRow[] = [];

  for (const { asset } of registry) {
    const assetEvidence = usableEvidence.filter((r) => r.assetId === asset.assetId);
    const factorsCovered = [...new Set(assetEvidence.map((r) => r.factor).filter(Boolean))] as string[];

    coverage.push({
      assetId: asset.assetId,
      records: assetEvidence.length,
      factorsCovered,
      freshRecords: assetEvidence.filter((r) => freshnessOf(r, now) === "fresh").length,
      staleRecords: assetEvidence.filter((r) => freshnessOf(r, now) === "stale").length,
      expiredRecords: args.evidence.filter(
        (r) => r.assetId === asset.assetId && freshnessOf(r, now) === "expired",
      ).length,
    });

    if (blocked.has(asset.assetId)) {
      const reasons = args.issues
        .filter((i) => i.assetId === asset.assetId && i.severity === "blocking")
        .map((i) => i.message);
      excludedAssets.push({
        assetId: asset.assetId,
        reason: reasons.join(" ") || "Blocked by a validation failure.",
      });
      continue;
    }

    const config = args.valuationConfig[asset.assetId];
    const valuationInput = config ? config.build(assetEvidence) : null;
    if (config && valuationInput === null) {
      warnings.push(
        `No valuation could be built for ${asset.assetId}: required inputs are absent. It will be scored without a valuation factor or marked insufficient by the engine.`,
      );
    }

    entries.push({
      asset,
      valuationInput,
      cases: config?.cases,
      invalidationConditions: config?.invalidationConditions,
    });
  }

  const identitySummary = { matched: 0, ambiguous: 0, unmatched: 0, conflicted: 0 };
  for (const trace of args.identityTraces) {
    identitySummary[trace.resolution.outcome] += 1;
  }

  const freshnessSummary: Record<string, number> = { fresh: 0, aging: 0, stale: 0, expired: 0 };
  for (const record of args.evidence) {
    const state = freshnessOf(record, now);
    freshnessSummary[state] = (freshnessSummary[state] ?? 0) + 1;
  }

  const inputs: UniverseInputs = {
    now: args.now,
    mode: args.mode,
    entries,
    evidence: usableEvidence,
    cashPosition: args.context.cashPosition,
    macro: args.context.macro,
    portfolio: args.context.portfolio,
    editorial: args.context.editorial,
    journalHistory: args.journalHistory,
    previous: args.previous,
  };

  return {
    inputs,
    excludedAssets,
    excludedEvidence,
    warnings,
    blockingErrors: args.issues.filter((i) => i.severity === "blocking"),
    evidenceCoverage: coverage,
    freshnessSummary,
    identitySummary,
    conflictSummary: { total: 0, unresolved: 0 },
    providerHealth: args.providers.map((p) => ({
      providerId: p.providerId,
      mode: p.mode,
      health: p.health,
    })),
  };
}
