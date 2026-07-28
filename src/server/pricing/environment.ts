/**
 * Production pricing safety.
 *
 * The rule this enforces is blunt because the failure it prevents is severe: a
 * fixture price that reaches a production surface is indistinguishable from a
 * real one, and it will be believed. Every guard here is about making that
 * impossible rather than unlikely.
 *
 * The guard fires at startup, not at request time. A deployment configured to
 * serve invented prices should refuse to start, because the alternative is a
 * deployment that serves them until somebody notices.
 */

export type DataEnvironment = "production" | "development" | "test";

export interface PricingPolicy {
  environment: DataEnvironment;
  allowMockPricing: boolean;
  allowFixturePricing: boolean;
  allowSeededQuotes: boolean;
  allowFallbackPriceConstants: boolean;
}

/**
 * What each environment permits.
 *
 * Production permits nothing. Not "discourages" — permits nothing, and the
 * startup check below turns that into a refusal rather than a preference.
 */
export const PRICING_POLICIES: Record<DataEnvironment, PricingPolicy> = {
  production: {
    environment: "production",
    allowMockPricing: false,
    allowFixturePricing: false,
    allowSeededQuotes: false,
    allowFallbackPriceConstants: false,
  },
  development: {
    environment: "development",
    allowMockPricing: true,
    allowFixturePricing: true,
    allowSeededQuotes: true,
    allowFallbackPriceConstants: true,
  },
  test: {
    environment: "test",
    allowMockPricing: true,
    allowFixturePricing: true,
    allowSeededQuotes: true,
    allowFallbackPriceConstants: true,
  },
};

export function currentDataEnvironment(): DataEnvironment {
  const declared = process.env.NEOOS_DATA_ENV;
  if (declared === "production" || declared === "development" || declared === "test") {
    return declared;
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return "test";
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
    return "production";
  }
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

export function pricingPolicy(environment = currentDataEnvironment()): PricingPolicy {
  return PRICING_POLICIES[environment];
}

/** Environment flags that would enable a fake pricing source. */
const FAKE_PRICING_FLAGS = [
  "NEOOS_ALLOW_MOCK_PRICING",
  "NEOOS_ALLOW_FIXTURE_PRICING",
  "NEOOS_ALLOW_SEEDED_QUOTES",
  "NEOOS_ALLOW_FALLBACK_PRICE_CONSTANTS",
] as const;

export interface StartupCheck {
  ok: boolean;
  environment: DataEnvironment;
  violations: string[];
  detail: string;
}

/**
 * Refuse to start a production deployment that would serve invented prices.
 *
 * Called from the pricing service's module scope, so the failure surfaces on
 * first use rather than on first wrong number.
 */
export function checkPricingStartup(
  environment = currentDataEnvironment(),
  env: Record<string, string | undefined> = process.env,
): StartupCheck {
  const violations: string[] = [];

  if (environment === "production") {
    for (const flag of FAKE_PRICING_FLAGS) {
      const value = env[flag];
      if (value === "1" || value === "true") {
        violations.push(`${flag} is enabled in production. Fake pricing sources are never permitted here.`);
      }
    }
  }

  return {
    ok: violations.length === 0,
    environment,
    violations,
    detail:
      violations.length === 0
        ? environment === "production"
          ? "Production pricing policy enforced: no mock, fixture, seeded or fallback-constant prices may enter the data path."
          : `Pricing policy for ${environment}: fixtures and mocks are permitted here and never leave this environment.`
        : violations.join(" "),
  };
}

/**
 * Throw when production is misconfigured.
 *
 * A hard failure rather than a logged warning. A warning about invented prices
 * is a warning nobody reads until after they have acted on one.
 */
export function assertPricingStartup(environment = currentDataEnvironment()): void {
  const check = checkPricingStartup(environment);
  if (!check.ok) {
    throw new Error(
      `NeoOS refused to start the pricing service: ${check.detail} Remove these flags or deploy to a non-production environment.`,
    );
  }
}

/** Whether a fixture-backed provider may be constructed at all. */
export function fixtureProvidersPermitted(environment = currentDataEnvironment()): boolean {
  return pricingPolicy(environment).allowFixturePricing;
}
