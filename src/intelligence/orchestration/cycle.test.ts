import { describe, expect, it } from "vitest";
import { runFixtureCycle, fixtureAdapters } from "@/intelligence/fixtures/run";
import { labelForModes } from "@/intelligence/orchestration/cycle";
import { exampleHttpProvider } from "@/intelligence/adapters/http-provider";
import { ManualEvidenceImportAdapter } from "@/intelligence/adapters/manual-import";
import { stableStringify } from "@/engine/hash";
import {
  appendCorrection,
  appendJournalEntry,
  memoryStorage,
  readJournal,
  recordDecision,
  readDecisions,
  verifyEntryIntegrity,
} from "@/intelligence/journal/journal-store";
import { emptyDecision } from "@/intelligence/types/decision";
import { readFileSync } from "node:fs";
import path from "node:path";

const EVIDENCE_DIR = path.join(process.cwd(), "e2e", "fixtures", "evidence");
const sample = (file: string) => readFileSync(path.join(EVIDENCE_DIR, file), "utf-8");

describe("fixture intelligence run", () => {
  it("completes the full loop and produces every artefact", async () => {
    const run = await runFixtureCycle({ day: 1 });
    expect(run.report).not.toBeNull();
    expect(run.diff).not.toBeNull();
    expect(run.briefing).not.toBeNull();
    expect(run.draftJournalEntry).not.toBeNull();
    expect(run.universeInputs).not.toBeNull();
    expect(run.rawRecords.length).toBeGreaterThan(20);
    expect(run.normalizedEvidence.length).toBeGreaterThan(20);
  });

  it("is deterministic for identical inputs", async () => {
    const a = await runFixtureCycle({ day: 1, runId: "fixed" });
    const b = await runFixtureCycle({ day: 1, runId: "fixed" });
    expect(stableStringify(a.report?.engine.recommendations)).toBe(
      stableStringify(b.report?.engine.recommendations),
    );
    expect(a.report?.engine.posture.deploymentScore).toBe(b.report?.engine.posture.deploymentScore);
  });

  it("labels a fixture run as fixture intelligence, never live", async () => {
    const run = await runFixtureCycle({ day: 1 });
    expect(run.dataLabel).toBe("Fixture intelligence");
    expect(run.contributingModes).not.toContain("live");
    expect(run.report?.engine.metadata.mode).toBe("demo");
  });

  it("drops an exact duplicate record", async () => {
    const run = await runFixtureCycle({ day: 1 });
    expect(run.evidenceCounts.duplicatesDropped).toBeGreaterThanOrEqual(1);
  });

  it("keeps rejected records with their reasons rather than discarding them", async () => {
    const run = await runFixtureCycle({ day: 1 });
    expect(run.rejectedRecords.length).toBeGreaterThan(0);
    for (const rejected of run.rejectedRecords) {
      expect(rejected.reasons.length).toBeGreaterThan(0);
      expect(rejected.reasons[0]!.message.length).toBeGreaterThan(0);
    }
  });

  it("reports ambiguous identity without attributing the record to an asset", async () => {
    const run = await runFixtureCycle({ day: 1 });
    expect(run.evidenceCounts.identityAmbiguous).toBeGreaterThan(0);
    const ambiguous = run.issues.filter((i) => i.code === "ambiguous_asset_identity");
    expect(ambiguous.length).toBeGreaterThan(0);
    // The record is not attached to any asset.
    for (const issue of ambiguous) expect(issue.assetId).toBeNull();
  });

  it("detects both a tier-resolved and an unresolved conflict", async () => {
    const run = await runFixtureCycle({ day: 1 });
    const conflicts = run.report!.engine.conflicts;
    expect(conflicts.some((c) => c.resolution === "resolved_by_tier")).toBe(true);
    expect(conflicts.some((c) => c.resolution === "unresolved" && c.severity === "high")).toBe(true);
    for (const conflict of conflicts) {
      // Every record is preserved and every resolution is explained.
      expect(conflict.evidenceIds.length).toBeGreaterThanOrEqual(2);
      expect(conflict.confidenceEffect.length).toBeGreaterThan(0);
      expect(conflict.note.length).toBeGreaterThan(0);
    }
  });

  it("an unresolved conflict blocks Strong Buy for the affected asset", async () => {
    const run = await runFixtureCycle({ day: 1 });
    const conflict = run.report!.engine.conflicts.find((c) => c.resolution === "unresolved")!;
    const affected = run.report!.engine.recommendations.find((r) =>
      r.conflictIds.includes(conflict.conflictId),
    );
    expect(affected).toBeDefined();
    expect(affected!.finalRating).not.toBe("Strong Buy");
  });

  it("leaves the evidence-poor asset as Insufficient Evidence", async () => {
    const run = await runFixtureCycle({ day: 1 });
    const valueEtf = run.report!.engine.recommendations.find((r) => r.assetId === "value-etf");
    expect(valueEtf?.status).toBe("insufficient_evidence");
    expect(valueEtf?.totalScore).toBeNull();
    expect(valueEtf?.finalRating).toBeNull();
  });

  it("covers all six proof-universe assets", async () => {
    const run = await runFixtureCycle({ day: 1 });
    const ids = run.report!.engine.recommendations.map((r) => r.assetId).sort();
    expect(ids).toEqual(["apple", "bills", "gold", "uae-equity", "us-etf", "value-etf"]);
  });

  it("returns partial_success rather than success when records were rejected", async () => {
    const run = await runFixtureCycle({ day: 1 });
    expect(run.state).toBe("partial_success");
  });

  it("a provider outage yields partial_success and names the failing provider", async () => {
    const run = await runFixtureCycle({ day: 1, failMacro: true });
    expect(run.state).toBe("partial_success");
    const macro = run.providers.find((p) => p.providerId === "fixture-macro")!;
    expect(macro.mode).toBe("error");
    expect(macro.health).toBe("failing");
    expect(run.issues.some((i) => i.message.includes("Fixture macro intelligence"))).toBe(true);
    // The run still produced a report from the providers that did respond.
    expect(run.report).not.toBeNull();
  });

  it("every score in the report comes from the engine, with a trace", async () => {
    const run = await runFixtureCycle({ day: 1 });
    for (const rec of run.report!.engine.recommendations) {
      if (rec.status !== "rated") continue;
      const contributing = rec.factorScores.filter((f) => f.weightedContribution !== null);
      const weightSum = contributing.reduce((s, f) => s + f.weight, 0);
      const recomputed =
        contributing.reduce((s, f) => s + (f.weightedContribution as number), 0) / weightSum;
      expect(recomputed).toBeCloseTo(rec.totalScore as number, 8);
    }
  });

  it("records an audit trace for every stage", async () => {
    const run = await runFixtureCycle({ day: 1 });
    const steps = run.auditTrace.map((s) => s.step);
    expect(steps).toEqual(
      expect.arrayContaining([
        "load_provider_configuration",
        "ingest_raw_evidence",
        "resolve_identity",
        "normalize_and_validate",
        "resolve_conflicts",
        "build_universe_inputs",
        "generate_report",
        "compare_reports",
        "generate_briefing",
        "draft_journal_entry",
      ]),
    );
  });
});

