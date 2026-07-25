import type { EvidenceRecord, EngineReport, DecisionJournalEntry } from "@/engine/models";
import type { ValuationInput } from "@/engine/valuation";
import { FixtureProviderAdapter } from "@/intelligence/adapters/fixture-provider";
import type { ProviderAdapter, ProviderDescriptor } from "@/intelligence/types/provider";
import {
  FIXTURE_DAY_1,
  FIXTURE_DAY_2,
  filingsProviderRecords,
  macroProviderRecords,
  marketProviderRecords,
  resetFixtureSequence,
} from "@/intelligence/fixtures/records";
import type { PortfolioContext, ValuationConfig } from "@/intelligence/universe/build-universe";
import { runDailyMorpheusCycle, type DailyCycleResult } from "@/intelligence/orchestration/cycle";
import type { FxTable } from "@/intelligence/normalization/units";

/**
 * The complete fixture intelligence run.
 *
 * Every artefact — raw evidence, normalized evidence, UniverseInputs, the
 * engine report, the diff, the briefing, the draft journal entry — is produced
 * by production code. Nothing here is a hand-authored final output.
 */

/** Verified rates for the fixture run. AED is pegged; the peg is the source. */
export const FIXTURE_FX: FxTable = [
  {
    from: "AED",
    to: "USD",
    rate: 0.2723,
    source: "UAE dirham USD peg (fixture)",
    timestamp: FIXTURE_DAY_1,
  },
];

const descriptor = (
  providerId: string,
  providerName: string,
  providerType: ProviderDescriptor["providerType"],
  sourceTier: number,
  capabilities: ProviderDescriptor["capabilities"],
): Omit<ProviderDescriptor, "mode" | "configured" | "authenticated" | "health"> => ({
  providerId,
  providerName,
  providerType,
  sourceTier,
  capabilities,
  supportedAssetClasses: ["Equity", "ETF", "Commodity", "Cash equivalents"],
  lastSuccessfulRetrieval: null,
  failureReason: null,
  legalNotes:
    "Illustrative fixture data bundled with NeoOS. Not market data, not licensed content, and never presented as live.",
  rateLimit: null,
});

export function fixtureAdapters(day: 1 | 2, failMacro = false): ProviderAdapter[] {
  resetFixtureSequence();
  const asOf = day === 1 ? FIXTURE_DAY_1 : FIXTURE_DAY_2;
  return [
    new FixtureProviderAdapter(
      descriptor("fixture-filings", "Fixture filings archive", "official_filing", 1, ["filings", "fundamentals"]),
      filingsProviderRecords(asOf, day),
    ),
    new FixtureProviderAdapter(
      descriptor("fixture-market", "Fixture market data", "market_data", 2, ["prices", "reference_data"]),
      marketProviderRecords(asOf, day),
    ),
    new FixtureProviderAdapter(
      descriptor("fixture-macro", "Fixture macro intelligence", "macro", 4, ["macro_series"]),
      macroProviderRecords(asOf),
      failMacro ? "Simulated provider outage for partial-success testing." : null,
    ),
  ];
}

/* ------------------------------------------------------------------ */
/*  Valuation configuration: how each asset class is valued            */
/* ------------------------------------------------------------------ */

