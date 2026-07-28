import { answer, type EvidenceItem, type MorpheusAnswer, type MorpheusIntent } from "@/domain/morpheus/answer";
import { list, plural, say, sayMonths, sayPercent, sentence, weakestOf } from "@/domain/morpheus/voice";
import type { ProfileCalculations } from "@/domain/profile/calculations";
import type { Attributed } from "@/domain/profile/provenance";
import { isKnown } from "@/domain/profile/provenance";

/**
 * Turning computed domain outputs into something a person would say.
 *
 * Every answer in this module is a deterministic function of
 * `ProfileCalculations` — the same object the workspaces render. Nothing is
 * generated, sampled, or softened. Ask the same question twice with the same
 * position and you get the same words.
 *
 * The rule that shapes all of it: **a refusal is still an answer.** When the
 * domain cannot compute something, Morpheus says what he cannot tell them and
 * what it would take to change that, in a sentence. He does not print a status
 * code, and he does not fill the gap with a plausible number.
 */

export interface AnswerContext {
  calculations: ProfileCalculations | null;
  /** True when the visible position is the worked example, not the user's. */
  isDemo: boolean;
  /** What the last answer was about, so "why?" has something to explain. */
  lastIntent: MorpheusIntent | null;
  lastAnswer: MorpheusAnswer | null;
}

/** Evidence built from an attributed figure, so provenance travels with it. */
function evidenceFrom<T>(label: string, attributed: Attributed<T>, detail: string): EvidenceItem {
  return {
    label,
    detail,
    provenance: attributed.provenance,
    sourceNote: attributed.basis,
  };
}

/**
 * The answer when there is no position to answer about.
 *
 * Worth its own function because it is the most common first experience, and
 * because getting it wrong — a cheerful dashboard over an empty profile — is
 * how a product like this loses trust in the first thirty seconds.
 */
function noPosition(intent: MorpheusIntent): MorpheusAnswer {
  return answer({
    intent,
    conclusion: "I can't answer that yet, because I don't know what you hold.",
    whyItMatters:
      "Anything I told you now would be a general observation about markets dressed up as advice about your money. That is the one thing I won't do.",
    action: "Tell me your position — I can walk you through it a question at a time, or you can fill the form directly.",
    uncertainty: null,
    workspace: { href: "/intake", label: "Start with your position" },
    followUp: "Would you rather answer a few questions, or enter it yourself?",
    recommendation: "insufficient_position",
    confidence: null,
    provenance: "missing",
    risks: ["Acting on general market commentary as though it were personal advice."],
    disconfirmation: ["Nothing here is a claim about your capital, so there is nothing to disconfirm."],
    nextAction: "Complete intake, conversationally or by form.",
  });
}

const demoNote =
  "You're looking at the worked example, so treat this as a demonstration of how I reason rather than a statement about your money.";

/* ---------------- individual intents ---------------- */

