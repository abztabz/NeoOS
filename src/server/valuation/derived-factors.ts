import { computeRawChecksum } from "@/intelligence/ingestion/ingest";
import type { RawAssetIdentifier, RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import type { Fundamentals } from "@/server/valuation/from-filings";
import {
  currentRatio,
  netDebtToEquity,
  revenueCagr,
} from "@/server/valuation/from-filings";

/**
 * Factor scores derived from filed accounts.
 *
 * Filings give magnitudes — dollars, share counts. The engine's factors want a
 * 0–100 score. Something has to turn one into the other, and until it does,
 * audited accounts can produce a valuation but cannot produce a rating: the
 * engine's critical-factor gate requires `financialStrength` coverage, and no
 * currency figure supplies it.
 *
 * These records are **derived, not filed**, and they say so. Each states the
 * arithmetic in its own title, cites the filing it was computed from, and
 * carries the source records' ids in its payload. A reader can follow any score
 * back to the two numbers it came from and to the document those came from.
 *
 * The thresholds below are judgement — the only judgement in this module — so
 * they are stated as named constants with their reasoning, applied identically
 * to every asset, and bounded so no input can produce a score outside 0–100.
 * A missing input produces no record at all rather than a neutral 50, because a
 * fabricated midpoint is indistinguishable from a measured one once it is in
 * the system.
 */

export const DERIVED_FACTOR_VERSION = "1.0.0";

/* ---------------- thresholds, with reasons ---------------- */

/** Below this a company cannot cover a year of current obligations. */
export const CURRENT_RATIO_FLOOR = 0.5;
/** At or above this, liquidity stops being the binding constraint. */
export const CURRENT_RATIO_CEILING = 2.0;

/** Net cash. Nothing above this earns further credit. */
export const NET_DEBT_TO_EQUITY_BEST = 0;
/** Leverage at which the balance sheet dominates the investment case. */
export const NET_DEBT_TO_EQUITY_WORST = 1.5;

/** A net margin at or above this is exceptional across most industries. */
export const NET_MARGIN_CEILING = 0.25;
/** Return on equity at or above this is exceptional. */
export const RETURN_ON_EQUITY_CEILING = 0.3;

/** Revenue growth bounds, matching the valuation module's own clamps. */
export const GROWTH_SCORE_FLOOR = -0.1;
export const GROWTH_SCORE_CEILING = 0.15;

/** Map a measure onto 0–100 between a floor and a ceiling, clamped at both. */
function scale(value: number, floor: number, ceiling: number): number {
  if (ceiling === floor) return 50;
  const raw = ((value - floor) / (ceiling - floor)) * 100;
  return Math.max(0, Math.min(100, raw));
}

/* ---------------- the derived measures ---------------- */

export interface DerivedFactor {
  key: string;
  factor: "financialStrength" | "businessQuality" | "growth";
  score: number;
  /** The arithmetic, in words, for the record's title. */
  basis: string;
}

export function deriveFinancialStrength(f: Fundamentals): DerivedFactor | null {
  const ratio = currentRatio(f);
  const leverage = netDebtToEquity(f);
  if (ratio === null && leverage === null) return null;

  const parts: number[] = [];
  const basis: string[] = [];
  if (ratio !== null) {
    parts.push(scale(ratio, CURRENT_RATIO_FLOOR, CURRENT_RATIO_CEILING));
    basis.push(`current ratio ${ratio.toFixed(2)}`);
  }
  if (leverage !== null) {
    // Inverted: less debt scores higher.
    parts.push(scale(-leverage, -NET_DEBT_TO_EQUITY_WORST, -NET_DEBT_TO_EQUITY_BEST));
    basis.push(`net debt to equity ${leverage.toFixed(2)}`);
  }

  return {
    key: "financialStrength",
    factor: "financialStrength",
    score: parts.reduce((a, b) => a + b, 0) / parts.length,
    basis: basis.join(" and "),
  };
}

export function deriveBusinessQuality(f: Fundamentals): DerivedFactor | null {
  const parts: number[] = [];
  const basis: string[] = [];

  if (f.netIncome !== null && f.revenueLatest !== null && f.revenueLatest > 0) {
    const margin = f.netIncome / f.revenueLatest;
    parts.push(scale(margin, 0, NET_MARGIN_CEILING));
    basis.push(`net margin ${(margin * 100).toFixed(1)}%`);
  }
  if (f.netIncome !== null && f.stockholdersEquity !== null && f.stockholdersEquity > 0) {
    const roe = f.netIncome / f.stockholdersEquity;
    parts.push(scale(roe, 0, RETURN_ON_EQUITY_CEILING));
    basis.push(`return on equity ${(roe * 100).toFixed(1)}%`);
  }
  if (parts.length === 0) return null;

  return {
    key: "businessQuality",
    factor: "businessQuality",
    score: parts.reduce((a, b) => a + b, 0) / parts.length,
    basis: basis.join(" and "),
  };
}

export function deriveGrowth(f: Fundamentals): DerivedFactor | null {
  const cagr = revenueCagr(f);
  if (cagr === null) return null;
  return {
    key: "growth",
    factor: "growth",
    score: scale(cagr, GROWTH_SCORE_FLOOR, GROWTH_SCORE_CEILING),
    basis: `revenue CAGR ${(cagr * 100).toFixed(1)}% over ${f.revenuePeriods} filed periods`,
  };
}

export function deriveAll(f: Fundamentals): DerivedFactor[] {
  return [deriveFinancialStrength(f), deriveBusinessQuality(f), deriveGrowth(f)].filter(
    (d): d is DerivedFactor => d !== null,
  );
}

/* ---------------- as evidence ---------------- */

export interface DerivedRecordOptions {
  assetIdentifiers: RawAssetIdentifier[];
  /** The filing these were computed from — the citation. */
  sourceRef: string;
  /** Publication date of the underlying accounts, not the moment of computing. */
  publishedAt: string | null;
  retrievedAt: string;
  /** Period end of the accounts used, for the claim key. */
  periodEnd: string;
  /** When the underlying accounts stop being authoritative. */
  expiresAt: string | null;
  /** Ids of the filed records each score was computed from. */
  sourceEvidenceIds: string[];
  cik: string;
  entityName: string;
}

/**
 * Turn derived measures into evidence records.
 *
 * Confidence is deliberately below the tier-1 default. These are arithmetic on
 * audited numbers, which is stronger than an opinion and weaker than a figure
 * the company itself asserted — the thresholds that turn a ratio into a score
 * are ours, not the filer's, and the confidence should say so.
 */
export const DERIVED_CONFIDENCE = 80;

export function derivedFactorRecords(
  factors: DerivedFactor[],
  options: DerivedRecordOptions,
): RawEvidenceRecord[] {
  return factors.map((derived) => {
    const base = {
      rawEvidenceId: `sec-edgar-${options.cik}-derived-${derived.key}-${options.periodEnd}`,
      providerId: "sec-edgar",
      providerMode: "live" as const,
      providerRecordId: `derived:${derived.key}:${options.periodEnd}`,
      retrievedAt: options.retrievedAt,
      // The accounts' date, not the computation's: a score derived from last
      // year's accounts is last year's evidence however recently it was run.
      publishedAt: options.publishedAt,
      sourceRef: options.sourceRef,
      rawTitle: `${options.entityName} — ${derived.factor} score ${derived.score.toFixed(1)} derived from ${derived.basis} (period ending ${options.periodEnd})`,
      rawText: null,
      rawPayload: {
        derived: true,
        basis: derived.basis,
        periodEnd: options.periodEnd,
        computedFrom: options.sourceEvidenceIds,
        derivationVersion: DERIVED_FACTOR_VERSION,
      },
      assetIdentifiers: options.assetIdentifiers,
      evidenceCategory: "fundamental" as const,
      rawValue: Number(derived.score.toFixed(2)),
      // A 0–100 score, which is what the engine's factors consume.
      rawUnit: "score",
      rawCurrency: null,
      geographicScope: null,
      // Stated rather than left to the tier default: the arithmetic is on
      // audited figures, but the scoring thresholds are ours.
      rawConfidence: DERIVED_CONFIDENCE,
      ingestionStatus: "ingested" as const,
      parsingWarnings: [],
      payloadMetadata: {
        factorHint: derived.factor,
        purpose: `Derived ${derived.factor} score from filed accounts`,
        claimKey: `derived:${derived.key}:${options.periodEnd}`,
        expiresAt: options.expiresAt,
        sourceName: "Derived from U.S. Securities and Exchange Commission — EDGAR filings",
        adapterVersion: DERIVED_FACTOR_VERSION,
        derived: true,
      },
      supersedesRawEvidenceId: null,
    };
    return { ...base, checksum: computeRawChecksum(base) };
  });
}
