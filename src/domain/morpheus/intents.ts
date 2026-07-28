import type { MorpheusIntent, SuggestedQuestion } from "@/domain/morpheus/answer";
import type { ProfileCalculations } from "@/domain/profile/calculations";
import { isKnown } from "@/domain/profile/provenance";

/**
 * Understanding what was asked, without a language model.
 *
 * Deterministic keyword and phrase matching. That is a deliberate constraint,
 * not a placeholder: NeoOS answers from computed domain outputs, so an intent
 * is only useful if it maps to a question the domain can actually answer. A
 * classifier that recognised a hundred intents NeoOS cannot answer would be
 * worse than one that recognises nine and says so about the rest.
 *
 * Unrecognised is a real outcome, and it is answered honestly rather than
 * deflected with a generic reply. Pretending to have understood is the specific
 * behaviour that makes a conversational product untrustworthy.
 */

interface IntentRule {
  intent: MorpheusIntent;
  /** All of these must appear for the rule to fire. */
  required?: string[][];
  /** Any of these firing is enough. */
  any: string[];
  /** Any of these present disqualifies the match. */
  unless?: string[];
}

/**
 * Rules are ordered: the first match wins. More specific intents therefore come
 * before broader ones — "how much of my cash is deployable" must not be caught
 * by the general deployment rule.
 */
const RULES: IntentRule[] = [
  {
    intent: "evidence",
    any: ["show me the evidence", "what is that based on", "what's that based on", "show your working", "sources", "how do you know"],
  },
  {
    intent: "explain",
    any: ["why", "explain", "how did you get", "what do you mean", "elaborate"],
    unless: ["why not gold", "why gold"],
  },
  {
    intent: "deployable_cash",
    any: ["deployable", "truly available", "actually available", "how much cash", "free cash", "spare cash", "how much can i invest", "safe to invest"],
  },
  {
    intent: "reserve",
    any: ["reserve", "emergency fund", "safety net", "buffer", "rainy day", "months of cover", "runway"],
  },
  {
    intent: "gold_posture",
    any: ["gold", "bullion", "metal"],
  },
  {
    intent: "concentration",
    any: ["concentration", "concentrated", "too much in", "diversif", "biggest holding", "largest holding", "exposure"],
  },
  {
    intent: "what_changed",
    any: ["what changed", "what's changed", "what has changed", "anything new", "today", "news", "update me"],
  },
  {
    intent: "largest_risk",
    any: ["risk", "worried", "worry", "danger", "vulnerable", "weakest", "what could go wrong", "exposed"],
  },
  {
    intent: "plan_on_track",
    any: ["on track", "on plan", "goal", "target", "2035", "retire", "timeline", "am i going to make it"],
  },
  {
    intent: "marginal_allocation",
    any: ["next", "should i invest", "should i buy", "where should i put", "what should i do", "best use", "allocate", "deploy", "spare", "extra"],
  },
  {
    intent: "briefing",
    any: ["brief", "summary", "overview", "where do i stand", "how am i doing", "status"],
  },
];

/**
 * Classify a question.
 *
 * Lowercased and stripped of punctuation before matching, because "Should I
 * buy gold?" and "should i buy gold" are the same question and treating them
 * differently would be a bug the user experiences as the system being fussy.
 */
export function classify(question: string): MorpheusIntent {
  const text = question.toLowerCase().replace(/[^a-z0-9$£€\s']/g, " ").replace(/\s+/g, " ").trim();
  if (text.length === 0) return "unrecognised";

  for (const rule of RULES) {
    if (rule.unless?.some((phrase) => text.includes(phrase))) continue;
    if (rule.required && !rule.required.every((group) => group.some((word) => text.includes(word)))) {
      continue;
    }
    if (rule.any.some((phrase) => text.includes(phrase))) return rule.intent;
  }
  return "unrecognised";
}

/**
 * Questions worth offering right now.
 *
 * Computed from the position rather than drawn from a fixed list. Offering
 * "should I add to gold?" to somebody who holds none is noise dressed as
 * helpfulness, and offering "how much is deployable?" to somebody whose
 * obligations are unknown invites an answer NeoOS would have to refuse.
 *
 * Capped at four. A wall of suggestions is a menu, and a menu is what this
 * interface is trying not to be.
 */
export function suggestFor(
  workspace: string,
  calculations: ProfileCalculations | null,
): SuggestedQuestion[] {
  const suggestions: SuggestedQuestion[] = [];

  const contextual: Record<string, SuggestedQuestion> = {
    "/capital": {
      text: "What is the safest use of my next 1,000?",
      intent: "marginal_allocation",
      because: "The marginal decision, which is the one you actually face.",
    },
    "/markets": {
      text: "What changed today that matters to my plan?",
      intent: "what_changed",
      because: "Filtered to your position, not the whole market.",
    },
    "/portfolio": {
      text: "What is my largest concentration risk?",
      intent: "concentration",
      because: "Measured against the limits you set.",
    },
    "/gold": {
      text: "Should I add, hold or reduce gold?",
      intent: "gold_posture",
      because: "Gold is a large part of what you hold.",
    },
    "/cash": {
      text: "How much of this is truly deployable?",
      intent: "deployable_cash",
      because: "Reserve and trapped capital come out first.",
    },
    "/timeline": {
      text: "Is my plan still on track?",
      intent: "plan_on_track",
      because: "Against the horizon you set.",
    },
  };

  const forWorkspace = contextual[workspace];
  if (forWorkspace) suggestions.push(forWorkspace);

  if (calculations === null) {
    suggestions.push({
      text: "What do you need from me first?",
      intent: "briefing",
      because: "Nothing is known about your position yet.",
    });
    return suggestions.slice(0, 4);
  }

  // Position-aware suggestions, each gated on the figure existing. A question
  // NeoOS would have to refuse is not a good suggestion.
  if (isKnown(calculations.deploymentStatus) && workspace !== "/capital") {
    suggestions.push({
      text: "Should I be deploying capital right now?",
      intent: "marginal_allocation",
      because: "Posture comes before any asset choice.",
    });
  }
  if (isKnown(calculations.reserveCoverage) && workspace !== "/cash") {
    const coverage = calculations.reserveCoverage.value;
    if (coverage && !coverage.funded) {
      suggestions.push({
        text: "Is my reserve actually funded?",
        intent: "reserve",
        because: "Reachable capital falls short of what you asked for.",
      });
    }
  }
  if (isKnown(calculations.concentrationRisk) && workspace !== "/portfolio") {
    const risk = calculations.concentrationRisk.value;
    if (risk && risk.breaches.length > 0) {
      suggestions.push({
        text: "What is my largest concentration risk?",
        intent: "concentration",
        because: `${risk.breaches.length} limit${risk.breaches.length === 1 ? "" : "s"} you set ${risk.breaches.length === 1 ? "is" : "are"} breached.`,
      });
    }
  }
  if (workspace !== "/timeline") {
    suggestions.push({
      text: "What is my largest unaddressed risk?",
      intent: "largest_risk",
      because: "Structural exposure, not market noise.",
    });
  }

  return suggestions.slice(0, 4);
}