function marginalAllocation(context: AnswerContext): MorpheusAnswer {
  const { calculations } = context;
  if (!calculations) return noPosition("marginal_allocation");

  const status = calculations.deploymentStatus;
  const investable = calculations.investableCash;

  if (!isKnown(status)) {
    return answer({
      intent: "marginal_allocation",
      conclusion: "I can't tell you whether to deploy capital yet.",
      whyItMatters:
        "Deciding what to buy before knowing whether you should be buying at all is backwards, and the pieces I'd need for the first question are still missing.",
      action: `Fill the gaps that block it: ${list(status.missing.slice(0, 3))}.`,
      uncertainty: null,
      workspace: { href: "/intake", label: "Fill the gaps" },
      followUp: `Can you tell me ${status.missing[0] ?? "the missing figures"}?`,
      recommendation: "withheld",
      confidence: null,
      provenance: "missing",
      risks: ["Deploying capital without knowing what is genuinely spare."],
      disconfirmation: ["A complete enough position would let me answer this directly."],
    });
  }

  const value = status.value!;
  const cash = investable.value;
  const amountPhrase = cash ? `${Math.round(cash.amount).toLocaleString("en-US")} ${cash.currency}` : null;

  // The domain's five statuses collapse to three things a person can do:
  // press, press lightly, or wait. The headline carries the nuance.
  const conclusion =
    value.status === "ready"
      ? `Yes — you have room to deploy${amountPhrase ? `, and it's about ${amountPhrase}` : ""}.`
      : value.status === "limited"
        ? `Lightly${amountPhrase ? `, and no more than about ${amountPhrase}` : ""}. There's room, but not much of it.`
        : value.status === "reserve_first"
          ? "Not yet — your reserve comes first."
          : value.status === "obligations_first"
            ? "Not yet — there are obligations ahead of any new investment."
            : value.headline;

  const evidence: EvidenceItem[] = [
    evidenceFrom("Deployment posture", status, value.headline),
    ...(isKnown(investable) && cash
      ? [
          evidenceFrom(
            "Investable cash",
            investable,
            `${Math.round(cash.liquid).toLocaleString("en-US")} ${cash.currency} liquid, less ${Math.round(cash.reserveHeldBack).toLocaleString("en-US")} held for reserve` +
              (Object.keys(cash.immobileByJurisdiction).length > 0
                ? `, and ${say(cash.immobileByJurisdiction)} that cannot leave where it sits`
                : ""),
          ),
        ]
      : []),
  ];

  return answer({
    intent: "marginal_allocation",
    conclusion: context.isDemo ? `${conclusion} ${demoNote}` : conclusion,
    whyItMatters: value.reasons[0] ?? "This is the binding constraint on how hard you can press right now.",
    action:
      value.status === "ready"
        ? "Deploy in tranches rather than at once, and keep the reserve untouched."
        : "Leave the reserve alone and revisit when the binding constraint moves.",
    uncertainty:
      value.reasons.length > 1 ? `Also weighing on this: ${list(value.reasons.slice(1, 3))}.` : null,
    evidence,
    workspace: { href: "/capital", label: "See the full capital picture" },
    followUp:
      value.status === "ready"
        ? "Do you want me to look at where that would best go?"
        : "Do you want to see what would have to change for this to open up?",
    recommendation: value.status,
    confidence: value.status === "ready" ? 70 : 60,
    provenance: weakestOf([status, investable]),
    risks: value.reasons,
    disconfirmation: [
      "A material change in income stability would move this before any market move would.",
      "If the reserve requirement is wrong, everything downstream of it is wrong.",
    ],
    nextAction: value.status === "ready" ? "Deploy in tranches." : "Hold.",
  });
}

function deployableCash(context: AnswerContext): MorpheusAnswer {
  const { calculations } = context;
  if (!calculations) return noPosition("deployable_cash");

  const investable = calculations.investableCash;
  if (!isKnown(investable) || !investable.value) {
    return answer({
      intent: "deployable_cash",
      conclusion: "I can't separate what's genuinely spare from what's already committed.",
      whyItMatters:
        "The number that matters isn't what you hold, it's what you could lose without it changing how you live. I can't compute that yet.",
      action: `I need ${list(investable.missing.slice(0, 3))}.`,
      workspace: { href: "/intake", label: "Fill the gaps" },
      followUp: `Can you give me ${investable.missing[0] ?? "the missing figures"}?`,
      recommendation: "withheld",
      provenance: "missing",
      disconfirmation: ["The figures named above would settle it."],
    });
  }

  const cash = investable.value;
  const trapped = Object.keys(cash.immobileByJurisdiction).length > 0;

  return answer({
    intent: "deployable_cash",
    conclusion: `About ${Math.round(cash.amount).toLocaleString("en-US")} ${cash.currency} is genuinely deployable.`,
    whyItMatters: sentence(
      `That's ${Math.round(cash.liquid).toLocaleString("en-US")} ${cash.currency} of liquid capital, less ${Math.round(cash.reserveHeldBack).toLocaleString("en-US")} held back for your reserve`,
      trapped
        ? `and less ${say(cash.immobileByJurisdiction)} that can't legally leave where it sits — that money is real, but it isn't reachable for anything outside its own jurisdiction`
        : null,
    ),
    action: trapped
      ? "Treat the trapped portion as a separate pool with its own options, not as part of your deployable capital."
      : "Deploy from this figure, not from your total balance.",
    uncertainty: trapped
      ? "The capital-movement restriction is something you told me and I haven't verified. If it's wrong, the deployable figure is materially larger."
      : null,
    evidence: [
      evidenceFrom("Investable cash", investable, `${Math.round(cash.amount).toLocaleString("en-US")} ${cash.currency} after all holdbacks`),
    ],
    workspace: { href: "/cash", label: "See the cash workspace" },
    followUp: trapped
      ? "Have you had the transfer restriction confirmed by an accountant there?"
      : "Do you want to know where that would best go?",
    recommendation: "deployable_computed",
    confidence: trapped ? 60 : 75,
    provenance: investable.provenance,
    risks: trapped ? ["A large share of liquid capital is immobile."] : [],
    disconfirmation: ["A verified transfer rule, in either direction, changes this figure."],
    nextAction: "Use the deployable figure, not the balance.",
  });
}

