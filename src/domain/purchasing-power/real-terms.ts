import { calculated, modelAssumption, unknown, type Attributed } from "@/domain/profile/provenance";
import { assessObservation, latestObservation } from "@/domain/statistics/freshness";
import { deflatorFor } from "@/domain/statistics/registry";
import {
  DEFLATOR_KIND,
  isUsable,
  type ObservationState,
  type StatisticalObservation,
} from "@/domain/statistics/types";

/**
 * Nominal to real.
 *
 * This is the layer the whole purchasing-power provider exists for, and it
 * carries a correction that must survive having an index available: growth
 * measured in a currency is not growth in purchasing power, and the two
 * directions are not equally knowable.
 *
 * See docs/PURCHASING_POWER_PROVIDER.md §7 and docs/HISTORICAL_TRENDS.md §5.
 */

/* ---------------- the asymmetry, without an index ---------------- */

export type NominalDirection = "rose" | "fell" | "flat";

export interface NominalOnlyReading {
  /** Whether a real-terms claim may be made at all. */
  claimable: boolean;
  signal: "threat" | "neutral";
  statement: string;
}

/**
 * What may be said about a nominal change when no price index is available.
 *
 * **A nominal fall is a real fall of at least the same size whenever inflation
 * is non-negative.** That is sound on the evidence available, so a decline may
 * still be named a threat.
 *
 * **A nominal rise proves nothing.** Up 12% with prices up 15% is erosion, and
 * without an index there is no way to tell which happened. Asserting the good
 * reading would be asserting something NeoOS has no basis for.
 *
 * The asymmetry is provable rather than a convention, and it happens to point
 * the same way as the asymmetric attention to ruin in MORPHEUS_CHARACTER.md §2.
 */
export function readNominalWithoutIndex(direction: NominalDirection): NominalOnlyReading {
  if (direction === "fell") {
    return {
      claimable: true,
      signal: "threat",
      statement:
        "This fell in nominal terms. Unless prices also fell, it fell in real terms by at least as much.",
    };
  }
  if (direction === "rose") {
    return {
      claimable: false,
      signal: "neutral",
      statement:
        "This rose in nominal terms. Without a price index for your jurisdiction, NeoOS cannot say whether that is real growth or erosion, and will not guess.",
    };
  }
  return {
    claimable: false,
    signal: "neutral",
    statement: "This was flat in nominal terms. Whether it held its purchasing power is unknown.",
  };
}

/* ---------------- with an index ---------------- */

export interface RealChange {
  nominalChange: number;
  /** Proportion, so 0.04 is 4%. */
  priceChange: number;
  realChange: number;
  /** Freshness of the index used. Travels with the figure, never a footnote. */
  indexState: ObservationState;
  fromPeriodEnd: string;
  toPeriodEnd: string;
  jurisdiction: string;
  citations: string[];
}

export interface RealTermsInput {
  nominalFrom: number;
  nominalTo: number;
  /** Whose purchasing power. Never the anchor currency's, never a peg's. */
  jurisdiction: string;
  observations: StatisticalObservation[];
  now: Date;
}

/**
 * Deflate a nominal change into a real one.
 *
 * Three refusals are load-bearing.
 *
 * **Only a domestic price level may deflate.** A policy rate cannot, a currency
 * regime cannot, and imported monetary conditions cannot. They are related
 * evidence about the same economy and they measure different things.
 *
 * **Only this jurisdiction's index may deflate this jurisdiction's figures.**
 * A pegged currency imports the anchor's monetary policy, not the anchor's
 * prices. Using US CPI for a dirham figure because the dirham is pegged to the
 * dollar is the specific error this function refuses to make.
 *
 * **Two observations are needed, from different periods.** One index level
 * measures nothing; a change needs a start and an end.
 */
