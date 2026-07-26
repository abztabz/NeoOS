import type { StatisticalEvidenceKind, StatisticalUnit } from "@/domain/statistics/types";

/**
 * Known statistical series, and how each ages.
 *
 * Horizons follow publication cadence rather than one global number — the same
 * lesson as annual filings ageing on a quarterly clock (EVIDENCE_POLICY.md). A
 * monthly CPI released with a two-week lag is not stale at 45 days; a policy
 * rate is not stale until the next scheduled decision has come and gone.
 *
 * A series in this registry is a **definition**, not a claim that NeoOS has the
 * data. Nothing here fetches anything.
 */

export interface SeriesDefinition {
  seriesId: string;
  label: string;
  jurisdiction: string;
  evidenceKind: StatisticalEvidenceKind;
  unit: StatisticalUnit;
  sourceClass: "A1" | "A2" | "A6";
  /** Institution expected to publish it. A name to verify, not a citation. */
  expectedPublisher: string;
  /** Days from reference-period end to expected publication. */
  publicationLagDays: number;
  /** Days past reference-period end after which the figure is stale. */
  staleAfterDays: number;
  /**
   * A standing policy fact rather than a periodic observation. It does not age;
   * it changes. Re-verified rather than re-published.
   */
  standing: boolean;
}

/**
 * The peg is the interesting case: a standing fact, so it never decays. It is
 * re-verified annually because the day it *does* change is the single largest
 * event a position denominated in that currency can face, and a system that had
 * stopped checking would learn about it from the news.
 */
export const STANDING_REVERIFY_DAYS = 365;

export const SERIES_REGISTRY: SeriesDefinition[] = [
  {
    seriesId: "ae.cpi.all-items",
    label: "UAE consumer price index",
    jurisdiction: "AE",
    evidenceKind: "domestic_price_level",
    unit: "index_level",
    sourceClass: "A2",
    expectedPublisher: "UAE Federal Competitiveness and Statistics Centre",
    publicationLagDays: 30,
    staleAfterDays: 120,
    standing: false,
  },
  {
    seriesId: "ae.policy-rate.base",
    label: "CBUAE base rate",
    jurisdiction: "AE",
    evidenceKind: "domestic_policy_rate",
    unit: "percent",
    sourceClass: "A1",
    expectedPublisher: "Central Bank of the UAE",
    publicationLagDays: 1,
    staleAfterDays: 90,
    standing: false,
  },
  {
    seriesId: "ae.currency-regime.aed-usd",
    label: "AED currency regime",
    jurisdiction: "AE",
    evidenceKind: "currency_regime",
    unit: "currency_per_unit",
    sourceClass: "A1",
    expectedPublisher: "Central Bank of the UAE",
    publicationLagDays: 0,
    staleAfterDays: STANDING_REVERIFY_DAYS,
    standing: true,
  },
  {
    seriesId: "np.cpi.all-items",
    label: "Nepal consumer price index",
    jurisdiction: "NP",
    evidenceKind: "domestic_price_level",
    unit: "index_level",
    sourceClass: "A2",
    expectedPublisher: "Nepal Rastra Bank / National Statistics Office",
    publicationLagDays: 45,
    staleAfterDays: 150,
    standing: false,
  },
  {
    seriesId: "np.currency-regime.npr",
    label: "NPR currency regime",
    jurisdiction: "NP",
    evidenceKind: "currency_regime",
    unit: "currency_per_unit",
    sourceClass: "A1",
    expectedPublisher: "Nepal Rastra Bank",
    publicationLagDays: 0,
    staleAfterDays: STANDING_REVERIFY_DAYS,
    standing: true,
  },
  {
    seriesId: "us.cpi.all-items",
    label: "US consumer price index (CPI-U)",
    jurisdiction: "US",
    evidenceKind: "domestic_price_level",
    unit: "index_level",
    sourceClass: "A6",
    expectedPublisher: "US Bureau of Labor Statistics",
    publicationLagDays: 14,
    staleAfterDays: 75,
    standing: false,
  },
  {
    seriesId: "us.policy-rate.fed-funds",
    label: "US federal funds target rate",
    jurisdiction: "US",
    evidenceKind: "imported_monetary_conditions",
    unit: "percent",
    sourceClass: "A6",
    expectedPublisher: "Federal Reserve",
    publicationLagDays: 1,
    staleAfterDays: 60,
    standing: false,
  },
];

export function findSeries(seriesId: string): SeriesDefinition | null {
  return SERIES_REGISTRY.find((series) => series.seriesId === seriesId) ?? null;
}

/** Price-level series for a jurisdiction. The only kind that may deflate. */
export function deflatorFor(jurisdiction: string): SeriesDefinition | null {
  return (
    SERIES_REGISTRY.find(
      (series) =>
        series.jurisdiction === jurisdiction && series.evidenceKind === "domestic_price_level",
    ) ?? null
  );
}
