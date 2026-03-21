# Execution Plan: Tech Lead Orchestration

| Field | Detail |
|-------|--------|
| **Technical Specification** | [014-TSPEC-tech-lead-orchestration](014-TSPEC-tech-lead-orchestration.md) |
| **Requirements** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Functional Specification** | [014-FSPEC-tech-lead-orchestration](014-FSPEC-tech-lead-orchestration.md) |
| **Date** | 2026-03-21 |
| **Status** | Draft |

## 1. Summary

Implement the tech-lead orchestration layer for Phase 14. This involves: (1) TypeScript changes to support dispatcher routing, config validation, and merge operations; (2) a full rewrite of the SKILL.md prompt encoding the FSPEC behavioral logic; and (3) config and template updates. The TypeScript changes follow strict TDD; the SKILL.md is validated via acceptance test scenarios defined in TSPEC §7.5.

## 2. Task List

### Phase A — Foundation Types and Config Loader

Adds the `mentionable` field to `AgentEntry`, updates `loader.ts` validation to skip snowflake regex when `mentionable === false`, and adds the new orchestrator config types (`tech_lead_agent_timeout_ms`, `retain_failed_worktrees`) and merge types (`MergeBranchParams`, `BranchMergeResult`, `BranchMergeStatus`) to `types.ts`. This phase must complete before Phase C (ptah.config.json) to avoid crashing the config loader.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add `mentionable?: boolean` field to `AgentEntry` type | — | `ptah/src/types.ts` | ⬚ Not Started |
| 2 | Add `MergeBranchParams`, `BranchMergeResult`, `BranchMergeStatus` types | — | `ptah/src/types.ts` | ⬚ Not Started |
| 3 | Add `tech_lead_agent_timeout_ms` and `retain_failed_worktrees` to orchestrator config type | — | `ptah/src/types.ts` | ⬚ Not Started |
| 4 | Update `loader.ts` validation: skip snowflake regex when `mentionable === false` | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ⬚ Not Started |
| 5 | Test: agent with `mentionable: false` and empty `mention_id` passes validation | `ptah/tests/unit/config/loader.test.ts` | — | ⬚ Not Started |
| 6 | Test: agent with `mentionable: true` and empty `mention_id` is rejected | `ptah/tests/unit/config/loader.test.ts` | — | ⬚ Not Started |
| 7 | Test: agent with absent `mentionable` and empty `mention_id` is rejected (backward compat) | `ptah/tests/unit/config/loader.test.ts` | — | ⬚ Not Started |
| 8 | Test: agent with absent `mentionable` and valid snowflake passes validation | `ptah/tests/unit/config/loader.test.ts` | — | ⬚ Not Started |

### Phase B — Dispatcher Routing

Adds `useTechLead?: boolean` to `FeatureConfig`, updates `phaseToAgentId` to return `"tl"` for IMPLEMENTATION when `useTechLead` is set, and suppresses fork-join for IMPLEMENTATION in `isForkJoinPhase`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add `useTechLead?: boolean` to `FeatureConfig` interface | — | `ptah/src/orchestrator/pdlc/phases.ts` | ⬚ Not Started |
| 2 | Update `phaseToAgentId`: return `"tl"` for IMPLEMENTATION when `useTechLead === true` | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 3 | Test: returns `"tl"` for IMPLEMENTATION when `useTechLead` is true (backend-only) | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |
| 4 | Test: returns `"tl"` for IMPLEMENTATION when `useTechLead` is true (fullstack) | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |
| 5 | Test: returns `"tl"` for IMPLEMENTATION when `useTechLead` is true (frontend-only) | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |
| 6 | Test: preserves existing routing when `useTechLead` is absent | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |
| 7 | Test: preserves existing routing when `useTechLead` is false | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |
| 8 | Test: does not affect TSPEC_CREATION routing even when `useTechLead` is true | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |
| 9 | Update `isForkJoinPhase`: return false for IMPLEMENTATION when `useTechLead === true` | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | ⬚ Not Started |
| 10 | Test: returns false for IMPLEMENTATION when `useTechLead` is true and fullstack | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |
| 11 | Test: returns true for IMPLEMENTATION when `useTechLead` is absent and fullstack | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |
| 12 | Test: returns true for TSPEC_CREATION when `useTechLead` is true (no suppression for non-IMPLEMENTATION) | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | — | ⬚ Not Started |

### Phase C — Config and Template Updates

