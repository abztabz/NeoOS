import { describe, expect, it } from "vitest";
import { DEPLOYMENT_CONSTRAINTS } from "@/engine/constants";
import { computeCapitalPosture, type DeploymentInputs } from "@/engine/deployment";
import { deploymentBand } from "@/domain/scoring";
import type { AssetRecommendation } from "@/engine/models";

const NOW = "2026-07-24T12:00:00Z";

function rec(
  assetId: string,
  totalScore: number | null,
  finalRating: AssetRecommendation["finalRating"],
  extra: Partial<AssetRecommendation> = {},
): AssetRecommendation {
  return {
    assetId,
    status: totalScore === null ? "insufficient_evidence" : "rated",
    totalScore,
    provisionalRating: finalRating,
    finalRating,
    confidence: 85,
    evidenceIntegrity: 90,
    valuationDate: NOW,
    engineVersion: "2.0.0",
    modelVersion: "2.0.0",
    eligibilityChecks: [],
    vetoes: [],
    factorScores: [],
    valuation: null,
    marginOfSafety: null,
    downsideCase: null,
    baseCase: null,
    upsideCase: null,
    portfolioFit: null,
    recommendationRationale: "",
    insufficientReasons: [],
    invalidationConditions: [],
    conflictIds: [],
    ...extra,
  };
}

/** Inputs that would otherwise produce a very high deployment score. */
function hotMarket(overrides: Partial<DeploymentInputs> = {}): DeploymentInputs {
  return {
    recommendations: [
      rec("a", 97, "Strong Buy"),
      rec("b", 96, "Strong Buy"),
      rec("c", 92, "Buy"),
      rec("d", 88, "Buy"),
    ],
    cashScore: 10,
    marketScore: 95,
    macroRiskScore: 5,
    reserveHealth: 95,
    concentrationRisk: 20,
    liquidityRisk: 15,
    reserveRequirement: "Keep 12 months of liabilities",
    generatedAt: NOW,
    ...overrides,
  };
}