function reserve(context: AnswerContext): MorpheusAnswer {
  const { calculations } = context;
  if (!calculations) return noPosition("reserve");

  const coverage = calculations.reserveCoverage;
  if (!isKnown(coverage) || !coverage.value) {
    return answer({
      intent: "reserve",
      conclusion: "I can't tell you whether your reserve is funded.",
      whyItMatters:
        "This is the figure everything else depends on. Until it's settled I can't tell you how much is genuinely safe to invest.",
      action: `I need ${list(coverage.missing.slice(0, 3))}.`,
      workspace: { href: "/intake", label: "Fill the gaps" },
      followUp: `What are ${coverage.missing[0] ?? "your monthly obligations"}?`,
      recommendation: "withheld",
      provenance: "missing",
      disconfirmation: ["Your monthly outflow and liquid holdings would settle it."],
    });
  }

  const value = coverage.value;
  const shortfall = value.mobileMonths < value.required;

  return answer({
    intent: "reserve",
    conclusion: shortfall
      ? `Your reserve is short. Reachable capital covers ${sayMonths(value.mobileMonths)}, against the ${value.required} you asked for.`
      : `Your reserve is funded — ${sayMonths(value.mobileMonths)} of reachable cover against the ${value.required} you asked for.`,
    whyItMatters:
      value.months > value.mobileMonths
        ? `On paper you hold ${sayMonths(value.months)} of cover, but not all of it can reach the bills. I count only what can actually get there, because a reserve you can't spend in the month you need it isn't a reserve.`
        : "This is what stands between a bad month and having to sell something at the wrong time.",
    action: shortfall
      ? "Close the reserve before deploying anything else. It's the cheapest risk reduction available to you."
      : "Leave it alone. It's doing its job.",
    uncertainty: null,
    evidence: [
      evidenceFrom(
        "Reserve coverage",
        coverage,
        `${value.mobileMonths.toFixed(1)} reachable months of ${Math.round(value.monthlyOutflow).toLocaleString("en-US")} ${value.currency} monthly outflow` +
          (value.months > value.mobileMonths ? `; ${value.months.toFixed(1)} months if trapped capital counted` : ""),
      ),
    ],
    workspace: { href: "/cash", label: "See the cash workspace" },
    followUp: shortfall ? "Do you want to see what closing it would take each month?" : null,
    recommendation: shortfall ? "underfunded" : "funded",
    confidence: 80,
    provenance: coverage.provenance,
    risks: shortfall ? ["A shock would force a sale at whatever price is available that week."] : [],
    disconfirmation: ["A change in monthly obligations moves this more than any market move."],
    nextAction: shortfall ? "Fund the reserve first." : "No action.",
  });
}

