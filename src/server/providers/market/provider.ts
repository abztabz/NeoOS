import type {
  DecisionHorizon,
  MarketObservation,
  ObservationClass,
  ObservationSourceClass,
  ObservationUnavailable,
} from "@/server/types/market-observation";

/**
 * The provider-neutral market-data contract.
 *
 * One interface for every source class: an official central bank endpoint, a
 * free delayed-quote vendor, a licensed institutional feed, and a manual
 * operator entry all implement this and are indistinguishable to the caller
 * except through the metadata they declare about themselves.
 *
 * That indistinguishability is the point. The previous architecture had one
 * adapter, it was a licensed vendor, and so "no market data" and "no licence"
 * became the same sentence. Here a licensed vendor is one implementation among
 * several, and removing it degrades latency rather than removing prices.
 *
 * Providers declare capability honestly and are taken at their word about
 * nothing else: `describe()` states what a provider covers and at what latency,
 * and the resolver verifies coverage against the returned observation rather
 * than trusting the declaration.
 */

/** Asset classes the market layer can be asked about. */
export const marketAssetClasses = [
  "us_listed_equity",
  "us_listed_etf",
  "global_equity",
  "ae_listed_equity",
  "np_listed_equity",
  "gold_spot",
  "gold_futures",
  "fx_pair",
  "government_bond_yield",
  "market_index",
  "crypto",
] as const;
export type MarketAssetClass = (typeof marketAssetClasses)[number];

export const marketAssetClassLabels: Record<MarketAssetClass, string> = {
  us_listed_equity: "US-listed equity",
  us_listed_etf: "US-listed ETF",
  global_equity: "Global equity",
  ae_listed_equity: "UAE-listed equity",
  np_listed_equity: "Nepal-listed equity",
  gold_spot: "Gold spot",
  gold_futures: "Gold futures",
  fx_pair: "FX pair",
  government_bond_yield: "Government bond yield",
  market_index: "Market index",
  crypto: "Crypto",
};

/** What a provider says about itself. Safe to call with no network and no config. */
export interface MarketProviderDescriptor {
  providerId: string;
  providerName: string;
  /** The institution behind the data, which may differ from the vendor serving it. */
  sourceName: string;
  sourceClass: ObservationSourceClass;
  /** The best latency this provider can deliver. Never aspirational. */
  observationClass: ObservationClass;
  /** Stated publication delay, where the source discloses one. */
  knownDelayMinutes: number | null;
  assetClasses: MarketAssetClass[];
  configured: boolean;
  /** True when the provider needs credentials that are absent. */
  requiresCredentials: boolean;
  /** True when using this provider costs money. Free official sources are false. */
  requiresPaidSubscription: boolean;
  /** Hosts this provider will contact. Documented for the egress allowlist. */
  outboundHosts: string[];
  /** Terms, attribution and redistribution constraints. Displayed, never hidden. */
  attribution: string;
  /** Why the provider is unusable right now, when it is. */
  unavailableReason: string | null;
}

export interface MarketFetchRequest {
  assetIds: string[];
  /** Cycle timestamp. Providers must not read the wall clock themselves. */
  asOf: string;
  horizon: DecisionHorizon;
}

export interface MarketFetchOutcome {
  observations: MarketObservation[];
  failures: ObservationUnavailable[];
}

export interface MarketDataProvider {
  describe(): MarketProviderDescriptor;
  observe(request: MarketFetchRequest): Promise<MarketFetchOutcome>;
}

/**
 * Whether a provider is worth consulting at all.
 *
 * Separated from `configured` because they diverge in the case that matters
 * most: an official free endpoint is *always* configured (there is nothing to
 * configure) and is still unusable when the environment blocks egress. Reporting
 * it as unconfigured would repeat exactly the conflation this work removes.
 */
export function providerIsUsable(descriptor: MarketProviderDescriptor): boolean {
  return descriptor.configured && descriptor.unavailableReason === null;
}

/**
 * Providers that need no credentials and cost nothing.
 *
 * The existence of a non-empty result here is the standing refutation of "NeoOS
 * needs a paid API". It is computed from the registry rather than asserted in
 * prose, so the claim cannot drift from the code.
 */
export function freeProviders(descriptors: MarketProviderDescriptor[]): MarketProviderDescriptor[] {
  return descriptors.filter((d) => !d.requiresPaidSubscription && !d.requiresCredentials);
}
