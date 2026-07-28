// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  defaultExpiry,
  liveEntries,
  toEntries,
  toRecord,
  DEFAULT_MANUAL_EXPIRY_DAYS,
  GOLD_SPOT_ASSET_ID,
} from "@/server/providers/market/manual-store";
import { ManualEvidenceProvider, manualObservationEntrySchema } from "@/server/providers/market/manual";
import { buildUaeGoldBoard } from "@/server/gold/uae-gold-service";
import { GRAMS_PER_TROY_OUNCE } from "@/domain/gold/uae-gold";
import { USD_AED_DOCUMENTED_PEG } from "@/server/gold/uae-gold-service";
import type { ManualObservationRecord } from "@/server/persistence/store";

/**
 * The manual gold path, end to end.
 *
 * This is the only rung that currently reaches gold for this household, so the
 * tests care about two things above all: that an entered rate actually values
 * the metal, and that it can never quietly become a retrieved one.
 */

const NOW = new Date("2026-07-28T12:00:00.000Z");

function entry(overrides: Record<string, unknown> = {}) {
  return manualObservationEntrySchema.parse({
    assetId: GOLD_SPOT_ASSET_ID,
    assetClass: "gold_spot",
    instrumentIdentifier: "XAUUSD",
    instrumentName: "Gold spot, USD per troy ounce",
    venue: "Operator-cited reference",
    currency: "USD",
    price: 2400,
    priceUnit: "troy_ounce",
    observedAt: "2026-07-28T09:00:00.000Z",
    sourceDocument: "Dubai Jewellery Group daily gold rate board",
    sourceName: "Dubai Jewellery Group",
    verifiedAgainstPrimarySource: true,
    expiresAt: "2026-08-04T09:00:00.000Z",
    enteredBy: "operator",
    enteredAt: "2026-07-28T09:05:00.000Z",
    note: null,
    ...overrides,
  });
}

describe("expiry", () => {
  it("defaults to a week, which is short on purpose", () => {
    expect(DEFAULT_MANUAL_EXPIRY_DAYS).toBe(7);
    expect(defaultExpiry("2026-07-28T09:00:00.000Z")).toBe("2026-08-04T09:00:00.000Z");
  });

  it("accepts a shorter life when the operator asks for one", () => {
    expect(defaultExpiry("2026-07-28T09:00:00.000Z", 1)).toBe("2026-07-29T09:00:00.000Z");
  });

  it("drops an expired entry from what the provider sees", () => {
    const stale = entry({ expiresAt: "2026-07-01T00:00:00.000Z" });
    expect(liveEntries([stale], NOW)).toHaveLength(0);
    expect(liveEntries([entry()], NOW)).toHaveLength(1);
  });
});

describe("storage round trip", () => {
  it("survives the trip through a stored row", () => {
    const record = toRecord(entry(), "manual-1");
    const [back] = toEntries([record]);
    expect(back?.price).toBe(2400);
    expect(back?.sourceName).toBe("Dubai Jewellery Group");
  });

  it("carries the columns a query needs to find the newest entry", () => {
    const record = toRecord(entry(), "manual-1");
    expect(record.assetId).toBe(GOLD_SPOT_ASSET_ID);
    expect(record.assetClass).toBe("gold_spot");
    expect(record.observedAt).toBe("2026-07-28T09:00:00.000Z");
    expect(record.expiresAt).toBe("2026-08-04T09:00:00.000Z");
  });

  it("drops an unparseable row rather than repairing it", () => {
    // Storage is untrusted input like any other. A half-valid price is not a
    // price, and guessing the missing half is how a fiction gets a timestamp.
    const broken: ManualObservationRecord = {
      observationId: "manual-broken",
      assetId: GOLD_SPOT_ASSET_ID,
      assetClass: "gold_spot",
      observedAt: "2026-07-28T09:00:00.000Z",
      expiresAt: "2026-08-04T09:00:00.000Z",
      payload: { assetId: GOLD_SPOT_ASSET_ID, price: "not a number" },
    };
    expect(toEntries([broken])).toHaveLength(0);
  });
});

describe("an entered rate valuing the gold", () => {
  async function boardFromEntries(entries: ReturnType<typeof entry>[]) {
    return buildUaeGoldBoard({
      providers: [new ManualEvidenceProvider({ entries, now: () => NOW.getTime() })],
      now: NOW,
    });
  }

  it("prices 24K and 22K in AED per gram from what the operator typed", async () => {
    const board = await boardFromEntries([entry()]);

    expect(board.available).toBe(true);
    const expected24 = (2400 / GRAMS_PER_TROY_OUNCE) * USD_AED_DOCUMENTED_PEG;
    expect(board.prices!["24K"].pricePerGram).toBeCloseTo(expected24, 8);
    expect(board.prices!["22K"].pricePerGram).toBeCloseTo(expected24 * (22 / 24), 8);
  });

  it("labels the figure as manually entered, never as retrieved", async () => {
    const board = await boardFromEntries([entry()]);
    // The load-bearing assertion: a typed number must stay distinguishable from
    // a struck one everywhere it is displayed.
    expect(board.prices!["24K"].freshness).toBe("manual");
    expect(board.prices!["24K"].freshness).not.toBe("live");
  });

  it("names the operator's own citation as the source", async () => {
    const board = await boardFromEntries([entry()]);
    expect(board.prices!["24K"].sourceName).toContain("Dubai Jewellery Group");
  });

  it("shows no price once the entry has lapsed", async () => {
    const board = await boardFromEntries([entry({ expiresAt: "2026-07-01T00:00:00.000Z" })]);
    expect(board.available).toBe(false);
    expect(board.prices).toBeNull();
    // Silence would be worse than a stale number: the operator would not know
    // to re-enter it.
    expect(board.unavailableReason).toBeTruthy();
  });

  it("still refuses when nothing has been entered at all", async () => {
    const board = await boardFromEntries([]);
    expect(board.available).toBe(false);
    expect(board.prices).toBeNull();
  });

  it("uses the newest entry when the operator corrects an earlier one", async () => {
    const board = await boardFromEntries([
      entry({ price: 2400, observedAt: "2026-07-27T09:00:00.000Z" }),
      entry({ price: 2450, observedAt: "2026-07-28T09:00:00.000Z" }),
    ]);
    const expected = (2450 / GRAMS_PER_TROY_OUNCE) * USD_AED_DOCUMENTED_PEG;
    expect(board.prices!["24K"].pricePerGram).toBeCloseTo(expected, 8);
  });

  it("records whether the operator checked their source", async () => {
    const unchecked = new ManualEvidenceProvider({
      entries: [entry({ verifiedAgainstPrimarySource: false })],
      now: () => NOW.getTime(),
    });
    const outcome = await unchecked.observe({
      assetIds: [GOLD_SPOT_ASSET_ID],
      asOf: NOW.toISOString(),
      horizon: "daily",
    });
    expect(outcome.observations[0]!.validationState).toBe("unvalidated");
    expect(outcome.observations[0]!.attribution).toContain("Not checked against the primary source");
  });
});
