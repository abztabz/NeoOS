import { describe, expect, it } from "vitest";
import {
  constantTimeEquals,
  contentHash,
  generateSigningKeyPair,
  loadPrivateKey,
  publicKeyFromPrivate,
  signReportContent,
  verifyEnvelope,
} from "@/server/signing/sign";
import {
  canonicalContentBytes,
  REPORT_ENVELOPE_SCHEMA_VERSION,
  PIPELINE_VERSION,
  type ReportContent,
  type ReportEnvelope,
} from "@/server/types/report-envelope";

const SIGNED_AT = "2026-07-25T14:05:00.000Z";

function content(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    schemaVersion: REPORT_ENVELOPE_SCHEMA_VERSION,
    reportId: "report-2026-07-25-001",
    runId: "run-2026-07-25-001",
    generatedAt: "2026-07-25T14:00:00.000Z",
    evidenceCutoff: "2026-07-25T13:45:00.000Z",
    engineVersion: "2.0.0",
    pipelineVersion: PIPELINE_VERSION,
    executionContext: "server_live",
    providerVersions: [
      {
        providerId: "sec-edgar",
        providerName: "EDGAR",
        adapterVersion: "1.0.0",
        mode: "live",
        sourceVersion: null,
        recordsContributed: 42,
      },
    ],
    dataModes: ["live"],
    liveState: "partial_live",
    assetLiveStates: [],
    priorReportId: null,
    report: { deploymentScore: 47.5 },
    ...overrides,
  };
}

function envelopeFor(c: ReportContent, keys: { privateKey: string }): ReportEnvelope {
  return {
    content: c,
    signature: signReportContent(c, keys.privateKey, SIGNED_AT),
    verification: { status: "not_checked", checkedAt: null, detail: "" },
  };
}

describe("Ed25519 signing", () => {
  const keys = generateSigningKeyPair();
  const trusted = { [keys.keyId]: keys.publicKey };

  it("derives the key id from the public key rather than assigning one", () => {
    const derived = publicKeyFromPrivate(loadPrivateKey(keys.privateKey));
    expect(derived.keyId).toBe(keys.keyId);
    expect(derived.spki).toBe(keys.publicKey);
  });

  it("verifies a report it just signed", () => {
    const result = verifyEnvelope(envelopeFor(content(), keys), trusted);
    expect(result.status).toBe("verified");
  });

  it("produces the same signature for the same content, regardless of key order", () => {
    const a = content();
    // Same data, every key in the opposite order.
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as ReportContent;
    expect(canonicalContentBytes(reordered)).toBe(canonicalContentBytes(a));
    expect(signReportContent(reordered, keys.privateKey, SIGNED_AT).signature).toBe(
      signReportContent(a, keys.privateKey, SIGNED_AT).signature,
    );
  });

  it("detects an edited number inside the nested engine report", () => {
    const envelope = envelopeFor(content(), keys);
    const tampered: ReportEnvelope = {
      ...envelope,
      content: { ...envelope.content, report: { deploymentScore: 92 } },
    };
    const result = verifyEnvelope(tampered, trusted);
    expect(result.status).toBe("content_modified");
    expect(result.detail).toMatch(/changed after it was signed/);
  });

  it("detects an edited live state", () => {
    const envelope = envelopeFor(content(), keys);
    const upgraded: ReportEnvelope = {
      ...envelope,
      content: { ...envelope.content, liveState: "live_verified" },
    };
    expect(verifyEnvelope(upgraded, trusted).status).toBe("content_modified");
  });

  it("distinguishes a forged signature from modified content", () => {
    const envelope = envelopeFor(content(), keys);
    const other = generateSigningKeyPair();
    const forged: ReportEnvelope = {
      ...envelope,
      signature: {
        ...signReportContent(content(), other.privateKey, SIGNED_AT),
        // Claim the trusted key id while actually being signed by another key.
        keyId: keys.keyId,
      },
    };
    const result = verifyEnvelope(forged, trusted);
    // The bytes are intact, so this is a signature problem, not a content one.
    expect(result.status).toBe("signature_invalid");
  });

  it("refuses a key it does not trust without pretending the report is bad", () => {
    const stranger = generateSigningKeyPair();
    const result = verifyEnvelope(envelopeFor(content(), stranger), trusted);
    expect(result.status).toBe("key_unknown");
    expect(result.detail).toMatch(/may be genuine/);
  });

  it("rejects an unrecognised signature version", () => {
    const envelope = envelopeFor(content(), keys);
    const future = {
      ...envelope,
      signature: { ...envelope.signature!, signatureVersion: "ed25519-v2" as "ed25519-v1" },
    };
    expect(verifyEnvelope(future, trusted).status).toBe("signature_invalid");
  });

  it("reports an unsigned envelope as unsigned, not invalid", () => {
    const result = verifyEnvelope(
      { content: content(), signature: null, verification: { status: "not_checked", checkedAt: null, detail: "" } },
      trusted,
    );
    expect(result.status).toBe("unsigned");
  });

  it("does not sign the verification block, so re-checking cannot invalidate a report", () => {
    const c = content();
    const signature = signReportContent(c, keys.privateKey, SIGNED_AT);
    const checked: ReportEnvelope = {
      content: c,
      signature,
      verification: { status: "verified", checkedAt: "2026-08-01T00:00:00.000Z", detail: "later check" },
    };
    expect(verifyEnvelope(checked, trusted).status).toBe("verified");
  });

  it("hashes content stably", () => {
    expect(contentHash(content())).toBe(contentHash(content()));
    expect(contentHash(content())).not.toBe(contentHash(content({ reportId: "other" })));
    expect(contentHash(content())).toHaveLength(64);
  });

  it("compares hashes without an early exit", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
  });

  it("issues distinct key pairs", () => {
    expect(generateSigningKeyPair().keyId).not.toBe(generateSigningKeyPair().keyId);
  });
});
