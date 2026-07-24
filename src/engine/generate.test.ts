import { describe, expect, it } from "vitest";
import { demoUniverse } from "@/data/demo-universe";
import { demoEngineReport, demoReport } from "@/data/demo-report";
import { generateReport } from "@/engine/generate";
import { engineReportSchema } from "@/engine/models";
import { neoosReportV11Checked, parseReport } from "@/schemas/neoos-report";
import { ENGINE_VERSION } from "@/engine/constants";
import { fnv1a64, stableStringify } from "@/engine/hash";

describe("report generation", () => {
  it("is deterministic: identical inputs give identical output", () => {
    const a = generateReport(demoUniverse);
    const b = generateReport(demoUniverse);
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("produces an engine report that satisfies the v2.0 schema", () => {
    const result = engineReportSchema.safeParse(demoEngineReport);
    expect(result.success).toBe(true);
  });

  it("produces a view report that satisfies the v1.1 contract", () => {
    const result = neoosReportV11Checked.safeParse(demoReport);
    expect(result.success).toBe(true);
  });

  it("round-trips through JSON import without changing any score", () => {
    const parsed = parseReport(JSON.stringify(demoReport));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.report.deployment.score).toBe(demoReport.deployment.score);
      expect(parsed.report.assets.map((a) => a.score)).toEqual(
        demoReport.assets.map((a) => a.score),
      );
    }
  });

  it("round-trips as a v2.0 engine file, preserving the trace", () => {
    const file = generateReport(demoUniverse);
    const parsed = parseReport(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.sourceVersion).toBe("2.0");
      const engine = engineReportSchema.safeParse(parsed.engine);
      expect(engine.success).toBe(true);
      if (engine.success) {
        expect(engine.data.recommendations).toHaveLength(
          demoEngineReport.recommendations.length,
        );
      }
    }
  });

  it("every displayed score traces back to the engine", () => {
    for (const asset of demoReport.assets) {
      const rec = demoEngineReport.recommendations.find((r) => r.assetId === asset.id);
      expect(rec).toBeDefined();
      if (rec!.status === "rated") {
        expect(asset.score).toBe(Math.round(rec!.totalScore as number));
        expect(asset.rating).toBe(rec!.finalRating);
      } else {
        expect(asset.score).toBeNull();
        expect(asset.rating).toBeNull();
      }
    }
    expect(demoReport.deployment.score).toBe(demoEngineReport.posture.deploymentScore);
    expect(demoReport.scores.cash).toBe(Math.round(demoEngineReport.posture.cashScore));
  });

  it("every rated asset has a reproducible calculation trace", () => {
    for (const rec of demoEngineReport.recommendations) {
      if (rec.status !== "rated") continue;
      const contributing = rec.factorScores.filter((f) => f.weightedContribution !== null);
      const weightSum = contributing.reduce((s, f) => s + f.weight, 0);
      const recomputed =
        contributing.reduce((s, f) => s + (f.weightedContribution as number), 0) / weightSum;
      expect(recomputed).toBeCloseTo(rec.totalScore as number, 8);
    }
  });

  it("every asset conclusion cites evidence or is marked insufficient", () => {
    for (const rec of demoEngineReport.recommendations) {
      if (rec.status === "insufficient_evidence") {
        expect(rec.insufficientReasons.length).toBeGreaterThan(0);
        continue;
      }
      const cited = rec.factorScores.flatMap((f) => f.evidenceIds);
      expect(cited.length).toBeGreaterThan(0);
      for (const id of cited) {
        expect(demoEngineReport.evidence.some((e) => e.evidenceId === id)).toBe(true);
      }
    }
  });

  it("price thresholds only appear alongside a valuation trace", () => {
    for (const asset of demoReport.assets) {
      if (asset.buyBelow === null && asset.strongBuyBelow === null) continue;
      const rec = demoEngineReport.recommendations.find((r) => r.assetId === asset.id)!;
      expect(rec.valuation).not.toBeNull();
      expect(rec.valuation!.evidenceIds.length).toBeGreaterThan(0);
      expect(rec.valuation!.assumptions.length).toBeGreaterThan(0);
      expect(rec.valuation!.invalidationConditions.length).toBeGreaterThan(0);
    }
  });

  it("surfaces insufficient-evidence items as warnings", () => {
    const insufficient = demoEngineReport.recommendations.filter(
      (r) => r.status === "insufficient_evidence",
    );
    expect(insufficient.length).toBeGreaterThan(0);
    for (const rec of insufficient) {
      expect(demoEngineReport.insufficientEvidenceItems.join(" ")).toContain(rec.assetId);
      expect(demoEngineReport.warnings.join(" ")).toContain(rec.assetId);
    }
  });

  it("Strong Buy stays rare: the demo produces none", () => {
    expect(demoEngineReport.posture.strongBuyCount).toBe(0);
    expect(demoReport.assets.some((a) => a.rating === "Strong Buy")).toBe(false);
  });

  it("stamps engine and schema versions on the view", () => {
    expect(demoReport.engineVersion).toBe(ENGINE_VERSION);
    expect(demoReport.schemaVersion).toBe("1.1");
    expect(demoReport.evidenceUpdatedAt).toBeDefined();
  });
});

describe("decision journal", () => {
  it("carries prior entries forward unchanged", () => {
    const timeline = demoReport.timeline!;
    for (const prior of demoUniverse.journalHistory) {
      const event = timeline.find((e) => e.id === prior.entryId);
      expect(event).toBeDefined();
      expect(event!.title).toBe(prior.summary);
      expect(event!.deploymentPct).toBe(prior.deploymentScore);
    }
  });

  it("appends today's entry without rewriting history", () => {
    const timeline = demoReport.timeline!;
    expect(timeline).toHaveLength(demoUniverse.journalHistory.length + 1);
    expect(timeline.at(-1)!.id).toBe(demoEngineReport.journalEntry.entryId);
  });

  it("the integrity hash covers the entry contents", () => {
    const entry = demoEngineReport.journalEntry;
    const { integrityHash, ...rest } = entry;
    expect(fnv1a64(stableStringify(rest))).toBe(integrityHash);
  });

  it("tampering with an entry breaks its integrity hash", () => {
    const entry = demoEngineReport.journalEntry;
    const tampered = { ...entry, deploymentScore: entry.deploymentScore + 10 };
    delete (tampered as Partial<typeof tampered>).integrityHash;
    expect(fnv1a64(stableStringify(tampered))).not.toBe(entry.integrityHash);
  });

  it("the report hash changes when any recommendation changes", () => {
    const modified = {
      ...demoUniverse,
      entries: demoUniverse.entries.slice(0, 3),
    };
    const other = generateReport(modified);
    expect(other.engine.journalEntry.reportHash).not.toBe(
      demoEngineReport.journalEntry.reportHash,
    );
  });
});

describe("change log", () => {
  it("is empty for the first report and populated against a previous one", () => {
    const first = generateReport({ ...demoUniverse, previous: null });
    expect(first.engine.changeLog).toHaveLength(0);

    const changed = generateReport({
      ...demoUniverse,
      previous: first.engine,
      // Cheaper gold shifts its score, which the change log must notice.
      entries: demoUniverse.entries.map((entry) =>
        entry.asset.assetId === "gold" && entry.valuationInput
          ? { ...entry, valuationInput: { ...entry.valuationInput, marketPrice: 1500 } }
          : entry,
      ),
    });
    expect(changed.engine.changeLog.join(" ")).toContain("gold");
    expect(changed.engine.metadata.previousReportHash).toBe(
      first.engine.journalEntry.reportHash,
    );
  });
});
