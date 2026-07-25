import { z } from "zod";

/**
 * SEC EDGAR response shapes.
 *
 * These schemas describe the two public endpoints NeoOS uses:
 *
 *   https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
 *   https://data.sec.gov/submissions/CIK##########.json
 *
 * They are validated rather than trusted. EDGAR is a public agency endpoint,
 * not a contracted vendor: it changes without notice, and a shape change must
 * surface as a provider error rather than as silently wrong fundamentals.
 *
 * Everything is `passthrough`-tolerant on unknown keys — new XBRL concepts
 * appear all the time and are not a failure.
 */

/**
 * One reported value of one XBRL concept.
 *
 * `frame` is present only on facts EDGAR has assigned to a calendar frame; its
 * absence is normal and is not a defect.
 */
export const edgarFactPointSchema = z.object({
  /** Period start for duration concepts; absent for instant concepts. */
  start: z.string().optional(),
  /** Period end, or the instant. Always present. */
  end: z.string(),
  val: z.number(),
  /** Accession number of the filing this value came from. The citation. */
  accn: z.string(),
  fy: z.number().nullable().optional(),
  fp: z.string().nullable().optional(),
  form: z.string(),
  /** Date the filing was accepted by EDGAR. */
  filed: z.string(),
  frame: z.string().optional(),
});
export type EdgarFactPoint = z.infer<typeof edgarFactPointSchema>;

export const edgarConceptSchema = z.object({
  label: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  /** Keyed by unit of measure: "USD", "shares", "USD/shares", "pure". */
  units: z.record(z.string(), z.array(edgarFactPointSchema)),
});
export type EdgarConcept = z.infer<typeof edgarConceptSchema>;

export const companyFactsSchema = z.object({
  cik: z.number(),
  entityName: z.string(),
  /** Taxonomy → concept name → concept. Usually "us-gaap" and "dei". */
  facts: z.record(z.string(), z.record(z.string(), edgarConceptSchema)),
});
export type CompanyFacts = z.infer<typeof companyFactsSchema>;

/**
 * The submissions endpoint. EDGAR stores recent filings column-wise — parallel
 * arrays rather than an array of objects — so the mapper zips them back into
 * records and refuses any response where the columns disagree in length.
 */
export const recentFilingsSchema = z.object({
  accessionNumber: z.array(z.string()),
  filingDate: z.array(z.string()),
  reportDate: z.array(z.string()),
  form: z.array(z.string()),
  primaryDocument: z.array(z.string()),
  primaryDocDescription: z.array(z.string()).optional(),
});
export type RecentFilings = z.infer<typeof recentFilingsSchema>;

export const submissionsSchema = z.object({
  cik: z.string(),
  name: z.string(),
  tickers: z.array(z.string()).default([]),
  exchanges: z.array(z.string()).default([]),
  fiscalYearEnd: z.string().nullable().optional(),
  filings: z.object({ recent: recentFilingsSchema }),
});
export type Submissions = z.infer<typeof submissionsSchema>;

/** Zero-pad a CIK to the ten digits EDGAR's URL paths require. */
export function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

/**
 * Canonical citation URL for a filing.
 *
 * Every fundamental NeoOS reports traces to one of these, so a user can open
 * the original document and check the number themselves. That is the entire
 * point of preferring tier-1 evidence.
 */
export function filingUrl(cik: string | number, accessionNumber: string, document: string): string {
  const bare = accessionNumber.replace(/-/g, "");
  const cikNumeric = String(cik).replace(/\D/g, "").replace(/^0+/, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${bare}/${document}`;
}

export function companyFactsUrl(cik: string | number): string {
  return `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
}

export function submissionsUrl(cik: string | number): string {
  return `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
}
