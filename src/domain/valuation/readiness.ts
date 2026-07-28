import type { AssetHolding } from "@/domain/intake/types";
import {
  describeHoldingValuation,
  ITEMIZATION_PROMPT,
  type HoldingValuationView,
} from "@/domain/valuation/holding-valuation";

/**
 * What still stands between a declared position and a priced one.
 *
 * The question this answers is the one somebody actually has after filling in
 * the intake form: *why does NeoOS still say it cannot price my portfolio?*
 * Answering it with a percentage would be worse than useless — the useful
 * answer is a short list of specific holdings and what each one needs.
 *
 * Ordered by what it is worth fixing first, which is by declared value rather
 * than by how easy the fix is. The largest unpriced holding is where the
 * uncertainty actually lives.
 */

export type ReadinessRemedy =
  | "itemize"
  | "state_value"
  | "date_the_valuation"
  | "refresh_valuation"
  | "none";

export const REMEDY_LABELS: Record<Exclude<ReadinessRemedy, "none">, string> = {
  itemize: ITEMIZATION_PROMPT,
  state_value: "Add what it is worth",
  date_the_valuation: "Say when that value was true",
  refresh_valuation: "Revisit this valuation",
};

export interface ReadinessItem {
  assetHoldingId: string;
  label: string;
  remedy: ReadinessRemedy;
  /** What is missing, in the subject's terms. */
  detail: string;
  /** Declared value, for ordering. Null where that is the missing thing. */
  declaredValue: number | null;
  currency: string;
  valuation: HoldingValuationView;
}

export interface PortfolioReadiness {
  /** True when nothing is blocking a priced view. */
  ready: boolean;
  /** Holdings NeoOS can price today. */
  priceable: number;
  total: number;
  /** Everything outstanding, worst first. Empty when ready. */
  items: ReadinessItem[];
  /** One sentence for the card heading. */
  summary: string;
}

function remedyFor(
  holding: AssetHolding,
  valuation: HoldingValuationView,
): { remedy: ReadinessRemedy; detail: string } {
  if (holding.value.amount === null) {
    return {
      remedy: "state_value",
      detail: "No value recorded. A blank is honest, and it keeps this holding out of every total.",
    };
  }
  if (valuation.needsItemization) {
    return {
      remedy: "itemize",
      detail:
        "The value is yours and the holdings behind it are not named, so there is nothing for NeoOS to price.",
    };
  }
  if (valuation.ageDays === null) {
    return {
      remedy: "date_the_valuation",
      detail: "No date on this figure, so it cannot be aged or trusted as current.",
    };
  }
  if (valuation.refreshPrompt !== null) {
    return { remedy: "refresh_valuation", detail: valuation.refreshPrompt };
  }
  return { remedy: "none", detail: "" };
}

export function assessPortfolioReadiness(
  holdings: AssetHolding[],
  now: Date = new Date(),
): PortfolioReadiness {
  const items: ReadinessItem[] = [];
  let priceable = 0;

  for (const holding of holdings) {
    const valuation = describeHoldingValuation(holding, now);
    const { remedy, detail } = remedyFor(holding, valuation);

    if (remedy === "none") {
      priceable++;
      continue;
    }
    items.push({
      assetHoldingId: holding.assetHoldingId,
      label: holding.label,
      remedy,
      detail,
      declaredValue: holding.value.amount,
      currency: holding.value.currency,
      valuation,
    });
  }

  // Largest first. A missing value sorts last within its group because its size
  // is precisely what is unknown — guessing it in order to rank it would be the
  // same mistake in miniature.
  items.sort((a, b) => (b.declaredValue ?? -1) - (a.declaredValue ?? -1));

  return {
    ready: items.length === 0,
    priceable,
    total: holdings.length,
    items,
    summary: summarise(items.length, holdings.length),
  };
}

function summarise(outstanding: number, total: number): string {
  if (total === 0) return "Nothing declared yet, so there is nothing to price.";
  if (outstanding === 0) {
    return "Everything you have declared can be valued. Pricing depends only on a connected data source now.";
  }
  return outstanding === 1
    ? "One holding still needs something from you before it can be valued."
    : `${outstanding} holdings still need something from you before they can be valued.`;
}
