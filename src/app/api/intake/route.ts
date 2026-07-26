import { randomUUID } from "node:crypto";
import { intakeProfileSchema, INTAKE_SCHEMA_VERSION, type IntakeProfile } from "@/domain/intake/types";
import { SOLE_SUBJECT_ID } from "@/domain/intake/subject";
import { calculateProfile } from "@/domain/profile/calculations";
import { assessPersonalisation } from "@/domain/profile/personalisation";
import { computePositionTrends } from "@/domain/trends/position-history";
import { authorizeOperator, denied, rateLimit } from "@/server/api/auth";
import { getIntakeStore } from "@/server/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The subject's declared position.
 *
 * Authenticated with the operator token, like every other write. This is the
 * most sensitive data in the system — it is the household's entire financial
 * position — so it is not readable without the token either.
 *
 * The client never supplies `profileId`, `recordedAt` or `supersedes`. Those are
 * assigned here from the server's clock and the store's current state, because a
 * client that could set them could rewrite the order of history, and the order is
 * the whole basis of drift detection.
 */
const submissionSchema = intakeProfileSchema.omit({
  schemaVersion: true,
  subjectId: true,
  profileId: true,
  recordedAt: true,
  supersedes: true,
});

export async function GET(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  const store = getIntakeStore();
  // Every route migrates. The schema is created on first use and the call is
  // idempotent, so a cold start against a fresh database works rather than
  // failing with an undefined table.
  await store.migrate();
  const profile = await store.getCurrentProfile(SOLE_SUBJECT_ID);
  const history = await store.listProfileHistory(SOLE_SUBJECT_ID, 50);

  if (profile === null) {
    return Response.json(
      {
        profile: null,
        schemaVersion: INTAKE_SCHEMA_VERSION,
        history,
        // Stated rather than implied by an empty body. Nothing declared and
        // nothing owned are different things.
        personalisation: assessPersonalisation(emptyForAssessment()),
        calculations: null,
        trends: computePositionTrends([]),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const calculations = calculateProfile(profile);
  const stored = await Promise.all(
    history.map(async (h) => store.getProfile(SOLE_SUBJECT_ID, h.profileId)),
  );

  return Response.json(
    {
      profile,
      schemaVersion: INTAKE_SCHEMA_VERSION,
      history,
      calculations,
      personalisation: assessPersonalisation(profile, calculations),
      trends: computePositionTrends(stored.filter((p): p is IntakeProfile => p !== null)),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  const limit = rateLimit("intake:write", 120, 60 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json({ error: "Too many saves this hour." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json(
      {
        error: `Profile is invalid — ${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"}.`,
        issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  const store = getIntakeStore();
  await store.migrate();
  const current = await store.getCurrentProfile(SOLE_SUBJECT_ID);

  const profile: IntakeProfile = {
    schemaVersion: INTAKE_SCHEMA_VERSION,
    subjectId: SOLE_SUBJECT_ID,
    profileId: `profile-${randomUUID()}`,
    recordedAt: new Date().toISOString(),
    // A save is always a new version. Nothing is edited in place, so the figure
    // being replaced stays readable and the change is visible as a change.
    supersedes: current?.profileId ?? null,
    ...parsed.data,
  };

  const result = await store.saveProfile(profile);
  if (!result.stored) {
    return Response.json({ error: result.reason }, { status: 409 });
  }

  const calculations = calculateProfile(profile);
  return Response.json(
    {
      saved: true,
      profileId: profile.profileId,
      supersedes: profile.supersedes,
      calculations,
      personalisation: assessPersonalisation(profile, calculations),
    },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

/** An empty profile purely for reporting what is missing before anything exists. */
function emptyForAssessment(): IntakeProfile {
  return intakeProfileSchema.parse({
    schemaVersion: INTAKE_SCHEMA_VERSION,
    subjectId: SOLE_SUBJECT_ID,
    profileId: "none",
    recordedAt: new Date().toISOString(),
    supersedes: null,
    incomeSources: [],
    assets: [],
    liabilities: [],
    commitments: [],
    futureObligations: [],
    household: {
      dependents: [],
      monthlyObligations: null,
      succession: { structure: "unknown", jurisdiction: null, reviewedRecently: null, knownTransferRisks: [], notes: null },
      continuityContactExists: null,
      notes: null,
    },
    objective: {
      reserveMonths: null,
      horizonYears: null,
      creationVersusPreservation: null,
      maxSingleAssetPercent: null,
      maxDrawdownTolerancePercent: null,
      baseCurrency: null,
      exchangeRatesToBase: {},
      excludedAssetKinds: [],
      restrictions: [],
      monthlyInvestable: null,
      minimumLiquidHolding: null,
      maxAssetKindPercent: null,
      maxCurrencyPercent: null,
      maxJurisdictionPercent: null,
      statedRiskCapacity: null,
      goals: [],
      notes: null,
    },
  });
}
