import type { IntakeProfile } from "@/domain/intake/types";
import type { EpistemicStatus } from "@/domain/knowledge/epistemic-status";

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
 * What country context must never produce.
 *
 * The firewall, restated. An earlier version said country context may "never"
 * affect what something is worth. That was an over-correction and economically
 * wrong: a verified capital control genuinely reduces realisable value, a
 * verified withholding tax genuinely reduces cash flows, and a verified
 * ownership restriction genuinely changes what an asset is. Forbidding
 * jurisdiction from reaching value at all would make NeoOS wrong about real
 * economics in order to avoid a bias it can guard against more precisely.
 *
 * The narrower and correct invariant: **no country receives an automatic
 * preference or penalty because it is the subject's residence, home country or
 * emotional anchor.** Verified jurisdictional conditions may flow into
 * valuation through named economic channels; unverified country signal may not
 * flow anywhere.
 */
export const COUNTRY_MUST_NOT_CREATE = [
  "automatic country premium",
  "automatic country penalty",
  "override of asset-specific evidence",
  "preference derived from residence",
  "preference derived from home country",
  "preference derived from familiarity",
] as const;

/**
 * Channels through which a **verified** jurisdictional condition may legitimately
 * reach a valuation input.
 *
 * A subset of `COUNTRY_RELEVANCE_CHANNELS`. The excluded ones — inheritance,
 * family obligations, liability matching — bear on planning and suitability
 * rather than on what an asset is worth to anyone.
 */
export const VALUATION_AFFECTING_CHANNELS = [
  "taxation",
  "capital controls",
  "legal ownership",
  "transferability",
  "currency risk",
  "liquidity",
  "political risk",
  "transaction costs",
] as const;
export type ValuationAffectingChannel = (typeof VALUATION_AFFECTING_CHANNELS)[number];

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
  // Keyed case-insensitively. Intake fields are typed by hand and by form, so the
  // same country arrives as "NP" in one place and "Np" in another; keyed on the raw
  // string those are two jurisdictions, and a constraint recorded against one never
  // reaches anything tagged with the other. Casing is not a distinction between
  // countries. Spelling still is: "Nepal" and "NP" remain separate, because
  // resolving names to codes needs a canonical country list rather than a guess.
  const found = new Map<string, { label: string; triggers: Set<ActivationTrigger> }>();
  const add = (jurisdiction: string | null, trigger: ActivationTrigger) => {
    const label = jurisdiction?.trim();
    if (!label) return;
    const key = label.toUpperCase();
    const entry = found.get(key) ?? { label, triggers: new Set<ActivationTrigger>() };
    found.set(key, entry);
    entry.triggers.add(trigger);
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

  return [...found.values()]
    .map(({ label: jurisdiction, triggers }) => {
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


/* ---------------- what may reach a valuation ---------------- */

/**
 * Whether a jurisdictional condition may affect a valuation input.
 *
 * Two conditions, both required:
 *
 * 1. **The channel must be one that bears on value.** Inheritance law changes
 *    who receives an asset, not what it is worth to its holder.
 * 2. **The condition must be verified.** A `subject_stated_fact` or a
 *    `provisional_inference` about a jurisdiction may make NeoOS cautious and
 *    may shape planning. It may not move a number, because a valuation moved by
 *    an unverified belief is indistinguishable from a valuation moved by a
 *    prejudice.
 *
 * This is what replaces the blanket prohibition. It permits the economics and
 * still forbids the bias, which the blanket version achieved only by forbidding
 * both.
 */
export function mayAffectValuation(
  channel: string,
  status: EpistemicStatus,
): { permitted: boolean; reason: string } {
  const isValuationChannel = (VALUATION_AFFECTING_CHANNELS as readonly string[]).includes(channel);
  if (!isValuationChannel) {
    return {
      permitted: false,
      reason: `${channel} bears on planning or suitability, not on what an asset is worth.`,
    };
  }
  if (status !== "verified_external_fact" && status !== "governing_domain_rule") {
    return {
      permitted: false,
      reason: `A ${status.replace(/_/g, " ")} about ${channel} may inform planning and caution, but may not move a valuation input until it is verified.`,
    };
  }
  return {
    permitted: true,
    reason: `Verified ${channel} affects realisable cash flows, ownership or discount rate, and may enter the valuation as a cited input.`,
  };
}
