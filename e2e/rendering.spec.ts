import { expect, test } from "@playwright/test";

const routes = ["/", "/markets", "/portfolio", "/gold", "/cash", "/timeline"];

test.describe("pre-hydration rendering", () => {
  test.use({ javaScriptEnabled: false });

  test("cockpit shows the deployment answer without JavaScript", async ({ page }) => {
    await page.goto("/");
    // The primary decision is server-rendered: score, recommendation, posture.
    await expect(page.getByTestId("deployment-score")).toHaveText("35%");
    await expect(page.locator("strong", { hasText: "Deploy Gradually" }).first()).toBeVisible();
    await expect(page.locator("strong", { hasText: "Light Pressure" })).toBeVisible();
    // Demo labeling is visible pre-hydration too.
    await expect(page.getByTestId("mode-badge")).toBeVisible();
    // Not a blank shell: radar content is present.
    await expect(page.getByText("Apple moved closer to Buy")).toBeVisible();
  });

  test("gauge is visible and not clipped without JavaScript", async ({ page }) => {
    await page.goto("/");
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
