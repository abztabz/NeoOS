/**
 * Sprint-1 demo workspace content beyond the report contract (schema v1.0 covers
 * deployment, scores, radar, assets). Everything here is demonstration data and
 * is labeled as such wherever it renders.
 */

export const marketRegime = "Neutral / Cloudy";

export interface RegionCard {
  id: string;
  name: string;
  score: number;
  stance: string;
  note: string;
}

export const regions: RegionCard[] = [
  { id: "us", name: "US", score: 62, stance: "Selective", note: "Broad indices are fully priced; value pockets exist in cash-generative sectors." },
  { id: "europe", name: "Europe", score: 72, stance: "Improving", note: "Valuations remain below historical averages with improving earnings breadth." },
  { id: "japan", name: "Japan", score: 65, stance: "Balanced", note: "Governance reform continues to unlock shareholder value, offset by currency risk." },
  { id: "china", name: "China", score: 54, stance: "Fragile", note: "Cheap on paper; policy and property overhangs keep the evidence bar high." },
  { id: "uae", name: "UAE", score: 78, stance: "Attractive", note: "Utilities and infrastructure offer defensive cash flows at reasonable prices." },
  { id: "gold-region", name: "Gold", score: 73, stance: "Accumulate", note: "Central-bank demand is structural; accumulate with price discipline." },
];

export const macroContext =
  "Rates are restrictive but stable. Inflation is trending toward target without breaking labor markets. " +
  "The dollar is elevated, keeping pressure on emerging markets while rewarding patience in developed-market value.";

export interface HoldingDetail {
  assetId: string;
  allocation: string;
  targetRange: string;
  thesisStatus: string;
  keyRisks: string[];
  reviewTrigger: string;
  role: string;
  tier: string;
}

export const holdingDetails: HoldingDetail[] = [
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

export interface GoldFactor {
  id: string;
  name: string;
  score: number;
  note: string;
}

export const goldFactors: GoldFactor[] = [
  { id: "demand", name: "Demand", score: 78, note: "Jewelry and investment demand both firm" },
  { id: "central-banks", name: "Central bank buying", score: 86, note: "Structural reserve diversification continues" },
  { id: "etf-flows", name: "ETF flows", score: 61, note: "Western flows stabilizing after outflows" },
  { id: "mine-supply", name: "Mine supply", score: 48, note: "Supply growth modest; cost curves rising" },
  { id: "real-yields", name: "Real yields", score: 55, note: "Elevated but no longer rising" },
  { id: "usd", name: "USD strength", score: 58, note: "Dollar elevated; a headwind that is fading" },
];

export const goldSummary = {
  fairValueLow: 2050,
  fairValueHigh: 2300,
  rating: "Accumulate",
  role: "Strategic hedge — 5–10% portfolio ballast against monetary and geopolitical stress",
};

export const cashPosition = {
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

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  kind: "deployment" | "cash" | "rating" | "decision" | "evidence";
  cashScore: number | null;
  deploymentPct: number | null;
  detail: string;
}

export const timelineEvents: TimelineEvent[] = [
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

export interface TierStatus {
  id: string;
  name: string;
  score: number;
  status: string;
}

export const tierStatuses: TierStatus[] = [
  { id: "preservation", name: "Capital Preservation", score: 70, status: "Balanced" },
  { id: "compounders", name: "Compounders", score: 48, status: "Underweight" },
  { id: "value", name: "Opportunistic Value", score: 35, status: "Underweight" },
  { id: "hedges", name: "Strategic Hedges", score: 62, status: "Balanced" },
  { id: "optionality", name: "Optionality", score: 18, status: "Low by design" },
];

export const deploymentPlan = [
  { id: "tranche", label: "Initial tranche", value: "20–25%", note: "Of confirmed investable cash" },
  { id: "method", label: "Method", value: "3 steps", note: "Price and evidence triggered" },
  { id: "reserve", label: "Reserve rule", value: "Mandatory", note: "Do not deploy required family capital" },
];

export const morpheusCommentary =
  "The opportunity set is usable, not exceptional. Press the accelerator lightly: build positions only where " +
  "price and evidence justify it, keep substantial liquidity, and refuse to chase assets that require perfect outcomes.";
