# Feature Overview: Orchestrate-Dev Workflow Alignment

## What

Align Ptah's default configuration, cross-review mechanics, and CLI with the 8-phase PDLC pipeline defined in the `orchestrate-dev` Claude Code skill.

## Why

The `orchestrate-dev` skill defines a specific workflow (REQ Review → FSPEC → TSPEC → PLAN → PROPERTIES → Implementation → Properties Tests → Final Codebase Review) with 8 named agent roles, versioned cross-review files, and a 5-iteration loop limit. Ptah has the right structural primitives but its defaults don't match: wrong agent names, missing PROPERTIES Tests phase, unrecognized recommendation strings, un-versioned cross-review paths, and no headless `ptah run` entry point.

## Key Changes

1. `ptah init` scaffolds 8 skill stubs + correct workflow YAML with orchestrate-dev agents
2. `ptah run <req-path>` new CLI command — starts at Phase R from an existing REQ
3. Cross-review versioning: `CROSS-REVIEW-{skill}-{DOC}[-v{N}].md`
4. Recommendation parser: adds "approved with minor issues" and "need attention"
5. Agent→skill mapping: adds pm-review, se-review, te-review entries
6. Properties Tests phase added to default workflow between implementation and review
7. Default `revision_bound` raised from 3 to 5

## REQ Document

[REQ-021 — Orchestrate-Dev Workflow Alignment](REQ-orchestrate-dev-workflow.md)
