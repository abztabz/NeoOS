import { readFileSync } from "node:fs";
import { INTAKE_SCHEMA_VERSION, intakeProfileSchema } from "@/domain/intake/types";
import { activatedJurisdictions } from "@/domain/jurisdiction/packs";
import { calculateProfile } from "@/domain/profile/calculations";
import { assessPersonalisation } from "@/domain/profile/personalisation";
import { detectStructuralConditions } from "@/domain/trends/position-history";

/**
 * Check a filled intake file locally, before it is sent anywhere.
 *
 * Runs the same schema and the same calculations the server runs, so what you
 * see here is what the server will produce. Nothing leaves the machine and
 * nothing is stored — this is a dry run, not a submission.
 *
 * Run: npx tsx scripts/intake-check.ts intake-template.json
 */

const path = process.argv[2];
if (!path) {
  console.error("Usage: npx tsx scripts/intake-check.ts <file.json>");
  process.exit(1);
}

const parsed = intakeProfileSchema.safeParse({
  schemaVersion: INTAKE_SCHEMA_VERSION,
  subjectId: "subject-operator",
  profileId: "local-check",
  recordedAt: new Date().toISOString(),
  supersedes: null,
  ...(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>),
});

if (!parsed.success) {
  console.error(`\n${path} is not valid. The server would reject it.\n`);
  for (const issue of parsed.error.issues.slice(0, 25)) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

const profile = parsed.data;
const calculations = calculateProfile(profile);
const personalisation = assessPersonalisation(profile, calculations);

const money = (totals: Record<string, number> | null) =>
  totals === null || Object.keys(totals).length === 0
    ? "—"
    : Object.entries(totals)
        .map(([c, v]) => `${Math.round(v).toLocaleString()} ${c}`)
        .join(" · ");

console.log(`\n${path} is valid. Nothing has been sent or stored.\n`);
console.log(`Personal guidance : ${personalisation.state.toUpperCase()}`);
console.log(`Completeness      : ${personalisation.completeness.completeness}%`);
console.log(`\n${personalisation.meaning}\n`);

console.log("Calculated ------------------------------------------------------");
for (const [name, value] of Object.entries(calculations)) {
  const state =
    value.value === null
      ? `not known — needs ${value.missing.slice(0, 2).join(", ") || "more inputs"}`
      : value.provenance;
  console.log(`  ${name.padEnd(20)} ${state}`);
}

console.log("\nHeadline --------------------------------------------------------");
console.log(`  Net worth        ${money(calculations.netWorth.value)}`);
console.log(`  Liquid net worth ${money(calculations.liquidNetWorth.value)}`);
const flow = calculations.monthlyCashFlow.value;
console.log(`  Monthly net flow ${money(flow?.net ?? null)}`);
const deployment = calculations.deploymentStatus.value;
if (deployment) {
  console.log(`  Deployment       ${deployment.status} — ${deployment.headline}`);
  for (const reason of deployment.reasons) console.log(`                   · ${reason}`);
}

const structural = detectStructuralConditions(profile);
if (structural.length > 0) {
  console.log("\nStanding risks, from this position alone -------------------------");
  for (const condition of structural) console.log(`  · ${condition.label}`);
}

const jurisdictions = activatedJurisdictions(profile);
if (jurisdictions.length > 0) {
  console.log("\nJurisdictions this position touches ------------------------------");
  for (const entry of jurisdictions) console.log(`  · ${entry.why}`);
}

if (personalisation.nextInputs.length > 0) {
  console.log("\nMost useful things to add next -----------------------------------");
  for (const input of personalisation.nextInputs.slice(0, 8)) console.log(`  · ${input}`);
}
console.log();
