import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportProvider, useReport, _resetStoreForTests } from "@/data/report-store";
import { demoReport } from "@/data/demo-report";

function importedText(score: number): string {
  const clone = structuredClone(demoReport);
  clone.deployment.score = score;
  clone.mode = "live";
  return JSON.stringify(clone);
}

/** Harness exposing store state and actions through the DOM (keeps render pure). */
function Harness() {
  const { report, source, importReport, resetDemo } = useReport();
  return (
    <div>
      <span data-testid="score">{report.deployment.score}</span>
      <span data-testid="source">{source}</span>
      <output data-testid="result" />
      <button
        onClick={() => {
          const result = importReport(importedText(72));
          (document.querySelector('[data-testid="result"]') as HTMLOutputElement).textContent =
            result.ok ? "ok" : result.error;
        }}
      >
        import-valid
      </button>
      <button
        onClick={() => {
          const result = importReport("{broken json");
          (document.querySelector('[data-testid="result"]') as HTMLOutputElement).textContent =
            result.ok ? "ok" : result.error;
        }}
      >
        import-invalid
      </button>
      <button onClick={() => resetDemo()}>reset</button>
    </div>
  );
}

function setup() {
  render(
    <ReportProvider>
      <Harness />
    </ReportProvider>,
  );
}

describe("ReportProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    _resetStoreForTests();
  });

  afterEach(() => cleanup());

  it("provides the demo report by default", () => {
    setup();
    expect(screen.getByTestId("score").textContent).toBe("35");
    expect(screen.getByTestId("source").textContent).toBe("demo");
  });

  it("applies a valid imported report and persists it", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "import-valid" }));
    expect(screen.getByTestId("result").textContent).toBe("ok");
    expect(screen.getByTestId("score").textContent).toBe("72");
    expect(screen.getByTestId("source").textContent).toBe("imported");
    const stored = window.localStorage.getItem("neoos.report.v1");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).deployment.score).toBe(72);
  });

  it("keeps current state when an import is invalid (non-destructive)", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "import-valid" }));
    await user.click(screen.getByRole("button", { name: "import-invalid" }));
    expect(screen.getByTestId("result").textContent).toMatch(/not valid json/i);
    // Previous imported report survives the failed import.
    expect(screen.getByTestId("score").textContent).toBe("72");
    expect(screen.getByTestId("source").textContent).toBe("imported");
  });

  it("resets to demo data and clears storage", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "import-valid" }));
    await user.click(screen.getByRole("button", { name: "reset" }));
    expect(screen.getByTestId("score").textContent).toBe("35");
    expect(screen.getByTestId("source").textContent).toBe("demo");
    expect(window.localStorage.getItem("neoos.report.v1")).toBeNull();
  });
});
