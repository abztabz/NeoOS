# ADR-0002 - Modular Monolith First

**Status:** Proposed  

## Context

NeoOS currently has one founder, one initial product, and one implementation stream. Microservices would add permanent coordination and operational weight.

## Decision

Begin with a modular monolith. Keep module boundaries explicit and preserve future extraction paths.

## Consequences

- simpler deployment and testing;
- lower operational burden;
- shared transaction and audit model;
- extraction permitted only when evidence demonstrates a bottleneck.
