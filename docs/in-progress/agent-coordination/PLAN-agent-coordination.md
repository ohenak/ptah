# Execution Plan: Agent Coordination

| Field | Detail |
|-------|--------|
| **Technical Specification** | [TSPEC-agent-coordination](TSPEC-agent-coordination.md) |
| **Requirements** | [REQ-agent-coordination](REQ-agent-coordination.md) |
| **Functional Specifications** | [FSPEC-agent-coordination](FSPEC-agent-coordination.md) |
| **Date** | April 6, 2026 |
| **Status** | Draft |

## 1. Summary

Implements two coordination capabilities: (1) shared worktree/branch strategy so downstream agents can read upstream artifacts, and (2) ad-hoc message routing so users can @-mention agents to trigger out-of-band revision requests with queuing and downstream cascade. The plan is organized into 4 phases following the dependency graph: types/infrastructure first, then git operations, then orchestrator-layer routing, then workflow-layer queue/cascade.

## 2. Task List

### Phase A: Types, Interfaces, and Test Infrastructure

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add `AdHocRevisionSignal` type and extend `FeatureWorkflowState` with `adHocQueue`/`adHocInProgress` fields | — | `ptah/src/temporal/types.ts` | ✅ Done |
| 2 | Add `adHocInstruction` field to `SkillActivityInput` | — | `ptah/src/temporal/types.ts` | ✅ Done |
| 3 | Add `CommitAndPushParams` and `CommitAndPushResult` types | — | `ptah/src/types.ts` | ✅ Done |
| 4 | Extend `GitClient` interface with `addWorktreeOnBranch()` and `ensureBranchExists()` | — | `ptah/src/services/git.ts` | ✅ Done |
| 5 | Extend `ArtifactCommitter` interface with `commitAndPush()` | — | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 6 | Extend `TemporalClientWrapper` interface with `signalAdHocRevision()` | — | `ptah/src/temporal/client.ts` | ✅ Done |
| 7 | Update `FakeGitClient` with `addWorktreeOnBranch()`, `ensureBranchExists()` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 8 | Update `FakeTemporalClient` with `signalAdHocRevision()` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |

### Phase B: Ad-Hoc Parser (Pure Function)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 9 | `parseAdHocDirective` returns directive when first token starts with `@` | `ptah/tests/unit/orchestrator/ad-hoc-parser.test.ts` | `ptah/src/orchestrator/ad-hoc-parser.ts` | ✅ Done |
| 10 | `parseAdHocDirective` returns null when first token does not start with `@` | `ptah/tests/unit/orchestrator/ad-hoc-parser.test.ts` | `ptah/src/orchestrator/ad-hoc-parser.ts` | ✅ Done |
| 11 | `parseAdHocDirective` lowercases the agent identifier | `ptah/tests/unit/orchestrator/ad-hoc-parser.test.ts` | `ptah/src/orchestrator/ad-hoc-parser.ts` | ✅ Done |
| 12 | `parseAdHocDirective` trims the instruction remainder | `ptah/tests/unit/orchestrator/ad-hoc-parser.test.ts` | `ptah/src/orchestrator/ad-hoc-parser.ts` | ✅ Done |
| 13 | `parseAdHocDirective` returns empty instruction when only `@agent` is sent | `ptah/tests/unit/orchestrator/ad-hoc-parser.test.ts` | `ptah/src/orchestrator/ad-hoc-parser.ts` | ✅ Done |
| 14 | `parseAdHocDirective` strips leading whitespace before extracting first token | `ptah/tests/unit/orchestrator/ad-hoc-parser.test.ts` | `ptah/src/orchestrator/ad-hoc-parser.ts` | ✅ Done |
| 15 | `parseAdHocDirective` treats only first `@token` as directive, rest is instruction | `ptah/tests/unit/orchestrator/ad-hoc-parser.test.ts` | `ptah/src/orchestrator/ad-hoc-parser.ts` | ✅ Done |

### Phase C: Git Infrastructure (Shared Branch)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 16 | `ensureBranchExists` creates branch from base when it doesn't exist | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 17 | `ensureBranchExists` is a no-op when branch already exists | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 18 | `addWorktreeOnBranch` checks out existing branch into worktree path | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 19 | `commitAndPush` filters to docs/ changes, commits, and pushes to origin | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 20 | `commitAndPush` returns `no-changes` when artifact list is empty | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 21 | `commitAndPush` returns `push-error` when push fails | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 22 | `commitAndPush` returns `commit-error` when commit fails | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |

