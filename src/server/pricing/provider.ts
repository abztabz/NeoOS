import type { InstrumentIdentity } from "@/server/pricing/instrument";
import type { MarketQuote } from "@/server/pricing/quote";

/**
 * The pricing provider contract.
 *
 * Providers are called from the server only. A UI component that fetched a
 * quote directly would put the credential in the browser and skip validation,
 * freshness classification and the cache — which is to say it would skip every
 * control in this directory.
 *
 * The flow is fixed:
 *
 *   UI → pricing service → provider adapter → normalized quote → validation
 *      → freshness → cache → UI
 *
 * A provider's job is narrow: take a verified identity, return something the
 * validator can look at. It does not decide whether its own answer is fresh
 * enough, and it does not get to mark itself trustworthy.
 */

export type ProviderHealthState = "ok" | "degraded" | "unconfigured" | "failing";

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  state: ProviderHealthState;
  /** Present when the provider cannot be used, in the operator's terms. */
  reason: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export interface ProviderDescriptor {
  providerId: string;
  providerName: string;
  /** The institution behind the data, where it differs from the vendor. */
  sourceName: string;
  assetTypes: string[];
  requiresCredentials: boolean;
  requiresPaidSubscription: boolean;
  outboundHosts: string[];
  /** Terms and attribution. Displayed in the evidence view, never hidden. */
  attribution: string;
  /**
   * Rank in the fallback order. Lower is consulted first. Ties break on
   * whichever was registered earlier, deterministically.
   */
  priority: number;
}

export interface PricingProvider {
  describe(): ProviderDescriptor;
  getQuote(instrument: InstrumentIdentity): Promise<MarketQuote>;
  getBatchQuotes?(instruments: InstrumentIdentity[]): Promise<MarketQuote[]>;
  getHealthStatus(): Promise<ProviderHealth>;
}

/**
 * A recorded change of source.
 *
 * When a preferred provider fails and a secondary answers, that is a fact about
 * the number, not an implementation detail. Silently switching would let the
 * evidence view claim a price came from a source that never returned it.
 */
export interface SourceSwitch {
  from: string;
  to: string;
  reason: string;
  at: string;
}

/** Everything a reader needs in order to disagree with a displayed price. */
export interface PriceEvidence {
  providerName: string;
  sourceId: string;
  sourceName: string;
  providerInstrumentId: string | null;
  venue: string | null;
  quoteType: string;
  nativeCurrency: string;
  quoteTimestamp: string;
  retrievedAt: string;
  freshness: string;
  marketState: string;
  rawUnit: string | null;
  /** Stated only when one was applied. Never implied. */
  fxConversion: string | null;
  unitConversion: string | null;
  sourceSwitches: SourceSwitch[];
  attribution: string;
}