export function realChange(input: RealTermsInput): Attributed<RealChange> {
  const basis = `Nominal change deflated by the ${input.jurisdiction} price level.`;
  const series = deflatorFor(input.jurisdiction);

  if (!series) {
    return unknown<RealChange>(basis, [
      `A price index for ${input.jurisdiction}. NeoOS will not substitute another jurisdiction's, whatever the currency arrangement between them.`,
    ]);
  }

  // Belt and braces: the registry says this is a price level, and the records
  // must agree. A series mislabelled at ingestion must not be able to deflate.
  const relevant = input.observations.filter(
    (o) =>
      o.seriesId === series.seriesId &&
      o.jurisdiction === input.jurisdiction &&
      o.evidenceKind === DEFLATOR_KIND,
  );

  const latest = latestObservation(relevant, series.seriesId);
  if (!latest) {
    return unknown<RealChange>(basis, [`Published ${series.label} figures.`]);
  }

  const latestState = assessObservation(latest, { now: input.now });
  if (!isUsable(latestState.state)) {
    return unknown<RealChange>(basis, [
      `A usable ${series.label} figure — the most recent is ${latestState.state}.`,
    ]);
  }

  // The earlier point: the oldest usable observation of a different period.
  const earlier = relevant
    .filter((o) => o.referencePeriodEnd < latest.referencePeriodEnd)
    .sort((a, b) => (a.referencePeriodEnd < b.referencePeriodEnd ? -1 : 1))[0];

  if (!earlier) {
    return unknown<RealChange>(basis, [
      `An earlier ${series.label} figure. One index level measures nothing — a change needs two.`,
    ]);
  }

  if (earlier.seasonalAdjustment !== latest.seasonalAdjustment) {
    // Comparing adjusted with unadjusted is a mistake that looks like a signal.
    return unknown<RealChange>(basis, [
      `${series.label} figures on the same seasonal-adjustment basis. The two available differ, and comparing them would manufacture a movement.`,
    ]);
  }

  if (earlier.value <= 0 || input.nominalFrom === 0) {
    return unknown<RealChange>(basis, ["A non-zero starting point for both the figure and the index."]);
  }

  const nominalChange = (input.nominalTo - input.nominalFrom) / Math.abs(input.nominalFrom);
  const priceChange = (latest.value - earlier.value) / earlier.value;
  // Deflate rather than subtract: at low rates the difference is small, at high
  // rates it is not, and a generational horizon spends time at both.
  const real = (1 + nominalChange) / (1 + priceChange) - 1;

  const result: RealChange = {
    nominalChange,
    priceChange,
    realChange: real,
    indexState: latestState.state,
    fromPeriodEnd: earlier.referencePeriodEnd,
    toPeriodEnd: latest.referencePeriodEnd,
    jurisdiction: input.jurisdiction,
    citations: [earlier.sourceRef, latest.sourceRef],
  };

  const stateNote =
    latestState.state === "current"
      ? ""
      : ` Using an index that is ${latestState.state}: ${latestState.reason}`;

  // A real figure resting on a stale index is a different claim from a real
  // figure, and the difference belongs on the figure rather than in a footnote.
  return latestState.state === "current"
    ? calculated(
        result,
        `${basis} ${series.label}, ${earlier.referencePeriodEnd} to ${latest.referencePeriodEnd}.`,
        [series.seriesId],
      )
    : modelAssumption(
        result,
        `${basis} ${series.label}, ${earlier.referencePeriodEnd} to ${latest.referencePeriodEnd}.${stateNote}`,
        [series.seriesId],
      );
}

/**
 * The signal a real change carries.
 *
 * Once purchasing power is known, the asymmetry in `readNominalWithoutIndex`
 * is no longer needed for the rise case — a real rise is a real rise. The
 * threat side keeps its lower threshold, because attention to ruin stays
 * asymmetric whatever the evidence.
 */
export const REAL_THREAT_THRESHOLD = 0.02;
export const REAL_OPPORTUNITY_THRESHOLD = 0.04;

export function realSignal(change: RealChange): "threat" | "opportunity" | "neutral" {
  if (change.realChange <= -REAL_THREAT_THRESHOLD) return "threat";
  if (change.realChange >= REAL_OPPORTUNITY_THRESHOLD) return "opportunity";
  return "neutral";
}

/**
 * The case worth naming out loud: nominal growth that is real erosion.
 *
 * Invisible in every nominal report, and it is how a large cash position loses
 * a generation's purchasing power while looking safe.
 */
export function isMoneyIllusion(change: RealChange): boolean {
  return change.nominalChange > 0 && change.realChange < 0;
}
