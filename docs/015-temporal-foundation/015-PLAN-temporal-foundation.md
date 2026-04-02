# Execution Plan: Temporal Foundation + Config-Driven Workflow

| Field | Detail |
|-------|--------|
| **Technical Specification** | [015-TSPEC-temporal-foundation](015-TSPEC-temporal-foundation.md) |
| **Requirements** | [REQ-015](015-REQ-temporal-foundation.md) |
| **Functional Specification** | [FSPEC-015](015-FSPEC-temporal-foundation.md) |
| **Date** | April 2, 2026 |
| **Status** | Draft |

## 1. Summary

Replace Ptah's custom orchestration infrastructure with Temporal durable workflows and make the PDLC workflow configurable via `ptah.workflow.yaml`. Implementation proceeds bottom-up: types and config parsing first, then Activities, then the Workflow, then Orchestrator integration, and finally the migration tool. Existing v4 code is removed only after the Temporal replacement is fully tested.

## 2. Task List

### Phase A: Foundation — Types, Config, and Validation

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A1 | Define Temporal shared types (FeatureWorkflowState, SkillActivityInput/Result, Signal payloads, ForkJoinState, ReviewState, FailureInfo) | `tests/unit/temporal/types.test.ts` | `src/temporal/types.ts` | ✅ Done |
| A2 | Define WorkflowConfig types and YAML parser (WorkflowConfigLoader, PhaseDefinition, ReviewerManifest, SkipCondition) | `tests/unit/config/workflow-config.test.ts` | `src/config/workflow-config.ts` | ✅ Done |
| A3 | Add TemporalConfig and HeartbeatConfig types to PtahConfig; update ConfigLoader to parse temporal section with defaults | `tests/unit/config/loader.test.ts` | `src/config/loader.ts`, `src/types.ts` | ✅ Done |
| A4 | Implement WorkflowValidator — unique phase IDs, valid agent refs, valid transitions, no invalid cycles, required fields | `tests/unit/config/workflow-validator.test.ts` | `src/config/workflow-validator.ts` | ✅ Done |
| A5 | Create default PDLC workflow preset YAML matching v4 behavior exactly | `tests/unit/config/workflow-config.test.ts` | `src/presets/default-pdlc.yaml` | ✅ Done |
| A6 | Add test fixture: `tests/fixtures/default-workflow.yaml` and FakeWorkflowConfigLoader, FakeTemporalClient to factories.ts | — | `tests/fixtures/factories.ts`, `tests/fixtures/default-workflow.yaml` | ✅ Done |

### Phase B: Temporal Client and Worker

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B1 | Implement TemporalClientWrapper — connect, disconnect, startFeatureWorkflow, workflow ID sequencing (`ptah-feature-{slug}-{sequence}`) | `tests/unit/temporal/client.test.ts` | `src/temporal/client.ts` | ✅ Done |
| B2 | Implement TemporalClientWrapper — signalUserAnswer, signalRetryOrCancel, signalResumeOrCancel, queryWorkflowState, listWorkflowsByPrefix | `tests/unit/temporal/client.test.ts` | `src/temporal/client.ts` | ✅ Done |
| B3 | Implement Temporal Worker setup — createWorker with activity closure injection, configurable concurrency, task queue | `tests/unit/temporal/worker.test.ts` | `src/temporal/worker.ts` | ✅ Done |

