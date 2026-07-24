import type {
  CashSection,
  DeploymentPlanRow,
  GoldSection,
  HoldingDetail,
  MarketsSection,
  NeoosReport,
  TierStatus,
  TimelineEvent,
} from "@/schemas/neoos-report";

/**
 * Canonical demo content. Content mirrors the approved visual baseline and
 * static content reference. Always labeled DEMO in the UI.
 *
 * `demoSections` is exported separately so selectors can fall back per
 * section when an imported report omits one (v1.0 files, partial v1.1 files).
 */

const markets: MarketsSection = {
  macroContext:
    "Rates are restrictive but stable. Inflation is trending toward target without breaking labor markets. " +
    "The dollar is elevated, keeping pressure on emerging markets while rewarding patience in developed-market value.",
  regions: [
    { id: "us", name: "US", score: 62, stance: "Selective", note: "Broad indices are fully priced; value pockets exist in cash-generative sectors." },
    { id: "europe", name: "Europe", score: 72, stance: "Improving", note: "Valuations remain below historical averages with improving earnings breadth." },
    { id: "japan", name: "Japan", score: 65, stance: "Balanced", note: "Governance reform continues to unlock shareholder value, offset by currency risk." },
    { id: "china", name: "China", score: 54, stance: "Fragile", note: "Cheap on paper; policy and property overhangs keep the evidence bar high." },
    { id: "uae", name: "UAE", score: 78, stance: "Attractive", note: "Utilities and infrastructure offer defensive cash flows at reasonable prices." },
    { id: "gold-region", name: "Gold", score: 73, stance: "Accumulate", note: "Central-bank demand is structural; accumulate with price discipline." },
  ],
};

const portfolio: HoldingDetail[] = [
  {
    assetId: "apple",
    allocation: "8%",
    targetRange: "5–10%",
    thesisStatus: "Intact",
    keyRisks: ["Hardware cycle dependence", "China exposure", "Multiple compression"],
    reviewTrigger: "Next quarterly filing or price below $185",
    role: "Quality compounder",
    tier: "Compounders",
  },
  {
    assetId: "gold",
    allocation: "6%",
    targetRange: "5–10%",
    thesisStatus: "Intact",
    keyRisks: ["Real-yield spikes", "USD strength", "ETF outflows"],
    reviewTrigger: "Real 10-year yield above 2.5%",
    role: "Strategic hedge",
    tier: "Strategic Hedges",
  },
  {
    assetId: "us-etf",
    allocation: "22%",
    targetRange: "20–30%",
    thesisStatus: "Intact",
    keyRisks: ["Index concentration", "Valuation ceiling"],
    reviewTrigger: "Forward earnings yield below bill yield",
    role: "Core growth",
    tier: "Compounders",
  },
  {
    assetId: "bills",
    allocation: "38%",
    targetRange: "25–45%",
    thesisStatus: "Intact",
    keyRisks: ["Reinvestment risk as rates fall"],
    reviewTrigger: "Cash score below 50",
    role: "Liquidity and optionality",
    tier: "Capital Preservation",
  },
  {
    assetId: "value-etf",
    allocation: "9%",
    targetRange: "10–20%",
    thesisStatus: "Building",
    keyRisks: ["Value trap concentration", "Rate sensitivity"],
    reviewTrigger: "Price below $50 accelerates accumulation",
    role: "Opportunistic value",
    tier: "Opportunistic Value",
  },
];

const gold: GoldSection = {
  factors: [
    { id: "demand", name: "Demand", score: 78, note: "Jewelry and investment demand both firm" },
    { id: "central-banks", name: "Central bank buying", score: 86, note: "Structural reserve diversification continues" },
    { id: "etf-flows", name: "ETF flows", score: 61, note: "Western flows stabilizing after outflows" },
    { id: "mine-supply", name: "Mine supply", score: 48, note: "Supply growth modest; cost curves rising" },
    { id: "real-yields", name: "Real yields", score: 55, note: "Elevated but no longer rising" },
    { id: "usd", name: "USD strength", score: 58, note: "Dollar elevated; a headwind that is fading" },
  ],
  fairValueLow: 2050,
  fairValueHigh: 2300,
  role: "Strategic hedge — 5–10% portfolio ballast against monetary and geopolitical stress",
};

const cash: CashSection = {
  available: 24000,
  emergencyReserve: 15000,
  deployable: 9000,
  monthlySurplus: 1850,
  cashYieldPct: 4.2,
  opportunityCost:
    "Holding deployable cash costs roughly the spread between bill yield and expected equity returns — currently small, which is why cash still scores well.",
  recommendation:
    "Keep the emergency reserve untouched. Deploy from the $9,000 investable balance only into qualified opportunities, in tranches.",
};

const timeline: TimelineEvent[] = [
  {
    id: "t1",
    date: "Jul 10",
    title: "Cash Score 94 — Hold Cash",
    kind: "cash",
    cashScore: 94,
    deploymentPct: 10,
    detail: "Deployment remained at 10%. Cash outcompeted the opportunity set.",
  },
  {
    id: "t2",
    date: "Jul 18",
    title: "Cash Score 88 — Still Hold",
    kind: "cash",
    cashScore: 88,
    deploymentPct: 10,
    detail: "No Strong Buys; cash remained attractive.",
  },
  {
    id: "t3",
    date: "Jul 25",
    title: "Deploy Gradually — deployment to 35%",
    kind: "deployment",
    cashScore: 76,
    deploymentPct: 35,
    detail: "Cash score fell to 76; selective opportunities justified gradual deployment.",
  },
  {
    id: "t4",
    date: "Today",
    title: "Capital Radar — no change",
    kind: "decision",
    cashScore: 76,
    deploymentPct: 35,
    detail: "Selective opportunity, no reason to accelerate further.",
  },
];

