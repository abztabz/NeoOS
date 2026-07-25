# Decision journal design

## Purpose

A recommendation must never be rewritten after the fact. The journal is the
record of what NeoOS actually said on a given day, so a later review can ask
whether the decision was reasonable **with the evidence available at the time**
rather than with hindsight.

## Structure

Entries are append-only. Each carries:

- `entryId` and `recommendationId` — stable identifiers
- `timestamp` — when the report was generated
- `reportHash` — FNV-1a over the recommendations, posture, and evidence ids
- `summary`, `deploymentScore`, `recommendation` — what was decided
- `engineVersion`, `modelVersion` — how it was computed
- `userDecision`, `executionDetails`, `outcome`, `reviewNotes` — filled in later
- `supersedes` — set when this entry corrects an earlier one
- `integrityHash` — FNV-1a over the entry's own stable-stringified contents

## Immutability rules

1. **Entries are never edited.** A correction creates a new entry whose
   `supersedes` points at the entry it replaces. Both remain in the record.
2. **History carries forward unchanged.** Each report's timeline includes every
   prior entry verbatim, plus today's. Asserted by test.
3. **Engine version changes are recorded, not hidden.** When the engine version
   differs from the previous report, the change log says so and notes that
   scores are not directly comparable across versions.

## Integrity marker

`integrityHash` is FNV-1a over the entry's contents with keys sorted, so the
hash does not depend on key order. Recomputing it detects any after-the-fact
edit.

This is **tamper-evident, not tamper-proof**. FNV-1a is not a cryptographic
hash: anyone who can edit an entry can also recompute its hash. It defends
against accidental corruption and silent drift, which is what a local-first
application can honestly claim. Tamper-*proof* history needs a signing key held
somewhere the editing party cannot reach, which is a server-side concern and out
of scope for a client-only application.

## What the Timeline workspace shows

Score changes, rating changes, deployment posture changes, evidence changes,
model version changes, user decisions where known, invalidated theses, and later
outcomes — each entry showing its engine version and the leading bytes of its
integrity hash.

## Current limitations

- Outcome fields (`userDecision`, `executionDetails`, `outcome`) are modelled
  and rendered but there is no UI yet for a user to record a decision. The
  fields are populated from imported reports only.
- The journal lives inside the report rather than in a separate append-only
  store, so it is only as durable as the report file. A dedicated store is
  Sprint 3 scope.
