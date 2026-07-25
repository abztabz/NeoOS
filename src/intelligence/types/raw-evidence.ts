import { z } from "zod";
import { providerModes } from "@/intelligence/types/provider";

/**
 * RawEvidenceRecord — source material exactly as it arrived, before any
 * normalization. Immutable after ingestion: a correction produces a NEW record
 * whose `supersedesRawEvidenceId` points at the old one.
 *
 * Every normalized claim the engine ever sees can be traced back to one of
 * these, which is what makes an audit possible.
 */

export const rawAssetIdentifierSchema = z.object({
  /** Identifier scheme as the SOURCE named it — not normalized. */
  scheme: z.enum([
    "ticker",
    "exchange",
    "isin",
    "cusip",
    "figi",
    "commodity",
    "provider_id",
    "name",
    "fund_name",
    "category",
  ]),
  value: z.string(),
});
export type RawAssetIdentifier = z.infer<typeof rawAssetIdentifierSchema>;

export const evidenceCategories = [
  "price",
  "fundamental",
  "filing",
  "macro_indicator",
  "research_opinion",
  "news",
  "sentiment",
  "reference",
] as const;
export type EvidenceCategory = (typeof evidenceCategories)[number];

export const ingestionStatuses = ["ingested", "rejected", "superseded"] as const;
export type IngestionStatus = (typeof ingestionStatuses)[number];

export const rawEvidenceRecordSchema = z.object({
  rawEvidenceId: z.string(),
  providerId: z.string(),
  /** Mode the record was produced under. Carried through the whole pipeline. */
  providerMode: z.enum(providerModes),
  /** The provider's own id for this record, where it has one. */
  providerRecordId: z.string().nullable(),
  retrievedAt: z.iso.datetime({ offset: true }),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  sourceRef: z.string(),
  rawTitle: z.string(),
  /** Free text, or a structured payload. Preserved verbatim. */
  rawText: z.string().nullable(),
  rawPayload: z.record(z.string(), z.unknown()).nullable(),
  assetIdentifiers: z.array(rawAssetIdentifierSchema),
  evidenceCategory: z.enum(evidenceCategories),
  /** Value as the source stated it, in the source's own units. */
  rawValue: z.number().nullable(),
  rawUnit: z.string().nullable(),
  rawCurrency: z.string().nullable(),
  geographicScope: z.string().nullable(),
  /** Confidence the source itself asserted, if any. */
  rawConfidence: z.number().min(0).max(100).nullable(),
  /** Content checksum — detects mutation of a supposedly immutable record. */
  checksum: z.string(),
  ingestionStatus: z.enum(ingestionStatuses),
  parsingWarnings: z.array(z.string()),
  /** Anything else the provider supplied, kept for audit. */
  payloadMetadata: z.record(z.string(), z.unknown()),
  /** Set when this record corrects an earlier one. */
  supersedesRawEvidenceId: z.string().nullable(),
});
export type RawEvidenceRecord = z.infer<typeof rawEvidenceRecordSchema>;

/**
 * Versioned wire format for manual evidence import. The user supplies THIS,
 * never the final report schema — the pipeline does the rest.
 */
export const manualEvidenceImportSchema = z.object({
  schemaVersion: z.literal("3.0"),
  provider: z.object({
    providerId: z.string(),
    providerName: z.string(),
    providerType: z.string(),
    sourceTier: z.number().int().min(1).max(6),
    legalNotes: z.string().optional(),
  }),
  asOf: z.iso.datetime({ offset: true }),
  records: z
    .array(
      z.object({
        providerRecordId: z.string().optional(),
        publishedAt: z.iso.datetime({ offset: true }).optional(),
        sourceRef: z.string(),
        title: z.string(),
        text: z.string().optional(),
        identifiers: z.array(rawAssetIdentifierSchema).min(1),
        category: z.enum(evidenceCategories),
        /** Which scoring factor this informs, if the submitter knows. */
        factorHint: z.string().optional(),
        value: z.number().nullable().optional(),
        unit: z.string().optional(),
        currency: z.string().optional(),
        geographicScope: z.string().optional(),
        confidence: z.number().min(0).max(100).optional(),
        claimKey: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});
export type ManualEvidenceImport = z.infer<typeof manualEvidenceImportSchema>;
