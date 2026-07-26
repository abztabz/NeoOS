import { findSeries } from "@/domain/statistics/registry";
import type { ObservationState, StatisticalObservation } from "@/domain/statistics/types";

/**
 * What state an observation is in, as at a given moment.
 *
 * The distinction that earns its keep is `delayed` versus `unavailable`. A
 * figure past its expected publication date but not yet released is a normal
 * condition of official statistics; a source that cannot be reached is a fault.
 * Reporting both as "no data" would make an ordinary two-week lag look like a
 * broken system, and would train the reader to ignore the one that matters.
 */

export interface FreshnessAssessment {
  state: ObservationState;
  /** Days from reference-period end to `asOf`. */
  ageDays: number;
  /** Confidence multiplier, matching the evidence-policy decay pattern. */
  confidenceMultiplier: number;
  reason: string;
}

/** Same shape as EVIDENCE_POLICY.md §2, so statistics decay like everything else. */
const MULTIPLIER: Record<ObservationState, number> = {
  current: 1,
  delayed: 1,
  stale: 0.75,
  superseded: 0,
  unavailable: 0,
};

export function assessObservation(
  observation: StatisticalObservation,
  options: { now: Date; supersededBy?: string | null },
): FreshnessAssessment {
  const series = findSeries(observation.seriesId);
  const periodEnd = Date.parse(observation.referencePeriodEnd);
  const ageDays = Math.floor((options.now.getTime() - periodEnd) / 86_400_000);

  if (options.supersededBy) {
    return {
      state: "superseded",
      ageDays,
      confidenceMultiplier: MULTIPLIER.superseded,
      reason: `Revised by ${options.supersededBy}. Kept for the record, not used.`,
    };
  }

  if (!series) {
    // An unregistered series has no cadence, so no horizon can be applied. It is
    // usable but never claimed to be current.
    return {
      state: "stale",
      ageDays,
      confidenceMultiplier: MULTIPLIER.stale,
      reason: `${observation.seriesId} is not in the series registry, so its publication cadence is unknown and it is not treated as current.`,
    };
  }

  // A standing fact does not age. It changes, and is re-verified rather than
  // re-published — so the clock runs from when NeoOS last confirmed it.
  if (series.standing) {
    const sinceRetrieval = Math.floor(
      (options.now.getTime() - Date.parse(observation.retrievedAt)) / 86_400_000,
    );
    return sinceRetrieval > series.staleAfterDays
      ? {
          state: "stale",
          ageDays,
          confidenceMultiplier: MULTIPLIER.stale,
          reason: `${series.label} has not been re-verified for ${sinceRetrieval} days. It does not expire, but it can change, and a change here is the largest single event this position can face.`,
        }
      : {
          state: "current",
          ageDays,
          confidenceMultiplier: MULTIPLIER.current,
          reason: `${series.label} is a standing policy fact, verified ${sinceRetrieval} days ago.`,
        };
  }

  if (ageDays > series.staleAfterDays) {
    return {
      state: "stale",
      ageDays,
      confidenceMultiplier: MULTIPLIER.stale,
      reason: `Describes a period ending ${ageDays} days ago, past the ${series.staleAfterDays}-day horizon for ${series.label}.`,
    };
  }

  return {
    state: "current",
    ageDays,
    confidenceMultiplier: MULTIPLIER.current,
    reason: `${series.label} for a period ending ${ageDays} days ago, inside its ${series.staleAfterDays}-day horizon.`,
  };
}

/**
 * Whether a series is overdue: expected by now and nothing published.
 *
 * Separate from any observation, because the interesting case is precisely when
 * there is no record to assess.
 */
export function isPublicationOverdue(
  seriesId: string,
  latestPeriodEnd: string | null,
  now: Date,
): { overdue: boolean; reason: string } {
  const series = findSeries(seriesId);
  if (!series || series.standing) return { overdue: false, reason: "" };

  if (latestPeriodEnd === null) {
    return { overdue: true, reason: `Nothing has ever been recorded for ${series.label}.` };
  }

  // The next period is expected to close a month on, then publish after the lag.
  const nextExpected =
    Date.parse(latestPeriodEnd) + (30 + series.publicationLagDays) * 86_400_000;
  const overdueBy = Math.floor((now.getTime() - nextExpected) / 86_400_000);

  return overdueBy > 0
    ? {
        overdue: true,
        reason: `${series.label} is ${overdueBy} days past its expected publication. Delayed, not missing — the last figure still stands.`,
      }
    : { overdue: false, reason: "" };
}

/**
 * The latest usable observation of a series.
 *
 * Highest vintage wins for a given period, and the most recent period wins
 * overall. Superseded vintages stay in the record and are never returned.
 */
export function latestObservation(
  observations: StatisticalObservation[],
  seriesId: string,
): StatisticalObservation | null {
  const superseded = new Set(
    observations.map((o) => o.supersedes).filter((id): id is string => id !== null),
  );
  const candidates = observations.filter(
    (o) => o.seriesId === seriesId && !superseded.has(o.observationId),
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    if (current.referencePeriodEnd !== best.referencePeriodEnd) {
      return current.referencePeriodEnd > best.referencePeriodEnd ? current : best;
    }
    return current.vintage > best.vintage ? current : best;
  });
}
