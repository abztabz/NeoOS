import { describe, expect, it } from "vitest";
import {
  buildUaeGoldBoard,
  PRICING_INACTIVE_MESSAGE,
  USD_AED_DOCUMENTED_PEG,
} from "@/server/gold/uae-gold-service";
import { GRAMS_PER_TROY_OUNCE } from "@/domain/gold/uae-gold";
import type {
  MarketDataProvider,
  MarketProviderDescriptor,
} from "@/server/providers/market/provider";
import type { MarketObservation } from "@/server/types/market-observation";

/**
 * The board is the surface where a household reads what its gold is worth, so
 * the cases that matter are the ones where it has to show nothing.
 */

const NOW = new Date("2026-07-28T12:00:00.000Z");

function descriptor(overrides: Partial<MarketProviderDescriptor> = {}): MarketProviderDescriptor {
  return {
    providerId: "test-gold",
    providerName: "Test gold provider",
    sourceName: "LBMA (test double)",
    sourceClass: "licensed_market_data",
    observationClass: "delayed",
    knownDelayMinutes: 15,
    assetClasses: ["gold_spot"],
    configured: true,
    requiresCredentials: true,
    requiresPaidSubscription: true,
    outboundHosts: ["example.invalid"],
    attribution: "Test double. Not redistributable.",
    unavailableReason: null,
    ...overrides,
  };
}

function observation(price: number): MarketObservation {
  return {
    assetId: "gold-spot-xau-usd",
    instrumentIdentifier: "XAUUSD",
    instrumentName: "Gold spot, USD per troy ounce",
    venue: "OTC",
    currency: "USD",
    price,
    priceUnit: "troy_ounce",
    observedAt: "2026-07-28T11:30:00.000Z",
    retrievedAt: "2026-07-28T11:31:00.000Z",
    observationClass: "delayed",
    sourceClass: "licensed_market_data",
    providerId: "test-gold",
    sourceName: "LBMA (test double)",
    knownDelayMinutes: 15,
    adjustment: "not_applicable",
    corporateActionHandling: "Not applicable to a metal.",
    freshness: "fresh",
    validationState: "validated",
    failureReason: null,
    previousClose: null,
    attribution: "Test double. Not redistributable.",
  };
}

function providerReturning(price: number, overrides = {}): MarketDataProvider {
  return {
    describe: () => descriptor(overrides),
    observe: async () => ({ observations: [observation(price)], failures: [] }),
  };
}

describe("with a verified spot price", () => {
  it("puts AED per gram on the board and keeps XAU/USD underneath", async () => {
    const board = await buildUaeGoldBoard({ providers: [providerReturning(2400)], now: NOW });

    expect(board.available).toBe(true);
    const expected24 = (2400 / GRAMS_PER_TROY_OUNCE) * USD_AED_DOCUMENTED_PEG;
    expect(board.prices!["24K"].pricePerGram).toBeCloseTo(expected24, 8);
    expect(board.prices!["24K"].currency).toBe("AED");
    expect(board.prices!["24K"].unit).toBe("gram");
    // The dollar figure is retained as the derivation, not the headline.
    expect(board.prices!["24K"].underlyingPrice).toBe(2400);
  });

  it("prices 22K below 24K by exact purity", async () => {
    const board = await buildUaeGoldBoard({ providers: [providerReturning(2400)], now: NOW });
    const p = board.prices!;
    expect(p["22K"].pricePerGram).toBeCloseTo(p["24K"].pricePerGram * (22 / 24), 8);
    expect(p["22K"].pricePerGram).toBeLessThan(p["24K"].pricePerGram);
  });

  it("labels the USD/AED rate as a documented peg rather than an observed quote", async () => {
    const board = await buildUaeGoldBoard({ providers: [providerReturning(2400)], now: NOW });
    expect(board.fxIsPolicyFallback).toBe(true);
    expect(board.prices!["24K"].sourceName).toContain("documented peg");
    expect(board.fxSourceName).toContain("UAE Central Bank");
  });

  it("names the charges that separate a reference from a shop price", async () => {
    const board = await buildUaeGoldBoard({ providers: [providerReturning(2400)], now: NOW });
    expect(board.exclusions.toLowerCase()).toContain("making charges");
    expect(board.exclusions.toLowerCase()).toContain("dealer spreads");
  });

  it("shows a Good Buy Price only when NeoOS has published a discipline", async () => {
    const without = await buildUaeGoldBoard({ providers: [providerReturning(2400)], now: NOW });
    expect(without.goodBuyPerGram).toBeNull();

    const withDiscipline = await buildUaeGoldBoard({
      providers: [providerReturning(2400)],
      now: NOW,
      goodBuy24KPerGram: 300,
    });
    expect(withDiscipline.goodBuyPerGram!["24K"]).toBe(300);
    expect(withDiscipline.goodBuyPerGram!["22K"]).toBeCloseTo(300 * (22 / 24), 10);
  });
});

describe("with no usable source", () => {
  it("states the exact production wording when no provider is configured", async () => {
    const board = await buildUaeGoldBoard({ providers: [], now: NOW });

    expect(board.available).toBe(false);
    expect(board.prices).toBeNull();
    expect(board.unavailableReason).toBe(PRICING_INACTIVE_MESSAGE);
  });

  it("shows no price at all rather than an approximate one", async () => {
    const board = await buildUaeGoldBoard({ providers: [], now: NOW });
    // The failure this guards: a plausible constant that nobody notices is fake.
    expect(board.prices).toBeNull();
    expect(board.goodBuyPerGram).toBeNull();
    expect(JSON.stringify(board)).not.toMatch(/\b\d{3}\.\d+\b/);
  });

  it("still names what the reference would exclude", async () => {
    const board = await buildUaeGoldBoard({ providers: [], now: NOW });
    expect(board.exclusions.toLowerCase()).toContain("making charges");
  });

  it("reports a provider's own failure rather than flattening it to a config message", async () => {
    const failing: MarketDataProvider = {
      describe: () => descriptor({ configured: true }),
      observe: async () => {
        throw new Error("upstream timeout");
      },
    };
    const board = await buildUaeGoldBoard({ providers: [failing], now: NOW });
    expect(board.available).toBe(false);
    expect(board.unavailableReason).not.toBe(PRICING_INACTIVE_MESSAGE);
  });

  it("records which providers were consulted", async () => {
    const board = await buildUaeGoldBoard({
      providers: [providerReturning(2400, { unavailableReason: "No credentials configured." })],
      now: NOW,
    });
    expect(board.available).toBe(false);
    expect(board.trail.length).toBeGreaterThan(0);
    expect(board.trail[0]!.providerId).toBe("test-gold");
  });
});

describe("the peg", () => {
  it("is the published rate and is not silently adjusted", () => {
    expect(USD_AED_DOCUMENTED_PEG).toBe(3.6725);
  });
});
