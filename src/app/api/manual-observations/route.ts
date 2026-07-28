import { z } from "zod";
import { authorizeOperator, denied } from "@/server/api/auth";
import { storageFailed, unhandled } from "@/server/api/storage-error";
import { getReportStore } from "@/server/persistence";
import { manualObservationEntrySchema } from "@/server/providers/market/manual";
import {
  defaultExpiry,
  liveEntries,
  toEntries,
  toRecord,
  DEFAULT_MANUAL_EXPIRY_DAYS,
  GOLD_SPOT_ASSET_ID,
} from "@/server/providers/market/manual-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Runs the schema migration on first use, like the other write endpoints. */
export const maxDuration = 60;

/**
 * Manually entered market observations.
 *
 * The last rung of the source hierarchy, and for this household the only one
 * that currently reaches gold: the LBMA reference restricts redistribution, no
 * free spot source has confirmed terms, and NeoOS does not scrape rendered
 * pages. So the operator types the rate they can see, cites where they saw it,
 * and the figure travels with that citation everywhere it is displayed.
 *
 * What this endpoint will not do is let a typed number become indistinguishable
 * from a retrieved one. Every entry is stored with `observationClass: "manual"`,
 * an expiry, and whether the operator checked it against the primary source —
 * and `canUsePriceForDecision` rejects manual quotes, so an entered rate can
 * value a holding but can never issue a Buy.
 */

/**
 * A gold rate as somebody in Dubai would read it off the board, plus the two
 * things that make it evidence rather than a rumour: where it came from, and
 * when it was true.
 */
const goldRateSchema = z.object({
  /** USD per troy ounce. The unit the spot reference is quoted in. */
  pricePerTroyOunceUsd: z.number().positive().finite(),
  /** Where the operator read it. A URL, or a description of the source. */
  sourceDocument: z.string().min(3).max(500),
  /** The publishing institution, in the operator's words. */
  sourceName: z.string().min(2).max(200),
  /** When the figure was true, not when it was typed. */
  observedAt: z.iso.datetime({ offset: true }),
  /** False is a legitimate answer and is displayed, never corrected. */
  verifiedAgainstPrimarySource: z.boolean(),
  enteredBy: z.string().min(1).max(120),
  /** Optional shorter life. A longer one has to be stated, never assumed. */
  expiryDays: z.number().int().min(1).max(30).optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = goldRateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error: "That gold rate could not be recorded.",
          detail: parsed.error.issues[0]?.message ?? "invalid",
          stored: false,
        },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    const input = parsed.data;
    const now = new Date();

    // A figure timestamped in the future is a clock or typing error, and
    // accepting it would produce an entry that never ages.
    if (Date.parse(input.observedAt) > now.getTime() + 60_000) {
      return Response.json(
        {
          error: "That rate is dated in the future. Enter when the price was actually true.",
          stored: false,
        },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    const entry = manualObservationEntrySchema.parse({
      assetId: GOLD_SPOT_ASSET_ID,
      assetClass: "gold_spot",
      instrumentIdentifier: "XAUUSD",
      instrumentName: "Gold spot, USD per troy ounce",
      venue: "Operator-cited reference",
      currency: "USD",
      price: input.pricePerTroyOunceUsd,
      priceUnit: "troy_ounce",
      observedAt: input.observedAt,
      sourceDocument: input.sourceDocument,
      sourceName: input.sourceName,
      verifiedAgainstPrimarySource: input.verifiedAgainstPrimarySource,
      expiresAt: defaultExpiry(input.observedAt, input.expiryDays),
      enteredBy: input.enteredBy,
      enteredAt: now.toISOString(),
      note: input.note ?? null,
    });

    const store = getReportStore();
    await store.migrate();
    // Id derived from the asset and the instant it describes, so submitting the
    // same rate twice is a no-op rather than a duplicate row.
    const observationId = `manual-${entry.assetId}-${entry.observedAt}`;
    await store.saveManualObservation(toRecord(entry, observationId));

    return Response.json(
      {
        stored: true,
        observationId,
        expiresAt: entry.expiresAt,
        expiryDays: input.expiryDays ?? DEFAULT_MANUAL_EXPIRY_DAYS,
        detail:
          "Recorded as manual evidence. It will value your gold and is labelled as entered rather than retrieved, so it cannot issue a Buy.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return storageFailed(error);
  }
}

/** What has been entered, and what is still in force. */
export async function GET(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  try {
    const store = getReportStore();
    await store.migrate();
    const records = await store.listManualObservations(100);
    const entries = toEntries(records);
    const live = liveEntries(entries);

    return Response.json(
      {
        // Both counts, because "one entered" and "one still in force" are
        // different facts and an operator needs to see when they diverge.
        entered: entries.length,
        inForce: live.length,
        observations: entries.map((entry) => ({
          assetId: entry.assetId,
          price: entry.price,
          currency: entry.currency,
          priceUnit: entry.priceUnit,
          observedAt: entry.observedAt,
          expiresAt: entry.expiresAt,
          expired: !live.includes(entry),
          sourceName: entry.sourceName,
          sourceDocument: entry.sourceDocument,
          verifiedAgainstPrimarySource: entry.verifiedAgainstPrimarySource,
          enteredBy: entry.enteredBy,
          enteredAt: entry.enteredAt,
          note: entry.note,
        })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return unhandled(error, "GET /api/manual-observations");
  }
}
