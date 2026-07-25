import { z } from "zod";
import type { RawAssetIdentifier } from "@/intelligence/types/raw-evidence";

/**
 * Asset identity resolution.
 *
 * Mapping a source's idea of an asset onto a canonical NeoOS asset is a place
 * where a silent guess causes real harm: attributing one company's filing to
 * another produces a confident, wrong recommendation. So the resolver reports
 * ambiguity explicitly and the pipeline turns material ambiguity into
 * Insufficient Evidence rather than picking a favourite.
 */

export const identityOutcomes = ["matched", "ambiguous", "unmatched", "conflicted"] as const;
export type IdentityOutcome = (typeof identityOutcomes)[number];

export const identityMatchMethods = [
  "exact_ticker_exchange",
  "exact_isin",
  "exact_cusip",
  "exact_figi",
  "exact_commodity",
  "provider_id",
  "exact_name",
  "alias",
  "category_label",
] as const;
export type IdentityMatchMethod = (typeof identityMatchMethods)[number];

/** Confidence contributed by each method. Ticker+exchange is unambiguous; a
 *  bare name is not. Centralized so identity confidence is never ad hoc. */
export const IDENTITY_METHOD_CONFIDENCE: Record<IdentityMatchMethod, number> = {
  exact_isin: 99,
  exact_figi: 99,
  exact_cusip: 98,
  exact_ticker_exchange: 96,
  exact_commodity: 95,
  provider_id: 92,
  exact_name: 80,
  alias: 74,
  category_label: 55,
};

/**
 * Below this, a match is not trusted enough to attach evidence to an asset.
 * A bare category label (55) sits deliberately below it: "developed-market
 * value ETF" must never resolve to a specific instrument on its own.
 */
export const IDENTITY_MIN_CONFIDENCE = 70;

export const identityCandidateSchema = z.object({
  assetId: z.string(),
  method: z.enum(identityMatchMethods),
  confidence: z.number().min(0).max(100),
  matchedOn: z.string(),
});
export type IdentityCandidate = z.infer<typeof identityCandidateSchema>;

export const identityResolutionSchema = z.object({
  outcome: z.enum(identityOutcomes),
  /** Null unless outcome is "matched". Never populated on a guess. */
  assetId: z.string().nullable(),
  method: z.enum(identityMatchMethods).nullable(),
  confidence: z.number().min(0).max(100),
  matchedIdentifiers: z.array(z.string()),
  /** Every candidate considered, so an ambiguity can be inspected. */
  candidates: z.array(identityCandidateSchema),
  warnings: z.array(z.string()),
  /** Set when identifiers point at DIFFERENT assets — a source-quality problem. */
  conflictingAssetIds: z.array(z.string()),
});
export type IdentityResolution = z.infer<typeof identityResolutionSchema>;

/** A canonical asset plus every identifier the world might refer to it by. */
export interface AssetIdentityEntry {
  assetId: string;
  ticker: string | null;
  exchange: string | null;
  isin: string | null;
  cusip: string | null;
  figi: string | null;
  commoditySymbol: string | null;
  legalName: string | null;
  fundName: string | null;
  aliases: string[];
  /** Provider-specific ids, keyed by providerId. */
  providerIds: Record<string, string>;
  /**
   * Category labels this asset legitimately belongs to. A category match alone
   * is never sufficient — it scores below the confidence floor by design.
   */
  categoryLabels: string[];
  /**
   * True when the asset IS a category rather than a specific instrument.
   * Category assets accept category-label matches; instruments do not.
   */
  isCategory: boolean;
}

export type IdentifierInput = RawAssetIdentifier[];
