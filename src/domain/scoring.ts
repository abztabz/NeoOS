/**
 * Domain rules from the NeoOS Investment Constitution and PRODUCT_SPEC.
 * Pure functions only — no I/O, no framework imports.
 */

import type { AssetRating } from "@/schemas/neoos-report";

export interface DeploymentBand {
  min: number;
  max: number;
  label: string;
  posture: string;
  guidance: string;
}

/** PRODUCT_SPEC deployment bands, 0–100. */
export const deploymentBands: DeploymentBand[] = [
  {
    min: 0,
    max: 20,
    label: "Preserve Cash",
    posture: "Foot Off",
    guidance: "Cash outcompetes the opportunity set. Wait.",
  },
  {
    min: 21,
    max: 40,
    label: "Deploy Gradually",
    posture: "Light Pressure",
    guidance: "Use selective tranches. Keep the majority of capital available for better prices.",
  },
  {
    min: 41,
    max: 60,
    label: "Selective Deployment",
    posture: "Measured Pressure",
    guidance: "Deploy into qualified opportunities while holding meaningful reserves.",
  },
  {
    min: 61,
    max: 80,
    label: "Increase Deployment",
    posture: "Firm Pressure",
    guidance: "Evidence supports pressing harder. Scale positions with discipline.",
  },
  {
    min: 81,
    max: 95,
    label: "Aggressive Deployment",
    posture: "Heavy Pressure",
    guidance: "Exceptional conditions. Deploy aggressively within reserve limits.",
  },
  {
    min: 96,
    max: 100,
    label: "Maximum Deployment",
    posture: "Full Throttle",
    guidance: "Historic opportunity with complete evidence. Maximum deployment permitted.",
  },
];

/**
 * Band lookup by upper bound. The declared bands are integer-labeled
 * (0–20, 21–40, …) but engine scores are continuous, so a value like 20.5
 * must land in the band whose ceiling it falls under — never in a gap.
 */
export function deploymentBand(score: number): DeploymentBand {
  const clamped = Math.min(100, Math.max(0, score));
  const band = deploymentBands.find((b) => clamped <= b.max);
  return band ?? deploymentBands[deploymentBands.length - 1]!;
}

export interface RatingBand {
  min: number;
  rating: string;
  action: string;
}

/** PRODUCT_SPEC rating bands. Strong Buy is rare and evidence-heavy by law. */
export const ratingBands: RatingBand[] = [
  { min: 95, rating: "Strong Buy", action: "Deploy aggressively subject to limits" },
  { min: 85, rating: "Buy", action: "Add meaningfully" },
  { min: 70, rating: "Accumulate", action: "Deploy gradually" },
  { min: 55, rating: "Hold", action: "Maintain or wait" },
  { min: 40, rating: "Reduce", action: "Pause buying; trim where appropriate" },
  { min: 0, rating: "Sell / Avoid", action: "Reallocate capital" },
];

export function ratingFromScore(score: number): RatingBand {
  const clamped = Math.min(100, Math.max(0, score));
  return ratingBands.find((b) => clamped >= b.min) ?? ratingBands[ratingBands.length - 1]!;
}

/**
 * Score → canonical AssetRating enum value. The bottom band is displayed as
 * "Sell / Avoid" but resolves to "Avoid" — the engine reserves "Sell" for an
 * explicit exit instruction on a held position, which score alone can't imply.
 */
export function ratingFromScoreEnum(score: number): AssetRating {
  const clamped = Math.min(100, Math.max(0, score));
  if (clamped >= 95) return "Strong Buy";
  if (clamped >= 85) return "Buy";
  if (clamped >= 70) return "Accumulate";
  if (clamped >= 55) return "Hold";
  if (clamped >= 40) return "Reduce";
  return "Avoid";
}

/** Cash score → decision, from the constitution's scoring engine. */
export function cashDecision(score: number): string {
  if (score >= 90) return "Hold Cash";
  if (score >= 70) return "Deploy Gradually";
  if (score >= 50) return "Increase Deployment";
  if (score >= 30) return "Deploy Aggressively";
  return "Maximum Deployment";
}

/** NeoOS Opportunity Index interpretation. */
export function opportunityLabel(score: number): string {
  if (score >= 90) return "Historic Opportunity";
  if (score >= 75) return "Strong Opportunity";
  if (score >= 60) return "Attractive";
  if (score >= 40) return "Neutral";
  if (score >= 20) return "Expensive";
  return "Bubble / Extreme Risk";
}

/** Confidence percentage → constitution confidence tier. */
export function confidenceTier(score: number): string {
  if (score >= 90) return "Very High";
  if (score >= 75) return "High";
  if (score >= 55) return "Medium";
  if (score >= 35) return "Low";
  return "Insufficient Evidence";
}
