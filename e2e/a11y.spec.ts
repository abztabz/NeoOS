import { expect, test } from "@playwright/test";
import { DEMO } from "./expected";

test("primary touch targets are at least 44px tall", async ({ page }) => {
  await page.goto("/capital");
  const targets = [
    page.getByRole("button", { name: /why this score/i }),
    page.getByRole("button", { name: "Data", exact: true }),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("mobile nav links are at least 44px touch targets", async ({ page, isMobile }) => {
  test.skip(!isMobile, "bottom navigation is a mobile-only surface");
  await page.goto("/capital");
  const links = page.locator("nav.fixed a");
  const count = await links.count();
  // Morpheus, the six workspaces, and Position. Morpheus joined the bar when it
  // became the primary surface; the six workspaces kept their places.
  expect(count).toBe(8);
  for (let i = 0; i < count; i++) {
    const box = await links.nth(i).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // Eight tabs is genuinely tight on a 390px phone, so the width floor is
    // asserted too rather than assumed.
    expect(box!.width).toBeGreaterThanOrEqual(36);
  }
});

test("keyboard focus is visible on interactive elements", async ({ page }) => {
  await page.goto("/capital");
  const trigger = page.getByRole("button", { name: /why this score/i });
  await trigger.focus();
  const outline = await trigger.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(outline.style).not.toBe("none");
  expect(parseFloat(outline.width)).toBeGreaterThan(0);
});

test("reduced-motion preference is honored and content stays correct", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/capital");
  await expect(page.getByTestId("deployment-score")).toHaveText(DEMO.deploymentPct);
  // The bar carries the engine's full-precision score while the headline
  // rounds it, so compare numerically rather than by formatted string.
  const width = await page
    .getByTestId("gauge-fill")
    .evaluate((el) => (el as HTMLElement).style.width);
  expect(Number.parseFloat(width)).toBeCloseTo(DEMO.deploymentScore, 3);
});

test("rating meaning is carried by text, not color alone", async ({ page }) => {
  await page.goto("/markets");
  // Every rating pill contains its rating as text.
  const pills = page.locator("span", { hasText: /^(Strong Buy|Buy|Accumulate|Hold|Reduce|Sell|Avoid)$/ });
  expect(await pills.count()).toBeGreaterThan(0);
  // Radar severities include an sr-only text label.
  await page.goto("/capital");
  await expect(page.locator(".sr-only", { hasText: /Positive change/ }).first()).toBeAttached();
});

test("PWA metadata is present and the manifest resolves", async ({ page, request }) => {
  await page.goto("/capital");
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .first()
    .getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const response = await request.get(manifestHref!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBe("NeoOS CIO");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  const themeColor = await page.locator('meta[name="theme-color"]').first().getAttribute("content");
  expect(themeColor).toBe("#050607");
});