### Phase C: Activities

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C1 | Implement invokeSkill Activity — idempotency check (worktree exists with committed changes → skip) | `tests/unit/temporal/skill-activity.test.ts` | `src/temporal/activities/skill-activity.ts` | ✅ Done |
| C2 | Implement invokeSkill Activity — worktree creation, context assembly, skill invocation | `tests/unit/temporal/skill-activity.test.ts` | `src/temporal/activities/skill-activity.ts` | ✅ Done |
| C3 | Implement invokeSkill Activity — heartbeat loop (subprocess liveness polling, cancellation check) | `tests/unit/temporal/skill-activity.test.ts` | `src/temporal/activities/skill-activity.ts` | ✅ Done |
| C4 | Implement invokeSkill Activity — LGTM/TASK_COMPLETE handling: commit, merge (single-agent) or return worktree (fork/join) | `tests/unit/temporal/skill-activity.test.ts` | `src/temporal/activities/skill-activity.ts` | ✅ Done |
| C5 | Implement invokeSkill Activity — ROUTE_TO_USER handling: no merge, return question | `tests/unit/temporal/skill-activity.test.ts` | `src/temporal/activities/skill-activity.ts` | ✅ Done |
| C6 | Implement invokeSkill Activity — error classification (retryable vs non-retryable, ApplicationFailure.nonRetryable, internal 429 retry per BR-26) | `tests/unit/temporal/skill-activity.test.ts` | `src/temporal/activities/skill-activity.ts` | ✅ Done |
| C7 | Implement mergeWorktree Activity — merge worktree to feature branch, conflict detection, pre-merge SHA rollback for fork/join | `tests/unit/temporal/skill-activity.test.ts` | `src/temporal/activities/skill-activity.ts` | ✅ Done |
| C8 | Implement sendNotification Activity — question, failure, status, revision-bound notification types | `tests/unit/temporal/notification-activity.test.ts` | `src/temporal/activities/notification-activity.ts` | ✅ Done |

### Phase D: Workflow Logic

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D1 | Implement phase graph walker — resolveNextPhase with explicit transitions, array ordering, skip_if evaluation | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D2 | Implement main workflow loop — phase iteration, approved auto-transition, config snapshot for versioning | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D3 | Implement single-agent dispatch — invoke skill, handle LGTM/TASK_COMPLETE, advance to next phase | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D4 | Implement question flow — ROUTE_TO_USER → record question → sendNotification → waitForSignal("user-answer") → re-invoke agent → nested questions | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D5 | Implement fork/join dispatch — parallel Activities, wait_for_all policy, no-partial-merge, discard worktrees on failure | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D6 | Implement fork/join dispatch — fail_fast policy with cooperative cancellation | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D7 | Implement fork/join ROUTE_TO_USER — hold worktrees, question flow for ROUTE_TO_USER agents, re-invoke only those agents, merge all on final LGTM | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D8 | Implement fork/join merge — sequential merge in config order, conflict detection with rollback | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D9 | Implement review cycle — compute reviewer manifest by discipline, dispatch reviewers in parallel, collect recommendations | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D10 | Implement review cycle — revision loop (increment count, check bound, transition to creation with Revise task, re-enter review) | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D11 | Implement review cycle — revision bound exceeded → notify user → waitForSignal("resume-or-cancel") | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D12 | Implement failure flow — record failure info, sendNotification, waitForSignal("retry-or-cancel"), full re-dispatch for fork/join (BR-14) | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D13 | Implement workflow state Query handler — return FeatureWorkflowState for current phase, agents, reviewers, config | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| D14 | Implement context document resolution — resolve `{feature}/REQ` etc. to file paths from phase config context_documents | `tests/unit/temporal/feature-lifecycle.test.ts` | `src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |

### Phase E: Orchestrator Integration

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E1 | Update Orchestrator — replace PdlcDispatcher dependency with TemporalClientWrapper; start workflow on new feature | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| E2 | Update Orchestrator — route Discord user answers as Temporal Signals (user-answer) | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| E3 | Update Orchestrator — route retry/cancel and resume/cancel Signals from Discord | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| E4 | Update Orchestrator startup — validate workflow config, connect Temporal, start in-process Worker | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| E5 | Update Orchestrator shutdown — shut down Worker, disconnect Temporal client | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/temporal-orchestrator.ts` | ✅ Done |
| E6 | Update ContextAssembler — accept contextDocumentRefs from config instead of calling getContextDocuments() | `tests/unit/orchestrator/context-assembler.test.ts` | `src/orchestrator/context-assembler.ts` | ✅ Done |
| E7 | Update `ptah init` — generate default `ptah.workflow.yaml` and `temporal` section in `ptah.config.json` | `tests/unit/commands/init.test.ts` | `src/config/defaults.ts` | ✅ Done |

