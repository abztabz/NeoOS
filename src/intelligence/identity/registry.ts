import type { AssetIdentityEntry } from "@/intelligence/types/identity";
import type { CanonicalAsset } from "@/engine/models";

/**
 * The controlled proof universe: six assets, deliberately narrow.
 *
 * Each entry pairs a canonical engine asset with every identifier the outside
 * world might use for it. Adding an asset means adding it here — there is no
 * other path into the universe, which is what keeps identity auditable.
 */

export interface RegistryEntry {
  asset: CanonicalAsset;
  identity: AssetIdentityEntry;
}

function entry(
  asset: CanonicalAsset,
  identity: Omit<AssetIdentityEntry, "assetId">,
): RegistryEntry {
  return { asset, identity: { assetId: asset.assetId, ...identity } };
}

const blankIdentity = {
  ticker: null,
  exchange: null,
  isin: null,
  cusip: null,
  figi: null,
  commoditySymbol: null,
  legalName: null,
  fundName: null,
  aliases: [],
  providerIds: {},
  categoryLabels: [],
  isCategory: false,
};

export const ASSET_REGISTRY: RegistryEntry[] = [
  entry(
    {
      assetId: "apple",
      name: "Apple Inc.",
      kind: "instrument",
      ticker: "AAPL",
      exchange: "NASDAQ",
      currency: "USD",
      assetClass: "Equity",
      category: "Large-cap technology hardware",
      sector: "Information Technology",
      industry: "Technology Hardware",
      country: "US",
      region: "US",
      benchmark: "S&P 500",
      status: "active",
      sourceIdentifiers: { ticker: "AAPL", isin: "US0378331005" },
    },
    {
      ...blankIdentity,
      ticker: "AAPL",
      exchange: "NASDAQ",
      isin: "US0378331005",
      cusip: "037833100",
      legalName: "Apple Inc.",
      aliases: ["Apple", "Apple Computer", "Apple Inc"],
      providerIds: { "fixture-filings": "APPLE-ISSUER-1" },
    },
  ),

  entry(
    {
      assetId: "us-etf",
      name: "SPDR S&P 500 ETF Trust",
      kind: "instrument",
      ticker: "SPY",
      exchange: "NYSE Arca",
      currency: "USD",
      assetClass: "ETF",
      category: "Broad US market index funds",
      sector: "Diversified",
      industry: null,
      country: "US",
      region: "US",
      benchmark: "S&P 500",
      status: "active",
      sourceIdentifiers: { ticker: "SPY", isin: "US78462F1030" },
    },
    {
      ...blankIdentity,
      ticker: "SPY",
      exchange: "NYSE Arca",
      isin: "US78462F1030",
      cusip: "78462F103",
      fundName: "SPDR S&P 500 ETF Trust",
      // Deliberately NOT aliased to "S&P 500 ETF": many funds track the index,
      // so that phrase must stay ambiguous without a provider identifier.
      aliases: ["SPDR S&P 500 ETF Trust", "SPDR S&P 500"],
      providerIds: { "fixture-market": "SPY.ARCA" },
      categoryLabels: ["broad us market index fund"],
    },
  ),

  entry(
    {
      assetId: "gold",
      name: "Gold",
      kind: "instrument",
      ticker: "XAU",
      exchange: "Spot",
      // Price basis is explicit: USD per troy ounce, London spot.
      currency: "USD",
      assetClass: "Commodity",
      category: "Precious metals — strategic hedge",
      sector: null,
      industry: null,
      country: null,
      region: "Global",
      benchmark: "London spot gold, USD per troy ounce",
      status: "active",
      sourceIdentifiers: { iso4217: "XAU", basis: "USD per troy ounce (London spot)" },
    },
    {
      ...blankIdentity,
      ticker: "XAU",
      exchange: "Spot",
      commoditySymbol: "XAU",
      legalName: "Gold",
      aliases: ["Gold", "XAUUSD", "XAU/USD", "spot gold", "gold spot"],
      providerIds: { "fixture-market": "XAUUSD" },
    },
  ),

  entry(
    {
      assetId: "bills",
      name: "Short-duration government bills",
      kind: "category",
      ticker: null,
      exchange: null,
      currency: "USD",
      assetClass: "Cash equivalents",
      category: "Government bills under 12 months",
      sector: null,
      industry: null,
      country: "US",
      region: "US",
      benchmark: "3-month bill index",
      status: "active",
      sourceIdentifiers: { instrumentType: "treasury_bill" },
    },
    {
      ...blankIdentity,
      isCategory: true,
      legalName: "Short-duration government bills",
      // Cash is modelled as a first-class capital option. The distinct forms
      // below all map here, but each keeps its own evidence provenance.
      aliases: [
        "treasury bills",
        "t-bills",
        "government bills",
        "short-duration government bills",
        "money market fund",
        "bank deposit",
        "physical cash",
      ],
      providerIds: { "fixture-market": "USGG3M" },
      categoryLabels: ["cash equivalents", "government bills under 12 months"],
    },
  ),

  entry(
    {
      assetId: "uae-equity",
      name: "UAE listed utility (identity fixture)",
      kind: "instrument",
      ticker: "UAEUTIL",
      exchange: "ADX",
      currency: "AED",
      assetClass: "Equity",
      category: "Utilities and infrastructure",
      sector: "Utilities",
      industry: "Electric Utilities",
      country: "AE",
      region: "UAE",
      benchmark: "ADX General",
      status: "active",
      // Placeholder identity fixture: the concrete listing is configuration,
      // deliberately not hard-coded to a real recommendation.
      sourceIdentifiers: { ticker: "UAEUTIL", exchange: "ADX", fixture: "true" },
    },
    {
      ...blankIdentity,
      ticker: "UAEUTIL",
      exchange: "ADX",
      legalName: "UAE listed utility (identity fixture)",
      aliases: ["UAE utility fixture"],
      providerIds: { "fixture-market": "UAEUTIL.ADX" },
    },
  ),

  entry(
    {
      assetId: "value-etf",
      name: "Developed-market value ETF",
      kind: "category",
      ticker: null,
      exchange: null,
      currency: "USD",
      assetClass: "Equity",
      category: "Developed-market value factor funds",
      sector: null,
      industry: null,
      country: null,
      region: "Developed markets",
      benchmark: "MSCI World Value",
      status: "active",
      sourceIdentifiers: { instrumentType: "category" },
    },
    {
      ...blankIdentity,
      isCategory: true,
      fundName: "Developed-market value ETF",
      // A category, not an instrument: it must never auto-resolve to a ticker.
      aliases: ["developed-market value etf", "developed market value etf"],
      categoryLabels: ["developed-market value etf", "value factor fund"],
    },
  ),
];

export function registryAssets(): CanonicalAsset[] {
  return ASSET_REGISTRY.map((e) => e.asset);
}

export function findRegistryEntry(assetId: string): RegistryEntry | undefined {
  return ASSET_REGISTRY.find((e) => e.asset.assetId === assetId);
}
