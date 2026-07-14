# Security Policy

## Supported versions

NeoOS is pre-release. Security support applies to the latest repository state and any release explicitly marked as supported.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities publicly. Use GitHub private vulnerability reporting when enabled, or contact the repository owner privately.

Include the affected component, reproduction steps, impact, safe proof of concept, suggested mitigation, and whether autonomous agents or external tools are involved.

## Response states

Received → Triaged → Confirmed → Mitigation in Progress → Fixed → Independently Verified → Disclosed.

No issue may be called fixed until the corrective change is tested and the required evidence exists.

## Agent and automation security

Automated builders must receive least-privilege access, work through branches and pull requests, never receive production secrets by default, never merge their own changes, disclose limitations, produce auditable evidence, and remain revocable.
