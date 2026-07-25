/**
 * The XBRL concepts NeoOS extracts from EDGAR, and which scoring factor each
 * one informs.
 *
 * Two things make this list the shape it is.
 *
 * First, filers tag the same economic quantity differently and change tags
 * between years — revenue alone has moved across three us-gaap tags in recent
 * taxonomies. Each concept therefore lists candidate tags in preference order,
 * and the first one with usable facts wins. The tag actually used is recorded
 * on the evidence record, so a change in tagging is visible rather than silent.
 *
 * Second, the list is deliberately short. These are the inputs the engine's
 * valuation and financial-strength factors actually consume. Pulling every
 * concept in a company's facts file would be thousands of series of which the
 * engine reads none, and evidence nobody uses is noise that dilutes an audit.
 */

export type PeriodType = "duration" | "instant";

export interface EdgarConceptSpec {
  /** Stable NeoOS key. Never changes even when the underlying tag does. */
  key: string;
  label: string;
  taxonomy: "us-gaap" | "dei";
  /** Candidate XBRL tags, most preferred first. */
  candidates: string[];
  /** Unit key inside the concept's `units` map. */
  unit: string;
  periodType: PeriodType;
  /** Scoring factor this measure informs. */
  factorHint:
    | "valuation"
    | "financialStrength"
    | "businessQuality"
    | "growth";
  /** Why the engine wants it — surfaced in the evidence record's title. */
  purpose: string;
}

export const EDGAR_CONCEPTS: EdgarConceptSpec[] = [
  {
    key: "revenue",
    label: "Revenue",
    taxonomy: "us-gaap",
    candidates: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
    ],
    unit: "USD",
    periodType: "duration",
    factorHint: "growth",
    purpose: "Top-line scale and growth trend",
  },
  {
    key: "netIncome",
    label: "Net income",
    taxonomy: "us-gaap",
    candidates: ["NetIncomeLoss", "ProfitLoss"],
    unit: "USD",
    periodType: "duration",
    factorHint: "valuation",
    purpose: "Earnings base for earnings-power valuation",
  },
  {
    key: "epsDiluted",
    label: "Diluted earnings per share",
    taxonomy: "us-gaap",
    candidates: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
    unit: "USD/shares",
    periodType: "duration",
    factorHint: "valuation",
    purpose: "Per-share earnings for multiple-based valuation",
  },
  {
    key: "operatingCashFlow",
    label: "Net cash from operating activities",
    taxonomy: "us-gaap",
    candidates: [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
    unit: "USD",
    periodType: "duration",
    factorHint: "valuation",
    purpose: "Cash generation, and the base for free cash flow",
  },
  {
    key: "capitalExpenditure",
    label: "Capital expenditure",
    taxonomy: "us-gaap",
    candidates: [
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
    ],
    unit: "USD",
    periodType: "duration",
    factorHint: "valuation",
    purpose: "Subtracted from operating cash flow to reach free cash flow",
  },
  {
    key: "stockholdersEquity",
    label: "Stockholders' equity",
    taxonomy: "us-gaap",
    candidates: [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    unit: "USD",
    periodType: "instant",
    factorHint: "valuation",
    purpose: "Book value for asset-based valuation and return on equity",
  },
  {
    key: "assets",
    label: "Total assets",
    taxonomy: "us-gaap",
    candidates: ["Assets"],
    unit: "USD",
    periodType: "instant",
    factorHint: "financialStrength",
    purpose: "Balance-sheet size and leverage denominator",
  },
  {
    key: "liabilities",
    label: "Total liabilities",
    taxonomy: "us-gaap",
    candidates: ["Liabilities"],
    unit: "USD",
    periodType: "instant",
    factorHint: "financialStrength",
    purpose: "Leverage numerator",
  },
  {
    key: "assetsCurrent",
    label: "Current assets",
    taxonomy: "us-gaap",
    candidates: ["AssetsCurrent"],
    unit: "USD",
    periodType: "instant",
    factorHint: "financialStrength",
    purpose: "Liquidity — current ratio numerator",
  },
  {
    key: "liabilitiesCurrent",
    label: "Current liabilities",
    taxonomy: "us-gaap",
    candidates: ["LiabilitiesCurrent"],
    unit: "USD",
    periodType: "instant",
    factorHint: "financialStrength",
    purpose: "Liquidity — current ratio denominator",
  },
  {
    key: "cashAndEquivalents",
    label: "Cash and cash equivalents",
    taxonomy: "us-gaap",
    candidates: [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    ],
    unit: "USD",
    periodType: "instant",
    factorHint: "financialStrength",
    purpose: "Net debt calculation and downside cushion",
  },
  {
    key: "longTermDebt",
    label: "Long-term debt",
    taxonomy: "us-gaap",
    candidates: ["LongTermDebtNoncurrent", "LongTermDebt"],
    unit: "USD",
    periodType: "instant",
    factorHint: "financialStrength",
    purpose: "Structural leverage",
  },
  {
    key: "sharesOutstanding",
    label: "Shares outstanding",
    taxonomy: "dei",
    candidates: ["EntityCommonStockSharesOutstanding"],
    unit: "shares",
    periodType: "instant",
    factorHint: "valuation",
    purpose: "Converts company-level figures to per-share terms",
  },
  {
    key: "dilutedShares",
    label: "Weighted average diluted shares",
    taxonomy: "us-gaap",
    candidates: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    unit: "shares",
    periodType: "duration",
    factorHint: "businessQuality",
    purpose: "Dilution trend — whether per-share gains are real",
  },
];

/** Annual report forms. Quarterlies are used only for the growth trend. */
export const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "40-F"]);
export const QUARTERLY_FORMS = new Set(["10-Q", "10-Q/A"]);