### Phase D: Temporal Client (Deterministic IDs + Ad-Hoc Signal)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 23 | `startFeatureWorkflow` uses deterministic ID `ptah-{featureSlug}` | `ptah/tests/unit/temporal/client.test.ts` | `ptah/src/temporal/client.ts` | ✅ Done |
| 24 | `signalAdHocRevision` sends `ad-hoc-revision` signal to workflow handle | `ptah/tests/unit/temporal/client.test.ts` | `ptah/src/temporal/client.ts` | ✅ Done |
| 25 | `signalAdHocRevision` throws when workflow not found | `ptah/tests/unit/temporal/client.test.ts` | `ptah/src/temporal/client.ts` | ✅ Done |

### Phase E: Skill Activity (Shared Branch Worktree + CommitAndPush)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 26 | `invokeSkill` uses path-only idempotency check (no branch matching) | `ptah/tests/unit/temporal/skill-activity.test.ts` | `ptah/src/temporal/activities/skill-activity.ts` | ✅ Done |
| 27 | `invokeSkill` creates worktree via `addWorktreeOnBranch` (legacy path) | `ptah/tests/unit/temporal/skill-activity.test.ts` | `ptah/src/temporal/activities/skill-activity.ts` | ✅ Done |
| 28 | `invokeSkill` calls `commitAndPush` instead of `commitAndMerge` for non-fork-join | `ptah/tests/unit/temporal/skill-activity.test.ts` | `ptah/src/temporal/activities/skill-activity.ts` | ✅ Done |
| 29 | `invokeSkill` passes `adHocInstruction` through to context assembly | `ptah/tests/unit/temporal/skill-activity.test.ts` | `ptah/src/temporal/activities/skill-activity.ts` | ✅ Done |

### Phase F: Orchestrator Message Handling

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 30 | `startWorkflowForFeature` calls `ensureBranchExists` before starting workflow | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 31 | `handleMessage` ignores bot messages | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 32 | `handleMessage` passes non-@-directive messages to existing handling | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 33 | `handleMessage` dispatches ad-hoc signal for known agent | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 34 | `handleMessage` posts ack after successful signal dispatch | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 35 | `handleMessage` posts error reply for unknown agent | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 36 | `handleMessage` posts error reply when workflow not found | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 37 | `handleMessage` posts error reply on signal delivery failure | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 38 | `handleMessage` truncates instruction in ack to 100 chars | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| 39 | `handleMessage` logs warning but does not throw when Discord ack post fails after successful signal dispatch (FSPEC-MR-01 BR-05) | `ptah/tests/unit/orchestrator/temporal-orchestrator.test.ts` | `ptah/src/orchestrator/temporal-orchestrator.ts` | ✅ Done |

### Phase G: Workflow — Ad-Hoc Queue and Cascade (Pure Helpers)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 40 | `findAgentPhase` returns first phase where `phase.agent === agentId` | `ptah/tests/unit/temporal/workflows/ad-hoc-queue.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 41 | `findAgentPhase` returns null when agent not in any phase | `ptah/tests/unit/temporal/workflows/ad-hoc-queue.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 42 | `collectCascadePhases` returns `type:"review"` phases after agent index | `ptah/tests/unit/temporal/workflows/cascade.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 43 | `collectCascadePhases` excludes creation/approved/implementation phases | `ptah/tests/unit/temporal/workflows/cascade.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 44 | `collectCascadePhases` returns empty array when agent is last phase | `ptah/tests/unit/temporal/workflows/cascade.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 45 | `collectCascadePhases` returns empty when no review phases after agent | `ptah/tests/unit/temporal/workflows/cascade.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 46 | Cascade positional creation-phase lookup uses `phases[reviewIndex - 1]` (also tests BR-08 edge case: returns phase at N-1 regardless of type, documenting the config constraint) | `ptah/tests/unit/temporal/workflows/cascade.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |

