/**
 * Network environment — the distinction this module exists to make.
 *
 * NeoOS previously reported one sentence for three unrelated situations:
 *
 *   - the sandbox this code was written in has outbound requests blocked;
 *   - no free source exists for an instrument;
 *   - no licensed subscription is configured.
 *
 * Only the third has anything to do with money, and only the second has
 * anything to do with the instrument. The first is a property of *where the
 * process is running* and is resolved by deploying somewhere with egress —
 * which is free, and which every production host does by default.
 *
 * Collapsing them produced the false claim that NeoOS needs a paid API to know
 * a current price. It does not. It needs an outbound socket, and for several
 * asset classes that is the entire requirement.
 */

export const networkEnvironments = ["development", "ci", "production"] as const;
export type NetworkEnvironment = (typeof networkEnvironments)[number];

export const networkEnvironmentMeaning: Record<NetworkEnvironment, string> = {
  development:
    "Local or sandboxed work. Egress is frequently blocked by policy. Providers are exercised against fixtures and recorded responses; nothing here says anything about production capability.",
  ci:
    "Automated checks. Egress is deliberately blocked so tests are hermetic and deterministic. Provider contract tests run against fixtures, and a test that reaches the open internet would be a defect.",
  production:
    "Deployed and serving. Outbound access to the documented allowlist is required for live retrieval. Without it the deployment still runs and still reports honestly — it simply has nothing current to report.",
};

/**
 * Which environment this process is in.
 *
 * Read from the environment rather than inferred from behaviour: a failed
 * request is not evidence of being in CI, and treating it as such would let a
 * production outage quietly relabel itself as an expected test condition.
 */
export function currentNetworkEnvironment(): NetworkEnvironment {
  if (process.env.NEOOS_NETWORK_ENV === "production") return "production";
  if (process.env.NEOOS_NETWORK_ENV === "ci") return "ci";
  if (process.env.NEOOS_NETWORK_ENV === "development") return "development";
  if (process.env.CI === "true" || process.env.CI === "1") return "ci";
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") return "production";
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

/**
 * Operator-declared egress state.
 *
 * `NEOOS_EGRESS_BLOCKED=1` marks a deployment that cannot reach the open
 * internet. It exists so a restricted environment can say so *before* making
 * requests, rather than discovering it one timeout at a time and reporting a
 * string of provider errors that all mean the same thing.
 */
export function egressDeclaredBlocked(): boolean {
  const value = process.env.NEOOS_EGRESS_BLOCKED;
  return value === "1" || value === "true";
}

/**
 * The reason to attach to every provider when the environment cannot reach out,
 * or null when it can.
 *
 * Deliberately worded so nobody reads it as a product limitation or a bill. In
 * `ci` this is the intended state, not a fault.
 */
export function egressBlockedReason(): string | null {
  const environment = currentNetworkEnvironment();

  if (environment === "ci") {
    return "This is a CI environment with egress deliberately disabled so tests stay hermetic. Provider behaviour is verified against recorded fixtures here; production retrieval is unaffected.";
  }
  if (egressDeclaredBlocked()) {
    return "This deployment is declared as having no outbound network access, so no provider can be reached. This is an environment restriction, not a licensing one: free and official sources become available as soon as the deployment can make outbound requests.";
  }
  if (environment === "development") {
    // Not asserted as blocked. Plenty of local machines have egress, and
    // pre-emptively disabling providers would hide real integration problems.
    return null;
  }
  return null;
}

/* ---------------- egress allowlist ---------------- */

export interface AllowlistEntry {
  host: string;
  providerId: string;
  purpose: string;
  requiresCredentials: boolean;
  /** Terms constraining caching or redistribution of what comes back. */
  termsNote: string;
}

/**
 * Every host NeoOS will contact, why, and under what terms.
 *
 * Maintained as data so it can be handed to whoever configures the egress
 * firewall, and so a new provider cannot quietly widen the deployment's network
 * surface without appearing here.
 */
export const EGRESS_ALLOWLIST: AllowlistEntry[] = [
  {
    host: "data.sec.gov",
    providerId: "sec-edgar",
    purpose: "Company facts and filing submissions for US issuers.",
    requiresCredentials: false,
    termsNote:
      "Public domain. Subject to the SEC's fair-access policy: a descriptive User-Agent is required and requests are rate-limited.",
  },
  {
    host: "data-api.ecb.europa.eu",
    providerId: "ecb-fx",
    purpose: "Euro foreign exchange reference rates.",
    requiresCredentials: false,
    termsNote: "Free to use and redistribute with attribution to the ECB.",
  },
  {
    host: "api.fiscaldata.treasury.gov",
    providerId: "us-treasury-fiscal-data",
    purpose: "Average interest rates on outstanding US Treasury securities.",
    requiresCredentials: false,
    termsNote: "US federal government work, public domain. Free to use and redistribute.",
  },
];

/**
 * Hosts for optionally-configured providers, which are not known until the
 * operator supplies a base URL.
 */
export function optionalAllowlistHosts(baseUrls: (string | null)[]): string[] {
  const hosts: string[] = [];
  for (const baseUrl of baseUrls) {
    if (!baseUrl) continue;
    try {
      hosts.push(new URL(baseUrl).host);
    } catch {
      // An unparsable base URL is reported by the provider that owns it; the
      // allowlist simply has nothing to add for it.
    }
  }
  return hosts;
}

/* ---------------- retrieval discipline ---------------- */

/**
 * Limits applied to every outbound request, regardless of provider.
 *
 * Stated centrally because they are a courtesy to the publisher as much as a
 * protection for NeoOS. Free official endpoints stay free partly because their
 * users do not hammer them.
 */
export const OUTBOUND_POLICY = {
  timeoutMs: 10_000,
  maxRetries: 2,
  /** Exponential, with the first retry after this delay. */
  retryBaseDelayMs: 500,
  /** Below this, a repeat request is served from cache rather than re-fetched. */
  minSecondsBetweenIdenticalRequests: 60,
  /**
   * How long a retrieved observation may be reused. Well under the freshness
   * windows so caching can never be what makes something stale.
   */
  cacheTtlSeconds: 300,
  /** Requests per minute per host, in the absence of a stated provider limit. */
  defaultRequestsPerMinute: 30,
  userAgentNote:
    "Every request identifies NeoOS and a contact address. Anonymous automated traffic to a public institution is refused by this codebase.",
} as const;

/**
 * What a production deployment needs, in the operator's terms.
 *
 * The ordering is the message: egress first, credentials last, because the
 * first is free and unlocks real coverage while the last is optional and
 * improves latency.
 */
export const PRODUCTION_NETWORK_REQUIREMENTS = [
  "Outbound HTTPS to the hosts in EGRESS_ALLOWLIST. Free, and sufficient on its own for FX, government yield and US issuer fundamentals.",
  "A descriptive SEC_EDGAR_USER_AGENT, which the SEC requires and which costs nothing.",
  "Server-side retrieval only. Providers are never called from the browser, so no credential and no vendor agreement is exposed to a client.",
  "Optionally, licensed market-data credentials, which lower latency and widen instrument coverage but are required by no part of the daily briefing.",
] as const;
