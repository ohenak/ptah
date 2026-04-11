# Fix REQ Overwrite On Workflow Start

## Problem

When a user starts a new workflow from Discord today (by posting a message that mentions an agent such as `@pm` in a thread whose name matches a feature slug), the orchestrator's `startNewWorkflow` path in `ptah/src/orchestrator/temporal-orchestrator.ts` unconditionally begins the feature lifecycle workflow at the `req-creation` phase. If a human product manager has already hand-drafted a Requirements Document at `docs/backlog/<slug>/REQ-<slug>.md` or `docs/in-progress/<slug>/REQ-<slug>.md`, that file is destroyed — the PM agent regenerates the REQ from the overview, silently overwriting the human-authored version.

This is a **data-loss bug**, not a new feature. It blocks the team's ability to hand-seed a REQ (for example, to iterate on requirements in an editor before running them through the lifecycle) and to trigger the review phase from Discord for any feature that already has a REQ on disk.

## Goal

Make the Discord-triggered workflow start phase-aware:

- If a REQ already exists for the resolved slug, start the workflow at `req-review` (skipping `req-creation` entirely) so the existing document flows into the review cycle untouched.
- If no REQ exists but an `overview.md` does, start at `req-creation` as today.
- If neither exists, surface a clear error in Discord rather than starting a workflow against an empty folder.

Under no circumstances may `req-creation` be invoked when a REQ is already on disk — this is the invariant the fix must enforce.

## Scope

- **In scope:** Detection of existing REQ artifacts in the feature folder; passing the correct `startAtPhase` argument to `TemporalClient.startFeatureWorkflow`; user-facing Discord error messages for the "no overview and no REQ" case; a focused integration test that exercises the two real filesystem layouts (overview-only, REQ-present).
- **Out of scope:** New Discord mention identities, new command verbs, backlog bootstrap from Discord, authorization changes. Those belong to the separate `orchestrator-discord-commands` feature.

## Why Urgent

Any PM who drafts a REQ by hand and then posts to Discord to kick off review loses their work. There is no warning, no backup, and the regenerated REQ differs substantially from the human-authored version. Until this is fixed, the documented workflow for iterating on a REQ outside Discord is unsafe.
