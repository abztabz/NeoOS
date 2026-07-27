import {
  sourcePolicyFor,
  type AssetClassSourcePolicy,
  type CoverageState,
} from "@/server/providers/market/hierarchy";
import {
  providerIsUsable,
  type MarketAssetClass,
  type MarketDataProvider,
  type MarketProviderDescriptor,
} from "@/server/providers/market/provider";
import {
  classifyFreshness,
  FRESHNESS_PERMISSIONS,
  OBSERVATION_SOURCE_RANK,
  unavailable,
  type DecisionHorizon,
  type MarketObservation,
  type ObservationResult,
  type ObservationUnavailable,
} from "@/server/types/market-observation";

/**
 * Fallback resolution — walking the source hierarchy until something usable
 * appears, and reporting honestly when nothing does.
 *
 * Three properties matter here, and each one exists because its absence would
 * reintroduce the failure this work corrects:
 *
 *   1. **Failure isolation.** One provider throwing does not end the walk. A
 *      blocked egress to the ECB must not prevent the Treasury adapter from
 *      being tried, and neither must prevent a manual entry from being used.
 *   2. **No silent substitution.** The resolver never returns an observation for
 *      a different instrument, a different basis, or a different date than the
 *      one asked for. Falling back means trying another *source*, never another
 *      *number*.
 *   3. **Downgrade, not discard.** An expired observation still travels back as
 *      a failure carrying its age, so the briefing can say why a rating is
 *      withheld instead of showing an unexplained blank.
 */

export interface ResolveRequest {
  assetId: string;
  assetClass: MarketAssetClass;
  asOf: string;
  horizon: DecisionHorizon;
  now: Date;
}

export interface ResolveOutcome {
  result: ObservationResult;
  /** Providers consulted, in order, with what each one did. */
  trail: ResolutionStep[];
  policy: AssetClassSourcePolicy;
}

export interface ResolutionStep {
  providerId: string;
  sourceClass: string;
  outcome: "observed" | "no_coverage" | "not_usable" | "failed" | "rejected_freshness";
  detail: string;
}

/**
 * Order providers for one asset class.
 *
 * Sorted by the class's declared source order first, then by the global source
 * rank as a tiebreak, then by latency — a delayed venue quote beats an
 * end-of-day mark from the same source class, all else equal.
 */
export function orderProviders(
  providers: MarketDataProvider[],
  policy: AssetClassSourcePolicy,
): MarketDataProvider[] {
  const positionOf = (descriptor: MarketProviderDescriptor): number => {
    const declared = policy.order.indexOf(descriptor.sourceClass);
    // A source class the policy does not list is permitted only after every
    // listed one. It is not excluded, because excluding it would turn an
    // incomplete policy into a hard outage.
    return declared === -1 ? policy.order.length + OBSERVATION_SOURCE_RANK[descriptor.sourceClass] : declared;
  };

  const latencyRank: Record<string, number> = {
    real_time: 0,
    delayed: 1,
    end_of_day: 2,
    latest_official: 3,
    manual: 4,
    unavailable: 5,
  };

  return [...providers].sort((a, b) => {
    const da = a.describe();
    const db = b.describe();
    const byPolicy = positionOf(da) - positionOf(db);
    if (byPolicy !== 0) return byPolicy;
    return (latencyRank[da.observationClass] ?? 9) - (latencyRank[db.observationClass] ?? 9);
  });
}

/**
 * Resolve one instrument through the hierarchy.
 *
 * Providers are consulted one at a time rather than in parallel. The hierarchy
 * expresses a preference, and firing every request simultaneously would mean
 * paying for, and rate-limiting against, sources whose answers would have been
 * discarded.
 */