function concentration(context: AnswerContext): MorpheusAnswer {
  const { calculations } = context;
  if (!calculations) return noPosition("concentration");

  const risk = calculations.concentrationRisk;
  if (!isKnown(risk) || !risk.value) {
    return answer({
      intent: "concentration",
      conclusion: "I can't check your concentration, because you haven't told me what would count as too much.",
      whyItMatters:
        "Concentration isn't a fact about a portfolio, it's a judgement against a limit. Without your limits I'd be imposing mine, and mine aren't about your life.",
      action: "Set your limits — the most single asset, asset type, currency and jurisdiction you're willing to hold.",
      workspace: { href: "/intake", label: "Set your limits" },
      followUp: "What's the most you'd want in any single asset, as a share of the whole?",
      recommendation: "withheld",
      provenance: "missing",
      disconfirmation: ["Your stated limits would let me check this immediately."],
    });
  }

  const value = risk.value;
  if (value.breaches.length === 0) {
    const largest = value.largest;
    return answer({
      intent: "concentration",
      conclusion: "Nothing breaches the limits you set.",
      whyItMatters: largest
        ? `Your largest single exposure is ${largest.bucket} at ${sayPercent(largest.share)}, which sits inside what you said you'd accept.`
        : "Your holdings sit inside every limit you gave me.",
      action: null,
      uncertainty:
        value.limitsNotSet.length > 0
          ? `I couldn't check everything — you haven't set a limit for ${list(value.limitsNotSet.map(readableLimit))}.`
          : null,
      evidence: [evidenceFrom("Concentration", risk, "No breach against stated limits.")],
      workspace: { href: "/portfolio", label: "See the portfolio" },
      followUp: value.limitsNotSet.length > 0 ? `Do you want to set a ${readableLimit(value.limitsNotSet[0]!)} limit?` : null,
      recommendation: "within_limits",
      confidence: 75,
      provenance: risk.provenance,
      disconfirmation: ["A limit you haven't set could be breached without my seeing it."],
    });
  }

  const worst = value.breaches[0]!;
  return answer({
    intent: "concentration",
    conclusion: `Your largest concentration risk is ${worst.bucket}, at ${sayPercent(worst.share)} against the ${sayPercent(worst.limit)} you set.`,
    whyItMatters: `That's ${sayPercent(worst.overBy)} over your own limit. It matters because a single bad outcome there moves your whole position, and you've already said that's more than you want riding on one thing.`,
    action: "Don't add to it. New capital goes anywhere else until the share comes down.",
    uncertainty:
      value.breaches.length > 1
        ? `${value.breaches.length - 1} other ${plural(value.breaches.length - 1, "limit")} ${value.breaches.length - 1 === 1 ? "is" : "are"} also breached.`
        : null,
    evidence: value.breaches.map((breach) => ({
      label: `${readableDimension(breach.dimension)}: ${breach.bucket}`,
      detail: `${sayPercent(breach.share)} held against a ${sayPercent(breach.limit)} limit, over by ${sayPercent(breach.overBy)}.`,
      provenance: risk.provenance,
      sourceNote: risk.basis,
    })),
    workspace: { href: "/portfolio", label: "See the portfolio" },
    followUp: "Do you want to bring this down by selling, or by directing new capital elsewhere?",
    recommendation: "breach",
    confidence: 80,
    provenance: risk.provenance,
    risks: value.breaches.map((b) => `${b.bucket} at ${sayPercent(b.share)} against ${sayPercent(b.limit)}.`),
    disconfirmation: ["If the limit itself was set too tight, the breach is a labelling problem rather than a risk."],
    nextAction: "Stop adding to the breached bucket.",
  });
}

