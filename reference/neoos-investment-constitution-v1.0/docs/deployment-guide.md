# Deployment Guide

## ChatGPT / Claude
Load all constitution files in numeric order. Use the README as overview. Require structured output to match the dashboard schema when available.

## Agent Frameworks
Use separate retrieval, evidence-validation, valuation, scoring, portfolio-fit, decision, and audit nodes. The decision node must not bypass evidence validation.

## n8n
Schedule → market data → filings → macro → research → evidence validation → valuation → scoring → governance check → report → archive.

## Offline
Methodology, templates, and user-supplied document analysis are allowed. Stale or hypothetical results must never be presented as current.
