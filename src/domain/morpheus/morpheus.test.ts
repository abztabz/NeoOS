import { describe, expect, it } from "vitest";
import { classify, suggestFor } from "@/domain/morpheus/intents";
import { respond, type AnswerContext } from "@/domain/morpheus/answers";
import { buildBriefing, briefingLimits } from "@/domain/morpheus/briefing";
import { nextGap, openGapCount } from "@/domain/morpheus/gaps";
import { greeting, qualify, say, sayMonths, sentence } from "@/domain/morpheus/voice";
import { calculateProfile } from "@/domain/profile/calculations";
import { emptyProfile } from "@/domain/intake/types";
import type { IntakeProfile } from "@/domain/intake/types";

/** A profile with nothing declared, for the "knows nothing" cases. */
const blankProfile = (): IntakeProfile =>
  emptyProfile("subject-test", "profile-test", "2026-07-27T00:00:00.000Z");

/**
 * These tests pin the behaviour the conversational rewrite is actually for:
 * that Morpheus leads with a conclusion, refuses in plain language rather than
 * in status codes, never invents a figure, and asks one question at a time.
 *
 * Vocabulary assertions look fussy and are the point. "Personalisation
 * unavailable. Blocking fields: dependants" is a correct sentence and a product
 * failure, and the only way to keep it out is to assert it stays out.
 */

function profileWith(patch: (profile: IntakeProfile) => void): IntakeProfile {
  const profile = blankProfile();
  patch(profile);
  return profile;
}

const emptyContext: AnswerContext = {
  calculations: null,
  isDemo: true,
  lastIntent: null,
  lastAnswer: null,
};

/** Internal vocabulary that must never reach a visible sentence. */
const FORBIDDEN = [
  "personalisation unavailable",
  "blocking fields",
  "insufficient evidence",
  "provenance",
  "user_fact",
  "model_assumption",
  "schema",
  "null",
  "undefined",
  "reserve_first",
  "obligations_first",
];

