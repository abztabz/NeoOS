import {
  basesAreComparable,
  goldBasisLabels,
  type GoldBasis,
  type GoldPriceBasis,
} from "@/server/providers/gold/basis";
import type { MarketObservation } from "@/server/types/market-observation";

/**
 * The gold evidence bundle.
 *
 * Gold is the asset most likely to be reasoned about from a single number found
 * in a headline, and this household holds a lot of it — most of it in a
 * jurisdiction it cannot easily move capital out of. A briefing that says "gold
 * is at X, up 2%" and stops there is not analysis; it is a price quote wearing
 * analysis clothing.
 *
 * Two rules are enforced structurally rather than by convention:
 *
 *   1. **Spot and futures occupy different fields.** Not the same field with a
 *      label — different fields, so no code path can put a futures settlement
 *      where a spot price is expected. Substituting one for the other is a
 *      several-percent error that looks like a rounding difference, and it is
 *      the single most common way gold analysis goes quietly wrong.
 *   2. **A proxy is never silently promoted.** When no exact spot source is
 *      available, the bundle may carry a proxy — but only in the proxy field,
 *      only with a stated limitation, and never in the spot field.
 *
 * A news article is not a source here. It may enter as `macroEvidence` with its
 * own citation, and it may never be the thing the gold price came from.
 */

/** Bases that genuinely are spot. Anything else cannot fill the spot field. */
const SPOT_BASES: GoldBasis[] = ["london_spot_unallocated", "physical_allocated"];

export function basisIsSpot(basis: GoldBasis): boolean {
  return SPOT_BASES.includes(basis);
}

export interface GoldReferenceLevel {
  label: string;
  pricePerTroyOunce: number;
  currency: string;
  asOf: string;
  sourceName: string;
}

export interface GoldMacroEvidence {
  label: string;
  detail: string;
  sourceName: string;
  observedAt: string;
  /** URL or document reference. A claim with no citation is not admitted. */
  citation: string;
}

/**
 * A price that stands in for spot because no spot source is reachable.
 *
 * The limitation is mandatory. A proxy whose limitation is not stated is
 * indistinguishable from a real spot quote by the time it reaches a reader.
 */
export interface GoldSpotProxy {
  observation: MarketObservation;
  basis: GoldBasis;
  /** Why this is not spot, in plain words. Displayed with the number. */
  limitation: string;
}

export interface GoldEvidenceBundle {
  /** London spot or allocated physical. Never a futures settlement. */
  spot: GoldPriceBasis | null;
  /** Used only when `spot` is null, and always carrying its limitation. */
  spotProxy: GoldSpotProxy | null;
  /** The nearest relevant contract, kept strictly separate from spot. */
  futures: GoldFuturesQuote | null;
  /** The session's move, per the source that published it. Never computed across bases. */
  dailyChangePercent: number | null;
  priorClosePerTroyOunce: number | null;
  /** 52-week range, multi-year averages, or similar. Context, not signal. */
  referenceLevels: GoldReferenceLevel[];
  /** Real rates, currency conditions, policy. Each independently cited. */
  macroEvidence: GoldMacroEvidence[];
  /** Central bank buying, ETF flows, jewellery and industrial demand. */
  structuralDemandEvidence: GoldMacroEvidence[];
  /** Everything absent that a complete bundle would carry. */
  missing: string[];
}

export interface GoldFuturesQuote {
  contractIdentifier: string;
  exchange: string;
  expiry: string;
  settlementPerTroyOunce: number;
  currency: string;
  observedAt: string;
  sourceName: string;
}

/**
 * Assemble a bundle, refusing the substitutions that make gold analysis wrong.
 *
 * Returns what it has plus an explicit list of what it does not, so a briefing
 * can distinguish "gold looks fine" from "gold has one number and no context".
 */
