import { z } from "zod";
import type { PortfolioContext } from "@/intelligence/universe/build-universe";

/**
 * Operator-supplied portfolio context.
 *
 * The engine needs to know the operator's cash position, holdings, and macro
 * stance to answer its central question — should capital be deployed today, and
 * how hard. None of that is discoverable from a filing or a price feed, so it
 * has to be supplied.
 *
 * What NeoOS will not do is invent it. A run with no declared portfolio uses
 * `undeclaredPortfolioContext()`, which states zero cash, zero holdings, and a
 * neutral macro reading, and says so in the commentary. That produces a
 * deliberately unexciting posture, which is the correct answer to "how
 * aggressively should I deploy capital I have not told you about".
 */

export const portfolioContextSchema = z.object({
  cashPosition: z.object({
    available: z.number().min(0),
    emergencyReserve: z.number().min(0),
    deployable: z.number().min(0),
    monthlySurplus: z.number(),
    targetReserve: z.number().min(0),
    cashYieldPct: z.number(),
    inflationPct: z.number(),
  }),
  macro: z.object({
    regime: z.string(),
    riskScore: z.number().min(0).max(100),
    macroContext: z.string(),
    regions: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        score: z.number(),
        stance: z.string(),
        note: z.string(),
      }),
    ),
  }),
  portfolio: z.object({
    holdings: z.array(z.record(z.string(), z.unknown())),
    allocations: z.record(z.string(), z.number()),
    liquidityRisk: z.number(),
    tierTargets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        memberAssetIds: z.array(z.string()),
        status: z.string(),
      }),
    ),
  }),
  editorial: z.object({
    commentary: z.string(),
    goldRole: z.string(),
    cashOpportunityCost: z.string(),
    cashRecommendation: z.string(),
    reserveRequirement: z.string(),
  }),
});

/**
 * The context used when no portfolio has been declared.
 *
 * Every number is zero or neutral and every narrative field says why. It is not
 * a placeholder pretending to be data — it is an explicit statement that the
 * operator has told NeoOS nothing about their capital.
 */
export function undeclaredPortfolioContext(): PortfolioContext {
  return {
    cashPosition: {
      available: 0,
      emergencyReserve: 0,
      deployable: 0,
      monthlySurplus: 0,
      targetReserve: 0,
      cashYieldPct: 0,
      inflationPct: 0,
    },
    macro: {
      regime: "Not assessed",
      // 50 is the neutral midpoint, not a view. A low number would read as
      // "conditions are calm", which NeoOS has no basis to claim.
      riskScore: 50,
      macroContext:
        "No macro assessment has been supplied for this run, so the macro factor carries a neutral reading rather than an implied view.",
      regions: [],
    },
    portfolio: { holdings: [], allocations: {}, liquidityRisk: 0, tierTargets: [] },
    editorial: {
      commentary:
        "No portfolio has been declared. Capital posture is computed against a zero cash position, which is why it reads conservatively — supply a portfolio context to get a meaningful deployment answer.",
      goldRole: "Not assessed without a declared portfolio.",
      cashOpportunityCost: "Not measurable without a declared cash position.",
      cashRecommendation: "Declare a cash position to receive a recommendation.",
      reserveRequirement: "Not assessed without a declared portfolio.",
    },
  };
}

export function parsePortfolioContext(
  value: unknown,
): { ok: true; context: PortfolioContext } | { ok: false; error: string } {
  const parsed = portfolioContextSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Portfolio context is invalid — ${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"}.`,
    };
  }
  return { ok: true, context: parsed.data as unknown as PortfolioContext };
}
