import { test as base, type Page } from "@playwright/test";

/**
 * The worked-example fixture.
 *
 * NeoOS no longer opens with fixture holdings. With nothing declared and the
 * demo unopened, `/` renders the first-run choice, and no fixture instrument
 * appears anywhere. That is the product requirement, and it means every spec
 * written against the demo universe now has to ask for it explicitly.
 *
 * Asking explicitly is the point: the old behaviour was that every test — and
 * every user — got somebody else's portfolio by default.
 *
 * Seeded through an init script rather than by clicking, so it applies to the
 * very first render and to specs that never visit `/`.
 * `e2e/demo-isolation.spec.ts` deliberately imports the plain Playwright `test`
 * instead, because its whole subject is what happens before this choice.
 */
export async function openWorkedExample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem("neoos.exploring-demo", "1");
    } catch {
      // Storage blocked in this context. A spec that needs the demo under
      // blocked storage has to click through the first-run screen instead.
    }
  });
}

/** `test`, with the worked example already open. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const test = base.extend<{}>({
  // `run` rather than the conventional `use`: a parameter named `use` reads as
  // a React hook to the shared lint config.
  page: async ({ page }, run) => {
    await openWorkedExample(page);
    await run(page);
  },
});

export { expect, type Page, type Locator } from "@playwright/test";
