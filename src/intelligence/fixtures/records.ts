import { computeRawChecksum } from "@/intelligence/ingestion/ingest";
import type {
  EvidenceCategory,
  RawAssetIdentifier,
  RawEvidenceRecord,
} from "@/intelligence/types/raw-evidence";

/**
 * Fixture source records for the six-asset proof universe.
 *
 * These are ILLUSTRATIVE records, not market data. Every one is stamped
 * `fixture` and is labelled "Fixture intelligence" everywhere it surfaces.
 *
 * The set deliberately contains the awkward cases the pipeline exists to
 * handle: a stale record, an exact duplicate, an unresolvable identity, a
 * conflict resolved by source tier, an unresolved peer conflict, and an
 * evidence-poor asset.
 */

export const FIXTURE_DAY_1 = "2026-07-24T06:30:00Z";
export const FIXTURE_DAY_2 = "2026-07-25T06:30:00Z";

let seq = 0;

interface RecordSpec {
  provider: string;
  identifiers: RawAssetIdentifier[];
  category: EvidenceCategory;
  title: string;
  value: number | null;
  unit: string | null;
  currency?: string | null;
  factorHint?: string;
  claimKey?: string;
  confidence?: number;
  /** Days before the run timestamp this was published. */
  ageDays: number;
  notes?: string;
  sourceRef: string;
  sourceName: string;
  /** Force a specific id, for duplicate fixtures. */
  id?: string;
}

function record(spec: RecordSpec, asOf: string): RawEvidenceRecord {
  seq += 1;
  const published = new Date(new Date(asOf).getTime() - spec.ageDays * 86_400_000).toISOString();
  const base = {
    rawEvidenceId: spec.id ?? `fx-${String(seq).padStart(3, "0")}`,
    providerId: spec.provider,
    providerMode: "fixture" as const,
    providerRecordId: `${spec.provider}-${seq}`,
    retrievedAt: asOf,
    publishedAt: published,
    sourceRef: spec.sourceRef,
    rawTitle: spec.title,
    rawText: null,
    rawPayload: null,
    assetIdentifiers: spec.identifiers,
    evidenceCategory: spec.category,
    rawValue: spec.value,
    rawUnit: spec.unit,
    rawCurrency: spec.currency ?? null,
    geographicScope: null,
    rawConfidence: spec.confidence ?? null,
    ingestionStatus: "ingested" as const,
    parsingWarnings: [],
    payloadMetadata: {
      sourceName: spec.sourceName,
      ...(spec.factorHint ? { factorHint: spec.factorHint } : {}),
      ...(spec.claimKey ? { claimKey: spec.claimKey } : {}),
      ...(spec.notes ? { notes: spec.notes } : {}),
    },
    supersedesRawEvidenceId: null,
  };
  return { ...base, checksum: computeRawChecksum(base) };
}

const ticker = (value: string): RawAssetIdentifier => ({ scheme: "ticker", value });
const exchange = (value: string): RawAssetIdentifier => ({ scheme: "exchange", value });
const name = (value: string): RawAssetIdentifier => ({ scheme: "name", value });
const commodity = (value: string): RawAssetIdentifier => ({ scheme: "commodity", value });
const category = (value: string): RawAssetIdentifier => ({ scheme: "category", value });

