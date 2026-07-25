import { computeRawChecksum } from "@/intelligence/ingestion/ingest";
import type { RawAssetIdentifier, RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import { deriveAll, derivedFactorRecords } from "@/server/valuation/derived-factors";
import { readFundamentalsFromPairs } from "@/server/valuation/from-filings";
import {
  ANNUAL_FORMS,
  EDGAR_CONCEPTS,
  type EdgarConceptSpec,
} from "@/server/providers/sec-edgar/concepts";
import {
  filingUrl,
  padCik,
  type CompanyFacts,
  type EdgarFactPoint,
  type Submissions,
} from "@/server/providers/sec-edgar/types";

/**
 * EDGAR responses → raw evidence records.
 *
 * The mapper's job is translation, not judgement. It computes no ratios,
 * derives no scores, and discards nothing it does not explicitly explain. Every
 * record it emits carries the accession number and a URL to the filing the
 * number came from, so any figure NeoOS shows can be checked against the
 * original document in two clicks.
 *
 * Where EDGAR is ambiguous the mapper prefers saying less. A concept with no
 * usable tag produces a warning and no record, never a guess or a zero.
 */

export const SEC_EDGAR_ADAPTER_VERSION = "1.0.0";

/** How many annual periods to carry, beyond the latest, for the growth trend. */
export const ANNUAL_HISTORY_PERIODS = 4;

/**
 * How long an annual figure stays authoritative, measured from its period end.
 *
 * A 10-K covers a fiscal year and the next one is due roughly two to three
 * months after the following year end, so about fifteen months separates one
 * set of annual accounts from its replacement. Past that with nothing newer,
 * the issuer is delinquent or no longer reporting, and the figures should
 * expire.
 *
 * This is stated explicitly because the engine's per-tier freshness horizon
 * assumes quarterly reporting. Without it, annual accounts are treated as
 * expired for most of every year and no company can be valued from its filings.
 */
export const ANNUAL_FACT_AUTHORITATIVE_DAYS = 455;

export interface MappedFacts {
  records: RawEvidenceRecord[];
  warnings: string[];
  /** Which XBRL tag was actually used per concept — tagging changes stay visible. */
  tagsUsed: Record<string, string>;
}

interface SelectedConcept {
  spec: EdgarConceptSpec;
  tag: string;
  points: EdgarFactPoint[];
}

/**
 * Choose the first candidate tag that actually has facts in the expected unit.
 *
 * Preference order matters: a filer may carry a legacy tag with stale values
 * alongside the current one, and taking the newest tag first avoids reporting
 * a figure the company stopped maintaining.
 */
function selectConcept(facts: CompanyFacts, spec: EdgarConceptSpec): SelectedConcept | null {
  const taxonomy = facts.facts[spec.taxonomy];
  if (!taxonomy) return null;
  for (const tag of spec.candidates) {
    const concept = taxonomy[tag];
    const points = concept?.units?.[spec.unit];
    if (points && points.length > 0) return { spec, tag, points };
  }
  return null;
}

/**
 * Reduce a concept's fact points to one value per period.
 *
 * EDGAR repeats the same period across every filing that restated it, so the
 * same fiscal year can appear five times with three different values. The
 * latest-filed wins: that is the company's current position on its own past,
 * and using anything else means reporting a figure the company has since
 * corrected.
 */
function latestPerPeriod(points: EdgarFactPoint[], periodType: "duration" | "instant"): EdgarFactPoint[] {
  const byPeriod = new Map<string, EdgarFactPoint>();
  for (const point of points) {
    const key = periodType === "duration" ? `${point.start ?? ""}|${point.end}` : point.end;
    const existing = byPeriod.get(key);
    if (!existing || point.filed > existing.filed) byPeriod.set(key, point);
  }
  return [...byPeriod.values()].sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0));
}

/**
 * Keep only full-year periods.
 *
 * A 10-K carries both the annual figure and quarterly comparatives, and they
 * are indistinguishable by form alone. Duration concepts are filtered by actual
 * elapsed days — 300 to 400 admits a fiscal year of any shape while excluding
 * a quarter — because trusting the `fp` field alone silently mixes Q4 into an
 * annual series.
 */
function annualOnly(points: EdgarFactPoint[], periodType: "duration" | "instant"): EdgarFactPoint[] {
  return points.filter((point) => {
    if (!ANNUAL_FORMS.has(point.form)) return false;
    if (periodType === "instant") return true;
    if (!point.start) return false;
    const days = (Date.parse(point.end) - Date.parse(point.start)) / 86_400_000;
    return days >= 300 && days <= 400;
  });
}

function recordId(cik: string, key: string, end: string): string {
  return `sec-edgar-${padCik(cik)}-${key}-${end}`;
}

export interface MapOptions {
  /** Canonical asset the caller is fetching for. Used only for identifiers. */
  ticker: string | null;
  exchange: string | null;
  retrievedAt: string;
  /** `last-modified` from EDGAR, used when a fact has no filing date. */
  responseLastModified: string | null;
}