function largestRisk(context: AnswerContext): MorpheusAnswer {
  const { calculations } = context;
  if (!calculations) return noPosition("largest_risk");

  // Ordered by how much damage each does, not by how measurable it is. An
  // unfunded reserve outranks a concentration breach because it is the one that
  // forces a sale at the worst possible moment.
  const coverage = calculations.reserveCoverage;
  if (isKnown(coverage) && coverage.value && !coverage.value.funded) {
    return answer({
      intent: "largest_risk",
      conclusion: `Your largest unaddressed risk is the reserve — ${sayMonths(coverage.value.mobileMonths)} of reachable cover against the ${coverage.value.required} you wanted.`,
      whyItMatters:
        "Every other risk in your position is survivable if you're never forced to sell. This is the one that would force it.",
      action: "Close the reserve gap before anything else.",
      evidence: [evidenceFrom("Reserve coverage", coverage, `${coverage.value.mobileMonths.toFixed(1)} reachable months.`)],
      workspace: { href: "/cash", label: "See the cash workspace" },
      followUp: "Do you want to see how quickly that could be closed from current cash flow?",
      recommendation: "reserve_shortfall",
      confidence: 80,
      provenance: coverage.provenance,
      risks: ["Forced selling in a bad month."],
      disconfirmation: ["If income is more stable than declared, the required reserve may be smaller."],
      nextAction: "Fund the reserve.",
    });
  }

  const risk = calculations.concentrationRisk;
  if (isKnown(risk) && risk.value && risk.value.breaches.length > 0) return concentration(context);

  const capacity = calculations.riskCapacity;
  if (isKnown(capacity) && capacity.value?.disagreement) {
    return answer({
      intent: "largest_risk",
      conclusion: `Your largest risk is the gap between the risk you want to take and the risk your structure supports — you said ${capacity.value.stated}, the position supports ${capacity.value.calculated}.`,
      whyItMatters:
        "That gap is where forced selling comes from. Capacity is whether a fall can be survived; tolerance is whether it can be sat through. Believing you have more of the first than you do is the expensive mistake.",
      action: "Either reduce the ambition or change the structure that limits it. Don't just proceed on the stated number.",
      evidence: [evidenceFrom("Risk capacity", capacity, list(capacity.value.factors))],
      workspace: { href: "/capital", label: "See the capital picture" },
      followUp: "Which would you rather change — the plan, or the constraint underneath it?",
      recommendation: "capacity_disagreement",
      confidence: 70,
      provenance: capacity.provenance,
      risks: capacity.value.factors,
      disconfirmation: ["A change in income stability or obligations would move calculated capacity."],
      nextAction: "Reconcile stated risk with structural capacity.",
    });
  }

  return answer({
    intent: "largest_risk",
    conclusion: "Nothing in your declared position stands out as an unaddressed structural risk.",
    whyItMatters:
      "That is a statement about what you've told me, not a clean bill of health. The risks I can't see are the ones in the gaps.",
    action: null,
    uncertainty: "I'd trust this more with your concentration limits and drawdown tolerance recorded.",
    workspace: { href: "/capital", label: "See the capital picture" },
    followUp: "How large a fall could you sit through without selling?",
    recommendation: "none_identified",
    confidence: 55,
    provenance: "calculated",
    disconfirmation: ["An unrecorded obligation or limit would change this."],
  });
}

function unrecognised(question: string): MorpheusAnswer {
  return answer({
    intent: "unrecognised",
    conclusion: "I don't have a way to answer that one yet.",
    whyItMatters:
      "I'd rather say so than give you something that sounds like an answer. I only speak from figures I've actually computed about your position.",
    action: "Try asking about your reserve, what's deployable, your concentration, gold, what changed, or whether the plan is on track.",
    uncertainty: null,
    workspace: null,
    followUp: null,
    recommendation: "unrecognised",
    confidence: null,
    provenance: "missing",
    disconfirmation: [`Nothing was claimed in response to "${question.slice(0, 80)}".`],
    nextAction: null,
  });
}

/* ---------------- helpers ---------------- */

function readableDimension(dimension: string): string {
  const names: Record<string, string> = {
    asset_kind: "Asset type",
    single_asset: "Single asset",
    currency: "Currency",
    jurisdiction: "Jurisdiction",
  };
  return names[dimension] ?? dimension;
}

function readableLimit(field: string): string {
  const names: Record<string, string> = {
    "objective.maxAssetKindPercent": "asset type",
    "objective.maxSingleAssetPercent": "single asset",
    "objective.maxCurrencyPercent": "currency",
    "objective.maxJurisdictionPercent": "jurisdiction",
  };
  return names[field] ?? field.replace(/^objective\./, "");
}

/* ---------------- entry point ---------------- */

/**
 * Answer a question.
 *
 * `explain` and `evidence` reach back into the previous answer rather than
 * recomputing, which is what makes the thread feel like a conversation instead
 * of a series of unrelated lookups.
 */
