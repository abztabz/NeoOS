import { demoReport } from "@/data/demo-report";

/**
 * Expected values for E2E assertions, derived from the engine-generated demo
 * report rather than hardcoded. Tuning the scoring model updates these
 * automatically; a spec failure then means the UI diverged from the engine,
 * which is the thing worth catching.
 */
export const DEMO = {
  deploymentPct: `${Math.round(demoReport.deployment.score)}%`,
  deploymentValue: String(Math.round(demoReport.deployment.score)),
  /** Full-precision score, as the gauge bar renders it. */
  deploymentScore: demoReport.deployment.score,
  recommendation: demoReport.deployment.recommendation,
  posture: demoReport.deployment.posture,
  cashScore: String(demoReport.scores.cash),
  firstRadarTitle: demoReport.radar[0]!.title,
  assetCount: demoReport.assets.length,
} as const;

/** Fixture reports used by the import specs, kept in sync with their files. */
export const FIXTURE_V10_PCT = "72%";
export const FIXTURE_V11_PCT = "55%";
