import type { ProviderAdapter } from "@/intelligence/types/provider";
import { registryAssets } from "@/intelligence/identity/registry";
import {
  describeConfiguration,
  liveProvidersConfigured,
  marketDataApiKey,
  marketDataBaseUrl,
  marketDataTimeliness,
  metalsApiKey,
  metalsBaseUrl,
  runtimeRegion,
  secEdgarUserAgent,
  signingKeyId,
  signingPrivateKey,
} from "@/server/config/env";
import { EDGAR_COVERAGE, EDGAR_NON_COVERAGE, SecEdgarAdapter } from "@/server/providers/sec-edgar/adapter";
import { MarketDataAdapter } from "@/server/providers/prices/adapter";
import { loadPrivateKey, publicKeyFromPrivate } from "@/server/signing/sign";
import type { AssetContext } from "@/server/orchestration/assess";
import type { ExecutionContext } from "@/server/types/execution-context";
import type { QuoteTimeliness } from "@/server/types/live-state";

/**
 * Runtime assembly — turning environment configuration into a runnable cycle.
 *
 * The important property here is that an unconfigured deployment produces
 * *nothing*, loudly, rather than something plausible. There is no fallback to
 * fixture data on the server path: fixtures exist to demonstrate the interface
 * in a browser, and promoting them into a server-generated, signed, stored
 * report would attach the credibility of the whole apparatus to invented
 * numbers. `readiness()` says what is missing; the caller decides what to tell
 * the user.
 */

export interface Readiness {
  canRunLive: boolean;
  configuration: ReturnType<typeof describeConfiguration>;
  /** What is missing, in the operator's terms. */
  missing: string[];
  detail: string;
}

export function readiness(): Readiness {
  const configuration = describeConfiguration();
  const missing: string[] = [];
  if (!configuration.secEdgar) missing.push("SEC_EDGAR_USER_AGENT (free; a contact string the SEC requires)");
  if (!configuration.marketData) missing.push("MARKET_DATA_BASE_URL and MARKET_DATA_API_KEY (licensed price feed)");
  if (!configuration.database) missing.push("DATABASE_URL (durable storage)");
  if (!configuration.signing) missing.push("REPORT_SIGNING_PRIVATE_KEY (report signing)");

  const canRunLive = liveProvidersConfigured();
  return {
    canRunLive,
    configuration,
    missing,
    detail: canRunLive
      ? missing.length === 0
        ? "Fully configured."
        : `Live retrieval is possible, but some capabilities are unavailable: ${missing.join("; ")}.`
      : "No live provider is configured, so the server cannot produce a live report. It will not substitute fixture data.",
  };
}

/**
 * Providers the environment can actually use.
 *
 * An adapter is only constructed when its configuration exists. An adapter that
 * exists but is disabled would still appear in the provider list and in the
 * report's provider versions, implying it was consulted.
 */
export function buildLiveAdapters(): ProviderAdapter[] {
  const adapters: ProviderAdapter[] = [];

  const userAgent = secEdgarUserAgent();
  if (userAgent) adapters.push(new SecEdgarAdapter({ userAgent }));

  const baseUrl = marketDataBaseUrl();
  const apiKey = marketDataApiKey();
  if (baseUrl && apiKey) {
    adapters.push(
      new MarketDataAdapter({
        baseUrl,
        apiKey,
        timeliness: parseTimeliness(marketDataTimeliness()),
        symbols: [
          { assetId: "apple", providerSymbol: "AAPL", priceUnit: "share" },
          { assetId: "us-etf", providerSymbol: "SPY", priceUnit: "share" },
        ],
      }),
    );
  }

  const metalsUrl = metalsBaseUrl();
  const metalsKey = metalsApiKey();
  if (metalsUrl && metalsKey) {
    adapters.push(
      new MarketDataAdapter({
        providerId: "metals",
        providerName: "Precious metals price provider",
        baseUrl: metalsUrl,
        apiKey: metalsKey,
        timeliness: parseTimeliness(marketDataTimeliness()),
        // Unit is explicit. A gold quote with an unstated unit is meaningless.
        symbols: [{ assetId: "gold", providerSymbol: "XAUUSD", priceUnit: "troy_ounce" }],
        legalNotes:
          "Spot metal prices are licensed market data. The basis (London spot, unallocated) is recorded with every quote — see GOLD_PRICE_BASIS.md.",
      }),
    );
  }

  return adapters;
}

/**
 * Never guessed. An operator who has not stated what their licence grants gets
 * `unknown`, which the staleness model treats conservatively.
 */
function parseTimeliness(value: string | null): QuoteTimeliness {
  const known: QuoteTimeliness[] = ["real_time", "delayed", "end_of_day"];
  return known.find((t) => t === value) ?? "unknown";
}

/** Asset contexts for the live assessment, drawn from the identity registry. */
export function assetContexts(): AssetContext[] {
  return registryAssets().map((asset) => ({
    assetId: asset.assetId,
    country: asset.country,
    region: asset.region,
    assetClass: asset.assetClass,
  }));
}

/**
 * Assets no configured provider covers.
 *
 * Computed from what is actually configured, not from a static list, so
 * connecting a price feed genuinely changes the answer instead of leaving a
 * stale "unsupported" label behind.
 */
export function unsupportedAssetIds(adapters: ProviderAdapter[]): string[] {
  const covered = new Set<string>();
  for (const adapter of adapters) {
    const descriptor = adapter.describe();
    if (descriptor.mode === "disabled") continue;
    if (descriptor.providerId === "sec-edgar") {
      for (const entry of EDGAR_COVERAGE) covered.add(entry.assetId);
    }
    if (descriptor.capabilities.includes("prices")) {
      for (const assetId of ["apple", "us-etf", "gold"]) covered.add(assetId);
    }
  }
  return registryAssets()
    .map((a) => a.assetId)
    .filter((assetId) => !covered.has(assetId));
}

export { EDGAR_NON_COVERAGE };

/** The execution context this environment can honestly claim. */
export function currentExecutionContext(): ExecutionContext {
  return liveProvidersConfigured() ? "server_live" : "disabled";
}

export function runtimeRegionLabel(): string | null {
  return runtimeRegion();
}

/**
 * Signing material.
 *
 * The private key is read from the environment and used in memory; it is never
 * written to the database, returned by an API, or logged. Only the derived
 * public key and key id leave this function.
 */
export function signingMaterial(): {
  privateKey: string | null;
  trustedKeys: Record<string, string>;
  keyId: string;
} {
  const privateKey = signingPrivateKey();
  if (!privateKey) return { privateKey: null, trustedKeys: {}, keyId: signingKeyId() };
  const derived = publicKeyFromPrivate(loadPrivateKey(privateKey));
  return {
    privateKey,
    trustedKeys: { [derived.keyId]: derived.spki },
    keyId: derived.keyId,
  };
}
