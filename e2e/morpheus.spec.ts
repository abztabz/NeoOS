import { expect, test } from "@playwright/test";

/**
 * The conversational-first acceptance tests.
 *
 * These run on desktop and on both iPhone viewports, because the requirement is
 * that the *hierarchy* changed on every surface rather than that a chat box was
 * added to one of them.
 */

test.describe("Morpheus is the opening experience", () => {
  test("home opens with a greeting and a conclusion, not a dashboard", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("morpheus-greeting")).toBeVisible();

    // The two answers, in order, with the posture first.
    const posture = page.getByTestId("briefing-posture");
    await expect(posture).toBeVisible();
    await expect(posture.getByTestId("answer-conclusion")).toBeVisible();
    await expect(page.getByTestId("briefing-risk")).toBeVisible();

    // The dashboard's opening furniture must not be here any more.
    await expect(page.getByRole("region", { name: "Key scores" })).toHaveCount(0);
    await expect(page.getByText("ACTION BOARD")).toHaveCount(0);
  });

  test("the conclusion is above the fold and reads as advice", async ({ page }) => {
    await page.goto("/");
    const conclusion = page.getByTestId("briefing-posture").getByTestId("answer-conclusion");
    const box = await conclusion.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    // The five-second test: the answer is visible without scrolling.
    expect(box!.y).toBeLessThan((viewport?.height ?? 800) * 0.8);

    const text = (await conclusion.textContent()) ?? "";
    for (const forbidden of ["personalisation", "blocking fields", "provenance", "null"]) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  test("the six workspaces are all still reachable", async ({ page }) => {
    await page.goto("/");
    for (const label of ["Capital", "Markets", "Portfolio", "Gold", "Cash", "Timeline"]) {
      await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
    }
  });

  test("the capital dashboard survives intact at its own route", async ({ page }) => {
    await page.goto("/capital");
    await expect(page.getByRole("region", { name: "Key scores" })).toBeVisible();
    await expect(page.getByText("ACTION BOARD")).toBeVisible();
  });
});

test.describe("asking questions", () => {
  test("a typed question produces an answer in the thread", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("composer-input").fill("is my reserve funded?");
    await page.getByTestId("composer-submit").click();

    const thread = page.getByTestId("conversation-thread");
    await expect(thread).toBeVisible();
    await expect(thread.getByTestId("thread-question")).toContainText("reserve");
    await expect(thread.getByTestId("morpheus-answer").first()).toBeVisible();
  });

  test("a suggested question can be asked with one tap", async ({ page }) => {
    await page.goto("/");
    const suggestion = page.getByTestId("suggested-questions").getByRole("button").first();
    await suggestion.click();
    await expect(page.getByTestId("conversation-thread")).toBeVisible();
  });

  test("an unrecognised question is refused honestly", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("composer-input").fill("what is the capital of France");
    await page.getByTestId("composer-submit").click();

    const answer = page.getByTestId("conversation-thread").getByTestId("morpheus-answer").first();
    await expect(answer).toHaveAttribute("data-intent", "unrecognised");
    await expect(answer).toContainText("don't have a way to answer");
  });
});

test.describe("evidence on demand", () => {
  test("evidence is hidden until asked for, then shows provenance", async ({ page }) => {
    await page.goto("/");
    const posture = page.getByTestId("briefing-posture");
    const toggle = posture.getByTestId("evidence-toggle");

    if ((await toggle.count()) === 0) test.skip(true, "This state carries no evidence to disclose.");

    await expect(posture.getByTestId("evidence-list")).toHaveCount(0);
    await toggle.click();
    await expect(posture.getByTestId("evidence-list")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("conversation survives navigation", () => {
  test("a question asked at home is still there after visiting a workspace", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("composer-input").fill("how much is truly deployable?");
    await page.getByTestId("composer-submit").click();
    await expect(page.getByTestId("conversation-thread")).toContainText("deployable");

    // Full navigations rather than client-side clicks: this is the stronger
    // version of the requirement, because it also proves the thread survives a
    // reload rather than merely surviving a route change inside one React tree.
    await page.goto("/gold");
    await expect(page.getByTestId("workspace-thread")).toBeVisible();

    await page.goto("/");
    await expect(page.getByTestId("conversation-thread")).toContainText("deployable");
  });

  test("each workspace carries its own conversational strip", async ({ page }) => {
    for (const path of ["/capital", "/markets", "/portfolio", "/gold", "/cash", "/timeline"]) {
      await page.goto(path);
      await expect(page.getByTestId("workspace-thread")).toBeVisible();
      await expect(page.getByTestId("workspace-thread").getByTestId("composer-input")).toBeVisible();
    }
  });

  test("a question asked in a workspace stays in that workspace's view", async ({ page }) => {
    await page.goto("/gold");
    const strip = page.getByTestId("workspace-thread");
    await strip.scrollIntoViewIfNeeded();
    await strip.getByTestId("composer-input").fill("should I reduce gold?");
    await strip.getByTestId("composer-submit").click();
    await expect(strip.getByTestId("thread-question")).toContainText("gold");

    await page.goto("/cash");
    // The Cash workspace must not replay the Gold conversation.
    await expect(page.getByTestId("workspace-thread").getByTestId("thread-question")).toHaveCount(0);
  });
});

test.describe("one question at a time", () => {
  test("the gap prompt shows a single question, never a checklist", async ({ page }) => {
    await page.goto("/");
    const prompt = page.getByTestId("gap-prompt");
    if ((await prompt.count()) === 0) {
      test.skip(true, "No position loaded in this run, so there are no gaps to ask about.");
    }
    await expect(prompt.getByTestId("gap-question")).toHaveCount(1);
    await expect(prompt.getByTestId("gap-skip")).toBeVisible();
  });
});

test.describe("guided intake", () => {
  test("offers a conversational route and asks one question at a time", async ({ page }) => {
    await page.goto("/intake");
    const start = page.getByTestId("start-guided");
    if ((await start.count()) === 0) {
      test.skip(true, "Intake is locked behind the operator token in this run.");
    }
    await start.click();

    await expect(page.getByTestId("guided-question")).toHaveCount(1);
    await expect(page.getByTestId("guided-unknown")).toBeVisible();
    await expect(page.getByTestId("switch-to-form")).toBeVisible();
  });
});

test.describe("layout", () => {
  for (const width of [320, 390, 430]) {
    test(`no horizontal overflow on the Morpheus home at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }

  test("the composer is reachable and labelled for screen readers", async ({ page }) => {
    await page.goto("/");
    const input = page.getByTestId("composer-input");
    await expect(input).toHaveAccessibleName(/ask morpheus/i);
    const box = await input.boundingBox();
    // Touch target minimum.
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
