import type { IntakeProfile } from "@/domain/intake/types";

/**
 * Country source packs — which jurisdictions matter to this position, why, and
 * how deeply.
 *
 * The correction this implements: national institutions are **evidence
 * sources**, not knowledge. A central bank's statistics release is a fact about
 * a country in the way a filing is a fact about a company. Putting them in the
 * permanent knowledge corpus was a category error, and it produced a second one
 * — treating the country the subject happens to live in as permanently more
 * important than anywhere else.
 *
 * Packs are therefore dynamic. They activate on a hook in the declared position
 * and carry no standing at all without one.
 *
 * **No jurisdiction carries an investment prior.** Home is not preferred and not
 * penalised; residence is not preferred and not penalised. Country context
 * reaches allocation only through the channels in `COUNTRY_RELEVANCE_CHANNELS`,
 * and never through valuation. See docs/COUNTRY_SOURCE_PACKS.md §6.
 */

/* ---------------- source classes ---------------- */

/**
 * The kinds of official source a country pack can draw on. Modular by design:
 * the class is permanent, the institution filling it is not.
 */
export const sourceClasses = [
  "A1_central_bank",
  "A2_statistics_agency",
  "A3_securities_regulator_and_exchange",
  "A4_tax_legal_property_authority",
  "A5_global_institutional",
  "A6_usd_benchmark",
] as const;
export type SourceClass = (typeof sourceClasses)[number];

export const sourceClassLabels: Record<SourceClass, string> = {
  A1_central_bank: "National central bank",
  A2_statistics_agency: "National statistics agency",
  A3_securities_regulator_and_exchange: "Securities regulator and exchange",
  A4_tax_legal_property_authority: "Tax, legal and property authorities",
  A5_global_institutional: "Global institutional (IMF, BIS, World Bank, OECD)",
  A6_usd_benchmark: "US Federal Reserve, FRED, BLS — USD and global benchmark",
};

/* ---------------- depth ---------------- */

/**
 * How deeply a pack is loaded. A set rather than a scale: they are not nested,
 * and a jurisdiction can need one without the others.
 *
 * The four-clause rule, made executable:
 *
 *   Personal context determines constraints.
 *   Home-country context determines planning depth.
 *   **Asset jurisdiction determines evidence requirements.**
 *   Global evidence determines opportunity.
 *
 * The third clause is why `asset_held` and `business_owned` are the only
 * triggers that reach `opportunity` depth: holding something somewhere is what
 * obliges NeoOS to load the regulator and exchange needed to price it. Living
 * somewhere does not, and being from somewhere does not.
 */
export const packDepths = ["constraint", "planning", "opportunity"] as const;
export type PackDepth = (typeof packDepths)[number];

export const packDepthMeaning: Record<PackDepth, string> = {
  constraint:
    "Can capital enter and leave, who may own what, what is taxed, what is reportable. The questions that decide whether a plan is possible at all.",
  planning:
    "Inheritance, succession, property registration, family obligation flows, expected return. The questions that decide how a plan should be shaped over decades.",
  opportunity:
    "Market data, listed instruments, regulator disclosure. Loaded only where capital is actually being considered, never because a country is home.",
};

/* ---------------- what country context may and may not touch ---------------- */

/**
 * The only channels through which jurisdiction may reach an allocation
 * decision.
 */
export const COUNTRY_RELEVANCE_CHANNELS = [
  "currency risk",
  "inflation exposure",
  "taxation",
  "capital controls",
  "legal ownership",
  "custody",
  "liquidity",
  "political risk",
  "transferability",
  "inheritance",
  "transaction costs",
  "investor access",
  "family obligations",
  "liability matching",
] as const;

/**
 * What jurisdiction must never override.
 *
 * The firewall, and it is the same shape as the rule that knowledge never
 * enters a valuation: **country context is to allocation what knowledge is to
 * valuation — it may shape what is permitted and what is risky, never what
 * something is worth.**
 *
 * Without it, "home market" becomes a reason to buy and "foreign" becomes a
 * reason not to, which is home bias with a citation attached.
 */
export const COUNTRY_MUST_NOT_OVERRIDE = [
  "valuation",
  "margin of safety",
  "asset quality",
  "downside risk",
  "expected return",
  "evidence quality",
  "portfolio fit",
] as const;

/* ---------------- activation ---------------- */

/** Why a jurisdiction became relevant. Every activation names its hook. */
export const activationTriggers = [
  "residence",
  "home_country",
  "citizenship",
  "tax_residence",
  "asset_held",
  "liability_owed",
  "income_sourced",
  "business_owned",
  "custodian_domiciled",
  "dependent_supported",
  "obligation_payable",
  "succession_administered",
] as const;
export type ActivationTrigger = (typeof activationTriggers)[number];

/** Depths each trigger justifies. Deliberately narrow — see §6 of the doc. */
const TRIGGER_DEPTHS: Record<ActivationTrigger, PackDepth[]> = {
  // Where you live: what you may hold, what you owe, what you are taxed on.
  residence: ["constraint", "planning"],
  // Home earns planning depth and explicitly NOT opportunity depth. Being from
  // somewhere is not a reason to invest there.
  home_country: ["planning"],
  // Often the binding constraint on holding assets abroad, independent of where
  // the subject lives.
  citizenship: ["constraint"],
  tax_residence: ["constraint"],
  // Something is already held there, so it must be valued and its exit
  // understood.
  asset_held: ["constraint", "opportunity"],
  liability_owed: ["constraint"],
  income_sourced: ["constraint"],
  business_owned: ["constraint", "planning", "opportunity"],
  custodian_domiciled: ["constraint"],
  dependent_supported: ["planning"],
  obligation_payable: ["planning"],
  succession_administered: ["planning"],
};

