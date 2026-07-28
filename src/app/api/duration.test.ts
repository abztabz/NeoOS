import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A route that runs the schema migration needs a duration allowance.
 *
 * Without one it inherits the platform default, and exceeding that default is
 * the worst failure mode available: the function is killed before it can
 * respond, so every piece of honest error handling inside it is bypassed and
 * the browser reports only "load failed". The fault is in the deployment
 * configuration and the symptom points nowhere near it.
 *
 * This walks the route tree rather than listing files, so a new migrating route
 * is caught the day it is added rather than the day it times out.
 */

const API_ROOT = join(process.cwd(), "src/app/api");

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (entry === "route.ts") found.push(full);
  }
  return found;
}

describe("serverless duration allowances", () => {
  const routes = routeFiles(API_ROOT).map((file) => ({
    file: file.replace(process.cwd() + "/", ""),
    source: readFileSync(file, "utf8"),
  }));

  it("finds the route tree", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  for (const route of routes) {
    const migrates = /\bmigrate\(\)/.test(route.source);
    if (!migrates) continue;
    it(`${route.file} declares maxDuration because it migrates`, () => {
      expect(route.source).toMatch(/export const maxDuration = \d+/);
    });
  }

  it("keeps the long-running cycle routes generous", () => {
    for (const name of ["cycle/run", "cron/daily"]) {
      const route = routes.find((r) => r.file.includes(name));
      expect(route, name).toBeDefined();
      expect(route!.source).toMatch(/export const maxDuration = 120/);
    }
  });
});
