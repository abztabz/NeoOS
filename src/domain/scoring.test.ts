import { describe, expect, it } from "vitest";
import {
  cashDecision,
  confidenceTier,
  deploymentBand,
  deploymentBands,
  opportunityLabel,
  ratingFromScore,
} from "@/domain/scoring";

describe("deploymentBand", () => {
  it("maps PRODUCT_SPEC band boundaries", () => {
    expect(deploymentBand(0).label).toBe("Preserve Cash");
    expect(deploymentBand(20).label).toBe("Preserve Cash");
    expect(deploymentBand(21).label).toBe("Deploy Gradually");
    expect(deploymentBand(35).label).toBe("Deploy Gradually");
    expect(deploymentBand(40).label).toBe("Deploy Gradually");
    expect(deploymentBand(41).label).toBe("Selective Deployment");
    expect(deploymentBand(60).label).toBe("Selective Deployment");
    expect(deploymentBand(61).label).toBe("Increase Deployment");
    expect(deploymentBand(80).label).toBe("Increase Deployment");
    expect(deploymentBand(81).label).toBe("Aggressive Deployment");
    expect(deploymentBand(95).label).toBe("Aggressive Deployment");
    expect(deploymentBand(96).label).toBe("Maximum Deployment");
    expect(deploymentBand(100).label).toBe("Maximum Deployment");
  });

  it("clamps out-of-range scores instead of throwing", () => {
    expect(deploymentBand(-5).label).toBe("Preserve Cash");
    expect(deploymentBand(140).label).toBe("Maximum Deployment");
  });

  it("covers 0–100 with contiguous bands", () => {
    for (let score = 0; score <= 100; score++) {
      expect(deploymentBands.some((b) => score >= b.min && score <= b.max)).toBe(true);
    }
  });
});

describe("ratingFromScore", () => {
  it("maps PRODUCT_SPEC rating boundaries", () => {
    expect(ratingFromScore(100).rating).toBe("Strong Buy");
    expect(ratingFromScore(95).rating).toBe("Strong Buy");
    expect(ratingFromScore(94).rating).toBe("Buy");
    expect(ratingFromScore(85).rating).toBe("Buy");
    expect(ratingFromScore(84).rating).toBe("Accumulate");
    expect(ratingFromScore(70).rating).toBe("Accumulate");
    expect(ratingFromScore(69).rating).toBe("Hold");
    expect(ratingFromScore(55).rating).toBe("Hold");
    expect(ratingFromScore(54).rating).toBe("Reduce");
    expect(ratingFromScore(40).rating).toBe("Reduce");
    expect(ratingFromScore(39).rating).toBe("Sell / Avoid");
    expect(ratingFromScore(0).rating).toBe("Sell / Avoid");
  });
});

describe("cashDecision", () => {
  it("maps constitution cash-score bands", () => {
    expect(cashDecision(94)).toBe("Hold Cash");
    expect(cashDecision(90)).toBe("Hold Cash");
    expect(cashDecision(76)).toBe("Deploy Gradually");
    expect(cashDecision(70)).toBe("Deploy Gradually");
    expect(cashDecision(69)).toBe("Increase Deployment");
    expect(cashDecision(50)).toBe("Increase Deployment");
    expect(cashDecision(49)).toBe("Deploy Aggressively");
    expect(cashDecision(30)).toBe("Deploy Aggressively");
    expect(cashDecision(29)).toBe("Maximum Deployment");
  });
});

describe("opportunityLabel", () => {
  it("maps NeoOS Opportunity Index bands", () => {
    expect(opportunityLabel(95)).toBe("Historic Opportunity");
    expect(opportunityLabel(80)).toBe("Strong Opportunity");
    expect(opportunityLabel(60)).toBe("Attractive");
    expect(opportunityLabel(58)).toBe("Neutral");
    expect(opportunityLabel(25)).toBe("Expensive");
    expect(opportunityLabel(10)).toBe("Bubble / Extreme Risk");
  });
});

describe("confidenceTier", () => {
  it("maps constitution confidence tiers", () => {
    expect(confidenceTier(92)).toBe("Very High");
    expect(confidenceTier(78)).toBe("High");
    expect(confidenceTier(60)).toBe("Medium");
    expect(confidenceTier(40)).toBe("Low");
    expect(confidenceTier(20)).toBe("Insufficient Evidence");
  });
});
