# Sprint 1 Acceptance Tests

## Rendering
- At 390×844, the page renders useful content before hydration.
- The gauge is visible and not clipped.
- There is no blank dark shell.
- There is no horizontal overflow.

## Navigation
- Every workspace tab changes content.
- Active workspace is visibly indicated.
- Bottom navigation respects iPhone safe area.

## Gauge
- Displays 0–100 correctly.
- Recommendation band changes consistently.
- Tap opens explanation.
- Explanation is keyboard accessible and closable.

## Import
- Valid v1 report updates all relevant screens.
- Invalid JSON shows a clear error.
- Invalid report does not destroy current state.
- Oversized file is rejected.
- Storage failure does not crash rendering.

## Accessibility
- Touch targets are at least 44px.
- Focus is visible.
- Reduced-motion preference is honored.
- Color is not the sole carrier of rating meaning.

## Quality gates
- Lint passes.
- Typecheck passes.
- Unit tests pass.
- E2E tests pass on desktop and mobile projects.
- Production build passes.
