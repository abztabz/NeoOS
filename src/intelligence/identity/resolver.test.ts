import { describe, expect, it } from "vitest";
import { resolveIdentity } from "@/intelligence/identity/resolver";
import { ASSET_REGISTRY } from "@/intelligence/identity/registry";
import { IDENTITY_MIN_CONFIDENCE } from "@/intelligence/types/identity";
import type { RawAssetIdentifier } from "@/intelligence/types/raw-evidence";

const id = (scheme: RawAssetIdentifier["scheme"], value: string): RawAssetIdentifier => ({
  scheme,
  value,
});

describe("identity resolution", () => {
  it("matches AAPL by ticker and exchange", () => {
    const result = resolveIdentity([id("ticker", "AAPL"), id("exchange", "NASDAQ")]);
    expect(result.outcome).toBe("matched");
    expect(result.assetId).toBe("apple");
    expect(result.method).toBe("exact_ticker_exchange");
    expect(result.confidence).toBeGreaterThanOrEqual(IDENTITY_MIN_CONFIDENCE);
  });

  it("matches Apple by legal name", () => {
    const result = resolveIdentity([id("name", "Apple Inc.")]);
    expect(result.outcome).toBe("matched");
    expect(result.assetId).toBe("apple");
    expect(result.method).toBe("exact_name");
  });

  it("matches Apple by a known alias", () => {
    const result = resolveIdentity([id("name", "Apple")]);
    expect(result.outcome).toBe("matched");
    expect(result.assetId).toBe("apple");
    expect(result.method).toBe("alias");
  });

  it("matches by ISIN even without a ticker", () => {
    const result = resolveIdentity([id("isin", "US0378331005")]);
    expect(result.outcome).toBe("matched");
    expect(result.assetId).toBe("apple");
    expect(result.method).toBe("exact_isin");
  });

  it("matches SPY correctly", () => {
    const result = resolveIdentity([id("ticker", "SPY"), id("exchange", "NYSE Arca")]);
    expect(result.outcome).toBe("matched");
    expect(result.assetId).toBe("us-etf");
  });

  it("leaves a bare 'S&P 500 ETF' category label ambiguous", () => {
    // Many funds track the index. Without a provider identifier this must not
    // resolve to SPY.
    const result = resolveIdentity([id("category", "s&p 500 etf")]);
    expect(result.outcome).toBe("ambiguous");
    expect(result.assetId).toBeNull();
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toMatch(/category label/i);
  });

  it("recognises XAU as gold", () => {
    const result = resolveIdentity([id("commodity", "XAU")]);
    expect(result.outcome).toBe("matched");
    expect(result.assetId).toBe("gold");
    expect(result.method).toBe("exact_commodity");
  });

  it("does not map a generic value-ETF category to a specific ticker", () => {
    const result = resolveIdentity([id("category", "developed-market value etf")]);
    // The category asset exists, but a category label alone scores below the
    // floor, so it is never a decisive match to an instrument.
    expect(result.assetId).toBeNull();
    expect(result.outcome).toBe("ambiguous");
  });

  it("resolves a UAE listing by ticker and exchange", () => {
    const result = resolveIdentity([id("ticker", "UAEUTIL"), id("exchange", "ADX")]);
    expect(result.outcome).toBe("matched");
    expect(result.assetId).toBe("uae-equity");
  });

  it("warns when a ticker arrives with a mismatched exchange", () => {
    const result = resolveIdentity([id("ticker", "AAPL"), id("exchange", "ADX")]);
    expect(result.outcome).not.toBe("matched");
    expect(result.warnings.join(" ")).toMatch(/exchange/i);
  });

  it("flags conflicting identifiers that point at different assets", () => {
    const result = resolveIdentity([id("isin", "US0378331005"), id("commodity", "XAU")]);
    expect(result.outcome).toBe("conflicted");
    expect(result.assetId).toBeNull();
    expect(result.conflictingAssetIds).toEqual(expect.arrayContaining(["apple", "gold"]));
  });

  it("returns unmatched with no candidates for an unknown identifier", () => {
    const result = resolveIdentity([id("ticker", "ZZZZ"), id("exchange", "NASDAQ")]);
    expect(result.outcome).toBe("unmatched");
    expect(result.candidates).toHaveLength(0);
    expect(result.assetId).toBeNull();
  });

  it("a ticker without an exchange is a candidate but never silently decisive", () => {
    const result = resolveIdentity([id("ticker", "AAPL")]);
    expect(result.warnings.join(" ")).toMatch(/without an exchange/i);
    // It still resolves here because AAPL is unique in this registry, but the
    // reduced confidence is what protects a registry where it is not.
    const candidate = result.candidates.find((c) => c.assetId === "apple");
    expect(candidate?.confidence).toBeLessThan(96);
  });

  it("every registry entry is reachable by its own primary identifier", () => {
    for (const { asset, identity } of ASSET_REGISTRY) {
      const identifiers: RawAssetIdentifier[] = [];
      if (identity.ticker && identity.exchange) {
        identifiers.push(id("ticker", identity.ticker), id("exchange", identity.exchange));
      } else if (identity.legalName) {
        identifiers.push(id("name", identity.legalName));
      } else if (identity.fundName) {
        identifiers.push(id("fund_name", identity.fundName));
      }
      if (identifiers.length === 0) continue;
      const result = resolveIdentity(identifiers);
      expect(result.assetId, `${asset.assetId} should resolve from its own identifiers`).toBe(
        asset.assetId,
      );
    }
  });
});
