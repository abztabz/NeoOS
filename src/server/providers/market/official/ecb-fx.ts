import type {
  MarketDataProvider,
  MarketFetchOutcome,
  MarketFetchRequest,
  MarketProviderDescriptor,
} from "@/server/providers/market/provider";
import {
  moveIsPlausible,
  observationIsPlausible,
  unavailable,
  type MarketObservation,
  type ObservationUnavailable,
} from "@/server/types/market-observation";

/**
 * European Central Bank — euro foreign exchange reference rates.
 *
 * An official primary source that costs nothing, requires no account, no API
 * key, and no exchange licence. The ECB computes these rates from a daily
 * concertation between central banks and publishes them itself, under terms
 * that permit reuse with attribution.
 *
 * This adapter is the concrete answer to "NeoOS cannot get current market data
 * without a paid API". It can, for this asset class, from the institution that
 * creates the number.
 *
 * What it is **not**: a real-time FX feed. The ECB publishes once per working
 * day at around 16:00 CET, so an observation from this source is
 * `latest_official` — authoritative, dated, and possibly a day or more old over
 * a weekend. That is entirely adequate for converting a household balance sheet
 * or a multi-year plan, and entirely inadequate for trading. The adapter says
 * which of those it is and lets the freshness rules decide the rest.
 *
 * Coverage note: the ECB reference set covers roughly thirty currencies against
 * the euro. It does **not** include every currency, and this adapter claims a
 * pair only when the ECB actually returns it.
 */

export const ECB_PROVIDER_ID = "ecb-fx";
export const ECB_HOST = "data-api.ecb.europa.eu";
export const ECB_BASE_URL = `https://${ECB_HOST}/service/data/EXR`;
export const ECB_TIMEOUT_MS = 10_000;

export const ECB_ATTRIBUTION =
  "Euro foreign exchange reference rates published by the European Central Bank. Free to use with attribution to the ECB as the source. Reference rates, not tradable quotes: they are published once per working day at around 16:00 CET and are not intended for transaction purposes.";

/** One FX pair NeoOS wants, mapped to the ECB series that carries it. */
export interface EcbPairMapping {
  assetId: string;
  /** Currency quoted against the euro, e.g. "USD" for EUR/USD. */
  quoteCurrency: string;
  /**
   * True when NeoOS wants the reciprocal. The ECB publishes EUR-base only, so a
   * USD-base figure is derived by inversion — an exact arithmetic operation on
   * the published rate, not an estimate, and labelled as derived.
   */
  invert?: boolean;
  instrumentName?: string;
}

export interface EcbFxOptions {
  pairs: EcbPairMapping[];
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  /** Set when the environment is known to block egress. Reported, not hidden. */
  egressBlockedReason?: string | null;
}

export class EcbFxProvider implements MarketDataProvider {
  private readonly now: () => number;

  constructor(private readonly options: EcbFxOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  describe(): MarketProviderDescriptor {
    return {
      providerId: ECB_PROVIDER_ID,
      providerName: "ECB euro foreign exchange reference rates",
      sourceName: "European Central Bank",
      sourceClass: "official_primary",
      // Published on a daily schedule by the institution itself. Not delayed
      // market data — there is no underlying continuous feed being held back.
      observationClass: "latest_official",
      knownDelayMinutes: null,
      assetClasses: ["fx_pair"],
      // Nothing to configure. This is the property that distinguishes an
      // official free source from an unconfigured commercial one.
      configured: true,
      requiresCredentials: false,
      requiresPaidSubscription: false,
      outboundHosts: [ECB_HOST],
      attribution: ECB_ATTRIBUTION,
      unavailableReason: this.options.egressBlockedReason ?? null,
    };
  }

  async observe(request: MarketFetchRequest): Promise<MarketFetchOutcome> {
    const observations: MarketObservation[] = [];
    const failures: ObservationUnavailable[] = [];
    const fetchImpl = this.options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));

