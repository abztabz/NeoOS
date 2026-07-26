import { expect, test } from "@playwright/test";

/**
 * The intake surface.
 *
 * These run without an operator token configured, so the page must be usable up
 * to the point of authentication and must not leak anything before it. The
 * calculation and gating behaviour is covered exhaustively by the unit suite;
 * what matters here is that the surface renders, is reachable, and holds its
 * shape at an iPhone width.
 */

test("intake is reachable from navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Position", exact: true }).first().click();
  await expect(page).toHaveURL(/\/intake$/);
});

test("the position is not readable without the operator token", async ({ page }) => {
  await page.goto("/intake");
  // The gate, not an empty form. This page holds a household's entire financial
  // position, so an unauthenticated visitor must get nothing at all.
  await expect(page.getByLabel("Operator token")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(page.getByText(/entire financial position/i)).toBeVisible();
  await expect(page.getByTestId("personalisation-state")).toHaveCount(0);
});

test("the token field is a password field and is never prefilled", async ({ page }) => {
  await page.goto("/intake");
  const field = page.getByLabel("Operator token");
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).toHaveValue("");
});

test("a token that is not accepted keeps the gate closed and says why", async ({ page }) => {
  // No OPERATOR_API_TOKEN is configured in this environment, so the honest
  // answer is that the endpoint is unavailable rather than that the token was
  // wrong. Either way the gate must stay shut and the reason must be legible —
  // a deployment missing its configuration should say so, not look broken.
  //
  // Scoped by test id rather than role: Next renders its own empty
  // role="alert" route announcer, and matching on the role alone is a
  // strict-mode collision that comes and goes with hydration timing.
  await page.goto("/intake");
  await page.getByLabel("Operator token").fill("not-the-real-token");
  await page.getByRole("button", { name: "Unlock" }).click();

  const error = page.getByTestId("intake-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveText(/token|not available/i);
  await expect(page.getByLabel("Operator token")).toBeVisible();
  await expect(page.getByTestId("personalisation-state")).toHaveCount(0);
});

test("no horizontal overflow at iPhone width", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile viewport only");
  await page.goto("/intake");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("the unlock control clears a 44px touch target", async ({ page }) => {
  await page.goto("/intake");
  const box = await page.getByRole("button", { name: "Unlock" }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
