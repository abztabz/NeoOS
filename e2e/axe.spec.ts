import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./helpers";

/**
 * Automated accessibility scanning.
 *
 * Scans every workspace plus each dialog, and fails on serious or critical
 * violations. Moderate and minor findings are reported in the failure message
 * when a serious one is present, so a fix has the full picture, but they do not
 * fail the build on their own.
 */

const routes = ["/", "/markets", "/portfolio", "/gold", "/cash", "/timeline"];

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

function summarize(violations: { id: string; impact?: string | null; nodes: unknown[]; help: string }[]) {
  return violations
    .map((v) => `${v.impact ?? "unknown"} · ${v.id} (${v.nodes.length} node(s)): ${v.help}`)
    .join("\n");
}

test.describe("accessibility", () => {
  for (const route of routes) {
    test(`no serious or critical violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));
      expect(blocking, summarize(results.violations)).toEqual([]);
    });
  }

  test("no serious or critical violations in the import dialog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Data", exact: true }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));
    expect(blocking, summarize(results.violations)).toEqual([]);
  });

  test("no serious or critical violations in the intelligence panel after a run", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    const panel = page.locator("dialog[open]", { hasText: "Daily cycle" });
    await panel.getByRole("button", { name: "Run fixture day 1" }).click();
    await expect(panel.getByTestId("cycle-state")).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));
    expect(blocking, summarize(results.violations)).toEqual([]);
  });

  test("no serious or critical violations with the briefing and decision form rendered", async ({
    page,
  }) => {
    await page.goto("/capital");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    const panel = page.locator("dialog[open]", { hasText: "Daily cycle" });
    await panel.getByRole("button", { name: "Run fixture day 1" }).click();
    await expect(panel.getByTestId("cycle-state")).toBeVisible({ timeout: 15_000 });
    await panel.getByRole("button", { name: /close intelligence panel/i }).click();
    await expect(page.getByTestId("briefing-headline")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));
    expect(blocking, summarize(results.violations)).toEqual([]);
  });
});
