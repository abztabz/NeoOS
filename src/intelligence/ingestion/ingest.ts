import { fnv1a64, stableStringify } from "@/engine/hash";
import {
  rawEvidenceRecordSchema,
  type RawEvidenceRecord,
} from "@/intelligence/types/raw-evidence";
import type { ProviderFetchResult } from "@/intelligence/types/provider";
import type { ValidationIssue } from "@/intelligence/types/validation";

/**
 * Ingestion: provider payloads → immutable RawEvidenceRecords.
 *
 * Records are content-addressed by checksum. Two providers reporting the same
 * fact produce two records (both kept, both auditable); the SAME record
 * arriving twice is a duplicate and is dropped once, with a note.
 */

/** Fields that define a record's identity for duplicate detection. */
function checksumOf(record: Omit<RawEvidenceRecord, "checksum">): string {
  return fnv1a64(
    stableStringify({
      providerId: record.providerId,
      providerRecordId: record.providerRecordId,
      sourceRef: record.sourceRef,
      rawTitle: record.rawTitle,
      rawText: record.rawText,
      rawValue: record.rawValue,
      rawUnit: record.rawUnit,
      rawCurrency: record.rawCurrency,
      publishedAt: record.publishedAt,
      identifiers: record.assetIdentifiers,
    }),
  );
}

export interface IngestionResult {
  records: RawEvidenceRecord[];
  duplicates: RawEvidenceRecord[];
  issues: ValidationIssue[];
}

/**
 * Build immutable records from a provider result. The provider's declared mode
 * is stamped onto every record so downstream code can never lose track of
 * whether a claim came from a live feed or a fixture.
 */
export function ingestProviderResult(
  result: ProviderFetchResult,
  seen: Map<string, RawEvidenceRecord>,
): IngestionResult {
  const records: RawEvidenceRecord[] = [];
  const duplicates: RawEvidenceRecord[] = [];
  const issues: ValidationIssue[] = [];

  result.records.forEach((candidate, index) => {
    const parsed = rawEvidenceRecordSchema
      .omit({ checksum: true })
      .safeParse(candidate);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      issues.push({
        code: "schema_violation",
        severity: "blocking",
        stage: "raw_input",
        message: `Record ${index} from ${result.providerId} does not match the raw evidence schema.`,
        subjectType: "raw_evidence",
        subjectId: `${result.providerId}#${index}`,
        assetId: null,
        detail: first ? `${first.path.join(".")}: ${first.message}` : null,
      });
      return;
    }

    const checksum = checksumOf(parsed.data);
    const record: RawEvidenceRecord = Object.freeze({ ...parsed.data, checksum });

    const existing = seen.get(checksum);
    if (existing) {
      duplicates.push(record);
      issues.push({
        code: "duplicate_source_record",
        severity: "informational",
        stage: "raw_input",
        message: `Duplicate of ${existing.rawEvidenceId} dropped (identical content from ${record.providerId}).`,
        subjectType: "raw_evidence",
        subjectId: record.rawEvidenceId,
        assetId: null,
        detail: `checksum ${checksum}`,
      });
      return;
    }

    seen.set(checksum, record);
    records.push(record);
  });

  return { records, duplicates, issues };
}

/**
 * Verify a record has not been mutated since ingestion. Raw records are frozen
 * in-process, but they also round-trip through storage and imports.
 */
export function verifyChecksum(record: RawEvidenceRecord): boolean {
  const rest: Omit<RawEvidenceRecord, "checksum"> = { ...record };
  delete (rest as Partial<RawEvidenceRecord>).checksum;
  return checksumOf(rest) === record.checksum;
}

/**
 * Apply a correction. The original is never edited: it is marked superseded and
 * a new record is returned pointing back at it.
 */
export function superseding(
  original: RawEvidenceRecord,
  changes: Partial<Omit<RawEvidenceRecord, "rawEvidenceId" | "checksum" | "supersedesRawEvidenceId">>,
  newId: string,
): { superseded: RawEvidenceRecord; correction: RawEvidenceRecord } {
  const superseded: RawEvidenceRecord = { ...original, ingestionStatus: "superseded" };
  const draft = {
    ...original,
    ...changes,
    rawEvidenceId: newId,
    ingestionStatus: "ingested" as const,
    supersedesRawEvidenceId: original.rawEvidenceId,
  };
  const rest: Omit<RawEvidenceRecord, "checksum"> = { ...draft };
  delete (rest as Partial<RawEvidenceRecord>).checksum;
  return { superseded, correction: { ...draft, checksum: checksumOf(rest) } };
}
