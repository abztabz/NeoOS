/**
 * Server-only configuration access.
 *
 * Every credential in NeoOS is read through this module and nowhere else. Two
 * controls make that more than a naming convention:
 *
 *   1. `assertServerOnly()` throws if the module is evaluated in a browser, so
 *      an accidental import from a client component fails loudly at build or
 *      first render rather than shipping a key in a JS bundle.
 *   2. No variable read here is prefixed `NEXT_PUBLIC_`. Next.js only inlines
 *      that prefix into client bundles, so the values below are structurally
 *      incapable of reaching the browser.
 *
 * Secrets are never logged, never returned by an API route, never written to
 * the database, and never placed in a report. What IS exposed — through
 * `describeConfiguration()` — is whether a credential is present, which the
 * provider panel needs and which reveals nothing.
 */

export function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "src/server/config/env.ts was imported into client code. Credentials must never reach the browser.",
    );
  }
}

assertServerOnly();

function optional(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The SEC requires a descriptive User-Agent identifying the requester on every
 * EDGAR request. It is a contact string, not a secret, but it is mandatory:
 * without it the provider stays unconfigured rather than sending anonymous
 * traffic to a public agency's servers.
 */
export function secEdgarUserAgent(): string | null {
  return optional("SEC_EDGAR_USER_AGENT");
}

export function marketDataApiKey(): string | null {
  return optional("MARKET_DATA_API_KEY");
}

export function marketDataBaseUrl(): string | null {
  return optional("MARKET_DATA_BASE_URL");
}

/** Provider-stated timeliness of the licensed price feed. See PRICE_POLICY.md. */
export function marketDataTimeliness(): string | null {
  return optional("MARKET_DATA_TIMELINESS");
}

export function metalsApiKey(): string | null {
  return optional("METALS_API_KEY");
}

export function metalsBaseUrl(): string | null {
  return optional("METALS_BASE_URL");
}

export function databaseUrl(): string | null {
  return optional("DATABASE_URL");
}

/**
 * PEM certificate authority for the database's TLS certificate.
 *
 * Optional, and the difference between an encrypted connection and a verified
 * one. Managed providers sign with their own CA, which Node does not trust by
 * default; without this the choices are a failed handshake or
 * `sslmode=no-verify`, which encrypts without authenticating the server.
 *
 * Not a secret — a CA certificate is public by design — but it lives here
 * because it is configuration the server reads and the browser must never see.
 */
export function databaseCaCertificate(): string | null {
  return optional("DATABASE_CA_CERT");
}

/** Base64url-encoded Ed25519 private key (PKCS#8). Server memory only. */
export function signingPrivateKey(): string | null {
  return optional("REPORT_SIGNING_PRIVATE_KEY");
}

/** Public key id recorded in signatures so key rotation stays auditable. */
export function signingKeyId(): string {
  return optional("REPORT_SIGNING_KEY_ID") ?? "unconfigured";
}

/** Shared secret for the scheduled-run endpoint. Compared in constant time. */
export function cronSecret(): string | null {
  return optional("CRON_SECRET");
}

/** Bearer token for the operator API. Compared in constant time. */
export function operatorApiToken(): string | null {
  return optional("OPERATOR_API_TOKEN");
}

export function notificationWebhookUrl(): string | null {
  return optional("NOTIFICATION_WEBHOOK_URL");
}

export function runtimeRegion(): string | null {
  return optional("VERCEL_REGION") ?? optional("AWS_REGION");
}

/**
 * Presence-only view of configuration, safe to serialise to the browser.
 *
 * Booleans only. Returning a masked value ("sk_live_…abcd") would still leak
 * length and prefix, so nothing derived from a secret appears here at all.
 */
export interface ConfigurationStatus {
  secEdgar: boolean;
  marketData: boolean;
  metals: boolean;
  database: boolean;
  signing: boolean;
  cron: boolean;
  operatorApi: boolean;
  notifications: boolean;
}

export function describeConfiguration(): ConfigurationStatus {
  return {
    secEdgar: secEdgarUserAgent() !== null,
    marketData: marketDataApiKey() !== null && marketDataBaseUrl() !== null,
    metals: metalsApiKey() !== null && metalsBaseUrl() !== null,
    database: databaseUrl() !== null,
    signing: signingPrivateKey() !== null,
    cron: cronSecret() !== null,
    operatorApi: operatorApiToken() !== null,
    notifications: notificationWebhookUrl() !== null,
  };
}

/**
 * True only when the server can genuinely retrieve live evidence. The
 * orchestrator uses this to choose an execution context, which is what
 * prevents an unconfigured deployment from ever labelling a run live.
 */
export function liveProvidersConfigured(): boolean {
  const status = describeConfiguration();
  return status.secEdgar || status.marketData || status.metals;
}