/**
 * Derived factor scores, appended to the mapped records.
 *
 * Kept here rather than in a later stage because they are provider evidence
 * like any other and must travel the same road: identity resolution,
 * normalization, validation, conflict detection. A score injected downstream
 * would bypass all of it.
 *
 * They are computed from the records this mapper just produced, and every one
 * cites the filing and the record ids behind it.
 */
function appendDerivedFactors(
  records: RawEvidenceRecord[],
  facts: CompanyFacts,
  options: MapOptions,
  identifiers: RawAssetIdentifier[],
): { records: RawEvidenceRecord[]; warnings: string[] } {
  const asEvidence = records
    .filter((r) => r.rawValue !== null && typeof r.payloadMetadata.claimKey === "string")
    .map((r) => ({
      claimKey: r.payloadMetadata.claimKey as string,
      normalizedValue: r.rawValue,
      evidenceId: r.rawEvidenceId,
      unit: r.rawUnit,
    }));

  const fundamentals = readFundamentalsFromPairs(asEvidence);
  const derived = deriveAll(fundamentals);
  if (derived.length === 0) {
    return { records: [], warnings: ["No factor score could be derived from the filed accounts."] };
  }

  const latest = records.find((r) => r.payloadMetadata.isLatestAnnual === true) ?? records[0];
  const periodEnd = fundamentals.latestPeriodEnd ?? "unknown";
  return {
    records: derivedFactorRecords(derived, {
      assetIdentifiers: identifiers,
      sourceRef: latest?.sourceRef ?? `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${padCik(facts.cik)}`,
      publishedAt: latest?.publishedAt ?? null,
      retrievedAt: options.retrievedAt,
      periodEnd,
      expiresAt: expiryFor(periodEnd),
      sourceEvidenceIds: fundamentals.evidenceIds,
      cik: padCik(facts.cik),
      entityName: facts.entityName,
    }),
    warnings: [],
  };
}

export function mapCompanyFacts(
  facts: CompanyFacts,
  options: MapOptions,
): MappedFacts {
  const cik = padCik(facts.cik);
  const records: RawEvidenceRecord[] = [];
  const warnings: string[] = [];
  const tagsUsed: Record<string, string> = {};

  const identifiers = [
    { scheme: "provider_id" as const, value: `SEC-CIK-${cik}` },
    ...(options.ticker ? [{ scheme: "ticker" as const, value: options.ticker }] : []),
    ...(options.exchange ? [{ scheme: "exchange" as const, value: options.exchange }] : []),
    { scheme: "name" as const, value: facts.entityName },
  ];

  for (const spec of EDGAR_CONCEPTS) {
    const selected = selectConcept(facts, spec);
    if (!selected) {
      warnings.push(
        `No usable ${spec.taxonomy} tag for ${spec.label} (tried ${spec.candidates.join(", ")} in ${spec.unit}). No record emitted.`,
      );
      continue;
    }
    tagsUsed[spec.key] = selected.tag;

    const annual = annualOnly(latestPerPeriod(selected.points, spec.periodType), spec.periodType);
    if (annual.length === 0) {
      warnings.push(
        `${spec.label} is tagged as ${selected.tag} but has no annual-report values. No record emitted.`,
      );
      continue;
    }

    const kept = annual.slice(0, ANNUAL_HISTORY_PERIODS + 1);
    for (const [index, point] of kept.entries()) {
      const isLatest = index === 0;
      const base = {
        rawEvidenceId: recordId(cik, spec.key, point.end),
        providerId: "sec-edgar",
        providerMode: "live" as const,
        providerRecordId: `${selected.tag}:${point.accn}:${point.end}`,
        retrievedAt: options.retrievedAt,
        // The filing acceptance date is when this became public knowledge.
        publishedAt: toIsoDate(point.filed) ?? options.responseLastModified,
        sourceRef: filingUrl(cik, point.accn, "").replace(/\/$/, ""),
        rawTitle: `${facts.entityName} — ${spec.label}${
          point.start ? ` for ${point.start} to ${point.end}` : ` as of ${point.end}`
        } (${point.form})`,
        rawText: null,
        rawPayload: {
          taxonomy: spec.taxonomy,
          tag: selected.tag,
          edgarUnit: spec.unit,
          accessionNumber: point.accn,
          form: point.form,
          fiscalYear: point.fy ?? null,
          fiscalPeriod: point.fp ?? null,
          periodStart: point.start ?? null,
          periodEnd: point.end,
          filed: point.filed,
          frame: point.frame ?? null,
        },
        assetIdentifiers: identifiers,
        evidenceCategory: "fundamental" as const,
        rawValue: point.val,
        // The VALUE is preserved exactly as EDGAR states it — no conversion
        // happens here. Only the unit's NAME is translated into the pipeline's
        // vocabulary, because the normalizer rejects any unit outside its
        // canonical set, and rightly so. EDGAR's own string is kept on the
        // payload above (`edgarUnit`) so the original label survives an audit.
        rawUnit: spec.canonicalUnit,
        rawCurrency: spec.unit.startsWith("USD") ? "USD" : null,
        geographicScope: null,
        // EDGAR states no confidence; inventing one would be fabrication.
        rawConfidence: null,
        ingestionStatus: "ingested" as const,
        parsingWarnings: [],
        payloadMetadata: {
          conceptKey: spec.key,
          factorHint: spec.factorHint,
          purpose: spec.purpose,
          claimKey: `${spec.key}:${point.end}`,
          isLatestAnnual: isLatest,
          // Stated because this figure's cadence is annual, not quarterly.
          expiresAt: expiryFor(point.end),
          sourceName: "U.S. Securities and Exchange Commission — EDGAR",
          adapterVersion: SEC_EDGAR_ADAPTER_VERSION,
        },
        supersedesRawEvidenceId: null,
      };
      records.push({ ...base, checksum: computeRawChecksum(base) });
    }
  }

  const derived = appendDerivedFactors(records, facts, options, identifiers);
  records.push(...derived.records);
  warnings.push(...derived.warnings);

  return { records, warnings, tagsUsed };
}

