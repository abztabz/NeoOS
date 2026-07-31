import type { UniverseInputs } from "@/engine/generate";
import type { CanonicalAsset, EvidenceRecord } from "@/engine/models";
import type { FactorName } from "@/engine/constants";
import { SOURCE_TIERS } from "@/engine/constants";

/**
 * Demo universe: internally consistent FIXTURE inputs run through the real
 * scoring engine. No score in the demo report is typed by hand — every
 * number the UI shows is computed from these evidence records.
 *
 * These are illustrative fixtures for demonstration, NOT market data and not
 * claims about any real security. The UI labels every demo surface.
 */

const AS_OF = "2026-07-24T12:00:00Z";
const RETRIEVED = "2026-07-24T06:30:00Z";

type Tier = keyof typeof SOURCE_TIERS;

let evidenceSeq = 0;
function ev(args: {
  assetId: string | null;
  factor: FactorName | null;
  type: Tier;
  source: string;
  ref: string;
  claim: string;
  value: number | null;
  unit?: string;
  confidence: number;
  /** Days before AS_OF the source was published. */
  ageDays: number;
  verification?: EvidenceRecord["verificationStatus"];
  claimKey?: string;
  notes?: string;
}): EvidenceRecord {
  const published = new Date(new Date(AS_OF).getTime() - args.ageDays * 86_400_000).toISOString();
  evidenceSeq += 1;
  return {
    evidenceId: `ev-${String(evidenceSeq).padStart(3, "0")}-${args.assetId ?? "macro"}`,
    assetId: args.assetId,
    evidenceType: args.type,
    sourceTier: SOURCE_TIERS[args.type],
    sourceName: args.source,
    sourceRef: args.ref,
    publicationDate: published,
    retrievedAt: RETRIEVED,
    effectiveDate: published,
    expiresAt: null,
    factor: args.factor,
    claimKey: args.claimKey ?? null,
    factualClaim: args.claim,
    normalizedValue: args.value,
    unit: args.unit ?? "score",
    confidence: args.confidence,
    verificationStatus: args.verification ?? "verified",
    conflictGroupId: null,
    notes: args.notes ?? null,
  };
}

function asset(a: Partial<CanonicalAsset> & Pick<CanonicalAsset, "assetId" | "name" | "kind" | "assetClass" | "category" | "region">): CanonicalAsset {
  return {
    ticker: null,
    exchange: null,
    currency: "USD",
    sector: null,
    industry: null,
    country: null,
    benchmark: null,
    status: "active",
    sourceIdentifiers: {},
    ...a,
  };
}

/* ---------------- assets ---------------- */

const assets = {
  bills: asset({
    assetId: "bills",
    name: "Short-duration government bills",
    kind: "category",
    assetClass: "Cash equivalents",
    category: "Government bills under 12 months",
    region: "US",
    country: "US",
    benchmark: "3-month bill index",
  }),
  valueEtf: asset({
    assetId: "value-etf",
    name: "Developed-market value ETF",
    kind: "category",
    assetClass: "Equity",
    category: "Developed-market value factor funds",
    region: "Developed markets",
    benchmark: "MSCI World Value",
  }),
  gold: asset({
    assetId: "gold",
    name: "Gold",
    kind: "instrument",
    ticker: "XAU",
    exchange: "Spot",
    assetClass: "Commodity",
    category: "Precious metals",
    region: "Global",
    benchmark: "Spot gold",
    sourceIdentifiers: { iso4217: "XAU" },
  }),
  usEtf: asset({
    assetId: "us-etf",
    name: "SPDR S&P 500 ETF Trust",
    kind: "instrument",
    ticker: "SPY",
    exchange: "NYSE Arca",
    assetClass: "Equity",
    category: "Broad US market index funds",
    region: "US",
    country: "US",
    sector: "Diversified",
    benchmark: "S&P 500",
    sourceIdentifiers: { ticker: "SPY" },
  }),
  apple: asset({
    assetId: "apple",
    name: "Apple Inc.",
    kind: "instrument",
    ticker: "AAPL",
    exchange: "NASDAQ",
    assetClass: "Equity",
    category: "Large-cap technology hardware",
    region: "US",
    country: "US",
    sector: "Information Technology",
    industry: "Technology Hardware",
    benchmark: "S&P 500",
    sourceIdentifiers: { ticker: "AAPL" },
  }),
  aiBasket: asset({
    assetId: "ai-basket",
    name: "Speculative AI momentum basket",
    kind: "category",
    assetClass: "Equity",
    category: "Thematic momentum baskets",
    region: "Global",
  }),
};

