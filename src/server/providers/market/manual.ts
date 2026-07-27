import { z } from "zod";
import type {
  MarketAssetClass,
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
 * Manual evidence — the operator typed it in.
 *
 * The last rung of every hierarchy, and deliberately never removed from any of
 * them. For UAE and Nepal equities it is currently the *only* rung, and a
 * system that refused manual evidence would simply have nothing to say about
 * most of this household's assets.
 *
 * The whole design here is about preventing one specific promotion: a manual
 * entry must never become indistinguishable from a retrieved one. It carries
 * `observationClass: "manual"` and `sourceClass: "manual_operator_entry"`, both
 * of which travel with it into every downstream display, and it carries an
 * explicit expiry because a price somebody typed in six months ago is not
 * evidence about today.
 */

export const MANUAL_PROVIDER_ID = "manual-evidence";

export const manualObservationEntrySchema = z.object({
  assetId: z.string(),
  assetClass: z.string(),
  instrumentIdentifier: z.string(),
  instrumentName: z.string(),
  venue: z.string(),
  currency: z.string().length(3),
  price: z.number().positive(),
  priceUnit: z.string(),
  /** When the figure was true, per the operator's source. Not when they typed it. */
  observedAt: z.iso.datetime({ offset: true }),
  /** Where the operator got it. A URL where one exists, prose otherwise. */
  sourceDocument: z.string().min(1),
  sourceName: z.string().min(1),
  /**
   * Whether the operator checked this against the primary source. False is a
   * legitimate answer and is displayed, not corrected.
   */
  verifiedAgainstPrimarySource: z.boolean(),
  /** After this instant the entry stops being usable and must be re-entered. */
  expiresAt: z.iso.datetime({ offset: true }),
  enteredBy: z.string().min(1),
  enteredAt: z.iso.datetime({ offset: true }),
  note: z.string().nullable(),
});
export type ManualObservationEntry = z.infer<typeof manualObservationEntrySchema>;

export interface ManualProviderOptions {
  entries: ManualObservationEntry[];
  assetClasses?: MarketAssetClass[];
  now?: () => number;
}

/** Every class, because manual entry is the universal fallback. */
const ALL_CLASSES: MarketAssetClass[] = [
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

export class ManualEvidenceProvider implements MarketDataProvider {
  private readonly now: () => number;

  constructor(private readonly options: ManualProviderOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  describe(): MarketProviderDescriptor {
    const count = this.options.entries.length;
    return {
      providerId: MANUAL_PROVIDER_ID,
      providerName: "Manual evidence entry",
      sourceName: "Operator",
      sourceClass: "manual_operator_entry",
      observationClass: "manual",
      knownDelayMinutes: null,
      assetClasses: this.options.assetClasses ?? ALL_CLASSES,
      configured: count > 0,
      requiresCredentials: false,
      requiresPaidSubscription: false,
      // Nothing is fetched, so nothing leaves the deployment.
      outboundHosts: [],
      attribution:
        "Entered by the operator with a citation. Manual evidence is never treated as provider-verified, never silently promoted to a retrieved observation, and expires on the date recorded with it.",
      unavailableReason: count > 0 ? null : "No manual observations have been entered.",
    };
  }

  async observe(request: MarketFetchRequest): Promise<MarketFetchOutcome> {
    const observations: MarketObservation[] = [];
    const failures: ObservationUnavailable[] = [];
    const nowMs = this.now();

    for (const assetId of request.assetIds) {
      // Newest entry wins. Entries are append-only upstream, so an operator
      // correcting a figure adds a row rather than editing one.
      const candidates = this.options.entries
        .filter((e) => e.assetId === assetId)
        .sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1));
      const entry = candidates[0];

      if (!entry) {
        failures.push(unavailable(assetId, "instrument_not_covered", [MANUAL_PROVIDER_ID]));
        continue;
      }
      if (!observationIsPlausible(entry.price)) {
        failures.push(
          unavailable(assetId, "implausible_value", [MANUAL_PROVIDER_ID], `Entered price: ${entry.price}.`),
        );
        continue;
      }

      const expiry = Date.parse(entry.expiresAt);
      if (Number.isFinite(expiry) && expiry <= nowMs) {
        failures.push(
          unavailable(
            assetId,
            "expired",
            [MANUAL_PROVIDER_ID],
            `The manual entry for ${entry.instrumentName} expired at ${entry.expiresAt} and must be re-entered before it can support a decision.`,
          ),
        );
        continue;
      }

      observations.push({
        assetId,
        instrumentIdentifier: entry.instrumentIdentifier,
        instrumentName: entry.instrumentName,
        venue: entry.venue,
        currency: entry.currency.toUpperCase(),
        price: entry.price,
        priceUnit: entry.priceUnit,
        observedAt: entry.observedAt,
        retrievedAt: new Date(nowMs).toISOString(),
        observationClass: "manual",
        sourceClass: "manual_operator_entry",
        providerId: MANUAL_PROVIDER_ID,
        sourceName: entry.sourceName,
        knownDelayMinutes: null,
        adjustment: "unknown",
        corporateActionHandling:
          "Not stated. A manually entered price carries no assurance that splits or distributions have been accounted for.",
        freshness: "unknown",
        // The honest distinction: an operator who checked their source against
        // the primary one has validated it; one who did not has not, and saying
        // otherwise would make the two indistinguishable.
        validationState: entry.verifiedAgainstPrimarySource ? "validated" : "unvalidated",
        failureReason: null,
        previousClose: null,
        attribution: `Manually entered by ${entry.enteredBy} on ${entry.enteredAt}, citing ${entry.sourceDocument}.${
          entry.verifiedAgainstPrimarySource
            ? " Checked against the primary source."
            : " Not checked against the primary source."
        }`,
      });
    }

    return { observations, failures };
  }
}
