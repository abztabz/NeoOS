# Persistence and signing

Sprint 3's journal lived in browser storage and was tamper-**evident**: an edit
could be detected by anyone who checked, but the person best placed to edit it
was also the person who held it.

Sprint 4 makes it **tamper-resistant and cryptographically verifiable**. Those
are different claims from tamper-proof, and only the first two are true.

---

## 1. What signing actually buys

**It buys:** anyone holding the public key can confirm a report's content is
byte-identical to what the server produced, and that it was produced by a holder
of the private key. Editing a number in the database invalidates the signature,
and the signature cannot be regenerated without a key that lives only in the
server's environment.

**It does not buy:** protection against a party who holds the private key signing
a false report, or against anyone deleting a report outright.

This is why the journal is never described as tamper-proof. Stating the weaker,
true claim is worth more than the stronger, false one — a user who believes the
record is unforgeable will not check it.

---

## 2. Ed25519

Chosen over RSA and ECDSA because it is deterministic (no nonce that can leak a
key when a random number generator misbehaves), has small keys and signatures,
and is native in Node with no dependency.

The **key id is derived from the public key**, not assigned. A mislabelled key
would make rotation unauditable, and derivation makes disagreement impossible.

Key generation is in [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 3. What is signed

The `content` block of the v4.0 envelope, canonicalised with sorted keys so two
structurally identical reports sign identically regardless of how their objects
were built.

Deliberately **excluded**: the signature block itself, and every operational
field — verification status, storage timestamps. Verification therefore never
depends on how a report was stored, transported, or displayed, and re-checking a
report cannot invalidate it.

---

## 4. Verification outcomes

Reported separately because they mean different things:

| Status | Meaning |
|---|---|
| `verified` | Content intact, signature valid, key trusted |
| `content_modified` | The bytes changed after signing — someone edited a stored report |
| `signature_invalid` | Bytes intact, signature does not correspond — forged or corrupted |
| `key_unknown` | Signed with a key this build does not trust. May be genuine; cannot be confirmed |
| `unsigned` | No signature. Normal for a client-side run |
| `not_checked` | Not yet verified |

Collapsing `content_modified` and `signature_invalid` into "invalid" would discard
the more useful half of the finding: one points at a database edit, the other at a
forgery.

**Verification runs on read**, not once at write time. Storage sits outside the
trust boundary — that is the entire reason for signing — so a status computed
before a row was written proves nothing about the row now.

A report that fails verification is still returned, with the failure attached.
Withholding it would hide evidence of tampering from the only person able to act
on it. The UI's job is to refuse to render the numbers as trustworthy, which it
does.

---

## 5. Append-only storage

`src/server/persistence/schema.sql`. Four tables: reports, journal entries,
decisions, outcomes.

Every method on the storage port is append or read. **There is no update and no
delete anywhere in the application's SQL**, and the schema revokes both from the
application role — so a future mistake fails at the database rather than quietly
rewriting history.

### How far that revoke actually goes

Tested against PostgreSQL 16 rather than assumed, because the answer is not the
obvious one:

| Connecting role | UPDATE / DELETE | INSERT |
|---|---|---|
| Non-superuser, not the owner | **Denied** | Works |
| Non-superuser, **owns the tables** | **Denied** | Works |
| **Superuser** | **Allowed — bypasses the revoke entirely** | Works |

Two consequences worth stating plainly:

**Connect as a non-superuser in production.** A superuser connection makes these
statements decorative. If your managed provider hands you a superuser-equivalent
role by default, the database-level guarantee is not in force and only the
application-level one is — which is real, but is one refactor away from being
untrue.

**It is a guardrail, not a wall.** A table owner can `GRANT` the privileges back
to itself. This stops accidents, casual edits, and a future mistake in the query
layer. It does not stop a determined operator with database credentials, and it
was never going to.

Corrections append a new row naming the row it supersedes. The original stays
visible and is labelled superseded. The record shows that a correction happened
rather than hiding it.

Writing an existing report id is a **no-op, not an error**: a scheduled job
retried after a timeout should not fail on its own earlier success. Report ids are
content-addressed, so two runs producing identical output collide deliberately —
a re-run that changed nothing should not create a second artefact claiming to be
new information.

Rows are re-validated on read. A report from the database is untrusted input, not
something the application knows it put there.

---

## 6. Without a database

`MemoryReportStore` keeps the application working and reports `durable: false`.
The UI shows that.

Telling someone their decision journal is safe when it lives in a serverless
function's memory would be worse than having no journal — they would stop keeping
their own record. On Vercel, memory survives roughly as long as one warm
instance: unpredictably, and not long.
