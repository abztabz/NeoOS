import { expect, test } from "@playwright/test";
import path from "node:path";
import { DEMO } from "./expected";

const routes = ["/", "/markets", "/portfolio", "/gold", "/cash", "/timeline"];

test.describe("data state and report metadata", () => {
  test("the header shows the data state and opens exact report metadata", async ({ page }) => {
    await page.goto("/capital");
    const badge = page.getByTestId("mode-badge");
    await expect(badge).toContainText(/demo/i);

    await badge.click();
    const details = page.locator("dialog[open]", { hasText: "Report details" });
    await expect(details).toBeVisible();
    // Exact timestamp and versions, not just relative freshness.
    await expect(details).toContainText("Report timestamp");
    await expect(details).toContainText("Scoring engine");
    await expect(details).toContainText("Schema version");
    await expect(details).toContainText("Last evidence update");
    await details.getByRole("button", { name: /close report details/i }).click();
    await expect(details).not.toBeVisible();
  });

  test("a stale report is labeled stale rather than shown as current", async ({ page }) => {
    await page.goto("/capital");
    await page.getByRole("button", { name: "Data", exact: true }).click();
    const dialog = page.locator("dialog[open]", { hasText: "Import NeoOS JSON" });
    await dialog
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, "fixtures", "report-stale.json"));
    await dialog.getByRole("button", { name: /apply report/i }).click();
    await dialog.getByRole("button", { name: /close import dialog/i }).click();

    await expect(page.getByTestId("mode-badge")).toContainText(/stale/i);
    await page.getByTestId("mode-badge").click();
    await expect(page.locator("dialog[open]")).toContainText(/older than/i);
  });
});

test.describe("insufficient evidence is visible", () => {
  test("an unrated asset keeps its place and is labeled, not hidden", async ({ page }) => {
    await page.goto("/markets");
    // The demo universe contains one asset the engine refuses to rate.
    // Desktop table and mobile card list both exist in the DOM; assert on the
    // one actually rendered at this viewport.
    await expect(page.getByTestId("insufficient-evidence-pill").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("Speculative AI momentum basket").locator("visible=true").first()).toBeVisible();
  });

  test("the action board gives insufficient evidence its own group", async ({ page }) => {
    await page.goto("/capital");
    const board = page.locator("section", { hasText: "ACTION BOARD" });
    await expect(
      board.getByText("Insufficient Evidence", { exact: false }).locator("visible=true").first(),
    ).toBeVisible();
  });

  test("the trace explains why no rating was produced", async ({ page }) => {
    await page.goto("/markets");
    const row = page
      .locator("li:visible, tr:visible")
      .filter({ hasText: "Speculative AI momentum basket" })
      .first();
    await row.getByRole("button", { name: /why/i }).click();
    const trace = page.locator("dialog[open]", { hasText: "Calculation trace" });
    await expect(trace).toContainText(/why no rating was produced/i);
    await expect(trace).toContainText(/insufficient evidence coverage/i);
  });
});

test.describe("explainability", () => {
  test("the asset trace shows the factor waterfall and the Strong Buy gate", async ({ page }) => {
    await page.goto("/markets");
    const row = page.locator("li:visible, tr:visible").filter({ hasText: "Apple" }).first();
    await row.getByRole("button", { name: /why/i }).click();

    const trace = page.locator("dialog[open]", { hasText: "Calculation trace" });
    await expect(trace).toBeVisible();
    // Every weighted factor appears with its contribution.
    for (const factor of ["valuation", "financialStrength", "governance"]) {
      await expect(trace).toContainText(factor);
    }
    await expect(trace).toContainText("Sum of contributions");
    await expect(trace).toContainText(/Strong Buy eligibility gate/i);
    await expect(trace).toContainText(/margin of safety/i);
    // Valuation provenance is shown, not just a number.
    await expect(trace).toContainText(/Assumptions/i);
    await expect(trace).toContainText(/Invalidation conditions/i);

    await trace.getByRole("button", { name: /close calculation trace/i }).click();
    await expect(trace).not.toBeVisible();
  });

  test("the posture explanation names drivers and what would move the score", async ({ page }) => {
    await page.goto("/capital");
    await page.getByRole("button", { name: /why this score/i }).click();
    const dialog = page.locator("dialog[open]", { hasText: "Why" });
    await expect(dialog).toContainText(/Primary drivers/i);
    await expect(dialog).toContainText(/What would increase deployment/i);
    await expect(dialog).toContainText(/What would reduce deployment/i);
    await expect(dialog).toContainText(/Evidence integrity/i);
    await expect(dialog).toContainText(/Qualified Strong Buys/i);
  });
});

test.describe("provenance", () => {
  test("thresholds are withheld when a report carries no valuation trace", async ({ page }) => {
    await page.goto("/capital");
    // A v1.1 file asserts buyBelow with nothing behind it.
    await page.getByRole("button", { name: "Data", exact: true }).click();
    const dialog = page.locator("dialog[open]", { hasText: "Import NeoOS JSON" });
    await dialog
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, "fixtures", "report-v11.json"));
    await dialog.getByRole("button", { name: /apply report/i }).click();
    await dialog.getByRole("button", { name: /close import dialog/i }).click();

    // No trace behind the file's asserted thresholds, so the card refuses the
    // decision rather than rendering a Good Buy Price nothing derived.
    const suspended = page.getByTestId("opportunity-suspended").locator("visible=true").first();
    await expect(suspended).toBeVisible();
    await expect(suspended).toContainText(/could not be verified|Valuation review required/i);
  });

  test("thresholds show their derivation behind the evidence disclosure", async ({ page }) => {
    await page.goto("/capital");
    const board = page.locator("section", { hasText: "TOP OPPORTUNITIES" });
    const card = board.getByTestId("opportunity-card").first();
    await card.getByRole("button", { name: /show evidence/i }).click();
    // Engine-derived thresholds carry method, model version and valuation date.
    await expect(card.getByTestId("opportunity-evidence")).toContainText(/model 2\.0\.0/);
  });

  test("the three prices are named separately on every opportunity card", async ({ page }) => {
    await page.goto("/capital");
    const card = page.getByTestId("opportunity-card").first();
    await expect(card).toContainText("Current");
    await expect(card).toContainText("Good Buy Price");
    await expect(card).toContainText("Fair Value");
    // The old label promised a target somebody else had published.
    await expect(card).not.toContainText(/buy below/i);
  });
});

test.describe("mobile layout at the narrowest supported width", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  for (const route of routes) {
    test(`no horizontal overflow at 320px on ${route}`, async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("the cockpit still answers the primary question at 320px", async ({ page }) => {
    await page.goto("/capital");
    await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);
    await expect(page.getByTestId("mode-badge")).toBeVisible();
  });
});

test.describe("no console errors", () => {
  for (const route of routes) {
    test(`clean console on ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  }
});
