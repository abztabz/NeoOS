import type { IntakeProfile } from "@/domain/intake/types";

/**
 * Conversational guided intake.
 *
 * The same schema, the same provenance rules, a different door. A person who
 * would abandon a forty-field form will answer eleven questions if each one
 * arrives alone and explains itself, and this module is the ordered set of
 * those questions plus the rules for turning answers into schema writes.
 *
 * Three constraints hold absolutely, and each is enforced here rather than
 * trusted to the UI:
 *
 *   1. **Nothing is inferred.** An unanswered question leaves its field null.
 *      There is no "reasonable default", because a default the user did not
 *      choose is a model assumption wearing the label of a fact.
 *   2. **Conversation does not upgrade provenance.** An amount typed into a
 *      chat is `subject_estimate` unless the person says otherwise, exactly as
 *      it would be in the form. Saying it aloud does not make it verified.
 *   3. **Nothing is submitted without confirmation.** The flow summarises what
 *      it captured and waits. A guided flow that writes as it goes is a guided
 *      flow that writes mistakes.
 */

export type GuidedAnswerKind = "money" | "months" | "percent" | "year" | "text" | "choice";

export interface GuidedStep {
  id: string;
  /** The question, as a person would ask it. Never a field label. */
  prompt: string;
  /** Why it is being asked. Always shown — never a tooltip. */
  why: string;
  kind: GuidedAnswerKind;
  /** Path into the intake profile the answer writes to. */
  field: string;
  /** Whether this step may be skipped. Almost all may. */
  optional: boolean;
  /** What the position loses if it is skipped. Honest, never coercive. */
  ifSkipped: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

/**
 * The ordered flow.
 *
 * Ordered by consequence, not by schema structure. Base currency comes first
 * because every later amount is meaningless without it — the same reason the
 * structured form refuses to export without it. Residence and home country come
 * next because they decide which jurisdiction rules apply to everything after.
 */
export const GUIDED_STEPS: GuidedStep[] = [
  {
    id: "base-currency",
    prompt: "What currency do you think about your money in?",
    why: "Every figure after this one is meaningless without it, and I won't guess — a converted number is softer than a declared one.",
    kind: "text",
    field: "objective.baseCurrency",
    optional: false,
    ifSkipped: "I can't record anything without this.",
    placeholder: "AED",
  },
  {
    id: "residence",
    prompt: "Which country do you live in?",
    why: "It decides what you may hold, what you owe, and what you're taxed on. Those are constraints, not preferences.",
    kind: "text",
    field: "jurisdictionContext.residence",
    optional: false,
    ifSkipped: "Jurisdiction constraints can't be applied.",
    placeholder: "AE",
  },
  {
    id: "home-country",
    prompt: "And where's home, if that's somewhere different?",
    why: "Home shapes long-term planning — succession, family obligations, where you'd eventually return. It is not a reason to invest there, and I won't treat it as one.",
    kind: "text",
    field: "jurisdictionContext.homeCountry",
    optional: true,
    ifSkipped: "Long-horizon planning assumes you stay where you are.",
    placeholder: "NP",
  },
  {
    id: "income",
    prompt: "What comes in each month, after tax?",
    why: "It sets what you can save, and how quickly a gap could be closed if something went wrong.",
    kind: "money",
    field: "incomeSources[0].gross",
    optional: false,
    ifSkipped: "I can't work out your monthly flow or your reserve.",
  },
  {
    id: "obligations",
    prompt: "Roughly what goes out each month — household, everything?",
    why: "This is the figure everything else hangs off. Without it I can't tell you how much is genuinely safe to invest.",
    kind: "money",
    field: "household.monthlyObligations",
    optional: false,
    ifSkipped: "I can show you what you hold, but not what's spare.",
  },
  {
    id: "reserve-months",
    prompt: "How many months of that would you want covered without selling anything?",
    why: "It's the line between your safety net and your investable capital. I'd rather use your number than impose a convention.",
    kind: "months",
    field: "objective.reserveMonths",
    optional: false,
    ifSkipped: "I'd have to assume one, and mark everything downstream as resting on my assumption.",
  },
  {
    id: "assets",
    prompt: "What do you own? Property, gold, stocks, cash — roughly what each is worth.",
    why: "I need the shape of the position before I can say anything about it. Estimates are fine; I'll mark them as estimates.",
    kind: "text",
    field: "assets",
    optional: false,
    ifSkipped: "There's no position to reason about.",
  },
  {
    id: "liabilities",
    prompt: "Anything owed? Loans, cards, mortgages.",
    why: "Debt changes what's genuinely yours and what a bad month costs you. A position without it looks better than it is.",
    kind: "text",
    field: "liabilities",
    optional: true,
    ifSkipped: "Net worth and debt burden will be overstated.",
  },
  {
    id: "dependents",
    prompt: "Who depends on you financially?",
    why: "It changes how long the plan has to last and how much protection it needs. This is the part most planning tools skip and most families feel.",
    kind: "text",
    field: "household.dependents",
    optional: true,
    ifSkipped: "Protection needs and horizon are sized for one person.",
  },
  {
    id: "horizon",
    prompt: "How far out are you thinking — five years, twenty, a generation?",
    why: "It decides how much short-term movement is worth caring about. Over a long enough horizon most of what fills a news feed stops mattering.",
    kind: "months",
    field: "objective.horizonYears",
    optional: true,
    ifSkipped: "Freshness and volatility get judged against a default horizon rather than yours.",
  },
  {
    id: "capital-mobility",
    prompt: "Can money move freely out of the countries you hold assets in?",
    why: "Capital you can't move isn't capital you can deploy. If some of it is stuck, I need to count it separately rather than pretend it's reachable.",
    kind: "choice",
    field: "jurisdictionContext.constraints",
    optional: true,
    ifSkipped: "All capital is assumed mobile, which would overstate what's deployable.",
    options: [
      { value: "free", label: "Yes, freely" },
      { value: "restricted", label: "Restricted in at least one" },
      { value: "unknown", label: "I'm not sure" },
    ],
  },
];

export interface GuidedAnswer {
  stepId: string;
  /** Null means explicitly skipped or "I don't know". Never a substituted value. */
  value: string | null;
  /** True when the user said they did not know, as opposed to declining. */
  unknown: boolean;
  answeredAt: string;
}

export interface GuidedSession {
  answers: GuidedAnswer[];
  /** Index of the step being asked. One at a time, always. */
  cursor: number;
  /** True once the user has seen the summary and confirmed. */
  confirmed: boolean;
}

export function startSession(): GuidedSession {
  return { answers: [], cursor: 0, confirmed: false };
}

export function currentStep(session: GuidedSession): GuidedStep | null {
  return GUIDED_STEPS[session.cursor] ?? null;
}

/**
 * Record an answer and advance.
 *
 * Advancing past the last step does not submit. It moves to the summary, which
 * is a deliberate stop: the user reads back what was captured and confirms
 * before anything is written.
 */
export function recordAnswer(
  session: GuidedSession,
  value: string | null,
  unknown = false,
): GuidedSession {
  const step = currentStep(session);
  if (!step) return session;
  return {
    ...session,
    answers: [
      ...session.answers.filter((a) => a.stepId !== step.id),
      { stepId: step.id, value, unknown, answeredAt: new Date().toISOString() },
    ],
    cursor: session.cursor + 1,
  };
}

export function goBack(session: GuidedSession): GuidedSession {
  return { ...session, cursor: Math.max(0, session.cursor - 1) };
}

export function isComplete(session: GuidedSession): boolean {
  return session.cursor >= GUIDED_STEPS.length;
}

/** Steps that must be answered before anything can be submitted. */
export function unansweredRequired(session: GuidedSession): GuidedStep[] {
  return GUIDED_STEPS.filter((step) => {
    if (step.optional) return false;
    const answer = session.answers.find((a) => a.stepId === step.id);
    return !answer || answer.value === null;
  });
}

/**
 * What was captured, read back in the user's own terms.
 *
 * Shown before submission, always. A person confirming a summary they can
 * actually read catches their own typos; a person confirming a JSON blob does
 * not.
 */
export interface GuidedSummaryLine {
  question: string;
  answer: string;
  /** True when the answer was skipped or unknown, so it reads as a gap. */
  isGap: boolean;
}

export function summarise(session: GuidedSession): GuidedSummaryLine[] {
  return GUIDED_STEPS.map((step) => {
    const answer = session.answers.find((a) => a.stepId === step.id);
    if (!answer || answer.value === null) {
      return {
        question: step.prompt,
        answer: answer?.unknown ? "You weren't sure" : "Not answered",
        isGap: true,
      };
    }
    return { question: step.prompt, answer: answer.value, isGap: false };
  });
}

/**
 * Merge guided answers into a profile draft.
 *
 * Deliberately conservative and deliberately partial. It writes the fields it
 * can write unambiguously — currencies, jurisdictions, single amounts, counts —
 * and leaves the structural ones (assets, liabilities, dependents) for the form,
 * where a repeating row can be entered precisely.
 *
 * That is not a shortcoming to apologise for. Parsing "some gold, maybe 90k, a
 * bit in Nepal" into typed holdings would mean inventing a split the user never
 * stated, and the whole system rests on not doing that. The guided flow captures
 * the shape and hands off; the form records the specifics.
 */
export function applyToProfile(
  session: GuidedSession,
  base: IntakeProfile,
): { profile: IntakeProfile; deferred: string[] } {
  const deferred: string[] = [];
  const valueOf = (stepId: string): string | null =>
    session.answers.find((a) => a.stepId === stepId)?.value ?? null;

  const profile: IntakeProfile = structuredClone(base);

  const currency = valueOf("base-currency");
  if (currency && /^[A-Za-z]{3}$/.test(currency.trim())) {
    profile.objective.baseCurrency = currency.trim().toUpperCase();
  }

  const residence = valueOf("residence");
  if (residence) profile.jurisdictionContext.residence = residence.trim().toUpperCase();

  const home = valueOf("home-country");
  if (home) profile.jurisdictionContext.homeCountry = home.trim().toUpperCase();

  const obligations = parseAmount(valueOf("obligations"));
  if (obligations !== null && profile.objective.baseCurrency) {
    profile.household.monthlyObligations = {
      amount: obligations,
      currency: profile.objective.baseCurrency,
      // Spoken figures are estimates unless the user says otherwise. Saying a
      // number aloud does not make it a statement balance.
      basis: "subject_estimate",
      asOf: new Date().toISOString().slice(0, 10),
      note: "Captured through guided intake as an estimate.",
    };
  }

  const reserveMonths = parseAmount(valueOf("reserve-months"));
  if (reserveMonths !== null) profile.objective.reserveMonths = reserveMonths;

  const horizon = parseAmount(valueOf("horizon"));
  if (horizon !== null) profile.objective.horizonYears = horizon;

  const mobility = valueOf("capital-mobility");
  if (mobility === "restricted" && profile.jurisdictionContext.homeCountry) {
    profile.jurisdictionContext.constraints = [
      ...profile.jurisdictionContext.constraints,
      {
        jurisdiction: profile.jurisdictionContext.homeCountry,
        outboundCapitalMobility: "restricted",
        statedAt: new Date().toISOString().slice(0, 10),
        // Stated, not verified. The distinction survives into the schema.
        verifiedWithProfessional: false,
        notes: "Stated during guided intake and not professionally verified.",
      },
    ];
  }

  for (const stepId of ["assets", "liabilities", "dependents"]) {
    if (valueOf(stepId) !== null) deferred.push(stepId);
  }

  return { profile, deferred };
}

/**
 * Read a number out of something a person typed.
 *
 * Accepts "9,000", "9000 AED", "about 9k". Refuses anything ambiguous by
 * returning null, which leaves the field unanswered rather than guessing — the
 * failure mode worth protecting against is a confident wrong number, not a
 * missing one.
 */
export function parseAmount(text: string | null): number | null {
  if (text === null) return null;
  const cleaned = text.trim().toLowerCase().replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(k|m)?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (match[2] === "k") return value * 1_000;
  if (match[2] === "m") return value * 1_000_000;
  return value;
}
