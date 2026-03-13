# Auto Feature Bootstrap (Phase 9)

Automatic feature folder creation when the product-manager skill starts work on a new feature. Today, a human must manually create `docs/{NNN}-{feature-name}/overview.md` before posting a task to Discord. This feature removes that prerequisite — the PM skill bootstraps the folder itself as the first step of its workflow.

## Problem

The current workflow requires manual setup before the agentic team can work:

1. User creates `docs/{NNN}-{feature-name}/` folder
2. User writes `overview.md` with a brief description
3. User creates a Discord thread named after the feature
4. User @mentions a skill to start

Steps 1–2 are friction. The PM skill — which owns discovery and requirements — is the natural place to bootstrap the feature folder, since it's always the first skill invoked for a new feature.

## Current behavior

- `context-assembler.ts` derives the feature name from the Discord thread name via `extractFeatureName()` (strips text after ` — `)
- It looks for `docs/{NNN}-{feature-name}/overview.md` — if missing, it logs a warning and continues with no Layer 1 overview context
- It looks for the feature folder for Layer 2 files — if missing, it logs a warning and returns an empty array
- The `{NNN}` prefix (e.g. `006-`) is part of the folder name and must match the thread name exactly

## Proposed design

### Option A: PM skill creates the folder (recommended)

The PM skill's Phase 1 (Discovery) already reads the thread name and starts analyzing the problem space. Add a preliminary step: if no feature folder exists for this thread, the PM creates:

- `docs/{NNN}-{feature-name}/overview.md` — a 1–2 sentence summary derived from the user's initial message
- The folder itself via `mkdir`

This requires:
- The PM skill SKILL.md to include instructions for bootstrapping the folder when it doesn't exist
- The PM skill to have `Bash` or `Write` tool access to create directories (already added)
- A naming convention: the PM derives `{NNN}` by scanning existing `docs/` folders for the next sequential number

### Option B: Orchestrator creates the folder automatically

The orchestrator detects that the feature folder is missing during context assembly and creates a minimal `overview.md` from the thread name + trigger message content before invoking the skill.

This requires:
- Changes to `context-assembler.ts` or a new pre-invocation hook in `orchestrator.ts`
- The orchestrator to commit the new folder to git (using the existing artifact commit pipeline)

### Recommendation

**Option A** is simpler and more natural — the PM owns feature definition, so it should own folder creation. Option B adds complexity to the orchestrator for something that only happens once per feature.

## What the PM skill needs to do

When invoked for a feature with no existing folder:

1. **Scan `docs/` for the next `{NNN}` prefix** — e.g. if `007-polish/` is the highest, use `008`
2. **Create the folder** — `docs/{NNN}-{feature-name}/`
3. **Write `overview.md`** — synthesize from the user's message in the Discord thread
4. **Proceed with Phase 1 (Discovery)** as normal

The created overview.md and folder will be committed by the existing artifact commit pipeline since the PM skill runs inside a git worktree.

## Integration points

| File | Change |
|------|--------|
| `.claude/skills/product-manager/SKILL.md` | Add "Phase 0: Feature Bootstrap" step before Phase 1 |
| `ptah/src/orchestrator/context-assembler.ts` | No changes needed — already handles missing folders gracefully |
| `README.md` | Update docs structure section to mention auto-creation |

## Edge cases

- **Thread name doesn't match any folder pattern** — PM creates a new folder with a slugified thread name
- **Feature folder already exists** — PM skips bootstrap and proceeds to its normal phase
- **Multiple PM invocations on same thread** — only the first one creates the folder; subsequent invocations find it already exists
- **Thread name has special characters** — slugify to lowercase alphanumeric + hyphens
- **Concurrent PM invocations** — worktree isolation prevents conflicts; first merge wins, second sees the folder already on main

## Open questions

1. Should the orchestrator validate that the feature folder was created after the PM's first invocation, or trust the PM to do it?
2. Should the `{NNN}` prefix be derived from the Discord thread name if it already contains a number (e.g. "008-conversation-logging"), or always auto-increment?
