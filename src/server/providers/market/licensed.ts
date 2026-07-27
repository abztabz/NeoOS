import { MarketDataAdapter, type MarketDataAdapterOptions } from "@/server/providers/prices/adapter";
import type {
  MarketAssetClass,
  MarketDataProvider,
  MarketFetchOutcome,
  MarketFetchRequest,
  MarketProviderDescriptor,
} from "@/server/providers/market/provider";
import {
  unavailable,
  type MarketObservation,
  type ObservationClass,
  type ObservationUnavailable,
} from "@/server/types/market-observation";
import type { QuoteTimeliness } from "@/server/types/live-state";

/**
 * The optional licensed feed, demoted to one provider among several.
 *
 * This wraps the existing vendor-neutral price adapter so that a paid
 * subscription becomes an *upgrade* rather than a *prerequisite*. Connecting it
 * improves latency — a delayed or real-time venue quote instead of an official
 * daily publication — and widens instrument coverage. Removing it does not
 * remove prices; it moves the deployment down the hierarchy to whatever free
 * and official sources cover.
 *
 * That framing is the whole correction. A licensed feed is worth having and is
 * not worth pretending to be the only door.
 */

export const LICENSED_PROVIDER_ID = "licensed-market-data";

export interface LicensedProviderOptions extends MarketDataAdapterOptions {
  assetClasses?: MarketAssetClass[];
  /** Delay the operator's agreement actually states. Never inferred. */
  knownDelayMinutes?: number | null;
  instrumentNames?: Record<string, string>;
}

/**
 * Map the operator's stated licence to an observation class.
 *
 * `unknown` deliberately falls to `delayed` rather than to `real_time`. An
 * operator who has not told NeoOS what their licence grants gets the
 * conservative reading, because the cost of understating latency is a slightly
 * tighter freshness window and the cost of overstating it is a false real-time
 * claim on somebody else's data.
 */
export function observationClassForTimeliness(timeliness: QuoteTimeliness): ObservationClass {
  switch (timeliness) {
    case "real_time":
      return "real_time";
    case "end_of_day":
      return "end_of_day";
    case "delayed":
    case "unknown":
      return "delayed";
  }
}

export class LicensedMarketDataProvider implements MarketDataProvider {
  private readonly adapter: MarketDataAdapter;
  private readonly configured: boolean;

  constructor(private readonly options: LicensedProviderOptions) {
    this.adapter = new MarketDataAdapter(options);
    this.configured = Boolean(options.baseUrl && options.apiKey);
  }

  describe(): MarketProviderDescriptor {
    const timeliness = this.options.timeliness ?? "unknown";
    let host = "";
    try {
      host = this.options.baseUrl ? new URL(this.options.baseUrl).host : "";
    } catch {
      // A malformed base URL is a configuration error, not a reason to throw
      // while merely describing the provider. It surfaces on the first request.
      host = "";
    }

    return {
      providerId: this.options.providerId ?? LICENSED_PROVIDER_ID,
      providerName: this.options.providerName ?? "Licensed market-data provider",
      sourceName: this.options.providerName ?? "Licensed vendor",
      sourceClass: "licensed_market_data",
      observationClass: observationClassForTimeliness(timeliness),
      knownDelayMinutes: this.options.knownDelayMinutes ?? null,
      assetClasses: this.options.assetClasses ?? ["us_listed_equity", "us_listed_etf", "global_equity"],
      configured: this.configured,
      requiresCredentials: true,
      requiresPaidSubscription: true,
      outboundHosts: host ? [host] : [],
      attribution:
        this.options.legalNotes ??
        "Licensed market data. Redistribution terms and whether quotes may be described as real-time are set by the vendor agreement; NeoOS reports only the latency the operator has configured.",
      unavailableReason: this.configured
        ? null
        : "No licensed market-data credentials are configured. This is an optional upgrade: free and official sources continue to serve the asset classes they cover, at their own stated latency.",
    };
  }

  async observe(request: MarketFetchRequest): Promise<MarketFetchOutcome> {
    if (!this.configured) {
      return {
        observations: [],
        failures: request.assetIds.map((assetId) =>
          unavailable(assetId, "no_provider_configured", [this.describe().providerId]),
        ),
      };
    }

    const outcome = await this.adapter.quotes(request.assetIds, request.asOf);
    const descriptor = this.describe();
    const observations: MarketObservation[] = outcome.quotes.map((quote) => ({
      assetId: quote.assetId,
      instrumentIdentifier: quote.providerSymbol,
      instrumentName: this.options.instrumentNames?.[quote.assetId] ?? quote.providerSymbol,
      venue: quote.venue ?? descriptor.providerName,
      currency: quote.currency,
      price: quote.price,
      priceUnit: quote.priceUnit,
      observedAt: quote.quotedAt,
      retrievedAt: quote.retrievedAt,
      observationClass: observationClassForTimeliness(quote.timeliness),
      sourceClass: "licensed_market_data",
      providerId: quote.providerId,
      sourceName: descriptor.sourceName,
      knownDelayMinutes: descriptor.knownDelayMinutes,
      adjustment: "unknown",
      corporateActionHandling:
        "Not stated by the feed. Adjustment basis must be confirmed with the vendor before this series is compared against a historical one.",
      freshness: "unknown",
      validationState: "validated",
      failureReason: null,
      previousClose: quote.previousClose,
      attribution: descriptor.attribution,
    }));

    const failures: ObservationUnavailable[] = outcome.failures.map((failure) =>
      unavailable(failure.assetId, mapFailureKind(failure.kind), [descriptor.providerId], failure.message),
    );

    return { observations, failures };
  }
}

function mapFailureKind(kind: string) {
  switch (kind) {
    case "unconfigured":
      return "no_provider_configured" as const;
    case "unsupported_symbol":
      return "instrument_not_covered" as const;
    case "rate_limited":
      return "provider_rate_limited" as const;
    case "timeout":
      return "provider_timeout" as const;
    case "network":
      return "environment_no_network" as const;
    case "bad_status":
      return "provider_bad_status" as const;
    case "implausible_value":
      return "implausible_value" as const;
    default:
      return "malformed_response" as const;
  }
}
