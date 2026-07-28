import { randomUUID } from "node:crypto";
import {
  emptyProfile,
  intakeProfileSchema,
  INTAKE_SCHEMA_VERSION,
  type IntakeProfile,
} from "@/domain/intake/types";
import { SOLE_SUBJECT_ID } from "@/domain/intake/subject";
import { calculateProfile } from "@/domain/profile/calculations";
import { assessPersonalisation } from "@/domain/profile/personalisation";
import { computePositionTrends } from "@/domain/trends/position-history";
import { authorizeOperator, denied, rateLimit } from "@/server/api/auth";
import { storageFailed, unhandled } from "@/server/api/storage-error";
import { getIntakeStore } from "@/server/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The schema migration runs here, on first use, against a cold database.
 *
 * That is why this route needs a duration allowance and the read-only ones do
 * not. Creating five tables, their indexes, a PL/pgSQL function, the
 * append-only triggers and the grants takes longer than a serverless
 * platform's default limit once a cold start and a TLS handshake are added in
 * front of it. Exceeding that limit is the worst kind of failure to debug: the
 * function is killed without producing a response at all, so the browser
 * reports a bare "load failed" and the honest error handling below never gets
 * to run.
 */
export const maxDuration = 60;

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
  let profile: IntakeProfile | null;
  let history: Awaited<ReturnType<typeof store.listProfileHistory>>;
  try {
    // Every route migrates. The schema is created on first use and the call is
    // idempotent, so a cold start against a fresh database works rather than
    // failing with an undefined table.
    await store.migrate();
    profile = await store.getCurrentProfile(SOLE_SUBJECT_ID);
    history = await store.listProfileHistory(SOLE_SUBJECT_ID, 50);
  } catch (error) {
    // The caller is the operator, and the operator is the only person who can
    // fix a database fault. A bare 500 tells them nothing they can act on.
    return storageFailed(error);
  }

  try {
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
        trends: computePositionTrends(
          stored.filter((p): p is IntakeProfile => p !== null),
        ),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // Reading the position is arithmetic over declared figures, so a throw here
    // is a defect. Naming it beats a platform-generated 500 with no body.
    return unhandled(error, "reading your position");
  }
}

export async function POST(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  const limit = rateLimit("intake:write", 120, 60 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many saves this hour." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON." },
      { status: 400 },
    );
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json(
      {
        error: `Profile is invalid — ${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"}.`,
        issues: parsed.error.issues
          .slice(0, 20)
          .map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  const store = getIntakeStore();
  let current: IntakeProfile | null;
  try {
    await store.migrate();
    current = await store.getCurrentProfile(SOLE_SUBJECT_ID);
  } catch (error) {
    return storageFailed(error);
  }

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

  let result: Awaited<ReturnType<typeof store.saveProfile>>;
  try {
    result = await store.saveProfile(profile);
  } catch (error) {
    return storageFailed(error);
  }
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

/**
 * An empty profile, purely for reporting what is missing before anything exists.
 *
 * Delegates to the canonical factory rather than rebuilding the shape here. The
 * hand-written duplicate this replaces omitted `jurisdictionContext` when the
 * schema gained it, so `parse()` threw on the one path that runs when nothing
 * has been stored yet — the first request every new deployment makes.
 */
function emptyForAssessment(): IntakeProfile {
  return emptyProfile(SOLE_SUBJECT_ID, "none", new Date().toISOString());
}