    for (const assetId of request.assetIds) {
      const pair = this.options.pairs.find((p) => p.assetId === assetId);
      if (!pair) {
        failures.push(unavailable(assetId, "instrument_not_covered", [ECB_PROVIDER_ID]));
        continue;
      }

      // Two observations so a prior close is available for the plausibility
      // guard. Asked of the source rather than remembered, because a
      // locally-cached previous close would drift from the published series.
      const url =
        `${ECB_BASE_URL}/D.${encodeURIComponent(pair.quoteCurrency)}.EUR.SP00.A` +
        `?lastNObservations=2&format=jsondata`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ECB_TIMEOUT_MS);
      try {
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (response.status === 429) {
          failures.push(unavailable(assetId, "provider_rate_limited", [ECB_PROVIDER_ID]));
          continue;
        }
        if (!response.ok) {
          failures.push(
            unavailable(assetId, "provider_bad_status", [ECB_PROVIDER_ID], `HTTP ${response.status}.`),
          );
          continue;
        }

        const body: unknown = await response.json();
        const parsed = parseEcbSeries(body);
        if (parsed === null) {
          failures.push(
            unavailable(
              assetId,
              "malformed_response",
              [ECB_PROVIDER_ID],
              `The ECB response for EUR/${pair.quoteCurrency} did not contain a readable observation series.`,
            ),
          );
          continue;
        }

        const result = this.toObservation(pair, parsed, assetId);
        if ("kind" in result) failures.push(result);
        else observations.push(result);
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        failures.push(
          unavailable(
            assetId,
            aborted ? "provider_timeout" : "environment_no_network",
            [ECB_PROVIDER_ID],
            aborted
              ? `The ECB did not respond within ${ECB_TIMEOUT_MS}ms.`
              : `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      } finally {
        clearTimeout(timer);
      }
    }

    return { observations, failures };
  }

  private toObservation(
    pair: EcbPairMapping,
    parsed: EcbParsedSeries,
    assetId: string,
  ): MarketObservation | ObservationUnavailable {
    const published = parsed.latest.value;
    if (!observationIsPlausible(published)) {
      return unavailable(
        assetId,
        "implausible_value",
        [ECB_PROVIDER_ID],
        `The ECB returned ${JSON.stringify(published)} for EUR/${pair.quoteCurrency}.`,
      );
    }

    const invert = pair.invert === true;
    const price = invert ? 1 / published : published;
    const previousPublished = parsed.previous?.value ?? null;
    const previousClose =
      previousPublished !== null && observationIsPlausible(previousPublished)
        ? invert
          ? 1 / previousPublished
          : previousPublished
        : null;

    if (!moveIsPlausible(price, previousClose)) {
      return unavailable(
        assetId,
        "implausible_value",
        [ECB_PROVIDER_ID],
        `EUR/${pair.quoteCurrency} moved from ${previousClose} to ${price} between consecutive publications, which is refused rather than used.`,
      );
    }

    const base = invert ? pair.quoteCurrency : "EUR";
    const quote = invert ? "EUR" : pair.quoteCurrency;

    return {
      assetId,
      instrumentIdentifier: `${base}${quote}`,
      instrumentName: pair.instrumentName ?? `${base}/${quote}`,
      venue: "ECB euro foreign exchange reference rates",
      currency: quote,
      price,
      priceUnit: `1 ${base}`,
      // The ECB dates each observation; the date is the fact, not the fetch.
      observedAt: `${parsed.latest.period}T00:00:00Z`,
      retrievedAt: new Date(this.now()).toISOString(),
      observationClass: "latest_official",
      sourceClass: "official_primary",
      providerId: ECB_PROVIDER_ID,
      sourceName: "European Central Bank",
      knownDelayMinutes: null,
      adjustment: "not_applicable",
      corporateActionHandling: "Corporate actions do not apply to a foreign exchange reference rate.",
      // Set by the resolver against the decision horizon; never asserted here.
      freshness: "unknown",
      validationState: "validated",
      failureReason: null,
      previousClose,
      attribution: invert
        ? `${ECB_ATTRIBUTION} This figure is the exact reciprocal of the published EUR/${pair.quoteCurrency} rate, derived by inversion rather than published directly.`
        : ECB_ATTRIBUTION,
    };
  }
}

/* ---------------- SDMX-JSON parsing ---------------- */

interface EcbObservationPoint {
  period: string;
  value: number;
}

export interface EcbParsedSeries {
  latest: EcbObservationPoint;
  previous: EcbObservationPoint | null;
}

/**
 * Read the ECB's SDMX-JSON into dated points.
 *
 * Observations arrive keyed by positional index, and the dates live in a
 * parallel structure block. The index must be resolved against that block
 * rather than assumed to be a date — mistaking the position for the period
 * would silently label every rate with the wrong day, which the freshness rules
 * would then happily accept.
 *
 * Written defensively and total: any shape this cannot read returns null, which
 * the caller reports as a malformed response rather than a missing rate.
 */
export function parseEcbSeries(body: unknown): EcbParsedSeries | null {
  if (body === null || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;

  const dataSets = root.dataSets;
  if (!Array.isArray(dataSets) || dataSets.length === 0) return null;
  const firstSet = dataSets[0];
  if (firstSet === null || typeof firstSet !== "object") return null;

  const series = (firstSet as Record<string, unknown>).series;
  if (series === null || typeof series !== "object") return null;
  const firstSeries = Object.values(series as Record<string, unknown>)[0];
  if (firstSeries === null || typeof firstSeries !== "object") return null;

  const observations = (firstSeries as Record<string, unknown>).observations;
  if (observations === null || typeof observations !== "object") return null;

  const periods = readObservationPeriods(root);
  if (periods === null) return null;

  const points: EcbObservationPoint[] = [];
  for (const [index, raw] of Object.entries(observations as Record<string, unknown>)) {
    const position = Number.parseInt(index, 10);
    const period = periods[position];
    if (period === undefined) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    points.push({ period, value });
  }

  if (points.length === 0) return null;
  points.sort((a, b) => (a.period < b.period ? 1 : -1));
  return { latest: points[0]!, previous: points[1] ?? null };
}

function readObservationPeriods(root: Record<string, unknown>): string[] | null {
  const structure = root.structure;
  if (structure === null || typeof structure !== "object") return null;
  const dimensions = (structure as Record<string, unknown>).dimensions;
  if (dimensions === null || typeof dimensions !== "object") return null;
  const observation = (dimensions as Record<string, unknown>).observation;
  if (!Array.isArray(observation)) return null;

  const timeDimension =
    observation.find(
      (d) => d !== null && typeof d === "object" && (d as Record<string, unknown>).id === "TIME_PERIOD",
    ) ?? observation[0];
  if (timeDimension === null || typeof timeDimension !== "object") return null;

  const values = (timeDimension as Record<string, unknown>).values;
  if (!Array.isArray(values)) return null;

  const periods: string[] = [];
  for (const value of values) {
    if (value !== null && typeof value === "object") {
      const id = (value as Record<string, unknown>).id;
      if (typeof id === "string") {
        periods.push(id);
        continue;
      }
    }
    return null;
  }
  return periods;
}
