import { expect, test } from "@playwright/test";

test("gauge displays the score and opens the explanation on tap", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("deployment-score")).toHaveText("35%");

  await page.getByRole("button", { name: /why this score/i }).click();
  const dialog = page.locator("dialog[open]", { hasText: "Explainability" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Cash score 76/)).toBeVisible();
  // Band ladder marks the active band.
  await expect(dialog.locator('[aria-current="true"]')).toContainText("Deploy Gradually");

  await dialog.getByRole("button", { name: /close explanation/i }).click();
  await expect(dialog).toBeHidden();
});

test("explanation is keyboard accessible: opens with Enter, closes with Escape", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /why this score/i });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog[open]", { hasText: "Explainability" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Trigger remains reachable after close.
  await expect(trigger).toBeVisible();
});

test("gauge meter exposes value semantics", async ({ page }) => {
  await page.goto("/");
  const meter = page.getByRole("meter", { name: "Deployment intensity" });
  await expect(meter).toHaveAttribute("aria-valuenow", "35");
  await expect(meter).toHaveAttribute("aria-valuetext", /Deploy Gradually/);
});
