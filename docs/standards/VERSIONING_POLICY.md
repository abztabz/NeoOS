# NeoOS Versioning Policy

NeoOS uses Semantic Versioning: `MAJOR.MINOR.PATCH`.

## Repository releases

- MAJOR: incompatible constitutional, governance, API, or data-model change.
- MINOR: backward-compatible capability, governance, or validation addition.
- PATCH: backward-compatible correction, clarification, or defect fix.

Pre-release identifiers may be used, such as `1.0.0-alpha.1`, `1.0.0-beta.1`, and `1.0.0-rc.1`.

## Individual documents

Major governance documents maintain their own versions. A document update does not automatically create a repository release.

## GDRs

The GDR identifier is immutable. Accepted historical reasoning must not be silently rewritten; material changes require a superseding GDR.

## Release requirements

A release requires a changelog entry, reviewed version changes, passing required checks, release notes, no known authority conflict, and evidence-calibrated status.
