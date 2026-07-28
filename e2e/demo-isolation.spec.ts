import { expect, test } from "@playwright/test";

/**
 * The boundary between the worked example and somebody's money, held from the
 * outside.
 *
 * These are the tests that would have caught the original failure: a household
 * that had declared its entire net worth was shown Apple and an S&P tracker
 * under "PORTFOLIO", separated from its own holdings by a badge in the corner.
 */

const WORKSPACES = ["/capital", "/markets", "/portfolio", "/gold", "/cash", "/timeline"];

/** Instruments in the fixture universe. None of them is owned by anybody real. */
const FIXTURE_INSTRUMENTS = [/apple/i, /S&P 500/i];

test.describe("before anything is declared", () => {
  test("the home screen offers a choice instead of opening with a fixture", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("first-run")).toBeVisible();
    await expect(page.getByTestId("create-portfolio")).toBeVisible();
    await expect(page.getByTestId("explore-demo")).toBeVisible();
    // Critically: no briefing about a household that does not exist.
    await expect(page.getByTestId("briefing-posture")).toHaveCount(0);
  });

  test("no fixture instrument appears on the first screen", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerText();
    for (const instrument of FIXTURE_INSTRUMENTS) {
      expect(body).not.toMatch(instrument);
    }
  });

  test("the worked example is reachable and says what it is", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("explore-demo").click();
    await expect(page.getByTestId("briefing-posture")).toBeVisible();
  });

  test("choosing the worked example survives a reload of the same session", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("explore-demo").click();
    await expect(page.getByTestId("briefing-posture")).toBeVisible();
    await page.reload();
    // Not thrown back to the choice screen mid-exploration.
    await expect(page.getByTestId("briefing-posture")).toBeVisible();
  });
});

test.describe("the demo is always labelled while it is showing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("explore-demo").click();
  });

  for (const route of WORKSPACES) {
    test(`${route} carries the data-state badge`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId("mode-badge").first()).toBeVisible();
    });
  }

  test("the badge names the demo state explicitly", async ({ page }) => {
    await page.goto("/capital");
    await expect(page.getByTestId("mode-badge")).toContainText(/demo/i);
  });
});

test.describe("prices never appear without a source", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("explore-demo").click();
  });

  test("every opportunity card either names a source or says the price is unavailable", async ({
    page,
  }) => {
    await page.goto("/capital");
    const cards = page.getByTestId("opportunity-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await card.getByRole("button", { name: /show evidence/i }).click();
      const evidence = card.getByTestId("opportunity-evidence");
      const text = await evidence.innerText();
      // Either a real source name, or the honest absence of one. Never a price
      // attributed to nothing.
      expect(text).toMatch(/Price source/);
      if (/No verified source/.test(text)) {
        await expect(card.getByTestId("opportunity-suspended")).toBeVisible();
      }
    }
  });

  test("a suspended card shows no Good Buy decision to act on", async ({ page }) => {
    await page.goto("/capital");
    const suspended = page.getByTestId("opportunity-card").filter({
      has: page.getByTestId("opportunity-suspended"),
    });
    if ((await suspended.count()) === 0) test.skip();
    await expect(suspended.first().getByTestId("opportunity-decision")).toContainText(
      /insufficient evidence/i,
    );
  });

  test("the gold board shows a price with a source, or no price at all", async ({ page }) => {
    await page.goto("/gold");
    const board = page.locator("section", { hasText: "UAE GOLD PRICE" }).first();
    await expect(board).toBeVisible();

    const unavailable = board.getByTestId("gold-board-unavailable");
    if (await unavailable.isVisible().catch(() => false)) {
      // No provider configured in this environment. No number may be shown.
      await expect(board.getByTestId("gold-price-24K")).toHaveCount(0);
      await expect(board.getByTestId("gold-price-22K")).toHaveCount(0);
    } else {
      await expect(board.getByTestId("gold-price-24K")).toBeVisible();
      await expect(board.getByTestId("gold-price-22K")).toBeVisible();
      await expect(board).toContainText(/AED/);
    }
  });

  test("the gold reference always names what it excludes", async ({ page }) => {
    await page.goto("/gold");
    await expect(page.locator("section", { hasText: "UAE GOLD PRICE" }).first()).toContainText(
      /making charges/i,
    );
  });
});