/** Official-filing style provider: tier 1 issuer disclosures. */
export function filingsProviderRecords(asOf: string, day: 1 | 2): RawEvidenceRecord[] {
  const records: RawEvidenceRecord[] = [
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("AAPL"), exchange("NASDAQ")],
        category: "filing",
        title: "Net cash position; operating cash flow covers capex several times over",
        value: 92,
        unit: "score",
        factorHint: "financialStrength",
        confidence: 95,
        ageDays: 38,
        sourceRef: "fixture://filings/aapl-10q-2026q3",
        sourceName: "Issuer quarterly report (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("AAPL"), exchange("NASDAQ")],
        category: "filing",
        title: "Installed base and services attach rate continue to compound",
        value: 91,
        unit: "score",
        factorHint: "businessQuality",
        confidence: 92,
        ageDays: 115,
        sourceRef: "fixture://filings/aapl-10k-2025",
        sourceName: "Issuer annual report (fixture)",
      },
      asOf,
    ),
    // Half of an UNRESOLVED conflict: two sources of comparable authority
    // (tier 1 and tier 2) disagreeing on the same claim. The hierarchy cannot
    // settle it, so it stays unresolved and caps conviction.
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("AAPL"), exchange("NASDAQ")],
        category: "filing",
        title: "Services segment growth rate",
        value: 78,
        unit: "score",
        factorHint: "growth",
        claimKey: "aapl-services-growth",
        confidence: 90,
        ageDays: 38,
        sourceRef: "fixture://filings/aapl-services-segment",
        sourceName: "Issuer quarterly report (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("AAPL"), exchange("NASDAQ")],
        category: "filing",
        title: "Independent board majority; no unresolved audit findings",
        value: 84,
        unit: "score",
        factorHint: "governance",
        confidence: 90,
        ageDays: 100,
        sourceRef: "fixture://filings/aapl-proxy-2026",
        sourceName: "Proxy statement (fixture)",
      },
      asOf,
    ),
    // Conflict pair, resolved by source tier: a tier-1 filing versus a tier-5
    // news item on the same claim about SPY constituent leverage.
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("SPY"), exchange("NYSE Arca")],
        category: "filing",
        title: "Aggregate constituent interest cover",
        value: 80,
        unit: "score",
        factorHint: "financialStrength",
        claimKey: "spy-aggregate-leverage",
        confidence: 89,
        ageDays: 55,
        sourceRef: "fixture://filings/sp-aggregate-2026q2",
        sourceName: "Aggregated constituent filings (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("SPY"), exchange("NYSE Arca")],
        category: "filing",
        title: "Index-level return on capital above long-run average",
        value: 84,
        unit: "score",
        factorHint: "businessQuality",
        confidence: 88,
        ageDays: 45,
        sourceRef: "fixture://filings/roc-2026",
        sourceName: "Aggregated constituent filings (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("SPY"), exchange("NYSE Arca")],
        category: "filing",
        title: "Unit investment trust structure, transparent and deeply liquid",
        value: 88,
        unit: "score",
        factorHint: "governance",
        confidence: 92,
        ageDays: 80,
        sourceRef: "fixture://filings/spy-prospectus",
        sourceName: "Fund prospectus (fixture)",
      },
      asOf,
    ),
    // STALE record: an official filing well past its 120-day horizon.
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("UAEUTIL"), exchange("ADX")],
        category: "filing",
        title: "Regulated asset base and tariff framework (superseded filing period)",
        value: 71,
        unit: "score",
        factorHint: "financialStrength",
        confidence: 80,
        ageDays: 210,
        sourceRef: "fixture://filings/uaeutil-annual-2025",
        sourceName: "UAE issuer annual report (fixture)",
        notes: "Deliberately stale: past the official-filing freshness horizon.",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-filings",
        identifiers: [ticker("UAEUTIL"), exchange("ADX")],
        category: "filing",
        title: "Regulated utility governance and disclosure standards",
        value: 76,
        unit: "score",
        factorHint: "governance",
        confidence: 82,
        ageDays: 60,
        sourceRef: "fixture://filings/uaeutil-governance-2026",
        sourceName: "UAE issuer disclosure (fixture)",
      },
      asOf,
    ),
  ];

  if (day === 2) {
    // Day 2 adds a materially better valuation input for Apple, which is what
    // makes the report diff non-trivial.
    records.push(
      record(
        {
          provider: "fixture-filings",
          identifiers: [ticker("AAPL"), exchange("NASDAQ")],
          category: "fundamental",
          title: "Trailing earnings per share, restated for the current period",
          value: 7.9,
          unit: "currency_per_share",
          currency: "USD",
          confidence: 94,
          ageDays: 1,
          sourceRef: "fixture://filings/aapl-eps-restated",
          sourceName: "Issuer quarterly report (fixture)",
          claimKey: "aapl-eps",
        },
        asOf,
      ),
    );
  }

  return records;
}

