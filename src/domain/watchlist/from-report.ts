import type { EngineReport, EvidenceRecord, ValuationResult } from "@/engine/models";
import type { NeoosAsset } from "@/schemas/neoos-report";
import { classifyQuoteFreshness, type MarketQuote } from "@/server/pricing/quote";
import {
  buildOpportunity,
  type Opportunity,
  type RequiredEvidence,
  type StrongBuyGate,
} from "@/domain/watchlist/opportunity";

/**
 * Turning a report row into an opportunity card, without inventing anything.
 *
 * The temptation here is `valuation.marketPrice`. It is a number, it is in the
 * report, and it renders beautifully. It is also unattributed: nothing in the
 * report contract says where it came from or when it was struck, so displaying
 * it as the current market price would be exactly the failure this work exists
 * to remove.
 *
 * So the rule is: a price is shown only when the report carries a **verified
 * `marketData` evidence record for that asset**, and the price is presented
 * with that record's source name and publication time. Where there is no such
 * record, the card says the price could not be verified and the decision is
 * suspended. That is a worse-looking card and a truer one.
 */

/** The evidence record that entitles a price to be displayed, if there is one. */
export function priceEvidenceFor(
  engine: EngineReport | null,
  assetId: string,
): EvidenceRecord | null {
  if (!engine) return null;
  const candidates = engine.evidence.filter(
    (record) =>
      record.assetId === assetId &&
      record.evidenceType === "marketData" &&
      record.verificationStatus === "verified" &&
      record.sourceName.length > 0 &&
      record.sourceRef.length > 0,
  );
  if (candidates.length === 0) return null;
  // Most recently published wins. Ties broken by retrieval time.
  return [...candidates].sort(
    (a, b) =>
      Date.parse(b.publicationDate) - Date.parse(a.publicationDate) ||
      Date.parse(b.retrievedAt) - Date.parse(a.retrievedAt),
  )[0] ?? null;
}

/**
 * Build a quote from a report price plus its evidence record.
 *
 * Freshness starts at `previous_close` rather than `live`, because a report is
 * generated on a schedule and nothing in it was struck a moment ago. Age is
 * then applied on top, so an old report degrades to `stale` on its own.
 */
export function quoteFromReport(input: {
  assetId: string;
  ticker: string | null;
  assetType: string;
  valuation: ValuationResult | null;
  evidence: EvidenceRecord | null;
  now: Date;
}): MarketQuote | null {
  const price = input.valuation?.marketPrice ?? null;
  const evidence = input.evidence;
  if (price === null || price <= 0 || evidence === null) return null;

  const candidate: MarketQuote = {
    instrumentId: input.assetId,
    symbol: input.ticker ?? input.assetId,
    assetType: input.assetType,
    price,
    currency: input.valuation?.currency ?? "USD",
    quoteTimestamp: evidence.publicationDate,
    retrievedAt: evidence.retrievedAt,
    sourceId: evidence.sourceRef,
    sourceName: evidence.sourceName,
    marketState: "closed",
    freshness: "previous_close",
  };

  return { ...candidate, freshness: classifyQuoteFreshness(candidate, input.now) };
}

/** How current NeoOS's own valuation is, measured from its calculation date. */
export function valuationEvidenceStatus(
  calculationDate: string,
  now: Date,
): "current" | "aging" | "stale" {
  const days = (now.getTime() - Date.parse(calculationDate)) / 86_400_000;
  if (Number.isNaN(days)) return "stale";
  if (days <= 30) return "current";
  if (days <= 90) return "aging";
  return "stale";
}

/**
 * Which of the required evidence items this report actually carries.
 *
 * Read off the evidence records rather than assumed. `external_research` is
 * deliberately hard to satisfy: NeoOS's own analysis is not independent
 * research, so only an `institutionalResearch` record counts.
 */
function evidencePresentFor(
  engine: EngineReport | null,
  assetId: string,
  quote: MarketQuote | null,
  valuation: ValuationResult | null,
): Partial<Record<RequiredEvidence, boolean>> {
  const records = engine?.evidence.filter((r) => r.assetId === assetId || r.assetId === null) ?? [];
  const has = (type: EvidenceRecord["evidenceType"]) =>
    records.some((r) => r.evidenceType === type && r.verificationStatus === "verified");

  return {
    verified_current_price: quote !== null,
    latest_official_filing: has("officialFiling"),
    material_news: has("financialNews"),
    independent_neoos_valuation: valuation !== null && valuation.conservativeValue !== null,
    macro_or_sector_evidence: has("macroIntelligence"),
    external_research: has("institutionalResearch"),
  };
}

