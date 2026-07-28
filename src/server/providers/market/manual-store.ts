import { manualObservationEntrySchema, type ManualObservationEntry } from "@/server/providers/market/manual";
import type { ManualObservationRecord } from "@/server/persistence/store";

/**
 * Manual observations, between the operator's form and the provider.
 *
 * Two conversions and one rule. The conversions are entry → stored row and
 * stored row → entry. The rule is that a row which fails validation on the way
 * back **is dropped rather than repaired**: storage is untrusted input like any
 * other, and a half-valid price is not a price.
 */

/** The canonical asset id the gold board resolves. Stated once. */
export const GOLD_SPOT_ASSET_ID = "gold-spot-xau-usd";

/**
 * How long a manually entered gold rate stays usable.
 *
 * Seven days is a judgement, and a deliberately short one. Gold can move
 * several percent in a week, and this household holds enough of it that a
 * fortnight-old figure would misstate its wealth by more than any decision it
 * informs. The operator can always enter a shorter life; they cannot enter a
 * longer one without saying so explicitly.
 */
export const DEFAULT_MANUAL_EXPIRY_DAYS = 7;

export function defaultExpiry(observedAt: string, days = DEFAULT_MANUAL_EXPIRY_DAYS): string {
  const struck = Date.parse(observedAt);
  const base = Number.isNaN(struck) ? Date.now() : struck;
  return new Date(base + days * 86_400_000).toISOString();
}

export function toRecord(entry: ManualObservationEntry, observationId: string): ManualObservationRecord {
  return {
    observationId,
    assetId: entry.assetId,
    assetClass: entry.assetClass,
    observedAt: entry.observedAt,
    expiresAt: entry.expiresAt,
    payload: entry,
  };
}

/**
 * Stored rows back into entries the provider can read.
 *
 * Invalid rows are skipped silently *to the provider* and are still present in
 * storage — the append-only table keeps them, so the fact that something
 * unparseable was written is recoverable by an auditor even though no price
 * ever comes from it.
 */
export function toEntries(records: ManualObservationRecord[]): ManualObservationEntry[] {
  const entries: ManualObservationEntry[] = [];
  for (const record of records) {
    const parsed = manualObservationEntrySchema.safeParse(record.payload);
    if (parsed.success) entries.push(parsed.data);
  }
  return entries;
}

/** Entries that have not expired as at `now`. */
export function liveEntries(
  entries: ManualObservationEntry[],
  now: Date = new Date(),
): ManualObservationEntry[] {
  return entries.filter((entry) => {
    const expiry = Date.parse(entry.expiresAt);
    return !Number.isFinite(expiry) || expiry > now.getTime();
  });
}