function visibleText(answer: ReturnType<typeof respond>): string {
  return [answer.conclusion, answer.whyItMatters, answer.action, answer.uncertainty]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

describe("intent classification", () => {
  it("recognises the workspace questions the product brief names", () => {
    expect(classify("What is the safest use of my next $1,000?")).toBe("marginal_allocation");
    expect(classify("What changed today that matters to my plan?")).toBe("what_changed");
    expect(classify("What is my largest concentration risk?")).toBe("concentration");
    expect(classify("Should I add, hold or reduce gold?")).toBe("gold_posture");
    expect(classify("How much of this is truly deployable?")).toBe("deployable_cash");
    expect(classify("Is my plan still on track?")).toBe("plan_on_track");
  });

  it("is insensitive to case and punctuation", () => {
    expect(classify("SHOULD I BUY GOLD???")).toBe("gold_posture");
    expect(classify("should i buy gold")).toBe("gold_posture");
  });

  it("says it did not understand rather than guessing", () => {
    expect(classify("what is the airspeed velocity of an unladen swallow")).toBe("unrecognised");
    expect(classify("")).toBe("unrecognised");
  });

  it("routes a bare 'why' back to the previous answer", () => {
    expect(classify("why?")).toBe("explain");
    expect(classify("how do you know that")).toBe("evidence");
  });
});

describe("answering with no position", () => {
  it("refuses in a sentence, not a status code", () => {
    const result = respond("marginal_allocation", "should I invest?", emptyContext);
    expect(result.conclusion).toContain("I don't know what you hold");
    for (const phrase of FORBIDDEN) {
      expect(visibleText(result)).not.toContain(phrase);
    }
  });

  it("names the consequence of the gap, not the missing field", () => {
    const result = respond("deployable_cash", "how much can I invest?", emptyContext);
    // The brief's own example: say what you cannot tell them, not what is null.
    expect(result.whyItMatters).toContain("dressed up as advice");
    expect(result.decision.confidence).toBeNull();
  });

  it("offers both intake doors rather than only the form", () => {
    const result = respond("reserve", "is my reserve ok?", emptyContext);
    expect(result.action).toContain("question at a time");
    expect(result.action).toContain("form");
  });

  it("still produces an auditable decision object", () => {
    const result = respond("largest_risk", "what should I worry about?", emptyContext);
    expect(result.decision.recommendation).toBe("insufficient_position");
    expect(result.decision.provenance).toBe("missing");
    expect(result.decision.disconfirmation.length).toBeGreaterThan(0);
  });
});

describe("answering from a real position", () => {
  const profile = profileWith((p) => {
    p.objective.baseCurrency = "AED";
    p.objective.reserveMonths = 5;
    p.household.monthlyObligations = {
      amount: 9000,
      currency: "AED",
      basis: "subject_estimate",
      asOf: "2026-07-26",
      note: null,
    };
  });
  const calculations = calculateProfile(profile);
  const context: AnswerContext = { calculations, isDemo: false, lastIntent: null, lastAnswer: null };

  it("leads with the conclusion", () => {
    const result = respond("reserve", "is my reserve funded?", context);
    // The first sentence carries the decision; the reader should not have to
    // reach paragraph three to find out the answer.
    expect(result.conclusion.length).toBeGreaterThan(0);
    expect(result.conclusion).not.toContain("Based on");
    expect(result.conclusion).not.toContain("It depends");
  });

  it("keeps internal vocabulary out of every visible sentence", () => {
    for (const intent of ["marginal_allocation", "reserve", "concentration", "largest_risk"] as const) {
      const result = respond(intent, "", context);
      for (const phrase of FORBIDDEN) {
        expect(visibleText(result), `${intent} leaked "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it("attaches evidence with provenance to answers that have any", () => {
    const result = respond("reserve", "reserve?", context);
    for (const item of result.evidence) {
      expect(item.provenance).toBeTruthy();
      expect(item.detail.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic — the same question twice gives the same words", () => {
    const first = respond("reserve", "is my reserve funded?", context);
    const second = respond("reserve", "is my reserve funded?", context);
    expect(first.conclusion).toBe(second.conclusion);
    expect(first.whyItMatters).toBe(second.whyItMatters);
  });

  it("never claims a figure it was not given", () => {
    const result = respond("concentration", "am I too concentrated?", context);
    // No limits are set on this profile, so the honest answer is that there is
    // nothing to measure against — not a number invented for the occasion.
    expect(result.conclusion).toContain("haven't told me");
    expect(result.decision.recommendation).toBe("withheld");
  });
});

describe("follow-up continuity", () => {
  const context: AnswerContext = { ...emptyContext };

  it("explains the previous answer rather than starting over", () => {
    const first = respond("marginal_allocation", "should I invest?", context);
    const explained = respond("explain", "why?", { ...context, lastAnswer: first, lastIntent: first.intent });
    expect(explained.decision.recommendation).toContain("explanation_of:");
  });

  it("says plainly when there is nothing yet to explain", () => {
    const result = respond("explain", "why?", context);
    expect(result.conclusion).toContain("nothing yet");
  });

  it("does not offer evidence for a refusal, because there is none", () => {
    const refusal = respond("reserve", "reserve?", context);
    const evidence = respond("evidence", "show me", { ...context, lastAnswer: refusal });
    expect(evidence.conclusion).toContain("no evidence");
  });
});

describe("the daily briefing", () => {
  it("carries both answers and exactly one suggested action", () => {
    const briefing = buildBriefing({
      context: emptyContext,
      personalisation: "unavailable",
      hasProfile: false,
      hour: 9,
    });
    expect(briefing.posture).toBeTruthy();
    expect(briefing.risk).toBeTruthy();
    // One action, not a list of things to consider. Two suggested actions is
    // zero suggested actions.
    expect(typeof briefing.nextAction === "string" || briefing.nextAction === null).toBe(true);
  });

  it("never greets somebody cheerfully about a position it cannot see", () => {
    const briefing = buildBriefing({
      context: emptyContext,
      personalisation: "unavailable",
      hasProfile: false,
      hour: 9,
    });
    expect(briefing.greeting).toContain("don't know anything about your position");
  });

  it("counts remaining gaps instead of listing them all", () => {
    const profile = blankProfile();
    const calculations = calculateProfile(profile);
    const limits = briefingLimits({ calculations, isDemo: false, lastIntent: null, lastAnswer: null });
    expect(limits).toContain("one at a time");
    expect(limits).not.toContain(",");
  });
});

describe("gap resolution", () => {
  const profile = blankProfile();
  const calculations = calculateProfile(profile);

  it("asks exactly one question", () => {
    const gap = nextGap(profile, calculations);
    expect(gap).not.toBeNull();
    expect(openGapCount(profile, calculations)).toBeGreaterThan(1);
  });

  it("asks the highest-consequence question first", () => {
    // Obligations before drawdown tolerance: the first unblocks the reserve,
    // the reserve unblocks deployable capital, which is the question people
    // actually arrive with.
    expect(nextGap(profile, calculations)?.id).toBe("household-obligations");
  });

  it("explains why it is asking and what skipping costs", () => {
    const gap = nextGap(profile, calculations)!;
    expect(gap.why.length).toBeGreaterThan(20);
    expect(gap.ifSkipped.length).toBeGreaterThan(10);
    expect(gap.allowUnknown).toBe(true);
  });

  it("does not re-ask something the user just declined", () => {
    const first = nextGap(profile, calculations)!;
    const second = nextGap(profile, calculations, [first.id]);
    expect(second?.id).not.toBe(first.id);
  });

  it("phrases questions as questions, never as field names", () => {
    const gap = nextGap(profile, calculations)!;
    expect(gap.question).toMatch(/\?$/);
    expect(gap.question).not.toContain("_");
    expect(gap.question).not.toContain(".");
  });
});

describe("suggested questions", () => {
  it("offers the workspace's own question in each workspace", () => {
    expect(suggestFor("/gold", null)[0]?.intent).toBe("gold_posture");
    expect(suggestFor("/cash", null)[0]?.intent).toBe("deployable_cash");
    expect(suggestFor("/portfolio", null)[0]?.intent).toBe("concentration");
  });

  it("caps suggestions so the interface does not become a menu", () => {
    const profile = blankProfile();
    expect(suggestFor("/capital", calculateProfile(profile)).length).toBeLessThanOrEqual(4);
  });
});

describe("voice", () => {
  it("joins currencies rather than summing them", () => {
    expect(say({ AED: 1000, NPR: 42000 })).toBe("1,000 AED and 42,000 NPR");
  });

  it("says an unknown amount as unknown, not as zero", () => {
    expect(say(null)).toContain("don't know");
    expect(sayMonths(null)).toContain("unknown");
  });

  it("does not qualify a figure that needs no qualification", () => {
    // Qualifying everything trains the reader to skip the qualifications that
    // matter.
    expect(qualify("user_fact")).toBeNull();
    expect(qualify("calculated")).toBeNull();
    expect(qualify("model_assumption")).toContain("assume");
  });

  it("builds sentences without double punctuation", () => {
    expect(sentence("One thing.", "Another thing")).toBe("One thing. Another thing.");
    expect(sentence("Only this", null, undefined)).toBe("Only this.");
  });

  it("greets according to what is actually known", () => {
    expect(greeting("demo", 9)).toContain("not your money");
    expect(greeting("full_position", 20)).toContain("Evening");
  });
});
