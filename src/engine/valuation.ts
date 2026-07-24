import { ENGINE_VERSION } from "@/engine/constants";
import type { ValuationMethod, ValuationResult } from "@/engine/models";

/**
 * Modular valuation framework. Each asset class picks a method; no single
 * model is forced across every asset. Every result carries the full trace —
 * inputs, assumptions, three cases, margin of safety, sensitivity, and
 * invalidation conditions. A price threshold is never displayed without one.
 *
 * Margin of safety = (conservativeValue − marketPrice) ⁄ conservativeValue.
 * Conservative — deliberately: paying below the LOW case is the discipline.
 */

export interface ValuationInputBase {
  calculationDate: string;
  currency: string;
  marketPrice: number | null;
  evidenceIds: string[];
  confidence: number;
  assumptions: string[];
  invalidationConditions: string[];
}

export type ValuationInput =
  | (ValuationInputBase & {
      method: "earningsMultiple";
      eps: number;
      conservativeMultiple: number;
      baseMultiple: number;
      optimisticMultiple: number;
    })
  | (ValuationInputBase & {
      method: "netAssetValue";
      navPerUnit: number;
      conservativeDiscount: number; // e.g. 0.15 = value NAV at 85%
      optimisticPremium: number;
    })
  | (ValuationInputBase & {
      method: "goldStrategicAllocation";
      centralBankDemandScore: number; // 0–100
      realYieldAnchor: number; // current real 10y, %
      baseFairValue: number; // long-run monetary fair value estimate
    })
  | (ValuationInputBase & {
      method: "cashEquivalentYield";
      nominalYieldPct: number;
      inflationPct: number;
    })
  | (ValuationInputBase & {
      method: "yieldSpread";
      assetYieldPct: number;
      referenceYieldPct: number;
      parValue: number;
    });

export const SUPPORTED_METHODS: ValuationMethod[] = [
  "earningsMultiple",
  "netAssetValue",
  "goldStrategicAllocation",
  "cashEquivalentYield",
  "yieldSpread",
];

function marginOfSafety(conservative: number | null, price: number | null): number | null {
  if (conservative === null || price === null || conservative <= 0) return null;
  return (conservative - price) / conservative;
}