/* ---------------- evidence ---------------- */

const evidence: EvidenceRecord[] = [
  // ---- macro (scoped null: applies to every asset) ----
  ev({ assetId: null, factor: "macro", type: "macroIntelligence", source: "Central bank policy statement", ref: "policy-2026-07", claim: "Policy rates restrictive but stable; disinflation intact", value: 72, confidence: 88, ageDays: 9 }),
  ev({ assetId: null, factor: "macro", type: "macroIntelligence", source: "National statistics office CPI release", ref: "cpi-2026-06", claim: "Headline inflation 2.6% year over year", value: 74, unit: "percent", confidence: 92, ageDays: 18 }),
  ev({ assetId: null, factor: "macro", type: "institutionalResearch", source: "Independent macro research desk", ref: "macro-outlook-q3", claim: "Growth holding, labour market cooling without breaking", value: 68, confidence: 76, ageDays: 26 }),

  // ---- bills ----
  ev({ assetId: "bills", factor: "financialStrength", type: "officialFiling", source: "Treasury issuance schedule", ref: "treasury-q3-2026", claim: "Sovereign issuer, full faith and credit", value: 98, confidence: 96, ageDays: 20 }),
  ev({ assetId: "bills", factor: "financialStrength", type: "marketData", source: "Primary dealer auction results", ref: "auction-2026-07-21", claim: "Auction bid-to-cover 2.6, no tail", value: 94, confidence: 93, ageDays: 3 }),
  ev({ assetId: "bills", factor: "financialStrength", type: "institutionalResearch", source: "Sovereign credit review", ref: "sov-review-2026", claim: "Debt service capacity unimpaired at current rates", value: 90, confidence: 84, ageDays: 40 }),
  ev({ assetId: "bills", factor: "businessQuality", type: "marketData", source: "Money market yield curve", ref: "mm-curve-2026-07-23", claim: "Deep, liquid, daily-priced instrument", value: 92, confidence: 95, ageDays: 1 }),
  ev({ assetId: "bills", factor: "businessQuality", type: "institutionalResearch", source: "Liquidity structure study", ref: "liq-study-2026", claim: "Settlement risk negligible; instant convertibility", value: 88, confidence: 82, ageDays: 55 }),
  ev({ assetId: "bills", factor: "growth", type: "marketData", source: "Forward rate curve", ref: "fwd-2026-07-23", claim: "No capital growth by construction; coupon only", value: 28, confidence: 90, ageDays: 1 }),
  ev({ assetId: "bills", factor: "technical", type: "marketData", source: "Bill roll spreads", ref: "roll-2026-07-23", claim: "Roll spreads stable; no dislocation", value: 66, confidence: 88, ageDays: 1 }),
  ev({ assetId: "bills", factor: "portfolioFit", type: "institutionalResearch", source: "Reserve policy framework", ref: "reserve-policy-v3", claim: "Primary reserve and optionality asset for the mandate", value: 94, confidence: 90, ageDays: 30 }),
  ev({ assetId: "bills", factor: "portfolioFit", type: "institutionalResearch", source: "Liability matching review", ref: "liability-2026", claim: "Matches near-term family liabilities exactly", value: 90, confidence: 86, ageDays: 44 }),
  ev({ assetId: "bills", factor: "governance", type: "officialFiling", source: "Statutory debt framework", ref: "debt-framework", claim: "Statutory issuance governance, full disclosure", value: 95, confidence: 94, ageDays: 60 }),

  // ---- developed-market value ETF ----
  ev({ assetId: "value-etf", factor: "financialStrength", type: "officialFiling", source: "Fund annual report", ref: "fund-ar-2025", claim: "Underlying holdings: median net debt/EBITDA 1.4x", value: 78, confidence: 88, ageDays: 95 }),
  ev({ assetId: "value-etf", factor: "financialStrength", type: "institutionalResearch", source: "Factor exposure analysis", ref: "factor-2026-q2", claim: "Balance-sheet quality tilt above category median", value: 74, confidence: 79, ageDays: 34 }),
  ev({ assetId: "value-etf", factor: "businessQuality", type: "institutionalResearch", source: "Index methodology review", ref: "index-method-2026", claim: "Screens exclude persistent value traps", value: 71, confidence: 77, ageDays: 48 }),
  ev({ assetId: "value-etf", factor: "businessQuality", type: "financialNews", source: "Financial press sector survey", ref: "press-2026-07-08", claim: "Value cohort earnings quality improving", value: 66, confidence: 62, ageDays: 16, claimKey: "value-cohort-quality" }),
  ev({ assetId: "value-etf", factor: "businessQuality", type: "institutionalResearch", source: "Independent research house", ref: "research-2026-07-02", claim: "Value cohort earnings quality flat, not improving", value: 54, confidence: 80, ageDays: 22, claimKey: "value-cohort-quality", notes: "Disagrees with press survey on the same claim" }),
  ev({ assetId: "value-etf", factor: "growth", type: "institutionalResearch", source: "Earnings breadth tracker", ref: "breadth-2026-q2", claim: "Earnings breadth improving second consecutive quarter", value: 62, confidence: 74, ageDays: 30 }),
  ev({ assetId: "value-etf", factor: "technical", type: "marketData", source: "Exchange consolidated tape", ref: "tape-2026-07-23", claim: "Price below 200-day average, stabilising", value: 58, confidence: 86, ageDays: 1 }),
  ev({ assetId: "value-etf", factor: "portfolioFit", type: "institutionalResearch", source: "Allocation policy review", ref: "alloc-2026", claim: "Fills the opportunistic value sleeve, currently underweight", value: 84, confidence: 85, ageDays: 30 }),
  ev({ assetId: "value-etf", factor: "governance", type: "officialFiling", source: "Fund prospectus", ref: "prospectus-2026", claim: "Transparent rules-based mandate, low fee, no leverage", value: 86, confidence: 91, ageDays: 70 }),
  ev({ assetId: "value-etf", factor: null, type: "marketData", source: "Real-time market quotation", ref: "vt-price-2026-07-24", claim: "Current market price per share", value: 41.8, confidence: 99, ageDays: 0 }),

  // ---- gold ----
  ev({ assetId: "gold", factor: "financialStrength", type: "marketData", source: "Central bank reserve statistics", ref: "cb-reserves-2026-q2", claim: "Central bank buying", value: 86, confidence: 90, ageDays: 4, notes: "Structural reserve diversification continues" }),
  ev({ assetId: "gold", factor: "financialStrength", type: "institutionalResearch", source: "Metals council supply review", ref: "supply-2026", claim: "Mine supply", value: 62, confidence: 82, ageDays: 40, notes: "Supply growth modest; cost curves rising" }),
  ev({ assetId: "gold", factor: "financialStrength", type: "marketData", source: "Physical market survey", ref: "physical-2026-07", claim: "Demand", value: 78, confidence: 87, ageDays: 5, notes: "Jewellery and investment demand both firm" }),
  ev({ assetId: "gold", factor: "businessQuality", type: "institutionalResearch", source: "Monetary history study", ref: "monetary-hist", claim: "Durability of monetary role across regimes", value: 88, confidence: 84, ageDays: 60 }),
  ev({ assetId: "gold", factor: "businessQuality", type: "marketData", source: "ETF flow report", ref: "etf-flows-2026-07", claim: "ETF flows", value: 61, confidence: 85, ageDays: 3, notes: "Western flows stabilising after outflows" }),
  ev({ assetId: "gold", factor: "businessQuality", type: "institutionalResearch", source: "Reserve asset survey", ref: "reserve-survey-2026", claim: "Official-sector allocation intent", value: 80, confidence: 83, ageDays: 35, notes: "Reserve managers intend to hold or raise allocations" }),
  ev({ assetId: "gold", factor: "growth", type: "institutionalResearch", source: "Long-run return study", ref: "longrun-2026", claim: "No cash flows; real return preserves purchasing power only", value: 44, confidence: 80, ageDays: 70 }),
  ev({ assetId: "gold", factor: "technical", type: "marketData", source: "Spot price series", ref: "spot-2026-07-23", claim: "Real yields", value: 55, confidence: 88, ageDays: 1, notes: "Elevated but no longer rising" }),
  ev({ assetId: "gold", factor: "portfolioFit", type: "institutionalResearch", source: "Hedge allocation framework", ref: "hedge-2026", claim: "USD strength", value: 88, confidence: 88, ageDays: 30, notes: "Dollar elevated; a headwind that is fading" }),
  // Custody standards are an audited disclosure, not market data — a market-data
  // horizon (5 days) would expire this within a week and silently drop governance.
  ev({ assetId: "gold", factor: "governance", type: "officialFiling", source: "Vault custody audit", ref: "custody-2026", claim: "Allocated custody with audited bar lists", value: 82, confidence: 86, ageDays: 50 }),
  ev({ assetId: "gold", factor: null, type: "marketData", source: "Real-time spot market quotation", ref: "gold-price-2026-07-24", claim: "Current spot price per troy ounce", value: 2380, unit: "USD", confidence: 99, ageDays: 0 }),

  // ---- broad US market ETF ----
  ev({ assetId: "us-etf", factor: "financialStrength", type: "officialFiling", source: "Index constituent filings aggregate", ref: "sp-aggregate-2026-q2", claim: "Aggregate interest cover 8.1x, net leverage moderate", value: 80, confidence: 89, ageDays: 55 }),
  ev({ assetId: "us-etf", factor: "financialStrength", type: "marketData", source: "Credit spread series", ref: "spreads-2026-07-23", claim: "Investment-grade spreads tight, no stress signal", value: 76, confidence: 87, ageDays: 1 }),
  ev({ assetId: "us-etf", factor: "businessQuality", type: "institutionalResearch", source: "Return on capital study", ref: "roc-2026", claim: "Index-level return on capital above long-run average", value: 84, confidence: 83, ageDays: 45 }),
  ev({ assetId: "us-etf", factor: "businessQuality", type: "officialFiling", source: "Constituent annual reports", ref: "constituent-ar-2025", claim: "Franchise durability broadly intact across top decile", value: 82, confidence: 88, ageDays: 110 }),
  ev({ assetId: "us-etf", factor: "growth", type: "institutionalResearch", source: "Earnings revision tracker", ref: "revisions-2026-07", claim: "Forward earnings revisions modestly positive", value: 70, confidence: 78, ageDays: 12 }),
  ev({ assetId: "us-etf", factor: "technical", type: "marketData", source: "Exchange consolidated tape", ref: "tape-2026-07-23", claim: "Near all-time highs; breadth narrow", value: 48, confidence: 88, ageDays: 1 }),
  ev({ assetId: "us-etf", factor: "portfolioFit", type: "institutionalResearch", source: "Allocation policy review", ref: "alloc-2026", claim: "Core growth sleeve near target weight", value: 72, confidence: 84, ageDays: 30 }),
  ev({ assetId: "us-etf", factor: "governance", type: "officialFiling", source: "Fund prospectus", ref: "spy-prospectus", claim: "Unit investment trust, transparent, deeply liquid", value: 88, confidence: 92, ageDays: 80 }),
  ev({ assetId: "us-etf", factor: null, type: "marketData", source: "Real-time market quotation", ref: "spy-price-2026-07-24", claim: "Current market price per share", value: 545, confidence: 99, ageDays: 0 }),

  // ---- Apple ----
  ev({ assetId: "apple", factor: "financialStrength", type: "officialFiling", source: "Issuer quarterly report", ref: "aapl-10q-2026-q3", claim: "Net cash position; operating cash flow covers capex 6x", value: 92, confidence: 95, ageDays: 38 }),
  ev({ assetId: "apple", factor: "financialStrength", type: "officialFiling", source: "Issuer annual report", ref: "aapl-10k-2025", claim: "Debt maturities well laddered, interest cover very high", value: 90, confidence: 94, ageDays: 115 }),
  ev({ assetId: "apple", factor: "financialStrength", type: "marketData", source: "Bond market pricing", ref: "aapl-bonds-2026-07", claim: "Corporate spreads among the tightest in the sector", value: 88, confidence: 86, ageDays: 2 }),
  ev({ assetId: "apple", factor: "businessQuality", type: "officialFiling", source: "Issuer annual report", ref: "aapl-10k-2025", claim: "Installed base and services attach rate still compounding", value: 91, confidence: 92, ageDays: 115 }),
  ev({ assetId: "apple", factor: "businessQuality", type: "institutionalResearch", source: "Competitive moat analysis", ref: "moat-2026", claim: "Switching costs and ecosystem lock-in durable", value: 88, confidence: 85, ageDays: 50 }),
  ev({ assetId: "apple", factor: "growth", type: "institutionalResearch", source: "Segment growth model", ref: "aapl-growth-2026", claim: "Hardware cycle mature; services growth mid-single digit", value: 64, confidence: 79, ageDays: 33 }),
  ev({ assetId: "apple", factor: "technical", type: "marketData", source: "Exchange consolidated tape", ref: "tape-2026-07-23", claim: "Trading in upper half of 52-week range", value: 52, confidence: 88, ageDays: 1 }),
  ev({ assetId: "apple", factor: "portfolioFit", type: "institutionalResearch", source: "Allocation policy review", ref: "alloc-2026", claim: "Quality compounder sleeve, within single-name limit", value: 78, confidence: 84, ageDays: 30 }),
  ev({ assetId: "apple", factor: "governance", type: "officialFiling", source: "Proxy statement", ref: "aapl-proxy-2026", claim: "Independent board majority; no unresolved audit findings", value: 84, confidence: 90, ageDays: 100 }),
  ev({ assetId: "apple", factor: null, type: "marketData", source: "Real-time market quotation", ref: "aapl-price-2026-07-24", claim: "Current market price per share", value: 214, confidence: 99, ageDays: 0 }),

  // ---- speculative AI basket: deliberately evidence-poor ----
  ev({ assetId: "ai-basket", factor: "technical", type: "sentiment", source: "Retail sentiment aggregator", ref: "sentiment-2026-07-22", claim: "Momentum and retail interest elevated", value: 68, confidence: 41, ageDays: 2, verification: "unverified" }),
  ev({ assetId: "ai-basket", factor: "growth", type: "financialNews", source: "Technology press roundup", ref: "press-ai-2026-07", claim: "Revenue growth expectations high but unaudited", value: 60, confidence: 44, ageDays: 11, verification: "unverified" }),
];

