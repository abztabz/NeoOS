import { writeFileSync } from "node:fs";
import { emptySubmission } from "@/domain/intake/submission";
import { INTAKE_SCHEMA_VERSION, intakeProfileSchema } from "@/domain/intake/types";
import { calculateProfile } from "@/domain/profile/calculations";
import { assessPersonalisation } from "@/domain/profile/personalisation";

/**
 * Emit a blank intake template and a set of copyable row examples.
 *
 * Two things this guarantees, and both matter.
 *
 * **The template validates.** It is generated from the same schema the API
 * enforces, so a filled copy cannot fail for a reason the operator could not
 * have known about. A template that drifts from its schema is worse than none.
 *
 * **Nothing is invented.** Every amount is null and every label is empty. The
 * example rows are separated into their own file and are transparently fictional
 * so they cannot be mistaken for the operator's own figures — inventing a
 * plausible number is the one thing this whole system exists not to do.
 *
 * Run: npx tsx scripts/intake-template.ts
 */

const OUT_TEMPLATE = "intake-template.json";
const OUT_EXAMPLES = "intake-row-examples.json";

const template = emptySubmission();

/** Fictional rows, clearly labelled, to be copied and edited — never submitted as-is. */
const examples = {
  _README:
    "Copy a row into the matching array in intake-template.json and replace every value. These are fictional and must not be submitted unchanged.",
  incomeSource: {
    incomeId: "income-1",
    subjectId: "ignored-server-assigns",
    kind: "salary",
    label: "REPLACE — what you call it",
    gross: { amount: null, currency: "AED", basis: "statement_balance", asOf: "2026-07-26", note: null },
    frequency: "monthly",
    stability: "stable",
    producedByAssetId: null,
    dependsOnSubjectWorking: "yes",
    jurisdiction: "AE",
    expectedUntil: null,
    notes: null,
  },
  asset: {
    assetHoldingId: "asset-1",
    subjectId: "ignored-server-assigns",
    kind: "cash",
    label: "REPLACE — what you call it",
    value: { amount: null, currency: "AED", basis: "statement_balance", asOf: "2026-07-26", note: null },
    registryAssetId: null,
    identifier: null,
    quantity: null,
    liquidity: "immediate",
    jurisdiction: "AE",
    custodian: null,
    encumberedBy: null,
    restricted: false,
    notes: null,
  },
  liability: {
    liabilityId: "liability-1",
    subjectId: "ignored-server-assigns",
    kind: "mortgage",
    label: "REPLACE",
    outstanding: { amount: null, currency: "AED", basis: "statement_balance", asOf: "2026-07-26", note: null },
    paymentAmount: null,
    paymentFrequency: "monthly",
    interestRatePercent: null,
    securedAgainstAssetId: null,
    maturityDate: null,
    notes: null,
  },
  commitment: {
    commitmentId: "commitment-1",
    subjectId: "ignored-server-assigns",
    kind: "life_insurance",
    label: "REPLACE",
    premium: { amount: null, currency: "AED", basis: "statement_balance", asOf: "2026-07-26", note: null },
    premiumFrequency: "monthly",
    coverAmount: null,
    beneficiary: null,
    endsOn: null,
    cancellable: null,
    jurisdiction: "AE",
    notes: null,
  },
  futureObligation: {
    obligationId: "obligation-1",
    subjectId: "ignored-server-assigns",
    kind: "education",
    label: "REPLACE",
    amount: { amount: null, currency: "AED", basis: "subject_estimate", asOf: "2026-07-26", note: null },
    dueYear: null,
    certainty: "likely",
    fundedByAssetId: null,
    notes: null,
  },
  dependent: {
    dependentId: "dependent-1",
    relationship: "spouse",
    label: "REPLACE — any label, a real name is never required",
    birthYear: null,
    financiallySupported: true,
    supportExpectedUntilYear: null,
    supportIsIndefinite: false,
    anticipatedObligation: null,
    notes: null,
  },
  jurisdictionConstraint: {
    jurisdiction: "NP",
    outboundCapitalMobility: "restricted",
    statedAt: "2026-07-26",
    verifiedWithProfessional: false,
    notes: "Your understanding, not verified. Recorded as provisional.",
  },
};

// Prove the template validates against the schema the API enforces, using the
// same server-assigned fields the route would add.
const asProfile = intakeProfileSchema.parse({
  schemaVersion: INTAKE_SCHEMA_VERSION,
  subjectId: "subject-operator",
  profileId: "template-check",
  recordedAt: new Date().toISOString(),
  supersedes: null,
  ...template,
});

writeFileSync(OUT_TEMPLATE, `${JSON.stringify(template, null, 2)}\n`);
writeFileSync(OUT_EXAMPLES, `${JSON.stringify(examples, null, 2)}\n`);

const personalisation = assessPersonalisation(asProfile, calculateProfile(asProfile));

console.log(`Wrote ${OUT_TEMPLATE} and ${OUT_EXAMPLES}`);
console.log(`Schema version: ${INTAKE_SCHEMA_VERSION}`);
console.log(`Template validates: yes`);
console.log(`\nEmpty template gives: ${personalisation.state}`);
console.log(`Most useful things to add first:`);
for (const input of personalisation.nextInputs.slice(0, 6)) console.log(`  · ${input}`);