### Phase H: Workflow — Integration (Signal Handler + Main Loop)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 47 | Add `adHocRevisionSignal` definition and handler that enqueues signals | `ptah/tests/unit/temporal/workflows/ad-hoc-queue.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 48 | Update `buildInitialWorkflowState` with `adHocQueue: []` and `adHocInProgress: false` | `ptah/tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 49 | Update `buildContinueAsNewPayload` to carry `adHocQueue` across CAN boundary | `ptah/tests/unit/temporal/workflows/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 50 | Insert `drainAdHocQueue()` call at each phase transition in the main loop | `ptah/tests/unit/temporal/workflows/ad-hoc-queue.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 51 | Wire `executeCascade()` into `drainAdHocQueue` after each ad-hoc agent completes | `ptah/tests/unit/temporal/workflows/cascade.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| 52 | Drain remaining queue signals before workflow termination | `ptah/tests/unit/temporal/workflows/ad-hoc-queue.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |

### Phase I: WorktreeManager Update

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 53 | Update `WorktreeManager.create()` to use `addWorktreeOnBranch` instead of `createWorktreeFromBranch` | `ptah/tests/unit/orchestrator/worktree-manager.test.ts` | `ptah/src/orchestrator/worktree-manager.ts` | ✅ Done |

### Phase J: Integration Tests (Signal Contract)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 54 | Integration: orchestrator deterministic ID `ptah-{featureSlug}` matches workflow start ID — signal sent by orchestrator reaches workflow signal handler with correct payload shape | `ptah/tests/integration/ad-hoc-signal-contract.test.ts` | — | ⬚ Not Started |

## 3. Task Dependency Notes

```
Phase A (types/fakes) ← no deps
  │
  ├── Phase B (parser) ← A
  │
  ├── Phase C (git infra) ← A
  │     │
  │     └── Phase E (skill-activity) ← A, C
  │
  ├── Phase D (temporal client) ← A
  │     │
  │     └── Phase F (orchestrator) ← A, B, D
  │
  └── Phase G (workflow helpers) ← A
        │
        └── Phase H (workflow integration) ← A, G, E
              │
              └── Phase I (worktree manager) ← C
                    │
                    └── Phase J (integration tests) ← D, F, H
```

- **A must complete first** — all other phases depend on types/interfaces/fakes.
- **B, C, D, G are independent** once A is done — can be developed in any order.
- **E depends on C** — needs `addWorktreeOnBranch` and `commitAndPush` implementations.
- **F depends on B and D** — needs the parser and the Temporal client signal method.
- **H depends on G and E** — needs cascade helpers and activity changes.
- **I can be done after C** — worktree manager update is a localized change.
- **J (integration tests) runs last** — verifies signal contract across orchestrator → client → workflow.

## 4. Integration Points

| # | Existing File | Changes | Risk |
|---|---------------|---------|------|
| 1 | `ptah/src/temporal/types.ts` | Add `AdHocRevisionSignal`, extend `FeatureWorkflowState`, `SkillActivityInput`, `ContinueAsNewPayload` | Low — additive type changes, no breaking signatures |
| 2 | `ptah/src/services/git.ts` | Add `addWorktreeOnBranch()`, `ensureBranchExists()` to interface + ShellGitClient | Low — new methods, existing untouched |
| 3 | `ptah/src/orchestrator/artifact-committer.ts` | Add `commitAndPush()` to interface + DefaultArtifactCommitter | Low — new method alongside existing `commitAndMerge` |
| 4 | `ptah/src/temporal/client.ts` | Change workflow ID format, add `signalAdHocRevision()`, remove `resolveNextSequence()` | Medium — breaking ID change; existing tests must update |
| 5 | `ptah/src/temporal/activities/skill-activity.ts` | Replace worktree creation + commit path for non-fork-join | Medium — core activity logic change; existing tests must adapt |
| 6 | `ptah/src/orchestrator/temporal-orchestrator.ts` | Add `handleMessage()`, update `startWorkflowForFeature()` | Medium — new public method + modified startup flow |
| 7 | `ptah/src/temporal/workflows/feature-lifecycle.ts` | Add signal, queue state, drain loop, cascade logic | High — significant workflow changes; main loop modified |
| 8 | `ptah/tests/fixtures/factories.ts` | Extend fakes with new protocol methods | Low — additive |

## 5. Definition of Done

- [ ] All 54 tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against all 15 requirement acceptance criteria (REQ-WB-01..05, REQ-MR-01..08, REQ-NF-01..02)
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling, test doubles)
- [ ] Existing tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review

---

*End of Plan*
