import { fnv1a64, stableStringify } from "@/engine/hash";
import type {
  ProviderAdapter,
  ProviderDescriptor,
  ProviderFetchRequest,
  ProviderFetchResult,
} from "@/intelligence/types/provider";
import {
  manualEvidenceImportSchema,
  type ManualEvidenceImport,
  type RawEvidenceRecord,
} from "@/intelligence/types/raw-evidence";

/**
 * ManualEvidenceImportAdapter — turns a user-supplied evidence file into raw
 * records. The user supplies source material; the pipeline does everything
 * downstream. They never hand-write the final report schema.
 *
 * Records are marked `manual_import`, never `live`.
 */
export class ManualEvidenceImportAdapter implements ProviderAdapter {
  constructor(private readonly payload: ManualEvidenceImport) {}

  static parse(
    text: string,
  ): { ok: true; adapter: ManualEvidenceImportAdapter } | { ok: false; error: string } {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, error: "Not valid JSON. Check the file and try again." };
    }
    const parsed = manualEvidenceImportSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first && first.path.length > 0 ? first.path.join(".") : "file";
      return {
        ok: false,
        error: `Evidence import does not match schema v3.0 — ${path}: ${first?.message ?? "invalid"}.`,
      };
    }
    return { ok: true, adapter: new ManualEvidenceImportAdapter(parsed.data) };
  }

  describe(): ProviderDescriptor {
    return {
      providerId: this.payload.provider.providerId,
      providerName: this.payload.provider.providerName,
      providerType: "manual",
      sourceTier: this.payload.provider.sourceTier,
      capabilities: ["fundamentals", "filings", "macro_series", "prices"],
      supportedAssetClasses: ["Equity", "ETF", "Commodity", "Cash equivalents"],
      mode: "manual_import",
      configured: true,
      authenticated: false,
      health: "ok",
      lastSuccessfulRetrieval: this.payload.asOf,
      failureReason: null,
      legalNotes:
        this.payload.provider.legalNotes ??
        "Operator-supplied evidence. NeoOS did not retrieve or verify these records.",
      rateLimit: null,
    };
  }

  async fetch(request: ProviderFetchRequest): Promise<ProviderFetchResult> {
    const records: RawEvidenceRecord[] = this.payload.records.map((record, index) => {
      const base = {
        rawEvidenceId: `manual-${this.payload.provider.providerId}-${String(index + 1).padStart(3, "0")}`,
        providerId: this.payload.provider.providerId,
        providerMode: "manual_import" as const,
        providerRecordId: record.providerRecordId ?? null,
        retrievedAt: this.payload.asOf,
        publishedAt: record.publishedAt ?? null,
        sourceRef: record.sourceRef,
        rawTitle: record.title,
        rawText: record.text ?? null,
        rawPayload: null,
        assetIdentifiers: record.identifiers,
        evidenceCategory: record.category,
        rawValue: record.value ?? null,
        rawUnit: record.unit ?? null,
        rawCurrency: record.currency ?? null,
        geographicScope: record.geographicScope ?? null,
        rawConfidence: record.confidence ?? null,
        ingestionStatus: "ingested" as const,
        parsingWarnings: [],
        payloadMetadata: {
          ...(record.factorHint ? { factorHint: record.factorHint } : {}),
          ...(record.claimKey ? { claimKey: record.claimKey } : {}),
          ...(record.notes ? { notes: record.notes } : {}),
          sourceName: this.payload.provider.providerName,
        },
        supersedesRawEvidenceId: null,
      };
      return { ...base, checksum: fnv1a64(stableStringify(base)) };
    });

    return {
      providerId: this.payload.provider.providerId,
      mode: "manual_import",
      ok: true,
      respondedAt: request.asOf,
      rawPayloadRef: `manual:${this.payload.provider.providerId}:${records.length}`,
      records,
      failureReason: null,
      warnings: [],
    };
  }
}
