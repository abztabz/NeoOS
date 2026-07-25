import { describe, expect, it } from "vitest";
import { normalizeRecord, type NormalizationContext } from "@/intelligence/normalization/normalize";
import {
  applyScale,
  convertCurrency,
  isSupportedUnit,
  parseDate,
  toFactorScale,
  toPercent,
  toUtcIso,
  type FxTable,
} from "@/intelligence/normalization/units";
import { resolveIdentity } from "@/intelligence/identity/resolver";
import { computeRawChecksum } from "@/intelligence/ingestion/ingest";
import { stableStringify } from "@/engine/hash";
import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import { FUTURE_DATE_TOLERANCE_MINUTES } from "@/intelligence/types/validation";

const NOW = "2026-07-24T12:00:00Z";
const FX: FxTable = [
  { from: "AED", to: "USD", rate: 0.2723, source: "peg (test)", timestamp: NOW },
];
const ctx: NormalizationContext = { now: NOW, baseCurrency: "USD", fxTable: FX };

function raw(overrides: Partial<RawEvidenceRecord> = {}): RawEvidenceRecord {
  const base: Omit<RawEvidenceRecord, "checksum"> = {
    rawEvidenceId: "r1",
    providerId: "test-provider",
    providerMode: "fixture",
    providerRecordId: "1",
    retrievedAt: NOW,
    publishedAt: "2026-07-20T00:00:00Z",
    sourceRef: "test://ref",
    rawTitle: "Balance sheet strength",
    rawText: null,
    rawPayload: null,
    assetIdentifiers: [
      { scheme: "ticker", value: "AAPL" },
      { scheme: "exchange", value: "NASDAQ" },
    ],
    evidenceCategory: "filing",
    rawValue: 90,
    rawUnit: "score",
    rawCurrency: null,
    geographicScope: null,
    rawConfidence: 92,
    ingestionStatus: "ingested",
    parsingWarnings: [],
    payloadMetadata: { factorHint: "financialStrength", sourceName: "Test filing" },
    supersedesRawEvidenceId: null,
    ...overrides,
  };
  return { ...base, checksum: computeRawChecksum(base) };
}

function normalize(record: RawEvidenceRecord) {
  return normalizeRecord(record, resolveIdentity(record.assetIdentifiers), ctx);
}

describe("unit helpers", () => {
  it("recognises supported units and rejects others", () => {
    expect(isSupportedUnit("percent")).toBe(true);
    expect(isSupportedUnit("furlongs")).toBe(false);
    expect(isSupportedUnit(null)).toBe(false);
  });

  it("converts percent-family units consistently", () => {
    expect(toPercent(250, "basis_points")).toBe(2.5);
    expect(toPercent(0.4, "ratio")).toBeCloseTo(40, 10);
    expect(toPercent(12, "percent")).toBe(12);
  });

  it("maps only meaningful units onto the factor scale", () => {
    expect(toFactorScale(80, "score")).toBe(80);
    expect(toFactorScale(250, "basis_points")).toBe(2.5);
    // A price has no intrinsic 0–100 meaning.
    expect(toFactorScale(214, "currency_per_share")).toBeNull();
  });

  it("clamps factor-scale values into range", () => {
    expect(toFactorScale(140, "score")).toBe(100);
    expect(toFactorScale(-20, "score")).toBe(0);
  });

  it("applies scale prefixes and rejects unknown ones", () => {
    expect(applyScale(2, "million")).toMatchObject({ ok: true, value: 2e6 });
    expect(applyScale(2, "squillion").ok).toBe(false);
  });

  it("parses dates defensively", () => {
    expect(parseDate("nonsense")).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(toUtcIso("2026-07-20T00:00:00+02:00")).toBe("2026-07-19T22:00:00.000Z");
  });
});

describe("currency handling", () => {
  it("preserves the original value, currency, rate, source and timestamp", () => {
    const outcome = convertCurrency(7.4, "AED", "USD", FX);
    expect(outcome.ok).toBe(true);
    expect(outcome.conversion).toMatchObject({
      originalValue: 7.4,
      originalCurrency: "AED",
      conversionRate: 0.2723,
      conversionSource: "peg (test)",
      normalizedCurrency: "USD",
    });
    expect(outcome.conversion?.normalizedValue).toBeCloseTo(7.4 * 0.2723, 10);
  });

  it("refuses to convert without a verified rate", () => {
    const outcome = convertCurrency(100, "JPY", "USD", FX);
    expect(outcome.ok).toBe(false);
    expect(outcome.conversion).toBeNull();
    expect(outcome.reason).toMatch(/no verified/i);
  });

  it("identity conversion is free", () => {
    const outcome = convertCurrency(10, "USD", "USD", []);
    expect(outcome.ok).toBe(true);
    expect(outcome.conversion?.conversionRate).toBe(1);
  });

  it("blocks a record whose currency cannot be converted", () => {
    const outcome = normalize(
      raw({ rawValue: 100, rawUnit: "currency_per_share", rawCurrency: "JPY" }),
    );
    expect(outcome.normalized).toBeNull();
    expect(outcome.issues.map((i) => i.code)).toContain("incompatible_currency");
  });

  it("converts a supported currency and keeps the conversion record", () => {
    const outcome = normalize(
      raw({ rawValue: 7.4, rawUnit: "currency_per_share", rawCurrency: "AED" }),
    );
    expect(outcome.normalized).not.toBeNull();
    expect(outcome.normalized?.conversion?.originalCurrency).toBe("AED");
    expect(outcome.normalized?.conversion?.originalValue).toBe(7.4);
  });
});

