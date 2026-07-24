import { describe, expect, it } from "vitest";
import { MAX_REPORT_BYTES, parseReport } from "@/schemas/neoos-report";
import { demoReport } from "@/data/demo-report";

function validText(mutate?: (r: Record<string, unknown>) => void): string {
  const clone = JSON.parse(JSON.stringify(demoReport)) as Record<string, unknown>;
  mutate?.(clone);
  return JSON.stringify(clone);
}

describe("parseReport", () => {
  it("accepts the canonical demo report", () => {
    const result = parseReport(validText());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.deployment.score).toBe(35);
      expect(result.report.assets).toHaveLength(6);
    }
  });

  it("rejects non-JSON text with a clear message", () => {
    const result = parseReport("not json at all {");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not valid json/i);
  });

  it("rejects an unsupported schema version", () => {
    const result = parseReport(validText((r) => (r.schemaVersion = "2.0")));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/schemaVersion/);
  });

  it("rejects a missing required section", () => {
    const result = parseReport(validText((r) => delete r.deployment));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/deployment/);
  });

  it("rejects out-of-range scores", () => {
    const result = parseReport(
      validText((r) => ((r.scores as Record<string, number>).cash = 140)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/scores\.cash/);
  });

  it("rejects an unknown asset rating", () => {
    const result = parseReport(
      validText((r) => (((r.assets as Record<string, unknown>[])[0]!).rating = "Moon")),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/assets\.0\.rating/);
  });

  it("requires at least one deployment reason (explainability is mandatory)", () => {
    const result = parseReport(
      validText((r) => (((r.deployment as Record<string, unknown>).reasons) = [])),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects oversized payloads", () => {
    const padding = "x".repeat(MAX_REPORT_BYTES + 1);
    const result = parseReport(padding);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/i);
  });

  it("rejects severity values outside the radar enum", () => {
    const result = parseReport(
      validText((r) => (((r.radar as Record<string, unknown>[])[0]!).severity = "panic")),
    );
    expect(result.ok).toBe(false);
  });
});

describe("v1.0 → v1.1 migration", () => {
  function v10Text(): string {
    const clone = JSON.parse(JSON.stringify(demoReport)) as Record<string, unknown>;
    clone.schemaVersion = "1.0";
    for (const key of [
      "regime",
      "commentary",
      "markets",
      "portfolio",
      "gold",
      "cash",
      "timeline",
      "tiers",
      "deploymentPlan",
    ]) {
      delete clone[key];
    }
    return JSON.stringify(clone);
  }

  it("accepts a v1.0 report and lifts it to v1.1", () => {
    const result = parseReport(v10Text());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceVersion).toBe("1.0");
      expect(result.report.schemaVersion).toBe("1.1");
      expect(result.report.markets).toBeUndefined();
      expect(result.report.deployment.score).toBe(35);
    }
  });

  it("reports the declared version for native v1.1 files", () => {
    const result = parseReport(validText());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sourceVersion).toBe("1.1");
  });

  it("accepts a partial v1.1 report (subset of sections)", () => {
    const result = parseReport(
      validText((r) => {
        delete r.markets;
        delete r.gold;
        delete r.timeline;
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.markets).toBeUndefined();
      expect(result.report.cash).toBeDefined();
    }
  });

  it("rejects a malformed v1.1 section with the failing path", () => {
    const result = parseReport(
      validText((r) => (((r.markets as Record<string, unknown>).regions as Record<string, unknown>[])[0]!.score = 300)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/markets\.regions\.0\.score/);
  });

  it("rejects timeline kinds outside the enum", () => {
    const result = parseReport(
      validText((r) => (((r.timeline as Record<string, unknown>[])[0]!).kind = "party")),
    );
    expect(result.ok).toBe(false);
  });
});
