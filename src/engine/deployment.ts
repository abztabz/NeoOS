import {
  DEPLOYMENT_CONSTRAINTS,
  DEPLOYMENT_WEIGHTS,
  ENGINE_VERSION,
  STRONG_BUY_DEPLOYMENT_BONUS,
} from "@/engine/constants";
import { deploymentBand } from "@/domain/scoring";
import type { AssetRecommendation, CapitalPosture } from "@/engine/models";

/**
 * Capital deployment engine. Builds the global posture from the opportunity
 * distribution, cash attractiveness, market regime, and risk inputs — then
 * applies HARD constraint caps. High opportunity can never override
 * inadequate reserves, weak evidence, concentration, or liquidity risk;
 * every applied cap is recorded on the posture.
 */

export interface DeploymentInputs {
  recommendations: AssetRecommendation[];
  cashScore: number;
  marketScore: number;
  macroRiskScore: number; // 0 calm … 100 severe
  reserveHealth: number;
  concentrationRisk: number;
  liquidityRisk: number;
  reserveRequirement: string;
  generatedAt: string;
}

export function computeCapitalPosture(inputs: DeploymentInputs): CapitalPosture {
  const rated = inputs.recommendations.filter(
    (r): r is AssetRecommendation & { totalScore: number } =>
      r.status === "rated" && r.totalScore !== null,
  );

  // Opportunity index: valuation breadth — share of the rated universe at
  // Accumulate-or-better, blended with the mean score of that group.
  const attractive = rated.filter((r) => r.totalScore >= 70);
  const breadth = rated.length === 0 ? 0 : attractive.length / rated.length;
  const meanAttractive =
    attractive.length === 0
      ? 0
      : attractive.reduce((sum, r) => sum + r.totalScore, 0) / attractive.length;
  const opportunityIndex = breadth * 60 + (meanAttractive / 100) * 40;

  const strongBuys = rated.filter((r) => r.finalRating === "Strong Buy");

  // Raw score before constraints: opportunity, inverse cash attractiveness,
  // market regime — minus macro risk drag, plus a bounded Strong Buy bonus.
  const macroDrag = (inputs.macroRiskScore / 100) * 15;
  const strongBuyBonus = Math.min(
    STRONG_BUY_DEPLOYMENT_BONUS.cap,
    strongBuys.length * STRONG_BUY_DEPLOYMENT_BONUS.perStrongBuy,
  );
  const raw =
    DEPLOYMENT_WEIGHTS.opportunity * opportunityIndex +
    DEPLOYMENT_WEIGHTS.cashInverse * (100 - inputs.cashScore) +
    DEPLOYMENT_WEIGHTS.market * inputs.marketScore -
    macroDrag +
    strongBuyBonus;

  // Aggregate posture confidence/integrity from the rated universe.
  const confidence =
    rated.length === 0 ? 0 : rated.reduce((s, r) => s + r.confidence, 0) / rated.length;
  const integrity =
    inputs.recommendations.length === 0
      ? 0
      : inputs.recommendations.reduce((s, r) => s + r.evidenceIntegrity, 0) /
        inputs.recommendations.length;

  // Hard constraint caps — order-independent (all caps evaluated, min wins).
  const constraints: CapitalPosture["constraints"] = [];
  const c = DEPLOYMENT_CONSTRAINTS;
  let score = Math.max(0, Math.min(100, raw));
  const caps: { id: string; applies: boolean; cap: number; description: string }[] = [
    {
      id: "reserves",
      applies: inputs.reserveHealth < c.reserveHealthFloor,
      cap: c.reserveCap,
      description: `Reserve health ${inputs.reserveHealth.toFixed(0)} < ${c.reserveHealthFloor}: deployment capped at ${c.reserveCap} — reserves before ambition.`,
    },
    {
      id: "evidence",
      applies: integrity < c.evidenceIntegrityFloor,
      cap: c.evidenceCap,
      description: `Evidence integrity ${integrity.toFixed(0)} < ${c.evidenceIntegrityFloor}: deployment capped at ${c.evidenceCap} — no aggressive deployment on weak evidence.`,
    },
    {
      id: "concentration",
      applies: inputs.concentrationRisk > c.concentrationCeiling,
      cap: c.concentrationCap,
      description: `Concentration risk ${inputs.concentrationRisk.toFixed(0)} > ${c.concentrationCeiling}: deployment capped at ${c.concentrationCap}.`,
    },
    {
      id: "liquidity",
      applies: inputs.liquidityRisk > c.liquidityRiskCeiling,
      cap: c.liquidityCap,
      description: `Liquidity risk ${inputs.liquidityRisk.toFixed(0)} > ${c.liquidityRiskCeiling}: deployment capped at ${c.liquidityCap}.`,
    },
    {
      id: "maximum-deployment",
      applies:
        score > 95 &&
        (inputs.reserveHealth < c.maxDeployReserveHealth ||
          integrity < c.maxDeployEvidenceIntegrity),
      cap: 95,
      description: `Maximum Deployment requires reserve health ≥ ${c.maxDeployReserveHealth} and evidence integrity ≥ ${c.maxDeployEvidenceIntegrity}: capped at 95.`,
    },
  ];
  for (const cap of caps) {
    if (cap.applies && score > cap.cap) {
      score = cap.cap;
      constraints.push({ id: cap.id, description: cap.description, capApplied: cap.cap });
    }
  }

  const band = deploymentBand(score);
  // Initial tranche discipline scales with the band: never all-in at once.
  const maximumInitialTranche = score <= 20 ? 0 : score <= 40 ? 0.25 : score <= 60 ? 0.35 : score <= 80 ? 0.5 : 0.6;

  const rationale = [
    `Opportunity index ${opportunityIndex.toFixed(0)} — ${attractive.length} of ${rated.length} rated assets at Accumulate or better.`,
    `Cash score ${inputs.cashScore.toFixed(0)} — ${inputs.cashScore >= 70 ? "cash still competes with most risk assets" : "cash is losing its edge over the opportunity set"}.`,
    `Market score ${inputs.marketScore.toFixed(0)} with macro risk ${inputs.macroRiskScore.toFixed(0)} (−${macroDrag.toFixed(1)} drag).`,
    strongBuys.length === 0
      ? "Zero Strong Buys — no asset clears the full evidence bar today."
      : `${strongBuys.length} Strong Buy(s) passed the full eligibility gate (+${strongBuyBonus} bonus).`,
    `Evidence integrity ${integrity.toFixed(0)}, posture confidence ${confidence.toFixed(0)}.`,
  ];
  for (const applied of constraints) rationale.push(`CONSTRAINT: ${applied.description}`);

  return {
    deploymentScore: score,
    deploymentBand: band.label,
    recommendation: band.label,
    acceleratorPosture: band.posture,
    maximumInitialTranche,
    reserveRequirement: inputs.reserveRequirement,
    confidence,
    evidenceIntegrity: integrity,
    marketScore: inputs.marketScore,
    cashScore: inputs.cashScore,
    opportunityIndex,
    strongBuyCount: strongBuys.length,
    concentrationRisk: inputs.concentrationRisk,
    liquidityRisk: inputs.liquidityRisk,
    rationale,
    constraints,
    wouldIncrease: [
      "Cheaper prices: wider margins of safety would lift the opportunity index.",
      "A qualified Strong Buy passing the full gate (+4 per, max +8).",
      "Falling cash score — cash losing its yield edge argues for deploying.",
      constraints.length > 0 ? "Clearing the active constraint(s) listed above." : "Improving market breadth.",
    ],
    wouldDecrease: [
      "Deteriorating evidence integrity (cap at 40 below integrity 60).",
      "Reserve health falling below 40 (hard cap at 40).",
      "Rising macro risk (up to −15 points of drag).",
      "Concentration or liquidity risk breaching ceilings (caps at 60).",
    ],
    generatedAt: inputs.generatedAt,
    engineVersion: ENGINE_VERSION,
  };
}
