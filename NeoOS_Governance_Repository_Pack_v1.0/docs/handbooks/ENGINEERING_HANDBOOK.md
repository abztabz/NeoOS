# NeoOS Engineering Handbook

**Owner:** Atlas  

## Principles

- Simple things should be simple.
- Complex things should remain possible.
- Avoid choices that unnecessarily foreclose future evolution.
- Technical excellence serves founder value.
- Implement existing organizational capabilities; do not invent parallel offices through software naming.
- Start with a modular monolith unless evidence requires distribution.
- Plugin-first for external integrations.
- Vendor dependencies must remain replaceable where practical.

## Repository workflow

1. Issue contains approved capability, specification, acceptance criteria, and evidence contract.
2. Builder creates a branch.
3. Builder implements and reports only Implemented/Tested states it can prove.
4. CI runs automated checks.
5. Independent reviewer verifies required evidence.
6. Atlas approves technical integration.
7. Human Authority is involved only where a reserved or consequential gate applies.

## Source-of-truth rule

GitHub is the durable source of truth for code, governance, decisions, and implementation evidence.
