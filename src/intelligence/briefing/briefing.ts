import type { EngineReport } from "@/engine/models";
import type { ReportDiff } from "@/intelligence/types/diff";
import type {
  BriefingSection,
  BriefingSectionId,
  BriefingStatement,
  MorpheusBriefing,
} from "@/intelligence/types/briefing";
import { briefingSectionTitles } from "@/intelligence/types/briefing";
import type { ValidationIssue } from "@/intelligence/types/validation";
import type { ProviderDescriptor } from "@/intelligence/types/provider";

/**
 * The Morpheus daily briefing.
 *
 * Every statement is assembled from report data and typed by epistemic status.
 * Nothing here is free-form narration: if a sentence is not derivable from the
 * report, the diff, or the run's own issues, it is not written.
 */

function fact(text: string, references: string[] = [], assetId: string | null = null): BriefingStatement {
  return { kind: "fact", text, references, assetId };
}
function engineOutput(text: string, references: string[] = [], assetId: string | null = null): BriefingStatement {
  return { kind: "engine_output", text, references, assetId };
}
function inference(text: string, references: string[] = [], assetId: string | null = null): BriefingStatement {
  return { kind: "inference", text, references, assetId };
}
function warning(text: string, references: string[] = [], assetId: string | null = null): BriefingStatement {
  return { kind: "warning", text, references, assetId };
}
function decisionNeeded(text: string, references: string[] = [], assetId: string | null = null): BriefingStatement {
  return { kind: "decision_needed", text, references, assetId };
}

export interface BriefingArgs {
  runId: string;
  report: EngineReport;
  diff: ReportDiff;
  issues: ValidationIssue[];
  providers: ProviderDescriptor[];
  /** Honest provenance label, e.g. "Fixture intelligence". */
  dataLabel: string;
  excludedAssets: { assetId: string; reason: string }[];
}

