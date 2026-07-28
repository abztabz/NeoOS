import { expect, test } from "./helpers";
import { DEMO } from "./expected";

// `/capital` included deliberately: it carries the densest cards on the
// narrowest viewport, and it was the one route the overflow loops missed.
const routes = ["/", "/capital", "/markets", "/portfolio", "/gold", "/cash", "/timeline"];

/**
 * Pre-hydration rendering, after demo isolation.
 *
 * These tests used to assert that the demo cockpit — score, recommendation,
 * posture, radar — was server-rendered before hydration. That guarantee was
 * only ever about the *fixture* universe: a real subject's position is fetched
 * client-side behind the operator token and was never in the server HTML.
 *
 * Isolation supersedes it. Whether the worked example is open is a client
 * decision held in sessionStorage, so the server cannot know it, and rendering
 * fixture holdings by default is exactly what put Apple in front of somebody
 * who owns none. The rule that survives is the one that mattered underneath:
 * **never a blank shell.** The server still paints real, honest content — the
 * navigation, the header, and either the choice or the no-analysis card — and
 * it paints nothing about anybody's money.
 */
test.describe("pre-hydration rendering", () => {
  test.use({ javaScriptEnabled: false });

  test("the app is not a blank shell without JavaScript", async ({ page }) => {
    await page.goto("/capital");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspaces" })).toBeVisible();
    // Real content, not a spinner and not an empty main.
    const main = await page.locator("main").innerText();
    expect(main.trim().length).toBeGreaterThan(40);
  });

  test("no fixture holding is server-rendered before the choice is made", async ({ page }) => {
    await page.goto("/capital");
    const body = await page.locator("body").innerText();
    // The load-bearing assertion. With JavaScript off the init script never
    // runs, so this is the true default HTML every visitor receives first.
    expect(body).not.toMatch(/apple/i);
    expect(body).not.toMatch(/S&P 500/i);
    expect(body).not.toContain(DEMO.deploymentPct);
  });

  test("the home screen server-renders the choice rather than a briefing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("first-run")).toBeVisible();
    await expect(page.getByTestId("create-portfolio")).toBeVisible();
  });

  test("a gated workspace explains itself rather than rendering empty", async ({ page }) => {
    await page.goto("/capital");
    const gate = page.getByTestId("analysis-unavailable").first();
    await expect(gate).toBeVisible();
    await expect(gate).toContainText(/analysed/i);
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