/** Pull the most recent price for an asset out of its evidence. */
function priceFrom(evidence: EvidenceRecord[], claimKey: string): number | null {
  const record = evidence.find((r) => r.claimKey === claimKey);
  if (!record) return null;
  // Prices arrive as currency-denominated records, which normalization keeps
  // out of the factor scale; the raw magnitude lives in the claim itself.
  const parsed = Number.parseFloat(record.factualClaim.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function fixtureValuationConfig(prices: Record<string, number>): ValuationConfig {
  const calcDate = FIXTURE_DAY_1;
  return {
    apple: {
      build: (evidence): ValuationInput | null => {
        const cited = evidence
          .filter((r) => r.factor === "financialStrength" || r.factor === "businessQuality")
          .map((r) => r.evidenceId)
          .slice(0, 3);
        if (cited.length === 0 || prices.apple === undefined) return null;
        return {
          method: "earningsMultiple",
          calculationDate: calcDate,
          currency: "USD",
          marketPrice: prices.apple,
          evidenceIds: cited,
          confidence: 86,
          eps: prices.appleEps ?? 7.4,
          conservativeMultiple: 26,
          baseMultiple: 30,
          optimisticMultiple: 34,
          assumptions: [
            "Earnings per share taken from reported quarters, not management guidance",
            "Conservative multiple reflects a mature hardware cycle",
          ],
          invalidationConditions: [
            "Services growth falls below mid-single digits",
            "Regulatory action materially changes platform economics",
          ],
        };
      },
      cases: {
        downside: "Hardware cycle disappoints and the multiple compresses to the conservative case.",
        base: "Services carry mid-single-digit growth; the multiple holds.",
        upside: "A new category re-accelerates growth toward the optimistic multiple.",
        portfolioFit: "Quality compounder sleeve, within the single-name limit.",
      },
      invalidationConditions: ["Services growth below 5%", "Price above the conservative value"],
    },

    "us-etf": {
      build: (evidence): ValuationInput | null => {
        const cited = evidence.filter((r) => r.sourceTier <= 2).map((r) => r.evidenceId).slice(0, 3);
        if (cited.length === 0 || prices["us-etf"] === undefined) return null;
        return {
          method: "earningsMultiple",
          calculationDate: calcDate,
          currency: "USD",
          marketPrice: prices["us-etf"],
          evidenceIds: cited,
          confidence: 84,
          eps: 26.5,
          conservativeMultiple: 18,
          baseMultiple: 21,
          optimisticMultiple: 24,
          assumptions: [
            "Index earnings aggregated from constituent filings, not forward estimates",
            "Conservative multiple set at the long-run median",
          ],
          invalidationConditions: [
            "Aggregate earnings fall more than 10%",
            "Forward earnings yield falls below the bill yield",
          ],
        };
      },
      cases: {
        downside: "The multiple reverts to its long-run median.",
        base: "Earnings grow into the current multiple over several years.",
        upside: "Margins hold and breadth widens.",
        portfolioFit: "Core growth sleeve, near target weight.",
      },
      invalidationConditions: ["Forward earnings yield below the bill yield"],
    },

    gold: {
      build: (evidence): ValuationInput | null => {
        const cited = evidence
          .filter((r) => r.factor === "financialStrength" || r.factor === "businessQuality")
          .map((r) => r.evidenceId)
          .slice(0, 3);
        if (cited.length === 0 || prices.gold === undefined) return null;
        return {
          method: "goldStrategicAllocation",
          calculationDate: calcDate,
          currency: "USD",
          marketPrice: prices.gold,
          evidenceIds: cited,
          confidence: 84,
          centralBankDemandScore: 86,
          realYieldAnchor: 1.6,
          baseFairValue: 2900,
          assumptions: [
            "Monetary fair value anchored on long-run reserve purchasing power",
            "Central-bank demand treated as structural rather than cyclical",
          ],
          invalidationConditions: [
            "Real ten-year yield sustained above 2.5%",
            "Central bank net buying turns negative for two consecutive quarters",
          ],
        };
      },
      cases: {
        downside: "Real yields spike and gold de-rates toward the conservative anchor.",
        base: "Structural demand holds gold near monetary fair value.",
        upside: "Monetary or geopolitical stress re-rates gold higher.",
        portfolioFit: "Strategic hedge — portfolio ballast, sized by policy.",
      },
      invalidationConditions: ["Real ten-year yield above 2.5%"],
    },

    bills: {
      build: (evidence): ValuationInput | null => {
        const cited = evidence.map((r) => r.evidenceId).slice(0, 2);
        if (cited.length === 0) return null;
        return {
          method: "cashEquivalentYield",
          calculationDate: calcDate,
          currency: "USD",
          marketPrice: null,
          evidenceIds: cited,
          confidence: 92,
          nominalYieldPct: prices.billYield ?? 4.2,
          inflationPct: 2.6,
          assumptions: [
            "Bills held to maturity; no mark-to-market loss realised",
            "Inflation measured on the trailing headline release",
          ],
          invalidationConditions: [
            "Policy rate cut below 3% removes the real-yield case",
            "Inflation re-accelerating above 4% turns the real yield negative",
          ],
        };
      },
      cases: {
        downside: "Real yield compresses to zero; capital intact, purchasing power flat.",
        base: "Bills roll at similar yields with full liquidity.",
        upside: "Rates stay higher for longer while opportunities cheapen.",
        portfolioFit: "Primary reserve and optionality asset.",
      },
      invalidationConditions: ["Cash score falls below 50"],
    },

    "uae-equity": {
      build: (evidence): ValuationInput | null => {
        const cited = evidence.map((r) => r.evidenceId).slice(0, 2);
        if (cited.length === 0 || prices["uae-equity"] === undefined) return null;
        return {
          method: "netAssetValue",
          calculationDate: calcDate,
          currency: "USD",
          // Price converted from AED with a preserved, verified rate.
          marketPrice: prices["uae-equity"],
          evidenceIds: cited,
          confidence: 74,
          navPerUnit: 2.35,
          conservativeDiscount: 0.15,
          optimisticPremium: 0.1,
          assumptions: [
            "Regulated asset base used as a net-asset proxy",
            "15% conservative haircut for regulatory and currency risk",
            "AED converted to USD at the disclosed peg rate",
          ],
          invalidationConditions: [
            "Tariff framework revised downward",
            "Peg regime changes",
          ],
        };
      },
      cases: {
        downside: "Tariff reset compresses the regulated return.",
        base: "Regulated returns hold and the discount narrows slowly.",
        upside: "Infrastructure expansion lifts the asset base.",
        portfolioFit: "Regional diversification within the utilities sleeve.",
      },
      invalidationConditions: ["Tariff framework revised", "Currency peg changes"],
    },

    // Deliberately absent: "value-etf" has no valuation builder, so it stays
    // evidence-poor and the engine reports Insufficient Evidence for it.
  };
}

/* ------------------------------------------------------------------ */
/*  Portfolio and mandate context                                      */
/* ------------------------------------------------------------------ */

export const FIXTURE_CONTEXT: PortfolioContext = {
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
      { assetId: "apple", allocation: "8%", targetRange: "5–10%", thesisStatus: "Intact", keyRisks: ["Hardware cycle dependence", "Concentration in one platform", "Multiple compression"], reviewTrigger: "Next quarterly filing or a move below the conservative value", role: "Quality compounder", tier: "Compounders" },
      { assetId: "gold", allocation: "6%", targetRange: "5–10%", thesisStatus: "Intact", keyRisks: ["Real-yield spikes", "USD strength"], reviewTrigger: "Real ten-year yield above 2.5%", role: "Strategic hedge", tier: "Strategic Hedges" },
      { assetId: "us-etf", allocation: "22%", targetRange: "20–30%", thesisStatus: "Intact", keyRisks: ["Index concentration", "Valuation ceiling"], reviewTrigger: "Forward earnings yield below bill yield", role: "Core growth", tier: "Compounders" },
      { assetId: "bills", allocation: "38%", targetRange: "25–45%", thesisStatus: "Intact", keyRisks: ["Reinvestment risk as rates fall"], reviewTrigger: "Cash score below 50", role: "Liquidity and optionality", tier: "Capital Preservation" },
      { assetId: "uae-equity", allocation: "4%", targetRange: "0–8%", thesisStatus: "Building", keyRisks: ["Regulatory reset", "Currency peg"], reviewTrigger: "Tariff framework review", role: "Regional diversification", tier: "Opportunistic Value" },
      { assetId: "value-etf", allocation: "2%", targetRange: "10–20%", thesisStatus: "Building", keyRisks: ["Value trap concentration"], reviewTrigger: "Evidence sufficient to rate the sleeve", role: "Opportunistic value", tier: "Opportunistic Value" },
    ],
    allocations: { apple: 0.08, gold: 0.06, "us-etf": 0.22, bills: 0.38, "uae-equity": 0.04, "value-etf": 0.02 },
    liquidityRisk: 22,
    tierTargets: [
      { id: "preservation", name: "Capital Preservation", memberAssetIds: ["bills"], status: "Balanced" },
      { id: "compounders", name: "Compounders", memberAssetIds: ["apple", "us-etf"], status: "Underweight" },
      { id: "value", name: "Opportunistic Value", memberAssetIds: ["value-etf", "uae-equity"], status: "Underweight" },
      { id: "hedges", name: "Strategic Hedges", memberAssetIds: ["gold"], status: "Balanced" },
      { id: "optionality", name: "Optionality", memberAssetIds: [], status: "Low by design" },
    ],
  },
  editorial: {
    commentary:
      "The opportunity set is usable, not exceptional. Press the accelerator lightly: build positions only where " +
      "price and evidence justify it, keep substantial liquidity, and refuse to chase assets that require perfect outcomes.",
    goldRole: "Strategic hedge — portfolio ballast against monetary and geopolitical stress",
    cashOpportunityCost:
      "Holding deployable cash costs roughly the spread between the bill yield and expected equity returns — currently small, which is why cash still scores well.",
    cashRecommendation:
      "Keep the emergency reserve untouched. Deploy from the investable balance only into qualified opportunities, in tranches.",
    reserveRequirement: "Do not deploy capital required for family liabilities in the next 12 months.",
  },
};