export function generateBriefing(args: BriefingArgs): MorpheusBriefing {
  const { report, diff } = args;
  const posture = report.posture;
  const sections: BriefingSection[] = [];

  const section = (id: BriefingSectionId, statements: BriefingStatement[]): void => {
    sections.push({ id, title: briefingSectionTitles[id], statements });
  };

  /* 1. Executive posture */
  section("executive_posture", [
    engineOutput(
      `${posture.deploymentBand} at ${posture.deploymentScore.toFixed(1)} of 100 — accelerator posture ${posture.acceleratorPosture}.`,
      ["posture"],
    ),
    engineOutput(
      `Cash score ${posture.cashScore.toFixed(0)}, market score ${posture.marketScore.toFixed(0)}, opportunity index ${posture.opportunityIndex.toFixed(0)}.`,
      ["posture"],
    ),
    engineOutput(
      posture.strongBuyCount === 0
        ? "No asset passed the full Strong Buy eligibility gate."
        : `${posture.strongBuyCount} asset(s) passed the full Strong Buy eligibility gate.`,
      ["posture"],
    ),
    fact(`Data provenance: ${args.dataLabel}.`, args.providers.map((p) => p.providerId)),
  ]);

  /* 2. What changed */
  const changeStatements: BriefingStatement[] = diff.isFirstReport
    ? [fact("This is the first report; there is nothing to compare against yet.")]
    : diff.changes.length === 0
      ? [engineOutput("Nothing material changed since the previous report.")]
      : diff.changes
          .filter((c) => c.severity === "critical" || c.severity === "material")
          .slice(0, 8)
          .map((c) => engineOutput(c.explanation, c.supportingEvidenceIds, c.assetId));
  if (!diff.isFirstReport && changeStatements.length === 0) {
    changeStatements.push(
      engineOutput(
        `${diff.summary.total} change(s) recorded, none material — see the full diff for detail.`,
      ),
    );
  }
  section("what_changed", changeStatements);

  /* 3. Why it changed — only where the cause is provable */
  const causal = diff.changes.filter((c) => c.cause !== "unknown" && c.severity !== "informational");
  const unknownCause = diff.changes.filter(
    (c) => c.cause === "unknown" && (c.severity === "critical" || c.severity === "material"),
  );
  section("why_it_changed", [
    ...causal.slice(0, 6).map((c) => inference(`${c.label}: ${c.causeDetail}`, c.supportingEvidenceIds, c.assetId)),
    ...unknownCause
      .slice(0, 3)
      .map((c) =>
        warning(
          `${c.label} moved, but no evidence or valuation change in the trace accounts for it. Cause recorded as unknown.`,
          [],
          c.assetId,
        ),
      ),
    ...(causal.length === 0 && unknownCause.length === 0
      ? [fact("No causal attribution required: nothing material moved.")]
      : []),
  ]);

  /* 4. What requires action */
  const actionable = report.recommendations.filter(
    (r) => r.status === "rated" && (r.finalRating === "Strong Buy" || r.finalRating === "Buy"),
  );
  const reduceOrExit = report.recommendations.filter(
    (r) => r.status === "rated" && (r.finalRating === "Reduce" || r.finalRating === "Sell" || r.finalRating === "Avoid"),
  );
  section("requires_action", [
    ...actionable.map((r) =>
      engineOutput(
        `${r.assetId}: ${r.finalRating} at ${(r.totalScore ?? 0).toFixed(1)}. ${r.recommendationRationale}`,
        r.factorScores.flatMap((f) => f.evidenceIds).slice(0, 4),
        r.assetId,
      ),
    ),
    ...reduceOrExit.map((r) =>
      engineOutput(`${r.assetId}: ${r.finalRating} at ${(r.totalScore ?? 0).toFixed(1)}.`, [], r.assetId),
    ),
    ...(actionable.length === 0 && reduceOrExit.length === 0
      ? [engineOutput("No asset carries an action rating today.")]
      : []),
    ...(posture.constraints.length > 0
      ? [
          warning(
            `Deployment is capped by ${posture.constraints.length} constraint(s); acting beyond the cap would breach the mandate.`,
            posture.constraints.map((c) => c.id),
          ),
        ]
      : []),
  ]);

  /* 5. What requires patience */
  const holds = report.recommendations.filter((r) => r.status === "rated" && r.finalRating === "Hold");
  const nearBuy = report.recommendations.filter(
    (r) =>
      r.status === "rated" &&
      r.marginOfSafety !== null &&
      r.marginOfSafety > -0.15 &&
      r.marginOfSafety < 0.25,
  );
  section("requires_patience", [
    ...holds.slice(0, 6).map((r) =>
      engineOutput(`${r.assetId}: Hold at ${(r.totalScore ?? 0).toFixed(1)} — no action justified today.`, [], r.assetId),
    ),
    ...nearBuy.slice(0, 3).map((r) =>
      inference(
        `${r.assetId} is within reach of a Buy-grade valuation but the margin of safety is still ${((r.marginOfSafety as number) * 100).toFixed(1)}%.`,
        r.valuation?.evidenceIds ?? [],
        r.assetId,
      ),
    ),
  ]);

  /* 6. What is missing or uncertain */
  const insufficient = report.recommendations.filter((r) => r.status === "insufficient_evidence");
  const blockingIssues = args.issues.filter((i) => i.severity === "blocking");
  section("missing_or_uncertain", [
    ...insufficient.map((r) =>
      warning(`${r.assetId} cannot be rated: ${r.insufficientReasons.join(" ")}`, [], r.assetId),
    ),
    ...args.excludedAssets.map((e) => warning(`${e.assetId} was excluded from this run: ${e.reason}`, [], e.assetId)),
    ...blockingIssues
      .slice(0, 5)
      .map((i) => warning(`${i.code}: ${i.message}`, i.subjectId ? [i.subjectId] : [], i.assetId)),
    ...(insufficient.length === 0 && blockingIssues.length === 0 && args.excludedAssets.length === 0
      ? [fact("Every asset in the universe carried enough evidence to be rated.")]
      : []),
  ]);

  /* 7. Capital deployment guidance */
  section("capital_guidance", [
    engineOutput(
      `Maximum initial tranche: ${Math.round(posture.maximumInitialTranche * 100)}% of deployable capital.`,
      ["posture"],
    ),
    engineOutput(`Reserve requirement: ${posture.reserveRequirement}`, ["posture"]),
    ...posture.rationale.map((r) => engineOutput(r, ["posture"])),
  ]);

  /* 8. Asset-level actions */
  section(
    "asset_actions",
    report.recommendations.map((r) =>
      r.status === "insufficient_evidence"
        ? warning(`${r.assetId}: Insufficient Evidence — no action recommended.`, [], r.assetId)
        : engineOutput(
            `${r.assetId}: ${r.finalRating} (score ${(r.totalScore ?? 0).toFixed(1)}, confidence ${r.confidence.toFixed(0)}).`,
            [],
            r.assetId,
          ),
    ),
  );

  /* 9. Reserve and risk constraints */
  section("reserve_and_risk", [
    engineOutput(
      `Concentration risk ${posture.concentrationRisk.toFixed(0)}, liquidity risk ${posture.liquidityRisk.toFixed(0)}, evidence integrity ${posture.evidenceIntegrity.toFixed(0)}.`,
      ["posture"],
    ),
    ...posture.constraints.map((c) => warning(c.description, [c.id])),
    ...(posture.constraints.length === 0
      ? [fact("No hard constraint is currently capping deployment.")]
      : []),
  ]);

  /* 10. Evidence health */
  const summary = report.evidenceSummary;
  section("evidence_health", [
    fact(
      `${summary.total} evidence record(s): ${summary.byFreshness.fresh ?? 0} fresh, ${summary.byFreshness.aging ?? 0} aging, ${summary.byFreshness.stale ?? 0} stale, ${summary.byFreshness.expired ?? 0} expired.`,
    ),
    fact(`${(summary.verifiedShare * 100).toFixed(0)}% of records are marked verified.`),
    ...report.conflicts.map((c) =>
      c.resolution === "unresolved"
        ? warning(`Unresolved conflict: ${c.note}`, c.evidenceIds)
        : fact(`Resolved conflict: ${c.note}`, c.evidenceIds),
    ),
    ...args.providers.map((p) =>
      p.health === "ok"
        ? fact(`Provider ${p.providerName}: ${p.mode}.`, [p.providerId])
        : warning(`Provider ${p.providerName} is ${p.health}: ${p.failureReason ?? "no detail"}`, [p.providerId]),
    ),
  ]);

  /* 11. Watch conditions */
  section("watch_conditions", [
    ...posture.wouldIncrease.map((w) => inference(`Would increase deployment: ${w}`, ["posture"])),
    ...posture.wouldDecrease.map((w) => inference(`Would reduce deployment: ${w}`, ["posture"])),
    ...report.recommendations
      .filter((r) => r.invalidationConditions.length > 0)
      .slice(0, 4)
      .map((r) => inference(`${r.assetId} thesis breaks if: ${r.invalidationConditions.join("; ")}`, [], r.assetId)),
  ]);

  /* 12. Questions requiring user input */
  const questions: BriefingStatement[] = [
    decisionNeeded(
      `Record your capital-posture decision for today (engine recommends: ${posture.recommendation}).`,
      ["posture"],
    ),
    ...actionable.map((r) =>
      decisionNeeded(`Decide whether to act on ${r.assetId} (${r.finalRating}).`, [], r.assetId),
    ),
    ...insufficient.map((r) =>
      decisionNeeded(
        `${r.assetId} needs evidence before it can be rated. Supply it, or confirm it stays unrated.`,
        [],
        r.assetId,
      ),
    ),
  ];
  section("questions_for_user", questions);

  const headline = `${posture.deploymentBand} — ${posture.deploymentScore.toFixed(0)}% deployment, ${posture.acceleratorPosture.toLowerCase()}.`;
  const materialCount = diff.summary.critical + diff.summary.material;
  const summaryLine = diff.isFirstReport
    ? `First report. ${report.recommendations.length} asset(s) assessed, ${insufficient.length} without sufficient evidence.`
    : materialCount === 0
      ? `Nothing material changed. ${insufficient.length} asset(s) remain without sufficient evidence.`
      : `${materialCount} material change(s) since the previous report. ${insufficient.length} asset(s) remain without sufficient evidence.`;

  return {
    schemaVersion: "3.0",
    runId: args.runId,
    generatedAt: report.metadata.generatedAt,
    dataLabel: args.dataLabel,
    headline,
    summary: summaryLine,
    sections,
  };
}

/** Markdown export. Statement kinds are preserved as visible labels. */
export function briefingToMarkdown(briefing: MorpheusBriefing): string {
  const lines: string[] = [
    `# Morpheus daily briefing`,
    ``,
    `**${briefing.headline}**`,
    ``,
    briefing.summary,
    ``,
    `- Data provenance: ${briefing.dataLabel}`,
    `- Generated: ${briefing.generatedAt}`,
    `- Run: ${briefing.runId}`,
    ``,
  ];
  for (const section of briefing.sections) {
    if (section.statements.length === 0) continue;
    lines.push(`## ${section.title}`, ``);
    for (const statement of section.statements) {
      const label = statement.kind === "fact" ? "" : `_${statement.kind.replace("_", " ")}_ — `;
      lines.push(`- ${label}${statement.text}`);
    }
    lines.push(``);
  }
  return lines.join("\n");
}