describe("normalization", () => {
  it("produces an evidence record from a matched raw record", () => {
    const outcome = normalize(raw());
    expect(outcome.normalized).not.toBeNull();
    const evidence = outcome.normalized!.evidence;
    expect(evidence.assetId).toBe("apple");
    expect(evidence.factor).toBe("financialStrength");
    expect(evidence.normalizedValue).toBe(90);
    expect(evidence.sourceTier).toBe(1);
  });

  it("refuses to normalize an unmatched identity rather than guessing", () => {
    const outcome = normalize(
      raw({ assetIdentifiers: [{ scheme: "ticker", value: "ZZZZ" }] }),
    );
    expect(outcome.normalized).toBeNull();
    expect(outcome.issues.map((i) => i.code)).toContain("unknown_asset_identity");
  });

  it("refuses to normalize an ambiguous identity", () => {
    const outcome = normalize(
      raw({ assetIdentifiers: [{ scheme: "category", value: "s&p 500 etf" }] }),
    );
    expect(outcome.normalized).toBeNull();
    expect(outcome.issues.map((i) => i.code)).toContain("ambiguous_asset_identity");
  });

  it("allows macro evidence to carry a null asset", () => {
    const outcome = normalize(
      raw({
        evidenceCategory: "macro_indicator",
        assetIdentifiers: [],
        payloadMetadata: { sourceName: "macro" },
      }),
    );
    expect(outcome.normalized).not.toBeNull();
    expect(outcome.normalized?.evidence.assetId).toBeNull();
    expect(outcome.normalized?.evidence.factor).toBe("macro");
  });

  it("rejects an unsupported unit", () => {
    const outcome = normalize(raw({ rawUnit: "furlongs" }));
    expect(outcome.normalized).toBeNull();
    expect(outcome.issues.map((i) => i.code)).toContain("unsupported_unit");
  });

  it("rejects a non-finite value", () => {
    const outcome = normalize(raw({ rawValue: Number.POSITIVE_INFINITY }));
    expect(outcome.normalized).toBeNull();
    expect(outcome.issues.map((i) => i.code)).toContain("malformed_numeric_value");
  });

  it("rejects an unparseable publication date", () => {
    const outcome = normalize(raw({ publishedAt: "the fourteenth of never" }));
    expect(outcome.normalized).toBeNull();
    expect(outcome.issues.map((i) => i.code)).toContain("impossible_date");
  });

  it("rejects a publication date beyond the future tolerance", () => {
    const future = new Date(
      new Date(NOW).getTime() + (FUTURE_DATE_TOLERANCE_MINUTES + 30) * 60_000,
    ).toISOString();
    const outcome = normalize(raw({ publishedAt: future }));
    expect(outcome.normalized).toBeNull();
    expect(outcome.issues.map((i) => i.code)).toContain("future_publication_date");
  });

  it("accepts minor clock skew inside the tolerance", () => {
    const slightlyAhead = new Date(new Date(NOW).getTime() + 10 * 60_000).toISOString();
    const outcome = normalize(raw({ publishedAt: slightlyAhead }));
    expect(outcome.normalized).not.toBeNull();
  });

  it("normalizes timestamps to UTC", () => {
    const outcome = normalize(raw({ publishedAt: "2026-07-20T00:00:00+02:00" }));
    expect(outcome.normalized?.evidence.publicationDate).toBe("2026-07-19T22:00:00.000Z");
  });

  it("marks manual-import evidence unverified rather than verified", () => {
    const outcome = normalize(raw({ providerMode: "manual_import" }));
    expect(outcome.normalized?.evidence.verificationStatus).toBe("unverified");
  });

  it("is deterministic for identical input", () => {
    const record = raw();
    const a = normalize(record);
    const b = normalize(record);
    expect(stableStringify(a.normalized?.evidence)).toBe(stableStringify(b.normalized?.evidence));
  });
});
