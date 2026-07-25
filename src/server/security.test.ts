// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static security invariants.
 *
 * These are the checks that would otherwise rely on nobody making a specific
 * mistake. Each one corresponds to a way credentials could reach the browser,
 * and each is cheap enough to run on every commit.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const FILES = walk(SRC).map((path) => ({ path, source: readFileSync(path, "utf8") }));
const CLIENT_FILES = FILES.filter((f) => /^\s*["']use client["']/m.test(f.source));

/** Server modules that read configuration or hold credentials in memory. */
const CREDENTIALED = [
  "@/server/config/env",
  "@/server/config/portfolio",
  "@/server/persistence",
  "@/server/providers",
  "@/server/signing",
  "@/server/runtime",
  "@/server/api",
  "@/server/orchestration",
];

describe("credentials cannot reach the browser", () => {
  it("finds client components to check, so this suite cannot pass vacuously", () => {
    expect(CLIENT_FILES.length).toBeGreaterThan(5);
  });

  it("no client component imports a credentialed server module", () => {
    const offenders: string[] = [];
    for (const file of CLIENT_FILES) {
      for (const credentialedModule of CREDENTIALED) {
        if (file.source.includes(`from "${credentialedModule}`)) {
          offenders.push(`${file.path.replace(SRC, "src")} imports ${credentialedModule}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("client components may import server TYPE modules, which hold no configuration", () => {
    // The status panel needs the live-state labels. Those modules must stay
    // free of configuration reads for that to remain safe.
    for (const name of ["types/live-state.ts", "types/report-envelope.ts", "types/execution-context.ts"]) {
      const file = FILES.find((f) => f.path.endsWith(join("server", name)));
      expect(file, name).toBeDefined();
      expect(file!.source).not.toContain("process.env");
      expect(file!.source).not.toContain("@/server/config");
    }
  });

  it("no source file exposes a credential under a NEXT_PUBLIC_ name", () => {
    // Next.js inlines only NEXT_PUBLIC_ variables into client bundles, so a
    // credential given that prefix is published by definition.
    const offenders = FILES.filter((f) => /NEXT_PUBLIC_\w*(KEY|SECRET|TOKEN|PASSWORD|URL)/i.test(f.source));
    expect(offenders.map((f) => f.path.replace(SRC, "src"))).toEqual([]);
  });

  it("only src/server/config/env.ts reads process.env for credentials", () => {
    const credentialNames = /process\.env\.(SEC_EDGAR_USER_AGENT|MARKET_DATA_API_KEY|METALS_API_KEY|DATABASE_URL|REPORT_SIGNING_PRIVATE_KEY|CRON_SECRET|OPERATOR_API_TOKEN|NOTIFICATION_WEBHOOK_URL)/;
    const offenders = FILES.filter(
      (f) => credentialNames.test(f.source) && !f.path.endsWith(join("server", "config", "env.ts")),
    );
    expect(offenders.map((f) => f.path.replace(SRC, "src"))).toEqual([]);
  });

  it("env.ts guards against being loaded in a browser", () => {
    const env = FILES.find((f) => f.path.endsWith(join("server", "config", "env.ts")));
    expect(env).toBeDefined();
    expect(env!.source).toContain('typeof window !== "undefined"');
    // The guard must actually run at module scope, not merely be exported.
    expect(env!.source).toMatch(/^assertServerOnly\(\);$/m);
  });

  it("no API route echoes a secret back to the caller", () => {
    const routes = FILES.filter((f) => f.path.includes(join("app", "api")) && f.path.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThan(4);
    for (const route of routes) {
      for (const forbidden of [
        "cronSecret()",
        "operatorApiToken()",
        "signingPrivateKey()",
        "marketDataApiKey()",
        "databaseUrl()",
      ]) {
        expect(route.source.includes(forbidden), `${route.path} references ${forbidden}`).toBe(false);
      }
    }
  });

  it("authorisation is not skipped on any write route", () => {
    const writeRoutes = FILES.filter(
      (f) => f.path.includes(join("app", "api")) && /export async function POST/.test(f.source),
    );
    expect(writeRoutes.length).toBeGreaterThan(1);
    for (const route of writeRoutes) {
      expect(/authorize(Operator|Scheduler)\(request\)/.test(route.source), route.path).toBe(true);
    }
  });

  it("the client-side example provider carries an env var name, never a value", () => {
    // It ships unconfigured on purpose: a browser cannot read a non-public
    // variable, so this adapter can only ever report itself disabled.
    const http = FILES.find((f) => f.path.endsWith(join("adapters", "http-provider.ts")));
    expect(http).toBeDefined();
    expect(http!.source).toContain("EnvVar");
    expect(http!.source).not.toMatch(/NEXT_PUBLIC_/);
  });
});