export interface ActivatedJurisdiction {
  jurisdiction: string;
  triggers: ActivationTrigger[];
  depths: PackDepth[];
  /** Plain sentence for the interface. Never a bare country code. */
  why: string;
}

/**
 * Which jurisdictions this position actually touches.
 *
 * Derived entirely from what the subject declared. A country with no hook gets
 * no pack, however important it may be in the world.
 */
export function activatedJurisdictions(profile: IntakeProfile): ActivatedJurisdiction[] {
  const found = new Map<string, Set<ActivationTrigger>>();
  const add = (jurisdiction: string | null, trigger: ActivationTrigger) => {
    const key = jurisdiction?.trim();
    if (!key) return;
    (found.get(key) ?? found.set(key, new Set()).get(key)!).add(trigger);
  };

  const context = profile.jurisdictionContext;
  add(context.residence, "residence");
  add(context.homeCountry, "home_country");
  for (const citizenship of context.citizenships) add(citizenship, "citizenship");
  for (const taxResidence of context.taxResidences) add(taxResidence, "tax_residence");

  for (const asset of profile.assets) {
    add(asset.jurisdiction, asset.kind === "private_business" ? "business_owned" : "asset_held");
    // A custodian is a jurisdiction of its own: an asset in one country held
    // through an institution in another is exposed to both.
    if (asset.custodian !== null && asset.jurisdiction !== null) {
      add(asset.jurisdiction, "custodian_domiciled");
    }
  }
  for (const income of profile.incomeSources) add(income.jurisdiction, "income_sourced");
  for (const commitment of profile.commitments) add(commitment.jurisdiction, "liability_owed");
  add(profile.household.succession.jurisdiction, "succession_administered");

  // Dependents and future obligations have no jurisdiction field of their own.
  // Where support flows to the home country — the common case for a cross-border
  // household — the obligation lands there, so it is attributed to home rather
  // than to residence.
  const supported = profile.household.dependents.filter((d) => d.financiallySupported).length;
  if (supported > 0) add(context.homeCountry ?? context.residence, "dependent_supported");
  if (profile.futureObligations.length > 0) {
    add(context.homeCountry ?? context.residence, "obligation_payable");
  }

  return [...found.entries()]
    .map(([jurisdiction, triggers]) => {
      const list = [...triggers].sort();
      const depths = [...new Set(list.flatMap((t) => TRIGGER_DEPTHS[t]))].sort(
        (a, b) => packDepths.indexOf(a) - packDepths.indexOf(b),
      );
      return { jurisdiction, triggers: list, depths, why: describe(jurisdiction, list, depths) };
    })
    .sort((a, b) => b.depths.length - a.depths.length || (a.jurisdiction < b.jurisdiction ? -1 : 1));
}

const TRIGGER_PHRASES: Record<ActivationTrigger, string> = {
  residence: "you live there",
  home_country: "it is your home country",
  citizenship: "you hold its citizenship",
  tax_residence: "you are tax resident there",
  asset_held: "you hold assets there",
  liability_owed: "you owe something there",
  income_sourced: "income is sourced there",
  business_owned: "you own a business there",
  custodian_domiciled: "an institution there holds assets for you",
  dependent_supported: "you support family there",
  obligation_payable: "a future obligation falls due there",
  succession_administered: "succession would be administered there",
};

function describe(jurisdiction: string, triggers: ActivationTrigger[], depths: PackDepth[]): string {
  const reasons = triggers.map((t) => TRIGGER_PHRASES[t]);
  const joined =
    reasons.length === 1
      ? reasons[0]
      : `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
  const depthNote = depths.includes("opportunity")
    ? "Loaded for constraints and for pricing what is held."
    : depths.includes("planning")
      ? "Loaded for constraints and long-term planning, not as a place to invest."
      : "Loaded for constraints only.";
  return `${jurisdiction} matters because ${joined}. ${depthNote}`;
}

/**
 * Source classes a pack needs at the given depths.
 *
 * A5 and A6 are always present because global institutional data and USD
 * benchmark conditions bear on every jurisdiction — including ones whose
 * currency is pegged, where they bear on it most.
 */
export function requiredSourceClasses(depths: PackDepth[]): SourceClass[] {
  const classes = new Set<SourceClass>(["A5_global_institutional", "A6_usd_benchmark"]);
  if (depths.includes("constraint")) {
    classes.add("A1_central_bank");
    classes.add("A4_tax_legal_property_authority");
  }
  if (depths.includes("planning")) {
    classes.add("A2_statistics_agency");
    classes.add("A4_tax_legal_property_authority");
  }
  if (depths.includes("opportunity")) {
    classes.add("A3_securities_regulator_and_exchange");
    classes.add("A2_statistics_agency");
  }
  return [...classes].sort();
}