### Phase F: Migration Tool

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F1 | Implement MigrateCommand — read pdlc-state.json, parse features, handle file-not-found and malformed JSON | `tests/unit/commands/migrate.test.ts` | `src/commands/migrate.ts` | ✅ Done |
| F2 | Implement phase mapping — built-in V4_DEFAULT_MAPPING, custom --phase-map file loading and validation | `tests/unit/commands/migrate.test.ts` | `src/commands/migrate.ts` | ✅ Done |
| F3 | Implement migration validation — all features mappable, abort with error listing unmapped phases | `tests/unit/commands/migrate.test.ts` | `src/commands/migrate.ts` | ✅ Done |
| F4 | Implement dry-run mode — print table of features/phases/workflow IDs without creating workflows | `tests/unit/commands/migrate.test.ts` | `src/commands/migrate.ts` | ✅ Done |
| F5 | Implement workflow creation — start workflows at mapped phases, transfer review state, reset fork/join subtasks (BR-14), skip existing (BR-22) | `tests/unit/commands/migrate.test.ts` | `src/commands/migrate.ts` | ✅ Done |
| F6 | Implement import validation — query each workflow to verify phase, emit warnings on mismatch, print summary report | `tests/unit/commands/migrate.test.ts` | `src/commands/migrate.ts` | ✅ Done |
| F7 | Wire `ptah migrate` CLI command with --dry-run, --include-completed, --phase-map flags | `tests/unit/commands/migrate.test.ts` | `bin/ptah.ts` | ✅ Done |

### Phase G: Cleanup and Integration Tests

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| G1 | Remove replaced v4 files (state-machine.ts, pdlc-dispatcher.ts, review-tracker.ts, phases.ts, context-matrix.ts, state-store.ts, thread-queue.ts, merge-lock.ts, invocation-guard.ts, question-store.ts, question-poller.ts, thread-state-manager.ts) | — | `src/orchestrator/pdlc/`, `src/orchestrator/` | ⬚ Not Started |
| G2 | Remove v4 test files and update factories.ts to remove unused fakes | — | `tests/` | ⬚ Not Started |
| G3 | Update package.json — add temporalio, js-yaml, @types/js-yaml; verify build | — | `package.json` | ⬚ Not Started |
| G4 | Integration test — full workflow lifecycle with TestWorkflowEnvironment (happy path: creation → review → approved → next phase) | `tests/integration/temporal/workflow-integration.test.ts` | — | ⬚ Not Started |
| G5 | Integration test — ROUTE_TO_USER Signal round trip with TestWorkflowEnvironment | `tests/integration/temporal/workflow-integration.test.ts` | — | ⬚ Not Started |
| G6 | Integration test — fork/join with wait_for_all failure policy | `tests/integration/temporal/workflow-integration.test.ts` | — | ⬚ Not Started |
| G7 | Integration test — migration dry-run and live migration against test Temporal server | `tests/integration/temporal/workflow-integration.test.ts` | — | ⬚ Not Started |
| G8 | Full regression — run all existing tests, verify zero failures | — | — | ⬚ Not Started |

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

## 3. Task Dependency Notes

```
Phase A (Foundation)
  A1 ─────┐
  A2 ──┐  │
  A3 ──┤  │
       ▼  ▼
  A4 (needs A2 types + AgentRegistry)
  A5 (needs A2 types)
  A6 (needs A1, A2 types)

Phase B (Client/Worker) — depends on A1, A3
  B1 → B2 (same file, sequential)
  B3 (needs A3 for TemporalConfig)

Phase C (Activities) — depends on A1, A6
  C1 → C2 → C3 → C4 → C5 → C6 (sequential build-up of skill-activity)
  C7 (merge activity, can parallel with C1-C6 after A1)
  C8 (notification activity, independent after A1)

Phase D (Workflow) — depends on A1, A2, A5, C1-C8
  D1 → D2 → D3 (core loop)
  D4 (question flow, needs D3)
  D5 → D6 → D7 → D8 (fork/join, needs D3)
  D9 → D10 → D11 (review cycle, needs D3)
  D12 (failure flow, needs D3)
  D13 (query handler, needs D2)
  D14 (context resolution, needs D2)

Phase E (Orchestrator) — depends on B1-B2, D1-D14
  E1 → E2 → E3 (Orchestrator message handling)
  E4 → E5 (startup/shutdown)
  E6 (ContextAssembler, independent after A2)
  E7 (ptah init, needs A5)

Phase F (Migration) — depends on B1-B2, A2
  F1 → F2 → F3 → F4 → F5 → F6 → F7 (sequential)

Phase G (Cleanup) — depends on ALL prior phases
  G1 → G2 (remove v4 code, then tests)
  G3 (package.json, can be done early but verified last)
  G4 → G5 → G6 → G7 → G8 (integration tests, then full regression)
```

