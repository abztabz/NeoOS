import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { DEMO, FIXTURE_V10_PCT } from "./expected";

const fixture = path.join(__dirname, "fixtures", "report-72.json");

async function openImportDialog(page: Page) {
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const dialog = page.locator("dialog[open]", { hasText: "Import NeoOS JSON" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("valid v1 report updates the cockpit after preview and apply", async ({ page }) => {
  await page.goto("/capital");
  await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);

  const dialog = await openImportDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles(fixture);
  await expect(dialog.getByText("Preview — not applied yet")).toBeVisible();
  // Preview does not touch the cockpit.
  await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);

  await dialog.getByRole("button", { name: /apply report/i }).click();
  await expect(dialog.getByRole("status")).toContainText(/report applied/i);
  await dialog.getByRole("button", { name: /close import dialog/i }).click();

  await expect(page.getByTestId("deployment-score")).toHaveText(FIXTURE_V10_PCT);
  await expect(page.locator("strong", { hasText: "Increase Deployment" }).first()).toBeVisible();
  // Mode badge leaves demo state.
  await expect(page.getByTestId("mode-badge")).not.toContainText(/demo/i);
});

test("imported report survives a refresh when storage is available", async ({ page }) => {
  await page.goto("/capital");
  const dialog = await openImportDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles(fixture);
  await dialog.getByRole("button", { name: /apply report/i }).click();
  await expect(dialog.getByRole("status")).toContainText(/saved on this device/i);

  await page.reload();
  await expect(page.getByTestId("deployment-score")).toHaveText(FIXTURE_V10_PCT);
});

test("invalid JSON shows a clear error and never destroys current state", async ({ page }) => {
  await page.goto("/capital");
  const dialog = await openImportDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not valid json"),
  });
  await expect(dialog.getByRole("alert")).toContainText(/not valid json/i);
  await expect(dialog.getByRole("alert")).toContainText(/current report is untouched/i);
  await dialog.getByRole("button", { name: /close import dialog/i }).click();
  await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);
});

test("schema-invalid report is rejected with the failing path", async ({ page }) => {
  await page.goto("/capital");
  const dialog = await openImportDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "wrong-version.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: "9.9" })),
  });
  await expect(dialog.getByRole("alert")).toContainText(/unsupported schemaversion/i);
  await dialog.getByRole("button", { name: /close import dialog/i }).click();
  await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);
});

test("oversized file is rejected", async ({ page }) => {
  await page.goto("/capital");
  const dialog = await openImportDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "huge.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_100_000, 0x7b),
  });
  await expect(dialog.getByRole("alert")).toContainText(/too large/i);
});

test("reset to demo restores the baseline", async ({ page }) => {
  await page.goto("/capital");
  let dialog = await openImportDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles(fixture);
  await dialog.getByRole("button", { name: /apply report/i }).click();
  await dialog.getByRole("button", { name: /close import dialog/i }).click();
  await expect(page.getByTestId("deployment-score")).toHaveText(FIXTURE_V10_PCT);

  dialog = await openImportDialog(page);
  await dialog.getByRole("button", { name: /reset to demo/i }).click();
  await dialog.getByRole("button", { name: /close import dialog/i }).click();
  await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);
  await expect(page.getByTestId("mode-badge")).toContainText(/demo/i);
});

test.describe("blocked browser storage", () => {
  test("app still renders demo content and imports work for the session", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("storage blocked by test");
        },
      });
    });
    await page.goto("/capital");
    // Demo content renders despite storage being blocked.
    await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);

    const dialog = await openImportDialog(page);
    await expect(dialog.getByText(/browser storage is blocked/i)).toBeVisible();
    await dialog.locator('input[type="file"]').setInputFiles(fixture);
    await dialog.getByRole("button", { name: /apply report/i }).click();
    await expect(dialog.getByRole("status")).toContainText(/will not survive a refresh/i);
    await dialog.getByRole("button", { name: /close import dialog/i }).click();
    await expect(page.getByTestId("deployment-score")).toHaveText(FIXTURE_V10_PCT);

    // And a refresh falls back to demo without crashing.
    await page.reload();
    await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);
  });
});
