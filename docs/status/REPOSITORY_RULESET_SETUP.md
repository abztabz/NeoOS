# Repository Ruleset Setup

These settings must be enabled in GitHub after the bootstrap pull request is merged. This document prepares the configuration but does not claim it is active.

## Protect `main`

Require a pull request, at least one approving review, CODEOWNERS review, dismissal of stale approvals, resolution of conversations, required status checks (`markdown`, `governance`, `external-links`, `docs-build`), an up-to-date branch, no force pushes, no deletion, and no direct pushes except documented emergency authority.

## Verification

After configuration, open a test pull request and confirm an attempted direct push or unreviewed merge is blocked. Store the evidence.
