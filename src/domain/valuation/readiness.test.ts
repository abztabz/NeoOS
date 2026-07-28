import { describe, expect, it } from "vitest";
import { assessPortfolioReadiness } from "@/domain/valuation/readiness";
import type { AssetHolding } from "@/domain/intake/types";

/**
 * The answer to "why does NeoOS still say it cannot price my portfolio?"
 *
 * A percentage would be worse than useless here. The useful answer names the
 * holdings and what each one needs.
 */

const NOW = new Date("2026-07-28T12:00:00.000Z");

function holding(overrides: Partial<AssetHolding> = {}): AssetHolding {
  return {
    assetHoldingId: "asset-1",
    subjectId: "subject-1",
    kind: "listed_equity",
    label: "Brokerage shares",
    value: {
      amount: 40_000,
      currency: "AED",
      basis: "subject_estimate",
      asOf: "2026-07-01",
      note: null,
    },
    registryAssetId: null,
    identifier: "US0378331005",
    quantity: 10,
    liquidity: "days",
    jurisdiction: "AE",
    custodian: null,
    encumberedBy: null,
    restricted: false,
    notes: null,
    ...overrides,
  } as AssetHolding;
}

describe("what is blocking a priced view", () => {
  it("reports ready when every holding can be valued", () => {
    const result = assessPortfolioReadiness([holding()], NOW);
    expect(result.ready).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(result.priceable).toBe(1);
    expect(result.summary).toContain("connected data source");
  });

  it("asks for itemization on a lump sum, not for a better estimate", () => {
    const result = assessPortfolioReadiness([holding({ identifier: null })], NOW);
    expect(result.ready).toBe(false);
    expect(result.items[0]!.remedy).toBe("itemize");
    expect(result.items[0]!.detail).toContain("nothing for NeoOS to price");
  });

  it("asks for a value where none was stated", () => {
    const result = assessPortfolioReadiness(
      [holding({ value: { ...holding().value, amount: null } })],
      NOW,
    );
    expect(result.items[0]!.remedy).toBe("state_value");
    // The blank is defended rather than treated as an error.
    expect(result.items[0]!.detail).toContain("A blank is honest");
  });

  it("asks for a refresh on a valuation that has aged out", () => {
    const result = assessPortfolioReadiness(
      [
        holding({
          kind: "real_estate",
          identifier: null,
          value: { ...holding().value, asOf: "2023-01-01" },
        }),
      ],
      NOW,
    );
    expect(result.items[0]!.remedy).toBe("refresh_valuation");
  });

  it("does not ask a house to be itemized", () => {
    const result = assessPortfolioReadiness(
      [holding({ kind: "real_estate", identifier: null })],
      NOW,
    );
    expect(result.ready).toBe(true);
  });

  it("puts the largest unpriced holding first", () => {
    const result = assessPortfolioReadiness(
      [
        holding({ assetHoldingId: "small", label: "Small", identifier: null, value: { ...holding().value, amount: 5_000 } }),
        holding({ assetHoldingId: "large", label: "Large", identifier: null, value: { ...holding().value, amount: 500_000 } }),
      ],
      NOW,
    );
    expect(result.items.map((i) => i.label)).toEqual(["Large", "Small"]);
  });

  it("sorts an unvalued holding last rather than guessing its size", () => {
    const result = assessPortfolioReadiness(
      [
        holding({ assetHoldingId: "unknown", label: "Unknown", value: { ...holding().value, amount: null } }),
        holding({ assetHoldingId: "known", label: "Known", identifier: null, value: { ...holding().value, amount: 1_000 } }),
      ],
      NOW,
    );
    expect(result.items.map((i) => i.label)).toEqual(["Known", "Unknown"]);
  });

  it("counts holdings rather than reporting a percentage", () => {
    const result = assessPortfolioReadiness(
      [holding(), holding({ assetHoldingId: "b", identifier: null })],
      NOW,
    );
    expect(result.total).toBe(2);
    expect(result.priceable).toBe(1);
    expect(result.summary).toContain("One holding");
  });

  it("says there is nothing to price when nothing is declared", () => {
    const result = assessPortfolioReadiness([], NOW);
    expect(result.ready).toBe(true);
    expect(result.summary).toContain("Nothing declared yet");
  });
});
