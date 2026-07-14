# Repository Import Manifest

## Canonical governance

- `docs/founder-charter/`
- `docs/constitution/`
- `docs/core-principles/`
- `docs/governance/`
- `docs/charters/`
- `docs/sops/`

## Execution and verification

- `docs/project-contracts/`
- `docs/verification/`
- `docs/policies/`
- `docs/standards/`
- `docs/templates/`

## Learning and history

- `docs/learning-records/`
- `docs/incidents/`
- `docs/decisions/`
- `docs/adrs/`
- `CHANGELOG.md`

## Enforcement preparation

- `.github/`
- `tests/governance/`
- `docs/status/IMPLEMENTATION_BACKLOG.md`

## Upload sequence

1. Upload all files to a new branch.
2. Open a governance bootstrap pull request.
3. Assign Human Authority as final approver.
4. Have Atlas review technical structure.
5. Have Morpheus review authority and status claims.
6. Merge only after review.
7. Mark the corpus **Persisted** after merge.
8. Do not mark it **Enforced** until CI/runtime checks exist.
