# Journal append flow

Extends the Sprint 2 journal model (`DECISION_JOURNAL.md`) with the append flow.

## Append

The cycle produces a **draft** entry. It is not appended automatically: the user
confirms it. `appendJournalEntry` refuses to append an entry whose id already
exists — re-recording the same run must go through a correction.

## Corrections

`appendCorrection` builds a new entry from the original with changes applied,
sets `supersedes` to the original's id, and appends it. **The original is never
modified.** The Timeline shows superseded entries dimmed and labelled, so a
correction is visible as a correction rather than a silent rewrite.

## Integrity

Each entry carries an FNV-1a marker over its stable-stringified contents.
`verifyEntryIntegrity` recomputes it, and the Timeline flags any entry that
fails.

**This is tamper-evident, not tamper-proof.** FNV-1a is not cryptographic:
anyone who can edit an entry can recompute its marker. It defends against
accidental corruption and silent drift. Real tamper resistance needs a signing
key the editing party cannot reach — a server-side concern, and out of scope
here. The UI does not claim otherwise.

## Persistence and its limitation

Storage is browser-local, behind a `JournalStorage` port with `read` and
`write`. Swapping that port for a server-backed implementation is the whole
migration path; nothing else changes.

**The limitation is real and stated in the UI:** entries live in one browser.
Clearing site data loses them. When storage is unavailable the app says so and
keeps entries for the session only rather than failing.

Run history persists as a capped compact summary (50 entries) so the Timeline
survives a page load without storing whole cycle results.

## Rehydration

Journal, decisions, and run history are restored on mount, so a page load shows
the history that already exists rather than an empty Timeline.
