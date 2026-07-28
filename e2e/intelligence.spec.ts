import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const EVIDENCE = (file: string) => path.join(__dirname, "fixtures", "evidence", file);

async function openIntelligence(page: Page) {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const panel = page.locator("dialog[open]", { hasText: "Daily cycle" });
  await expect(panel).toBeVisible();
  return panel;
}

async function runFixtureDay(page: Page, day: 1 | 2) {
  const panel = await openIntelligence(page);
  await panel.getByRole("button", { name: `Run fixture day ${day}` }).click();
  await expect(panel.getByTestId("cycle-state")).toBeVisible({ timeout: 15_000 });
  return panel;
}

test.describe("intelligence cycle", () => {
  test("runs the fixture cycle and reports an honest state and label", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);

    // A run with rejected records must not present as a clean success.
    await expect(panel.getByTestId("cycle-state")).toContainText(/partial/i);
    await expect(panel.getByTestId("run-data-label")).toContainText(/fixture intelligence/i);
    // Fixture data is never described as live.
    await expect(panel.getByTestId("run-data-label")).not.toContainText(/^live/i);
  });

  test("shows the evidence ingestion summary", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    const summary = panel.locator("section", { hasText: "Evidence ingested" });
    await expect(summary).toContainText("Raw records ingested");
    await expect(summary).toContainText("Duplicates dropped");
    await expect(summary).toContainText("Rejected with reasons");
  });

  test("surfaces identity-resolution warnings", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    await expect(panel.getByTestId("identity-warning")).toBeVisible();
    await expect(panel.getByTestId("identity-warning")).toContainText(/never guessed at/i);
  });

  test("surfaces conflicts, including an unresolved one", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    const conflicts = panel.getByTestId("conflict-item");
    await expect(conflicts.first()).toBeVisible();
    await expect(panel.locator("section", { hasText: "Evidence conflicts" })).toContainText(
      "Unresolved",
    );
  });

  test("lists rejected records with their reasons behind disclosure", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    await panel.getByText(/Diagnostics/).click();
    await expect(panel.getByTestId("rejected-record").first()).toBeVisible();
  });

  test("shows provider status including the unconfigured example vendor", async ({ page }) => {
    await page.goto("/capital");
    const panel = await openIntelligence(page);
    // The manual-import path registers the example HTTP provider so its
    // unconfigured state is inspectable.
    await panel.locator('input[type="file"]').setInputFiles(EVIDENCE("valid.json"));
    await expect(panel.getByTestId("cycle-state")).toBeVisible({ timeout: 15_000 });
    await panel.getByText(/Provider status/).click();
    const rows = panel.getByTestId("provider-row");
    await expect(rows.first()).toBeVisible();
    await expect(panel.locator("dialog, div").filter({ hasText: "Example market data vendor" }).first()).toContainText(
      /not configured|disabled/i,
    );
  });

  test("manual evidence import runs the whole pipeline", async ({ page }) => {
    await page.goto("/capital");
    const panel = await openIntelligence(page);
    await panel.locator('input[type="file"]').setInputFiles(EVIDENCE("valid.json"));
    await expect(panel.getByTestId("cycle-state")).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByTestId("run-data-label")).toContainText(/fixture|manual/i);
  });

  test("a malformed evidence file is rejected without changing state", async ({ page }) => {
    await page.goto("/capital");
    const panel = await openIntelligence(page);
    await panel.locator('input[type="file"]').setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ not json"),
    });
    await expect(panel.getByRole("alert")).toContainText(/not valid json/i);
    await expect(panel.getByTestId("cycle-state")).toHaveCount(0);
  });

  test("applying a run report updates the cockpit", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    await panel.getByRole("button", { name: /apply report/i }).click();
    await panel.getByRole("button", { name: /close intelligence panel/i }).click();
    // The cockpit now states the run's provenance rather than the generic
    // demo label — and never claims the fixture data is live.
    await expect(page.getByTestId("deployment-score")).toBeVisible();
    await expect(page.getByTestId("mode-badge")).toContainText(/fixture/i);
    await expect(page.getByTestId("mode-badge")).not.toContainText(/live/i);
  });
});

test.describe("daily briefing", () => {
  test("renders with typed statements and expands to all sections", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    await panel.getByRole("button", { name: /close intelligence panel/i }).click();

    await expect(page.getByTestId("briefing-headline")).toBeVisible();
    const statements = page.getByTestId("briefing-statement");
    await expect(statements.first()).toBeVisible();

    const expand = page.getByRole("button", { name: /show all \d+ sections/i });
    const before = await statements.count();
    await expand.click();
    await expect(page.getByRole("button", { name: /show key sections/i })).toBeVisible();
    expect(await statements.count()).toBeGreaterThan(before);
  });

  test("states the data provenance label on the briefing", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    await panel.getByRole("button", { name: /close intelligence panel/i }).click();
    await expect(page.locator("section", { hasText: "MORPHEUS DAILY BRIEFING" })).toContainText(
      /FIXTURE INTELLIGENCE/i,
    );
  });
});

test.describe("decision capture and journal", () => {
  test("records a decision and appends a journal entry", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    await panel.getByRole("button", { name: /append journal entry/i }).click();
    await panel.getByRole("button", { name: /close intelligence panel/i }).click();

    const card = page.locator("section", { hasText: "RECORD YOUR DECISION" });
    await expect(card).toBeVisible();
    await card.getByRole("combobox").first().selectOption("apple");
    await card.getByRole("combobox").nth(1).selectOption("deferred");
    await card.getByRole("button", { name: /record decision/i }).click();
    await expect(page.getByTestId("decision-saved")).toContainText(/apple/i);

    // Both the journal entry and the decision appear on the Timeline.
    await page.goto("/timeline");
    await expect(page.getByTestId("journal-entry").first()).toBeVisible();
    await expect(page.getByTestId("timeline-decision").first()).toBeVisible();
    await expect(page.getByTestId("timeline-run").first()).toBeVisible();
  });

  test("journal entries survive a reload", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    await panel.getByRole("button", { name: /append journal entry/i }).click();
    await panel.getByRole("button", { name: /close intelligence panel/i }).click();

    await page.goto("/timeline");
    await expect(page.getByTestId("journal-entry").first()).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("journal-entry").first()).toBeVisible();
  });

  test("a failed evidence file leaves the last valid report in place", async ({ page }) => {
    await page.goto("/capital");
    const panel = await runFixtureDay(page, 1);
    await panel.getByRole("button", { name: /apply report/i }).click();
    const applied = await page.getByTestId("deployment-score").textContent();

    await panel.locator('input[type="file"]').setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("nope"),
    });
    await expect(panel.getByRole("alert")).toBeVisible();
    await panel.getByRole("button", { name: /close intelligence panel/i }).click();
    // The cockpit still shows the report that was successfully applied.
    await expect(page.getByTestId("deployment-score")).toHaveText(applied ?? "");
  });
});

test.describe("intelligence panel accessibility and layout", () => {
  for (const width of [320, 390, 430]) {
    test(`no horizontal overflow with the panel open at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/capital");
      await runFixtureDay(page, 1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("the panel is keyboard operable and closes on Escape", async ({ page }) => {
    await page.goto("/capital");
    const panel = await openIntelligence(page);
    // Focus is inside the dialog and reachable by keyboard.
    await page.keyboard.press("Tab");
    const focusedInDialog = await page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]");
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(focusedInDialog).toBe(true);

    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
  });
});