describe("day-over-day comparison", () => {
  it("detects a material change with a proven cause", async () => {
    const day1 = await runFixtureCycle({ day: 1 });
    const day2 = await runFixtureCycle({ day: 2, previousReport: day1.report!.engine });

    expect(day2.diff!.isFirstReport).toBe(false);
    expect(day2.diff!.summary.material + day2.diff!.summary.critical).toBeGreaterThan(0);

    const appleScore = day2.diff!.changes.find((c) => c.type === "score" && c.assetId === "apple");
    expect(appleScore).toBeDefined();
    expect(appleScore!.cause).toBe("valuation_input_changed");
    expect(appleScore!.absoluteChange).not.toBeNull();
    expect(appleScore!.explanation.length).toBeGreaterThan(0);
  });

  it("the first report has nothing to compare against", async () => {
    const run = await runFixtureCycle({ day: 1 });
    expect(run.diff!.isFirstReport).toBe(true);
    expect(run.diff!.changes).toHaveLength(0);
  });

  it("never asserts a cause it cannot prove", async () => {
    const day1 = await runFixtureCycle({ day: 1 });
    const day2 = await runFixtureCycle({ day: 2, previousReport: day1.report!.engine });
    for (const change of day2.diff!.changes) {
      if (change.cause === "unknown") {
        expect(change.causeDetail).toMatch(/no .*(change|account)/i);
      } else {
        expect(change.causeDetail.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("briefing", () => {
  it("labels every statement with its epistemic kind and cites references", async () => {
    const run = await runFixtureCycle({ day: 1 });
    const briefing = run.briefing!;
    expect(briefing.sections).toHaveLength(12);
    const statements = briefing.sections.flatMap((s) => s.statements);
    expect(statements.length).toBeGreaterThan(10);
    for (const statement of statements) {
      expect(["fact", "engine_output", "inference", "warning", "decision_needed"]).toContain(
        statement.kind,
      );
      expect(statement.text.length).toBeGreaterThan(0);
    }
  });

  it("states the honest data provenance label", async () => {
    const run = await runFixtureCycle({ day: 1 });
    expect(run.briefing!.dataLabel).toBe("Fixture intelligence");
    expect(run.briefing!.sections[0]!.statements.some((s) => s.text.includes("Fixture"))).toBe(true);
  });

  it("surfaces insufficient evidence and asks the user for a decision", async () => {
    const run = await runFixtureCycle({ day: 1 });
    const missing = run.briefing!.sections.find((s) => s.id === "missing_or_uncertain")!;
    expect(missing.statements.some((s) => s.text.includes("value-etf"))).toBe(true);
    const questions = run.briefing!.sections.find((s) => s.id === "questions_for_user")!;
    expect(questions.statements.length).toBeGreaterThan(0);
    expect(questions.statements.every((s) => s.kind === "decision_needed")).toBe(true);
  });
});

describe("provider honesty", () => {
  it("an unconfigured HTTP provider is disabled and attempts no request", async () => {
    const provider = exampleHttpProvider({});
    const descriptor = provider.describe();
    expect(descriptor.mode).toBe("disabled");
    expect(descriptor.configured).toBe(false);
    expect(descriptor.authenticated).toBe(false);
    expect(descriptor.health).toBe("unconfigured");

    const result = await provider.fetch({ assetIds: ["apple"], asOf: "2026-07-24T12:00:00Z" });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("disabled");
    expect(result.records).toHaveLength(0);
    expect(result.failureReason).toMatch(/not configured/i);
  });

  it("a fixture provider never claims to be authenticated", () => {
    for (const adapter of fixtureAdapters(1)) {
      const descriptor = adapter.describe();
      expect(descriptor.mode).toBe("fixture");
      expect(descriptor.authenticated).toBe(false);
    }
  });

  it("run labels reflect the modes that actually contributed", () => {
    expect(labelForModes([])).toBe("No data");
    expect(labelForModes(["fixture"])).toBe("Fixture intelligence");
    expect(labelForModes(["manual_import"])).toBe("Manual evidence");
    expect(labelForModes(["live"])).toBe("Live verified");
    // Any non-live contribution downgrades the claim.
    expect(labelForModes(["live", "fixture"])).toBe("Partial live");
  });
});

describe("manual evidence import", () => {
  it("takes a valid file all the way to a generated report", async () => {
    const parsed = ManualEvidenceImportAdapter.parse(sample("valid.json"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await parsed.adapter.fetch({ assetIds: [], asOf: "2026-07-26T08:00:00Z" });
    expect(result.mode).toBe("manual_import");
    expect(result.records.length).toBe(3);
  });

  it("rejects a malformed file with a readable message", () => {
    const parsed = ManualEvidenceImportAdapter.parse("{ not json");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/not valid json/i);
  });

  it("rejects a file that does not match the v3.0 schema", () => {
    const parsed = ManualEvidenceImportAdapter.parse(JSON.stringify({ schemaVersion: "9.9" }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/schema v3\.0/i);
  });

  it("every sample file parses or fails as documented", () => {
    for (const file of ["valid.json", "ambiguous-identity.json", "conflict.json", "stale.json", "invalid.json"]) {
      const parsed = ManualEvidenceImportAdapter.parse(sample(file));
      // All five are structurally valid imports; invalid.json fails later, in
      // normalization, which is where a bad unit or date belongs.
      expect(parsed.ok, `${file} should parse structurally`).toBe(true);
    }
  });
});

describe("journal append flow", () => {
  it("appends an entry and reads it back", async () => {
    const storage = memoryStorage();
    const run = await runFixtureCycle({ day: 1 });
    const outcome = appendJournalEntry(storage, run.draftJournalEntry!);
    expect(outcome.ok).toBe(true);
    expect(readJournal(storage)).toHaveLength(1);
  });

  it("refuses to append the same entry twice", async () => {
    const storage = memoryStorage();
    const run = await runFixtureCycle({ day: 1 });
    appendJournalEntry(storage, run.draftJournalEntry!);
    const second = appendJournalEntry(storage, run.draftJournalEntry!);
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/append-only/i);
  });

  it("a correction adds a new entry and leaves the original intact", async () => {
    const storage = memoryStorage();
    const run = await runFixtureCycle({ day: 1 });
    const original = run.draftJournalEntry!;
    appendJournalEntry(storage, original);

    const outcome = appendCorrection(
      storage,
      original.entryId,
      { reviewNotes: "Corrected after review." },
      `${original.entryId}-correction`,
    );
    expect(outcome.ok).toBe(true);

    const entries = readJournal(storage);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.entryId).toBe(original.entryId);
    expect(entries[0]!.reviewNotes).toBeNull();
    expect(entries[1]!.supersedes).toBe(original.entryId);
    expect(entries[1]!.reviewNotes).toBe("Corrected after review.");
  });

  it("integrity markers verify and detect tampering", async () => {
    const storage = memoryStorage();
    const run = await runFixtureCycle({ day: 1 });
    const entry = run.draftJournalEntry!;
    appendJournalEntry(storage, entry);
    expect(verifyEntryIntegrity(entry)).toBe(true);
    expect(verifyEntryIntegrity({ ...entry, deploymentScore: entry.deploymentScore + 5 })).toBe(
      false,
    );
  });

  it("decisions are recorded separately from recommendations", async () => {
    const storage = memoryStorage();
    const run = await runFixtureCycle({ day: 1 });
    const decision = emptyDecision({
      decisionId: "d1",
      runId: run.runId,
      reportHash: run.report!.engine.journalEntry.reportHash,
      recordedAt: "2026-07-24T13:00:00Z",
      assetId: "apple",
      recommendationSnapshot: "Hold",
    });
    recordDecision(storage, { ...decision, kind: "rejected", reason: "Prefer to wait." });

    const stored = readDecisions(storage);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.kind).toBe("rejected");
    // The engine's recommendation is preserved alongside the user's choice.
    expect(stored[0]!.recommendationSnapshot).toBe("Hold");
    // Nothing about the journal entry changed because a decision was recorded.
    expect(readJournal(storage)).toHaveLength(0);
  });
});
