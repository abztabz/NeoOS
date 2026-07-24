import { expect, test, type Page } from "@playwright/test";

function visibleNav(page: Page) {
  return page.locator('nav[aria-label="Workspaces"]:visible');
}

const workspaces = [
  { label: "Markets", probe: "GLOBAL OPPORTUNITY HEAT MAP" },
  { label: "Portfolio", probe: "PORTFOLIO" },
  { label: "Gold", probe: "GOLD INTELLIGENCE" },
  { label: "Cash", probe: "CASH OPERATING SYSTEM" },
  { label: "Timeline", probe: "TIMELINE" },
  { label: "Capital", probe: "CAPITAL RADAR" },
];

test("every workspace tab changes content and marks the active tab", async ({ page }) => {
  await page.goto("/");
  for (const ws of workspaces) {
    await visibleNav(page).getByRole("link", { name: ws.label }).click();
    await expect(page.locator("h3", { hasText: ws.probe }).first()).toBeVisible();
    await expect(visibleNav(page).getByRole("link", { name: ws.label })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("bottom navigation is present on mobile and within the safe area", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "bottom navigation is a mobile-only surface");
  await page.goto("/");
  const nav = page.locator("nav.fixed");
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  const viewport = page.viewportSize()!;
  // Pinned to the bottom edge, full width.
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1);
});
