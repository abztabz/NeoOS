# ADR-0001 - GitHub Is the Durable Source of Truth

**Status:** Accepted  

## Context

Conversation-level agreement is insufficient for durable governance, implementation, and cross-session inheritance.

## Decision

GitHub will store versioned:

- governance documents;
- role charters and SOPs;
- learning records;
- ADRs;
- project contracts;
- code;
- tests;
- verification evidence;
- decision and change records.

## Consequences

No governance item may be called persisted until committed to the repository.

No implementation may be called enforced or verified solely because a document exists.
