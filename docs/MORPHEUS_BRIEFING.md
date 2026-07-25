# The Morpheus daily briefing

A structured answer to: what changed today, what should I do, why, and what
evidence supports it.

## Epistemic typing

Every statement carries its kind, so a measured fact is never mistaken for an
inference:

| Kind | Meaning |
|---|---|
| `fact` | Something measured or recorded |
| `engine_output` | A value the scoring engine produced |
| `inference` | A reading of engine output, labelled as such |
| `warning` | Something wrong, missing, or unproven |
| `decision_needed` | Something requiring the user |

Each statement also carries the references it rests on — evidence ids, asset
ids, or change types.

## Sections

1. Executive posture
2. What changed
3. Why it changed
4. What requires action
5. What requires patience
6. What is missing or uncertain
7. Capital deployment guidance
8. Asset-level actions
9. Reserve and risk constraints
10. Evidence health
11. Watch conditions
12. Questions requiring your input

## No free-form claims

Nothing is narrated. Every statement is assembled from the report, the diff, the
run's issues, or provider descriptors. Where the diff records an unproven cause,
the briefing says the movement is unexplained rather than inventing a reason.

## Provenance

The briefing states its data label ("Fixture intelligence", "Manual evidence",
"Partial live") in the executive section and in its header.

## Presentation

- **Structured JSON** — the `MorpheusBriefing` object.
- **Rendered UI** — `BriefingCard` on Capital, showing four key sections by
  default with the rest behind a disclosure control.
- **Markdown export** — `briefingToMarkdown`, preserving statement kinds.

The concise default exists because a briefing that takes ten minutes to read
will not be read on the morning it matters.