/* ---------------- universe ---------------- */

export const demoUniverse: UniverseInputs = {
  now: AS_OF,
  mode: "demo",
  entries: [
    {
      asset: assets.bills,
      valuationInput: {
        method: "cashEquivalentYield",
        calculationDate: AS_OF,
        currency: "USD",
        marketPrice: null,
        evidenceIds: ["ev-004-bills", "ev-002-macro"],
        confidence: 92,
        nominalYieldPct: 4.2,
        inflationPct: 2.6,
        assumptions: [
          "Bills held to maturity; no mark-to-market loss realised",
          "Inflation measured on the trailing headline CPI release",
        ],
        invalidationConditions: [
          "Policy rate cut below 3% removes the real-yield case",
          "Inflation re-accelerating above 4% turns the real yield negative",
        ],
      },
      cases: {
        downside: "Real yield compresses to zero as inflation re-accelerates; capital intact, purchasing power flat.",
        base: "Bills roll at similar yields; ~1.6% real return with full liquidity.",
        upside: "Rates stay higher for longer while opportunities cheapen — cash is paid to wait.",
        portfolioFit: "Primary reserve and optionality asset. Funds every future tranche.",
      },
      invalidationConditions: ["Cash score falls below 50 — deploy rather than roll"],
    },
    {
      asset: assets.valueEtf,
      valuationInput: {
        method: "netAssetValue",
        calculationDate: AS_OF,
        currency: "USD",
        marketPrice: 41.8,
        evidenceIds: ["ev-014-value-etf", "ev-022-value-etf"],
        confidence: 82,
        navPerUnit: 54.2,
        conservativeDiscount: 0.15,
        optimisticPremium: 0.08,
        assumptions: [
          "NAV taken from the latest audited fund report",
          "15% conservative haircut for value-trap risk within the basket",
        ],
        invalidationConditions: [
          "NAV falls more than 10% on constituent write-downs",
          "Fund mandate changes to permit leverage",
        ],
      },
      cases: {
        downside: "Value cohort de-rates a further 15%; NAV holds, price does not.",
        base: "Price converges toward the conservative NAV over two years.",
        upside: "Earnings breadth continues to improve and the discount closes fully.",
        portfolioFit: "Opportunistic value sleeve, currently underweight versus target.",
      },
      invalidationConditions: [
        "Price above the conservative NAV removes the discount case",
        "Two consecutive quarters of deteriorating earnings breadth",
      ],
    },
    {
      asset: assets.gold,
      valuationInput: {
        method: "goldStrategicAllocation",
        calculationDate: AS_OF,
        currency: "USD",
        marketPrice: 2380,
        evidenceIds: ["ev-023-gold", "ev-026-gold"],
        confidence: 84,
        centralBankDemandScore: 86,
        realYieldAnchor: 1.6,
        baseFairValue: 2900,
        assumptions: [
          "Long-run monetary fair value anchored on purchasing-power parity of reserves",
          "Central-bank demand treated as a structural, not cyclical, bid",
        ],
        invalidationConditions: [
          "Real 10-year yield sustained above 2.5%",
          "Central bank net buying turns negative for two consecutive quarters",
        ],
      },
      cases: {
        downside: "Real yields spike above 2.5%; gold de-rates toward the conservative anchor.",
        base: "Structural central-bank demand holds gold near the monetary fair value.",
        upside: "Monetary or geopolitical stress re-rates gold toward the optimistic case.",
        portfolioFit: "Strategic hedge — 5–10% ballast against monetary and geopolitical stress.",
      },
      invalidationConditions: ["Real 10-year yield above 2.5%", "Central bank net selling"],
    },
    {
      asset: assets.usEtf,
      valuationInput: {
        method: "earningsMultiple",
        calculationDate: AS_OF,
        currency: "USD",
        marketPrice: 545,
        evidenceIds: ["ev-033-us-etf", "ev-034-us-etf"],
        confidence: 84,
        eps: 26.5,
        conservativeMultiple: 18,
        baseMultiple: 21,
        optimisticMultiple: 24,
        assumptions: [
          "Index EPS taken from aggregated constituent filings, not forward estimates",
          "Conservative multiple set at the long-run median, not the current multiple",
        ],
        invalidationConditions: [
          "Aggregate EPS falls more than 10% in a recession",
          "Forward earnings yield falls below the bill yield",
        ],
      },
      cases: {
        downside: "Multiple reverts to the long-run median: roughly 25% below the current price.",
        base: "Earnings grow into the current multiple over several years.",
        upside: "Margins hold and breadth widens, supporting the optimistic multiple.",
        portfolioFit: "Core growth sleeve, near target weight — adding here raises concentration.",
      },
      invalidationConditions: ["Forward earnings yield below the bill yield", "Breadth deteriorating further"],
    },
    {
      asset: assets.apple,
      valuationInput: {
        method: "earningsMultiple",
        calculationDate: AS_OF,
        currency: "USD",
        marketPrice: 214,
        evidenceIds: ["ev-041-apple", "ev-042-apple"],
        confidence: 86,
        eps: 7.4,
        conservativeMultiple: 26,
        baseMultiple: 30,
        optimisticMultiple: 34,
        assumptions: [
          "EPS from the latest reported quarters, not management guidance",
          "Conservative multiple reflects a mature hardware cycle",
        ],
        invalidationConditions: [
          "Services growth falls below mid-single digits",
          "Regulatory action materially changes the App Store economics",
        ],
      },
      cases: {
        downside: "Hardware cycle disappoints and the multiple compresses to the conservative case.",
        base: "Services carry mid-single-digit growth; the multiple holds.",
        upside: "A new category re-accelerates growth and supports the optimistic multiple.",
        portfolioFit: "Quality compounder sleeve, within the single-name limit.",
      },
      invalidationConditions: ["Price above $215 removes any margin of safety", "Services growth below 5%"],
    },
    {
      // Deliberately evidence-poor: demonstrates the Insufficient Evidence gate.
      asset: assets.aiBasket,
      valuationInput: null,
      cases: {
        downside: "Not modelled — no valuation evidence exists.",
        base: "Not modelled — no valuation evidence exists.",
        upside: "Not modelled — no valuation evidence exists.",
        portfolioFit: "No allocation permitted without primary evidence.",
      },
      invalidationConditions: ["Audited financials would enable a first valuation attempt"],
    },
  ],
  evidence,
  cashPosition: {
    available: 24000,
    emergencyReserve: 15000,
    deployable: 9000,
    monthlySurplus: 1850,
    targetReserve: 17000,
    cashYieldPct: 4.2,
    inflationPct: 2.6,
  },
  macro: {
    regime: "Neutral / Cloudy",
    riskScore: 38,
    macroContext:
      "Rates are restrictive but stable. Inflation is trending toward target without breaking labour markets. " +
      "The dollar is elevated, keeping pressure on emerging markets while rewarding patience in developed-market value.",
    regions: [
      { id: "us", name: "US", score: 62, stance: "Selective", note: "Broad indices are fully priced; value pockets exist in cash-generative sectors." },
      { id: "europe", name: "Europe", score: 72, stance: "Improving", note: "Valuations remain below historical averages with improving earnings breadth." },
      { id: "japan", name: "Japan", score: 65, stance: "Balanced", note: "Governance reform continues to unlock shareholder value, offset by currency risk." },
      { id: "china", name: "China", score: 54, stance: "Fragile", note: "Cheap on paper; policy and property overhangs keep the evidence bar high." },
      { id: "uae", name: "UAE", score: 78, stance: "Attractive", note: "Utilities and infrastructure offer defensive cash flows at reasonable prices." },
      { id: "gold-region", name: "Gold", score: 73, stance: "Accumulate", note: "Central-bank demand is structural; accumulate with price discipline." },
    ],
  },
  portfolio: {
    holdings: [
      { assetId: "apple", allocation: "8%", targetRange: "5–10%", thesisStatus: "Intact", keyRisks: ["Hardware cycle dependence", "China exposure", "Multiple compression"], reviewTrigger: "Next quarterly filing or price below $185", role: "Quality compounder", tier: "Compounders" },
      { assetId: "gold", allocation: "6%", targetRange: "5–10%", thesisStatus: "Intact", keyRisks: ["Real-yield spikes", "USD strength", "ETF outflows"], reviewTrigger: "Real 10-year yield above 2.5%", role: "Strategic hedge", tier: "Strategic Hedges" },
      { assetId: "us-etf", allocation: "22%", targetRange: "20–30%", thesisStatus: "Intact", keyRisks: ["Index concentration", "Valuation ceiling"], reviewTrigger: "Forward earnings yield below bill yield", role: "Core growth", tier: "Compounders" },
      { assetId: "bills", allocation: "38%", targetRange: "25–45%", thesisStatus: "Intact", keyRisks: ["Reinvestment risk as rates fall"], reviewTrigger: "Cash score below 50", role: "Liquidity and optionality", tier: "Capital Preservation" },
      { assetId: "value-etf", allocation: "9%", targetRange: "10–20%", thesisStatus: "Building", keyRisks: ["Value trap concentration", "Rate sensitivity"], reviewTrigger: "Price below the conservative NAV accelerates accumulation", role: "Opportunistic value", tier: "Opportunistic Value" },
    ],
    allocations: { apple: 0.08, gold: 0.06, "us-etf": 0.22, bills: 0.38, "value-etf": 0.09 },
    liquidityRisk: 22,
    tierTargets: [
      { id: "preservation", name: "Capital Preservation", memberAssetIds: ["bills"], status: "Balanced" },
      { id: "compounders", name: "Compounders", memberAssetIds: ["apple", "us-etf"], status: "Underweight" },
      { id: "value", name: "Opportunistic Value", memberAssetIds: ["value-etf"], status: "Underweight" },
      { id: "hedges", name: "Strategic Hedges", memberAssetIds: ["gold"], status: "Balanced" },
      { id: "optionality", name: "Optionality", memberAssetIds: [], status: "Low by design" },
    ],
  },
  editorial: {
    commentary:
      "The opportunity set is usable, not exceptional. Press the accelerator lightly: build positions only where " +
      "price and evidence justify it, keep substantial liquidity, and refuse to chase assets that require perfect outcomes.",
    goldRole: "Strategic hedge — 5–10% portfolio ballast against monetary and geopolitical stress",
    cashOpportunityCost:
      "Holding deployable cash costs roughly the spread between the bill yield and expected equity returns — currently small, which is why cash still scores well.",
    cashRecommendation:
      "Keep the emergency reserve untouched. Deploy from the investable balance only into qualified opportunities, in tranches.",
    reserveRequirement: "Do not deploy capital required for family liabilities in the next 12 months.",
  },
  journalHistory: [
    {
      entryId: "journal:2026-07-10T12:00:00Z",
      recommendationId: "posture:2026-07-10T12:00:00Z",
      timestamp: "2026-07-10T12:00:00Z",
      reportHash: "a1b2c3d4e5f60718",
      summary: "Preserve Cash at 18 — cash outcompeted the opportunity set",
      deploymentScore: 18,
      recommendation: "Preserve Cash",
      engineVersion: "2.0.0",
      modelVersion: "2.0.0",
      userDecision: "No action taken",
      executionDetails: null,
      outcome: null,
      reviewNotes: "Cash score 94; nothing qualified.",
      supersedes: null,
      integrityHash: "0f1e2d3c4b5a6978",
    },
    {
      entryId: "journal:2026-07-18T12:00:00Z",
      recommendationId: "posture:2026-07-18T12:00:00Z",
      timestamp: "2026-07-18T12:00:00Z",
      reportHash: "b2c3d4e5f6071829",
      summary: "Preserve Cash at 20 — still no qualified opportunity",
      deploymentScore: 20,
      recommendation: "Preserve Cash",
      engineVersion: "2.0.0",
      modelVersion: "2.0.0",
      userDecision: "No action taken",
      executionDetails: null,
      outcome: null,
      reviewNotes: "Value cohort cheapened but evidence remained thin.",
      supersedes: null,
      integrityHash: "1a2b3c4d5e6f7081",
    },
  ],
  previous: null,
};
