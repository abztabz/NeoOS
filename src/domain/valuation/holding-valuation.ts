import type { AssetHolding } from "@/domain/intake/types";
import {
  defaultMethodFor,
  mayDescribeAsLive,
  valuationMethodLabels,
  type ValuationMethod,
} from "@/domain/valuation/valuation-record";

/**
 * How a declared holding should be described on screen.
 *
 * The two cases this exists for are the two the household actually has, and
 * both are ones a dashboard normally gets wrong:
 *
 *   - **Property.** A house has a value, an owner's estimate of it, and no
 *     market. Rendering 25,218,960 NPR in the same style as a share price makes
 *     an estimate look like a quote. It is labelled a manual estimate, dated,
 *     and never described as live.
 *   - **A lump sum called "stocks".** Roughly AED 40,000 of shares, not itemized.
 *     Nothing identifies what to price, so nothing can be priced. The honest
 *     display says the value is the owner's reported figure, that holdings are
 *     not itemized, and that live pricing is therefore unavailable — with the
 *     way to fix it named.
 *
 * The failure both guard against is the same one: a real number, correctly
 * entered, silently promoted to a kind of claim nobody made.
 */

export const ITEMIZATION_PROMPT = "Add the individual holdings to enable pricing";

export interface HoldingValuationView {
  method: ValuationMethod;
  methodLabel: string;
  /** True only for a struck market price. Gates every "live"/"current" word. */
  mayShowAsLive: boolean;
  /** True when the holding is a lump sum that could be itemized. */
  needsItemization: boolean;
  /** Short line under the value. Written to be read, not decoded. */
  valuationNote: string;
  /** How old the stated figure is, in days, or null when undated. */
  ageDays: number | null;
  /** Set when the figure is old enough that acting on it is a real risk. */
  refreshPrompt: string | null;
}

/** Kinds where a lump-sum entry could be broken into priceable instruments. */
const ITEMIZABLE_KINDS = new Set(["listed_equity", "fund", "crypto"]);

/** How old a manual figure may be before the display asks for a refresh. */
export const MANUAL_VALUATION_REFRESH_DAYS: Record<string, number> = {
  real_estate: 365,
  private_business: 365,
  listed_equity: 90,
  fund: 90,
  crypto: 30,
  collectible: 730,
};
const DEFAULT_REFRESH_DAYS = 180;

export function isItemized(holding: AssetHolding): boolean {
  // A quantity alone is not identification: "40,000 of shares" has a number and
  // still names nothing to price.
  return Boolean(holding.identifier ?? holding.registryAssetId);
}

function ageInDays(asOf: string, now: Date): number | null {
  const stated = Date.parse(asOf);
  if (Number.isNaN(stated)) return null;
  return Math.max(0, Math.floor((now.getTime() - stated) / 86_400_000));
}

export function describeHoldingValuation(
  holding: AssetHolding,
  now: Date = new Date(),
): HoldingValuationView {
  const itemized = isItemized(holding);

  // The declared basis wins where the subject stated a stronger one — an
  // appraisal they had done is better evidence than the kind default.
  const method: ValuationMethod =
    holding.value.basis === "professional_appraisal"
      ? "appraisal"
      : holding.value.basis === "statement_balance"
        ? "cost_basis"
        : defaultMethodFor(holding.kind, itemized);

  const needsItemization = ITEMIZABLE_KINDS.has(holding.kind) && !itemized;
  const ageDays = ageInDays(holding.value.asOf, now);
  const limit = MANUAL_VALUATION_REFRESH_DAYS[holding.kind] ?? DEFAULT_REFRESH_DAYS;

  return {
    method,
    methodLabel: valuationMethodLabels[method],
    mayShowAsLive: mayDescribeAsLive(method),
    needsItemization,
    ageDays,
    valuationNote: noteFor(holding.kind, method, needsItemization),
    refreshPrompt:
      ageDays !== null && ageDays > limit
        ? `Last valued ${Math.floor(ageDays / 30)} months ago. Worth revisiting before you rely on it.`
        : null,
  };
}

function noteFor(kind: string, method: ValuationMethod, needsItemization: boolean): string {
  if (needsItemization) {
    // Names the limit and the remedy in one line, because a limitation without
    // a remedy reads as a defect.
    return `Manual reported value · holdings not itemized · live pricing unavailable — ${ITEMIZATION_PROMPT.toLowerCase()}`;
  }
  switch (method) {
    case "appraisal":
      return "Professional appraisal · not a market price";
    case "manual_estimate":
      return kind === "real_estate"
        ? "Manual estimate · no market prices a specific property"
        : "Manual estimate · not verified against a market";
    case "reference_price":
      return "Reference price for the underlying · not a quote for this holding";
    case "cost_basis":
      return "Statement balance · a fact about the account, not a valuation";
    case "market_price":
      return "Market price · struck on a venue and verified";
    case "unpriced":
      return "Not priced — not enough is known about this holding to value it";
  }
}

/** Fields a property valuation should carry, for the edit form. */
export const PROPERTY_VALUATION_FIELDS = [
  "value",
  "currency",
  "valuationDate",
  "valuationSource",
  "ownershipPercent",
  "appraisalDocument",
] as const;
export type PropertyValuationField = (typeof PROPERTY_VALUATION_FIELDS)[number];

export const PROPERTY_FIELD_LABELS: Record<PropertyValuationField, string> = {
  value: "Estimated value",
  currency: "Currency",
  valuationDate: "Valued on",
  valuationSource: "Where the figure came from",
  ownershipPercent: "Your share",
  appraisalDocument: "Appraisal document (optional)",
};
