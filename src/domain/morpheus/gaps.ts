import type { IntakeProfile } from "@/domain/intake/types";
import type { ProfileCalculations } from "@/domain/profile/calculations";
import { isKnown } from "@/domain/profile/provenance";

/**
 * Gap resolution, one question at a time.
 *
 * The rule is the whole design: **ask the single most valuable question, wait,
 * then ask the next one.** Presenting every unresolved field at once is how a
 * conversation becomes a form, and a form is what people abandon.
 *
 * "Most valuable" is not "first in the schema". It is the question that unblocks
 * the most downstream answers, which is why the ordering below is by consequence
 * rather than by structure. Monthly obligations come before drawdown tolerance
 * because the first unblocks the reserve, the reserve unblocks deployable
 * capital, and deployable capital is the question the user actually came with.
 *
 * Every question carries `why`, because a question a person does not understand
 * the purpose of is a question they answer carelessly or not at all.
 */

export interface GapQuestion {
  id: string;
  /** The question, in plain language. Never a field name. */
  question: string;
  /** What answering it unlocks. Shown with the question, never hidden. */
  why: string;
  /** What it costs to skip. Honest, not coercive. */
  ifSkipped: string;
  /** Where the answer lands in the intake schema. */
  field: string;
  kind: "money" | "months" | "percent" | "year" | "text" | "choice";
  /** Options when `kind` is choice. */
  options?: { value: string; label: string }[];
  /** Whether "I don't know" is an acceptable answer. Almost always yes. */
  allowUnknown: boolean;
}

/**
 * The ordered backlog. First entry whose precondition is unmet becomes the
 * question asked.
 *
 * Preconditions are functions of the profile rather than of the calculations,
 * because a field the user has genuinely declared should never be asked about
 * again — the most common way a guided flow becomes insulting.
 */
interface GapRule extends GapQuestion {
  /** True when this gap is still open. */
  open: (profile: IntakeProfile, calculations: ProfileCalculations) => boolean;
}

const RULES: GapRule[] = [
  {
    id: "household-obligations",
    question: "Roughly what do your household obligations come to each month?",
    why: "It's the figure everything else hangs off. Without it I can't tell you how much is genuinely safe to invest.",
    ifSkipped: "I can show you what you hold, but not what's spare.",
    field: "household.monthlyObligations",
    kind: "money",
    allowUnknown: true,
    open: (profile) =>
      profile.household.monthlyObligations === null ||
      profile.household.monthlyObligations.amount === null,
  },
  {
    id: "reserve-months",
    question: "How many months of outflow would you want to be able to cover without selling anything?",
    why: "This sets the line between your safety net and your investable capital. I'd rather use your number than impose a convention.",
    ifSkipped: "I'd have to assume a figure, and I'd have to mark everything downstream of it as resting on my assumption rather than your judgement.",
    field: "objective.reserveMonths",
    kind: "months",
    allowUnknown: true,
    open: (profile) => profile.objective.reserveMonths === null,
  },
  {
    id: "drawdown-tolerance",
    question: "How large a fall in your portfolio could you sit through without selling?",
    why: "Capacity is whether a fall can be survived. Tolerance is whether it can be sat through. The gap between them is where forced selling comes from.",
    ifSkipped: "I can size risk against your structure but not against your temperament, and the second is usually the binding one.",
    field: "objective.maxDrawdownTolerancePercent",
    kind: "percent",
    allowUnknown: true,
    open: (profile) => profile.objective.maxDrawdownTolerancePercent === null,
  },
  {
    id: "single-asset-limit",
    question: "What's the most you'd want in any single asset, as a share of the whole?",
    why: "Concentration isn't a fact about a portfolio, it's a judgement against a limit. Without yours I'd be imposing mine.",
    ifSkipped: "I can't tell you whether anything is over-concentrated, because there's nothing to measure against.",
    field: "objective.maxSingleAssetPercent",
    kind: "percent",
    allowUnknown: true,
    open: (profile) => profile.objective.maxSingleAssetPercent === null,
  },
  {
    id: "asset-kind-limit",
    question: "And the most in any one type of asset — property, gold, equities?",
    why: "You hold a lot in two categories. This is the limit that would tell me when that stops being conviction and starts being exposure.",
    ifSkipped: "Asset-type concentration goes unchecked.",
    field: "objective.maxAssetKindPercent",
    kind: "percent",
    allowUnknown: true,
    open: (profile) => profile.objective.maxAssetKindPercent === null,
  },
  {
    id: "spouse-birth-year",
    question: "What year was your spouse born?",
    why: "It affects how long the plan has to last, which changes what a safe withdrawal looks like decades out.",
    ifSkipped: "Long-horizon projections rest on my assumption about the second life rather than on a fact.",
    field: "household.dependents[spouse].birthYear",
    kind: "year",
    allowUnknown: true,
    open: (profile) =>
      profile.household.dependents.some((d) => d.relationship === "spouse" && d.birthYear === null),
  },
  {
    id: "jurisdiction-limit",
    question: "What's the most you'd want held in any one country?",
    why: "Most of what you hold sits in one jurisdiction, and you've told me capital can't easily leave it. This limit is where that becomes measurable.",
    ifSkipped: "Jurisdiction concentration goes unchecked, which matters more for you than for most people.",
    field: "objective.maxJurisdictionPercent",
    kind: "percent",
    allowUnknown: true,
    open: (profile) => profile.objective.maxJurisdictionPercent === null,
  },
  {
    id: "currency-limit",
    question: "And the most in any single currency?",
    why: "Your income and your assets are in different currencies. This is the limit that makes that visible as a risk rather than a detail.",
    ifSkipped: "Currency concentration goes unchecked.",
    field: "objective.maxCurrencyPercent",
    kind: "percent",
    allowUnknown: true,
    open: (profile) => profile.objective.maxCurrencyPercent === null,
  },
  {
    id: "succession-jurisdiction",
    question: "Which country's law would decide what happens to your assets?",
    why: "You've said the property goes to your wife and son. Whether that holds depends entirely on which jurisdiction administers it.",
    ifSkipped: "I can't tell you whether your stated intention would actually happen.",
    field: "household.succession.jurisdiction",
    kind: "text",
    allowUnknown: true,
    open: (profile) => profile.household.succession.jurisdiction === null,
  },
];