export async function resolveObservation(
  providers: MarketDataProvider[],
  request: ResolveRequest,
): Promise<ResolveOutcome> {
  const policy = sourcePolicyFor(request.assetClass);
  const trail: ResolutionStep[] = [];

  if (policy.coverage === "none") {
    return {
      policy,
      trail,
      result: {
        ok: false,
        failure: unavailable(request.assetId, "instrument_not_covered", [], policy.reason),
      },
    };
  }

  const ordered = orderProviders(providers, policy);
  const attempted: string[] = [];
  // Kept so an expired-but-real observation can explain itself rather than
  // vanishing into a generic "no data".
  let bestExpired: { observation: MarketObservation; reason: string } | null = null;

  for (const provider of ordered) {
    const descriptor = provider.describe();

    if (!descriptor.assetClasses.includes(request.assetClass)) {
      trail.push({
        providerId: descriptor.providerId,
        sourceClass: descriptor.sourceClass,
        outcome: "no_coverage",
        detail: `Does not cover ${request.assetClass}.`,
      });
      continue;
    }

    attempted.push(descriptor.providerId);

    if (!providerIsUsable(descriptor)) {
      trail.push({
        providerId: descriptor.providerId,
        sourceClass: descriptor.sourceClass,
        outcome: "not_usable",
        detail: descriptor.unavailableReason ?? "Not configured.",
      });
      continue;
    }

    let outcome;
    try {
      outcome = await provider.observe({
        assetIds: [request.assetId],
        asOf: request.asOf,
        horizon: request.horizon,
      });
    } catch (error) {
      // Failure isolation: a throwing provider is one dead branch, not a dead walk.
      trail.push({
        providerId: descriptor.providerId,
        sourceClass: descriptor.sourceClass,
        outcome: "failed",
        detail: `Threw: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const observation = outcome.observations.find((o) => o.assetId === request.assetId);
    if (!observation) {
      const failure = outcome.failures.find((f) => f.assetId === request.assetId);
      trail.push({
        providerId: descriptor.providerId,
        sourceClass: descriptor.sourceClass,
        outcome: "failed",
        detail: failure?.message ?? "Returned no observation for this instrument.",
      });
      continue;
    }

    const freshness = classifyFreshness({
      observationClass: observation.observationClass,
      observedAt: observation.observedAt,
      now: request.now,
      horizon: request.horizon,
    });

    if (!FRESHNESS_PERMISSIONS[freshness.state].mayRate) {
      // Recorded, not returned. A later source may still be fresh enough, and if
      // none is, this is what the failure message will be built from.
      bestExpired ??= { observation: { ...observation, freshness: freshness.state }, reason: freshness.reason };
      trail.push({
        providerId: descriptor.providerId,
        sourceClass: descriptor.sourceClass,
        outcome: "rejected_freshness",
        detail: freshness.reason,
      });
      continue;
    }

    trail.push({
      providerId: descriptor.providerId,
      sourceClass: descriptor.sourceClass,
      outcome: "observed",
      detail: freshness.reason,
    });

    return {
      policy,
      trail,
      result: { ok: true, observation: { ...observation, freshness: freshness.state } },
    };
  }

  if (bestExpired) {
    return {
      policy,
      trail,
      result: {
        ok: false,
        failure: unavailable(request.assetId, "expired", attempted, bestExpired.reason),
      },
    };
  }

  return {
    policy,
    trail,
    result: {
      ok: false,
      failure: unavailable(
        request.assetId,
        attempted.length === 0 ? "no_provider_configured" : "instrument_not_covered",
        attempted,
      ),
    },
  };
}

/**
 * What this deployment can honestly say about its own market-data capability.
 *
 * Deliberately separates three facts that were previously one sentence: whether
 * any provider is reachable at all, whether free coverage exists, and whether a
 * licensed feed is present. An operator reading this should be able to tell
 * "my sandbox has no egress" apart from "this instrument needs a paid feed".
 */
export interface MarketCapabilityReport {
  anyProviderUsable: boolean;
  freeProvidersUsable: string[];
  licensedProvidersUsable: string[];
  /** Providers present but blocked, with the reason. */
  blocked: { providerId: string; reason: string }[];
  coverageByClass: { assetClass: MarketAssetClass; coverage: CoverageState }[];
  detail: string;
}

export function describeMarketCapability(providers: MarketDataProvider[]): MarketCapabilityReport {
  const descriptors = providers.map((p) => p.describe());
  const usable = descriptors.filter(providerIsUsable);
  const free = usable.filter((d) => !d.requiresPaidSubscription && !d.requiresCredentials);
  const licensed = usable.filter((d) => d.requiresPaidSubscription);
  const blocked = descriptors
    .filter((d) => !providerIsUsable(d))
    .map((d) => ({
      providerId: d.providerId,
      reason: d.unavailableReason ?? "Not configured.",
    }));

  const coverageByClass = ASSET_CLASSES.map((assetClass) => ({
    assetClass,
    coverage: sourcePolicyFor(assetClass).coverage,
  }));

  const detail =
    usable.length === 0
      ? "No market-data provider is usable in this deployment. Where that is an egress restriction rather than a missing subscription, deploying with outbound access resolves it without any licence."
      : licensed.length === 0
        ? `Market data is available from ${free.length} free or official provider(s). Exchange-grade real-time quotes would require an optional licensed feed, which no daily briefing depends on.`
        : `Market data is available from ${usable.length} provider(s), including ${licensed.length} licensed feed(s).`;

  return {
    anyProviderUsable: usable.length > 0,
    freeProvidersUsable: free.map((d) => d.providerId),
    licensedProvidersUsable: licensed.map((d) => d.providerId),
    blocked,
    coverageByClass,
    detail,
  };
}

const ASSET_CLASSES: MarketAssetClass[] = [
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
];

export type { ObservationUnavailable };
