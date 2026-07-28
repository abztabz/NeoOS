import { expect, test } from "./helpers";
import { DEMO } from "./expected";

const routes = ["/", "/markets", "/portfolio", "/gold", "/cash", "/timeline"];

test.describe("pre-hydration rendering", () => {
  test.use({ javaScriptEnabled: false });

  test("cockpit shows the deployment answer without JavaScript", async ({ page }) => {
    await page.goto("/capital");
    // The primary decision is server-rendered: score, recommendation, posture.
    await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);
    await expect(page.locator("strong", { hasText: DEMO.recommendation }).first()).toBeVisible();
    await expect(page.locator("strong", { hasText: DEMO.posture })).toBeVisible();
    // Demo labeling is visible pre-hydration too.
    await expect(page.getByTestId("mode-badge")).toBeVisible();
    // Not a blank shell: the engine's radar content is present. The first item
    // is engine-derived, so assert against it rather than a fixed headline.
    await expect(page.getByText(DEMO.firstRadarTitle)).toBeVisible();
  });

  test("gauge is visible and not clipped without JavaScript", async ({ page }) => {
    await page.goto("/capital");
    const score = page.getByTestId("deployment-score");
    await expect(score).toBeVisible();
    const box = await score.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
    // The gauge answers within the first viewport — no excessive scrolling.
    expect(box!.y).toBeLessThan(viewport!.height);
  });
});

test.describe("overflow", () => {
  for (const route of routes) {
    test(`no horizontal overflow at ${route}`, async ({ page }) => {
      await page.goto(route);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
      // Mobile Chromium widens the layout viewport (shrink-to-fit) when content
      // overflows the device width, which would mask the overflow above.
      const viewport = page.viewportSize()!;
      expect(metrics.innerWidth).toBeLessThanOrEqual(viewport.width + 1);
    });
  }
});
