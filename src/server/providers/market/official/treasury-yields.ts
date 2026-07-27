import type {
  MarketDataProvider,
  MarketFetchOutcome,
  MarketFetchRequest,
  MarketProviderDescriptor,
} from "@/server/providers/market/provider";
import {
  observationIsPlausible,
  unavailable,
  type MarketObservation,
  type ObservationUnavailable,
} from "@/server/types/market-observation";

/**
 * U.S. Department of the Treasury — Fiscal Data.
 *
 * The second official primary source that needs no key, no account, and no
 * licence. Treasury publishes what it pays on its own outstanding debt, which
 * makes it the origin for this series rather than a vendor restating it.
 *
 * Why a household allocator cares: the risk-free rate is the hurdle every other
 * decision is measured against. When it moves, the case for holding cash, for
 * accepting equity risk, and for locking capital into property all move with
 * it. That is a monthly-to-daily signal, not a tick, and it is exactly the kind
 * of input a generational-wealth system should be built on.
 *
 * What this series is, precisely: the **average interest rate on outstanding
 * marketable Treasury securities**, by security type, published monthly. It is
 * not the daily par yield curve and this adapter does not describe it as one.
 * Naming it accurately matters more than naming it impressively, because a
 * reader who thinks they are looking at today's 10-year yield will misread every
 * comparison they make with it.
 */

export const TREASURY_PROVIDER_ID = "us-treasury-fiscal-data";
export const TREASURY_HOST = "api.fiscaldata.treasury.gov";
export const TREASURY_BASE_URL = `https://${TREASURY_HOST}/services/api/fiscal_service`;
export const TREASURY_TIMEOUT_MS = 10_000;

export const TREASURY_ATTRIBUTION =
  "Average interest rates on U.S. Treasury securities, published by the U.S. Department of the Treasury through the Fiscal Data API. U.S. federal government works are in the public domain and free to use and redistribute. This series is published monthly and reports the average rate on outstanding marketable securities by type; it is not the daily par yield curve.";

export interface TreasurySeriesMapping {
  assetId: string;
  /** Value of `security_desc` in the Treasury dataset, matched exactly. */
  securityDescription: string;
  instrumentName?: string;
}

export interface TreasuryYieldOptions {
  series: TreasurySeriesMapping[];
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  egressBlockedReason?: string | null;
}

export class TreasuryYieldProvider implements MarketDataProvider {
  private readonly now: () => number;

  constructor(private readonly options: TreasuryYieldOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  describe(): MarketProviderDescriptor {
    return {
      providerId: TREASURY_PROVIDER_ID,
      providerName: "U.S. Treasury Fiscal Data — average interest rates",
      sourceName: "U.S. Department of the Treasury",
      sourceClass: "official_primary",
      observationClass: "latest_official",
      knownDelayMinutes: null,
      assetClasses: ["government_bond_yield"],
      configured: true,
      requiresCredentials: false,
      requiresPaidSubscription: false,
      outboundHosts: [TREASURY_HOST],
      attribution: TREASURY_ATTRIBUTION,
      unavailableReason: this.options.egressBlockedReason ?? null,
    };
  }

  async observe(request: MarketFetchRequest): Promise<MarketFetchOutcome> {
    const observations: MarketObservation[] = [];
    const failures: ObservationUnavailable[] = [];
    const fetchImpl = this.options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));

    for (const assetId of request.assetIds) {
      const mapping = this.options.series.find((s) => s.assetId === assetId);
      if (!mapping) {
        failures.push(unavailable(assetId, "instrument_not_covered", [TREASURY_PROVIDER_ID]));
        continue;
      }

      // Bracketed query parameters are part of the documented Fiscal Data API
      // and must be percent-encoded to survive intermediate proxies intact.
      const url =
        `${TREASURY_BASE_URL}/v2/accounting/od/avg_interest_rates` +
        `?filter=${encodeURIComponent(`security_desc:eq:${mapping.securityDescription}`)}` +
        `&sort=${encodeURIComponent("-record_date")}` +
        `&page%5Bsize%5D=1`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TREASURY_TIMEOUT_MS);
      try {
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (response.status === 429) {
          failures.push(unavailable(assetId, "provider_rate_limited", [TREASURY_PROVIDER_ID]));
          continue;
        }
        if (!response.ok) {
          failures.push(
            unavailable(assetId, "provider_bad_status", [TREASURY_PROVIDER_ID], `HTTP ${response.status}.`),
          );
          continue;
        }

        const body: unknown = await response.json();
        const record = parseTreasuryRecord(body);
        if (record === null) {
          failures.push(
            unavailable(
              assetId,
              "malformed_response",
              [TREASURY_PROVIDER_ID],
              `The Treasury response for "${mapping.securityDescription}" contained no readable record.`,
            ),
          );
          continue;
        }
        if (!observationIsPlausible(record.rate)) {
          failures.push(
            unavailable(
              assetId,
              "implausible_value",
              [TREASURY_PROVIDER_ID],
              `Treasury returned ${JSON.stringify(record.rate)} as an interest rate.`,
            ),
          );
          continue;
        }

        observations.push({
          assetId,
          instrumentIdentifier: mapping.securityDescription,
          instrumentName:
            mapping.instrumentName ?? `U.S. Treasury ${mapping.securityDescription} average interest rate`,
          venue: "U.S. Department of the Treasury",
          currency: "USD",
          price: record.rate,
          // Explicit: this is a rate, not a price, and comparing it to one is a
          // category error the unit is here to prevent.
          priceUnit: "percent_per_annum",
          observedAt: `${record.recordDate}T00:00:00Z`,
          retrievedAt: new Date(this.now()).toISOString(),
          observationClass: "latest_official",
          sourceClass: "official_primary",
          providerId: TREASURY_PROVIDER_ID,
          sourceName: "U.S. Department of the Treasury",
          knownDelayMinutes: null,
          adjustment: "not_applicable",
          corporateActionHandling: "Corporate actions do not apply to a government debt series.",
          freshness: "unknown",
          validationState: "validated",
          failureReason: null,
          previousClose: null,
          attribution: TREASURY_ATTRIBUTION,
        });
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        failures.push(
          unavailable(
            assetId,
            aborted ? "provider_timeout" : "environment_no_network",
            [TREASURY_PROVIDER_ID],
            aborted
              ? `Treasury did not respond within ${TREASURY_TIMEOUT_MS}ms.`
              : `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      } finally {
        clearTimeout(timer);
      }
    }

    return { observations, failures };
  }
}

export interface TreasuryRecord {
  recordDate: string;
  rate: number;
}

/**
 * Read the newest record out of a Fiscal Data response.
 *
 * The API returns numeric fields as strings, so the conversion is explicit and
 * refuses anything that does not parse cleanly — `Number("")` is 0, and a zero
 * interest rate accepted silently would be indistinguishable from a real one.
 */
export function parseTreasuryRecord(body: unknown): TreasuryRecord | null {
  if (body === null || typeof body !== "object") return null;
  const data = (body as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  if (first === null || typeof first !== "object") return null;
  const record = first as Record<string, unknown>;

  const recordDate = record.record_date;
  const rawRate = record.avg_interest_rate_amt;
  if (typeof recordDate !== "string" || recordDate.length === 0) return null;
  if (typeof rawRate !== "string" && typeof rawRate !== "number") return null;

  const text = String(rawRate).trim();
  if (text.length === 0) return null;
  const rate = Number(text);
  if (!Number.isFinite(rate)) return null;

  return { recordDate, rate };
}