export function assembleGoldBundle(input: {
  spot: GoldPriceBasis | null;
  spotProxy: GoldSpotProxy | null;
  futures: GoldFuturesQuote | null;
  priorClose: GoldPriceBasis | null;
  referenceLevels: GoldReferenceLevel[];
  macroEvidence: GoldMacroEvidence[];
  structuralDemandEvidence: GoldMacroEvidence[];
}): GoldEvidenceBundle {
  const missing: string[] = [];

  // A basis that is not spot cannot occupy the spot field, whatever it was
  // passed as. Rejected here rather than trusted, because the caller is exactly
  // where this mistake gets made.
  const spot = input.spot !== null && basisIsSpot(input.spot.basis) ? input.spot : null;
  if (input.spot !== null && spot === null) {
    missing.push(
      `A ${goldBasisLabels[input.spot.basis].toLowerCase()} quote was offered as spot and refused. It is a different instrument with different delivery and financing terms, and substituting it would misstate the position by a margin that looks like rounding.`,
    );
  }
  if (spot === null && input.spotProxy === null) missing.push("A spot gold price from any source.");
  if (spot === null && input.spotProxy !== null) {
    missing.push(
      `An exact spot source. Using a proxy instead: ${input.spotProxy.limitation}`,
    );
  }
  if (input.futures === null) missing.push("The nearest futures contract, for the spot-to-futures basis.");
  if (input.referenceLevels.length === 0) missing.push("Longer-term reference levels for context.");
  if (input.macroEvidence.length === 0) missing.push("Macro evidence — real rates and currency conditions.");
  if (input.structuralDemandEvidence.length === 0) {
    missing.push("Structural demand evidence — central bank, ETF and physical flows.");
  }

  // The daily change is computed only between two quotes of the same basis and
  // currency. Comparing today's spot to yesterday's futures settlement would
  // produce a change figure that is mostly the basis, presented as a move.
  let dailyChangePercent: number | null = null;
  let priorClosePerTroyOunce: number | null = null;
  if (spot !== null && input.priorClose !== null && basesAreComparable(spot, input.priorClose)) {
    priorClosePerTroyOunce = input.priorClose.pricePerTroyOunce;
    dailyChangePercent =
      ((spot.pricePerTroyOunce - input.priorClose.pricePerTroyOunce) / input.priorClose.pricePerTroyOunce) * 100;
  } else if (spot !== null && input.priorClose !== null) {
    missing.push(
      "A prior close on the same basis and currency. The available prior quote is a different basis, so a change computed against it would report the basis difference as a price move.",
    );
  } else if (input.priorClose === null) {
    missing.push("A prior close on the same basis, for the daily change.");
  }

  return {
    spot,
    spotProxy: spot === null ? input.spotProxy : null,
    futures: input.futures,
    dailyChangePercent,
    priorClosePerTroyOunce,
    referenceLevels: input.referenceLevels,
    macroEvidence: input.macroEvidence,
    structuralDemandEvidence: input.structuralDemandEvidence,
    missing,
  };
}

/**
 * The spot-to-futures basis, when both are present on comparable terms.
 *
 * Reported as its own figure rather than folded into either price. A widening
 * basis is information about financing cost and delivery demand; hiding it
 * inside a blended "gold price" discards the signal and corrupts the level.
 */
export function futuresBasisPercent(bundle: GoldEvidenceBundle): number | null {
  if (bundle.spot === null || bundle.futures === null) return null;
  if (bundle.spot.currency !== bundle.futures.currency) return null;
  return (
    ((bundle.futures.settlementPerTroyOunce - bundle.spot.pricePerTroyOunce) /
      bundle.spot.pricePerTroyOunce) *
    100
  );
}

/**
 * Whether the bundle is complete enough to support a change in gold posture.
 *
 * A price alone is not. Recommending a shift in an asset that is a quarter of
 * this household's wealth, and mostly immobile, on one number and no context is
 * the kind of confidence that should require evidence it does not have.
 */
export function bundleSupportsPostureChange(bundle: GoldEvidenceBundle): {
  supported: boolean;
  reason: string;
} {
  if (bundle.spot === null && bundle.spotProxy === null) {
    return { supported: false, reason: "No gold price is available from any source." };
  }
  if (bundle.spot === null) {
    return {
      supported: false,
      reason: `Only a proxy price is available. ${bundle.spotProxy?.limitation ?? ""} A posture change needs an exact spot basis.`.trim(),
    };
  }
  if (bundle.macroEvidence.length === 0) {
    return {
      supported: false,
      reason:
        "A price with no macro context cannot support a posture change. Gold moves on real rates and currency conditions, and a level without them is not a reason.",
    };
  }
  return {
    supported: true,
    reason: "Spot basis, prior close and macro context are all present.",
  };
}