const tiers: TierStatus[] = [
  { id: "preservation", name: "Capital Preservation", score: 70, status: "Balanced" },
  { id: "compounders", name: "Compounders", score: 48, status: "Underweight" },
  { id: "value", name: "Opportunistic Value", score: 35, status: "Underweight" },
  { id: "hedges", name: "Strategic Hedges", score: 62, status: "Balanced" },
  { id: "optionality", name: "Optionality", score: 18, status: "Low by design" },
];

const deploymentPlan: DeploymentPlanRow[] = [
  { id: "tranche", label: "Initial tranche", value: "20–25%", note: "Of confirmed investable cash" },
  { id: "method", label: "Method", value: "3 steps", note: "Price and evidence triggered" },
  { id: "reserve", label: "Reserve rule", value: "Mandatory", note: "Do not deploy required family capital" },
];

export const demoSections = {
  regime: "Neutral / Cloudy",
  commentary:
    "The opportunity set is usable, not exceptional. Press the accelerator lightly: build positions only where " +
    "price and evidence justify it, keep substantial liquidity, and refuse to chase assets that require perfect outcomes.",
  markets,
  portfolio,
  gold,
  cash,
  timeline,
  tiers,
  deploymentPlan,
} as const;

export const demoReport: NeoosReport = {
  schemaVersion: "1.1",
  asOf: "2026-07-24T12:00:00Z",
  mode: "demo",
  deployment: {
    score: 35,
    recommendation: "Deploy Gradually",
    posture: "Light Pressure",
    reasons: [
      "Cash score 76 — short-duration yields still compete with most risk assets.",
      "Market score 62 — the opportunity set is selective, not broad.",
      "Zero Strong Buys — no asset clears the full evidence bar today.",
      "Evidence integrity 91 — sources are current, so conviction limits come from prices, not data quality.",
      "Reserve health is adequate; deployment above this level needs cheaper prices or stronger evidence.",
    ],
  },
  scores: {
    cash: 76,
    market: 62,
    opportunity: 58,
    confidence: 78,
    evidenceIntegrity: 91,
    reserveHealth: 88,
  },
  radar: [
    {
      id: "radar-apple",
      severity: "positive",
      title: "Apple moved closer to Buy",
      detail: "Valuation improved, but margin of safety remains insufficient.",
    },
    {
      id: "radar-gold",
      severity: "info",
      title: "Gold remains Accumulate",
      detail: "Strategic demand is supportive; price discipline is still required.",
    },
    {
      id: "radar-uae",
      severity: "positive",
      title: "UAE utilities improved",
      detail: "Quality and defensive cash-flow support strengthened.",
    },
    {
      id: "radar-deploy",
      severity: "info",
      title: "Deployment unchanged",
      detail: "No new evidence justifies pressing harder today.",
    },
  ],
  assets: [
    {
      id: "bills",
      kind: "category",
      name: "Short-duration government bills",
      assetClass: "Cash equivalents",
      category: "Government bills under 12 months",
      currency: "USD",
      region: "US",
      score: 87,
      rating: "Buy",
      confidence: 92,
      intrinsicValueLow: null,
      intrinsicValueHigh: null,
      buyBelow: null,
      strongBuyBelow: null,
    },
    {
      id: "value-etf",
      kind: "category",
      name: "Developed-market value ETF",
      assetClass: "Equity",
      category: "Developed-market value factor funds",
      currency: "USD",
      region: "Developed markets",
      score: 82,
      rating: "Accumulate",
      confidence: 84,
      intrinsicValueLow: 48,
      intrinsicValueHigh: 56,
      buyBelow: 50,
      strongBuyBelow: 42,
    },
    {
      id: "gold",
      kind: "instrument",
      name: "Gold",
      ticker: "XAU",
      exchange: "Spot",
      currency: "USD",
      assetClass: "Commodity",
      region: "Global",
      score: 73,
      rating: "Accumulate",
      confidence: 88,
      intrinsicValueLow: 2050,
      intrinsicValueHigh: 2300,
      buyBelow: null,
      strongBuyBelow: null,
    },
    {
      id: "us-etf",
      kind: "instrument",
      name: "Broad US market ETF",
      ticker: "SPY",
      exchange: "NYSE Arca",
      currency: "USD",
      assetClass: "Equity",
      region: "US",
      score: 66,
      rating: "Hold",
      confidence: 86,
      intrinsicValueLow: 520,
      intrinsicValueHigh: 560,
      buyBelow: null,
      strongBuyBelow: null,
    },
    {
      id: "apple",
      kind: "instrument",
      name: "Apple",
      ticker: "AAPL",
      exchange: "NASDAQ",
      currency: "USD",
      assetClass: "Equity",
      region: "US",
      score: 68,
      rating: "Hold",
      confidence: 84,
      intrinsicValueLow: 180,
      intrinsicValueHigh: 215,
      buyBelow: 185,
      strongBuyBelow: 160,
    },
    {
      id: "ai-basket",
      kind: "category",
      name: "Speculative AI momentum basket",
      assetClass: "Equity",
      category: "Thematic momentum baskets",
      currency: "USD",
      region: "Global",
      score: 34,
      rating: "Avoid",
      confidence: 76,
      intrinsicValueLow: null,
      intrinsicValueHigh: null,
      buyBelow: null,
      strongBuyBelow: null,
    },
  ],
  ...demoSections,
};
