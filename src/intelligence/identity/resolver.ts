import {
  IDENTITY_METHOD_CONFIDENCE,
  IDENTITY_MIN_CONFIDENCE,
  type IdentityCandidate,
  type IdentityMatchMethod,
  type IdentityResolution,
} from "@/intelligence/types/identity";
import type { RawAssetIdentifier } from "@/intelligence/types/raw-evidence";
import { ASSET_REGISTRY, type RegistryEntry } from "@/intelligence/identity/registry";

/**
 * Identity resolution: source identifiers → canonical asset.
 *
 * Rules that keep this honest:
 *  - A ticker alone is not a match. Tickers repeat across exchanges, so a
 *    ticker without an exchange yields a candidate, and if more than one asset
 *    shares it the outcome is `ambiguous`.
 *  - Category labels score below the confidence floor by construction, so a
 *    generic phrase never resolves to a specific instrument.
 *  - When identifiers point at DIFFERENT assets the outcome is `conflicted`.
 *    That is a source-quality problem and is surfaced, not averaged away.
 */

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function candidate(
  assetId: string,
  method: IdentityMatchMethod,
  matchedOn: string,
  confidenceOverride?: number,
): IdentityCandidate {
  return {
    assetId,
    method,
    confidence: confidenceOverride ?? IDENTITY_METHOD_CONFIDENCE[method],
    matchedOn,
  };
}

function collectCandidates(
  identifiers: RawAssetIdentifier[],
  registry: RegistryEntry[],
): { candidates: IdentityCandidate[]; warnings: string[] } {
  const candidates: IdentityCandidate[] = [];
  const warnings: string[] = [];

  const byScheme = (scheme: RawAssetIdentifier["scheme"]) =>
    identifiers.filter((i) => i.scheme === scheme).map((i) => i.value);

  const tickers = byScheme("ticker");
  const exchanges = byScheme("exchange");

  for (const { identity } of registry) {
    const id = identity.assetId;

    for (const isin of byScheme("isin")) {
      if (identity.isin && norm(identity.isin) === norm(isin)) {
        candidates.push(candidate(id, "exact_isin", `ISIN ${isin}`));
      }
    }
    for (const cusip of byScheme("cusip")) {
      if (identity.cusip && norm(identity.cusip) === norm(cusip)) {
        candidates.push(candidate(id, "exact_cusip", `CUSIP ${cusip}`));
      }
    }
    for (const figi of byScheme("figi")) {
      if (identity.figi && norm(identity.figi) === norm(figi)) {
        candidates.push(candidate(id, "exact_figi", `FIGI ${figi}`));
      }
    }
    for (const symbol of byScheme("commodity")) {
      if (identity.commoditySymbol && norm(identity.commoditySymbol) === norm(symbol)) {
        candidates.push(candidate(id, "exact_commodity", `commodity ${symbol}`));
      }
    }
    for (const providerId of byScheme("provider_id")) {
      if (Object.values(identity.providerIds).some((v) => norm(v) === norm(providerId))) {
        candidates.push(candidate(id, "provider_id", `provider id ${providerId}`));
      }
    }

    // Ticker: only a full-confidence match when the exchange agrees too.
    for (const ticker of tickers) {
      if (!identity.ticker || norm(identity.ticker) !== norm(ticker)) continue;
      const exchangeMatches =
        identity.exchange !== null &&
        exchanges.some((ex) => norm(ex) === norm(identity.exchange as string));
      if (exchangeMatches) {
        candidates.push(
          candidate(id, "exact_ticker_exchange", `${ticker} on ${identity.exchange}`),
        );
      } else if (exchanges.length === 0) {
        // Ticker without an exchange: a candidate, but not on its own decisive.
        candidates.push(
          candidate(id, "exact_ticker_exchange", `${ticker} (no exchange supplied)`, 78),
        );
        warnings.push(
          `Ticker "${ticker}" supplied without an exchange; tickers are not globally unique.`,
        );
      } else {
        warnings.push(
          `Ticker "${ticker}" matches ${id} but the supplied exchange ${exchanges.join(", ")} does not.`,
        );
      }
    }

    for (const name of [...byScheme("name"), ...byScheme("fund_name")]) {
      const legal = identity.legalName && norm(identity.legalName) === norm(name);
      const fund = identity.fundName && norm(identity.fundName) === norm(name);
      if (legal || fund) {
        candidates.push(candidate(id, "exact_name", `name "${name}"`));
      } else if (identity.aliases.some((a) => norm(a) === norm(name))) {
        candidates.push(candidate(id, "alias", `alias "${name}"`));
      }
    }

    // Category labels resolve only to assets that ARE categories, and even then
    // score below the floor so they can never carry a match alone.
    for (const label of byScheme("category")) {
      if (identity.categoryLabels.some((c) => norm(c) === norm(label))) {
        candidates.push(candidate(id, "category_label", `category "${label}"`));
      }
    }
  }

  return { candidates, warnings };
}

export function resolveIdentity(
  identifiers: RawAssetIdentifier[],
  registry: RegistryEntry[] = ASSET_REGISTRY,
): IdentityResolution {
  const supplied = identifiers.map((i) => `${i.scheme}:${i.value}`);
  const { candidates, warnings } = collectCandidates(identifiers, registry);

  if (candidates.length === 0) {
    return {
      outcome: "unmatched",
      assetId: null,
      method: null,
      confidence: 0,
      matchedIdentifiers: [],
      candidates: [],
      warnings: [
        ...warnings,
        `No canonical asset matches ${supplied.join(", ") || "the supplied identifiers"}.`,
      ],
      conflictingAssetIds: [],
    };
  }

  // Best candidate per asset, then rank assets by their best confidence.
  const bestPerAsset = new Map<string, IdentityCandidate>();
  for (const c of candidates) {
    const existing = bestPerAsset.get(c.assetId);
    if (!existing || c.confidence > existing.confidence) bestPerAsset.set(c.assetId, c);
  }
  const ranked = [...bestPerAsset.values()].sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0]!;

  // Two or more assets matched at decisive confidence: the identifiers
  // disagree about which asset this is.
  const decisive = ranked.filter((c) => c.confidence >= IDENTITY_MIN_CONFIDENCE);
  if (decisive.length > 1) {
    return {
      outcome: "conflicted",
      assetId: null,
      method: null,
      confidence: best.confidence,
      matchedIdentifiers: supplied,
      candidates: ranked,
      warnings: [
        ...warnings,
        `Supplied identifiers resolve to ${decisive.length} different assets: ${decisive
          .map((c) => c.assetId)
          .join(", ")}.`,
      ],
      conflictingAssetIds: decisive.map((c) => c.assetId),
    };
  }

  if (best.confidence < IDENTITY_MIN_CONFIDENCE) {
    const reason =
      best.method === "category_label"
        ? `"${best.matchedOn}" is a category label, which cannot identify a specific instrument.`
        : `Best match ${best.assetId} scored ${best.confidence}, below the ${IDENTITY_MIN_CONFIDENCE} confidence floor.`;
    return {
      outcome: "ambiguous",
      assetId: null,
      method: null,
      confidence: best.confidence,
      matchedIdentifiers: supplied,
      candidates: ranked,
      warnings: [...warnings, reason],
      conflictingAssetIds: [],
    };
  }

  return {
    outcome: "matched",
    assetId: best.assetId,
    method: best.method,
    confidence: best.confidence,
    matchedIdentifiers: supplied,
    candidates: ranked,
    warnings,
    conflictingAssetIds: [],
  };
}
