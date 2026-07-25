import type { EvidenceRecord } from "@/engine/models";
import { FACTOR_NAMES, SOURCE_TIERS, type FactorName } from "@/engine/constants";
import type { RawEvidenceRecord, EvidenceCategory } from "@/intelligence/types/raw-evidence";
import type { IdentityResolution } from "@/intelligence/types/identity";
import {
  FUTURE_DATE_TOLERANCE_MINUTES,
  type ValidationIssue,
} from "@/intelligence/types/validation";
import {
  convertCurrency,
  isFactorScaleUnit,
  isSupportedUnit,
  toFactorScale,
  toUtcIso,
  type ConversionRecord,
  type FxTable,
} from "@/intelligence/normalization/units";

/**
 * Normalization: RawEvidenceRecord + resolved identity → EvidenceRecord.
 *
 * Normalization performs NO identity guessing — it receives an already-resolved
 * identity and refuses to proceed without one. It also performs no scoring: it
 * converts, tags, and hands validated evidence to the engine.
 */

/** Provider evidence category → engine evidence type (and therefore tier). */
const CATEGORY_TO_TYPE: Record<EvidenceCategory, keyof typeof SOURCE_TIERS> = {
  filing: "officialFiling",
  price: "marketData",
  fundamental: "officialFiling",
  macro_indicator: "macroIntelligence",
  research_opinion: "institutionalResearch",
  news: "financialNews",
  sentiment: "sentiment",
  reference: "marketData",
};

export interface NormalizationContext {
  /** Cycle timestamp; normalization must not read the wall clock. */
  now: string;
  /** Base currency for factor-scale evidence. */
  baseCurrency: string;
  fxTable: FxTable;
}

export interface NormalizedEvidence {
  evidence: EvidenceRecord;
  /** Present when a currency conversion happened. Original always preserved. */
  conversion: ConversionRecord | null;
  warnings: string[];
}

export interface NormalizationOutcome {
  normalized: NormalizedEvidence | null;
  issues: ValidationIssue[];
}

function issue(
  code: ValidationIssue["code"],
  severity: ValidationIssue["severity"],
  message: string,
  raw: RawEvidenceRecord,
  assetId: string | null,
  detail: string | null = null,
): ValidationIssue {
  return {
    code,
    severity,
    stage: "normalized_evidence",
    message,
    subjectType: "raw_evidence",
    subjectId: raw.rawEvidenceId,
    assetId,
    detail,
  };
}

function resolveFactor(raw: RawEvidenceRecord): FactorName | null {
  const hint = (raw.payloadMetadata.factorHint ?? raw.payloadMetadata.factor) as
    | string
    | undefined;
  if (typeof hint === "string" && (FACTOR_NAMES as string[]).includes(hint)) {
    return hint as FactorName;
  }
  // Macro records legitimately inform the macro factor without an explicit hint.
  if (raw.evidenceCategory === "macro_indicator") return "macro";
  return null;
}

