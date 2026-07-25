import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  timingSafeEqual,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import {
  canonicalContentBytes,
  SIGNATURE_VERSION,
  type ReportContent,
  type ReportEnvelope,
  type ReportSignature,
  type VerificationStatus,
} from "@/server/types/report-envelope";

/**
 * Report signing with Ed25519.
 *
 * What this buys, precisely: anyone holding the public key can confirm that a
 * report's content is byte-identical to what the server produced, and that it
 * was produced by a holder of the private key. Editing a number in the database
 * invalidates the signature, and the signature cannot be regenerated without
 * the private key, which lives only in the server's environment.
 *
 * What it does not buy: it does not stop a party who holds the private key from
 * signing a false report, and it does not stop anyone from deleting a report
 * outright. This is why the journal is described as **tamper-resistant and
 * cryptographically verifiable**, never as tamper-proof. Those are different
 * claims and only the first one is true.
 *
 * Ed25519 rather than RSA or ECDSA: deterministic (no nonce to leak a key
 * through), small keys and signatures, and native in Node with no dependency.
 */

export const SIGNING_ALGORITHM = "ed25519" as const;

export interface KeyPairMaterial {
  /** Base64url PKCS#8 private key. Server environment only, never stored. */
  privateKey: string;
  /** Base64url SPKI public key. Safe to publish. */
  publicKey: string;
  keyId: string;
}

/**
 * Generate a key pair for an operator to install.
 *
 * The key id is derived from the public key rather than assigned, so it cannot
 * silently disagree with the key it names — a mislabelled key would make
 * rotation unauditable.
 */
export function generateSigningKeyPair(): KeyPairMaterial {
  const { privateKey, publicKey } = generateKeyPairSync(SIGNING_ALGORITHM);
  const privateDer = privateKey.export({ type: "pkcs8", format: "der" });
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  return {
    privateKey: toBase64Url(privateDer),
    publicKey: toBase64Url(publicDer),
    keyId: keyIdFor(publicDer),
  };
}

/** A short, stable fingerprint of a public key. */
export function keyIdFor(publicDer: Buffer): string {
  return `ed25519-${createHash("sha256").update(publicDer).digest("hex").slice(0, 16)}`;
}

export function loadPrivateKey(base64UrlPkcs8: string): KeyObject {
  return createPrivateKey({ key: fromBase64Url(base64UrlPkcs8), format: "der", type: "pkcs8" });
}

export function loadPublicKey(base64UrlSpki: string): KeyObject {
  return createPublicKey({ key: fromBase64Url(base64UrlSpki), format: "der", type: "spki" });
}

/** Derive the public key from a private key, so only one secret is configured. */
export function publicKeyFromPrivate(privateKey: KeyObject): { key: KeyObject; keyId: string; spki: string } {
  // Via PEM rather than passing the KeyObject directly: Node derives the public
  // half from a private key in either form, and this route is the one the
  // published type definitions actually admit.
  const key = createPublicKey(privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const der = key.export({ type: "spki", format: "der" });
  return { key, keyId: keyIdFor(der), spki: toBase64Url(der) };
}

export function contentHash(content: ReportContent): string {
  return createHash("sha256").update(canonicalContentBytes(content), "utf8").digest("hex");
}

/**
 * Sign a report's content.
 *
 * The signature covers the canonical bytes of `content` only. Verification
 * therefore never depends on how the report was stored, transported, or
 * displayed, and adding an operational field later cannot invalidate a
 * historical signature.
 */
export function signReportContent(
  content: ReportContent,
  privateKeyMaterial: string,
  signedAt: string,
): ReportSignature {
  const privateKey = loadPrivateKey(privateKeyMaterial);
  const { keyId } = publicKeyFromPrivate(privateKey);
  const bytes = Buffer.from(canonicalContentBytes(content), "utf8");
  // Ed25519 takes null as the digest algorithm: it hashes internally.
  const signature = cryptoSign(null, bytes, privateKey);
  return {
    signatureVersion: SIGNATURE_VERSION,
    signature: toBase64Url(signature),
    keyId,
    signedAt,
    contentHash: contentHash(content),
  };
}

export interface VerificationOutcome {
  status: VerificationStatus;
  detail: string;
}

/**
 * Verify an envelope against a set of trusted public keys.
 *
 * The two failure modes are reported separately and that distinction matters.
 * `content_modified` means the bytes changed after signing — someone edited a
 * stored report. `signature_invalid` means the bytes are intact but the
 * signature does not correspond to them, which points at a forged or corrupted
 * signature. Collapsing both into "invalid" would discard the more useful half
 * of the finding.
 */
export function verifyEnvelope(
  envelope: ReportEnvelope,
  trustedKeys: Record<string, string>,
): VerificationOutcome {
  const { signature, content } = envelope;
  if (!signature) {
    return { status: "unsigned", detail: "This report carries no signature." };
  }
  if (signature.signatureVersion !== SIGNATURE_VERSION) {
    return {
      status: "signature_invalid",
      detail: `Signature version ${signature.signatureVersion} is not recognised by this build.`,
    };
  }

  const trusted = trustedKeys[signature.keyId];
  if (!trusted) {
    return {
      status: "key_unknown",
      detail: `Signed with key ${signature.keyId}, which is not in the trusted set. The content may be genuine, but this build cannot confirm it.`,
    };
  }

  const recomputed = contentHash(content);
  if (!constantTimeEquals(recomputed, signature.contentHash)) {
    return {
      status: "content_modified",
      detail: `The report's content hash is ${recomputed.slice(0, 12)}… but it was signed as ${signature.contentHash.slice(0, 12)}…. The content changed after it was signed.`,
    };
  }

  let ok = false;
  try {
    ok = cryptoVerify(
      null,
      Buffer.from(canonicalContentBytes(content), "utf8"),
      loadPublicKey(trusted),
      fromBase64Url(signature.signature),
    );
  } catch (error) {
    return {
      status: "signature_invalid",
      detail: `The signature could not be checked: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return ok
    ? { status: "verified", detail: `Signature verified against key ${signature.keyId}.` }
    : {
        status: "signature_invalid",
        detail:
          "The content hash matches but the signature does not verify against the trusted key. Treat this report as untrusted.",
      };
}

/**
 * Compare two hex strings without leaking their difference through timing.
 *
 * A plain `===` on a hash comparison returns faster the earlier it finds a
 * mismatch, which is measurable over enough attempts. Cheap to avoid.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function toBase64Url(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString("base64url");
}

export function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
