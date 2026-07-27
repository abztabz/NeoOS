import type { MarketAssetClass } from "@/server/providers/market/provider";
import type { ObservationSourceClass } from "@/server/types/market-observation";

/**
 * Source hierarchy — which source is preferred for which asset class, and why.
 *
 * The default order is: official primary, then licensed, then official
 * republished, then free or delayed, then verified secondary, then manual, then
 * unavailable. Several asset classes deviate, and every deviation states its
 * reason, because an unexplained reordering is indistinguishable from a mistake.
 *
 * `coverage` is the honest part. An asset class with `none` has no provider path
 * implemented, and NeoOS reports it as unsupported rather than degrading it
 * quietly into a guess. Claiming coverage that no adapter delivers is the
 * failure mode this table exists to prevent.
 */

export type CoverageState = "implemented_free" | "implemented_optional_paid" | "manual_only" | "none";

export const coverageStateLabels: Record<CoverageState, string> = {
  implemented_free: "Covered by a free or official provider",
  implemented_optional_paid: "Covered only when an optional licensed provider is configured",
  manual_only: "Manual evidence entry only",
  none: "Not supported",
};

export interface AssetClassSourcePolicy {
  assetClass: MarketAssetClass;
  /** Preferred order. The resolver walks this and stops at the first success. */
  order: ObservationSourceClass[];
  coverage: CoverageState;
  /** Why the order deviates from the default, or why coverage is limited. */
  reason: string;
}

/** The default order, stated once so deviations are visible as deviations. */
export const DEFAULT_SOURCE_ORDER: ObservationSourceClass[] = [
  "official_primary",
  "licensed_market_data",
  "official_republished",
  "free_delayed_provider",
  "verified_secondary",
  "manual_operator_entry",
];

export const ASSET_CLASS_SOURCE_POLICIES: AssetClassSourcePolicy[] = [
  {
    assetClass: "us_listed_equity",
    order: DEFAULT_SOURCE_ORDER,
    coverage: "implemented_optional_paid",
    reason:
      "SEC EDGAR supplies fundamentals free and is already wired, but it publishes no prices. A US equity price therefore comes from a licensed feed or a free delayed provider, neither of which ships configured by default. Fundamentals alone make the asset partial, not unpriced-and-unratable.",
  },
  {
    assetClass: "us_listed_etf",
    order: DEFAULT_SOURCE_ORDER,
    coverage: "implemented_optional_paid",
    reason:
      "Fund sponsors publish end-of-day NAV on their own official pages, which would be an official_primary path worth adding. Until an adapter for a specific sponsor exists, ETF prices depend on a configured price provider.",
  },
  {
    assetClass: "global_equity",
    order: DEFAULT_SOURCE_ORDER,
    coverage: "implemented_optional_paid",
    reason:
      "Coverage varies by exchange and no single free path spans them. Claimed only where a configured provider actually returns the instrument.",
  },
  {
    assetClass: "ae_listed_equity",
    order: ["official_primary", "manual_operator_entry"],
    coverage: "manual_only",
    reason:
      "ADX and DFM publish disclosure as portal pages and PDFs rather than a public structured endpoint, and market-data redistribution is licensed per exchange. NeoOS does not scrape rendered pages, so UAE equities are manual-evidence-only. This is a licensing and reliability limit, not a judgement about the market. See UAE_EVIDENCE_POLICY.md.",
  },
  {
    assetClass: "np_listed_equity",
    order: ["official_primary", "manual_operator_entry"],
    coverage: "manual_only",
    reason:
      "The Nepal Stock Exchange publishes prices through its own site rather than a documented public API with stated reuse terms. Until such a path is confirmed, Nepali equities are manual-evidence-only and are labelled as such rather than sourced from an unofficial mirror.",
  },
  {
    assetClass: "gold_spot",
    order: ["official_primary", "licensed_market_data", "free_delayed_provider", "manual_operator_entry"],
    coverage: "implemented_optional_paid",
    reason:
      "The LBMA price is the official primary reference and is published under terms that restrict automated redistribution. Spot therefore comes from a licensed feed or, failing that, manual entry with a citation. Spot is never satisfied by a futures quote — see GOLD_PRICE_BASIS.md.",
  },
  {
    assetClass: "gold_futures",
    order: ["official_primary", "licensed_market_data", "free_delayed_provider", "manual_operator_entry"],
    coverage: "implemented_optional_paid",
    reason:
      "Exchange settlement prices are official primary data. Kept as a separate asset class from spot precisely so a futures settlement can never be substituted for a spot quote when spot is unavailable.",
  },
  {
    assetClass: "fx_pair",
    // Official primary first: the ECB publishes its own reference rates, and no
    // commercial vendor improves on the issuing central bank for that series.
    order: ["official_primary", "official_republished", "licensed_market_data", "free_delayed_provider", "manual_operator_entry"],
    coverage: "implemented_free",
    reason:
      "Central banks publish daily FX reference rates themselves, free, with documented reuse terms. Licensed feeds are demoted below official_primary here: for a reference rate the issuing institution is the origin, and a vendor restating it adds latency without adding authority.",
  },
  {
    assetClass: "government_bond_yield",
    order: ["official_primary", "official_republished", "licensed_market_data", "free_delayed_provider", "manual_operator_entry"],
    coverage: "implemented_free",
    reason:
      "Debt management offices and treasuries publish their own yield curves free and daily. Same reasoning as FX: the issuer is the primary source for what it pays on its own debt.",
  },
  {
    assetClass: "market_index",
    order: DEFAULT_SOURCE_ORDER,
    coverage: "none",
    reason:
      "Index levels are licensed by the index provider and redistribution terms vary per index. No adapter is implemented and none is claimed.",
  },
  {
    assetClass: "crypto",
    order: DEFAULT_SOURCE_ORDER,
    coverage: "none",
    reason:
      "No provider path is implemented. Whether crypto may be analysed at all is a Constitution question upstream of this table, and coverage is not added speculatively.",
  },
];

export function sourcePolicyFor(assetClass: MarketAssetClass): AssetClassSourcePolicy {
  const found = ASSET_CLASS_SOURCE_POLICIES.find((p) => p.assetClass === assetClass);
  if (!found) {
    // Unknown classes get the default order and no coverage claim. Defaulting to
    // "covered" would let a class nobody wrote a policy for claim a price.
    return {
      assetClass,
      order: DEFAULT_SOURCE_ORDER,
      coverage: "none",
      reason: "No source policy is defined for this asset class, so no coverage is claimed.",
    };
  }
  return found;
}

/** Asset classes with an actual implemented provider path, free or optional. */
export function coveredAssetClasses(): MarketAssetClass[] {
  return ASSET_CLASS_SOURCE_POLICIES.filter(
    (p) => p.coverage === "implemented_free" || p.coverage === "implemented_optional_paid",
  ).map((p) => p.assetClass);
}

/** Asset classes covered without credentials or payment. */
export function freelyCoveredAssetClasses(): MarketAssetClass[] {
  return ASSET_CLASS_SOURCE_POLICIES.filter((p) => p.coverage === "implemented_free").map(
    (p) => p.assetClass,
  );
}

export function unsupportedAssetClasses(): MarketAssetClass[] {
  return ASSET_CLASS_SOURCE_POLICIES.filter((p) => p.coverage === "none").map((p) => p.assetClass);
}