/** Market-data style provider: tier 2 prices and reference data. */
export function marketProviderRecords(asOf: string, day: 1 | 2): RawEvidenceRecord[] {
  const applePrice = day === 1 ? 214 : 191;
  const records: RawEvidenceRecord[] = [
    record(
      {
        provider: "fixture-market",
        identifiers: [ticker("AAPL"), exchange("NASDAQ")],
        category: "price",
        title: "Closing price",
        value: applePrice,
        unit: "currency_per_share",
        currency: "USD",
        confidence: 96,
        ageDays: 0,
        sourceRef: "fixture://market/aapl-close",
        sourceName: "Consolidated tape (fixture)",
        claimKey: "aapl-price",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [ticker("AAPL"), exchange("NASDAQ")],
        category: "price",
        title: "Trading in the upper half of the 52-week range",
        value: 52,
        unit: "score",
        factorHint: "technical",
        confidence: 88,
        ageDays: 0,
        sourceRef: "fixture://market/aapl-range",
        sourceName: "Consolidated tape (fixture)",
      },
      asOf,
    ),
    // The other half of the unresolved conflict: a tier-2 source materially
    // disagreeing with the tier-1 filing on services growth.
    record(
      {
        provider: "fixture-market",
        identifiers: [ticker("AAPL"), exchange("NASDAQ")],
        category: "reference",
        title: "Services segment growth rate (vendor estimate)",
        value: 46,
        unit: "score",
        factorHint: "growth",
        claimKey: "aapl-services-growth",
        confidence: 84,
        ageDays: 2,
        sourceRef: "fixture://market/aapl-services-estimate",
        sourceName: "Vendor fundamentals (fixture)",
        notes: "Materially disagrees with the issuer filing on the same claim.",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [ticker("SPY"), exchange("NYSE Arca")],
        category: "price",
        title: "Closing price",
        value: 545,
        unit: "currency_per_share",
        currency: "USD",
        confidence: 96,
        ageDays: 0,
        sourceRef: "fixture://market/spy-close",
        sourceName: "Consolidated tape (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [ticker("SPY"), exchange("NYSE Arca")],
        category: "price",
        title: "Near all-time highs; breadth narrow",
        value: 48,
        unit: "score",
        factorHint: "technical",
        confidence: 88,
        ageDays: 0,
        sourceRef: "fixture://market/spy-breadth",
        sourceName: "Consolidated tape (fixture)",
      },
      asOf,
    ),
    // The tier-5 half of the resolved conflict: a news source disagreeing with
    // the tier-1 filing about the same claim. Preserved, ranked, penalised.
    record(
      {
        provider: "fixture-market",
        identifiers: [ticker("SPY"), exchange("NYSE Arca")],
        category: "news",
        title: "Commentary: aggregate constituent leverage materially worse than filings imply",
        value: 52,
        unit: "score",
        factorHint: "financialStrength",
        claimKey: "spy-aggregate-leverage",
        confidence: 58,
        ageDays: 4,
        sourceRef: "fixture://news/spy-leverage-commentary",
        sourceName: "Financial press (fixture)",
        notes: "Disagrees with the aggregated filings on the same claim.",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [commodity("XAU")],
        category: "price",
        title: "London spot gold, USD per troy ounce",
        value: day === 1 ? 2380 : 2295,
        unit: "currency_per_troy_ounce",
        currency: "USD",
        confidence: 95,
        ageDays: 0,
        sourceRef: "fixture://market/xauusd",
        sourceName: "Spot market (fixture)",
        claimKey: "gold-price",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [commodity("XAU")],
        category: "reference",
        title: "Central bank net purchases remain structurally positive",
        value: 86,
        unit: "score",
        factorHint: "financialStrength",
        confidence: 90,
        ageDays: 4,
        sourceRef: "fixture://market/cb-reserves",
        sourceName: "Reserve statistics (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [commodity("XAU")],
        category: "reference",
        title: "Monetary role durable across regimes",
        value: 88,
        unit: "score",
        factorHint: "businessQuality",
        confidence: 84,
        ageDays: 3,
        sourceRef: "fixture://market/gold-monetary-role",
        sourceName: "Reserve statistics (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [commodity("XAU")],
        category: "reference",
        title: "Allocated custody with audited bar lists",
        value: 82,
        unit: "score",
        factorHint: "governance",
        confidence: 86,
        ageDays: 2,
        sourceRef: "fixture://market/gold-custody",
        sourceName: "Custody standards (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [name("short-duration government bills")],
        category: "price",
        title: "Three-month bill yield",
        value: 4.2,
        unit: "percent",
        confidence: 94,
        ageDays: 0,
        sourceRef: "fixture://market/usgg3m",
        sourceName: "Government bill curve (fixture)",
        claimKey: "bill-yield",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [name("t-bills")],
        category: "reference",
        title: "Sovereign issuer, full faith and credit",
        value: 98,
        unit: "score",
        factorHint: "financialStrength",
        confidence: 96,
        ageDays: 1,
        sourceRef: "fixture://market/bills-credit",
        sourceName: "Government bill curve (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [name("money market fund")],
        category: "reference",
        title: "Deep, liquid, daily-priced instrument",
        value: 92,
        unit: "score",
        factorHint: "businessQuality",
        confidence: 93,
        ageDays: 1,
        sourceRef: "fixture://market/mmf-liquidity",
        sourceName: "Money market survey (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [name("government bills")],
        category: "reference",
        title: "Statutory issuance governance and full disclosure",
        value: 95,
        unit: "score",
        factorHint: "governance",
        confidence: 92,
        ageDays: 2,
        sourceRef: "fixture://market/bills-governance",
        sourceName: "Government bill curve (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [ticker("UAEUTIL"), exchange("ADX")],
        category: "price",
        title: "Closing price",
        value: 7.4,
        unit: "currency_per_share",
        currency: "AED",
        confidence: 92,
        ageDays: 0,
        sourceRef: "fixture://market/uaeutil-close",
        sourceName: "ADX tape (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-market",
        identifiers: [ticker("UAEUTIL"), exchange("ADX")],
        category: "reference",
        title: "Defensive regulated cash flows within the utilities sleeve",
        value: 78,
        unit: "score",
        factorHint: "portfolioFit",
        confidence: 84,
        ageDays: 5,
        sourceRef: "fixture://market/uaeutil-fit",
        sourceName: "ADX reference data (fixture)",
      },
      asOf,
    ),
    // UNRESOLVABLE IDENTITY: "S&P 500 ETF" without a provider identifier.
    // Many funds track that index, so this must stay ambiguous.
    record(
      {
        provider: "fixture-market",
        identifiers: [name("S&P 500 ETF")],
        category: "price",
        title: "Quote for an S&P 500 tracking fund (issuer not specified)",
        value: 544,
        unit: "currency_per_share",
        currency: "USD",
        confidence: 70,
        ageDays: 0,
        sourceRef: "fixture://market/ambiguous-sp500",
        sourceName: "Aggregator feed (fixture)",
        notes: "Deliberately ambiguous: no exchange, no issuer, no identifier.",
      },
      asOf,
    ),
    // The same phrase as a category label, which is how an aggregator usually
    // supplies it. It resolves below the confidence floor: ambiguous, not SPY.
    record(
      {
        provider: "fixture-market",
        identifiers: [category("s&p 500 etf")],
        category: "reference",
        title: "Tracking-fund cohort reference quote (issuer not specified)",
        value: 61,
        unit: "score",
        factorHint: "technical",
        confidence: 60,
        ageDays: 1,
        sourceRef: "fixture://market/ambiguous-sp500-category",
        sourceName: "Aggregator feed (fixture)",
        notes: "Category label only: must not resolve to a specific instrument.",
      },
      asOf,
    ),
    // CATEGORY, NOT INSTRUMENT: must not resolve to a specific ticker.
    record(
      {
        provider: "fixture-market",
        identifiers: [category("developed-market value etf")],
        category: "reference",
        title: "Developed-market value factor cohort trading below long-run book value",
        value: 71,
        unit: "score",
        factorHint: "businessQuality",
        confidence: 74,
        ageDays: 6,
        sourceRef: "fixture://market/value-cohort",
        sourceName: "Factor cohort survey (fixture)",
      },
      asOf,
    ),
  ];

  // DUPLICATE: the same closing price arriving twice in one run.
  const applePriceRecord = records[0]!;
  records.push({ ...applePriceRecord, rawEvidenceId: `${applePriceRecord.rawEvidenceId}-dup` });

  return records;
}

