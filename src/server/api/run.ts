import type { EvidenceRecord } from "@/engine/models";
import type { PortfolioContext, ValuationConfig } from "@/intelligence/universe/build-universe";
import { getReportStore } from "@/server/persistence";
import { undeclaredPortfolioContext } from "@/server/config/portfolio";
import { runServerCycle, type ServerCycleResult } from "@/server/orchestration/server-cycle";
import {
  assetContexts,
  buildLiveAdapters,
  currentExecutionContext,
  readiness,
  runtimeRegionLabel,
  signingMaterial,
  unsupportedAssetIds,
} from "@/server/runtime";
import { valuationFromFilings } from "@/server/valuation/from-filings";
import { registryAssets } from "@/intelligence/identity/registry";

/**
 * One place that assembles and runs a server cycle.
 *
 * Both the scheduled route and the operator route call this, so a scheduled run
 * and a manual run are the same run with a different trigger recorded. Two code
 * paths would eventually diverge, and the one nobody watches would be the one
 * that quietly stopped signing its reports.
 */

export interface RunOptions {
  trigger: "scheduled" | "manual_api" | "manual_ui" | "backfill";
  triggeredBy: string;
  now?: string;
  context?: PortfolioContext;
}

export type RunOutcome =
  | { ok: true; result: ServerCycleResult }
  | { ok: false; status: 409 | 500; reason: string; missing: string[] };

export async function runCycleNow(options: RunOptions): Promise<RunOutcome> {
  const ready = readiness();
  if (!ready.canRunLive) {
    // Not an error condition — a correct refusal. Falling back to fixtures here
    // would put invented numbers inside a signed, stored, server-generated
    // report, which is the one place they must never appear.
    return {
      ok: false,
      status: 409,
      reason: ready.detail,
      missing: ready.missing,
    };
  }

  const now = options.now ?? new Date().toISOString();
  const adapters = buildLiveAdapters();
  const store = getReportStore();
  await store.migrate();

  const previous = await store.getLatestReport();
  const keys = signingMaterial();

  const result = await runServerCycle({
    runId: `run-${now.replace(/[:.]/g, "-")}`,
    now,
    adapters,
    context: options.context ?? undeclaredPortfolioContext(),
    valuationConfig: filingValuationConfig(now),
    // No FX conversion is attempted without a verified rate; an empty table
    // means non-USD evidence is reported unconverted rather than guessed at.
    fxTable: [],
    baseCurrency: "USD",
    journalHistory: [],
    previousReport: previous ? (extractEngineReport(previous.content.report) ?? null) : null,
    execution: {
      context: currentExecutionContext(),
      runtimeRegion: runtimeRegionLabel(),
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      startedAt: now,
    },
    assets: assetContexts(),
    store,
    signingKey: keys.privateKey,
    trustedKeys: keys.trustedKeys,
    unsupportedAssetIds: unsupportedAssetIds(adapters),
  });

  return { ok: true, result };
}

/**
 * Valuation configuration for every asset in the registry.
 *
 * Equities are valued from their filed accounts. Everything else returns null,
 * which routes it into the engine's existing insufficient-evidence gate rather
 * than into an invented method — an ETF, a commodity, and a bill each need a
 * valuation approach that filings cannot supply, and pretending otherwise would
 * produce a confident number with nothing behind it.
 */
export function filingValuationConfig(now: string): ValuationConfig {
  const config: ValuationConfig = {};
  for (const asset of registryAssets()) {
    if (asset.assetClass !== "Equity") continue;
    config[asset.assetId] = {
      build: (evidence: EvidenceRecord[]) =>
        valuationFromFilings(evidence, marketPriceFrom(evidence), now).input,
      invalidationConditions: [
        "A restatement of the latest annual accounts.",
        "A filing gap beyond the official-filing freshness horizon.",
      ],
    };
  }
  return config;
}

/** The most recent priced evidence for an asset, or null. Never carried forward. */
function marketPriceFrom(evidence: EvidenceRecord[]): number | null {
  const prices = evidence
    .filter((r) => r.claimKey?.startsWith("price:") && r.normalizedValue !== null)
    .sort((a, b) => (a.publicationDate < b.publicationDate ? 1 : -1));
  return prices[0]?.normalizedValue ?? null;
}

/** The stored envelope nests the engine report file; pull the engine half out. */
function extractEngineReport(report: unknown): Parameters<typeof runServerCycle>[0]["previousReport"] {
  if (report && typeof report === "object" && "engine" in report) {
    return (report as { engine: NonNullable<Parameters<typeof runServerCycle>[0]["previousReport"]> }).engine;
  }
  return null;
}
