import { z } from "zod";
import { stableStringify } from "@/engine/hash";
import { executionContexts } from "@/server/types/execution-context";
import {
  assetLiveAssessmentSchema,
  reportLiveStates,
} from "@/server/types/live-state";

/**
 * The versioned report envelope (schema v4.0).
 *
 * A report is no longer a document that exists only while a tab is open. It is
 * an addressable, versioned, signed artefact with a lineage. This envelope
 * carries everything needed to answer four questions without trusting the
 * renderer:
 *
 *   1. What produced this, and with which code?
 *   2. What evidence was it allowed to see, and how fresh was it?
 *   3. What came before it?
 *   4. Has a byte of it changed since it was signed?
 *
 * The engine report itself is nested untouched. The envelope wraps; it never
 * edits. That keeps the engine's v2.0 contract intact and means an envelope can
 * be verified without re-running the engine.
 */

export const REPORT_ENVELOPE_SCHEMA_VERSION = "4.0" as const;

/** Version of the pipeline that assembled the evidence. Bumped by hand. */
export const PIPELINE_VERSION = "4.0.0" as const;

/** Version of the signing scheme, so a future algorithm change is detectable. */
export const SIGNATURE_VERSION = "ed25519-v1" as const;

export const providerVersionSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  /** Adapter version, so a mapping change is visible in the lineage. */
  adapterVersion: z.string(),
  mode: z.string(),
  /** Upstream API version or dataset revision, where the source states one. */
  sourceVersion: z.string().nullable(),
  /** Records this provider actually contributed to this report. */
  recordsContributed: z.number().int().min(0),
});
export type ProviderVersion = z.infer<typeof providerVersionSchema>;

export const verificationStatuses = [
  "verified",
  "unsigned",
  "signature_invalid",
  "content_modified",
  "key_unknown",
  "not_checked",
] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export const verificationStatusLabels: Record<VerificationStatus, string> = {
  verified: "Signature verified",
  unsigned: "Unsigned",
  signature_invalid: "Signature does not verify",
  content_modified: "Content changed after signing",
  key_unknown: "Signing key not recognised",
  not_checked: "Not checked",
};

export const signatureSchema = z.object({
  signatureVersion: z.literal(SIGNATURE_VERSION),
  /** Base64url Ed25519 signature over the canonical content bytes. */
  signature: z.string(),
  /** Public key id. The private key never leaves the server. */
  keyId: z.string(),
  signedAt: z.iso.datetime({ offset: true }),
  /** SHA-256 of the canonical content bytes, hex. What was actually signed. */
  contentHash: z.string(),
});
export type ReportSignature = z.infer<typeof signatureSchema>;

/**
 * Everything that is signed. Deliberately excludes the signature block itself
 * and any mutable operational field (verification status, storage timestamps),
 * so re-verifying never depends on how the report was stored or displayed.
 */
export const reportContentSchema = z.object({
  schemaVersion: z.literal(REPORT_ENVELOPE_SCHEMA_VERSION),
  reportId: z.string(),
  runId: z.string(),
  generatedAt: z.iso.datetime({ offset: true }),
  /**
   * No evidence published after this instant informed the report. Distinct
   * from `generatedAt`: a run at 06:00 may be working from a 04:30 cutoff, and
   * conflating the two is how a report comes to look fresher than it is.
   */
  evidenceCutoff: z.iso.datetime({ offset: true }),
  engineVersion: z.string(),
  pipelineVersion: z.string(),
  executionContext: z.enum(executionContexts),
  providerVersions: z.array(providerVersionSchema),
  /** Provider modes that actually contributed. Never aspirational. */
  dataModes: z.array(z.string()),
  liveState: z.enum(reportLiveStates),
  assetLiveStates: z.array(assetLiveAssessmentSchema),
  /** The immediately preceding report in this lineage, if any. */
  priorReportId: z.string().nullable(),
  /** The engine's own v2.0 report, nested verbatim. */
  report: z.unknown(),
});
export type ReportContent = z.infer<typeof reportContentSchema>;

export const reportEnvelopeSchema = z.object({
  content: reportContentSchema,
  signature: signatureSchema.nullable(),
  /**
   * Result of the most recent verification. Operational, not signed — it is a
   * claim about the artefact, not part of it.
   */
  verification: z.object({
    status: z.enum(verificationStatuses),
    checkedAt: z.iso.datetime({ offset: true }).nullable(),
    detail: z.string(),
  }),
});
export type ReportEnvelope = z.infer<typeof reportEnvelopeSchema>;

/**
 * The exact bytes that get hashed and signed.
 *
 * Key order is normalised, so two structurally identical reports produce the
 * same signature regardless of how their objects were built. Anything outside
 * `content` is excluded by construction rather than by remembering to exclude
 * it.
 */
export function canonicalContentBytes(content: ReportContent): string {
  return stableStringify(content);
}

/** True when the envelope may be presented as live. */
export function envelopeClaimsLive(envelope: ReportEnvelope): boolean {
  return (
    envelope.content.liveState === "live_verified" ||
    envelope.content.liveState === "partial_live" ||
    envelope.content.liveState === "live_stale"
  );
}

/**
 * Whether a rendered envelope should be trusted enough to act on.
 *
 * An unsigned client-side run is normal and fine; a signed server report whose
 * signature does not verify is not, and the UI must say so rather than quietly
 * rendering the numbers.
 */
export function envelopeIsTrustworthy(envelope: ReportEnvelope): boolean {
  const { status } = envelope.verification;
  return status === "verified" || status === "unsigned" || status === "not_checked";
}
