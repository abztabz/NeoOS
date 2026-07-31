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
import { FreePriceAdapter } from "@/server/providers/prices/free-adapter";
import { currentNetworkEnvironment, egressBlockedReason } from "@/server/config/network";
import type { MarketDataProvider } from "@/server/providers/market/provider";
import { describeMarketCapability, type MarketCapabilityReport } from "@/server/providers/market/resolver";
import { LicensedMarketDataProvider } from "@/server/providers/market/licensed";
import { EcbFxProvider } from "@/server/providers/market/official/ecb-fx";
import { TreasuryYieldProvider } from "@/server/providers/market/official/treasury-yields";
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
  /** Capabilities an optional paid upgrade would add. Never listed as missing. */
  optionalUpgrades: string[];
  detail: string;
  /** Which environment this is, and whether it can reach out at all. */
  network: { environment: string; egressBlockedReason: string | null };
  market: MarketCapabilityReport;
}

/**
 * What this deployment can and cannot do, said precisely.
 *
 * The correction embodied here: `missing` lists only things whose absence is a
 * genuine gap, and an optional licensed feed is not one. It moved to
 * `optionalUpgrades`, because listing a paid subscription under "missing"
 * invited exactly the reading that NeoOS is broken without one.
 *
 * Egress is reported separately from configuration for the same reason. A
 * sandbox with no outbound socket and a deployment with no subscription are
 * different problems with different fixes, and only one of them costs money.
 */
export function readiness(): Readiness {
  const configuration = describeConfiguration();
  const missing: string[] = [];
  const optionalUpgrades: string[] = [];

  if (!configuration.secEdgar) {
    missing.push("SEC_EDGAR_USER_AGENT (free; a contact string the SEC requires)");
  }
  if (!configuration.database) missing.push("DATABASE_URL (durable storage)");
  if (!configuration.signing) missing.push("REPORT_SIGNING_PRIVATE_KEY (report signing)");

  if (!configuration.marketData) {
    optionalUpgrades.push(
      "MARKET_DATA_BASE_URL and MARKET_DATA_API_KEY — an optional licensed feed. It lowers latency from official daily publication to delayed or real-time venue quotes and widens instrument coverage. No part of the daily briefing requires it.",
    );
  }
  if (!configuration.metals) {
    optionalUpgrades.push(
      "METALS_BASE_URL and METALS_API_KEY — an optional licensed spot metals feed. Without it, gold spot must be entered manually with a citation; a futures settlement is never substituted for it.",
    );
  }

  const blocked = egressBlockedReason();
  const market = describeMarketCapability(buildMarketProviders());
  const canRunLive = liveProvidersConfigured() || market.anyProviderUsable;

  const detail = blocked
    ? `${blocked} Configuration is unaffected: ${missing.length === 0 ? "nothing required is missing" : `still missing ${missing.join("; ")}`}.`
    : canRunLive
      ? missing.length === 0
        ? `Fully configured. ${market.detail}`
        : `Retrieval is possible. Still missing: ${missing.join("; ")}. ${market.detail}`
      : "No provider is reachable and none is configured, so the server cannot produce a current report. It will not substitute fixture data.";

  return {
    canRunLive,
    configuration,
    missing,
    optionalUpgrades,
    detail,
    network: { environment: currentNetworkEnvironment(), egressBlockedReason: blocked },
    market,
  };
}

/**
 * The market-data providers this deployment has, free ones included.
 *
 * The two official adapters are always constructed. They need no credentials,
 * so there is nothing to gate them on — and constructing them unconditionally
 * is what makes the health endpoint able to say "free FX and Treasury coverage
 * exists here" rather than reporting an empty provider list whenever no
 * subscription is present.
 *
 * When egress is blocked they are still constructed and still listed, carrying
 * the reason. A provider that vanishes when the network is down cannot explain
 * why the network being down is not a licensing problem.
 */
export function buildMarketProviders(): MarketDataProvider[] {
  const blocked = egressBlockedReason();
  const providers: MarketDataProvider[] = [
    new EcbFxProvider({
      egressBlockedReason: blocked,
      pairs: [
        // AED is pegged to the USD and is not in the ECB reference set, so the
        // household's base currency is reached through USD rather than claimed
        // directly. NPR is likewise absent; both are declared unsupported by
        // this provider instead of being approximated.
        { assetId: "fx-eur-usd", quoteCurrency: "USD", instrumentName: "EUR/USD" },
        { assetId: "fx-usd-eur", quoteCurrency: "USD", invert: true, instrumentName: "USD/EUR" },
        { assetId: "fx-eur-inr", quoteCurrency: "INR", instrumentName: "EUR/INR" },
      ],
    }),
    new TreasuryYieldProvider({
      egressBlockedReason: blocked,
      series: [
        {
          assetId: "us-treasury-marketable",
          securityDescription: "Total Marketable",
          instrumentName: "US Treasury total marketable average interest rate",
        },
      ],
    }),
  ];

  const baseUrl = marketDataBaseUrl();
  const apiKey = marketDataApiKey();
  if (baseUrl && apiKey) {
    providers.push(
      new LicensedMarketDataProvider({
        baseUrl,
        apiKey,
        timeliness: parseTimeliness(marketDataTimeliness()),
        assetClasses: ["us_listed_equity", "us_listed_etf", "global_equity"],
        symbols: [
          { assetId: "apple", providerSymbol: "AAPL", priceUnit: "share" },
          { assetId: "us-etf", providerSymbol: "SPY", priceUnit: "share" },
        ],
        instrumentNames: { apple: "Apple Inc.", "us-etf": "SPDR S&P 500 ETF Trust" },
      }),
    );
  }

  const metalsUrl = metalsBaseUrl();
  const metalsKey = metalsApiKey();
  if (metalsUrl && metalsKey) {
    providers.push(
      new LicensedMarketDataProvider({
        providerId: "licensed-metals",
        providerName: "Licensed precious metals provider",
        baseUrl: metalsUrl,
        apiKey: metalsKey,
        timeliness: parseTimeliness(marketDataTimeliness()),
        assetClasses: ["gold_spot"],
        symbols: [{ assetId: "gold", providerSymbol: "XAUUSD", priceUnit: "troy_ounce" }],
        instrumentNames: { gold: "Gold, London spot unallocated" },
        legalNotes:
          "Spot metal prices are licensed market data. The basis (London spot, unallocated) is recorded with every quote, and a futures settlement is never substituted for it — see GOLD_PRICE_BASIS.md.",
      }),
    );
  }

  return providers;
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

  // Free public prices, always. There is no credential to be half-configured,
  // so the reasoning above about disabled providers implying consultation does
  // not apply: this one is genuinely consulted on every run.
  //
  // It is registered here as well as in `buildPricingProviders()` because the
  // two pipelines feed different surfaces. The opportunity cards read the
  // report, and only what runs here reaches the report.
  adapters.push(new FreePriceAdapter());

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
