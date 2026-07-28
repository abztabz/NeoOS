import {
  deriveUaeGoldPrices,
  GOLD_REFERENCE_EXCLUSIONS,
  goodBuyPrice22K,
  type GoldKarat,
  type UaeGoldPrice,
} from "@/domain/gold/uae-gold";
import { resolveObservation } from "@/server/providers/market/resolver";
import type { MarketDataProvider } from "@/server/providers/market/provider";
import type { MarketObservation } from "@/server/types/market-observation";
import type { PriceFreshness } from "@/server/pricing/quote";

/**
 * The UAE gold board, assembled server-side.
 *
 * Two verified inputs are required and neither is optional: a gold spot price
 * and a USD/AED rate. Where either is missing the board reports why in plain
 * words rather than showing a number with a caveat under it — a caveat under a
 * number is read as a number.
 *
 * The USD/AED peg is a special case handled deliberately. It has held at 3.6725
 * since 1997 and is published by the UAE Central Bank, so it is usable — but as
 * a *documented policy rate*, labelled as such, never presented as an observed
 * live quote. The distinction is invisible on every ordinary day and decisive on
 * the one day it is not.
 */

/** The pegged rate, as published. Used only with `fxIsPolicyFallback: true`. */
export const USD_AED_DOCUMENTED_PEG = 3.6725;
export const USD_AED_PEG_SOURCE =
  "UAE Central Bank documented peg (3.6725 AED per USD, in force since 1997)";

/** Latency classes map onto the price-freshness vocabulary the UI already reads. */
const FRESHNESS_FROM_OBSERVATION: Record<string, PriceFreshness> = {
  real_time: "live",
  delayed: "delayed",
  end_of_day: "previous_close",
  latest_official: "previous_close",
  manual: "manual",
  unavailable: "unavailable",
};

export interface UaeGoldBoard {
  available: boolean;
  prices: Record<GoldKarat, UaeGoldPrice> | null;
  /** Good Buy Price per gram by karat, when a valuation discipline exists. */
  goodBuyPerGram: Record<GoldKarat, number> | null;
  fxIsPolicyFallback: boolean;
  fxSourceName: string;
  exclusions: string;
  /** Shown verbatim when `available` is false. */
  unavailableReason: string | null;
  trail: { providerId: string; outcome: string; detail: string }[];
}

export const PRICING_INACTIVE_MESSAGE =
  "Production pricing architecture is implemented, but live pricing remains inactive until approved provider credentials are configured.";

function unavailableBoard(
  reason: string,
  trail: UaeGoldBoard["trail"] = [],
  fxIsPolicyFallback = true,
): UaeGoldBoard {
  return {
    available: false,
    prices: null,
    goodBuyPerGram: null,
    fxIsPolicyFallback,
    fxSourceName: USD_AED_PEG_SOURCE,
    exclusions: GOLD_REFERENCE_EXCLUSIONS,
    unavailableReason: reason,
    trail,
  };
}

/**
 * Build the board.
 *
 * `goodBuy24KPerGram` is supplied by the caller from NeoOS's own gold valuation
 * rather than computed here, because a Good Buy Price is a judgement and this
 * module is a conversion. Where no valuation exists, no Good Buy Price is shown.
 */
export async function buildUaeGoldBoard(input: {
  providers: MarketDataProvider[];
  now: Date;
  goodBuy24KPerGram?: number | null;
}): Promise<UaeGoldBoard> {
  const outcome = await resolveObservation(input.providers, {
    assetId: "gold-spot-xau-usd",
    assetClass: "gold_spot",
    asOf: input.now.toISOString(),
    horizon: "daily",
    now: input.now,
  });

  const trail = outcome.trail.map((step) => ({
    providerId: step.providerId,
    outcome: step.outcome,
    detail: step.detail,
  }));

  if (!outcome.result.ok) {
    const failure = outcome.result.failure;
    return unavailableBoard(
      // A missing provider is a configuration fact and says so exactly; any
      // other failure reports its own reason rather than being flattened into
      // a generic one.
      failure.kind === "no_provider_configured" || failure.kind === "provider_unauthorized"
        ? PRICING_INACTIVE_MESSAGE
        : failure.message,
      trail,
    );
  }

  const observation: MarketObservation = outcome.result.observation;

  const derived = deriveUaeGoldPrices({
    goldSpotUsdPerTroyOunce: observation.price,
    usdAedRate: USD_AED_DOCUMENTED_PEG,
    spotSourceId: observation.providerId,
    spotSourceName: observation.sourceName,
    quoteTimestamp: observation.observedAt,
    retrievedAt: observation.retrievedAt,
    freshness: FRESHNESS_FROM_OBSERVATION[observation.observationClass] ?? "unavailable",
    fxIsPolicyFallback: true,
  });

  if (!derived.ok) return unavailableBoard(derived.reason, trail);

  const goodBuy24 = input.goodBuy24KPerGram ?? null;

  return {
    available: true,
    prices: derived.prices,
    goodBuyPerGram:
      goodBuy24 !== null && goodBuy24 > 0
        ? { "24K": goodBuy24, "22K": goodBuyPrice22K(goodBuy24) }
        : null,
    fxIsPolicyFallback: true,
    fxSourceName: USD_AED_PEG_SOURCE,
    exclusions: GOLD_REFERENCE_EXCLUSIONS,
    unavailableReason: null,
    trail,
  };
}
