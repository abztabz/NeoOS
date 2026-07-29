import type { AssetHolding } from "@/domain/intake/types";
import {
  valueGoldHolding,
  type GoldPurity,
  type MetalValues,
} from "@/domain/gold/metal-value";

/**
 * Applying the metal value to what this household actually holds.
 *
 * Separate from `metal-value.ts` because that module knows only about metal and
 * arithmetic, while this one knows about the intake schema. Keeping the two
 * apart means the conversion can be tested without constructing a whole
 * holding, and the holding logic can change without touching the arithmetic.
 */

/** Holdings this can value: gold, with both a purity and a weight recorded. */
export function isValuableGoldHolding(holding: AssetHolding): boolean {
  return (
    holding.kind === "metals" &&
    (holding.goldPurity === "24K" || holding.goldPurity === "22K") &&
    typeof holding.goldWeightGrams === "number" &&
    holding.goldWeightGrams > 0
  );
}

export interface GoldHoldingValue {
  assetHoldingId: string;
  label: string;
  purity: GoldPurity;
  grams: number;
  aedPerGram: number;
  valueAed: number;
  calculationVersion: string;
}

export interface GoldHoldingGap {
  assetHoldingId: string;
  label: string;
  /** What is missing, in the subject's terms. */
  reason: string;
}

export interface GoldHoldingsSummary {
  valued: GoldHoldingValue[];
  gaps: GoldHoldingGap[];
  /** Total AED across valued holdings only. Never includes a guessed one. */
  totalAed: number;
}

/**
 * Value every gold holding, and name the ones that cannot be valued.
 *
 * A holding that is missing its karat or its weight is reported as a gap rather
 * than being skipped silently or valued on an assumption. Skipping would make
 * the total quietly too small; assuming would make it wrong in a way nobody
 * could see.
 */
export function valueGoldHoldings(
  holdings: AssetHolding[],
  values: MetalValues | null,
): GoldHoldingsSummary {
  const valued: GoldHoldingValue[] = [];
  const gaps: GoldHoldingGap[] = [];

  for (const holding of holdings) {
    if (holding.kind !== "metals") continue;

    const result = valueGoldHolding(
      {
        weightGrams: holding.goldWeightGrams ?? null,
        purity: (holding.goldPurity ?? null) as GoldPurity | null,
        ownershipPercent: holding.ownershipPercent ?? null,
      },
      values,
    );

    if (result.ok) {
      valued.push({
        assetHoldingId: holding.assetHoldingId,
        label: holding.label,
        purity: result.purity,
        grams: result.grams,
        aedPerGram: result.aedPerGram,
        valueAed: result.valueAed,
        calculationVersion: result.calculationVersion,
      });
    } else {
      gaps.push({
        assetHoldingId: holding.assetHoldingId,
        label: holding.label,
        reason: result.reason,
      });
    }
  }

  return {
    valued,
    gaps,
    totalAed: valued.reduce((sum, entry) => sum + entry.valueAed, 0),
  };
}