/**
 * The next question worth asking, or null when nothing is outstanding.
 *
 * `skipped` lets the user decline a question without being asked it again in the
 * same session. Re-asking something somebody just declined is the fastest way to
 * make a guided flow feel like an interrogation.
 */
export function nextGap(
  profile: IntakeProfile | null,
  calculations: ProfileCalculations | null,
  skipped: string[] = [],
): GapQuestion | null {
  if (profile === null || calculations === null) return null;
  const rule = RULES.find((r) => !skipped.includes(r.id) && r.open(profile, calculations));
  if (!rule) return null;
  const question: GapQuestion = {
    id: rule.id,
    question: rule.question,
    why: rule.why,
    ifSkipped: rule.ifSkipped,
    field: rule.field,
    kind: rule.kind,
    options: rule.options,
    allowUnknown: rule.allowUnknown,
  };
  return question;
}

/** How many gaps remain, for a quiet indication of progress. */
export function openGapCount(
  profile: IntakeProfile | null,
  calculations: ProfileCalculations | null,
): number {
  if (profile === null || calculations === null) return 0;
  return RULES.filter((r) => r.open(profile, calculations)).length;
}

/**
 * What the position would gain from closing the next gap.
 *
 * Used to explain *why now* without listing everything at once — the answer to
 * "why are you asking me this?" that keeps a guided flow feeling purposeful.
 */
export function gapUnlocks(
  gap: GapQuestion,
  calculations: ProfileCalculations | null,
): string[] {
  if (calculations === null) return [];
  const unlocks: string[] = [];
  if (gap.id === "household-obligations" || gap.id === "reserve-months") {
    if (!isKnown(calculations.reserveCoverage)) unlocks.push("whether your reserve is funded");
    if (!isKnown(calculations.investableCash)) unlocks.push("what's genuinely deployable");
    if (!isKnown(calculations.deploymentStatus)) unlocks.push("whether to deploy at all");
  }
  if (gap.id.endsWith("-limit") && !isKnown(calculations.concentrationRisk)) {
    unlocks.push("whether anything is over-concentrated");
  }
  if (gap.id === "drawdown-tolerance" && !isKnown(calculations.riskCapacity)) {
    unlocks.push("how much risk your structure actually supports");
  }
  return unlocks;
}