### Parallelization Opportunities

The following task groups can be worked on **concurrently** by multiple engineers:

| Batch | Tasks | Prerequisite |
|-------|-------|-------------|
| Batch 1 | A1, A2, A3 | None |
| Batch 2 | A4, A5, A6 | Batch 1 |
| Batch 3 | B1-B3, C1-C8, F1-F3 | A1, A3 (types only) |
| Batch 4 | D1-D14, E6, E7 | C1-C8, A5 |
| Batch 5 | E1-E5, F4-F7 | D1-D14, B1-B2 |
| Batch 6 | G1-G8 | All prior |

## 4. Integration Points

### Existing Code Affected

| Component | Change Type | Details |
|-----------|------------|---------|
| `src/config/loader.ts` | Updated | Add `temporal` section parsing with defaults |
| `src/types.ts` | Updated | Add TemporalConfig, WorkerConfig, RetryDefaults, HeartbeatConfig |
| `src/orchestrator/orchestrator.ts` | Updated | Replace PdlcDispatcher with TemporalClientWrapper; remove ThreadQueue, MergeLock, InvocationGuard, QuestionStore/Poller, ThreadStateManager deps |
| `src/orchestrator/context-assembler.ts` | Updated | Accept contextDocumentRefs parameter instead of calling getContextDocuments() |
| `bin/ptah.ts` | Updated | Add Temporal Client/Worker wiring, `ptah migrate` command, `ptah init` workflow YAML generation |
| `tests/fixtures/factories.ts` | Updated | Add FakeTemporalClient, FakeWorkflowConfigLoader; remove fakes for deleted modules |

### Existing Code Kept Unchanged

| Component | Used By |
|-----------|---------|
| `src/orchestrator/skill-invoker.ts` | SkillActivity (inside Activity) |
| `src/orchestrator/artifact-committer.ts` | SkillActivity and mergeWorktree Activity |
| `src/orchestrator/router.ts` | SkillActivity (signal parsing) |
| `src/orchestrator/agent-registry.ts` | WorkflowValidator, SkillActivity |
| `src/orchestrator/worktree-registry.ts` | Worker process |
| `src/services/git.ts` | SkillActivity, mergeWorktree Activity |
| `src/services/discord.ts` | NotificationActivity, Orchestrator |

### Connection to Future Features

- **Feature 016 (Messaging Abstraction):** NotificationActivity currently calls DiscordClient directly. Feature 016 will introduce a MessagingProvider interface; NotificationActivity will be updated to use it.
- **Feature 017 (Library Packaging):** The `ptah.workflow.yaml` schema and WorkflowConfig types become the public API for custom workflows.

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria (all 20 REQ-015 requirements)
- [ ] Implementation matches TSPEC v1.1 (protocols, algorithms, error handling, test doubles)
- [ ] All 26 FSPEC business rules (BR-01 through BR-26) verified
- [ ] All 19 FSPEC acceptance tests (AT-01 through AT-19) covered
- [ ] Existing tests remain green (no regressions)
- [ ] Removed v4 files listed in TSPEC Section 3 are deleted
- [ ] Default PDLC preset produces identical behavior to v4 state machine
- [ ] `ptah init` generates valid `ptah.workflow.yaml` and temporal config
- [ ] `ptah migrate --dry-run` reports correct mapping for sample state files
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review

---

*End of Document*