/** Prices per fixture day, used to build valuation inputs. */
export function fixturePrices(day: 1 | 2): Record<string, number> {
  return day === 1
    ? { apple: 214, "us-etf": 545, gold: 2380, billYield: 4.2, "uae-equity": 7.4 * 0.2723, appleEps: 7.4 }
    : { apple: 191, "us-etf": 545, gold: 2295, billYield: 4.2, "uae-equity": 7.4 * 0.2723, appleEps: 7.9 };
}

export interface FixtureRunOptions {
  day: 1 | 2;
  previousReport?: EngineReport | null;
  journalHistory?: DecisionJournalEntry[];
  /** Simulates a provider outage to exercise partial_success. */
  failMacro?: boolean;
  runId?: string;
}

export async function runFixtureCycle(options: FixtureRunOptions): Promise<DailyCycleResult> {
  const { day, previousReport = null, journalHistory = [], failMacro = false } = options;
  const now = day === 1 ? FIXTURE_DAY_1 : FIXTURE_DAY_2;
  return runDailyMorpheusCycle({
    runId: options.runId ?? `fixture-day-${day}`,
    now,
    adapters: fixtureAdapters(day, failMacro),
    context: FIXTURE_CONTEXT,
    valuationConfig: fixtureValuationConfig(fixturePrices(day)),
    fxTable: FIXTURE_FX,
    baseCurrency: "USD",
    journalHistory,
    previousReport,
  });
}

/** Unused today but kept for the price-extraction path in real adapters. */
export { priceFrom };