/** Macro provider: tier 4, global scope, no asset identifiers. */
export function macroProviderRecords(asOf: string): RawEvidenceRecord[] {
  return [
    record(
      {
        provider: "fixture-macro",
        identifiers: [],
        category: "macro_indicator",
        title: "Policy rates restrictive but stable; disinflation intact",
        value: 72,
        unit: "score",
        factorHint: "macro",
        confidence: 88,
        ageDays: 9,
        sourceRef: "fixture://macro/policy-2026-07",
        sourceName: "Central bank statement (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-macro",
        identifiers: [],
        category: "macro_indicator",
        title: "Headline inflation 2.6% year over year",
        value: 74,
        unit: "score",
        factorHint: "macro",
        confidence: 92,
        ageDays: 18,
        sourceRef: "fixture://macro/cpi-2026-06",
        sourceName: "Statistics office release (fixture)",
      },
      asOf,
    ),
    record(
      {
        provider: "fixture-macro",
        identifiers: [],
        category: "macro_indicator",
        title: "Growth holding; labour market cooling without breaking",
        value: 68,
        unit: "score",
        factorHint: "macro",
        confidence: 76,
        ageDays: 26,
        sourceRef: "fixture://macro/outlook-q3",
        sourceName: "Macro research desk (fixture)",
      },
      asOf,
    ),
  ];
}

export function resetFixtureSequence(): void {
  seq = 0;
}