export function respond(intent: MorpheusIntent, question: string, context: AnswerContext): MorpheusAnswer {
  switch (intent) {
    case "marginal_allocation":
      return marginalAllocation(context);
    case "deployable_cash":
      return deployableCash(context);
    case "reserve":
      return reserve(context);
    case "concentration":
      return concentration(context);
    case "largest_risk":
      return largestRisk(context);
    case "explain":
      return explain(context);
    case "evidence":
      return showEvidence(context);
    case "gold_posture":
      return goldPosture(context);
    case "what_changed":
      return whatChanged(context);
    case "plan_on_track":
      return planOnTrack(context);
    case "briefing":
      return marginalAllocation(context);
    case "unrecognised":
      return unrecognised(question);
  }
}

function explain(context: AnswerContext): MorpheusAnswer {
  const previous = context.lastAnswer;
  if (!previous) {
    return answer({
      intent: "explain",
      conclusion: "There's nothing yet for me to explain.",
      whyItMatters: "Ask me something first and I'll show you how I got there.",
      recommendation: "no_prior_answer",
      provenance: "missing",
    });
  }

  return answer({
    intent: "explain",
    conclusion: previous.decision.recommendation === "withheld"
      ? "I held back because the figures underneath weren't there, not because the answer was bad news."
      : `I said that because ${previous.whyItMatters.charAt(0).toLowerCase()}${previous.whyItMatters.slice(1)}`,
    whyItMatters:
      previous.evidence.length > 0
        ? `It rests on ${list(previous.evidence.map((e) => e.label.toLowerCase()))}.`
        : "It rests on the figures you gave me and arithmetic on them, nothing else.",
    action: null,
    uncertainty:
      previous.decision.disconfirmation[0] === "Not stated for this answer."
        ? null
        : `What would change my mind: ${previous.decision.disconfirmation[0]}`,
    evidence: previous.evidence,
    workspace: previous.workspace,
    followUp: null,
    recommendation: `explanation_of:${previous.decision.recommendation}`,
    confidence: previous.decision.confidence,
    provenance: previous.decision.provenance,
    risks: previous.decision.risks,
    disconfirmation: previous.decision.disconfirmation,
  });
}

function showEvidence(context: AnswerContext): MorpheusAnswer {
  const previous = context.lastAnswer;
  if (!previous || previous.evidence.length === 0) {
    return answer({
      intent: "evidence",
      conclusion: "There's no evidence attached to that one.",
      whyItMatters:
        previous === null
          ? "Ask me something first."
          : "That answer was a refusal rather than a conclusion, so there's nothing underneath it to show you.",
      recommendation: "no_evidence",
      provenance: "missing",
    });
  }

  return answer({
    intent: "evidence",
    conclusion: `Here's what that rests on — ${previous.evidence.length} ${plural(previous.evidence.length, "figure")}.`,
    whyItMatters: "Every one traces to something you declared or to arithmetic on it.",
    evidence: previous.evidence,
    workspace: previous.workspace,
    recommendation: `evidence_for:${previous.decision.recommendation}`,
    confidence: previous.decision.confidence,
    provenance: previous.decision.provenance,
    disconfirmation: previous.decision.disconfirmation,
  });
}

/**
 * Gold, cross-position and market questions.
 *
 * These three are honest about a real limit: they need current market evidence,
 * and this deployment has no market observation for gold or equities without a
 * configured provider. Rather than invent a view, Morpheus says what he can say
 * from the declared position and names what is missing.
 */
function goldPosture(context: AnswerContext): MorpheusAnswer {
  const { calculations } = context;
  if (!calculations) return noPosition("gold_posture");

  const allocation = calculations.portfolioAllocation;
  const goldRow = allocation.value?.find((row) => /gold|metal/i.test(row.bucket));

  return answer({
    intent: "gold_posture",
    conclusion: goldRow
      ? `Hold. Gold is ${sayPercent(goldRow.share)} of what you hold, and I don't have a current price good enough to justify changing that.`
      : "Hold — I can't see gold in your declared position, and I won't recommend adding an asset on general principle.",
    whyItMatters: goldRow
      ? "Gold earns its place as insurance rather than as a return engine, and insurance is sized against what it's protecting, not against its own price. At that weight it is doing the job."
      : "A recommendation to buy something you don't hold needs a reason specific to you, and I don't have one.",
    action: "Don't chase a move in either direction on the strength of a headline.",
    uncertainty:
      "I have no current spot price in this deployment. A posture change in gold needs a spot basis, a prior close on the same basis, and the macro context behind it — and I have none of those right now.",
    evidence: goldRow
      ? [evidenceFrom("Gold weight", allocation, `${sayPercent(goldRow.share)} of declared value.`)]
      : [],
    workspace: { href: "/gold", label: "See the gold workspace" },
    followUp: goldRow ? "Do you know roughly what share of your gold is physically reachable?" : null,
    recommendation: "hold",
    confidence: 45,
    provenance: allocation.provenance,
    risks: ["Position sizing based on a weight that may itself be an estimate."],
    disconfirmation: [
      "A verified spot price with a real margin of safety against it would change the recommendation.",
      "A material move in real rates would change the case for holding at all.",
    ],
    nextAction: "Hold.",
  });
}

