import { describe, expect, it } from "vitest";
import {
  describeHoldingValuation,
  isItemized,
  ITEMIZATION_PROMPT,
} from "@/domain/valuation/holding-valuation";
import type { AssetHolding } from "@/domain/intake/types";

/**
 * The household's two awkward holdings: a house nobody quotes, and a lump sum
 * called "stocks" that names nothing to price.
 */

const NOW = new Date("2026-07-28T12:00:00.000Z");

function holding(overrides: Partial<AssetHolding> = {}): AssetHolding {
  return {
    assetHoldingId: "asset-1",
    subjectId: "subject-1",
    kind: "real_estate",
    label: "Family House",
    value: {
      amount: 25_218_960,
      currency: "NPR",
      basis: "subject_estimate",
      asOf: "2026-07-01",
      note: null,
    },
    registryAssetId: null,
    identifier: null,
    quantity: null,
    liquidity: "months",
    jurisdiction: "NP",
    custodian: null,
    encumberedBy: null,
    restricted: false,
    notes: null,
    ...overrides,
  } as AssetHolding;
}

describe("property", () => {
  it("is a manual estimate and never a live price", () => {
    const view = describeHoldingValuation(holding(), NOW);
    expect(view.method).toBe("manual_estimate");
    expect(view.mayShowAsLive).toBe(false);
    expect(view.valuationNote).toContain("no market prices a specific property");
  });

  it("keeps a professional appraisal above an owner's estimate", () => {
    const view = describeHoldingValuation(
      holding({ value: { ...holding().value, basis: "professional_appraisal" } }),
      NOW,
    );
    expect(view.method).toBe("appraisal");
    // Still not a market price. The ceiling on property is permanent.
    expect(view.mayShowAsLive).toBe(false);
  });

  it("never asks to itemize a house", () => {
    expect(describeHoldingValuation(holding(), NOW).needsItemization).toBe(false);
  });

  it("asks for a refresh once the figure is over a year old", () => {
    const fresh = describeHoldingValuation(holding(), NOW);
    expect(fresh.refreshPrompt).toBeNull();

    const old = describeHoldingValuation(
      holding({ value: { ...holding().value, asOf: "2024-01-01" } }),
      NOW,
    );
    expect(old.refreshPrompt).toContain("months ago");
    expect(old.ageDays).toBeGreaterThan(365);
  });
});

describe("a lump sum called stocks", () => {
  const lump = holding({
    assetHoldingId: "asset-2",
    kind: "listed_equity",
    label: "Brokerage shares",
    value: { amount: 40_000, currency: "AED", basis: "subject_estimate", asOf: "2026-07-01", note: null },
  });

  it("is not itemized when nothing identifies the instrument", () => {
    expect(isItemized(lump)).toBe(false);
    // A quantity is not an identification: a count of unnamed shares is still
    // a count of unnamed shares.
    expect(isItemized({ ...lump, quantity: 500 } as AssetHolding)).toBe(false);
  });

  it("says the value is reported, the holdings are not itemized, and pricing is unavailable", () => {
    const view = describeHoldingValuation(lump, NOW);
    expect(view.needsItemization).toBe(true);
    expect(view.method).toBe("manual_estimate");
    expect(view.mayShowAsLive).toBe(false);
    expect(view.valuationNote).toContain("Manual reported value");
    expect(view.valuationNote).toContain("holdings not itemized");
    expect(view.valuationNote).toContain("live pricing unavailable");
  });

  it("names the remedy rather than stating a limit and stopping", () => {
    const view = describeHoldingValuation(lump, NOW);
    expect(view.valuationNote.toLowerCase()).toContain(ITEMIZATION_PROMPT.toLowerCase());
  });

  it("becomes market-priceable once the instrument is identified", () => {
    const view = describeHoldingValuation({ ...lump, identifier: "US0378331005" } as AssetHolding, NOW);
    expect(view.needsItemization).toBe(false);
    expect(view.method).toBe("market_price");
    expect(view.mayShowAsLive).toBe(true);
  });
});

describe("other kinds", () => {
  it("prices metals against a reference, not as a quote for the holding", () => {
    const view = describeHoldingValuation(holding({ kind: "metals" }), NOW);
    expect(view.method).toBe("reference_price");
    expect(view.mayShowAsLive).toBe(false);
    expect(view.valuationNote).toContain("not a quote for this holding");
  });

  it("treats a statement balance as a fact about the account", () => {
    const view = describeHoldingValuation(
      holding({ kind: "cash", value: { ...holding().value, basis: "statement_balance" } }),
      NOW,
    );
    expect(view.method).toBe("cost_basis");
    expect(view.mayShowAsLive).toBe(false);
  });

  it("reports an unidentifiable holding as unpriced rather than estimated", () => {
    const view = describeHoldingValuation(holding({ kind: "collectible" }), NOW);
    expect(view.method).toBe("unpriced");
    expect(view.valuationNote).toContain("Not priced");
  });

  it("never labels anything but a struck market price as live", () => {
    for (const kind of ["real_estate", "metals", "cash", "collectible", "private_business"]) {
      expect(describeHoldingValuation(holding({ kind } as Partial<AssetHolding>), NOW).mayShowAsLive).toBe(
        false,
      );
    }
  });
});
