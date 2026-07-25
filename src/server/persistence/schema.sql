-- NeoOS CIO durable storage.
--
-- Design rule: every table here is append-only. There is no UPDATE and no
-- DELETE anywhere in the application's SQL, and the revoke statements at the
-- bottom are there so that stays true even if someone later writes one by
-- accident. A decision journal that can be edited after the fact records
-- nothing but the editor's current opinion.
--
-- Corrections are made by appending a new row that names the row it supersedes.
-- The original stays visible and is labelled superseded, so the record shows
-- that a correction happened rather than hiding it.

CREATE TABLE IF NOT EXISTS reports (
  report_id          TEXT PRIMARY KEY,
  run_id             TEXT        NOT NULL,
  generated_at       TIMESTAMPTZ NOT NULL,
  evidence_cutoff    TIMESTAMPTZ NOT NULL,
  live_state         TEXT        NOT NULL,
  execution_context  TEXT        NOT NULL,
  prior_report_id    TEXT        NULL REFERENCES reports (report_id),
  engine_version     TEXT        NOT NULL,
  pipeline_version   TEXT        NOT NULL,
  -- The signed content, verbatim. Verification re-canonicalises from this, so
  -- any edit to the JSON invalidates the signature rather than going unnoticed.
  content            JSONB       NOT NULL,
  signature          JSONB       NULL,
  content_hash       TEXT        NULL,
  signing_key_id     TEXT        NULL,
  stored_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_generated_at_idx ON reports (generated_at DESC);
CREATE INDEX IF NOT EXISTS reports_live_state_idx  ON reports (live_state);

CREATE TABLE IF NOT EXISTS journal_entries (
  entry_id       TEXT PRIMARY KEY,
  report_id      TEXT        NULL REFERENCES reports (report_id),
  recorded_at    TIMESTAMPTZ NOT NULL,
  kind           TEXT        NOT NULL,
  summary        TEXT        NOT NULL,
  payload        JSONB       NOT NULL,
  supersedes     TEXT        NULL REFERENCES journal_entries (entry_id),
  integrity_hash TEXT        NOT NULL,
  stored_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_recorded_at_idx ON journal_entries (recorded_at DESC);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id TEXT PRIMARY KEY,
  report_id   TEXT        NULL REFERENCES reports (report_id),
  asset_id    TEXT        NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  kind        TEXT        NOT NULL,
  payload     JSONB       NOT NULL,
  stored_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decisions_recorded_at_idx ON decisions (recorded_at DESC);

-- Outcome review. A decision journal that is never revisited repeats mistakes
-- with excellent documentation, so the outcome is a first-class row rather
-- than a field appended to the decision.
CREATE TABLE IF NOT EXISTS outcomes (
  outcome_id  TEXT PRIMARY KEY,
  decision_id TEXT        NOT NULL REFERENCES decisions (decision_id),
  reviewed_at TIMESTAMPTZ NOT NULL,
  payload     JSONB       NOT NULL,
  stored_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outcomes_decision_idx ON outcomes (decision_id);

-- The subject's declared financial position.
--
-- Append-only for the same reason as the journal, and with more at stake. A
-- correction to a position is itself information: a property revalued down, an
-- income source that ended, a dependent added. A table that permitted UPDATE
-- would destroy exactly the history that makes drift visible.
--
-- Every row carries subject_id from this first migration even though there is
-- one subject today. Adding tenancy later to a single-tenant table means
-- rewriting every query and backfilling every row; carrying an unused column is
-- free.
CREATE TABLE IF NOT EXISTS intake_profiles (
  profile_id     TEXT PRIMARY KEY,
  subject_id     TEXT        NOT NULL,
  schema_version TEXT        NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL,
  -- The profile version this one replaces. The replaced row stays and is
  -- reported as superseded, so a correction is visible as a correction.
  supersedes     TEXT        NULL REFERENCES intake_profiles (profile_id),
  -- The full profile, verbatim. Read back through the Zod schema, because
  -- storage is not inside the trust boundary.
  content        JSONB       NOT NULL,
  -- Detects an edit made outside the application. Not a signature: the subject
  -- is the author here, so there is no third party to prove anything to.
  integrity_hash TEXT        NOT NULL,
  stored_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_profiles_subject_idx
  ON intake_profiles (subject_id, recorded_at DESC);
-- One profile may only be superseded once. Two corrections claiming to replace
-- the same version would make "current" ambiguous, and an ambiguous current
-- position is worse than a stale one.
CREATE UNIQUE INDEX IF NOT EXISTS intake_profiles_supersedes_idx
  ON intake_profiles (supersedes) WHERE supersedes IS NOT NULL;

-- Append-only enforcement at the database.
--
-- This was originally REVOKE UPDATE, DELETE. That was wrong, and the way it was
-- wrong is worth recording, because it only appears under the configuration the
-- documentation recommends.
--
-- PostgreSQL enforces a foreign key by taking a row lock on the referenced row:
--
--   SELECT 1 FROM ONLY "reports" x WHERE report_id = $1 FOR KEY SHARE OF x
--
-- and `FOR KEY SHARE` requires SELECT *plus* one of UPDATE, DELETE or TRUNCATE.
-- Revoking UPDATE and DELETE therefore made every insert carrying a foreign key
-- fail with "permission denied for table reports" — report lineage, journal
-- corrections, decisions, outcomes, and profile corrections all of them — for
-- exactly the dedicated non-superuser role production is meant to use. A
-- superuser connection masked it completely, which is why it survived a sprint.
--
-- Triggers are better on both counts. They leave the privileges that foreign
-- keys depend on intact, and unlike a REVOKE they also stop a superuser, who
-- bypasses privilege checks entirely.
--
-- Still a guardrail, not a wall: anyone who can ALTER TABLE can disable the
-- trigger. It stops accidents, careless queries, and a future mistake in this
-- codebase. It does not stop a determined operator, and nothing in a database
-- the operator controls could.

CREATE OR REPLACE FUNCTION neoos_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'NeoOS storage is append-only: % is not permitted on %. Record a correction that supersedes the original instead.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['reports','journal_entries','decisions','outcomes','intake_profiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_append_only', t);
    -- FOR EACH STATEMENT, not FOR EACH ROW: a row-level trigger never fires when
    -- the statement matches nothing, so `DELETE FROM reports` against an empty
    -- table would report success and teach the operator the wrong lesson about
    -- what this database permits.
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION neoos_append_only()',
      t || '_append_only', t);
  END LOOP;
END $$;

-- Undo the privilege revoke if an earlier version of this schema applied it.
-- Without this, a database migrated before the fix keeps failing every
-- foreign-key insert, and the failure looks like an application bug.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user) THEN
    EXECUTE format(
      'GRANT UPDATE, DELETE ON reports, journal_entries, decisions, outcomes, intake_profiles TO %I',
      current_user);
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not restore UPDATE/DELETE grants; foreign-key inserts may fail for this role.';
END $$;