Adds the `"tl"` agent entry to `ptah.config.json` (with `mentionable: false`) and updates the plan template to document fan-out dependency syntax. Depends on Phase A (config loader must support `mentionable: false` before this agent entry is added).

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add `"tl"` agent entry to `ptah.config.json` with `mentionable: false` | — | `ptah/ptah.config.json` | ⬚ Not Started |
| 2 | Add `tech_lead_agent_timeout_ms` and `retain_failed_worktrees` to orchestrator section | — | `ptah/ptah.config.json` | ⬚ Not Started |
| 3 | Update `backend-plans-template.md`: document fan-out dependency syntax in Task Dependency Notes | — | `docs/templates/backend-plans-template.md` | ⬚ Not Started |

### Phase D — ArtifactCommitter: mergeBranchIntoFeature

Adds the `mergeBranchIntoFeature` method to `ArtifactCommitter` interface and implements it in `DefaultArtifactCommitter` with merge lock serialization. Adds `FakeGitClient` extensions, `FakeMergeLock`, `FakeMergeLockWithTimeout`, and factory helpers to `factories.ts`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add `mergeBranchIntoFeature` to `ArtifactCommitter` interface | — | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| 2 | Add `DEFAULT_LOCK_TIMEOUT_MS` constant (30,000 ms) | — | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| 3 | Add `MergeLock` interface and `MergeLockTimeoutError` | — | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| 4 | Add `FakeMergeLock` (records acquire/release) to factories | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 5 | Add `FakeMergeLockWithTimeout` (throws on acquire) to factories | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 6 | Add `makeCommitter`, `makeCommitterWithLock`, `makeMergeBranchParams` factories | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 7 | Extend existing `FakeGitClient` with `mergeInWorktree`, `getShortSha`, `getConflictedFiles`, `abortMergeInWorktree` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 8 | Implement `DefaultArtifactCommitter.mergeBranchIntoFeature` | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| 9 | Test: returns merged status with commitSha on successful merge; lock released | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | — | ⬚ Not Started |
| 10 | Test: returns conflict status with conflicting files, aborts merge; lock released | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | — | ⬚ Not Started |
| 11 | Test: returns already-up-to-date; lock released | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | — | ⬚ Not Started |
| 12 | Test: returns merge-error on lock timeout (lock not acquired) | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | — | ⬚ Not Started |
| 13 | Test: returns merge-error when git throws unexpected error; lock released | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | — | ⬚ Not Started |
| 14 | Add `mergeBranchIntoFeature` to `FakeArtifactCommitter` in factories | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |

### Phase E — Integration Test: Agent Registry Wiring

Validates end-to-end wiring: loads real `ptah.config.json`, resolves the `"tl"` agent, and asserts its `skill_path` points to an existing file. Depends on Phase C (config must contain the "tl" entry).

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Integration test: loads ptah.config.json, resolves "tl" agent, asserts skill_path exists | `ptah/tests/integration/config/agent-registry.test.ts` | — | ⬚ Not Started |

### Phase F — Tech-Lead SKILL.md

