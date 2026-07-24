import type { EngineReport, ValuationResult } from "@/engine/models";

/**
 * Provenance gate for asset-specific price conclusions.
 *
 * Buy Below, Strong Buy Below, and intrinsic-value ranges are investment
 * conclusions. They may only be displayed when the report carries the
 * valuation trace that produced them — method, model version, calculation
 * date, evidence references, assumptions, and invalidation conditions.
 *
 * A v1.0/v1.1 file can assert any number it likes in `buyBelow` with nothing
 * behind it; those numbers are withheld rather than shown as though they were
 * derived. This is an engineering control, not a disclaimer.
 */
export function valuationProvenance(
  engine: EngineReport | null,
  assetId: string,
): ValuationResult | null {
  if (engine === null) return null;
  const rec = engine.recommendations.find((r) => r.assetId === assetId);
  if (!rec || rec.status !== "rated" || rec.valuation === null) return null;
  const v = rec.valuation;
  // A trace must actually be complete to count as provenance.
  const complete =
    v.method.length > 0 &&
    v.modelVersion.length > 0 &&
    v.calculationDate.length > 0 &&
    v.evidenceIds.length > 0 &&
    v.assumptions.length > 0 &&
    v.invalidationConditions.length > 0 &&
    v.currency.length > 0;
  return complete ? v : null;
}

/** One-line provenance summary shown beside any displayed threshold. */
export function provenanceLabel(v: ValuationResult): string {
  return `${v.method} · model ${v.modelVersion} · ${v.calculationDate.slice(0, 10)} · ${v.evidenceIds.length} source(s) · confidence ${v.confidence.toFixed(0)}`;
}
