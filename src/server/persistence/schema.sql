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

-- Belt and braces on the append-only rule. The application never issues these
-- statements; revoking them means a future mistake fails loudly at the database
-- rather than quietly rewriting history.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user) THEN
    EXECUTE format('REVOKE UPDATE, DELETE ON reports         FROM %I', current_user);
    EXECUTE format('REVOKE UPDATE, DELETE ON journal_entries FROM %I', current_user);
    EXECUTE format('REVOKE UPDATE, DELETE ON decisions       FROM %I', current_user);
    EXECUTE format('REVOKE UPDATE, DELETE ON outcomes        FROM %I', current_user);
  END IF;
EXCEPTION
  -- A managed database may not permit a role to revoke from itself. The
  -- application-level guarantee still holds; note it rather than fail startup.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not revoke UPDATE/DELETE; append-only is enforced in application code only.';
END $$;