export function computeValuation(input: ValuationInput): ValuationResult {
  const base = {
    modelVersion: ENGINE_VERSION,
    calculationDate: input.calculationDate,
    evidenceIds: input.evidenceIds,
    currency: input.currency,
    marketPrice: input.marketPrice,
    confidence: input.confidence,
    assumptions: input.assumptions,
    invalidationConditions: input.invalidationConditions,
  };

  switch (input.method) {
    case "earningsMultiple": {
      const conservative = input.eps * input.conservativeMultiple;
      const baseValue = input.eps * input.baseMultiple;
      const optimistic = input.eps * input.optimisticMultiple;
      return {
        ...base,
        method: "earningsMultiple",
        inputs: {
          eps: input.eps,
          conservativeMultiple: input.conservativeMultiple,
          baseMultiple: input.baseMultiple,
          optimisticMultiple: input.optimisticMultiple,
        },
        conservativeValue: conservative,
        baseValue,
        optimisticValue: optimistic,
        marginOfSafety: marginOfSafety(conservative, input.marketPrice),
        sensitivity: `±10% EPS moves every case ±10%; one multiple turn moves base by ${input.eps.toFixed(2)}.`,
        limitations: [
          "Multiple-based value inherits market sentiment embedded in the chosen multiples.",
          "EPS is a single-period input; cyclical earnings can distort it.",
        ],
      };
    }
    case "netAssetValue": {
      const conservative = input.navPerUnit * (1 - input.conservativeDiscount);
      const optimistic = input.navPerUnit * (1 + input.optimisticPremium);
      return {
        ...base,
        method: "netAssetValue",
        inputs: {
          navPerUnit: input.navPerUnit,
          conservativeDiscount: input.conservativeDiscount,
          optimisticPremium: input.optimisticPremium,
        },
        conservativeValue: conservative,
        baseValue: input.navPerUnit,
        optimisticValue: optimistic,
        marginOfSafety: marginOfSafety(conservative, input.marketPrice),
        sensitivity: `±10% NAV moves every case ±10%.`,
        limitations: ["NAV accuracy depends on the marks of the underlying holdings."],
      };
    }
    case "goldStrategicAllocation": {
      // Strategic-allocation model: gold's monetary fair value anchored on
      // long-run purchasing power, shifted by central-bank demand (structural
      // bid) and real yields (carry cost). Documented in SCORING_METHODOLOGY.
      const demandShift = (input.centralBankDemandScore - 50) / 100; // −0.5…+0.5
      const yieldDrag = Math.max(0, input.realYieldAnchor) * 0.04; // 4% per point of positive real yield
      const baseValue = input.baseFairValue * (1 + demandShift * 0.2 - yieldDrag);
      const conservative = baseValue * 0.88;
      const optimistic = baseValue * 1.15;
      return {
        ...base,
        method: "goldStrategicAllocation",
        inputs: {
          centralBankDemandScore: input.centralBankDemandScore,
          realYieldAnchor: input.realYieldAnchor,
          baseFairValue: input.baseFairValue,
        },
        conservativeValue: conservative,
        baseValue,
        optimisticValue: optimistic,
        marginOfSafety: marginOfSafety(conservative, input.marketPrice),
        sensitivity: "1pt of real yield ≈ −4% base value; ±10 demand score ≈ ±2%.",
        limitations: [
          "Gold has no cash flows; this is a strategic anchor, not an intrinsic value.",
          "Model is calibrated for allocation discipline, not price prediction.",
        ],
      };
    }
    case "cashEquivalentYield": {
      const realYield = input.nominalYieldPct - input.inflationPct;
      return {
        ...base,
        method: "cashEquivalentYield",
        inputs: { nominalYieldPct: input.nominalYieldPct, inflationPct: input.inflationPct, realYieldPct: realYield },
        conservativeValue: null,
        baseValue: null,
        optimisticValue: null,
        marginOfSafety: null,
        sensitivity: "Tracks policy rate one-for-one; reprices at each bill roll.",
        limitations: ["Cash has no capital-appreciation case; value is optionality plus real yield."],
      };
    }
    case "yieldSpread": {
      const spread = input.assetYieldPct - input.referenceYieldPct;
      // Each 100bp of positive spread supports ~5% premium to par (duration-lite heuristic).
      const baseValue = input.parValue * (1 + spread * 0.05);
      const conservative = input.parValue * (1 + Math.min(0, spread) * 0.05);
      return {
        ...base,
        method: "yieldSpread",
        inputs: {
          assetYieldPct: input.assetYieldPct,
          referenceYieldPct: input.referenceYieldPct,
          spreadPct: spread,
          parValue: input.parValue,
        },
        conservativeValue: conservative,
        baseValue,
        optimisticValue: input.parValue * (1 + Math.max(0, spread) * 0.08),
        marginOfSafety: marginOfSafety(conservative, input.marketPrice),
        sensitivity: "100bp spread move ≈ 5% of par.",
        limitations: ["Heuristic duration; not a full curve model."],
      };
    }
  }
}

/**
 * Map a margin of safety to the valuation factor's raw score (0–100).
 * Documented mapping: 0% MoS = 50 (fair price). Each 1% of discount adds
 * 1.4 points; premiums subtract likewise. ≥25% discount ≥ 85 (Buy-grade
 * valuation); ≥32% ≈ 95 (Strong Buy-grade).
 */
export function valuationRawScore(mos: number | null): number | null {
  if (mos === null) return null;
  return Math.max(0, Math.min(100, 50 + mos * 140));
}

/**
 * Method-aware valuation grade. Most methods score off margin of safety, but
 * cash equivalents have no intrinsic-value case: their valuation grade is the
 * real yield on offer (0% real = 50, each 1% of real yield adds 12 points).
 * Scoring them as "no margin of safety measurable" would wrongly strip cash
 * of the 30% valuation weight — and cash is a first-class asset.
 */
export function valuationGrade(result: ValuationResult | null): number | null {
  if (result === null) return null;
  if (result.method === "cashEquivalentYield") {
    const real = Number(result.inputs.realYieldPct ?? 0);
    return Math.max(0, Math.min(100, 50 + real * 12));
  }
  return valuationRawScore(result.marginOfSafety);
}