function whatChanged(context: AnswerContext): MorpheusAnswer {
  return answer({
    intent: "what_changed",
    conclusion: "Nothing I can verify has changed since I last looked.",
    whyItMatters:
      context.calculations === null
        ? "I have no position to measure change against, so I couldn't tell you what mattered even if something had moved."
        : "I'd rather tell you nothing changed than manufacture a reason for you to act. Most days genuinely do not contain a decision.",
    action: null,
    uncertainty:
      "This deployment has no live market feed configured for equities or metals, so I can only see changes in what you've declared, not in what the market did.",
    workspace: { href: "/markets", label: "See the markets workspace" },
    followUp: null,
    recommendation: "no_material_change",
    confidence: null,
    provenance: context.calculations === null ? "missing" : "calculated",
    disconfirmation: ["A configured market provider would let me answer this properly."],
  });
}

function planOnTrack(context: AnswerContext): MorpheusAnswer {
  const { calculations } = context;
  if (!calculations) return noPosition("plan_on_track");

  const netWorth = calculations.netWorth;
  const flow = calculations.monthlyCashFlow;

  if (!isKnown(netWorth) || !isKnown(flow)) {
    return answer({
      intent: "plan_on_track",
      conclusion: "I can't tell you whether you're on track.",
      whyItMatters:
        "That question needs where you are and how fast you're moving. I'm missing one of them, and a projection built on a guess would be worse than no projection.",
      action: `I need ${list([...netWorth.missing, ...flow.missing].slice(0, 3))}.`,
      workspace: { href: "/intake", label: "Fill the gaps" },
      followUp: "What do your monthly household obligations come to?",
      recommendation: "withheld",
      provenance: "missing",
      disconfirmation: ["The missing figures would let me project this."],
    });
  }

  const net = flow.value!.net;
  const surplus = Object.values(net).some((v) => v > 0);

  return answer({
    intent: "plan_on_track",
    conclusion: surplus
      ? `You're accumulating — ${say(net)} a month against a position of ${say(netWorth.value)}.`
      : `You're not accumulating. Monthly flow is ${say(net)}, which means the position isn't growing from income.`,
    whyItMatters: surplus
      ? "Over a horizon measured in years, the monthly surplus matters more than any single allocation decision you'll make."
      : "Without a surplus, the plan depends entirely on what the existing assets do, which is the part neither of us controls.",
    action: surplus ? "Protect the surplus before optimising what it buys." : "Find the surplus before optimising the allocation.",
    uncertainty:
      "I'm not projecting a terminal value. A single-path projection over this horizon would imply a precision neither of us has.",
    evidence: [
      evidenceFrom("Net worth", netWorth, say(netWorth.value)),
      evidenceFrom("Monthly net flow", flow, say(net)),
    ],
    workspace: { href: "/timeline", label: "See the timeline" },
    followUp: surplus ? "Is that surplus stable, or does it depend on this year in particular?" : null,
    recommendation: surplus ? "accumulating" : "not_accumulating",
    confidence: 65,
    provenance: weakestOf([netWorth, flow]),
    risks: surplus ? [] : ["No accumulation from income."],
    disconfirmation: ["A change in income stability moves this more than any market assumption."],
    nextAction: surplus ? "Protect the surplus." : "Establish a surplus.",
  });
}