/**
 * Which Strong Buy gates the engine's own record shows as passed.
 *
 * Every gate defaults to *not* passed. A gate NeoOS cannot evidence is a gate
 * that failed, because the alternative is a Strong Buy awarded on silence.
 */
function strongBuyGatesFor(
  engine: EngineReport | null,
  assetId: string,
  quote: MarketQuote | null,
  valuation: ValuationResult | null,
  evidence: Partial<Record<RequiredEvidence, boolean>>,
): Partial<Record<StrongBuyGate, boolean>> {
  const rec = engine?.recommendations.find((r) => r.assetId === assetId) ?? null;
  if (!rec || rec.status !== "rated" || rec.vetoes.length > 0) return {};

  const gatesPassed = rec.eligibilityChecks.every((check) => check.passed);
  const mos = valuation?.marginOfSafety ?? null;
  const price = quote?.price ?? null;
  const conservative = valuation?.conservativeValue ?? null;

  return {
    substantial_discount:
      price !== null && conservative !== null && price <= conservative * (1 - 45 / 140),
    meaningful_margin: mos !== null && mos >= 0.3,
    balance_sheet_or_asset_backing: gatesPassed,
    durable_economics: gatesPassed,
    cash_flow_or_liquidation_support: gatesPassed,
    acceptable_downside: rec.downsideCase !== null && rec.downsideCase.length > 0,
    current_official_evidence: evidence.latest_official_filing === true,
    independent_external_research: evidence.external_research === true,
    portfolio_fit: rec.portfolioFit !== null && rec.portfolioFit.length > 0,
    acceptable_concentration: rec.portfolioFit !== null && rec.portfolioFit.length > 0,
  };
}

export interface ReportOpportunity extends Opportunity {
  /** The valuation trace behind Fair Value, for the evidence disclosure. */
  valuationTrace: ValuationResult | null;
}

export function opportunityFromReport(
  asset: NeoosAsset,
  engine: EngineReport | null,
  now: Date = new Date(),
): ReportOpportunity {
  const rec = engine?.recommendations.find((r) => r.assetId === asset.id) ?? null;
  const valuation = rec?.status === "rated" ? rec.valuation : null;
  const evidenceRecord = priceEvidenceFor(engine, asset.id);

  const quote = quoteFromReport({
    assetId: asset.id,
    ticker: asset.ticker ?? null,
    assetType: asset.assetClass ?? "stock",
    valuation,
    evidence: evidenceRecord,
    now,
  });

  const evidencePresent = evidencePresentFor(engine, asset.id, quote, valuation);

  // Fair Value comes from the valuation trace or not at all. `buyBelow` on the
  // report row is a claim without a method, and a claim without a method is not
  // a valuation.
  const conservative = valuation?.conservativeValue ?? null;
  const fairValue =
    valuation !== null && conservative !== null && conservative > 0
      ? {
          value: conservative,
          currency: valuation.currency,
          valuationDate: valuation.calculationDate,
          method: valuation.method,
          modelVersion: valuation.modelVersion,
          keyAssumptions: valuation.assumptions,
          // The engine's own Buy grade, expressed as the margin it demands.
          marginOfSafetyRequired: 35 / 140,
          evidenceStatus: valuationEvidenceStatus(valuation.calculationDate, now),
          externalCrossChecks: [],
        }
      : null;

  const built = buildOpportunity({
    instrumentId: asset.id,
    assetName: asset.name,
    ticker: asset.ticker ?? null,
    quote,
    fairValue,
    strongBuyPassed: strongBuyGatesFor(engine, asset.id, quote, valuation, evidencePresent),
    evidencePresent,
    ownsIt: true,
    avoid:
      rec && rec.vetoes.length > 0
        ? { reason: `Not a price question — ${rec.vetoes[0]}` }
        : null,
  });

  return { ...built, valuationTrace: valuation };
}

/**
 * The watchlist, ranked.
 *
 * Anything NeoOS refuses to decide on sinks to the bottom rather than being
 * dropped: a suspended card is information, and hiding it would let a stale
 * holding quietly disappear from view.
 */
const DECISION_ORDER = ["strong_buy", "buy", "watch", "hold", "avoid", "insufficient_evidence"];

export function rankOpportunities(items: ReportOpportunity[]): ReportOpportunity[] {
  return [...items].sort((a, b) => {
    const byDecision = DECISION_ORDER.indexOf(a.decision) - DECISION_ORDER.indexOf(b.decision);
    if (byDecision !== 0) return byDecision;
    const aDistance = a.distance.distancePercent;
    const bDistance = b.distance.distancePercent;
    if (aDistance === null && bDistance === null) return a.assetName.localeCompare(b.assetName);
    if (aDistance === null) return 1;
    if (bDistance === null) return -1;
    return aDistance - bDistance;
  });
}
