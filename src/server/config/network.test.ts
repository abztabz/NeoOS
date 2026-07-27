import { afterEach, describe, expect, it } from "vitest";
import {
  currentNetworkEnvironment,
  EGRESS_ALLOWLIST,
  egressBlockedReason,
  optionalAllowlistHosts,
  OUTBOUND_POLICY,
  PRODUCTION_NETWORK_REQUIREMENTS,
} from "@/server/config/network";

/**
 * These tests pin the distinction the whole change rests on: that "this process
 * cannot reach the internet" and "this instrument needs a paid feed" are
 * different sentences, produced by different code, with different fixes.
 */

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("environment detection", () => {
  it("reads the environment rather than inferring it from a failed request", () => {
    process.env.NEOOS_NETWORK_ENV = "production";
    expect(currentNetworkEnvironment()).toBe("production");

    process.env.NEOOS_NETWORK_ENV = "ci";
    expect(currentNetworkEnvironment()).toBe("ci");
  });

  it("treats a CI runner as CI even when nothing is declared", () => {
    delete process.env.NEOOS_NETWORK_ENV;
    delete process.env.VERCEL_ENV;
    process.env.CI = "true";
    expect(currentNetworkEnvironment()).toBe("ci");
  });

  it("treats a Vercel preview as production, because it serves real requests", () => {
    delete process.env.NEOOS_NETWORK_ENV;
    delete process.env.CI;
    process.env.VERCEL_ENV = "preview";
    expect(currentNetworkEnvironment()).toBe("production");
  });
});

describe("egress reporting", () => {
  it("explains a CI block as intended rather than as a fault", () => {
    process.env.NEOOS_NETWORK_ENV = "ci";
    const reason = egressBlockedReason();
    expect(reason).toContain("deliberately disabled");
    expect(reason).toContain("production retrieval is unaffected");
  });

  it("says a declared block is an environment restriction, not a licensing one", () => {
    process.env.NEOOS_NETWORK_ENV = "production";
    process.env.NEOOS_EGRESS_BLOCKED = "1";
    const reason = egressBlockedReason();
    expect(reason).toContain("not a licensing one");
    expect(reason).toContain("free and official sources become available");
  });

  it("does not assume a local machine is blocked", () => {
    process.env.NEOOS_NETWORK_ENV = "development";
    delete process.env.NEOOS_EGRESS_BLOCKED;
    // Pre-emptively disabling providers here would hide real integration bugs.
    expect(egressBlockedReason()).toBeNull();
  });
});

describe("allowlist", () => {
  it("carries only credential-free hosts by default", () => {
    // Every standing outbound destination is free and unauthenticated. That is
    // the claim "NeoOS needs a paid API" contradicts, expressed as data.
    expect(EGRESS_ALLOWLIST.every((entry) => !entry.requiresCredentials)).toBe(true);
    expect(EGRESS_ALLOWLIST.map((e) => e.host)).toEqual([
      "data.sec.gov",
      "data-api.ecb.europa.eu",
      "api.fiscaldata.treasury.gov",
    ]);
  });

  it("states terms for every host, so caching and reuse limits are visible", () => {
    expect(EGRESS_ALLOWLIST.every((entry) => entry.termsNote.length > 0)).toBe(true);
  });

  it("derives optional hosts from configured base URLs and ignores malformed ones", () => {
    expect(optionalAllowlistHosts(["https://vendor.example/v1", null, "not a url"])).toEqual([
      "vendor.example",
    ]);
  });
});

describe("outbound discipline", () => {
  it("caches for less time than the shortest freshness window allows", () => {
    // Caching must never be the thing that makes an observation stale.
    expect(OUTBOUND_POLICY.cacheTtlSeconds).toBeLessThan(60 * 60);
    expect(OUTBOUND_POLICY.timeoutMs).toBeGreaterThan(0);
    expect(OUTBOUND_POLICY.maxRetries).toBeGreaterThan(0);
  });

  it("lists egress before credentials in the production requirements", () => {
    const first = PRODUCTION_NETWORK_REQUIREMENTS[0];
    const last = PRODUCTION_NETWORK_REQUIREMENTS.at(-1);
    expect(first).toContain("Outbound HTTPS");
    expect(first).toContain("Free");
    expect(last).toContain("Optionally");
  });
});