Full rewrite of `.claude/skills/tech-lead/SKILL.md` to implement all FSPEC behavioral logic. This is the primary deliverable — a prompt-based skill validated via acceptance test scenarios (TSPEC §7.5), not via Vitest.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Implement plan ingestion and phase extraction | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 2 | Implement dependency graph parsing (3 syntax forms: linear chain, fan-out, natural language) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 3 | Implement cycle detection (Kahn's pre-check) and sequential fallback | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 4 | Implement topological layering with concurrency cap (sub-batch splitting at 5) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 5 | Implement completed-phase exclusion and resume auto-detection | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 6 | Implement phase skill assignment algorithm (source file prefix mapping) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 7 | Implement pre-flight infrastructure checks (remote branch + mergeBranchIntoFeature grep) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 8 | Implement confirmation loop with AskUserQuestion (approve/modify/cancel, 5-iteration cap, 10-min timeout) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 9 | Implement modification types: change skill, move phase, split batch, re-run phase | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 10 | Implement batch execution lifecycle (parallel Agent dispatch, sequential merge, test gate, plan update) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 11 | Implement phase failure handling with no-partial-merge invariant and worktree cleanup | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 12 | Implement merge conflict handling (abort, report conflicting files, halt) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 13 | Implement plan status update algorithm (mark tasks ✅, commit, push) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 14 | Implement progress reporting (batch start, phase completion, batch summary, final summary) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 15 | Implement error handling and exit signals (LGTM for clean exits, ROUTE_TO_USER for blocking failures) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 16 | Implement defensive AskUserQuestion timeout handling (null and sentinel) | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |
| 17 | Implement fallback for missing branch name in failed agent results | — | `.claude/skills/tech-lead/SKILL.md` | ⬚ Not Started |

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

## 3. Task Dependency Notes

Phase A → [Phase B, Phase C, Phase D, Phase E]
Phase C → Phase E
Phase F has no dependencies on Phases A–E (SKILL.md is a prompt file, not TypeScript)

```
Phase A (Foundation Types & Config Loader)
├── → Phase B (Dispatcher Routing)          — needs FeatureConfig.useTechLead type
├── → Phase C (Config & Template Updates)   — needs mentionable field in loader
├── → Phase D (ArtifactCommitter)           — needs MergeBranchParams/BranchMergeResult types
└── → Phase E (Integration Test)            — needs types + config entry

Phase C → Phase E                           — integration test loads ptah.config.json with "tl" entry

Phase F (SKILL.md)                          — independent; prompt-based, no TypeScript imports
```

**Parallelism opportunities:** After Phase A completes, Phases B, C, D, and F can all execute in parallel. Phase E must wait for Phase C. This gives a 3-batch execution with the tech-lead orchestrator:
- Batch 1: Phase A, Phase F (independent)
- Batch 2: Phase B, Phase C, Phase D (all depend on A; F continues if not done)
- Batch 3: Phase E (depends on C)

## 4. Integration Points

| Integration Point | Existing File | Change Description |
|-------------------|--------------|-------------------|
| `FeatureConfig` type | `ptah/src/orchestrator/pdlc/phases.ts` | Add optional `useTechLead?: boolean` field |
| `phaseToAgentId` function | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | Add `"tl"` return path for IMPLEMENTATION when `useTechLead` is true |
| `isForkJoinPhase` function | `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts` | Suppress fork-join for IMPLEMENTATION when `useTechLead` is true |
| `ArtifactCommitter` interface | `ptah/src/orchestrator/artifact-committer.ts` | Add `mergeBranchIntoFeature` method signature |
| `DefaultArtifactCommitter` class | `ptah/src/orchestrator/artifact-committer.ts` | Implement `mergeBranchIntoFeature` with merge lock |
| `AgentEntry` type | `ptah/src/types.ts` | Add optional `mentionable?: boolean` field |
| Orchestrator config | `ptah/src/types.ts` | Add `tech_lead_agent_timeout_ms` and `retain_failed_worktrees` |
| Config loader validation | `ptah/src/config/loader.ts` | Skip snowflake regex when `mentionable === false` |
| Agent registry | `ptah/ptah.config.json` | Add `"tl"` agent entry with `mentionable: false` |
| Test fixtures | `ptah/tests/fixtures/factories.ts` | Add `FakeMergeLock`, `FakeMergeLockWithTimeout`, extend `FakeGitClient`, add factories |
| Dispatcher tests | `ptah/tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | Add `useTechLead` routing and fork-join suppression tests |
| Committer tests | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | Add `mergeBranchIntoFeature` tests with lock release assertions |
| Plan template | `docs/templates/backend-plans-template.md` | Document fan-out dependency syntax (`A → [B, C]`) |
| Tech-lead skill | `.claude/skills/tech-lead/SKILL.md` | Full rewrite implementing FSPEC behavioral logic |

### Connection to Previous Phases

- **Phase 010 (Two-tier merge):** `artifact-committer.ts` already has `commitAndMerge`. This plan adds `mergeBranchIntoFeature` as a new method on the same interface, reusing the existing `GitClient` for merge operations.
- **Phase 007 (Polish):** Config loader validation was last updated in Phase 007. The `mentionable` field addition is a backwards-compatible extension.

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria (28 requirements in REQ)
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling, test doubles)
- [ ] Existing tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review
- [ ] SKILL.md acceptance test scenarios (TSPEC §7.5) validated:
  - [ ] AT-PD-01 through AT-PD-10 (dependency parsing, batching, skill assignment)
  - [ ] AT-BD-01-01 through AT-BD-01-03 (pre-flight checks)
  - [ ] AT-BD-02-01 through AT-BD-02-07 (confirmation loop)
  - [ ] AT-BD-03-01 through AT-BD-03-08 (batch execution, failure handling, resume, plan update)

---

*End of Document*