export function normalizeRecord(
  raw: RawEvidenceRecord,
  identity: IdentityResolution,
  ctx: NormalizationContext,
): NormalizationOutcome {
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [...raw.parsingWarnings];

  // Identity must already be settled. Macro evidence is legitimately global
  // and carries a null assetId; anything else needs a matched asset.
  const isMacro = raw.evidenceCategory === "macro_indicator";
  if (!isMacro && identity.outcome !== "matched") {
    const code =
      identity.outcome === "ambiguous"
        ? "ambiguous_asset_identity"
        : identity.outcome === "conflicted"
          ? "conflicting_asset_identity"
          : "unknown_asset_identity";
    issues.push(
      issue(
        code,
        "blocking",
        `Cannot normalize ${raw.rawEvidenceId}: identity is ${identity.outcome}.`,
        raw,
        null,
        identity.warnings.join(" "),
      ),
    );
    return { normalized: null, issues };
  }

  const assetId = isMacro ? null : identity.assetId;

  // Dates.
  const publishedAt = toUtcIso(raw.publishedAt);
  const retrievedAt = toUtcIso(raw.retrievedAt);
  if (raw.publishedAt !== null && publishedAt === null) {
    issues.push(issue("impossible_date", "blocking", `Unparseable publication date "${raw.publishedAt}".`, raw, assetId));
    return { normalized: null, issues };
  }
  if (retrievedAt === null) {
    issues.push(issue("impossible_date", "blocking", `Unparseable retrieval timestamp "${raw.retrievedAt}".`, raw, assetId));
    return { normalized: null, issues };
  }
  if (publishedAt !== null) {
    const skewMinutes = (new Date(publishedAt).getTime() - new Date(ctx.now).getTime()) / 60_000;
    if (skewMinutes > FUTURE_DATE_TOLERANCE_MINUTES) {
      issues.push(
        issue(
          "future_publication_date",
          "blocking",
          `Publication date is ${Math.round(skewMinutes)} minutes in the future, beyond the ${FUTURE_DATE_TOLERANCE_MINUTES}-minute tolerance.`,
          raw,
          assetId,
        ),
      );
      return { normalized: null, issues };
    }
  }

  // Units and currency.
  //
  // Two families, and the difference decides everything downstream. A
  // FACTOR-SCALE unit maps onto the engine's 0–100 scale and may feed a factor.
  // A MAGNITUDE — a currency amount, a share count, an index level — cannot,
  // and must never reach a factor. Magnitudes keep their value and feed
  // valuation inputs; `factor` is forced to null so scoring cannot select them.
  const isCurrencyDenominated =
    raw.rawUnit === "currency" ||
    raw.rawUnit === "currency_per_share" ||
    raw.rawUnit === "currency_per_troy_ounce";
  const isMagnitude = raw.rawUnit !== null && isSupportedUnit(raw.rawUnit) && !isFactorScaleUnit(raw.rawUnit);
  let normalizedValue: number | null = null;
  let conversion: ConversionRecord | null = null;
  let unit = raw.rawUnit;

  if (raw.rawValue !== null) {
    if (!Number.isFinite(raw.rawValue)) {
      issues.push(issue("malformed_numeric_value", "blocking", `Value is not a finite number.`, raw, assetId));
      return { normalized: null, issues };
    }
    if (!isSupportedUnit(raw.rawUnit)) {
      issues.push(
        issue("unsupported_unit", "blocking", `Unit "${raw.rawUnit}" is not supported.`, raw, assetId),
      );
      return { normalized: null, issues };
    }

    // Currency-denominated values feed valuation inputs, never the 0–100 factor
    // scale. The VALUE is carried through — an evidence record asserting that
    // revenue was 400bn but holding no number is useless to the valuation that
    // needs it — and the record is instead kept out of factor scoring by
    // forcing `factor` to null below. Scoring selects on a non-null factor, so
    // a currency amount is structurally incapable of being read as a score.
    if (isCurrencyDenominated) {
      const from = raw.rawCurrency;
      if (from === null) {
        issues.push(
          issue("missing_provenance", "blocking", `Currency-denominated value has no currency.`, raw, assetId),
        );
        return { normalized: null, issues };
      }
      normalizedValue = raw.rawValue;
      if (from !== ctx.baseCurrency) {
        const outcome = convertCurrency(raw.rawValue, from, ctx.baseCurrency, ctx.fxTable);
        if (!outcome.ok) {
          // Original preserved; the record survives but cannot be mixed with
          // base-currency figures, which is a blocking condition downstream.
          issues.push(issue("incompatible_currency", "blocking", outcome.reason ?? "", raw, assetId));
          return { normalized: null, issues };
        }
        // `ok` guarantees a conversion record; narrow explicitly rather than
        // asserting, so a future change to the outcome type fails here.
        if (outcome.conversion === null) {
          issues.push(issue("incompatible_currency", "blocking", "Conversion reported success without a rate.", raw, assetId));
          return { normalized: null, issues };
        }
        conversion = outcome.conversion;
        normalizedValue = outcome.conversion.normalizedValue;
      }
    } else if (isMagnitude) {
      // A count, a multiple, or an index level. Real evidence, not a score.
      normalizedValue = raw.rawValue;
    } else {
      normalizedValue = toFactorScale(raw.rawValue, raw.rawUnit);
      if (normalizedValue === null) {
        issues.push(
          issue(
            "unsupported_unit",
            "warning",
            `Unit "${raw.rawUnit}" has no factor-scale mapping; the record is kept for provenance but does not score.`,
            raw,
            assetId,
          ),
        );
      }
      unit = raw.rawUnit;
    }
  }

  const factor = resolveFactor(raw);
  if (factor === null && normalizedValue !== null && !isMagnitude) {
    warnings.push(
      "No scoring factor supplied; the record is retained for provenance but contributes no factor score.",
    );
  }

  const evidenceType = CATEGORY_TO_TYPE[raw.evidenceCategory];
  const claimKey = (raw.payloadMetadata.claimKey as string | undefined) ?? null;

  const evidence: EvidenceRecord = {
    evidenceId: raw.rawEvidenceId,
    assetId,
    evidenceType,
    sourceTier: SOURCE_TIERS[evidenceType],
    sourceName: (raw.payloadMetadata.sourceName as string | undefined) ?? raw.providerId,
    sourceRef: raw.sourceRef,
    publicationDate: publishedAt ?? retrievedAt,
    retrievedAt,
    effectiveDate: publishedAt,
    expiresAt: null,
    factor: normalizedValue === null || isMagnitude ? null : factor,
    claimKey,
    factualClaim: raw.rawTitle,
    normalizedValue,
    unit,
    // Absent a source-stated confidence, fall back to the tier's own standing
    // rather than inventing a number: tier 1 is trusted more than tier 6.
    confidence: raw.rawConfidence ?? defaultConfidenceForTier(SOURCE_TIERS[evidenceType]),
    verificationStatus:
      raw.providerMode === "live" ? "verified" : raw.providerMode === "manual_import" ? "unverified" : "verified",
    conflictGroupId: null,
    notes: (raw.payloadMetadata.notes as string | undefined) ?? null,
  };

  return { normalized: { evidence, conversion, warnings }, issues };
}

/** Tier standing when a source states no confidence of its own. */
function defaultConfidenceForTier(tier: number): number {
  const byTier: Record<number, number> = { 1: 92, 2: 88, 3: 78, 4: 76, 5: 62, 6: 45 };
  return byTier[tier] ?? 50;
}