/**
 * Map the submissions feed to filing-level evidence.
 *
 * These records carry no value. They exist so the report can state, with a
 * citation, when the company last filed — which is what the engine's freshness
 * check on official filings actually measures.
 */
export function mapSubmissions(
  submissions: Submissions,
  options: MapOptions & { limit?: number },
): MappedFacts {
  const cik = padCik(submissions.cik);
  const recent = submissions.filings.recent;
  const columns = [
    recent.accessionNumber,
    recent.filingDate,
    recent.reportDate,
    recent.form,
    recent.primaryDocument,
  ];
  const warnings: string[] = [];

  // Column-wise storage means a length mismatch would silently pair the wrong
  // form with the wrong date. That is a corrupt response, not a partial one.
  const lengths = new Set(columns.map((c) => c.length));
  if (lengths.size > 1) {
    return {
      records: [],
      warnings: [
        `EDGAR submissions columns disagree in length (${columns.map((c) => c.length).join("/")}). Refusing to pair filings with dates.`,
      ],
      tagsUsed: {},
    };
  }

  const identifiers = [
    { scheme: "provider_id" as const, value: `SEC-CIK-${cik}` },
    ...(submissions.tickers[0] ? [{ scheme: "ticker" as const, value: submissions.tickers[0] }] : []),
    { scheme: "name" as const, value: submissions.name },
  ];

  const limit = options.limit ?? 8;
  const records: RawEvidenceRecord[] = [];

  for (let i = 0; i < recent.accessionNumber.length && records.length < limit; i++) {
    const accn = recent.accessionNumber[i];
    const form = recent.form[i];
    const filingDate = recent.filingDate[i];
    const reportDate = recent.reportDate[i];
    const document = recent.primaryDocument[i];
    // Equal column lengths were already established above; this narrows types
    // and would catch a sparse array, which JSON can technically produce.
    if (
      accn === undefined ||
      form === undefined ||
      filingDate === undefined ||
      reportDate === undefined ||
      document === undefined
    ) {
      warnings.push(`EDGAR submissions row ${i} is incomplete. Skipped.`);
      continue;
    }
    if (!ANNUAL_FORMS.has(form) && form !== "10-Q" && form !== "8-K") continue;

    const base = {
      rawEvidenceId: `sec-edgar-${cik}-filing-${accn}`,
      providerId: "sec-edgar",
      providerMode: "live" as const,
      providerRecordId: accn,
      retrievedAt: options.retrievedAt,
      publishedAt: toIsoDate(filingDate) ?? options.responseLastModified,
      sourceRef: filingUrl(cik, accn, document),
      rawTitle: `${submissions.name} — ${form} filed ${filingDate}`,
      rawText: recent.primaryDocDescription?.[i] ?? null,
      rawPayload: {
        accessionNumber: accn,
        form,
        filingDate,
        reportDate,
        primaryDocument: document,
      },
      assetIdentifiers: identifiers,
      evidenceCategory: "filing" as const,
      rawValue: null,
      rawUnit: null,
      rawCurrency: null,
      geographicScope: "US",
      rawConfidence: null,
      ingestionStatus: "ingested" as const,
      parsingWarnings: [],
      payloadMetadata: {
        factorHint: "governance",
        purpose: "Disclosure recency and continuity",
        claimKey: `filing:${form}:${reportDate || filingDate}`,
        sourceName: "U.S. Securities and Exchange Commission — EDGAR",
        adapterVersion: SEC_EDGAR_ADAPTER_VERSION,
      },
      supersedesRawEvidenceId: null,
    };
    records.push({ ...base, checksum: computeRawChecksum(base) });
  }

  if (records.length === 0) {
    warnings.push("EDGAR returned no periodic filings for this issuer in the recent window.");
  }
  return { records, warnings, tagsUsed: {} };
}

/** When an annual figure with this period end stops being authoritative. */
function expiryFor(periodEnd: string): string | null {
  const end = Date.parse(periodEnd);
  if (Number.isNaN(end)) return null;
  return new Date(end + ANNUAL_FACT_AUTHORITATIVE_DAYS * 86_400_000).toISOString();
}

/** EDGAR dates are `YYYY-MM-DD`. Anything else is left for the caller to notice. */
function toIsoDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${value}T00:00:00Z`;
}