describe("capital deployment", () => {
  it.each([
    [0, "Preserve Cash"],
    [20, "Preserve Cash"],
    [21, "Deploy Gradually"],
    [40, "Deploy Gradually"],
    [41, "Selective Deployment"],
    [60, "Selective Deployment"],
    [61, "Increase Deployment"],
    [80, "Increase Deployment"],
    [81, "Aggressive Deployment"],
    [95, "Aggressive Deployment"],
    [96, "Maximum Deployment"],
    [100, "Maximum Deployment"],
  ])("score %i maps to the %s band", (score, band) => {
    expect(deploymentBand(score).label).toBe(band);
  });

  it.each([
    [20.5, "Deploy Gradually"],
    [40.4, "Selective Deployment"],
    [60.7, "Increase Deployment"],
    [95.2, "Maximum Deployment"],
  ])(
    "fractional score %f lands in %s rather than falling through a band gap",
    (score, band) => {
      // Engine scores are continuous; integer-labelled bands must not leave gaps.
      expect(deploymentBand(score).label).toBe(band);
    },
  );

  it("a strong opportunity set with healthy reserves deploys hard", () => {
    const posture = computeCapitalPosture(hotMarket());
    expect(posture.deploymentScore).toBeGreaterThan(80);
    expect(posture.strongBuyCount).toBe(2);
    expect(posture.constraints).toHaveLength(0);
  });

  it("inadequate reserves cap deployment regardless of opportunity", () => {
    const posture = computeCapitalPosture(
      hotMarket({ reserveHealth: DEPLOYMENT_CONSTRAINTS.reserveHealthFloor - 1 }),
    );
    expect(posture.deploymentScore).toBe(DEPLOYMENT_CONSTRAINTS.reserveCap);
    expect(posture.constraints.map((c) => c.id)).toContain("reserves");
    expect(posture.rationale.join(" ")).toMatch(/reserves before ambition/i);
  });

  it("weak evidence integrity caps deployment", () => {
    const posture = computeCapitalPosture(
      hotMarket({
        recommendations: [rec("a", 97, "Strong Buy", { evidenceIntegrity: 40 })],
      }),
    );
    expect(posture.deploymentScore).toBeLessThanOrEqual(DEPLOYMENT_CONSTRAINTS.evidenceCap);
    expect(posture.constraints.map((c) => c.id)).toContain("evidence");
  });

  it("concentration risk caps deployment", () => {
    const posture = computeCapitalPosture(
      hotMarket({ concentrationRisk: DEPLOYMENT_CONSTRAINTS.concentrationCeiling + 1 }),
    );
    expect(posture.deploymentScore).toBeLessThanOrEqual(DEPLOYMENT_CONSTRAINTS.concentrationCap);
    expect(posture.constraints.map((c) => c.id)).toContain("concentration");
  });

  it("liquidity risk caps deployment", () => {
    const posture = computeCapitalPosture(
      hotMarket({ liquidityRisk: DEPLOYMENT_CONSTRAINTS.liquidityRiskCeiling + 1 }),
    );
    expect(posture.deploymentScore).toBeLessThanOrEqual(DEPLOYMENT_CONSTRAINTS.liquidityCap);
    expect(posture.constraints.map((c) => c.id)).toContain("liquidity");
  });

  it("the tightest cap wins when several apply", () => {
    const posture = computeCapitalPosture(
      hotMarket({
        reserveHealth: 10,
        concentrationRisk: 90,
      }),
    );
    expect(posture.deploymentScore).toBe(
      Math.min(DEPLOYMENT_CONSTRAINTS.reserveCap, DEPLOYMENT_CONSTRAINTS.concentrationCap),
    );
    expect(posture.constraints.length).toBeGreaterThanOrEqual(1);
  });

  it("Maximum Deployment is unreachable without pristine reserves and evidence", () => {
    const posture = computeCapitalPosture(
      hotMarket({
        cashScore: 0,
        marketScore: 100,
        macroRiskScore: 0,
        reserveHealth: DEPLOYMENT_CONSTRAINTS.maxDeployReserveHealth - 1,
      }),
    );
    expect(posture.deploymentScore).toBeLessThanOrEqual(95);
    expect(posture.deploymentBand).not.toBe("Maximum Deployment");
  });

  it("a high cash score pushes deployment down", () => {
    const hot = computeCapitalPosture(hotMarket());
    const cashRich = computeCapitalPosture(hotMarket({ cashScore: 95 }));
    expect(cashRich.deploymentScore).toBeLessThan(hot.deploymentScore);
  });

  it("macro risk drags the score", () => {
    const calm = computeCapitalPosture(hotMarket({ macroRiskScore: 0 }));
    const stressed = computeCapitalPosture(hotMarket({ macroRiskScore: 100 }));
    expect(stressed.deploymentScore).toBeLessThan(calm.deploymentScore);
  });

  it("unrated assets never count toward the opportunity set", () => {
    const withUnrated = computeCapitalPosture(
      hotMarket({
        recommendations: [rec("a", 97, "Strong Buy"), rec("x", null, null)],
      }),
    );
    expect(withUnrated.strongBuyCount).toBe(1);
    expect(withUnrated.opportunityIndex).toBeGreaterThan(0);
  });

  it("initial tranche discipline scales with the band and is never everything", () => {
    const posture = computeCapitalPosture(hotMarket());
    expect(posture.maximumInitialTranche).toBeGreaterThan(0);
    expect(posture.maximumInitialTranche).toBeLessThanOrEqual(0.6);
  });

  it("always explains what would move the score in both directions", () => {
    const posture = computeCapitalPosture(hotMarket());
    expect(posture.wouldIncrease.length).toBeGreaterThan(0);
    expect(posture.wouldDecrease.length).toBeGreaterThan(0);
  });
});
