import { z } from "zod";

/**
 * The Morpheus daily briefing.
 *
 * Every line is typed by its epistemic status, so a reader can always tell a
 * measured fact from an engine output from an inference. Nothing in a briefing
 * is free-form narrative: each statement is assembled from report data and
 * carries the references that support it.
 */

export const statementKinds = ["fact", "engine_output", "inference", "warning", "decision_needed"] as const;
export type StatementKind = (typeof statementKinds)[number];

export const statementKindLabels: Record<StatementKind, string> = {
  fact: "Fact",
  engine_output: "Engine",
  inference: "Inference",
  warning: "Warning",
  decision_needed: "Decision needed",
};

export const briefingStatementSchema = z.object({
  kind: z.enum(statementKinds),
  text: z.string(),
  /** Evidence ids, asset ids, or change types this statement rests on. */
  references: z.array(z.string()),
  assetId: z.string().nullable(),
});
export type BriefingStatement = z.infer<typeof briefingStatementSchema>;

export const briefingSectionIds = [
  "executive_posture",
  "what_changed",
  "why_it_changed",
  "requires_action",
  "requires_patience",
  "missing_or_uncertain",
  "capital_guidance",
  "asset_actions",
  "reserve_and_risk",
  "evidence_health",
  "watch_conditions",
  "questions_for_user",
] as const;
export type BriefingSectionId = (typeof briefingSectionIds)[number];

export const briefingSectionTitles: Record<BriefingSectionId, string> = {
  executive_posture: "Executive posture",
  what_changed: "What changed",
  why_it_changed: "Why it changed",
  requires_action: "What requires action",
  requires_patience: "What requires patience",
  missing_or_uncertain: "What is missing or uncertain",
  capital_guidance: "Capital deployment guidance",
  asset_actions: "Asset-level actions",
  reserve_and_risk: "Reserve and risk constraints",
  evidence_health: "Evidence health",
  watch_conditions: "Watch conditions",
  questions_for_user: "Questions requiring your input",
};

export const briefingSectionSchema = z.object({
  id: z.enum(briefingSectionIds),
  title: z.string(),
  statements: z.array(briefingStatementSchema),
});
export type BriefingSection = z.infer<typeof briefingSectionSchema>;

export const morpheusBriefingSchema = z.object({
  schemaVersion: z.literal("3.0"),
  runId: z.string(),
  generatedAt: z.iso.datetime({ offset: true }),
  /** Honest data-provenance label, e.g. "Fixture intelligence". */
  dataLabel: z.string(),
  /** One-line answer to "how hard do I press the accelerator today". */
  headline: z.string(),
  /** Short enough for the mobile view; the sections carry the detail. */
  summary: z.string(),
  sections: z.array(briefingSectionSchema),
});
export type MorpheusBriefing = z.infer<typeof morpheusBriefingSchema>;

/** Sections shown in the concise mobile view; the rest are behind disclosure. */
export const MOBILE_SECTIONS: BriefingSectionId[] = [
  "executive_posture",
  "what_changed",
  "requires_action",
  "questions_for_user",
];
