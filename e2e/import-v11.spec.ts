import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { FIXTURE_V10_PCT, FIXTURE_V11_PCT } from "./expected";

const v11Fixture = path.join(__dirname, "fixtures", "report-v11.json");
const v10Fixture = path.join(__dirname, "fixtures", "report-72.json");

async function importFixture(page: Page, fixture: string) {
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const dialog = page.locator("dialog[open]", { hasText: "Import NeoOS JSON" });
  await dialog.locator('input[type="file"]').setInputFiles(fixture);
  await expect(dialog.getByText("Preview — not applied yet")).toBeVisible();
  await dialog.getByRole("button", { name: /apply report/i }).click();
  await expect(dialog.getByRole("status")).toContainText(/report applied/i);
  await dialog.getByRole("button", { name: /close import dialog/i }).click();
}

test("v1.1 report drives every workspace section", async ({ page }) => {
  await page.goto("/capital");
  await importFixture(page, v11Fixture);

  // Cockpit: gauge and regime come from the report.
  await expect(page.getByTestId("deployment-score")).toHaveText(FIXTURE_V11_PCT);
  await expect(page.getByText("Improving / Partly Clear")).toBeVisible();
  // Report-provided sections carry no demo badge on the home page.
  await expect(page.getByTestId("section-demo-badge")).toHaveCount(1); // deploymentPlan omitted on purpose

  // Markets: regions and macro from the report.
  await page.getByRole("link", { name: "Markets" }).first().click();
  await expect(page.getByText("Second consecutive quarter of improving earnings breadth.")).toBeVisible();
  await expect(page.getByText("Disinflation is broadening", { exact: false })).toBeVisible();

  // Cash: report amounts.
  await page.goto("/cash");
  await expect(page.getByText("$50,000")).toBeVisible();
  await expect(page.getByText("$32,000")).toBeVisible();

  // Timeline: report event.
  await page.goto("/timeline");
  await expect(page.getByText("Deployment raised to 55%")).toBeVisible();

  // Portfolio was NOT provided → demo fallback, clearly labeled.
  await page.goto("/portfolio");
  await expect(page.getByTestId("section-demo-badge")).toBeVisible();
});

test("v1.1 import preview names the provided workspace sections", async ({ page }) => {
  await page.goto("/capital");
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const dialog = page.locator("dialog[open]", { hasText: "Import NeoOS JSON" });
  await dialog.locator('input[type="file"]').setInputFiles(v11Fixture);
  await expect(dialog.getByText("v1.1")).toBeVisible();
  await expect(dialog.getByText(/regime, commentary, markets, cash, timeline, tiers/)).toBeVisible();
});

test("v1.0 report still imports via migration with demo-labeled workspaces", async ({ page }) => {
  await page.goto("/capital");
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const dialog = page.locator("dialog[open]", { hasText: "Import NeoOS JSON" });
  await dialog.locator('input[type="file"]').setInputFiles(v10Fixture);
  await expect(dialog.getByText(/migrated to v1\.1/)).toBeVisible();
  await expect(dialog.getByText(/none — demo content fills the workspaces/)).toBeVisible();
  await dialog.getByRole("button", { name: /apply report/i }).click();
  await dialog.getByRole("button", { name: /close import dialog/i }).click();

  // Core cockpit reflects the v1.0 report...
  await expect(page.getByTestId("deployment-score")).toHaveText(FIXTURE_V10_PCT);
  // ...while workspace sections fall back to demo content, visibly labeled.
  await page.goto("/cash");
  await expect(page.getByTestId("section-demo-badge").first()).toBeVisible();
  await expect(page.getByText("$24,000")).toBeVisible();
});
