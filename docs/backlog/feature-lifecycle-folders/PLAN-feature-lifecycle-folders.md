# Execution Plan: Feature Lifecycle Folders

| Field | Detail |
|-------|--------|
| **Technical Specification** | [TSPEC-FLF v1.2](TSPEC-feature-lifecycle-folders.md) |
| **Requirements** | [REQ-FLF v2.4](REQ-feature-lifecycle-folders.md) |
| **Functional Specification** | [FSPEC-FLF v1.1](FSPEC-feature-lifecycle-folders.md) |
| **Version** | 1.1 |
| **Date** | April 4, 2026 |
| **Status** | Draft |

## 1. Summary

Implement lifecycle-based folder organization for `docs/` (backlog → in-progress → completed), a feature resolver service, promotion activities, worktree isolation, a migration script, and skill/orchestrator updates. The plan is organized bottom-up: foundational types and protocols first, then concrete implementations, then orchestrator integration, then skill file updates and migration.

## 2. Task List

### Phase A: Foundation — Types, Protocols, and Service Extensions

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A1 | Add `featurePath`, `worktreeRoot`, `signOffs` fields to `FeatureWorkflowState` | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/types.ts` | ✅ Done |
| A2 | Extend `WorktreeRegistry` — add `workflowId`, `runId`, `activityId`, `createdAt` to `ActiveWorktree`; add `findByActivity` method | `ptah/tests/unit/orchestrator/worktree-registry.test.ts` | `ptah/src/orchestrator/worktree-registry.ts` | ✅ Done |
| A3 | Add `gitMvInWorktree` method to `GitClient` interface + `NodeGitClient` implementation | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| A4 | Add `listDirInWorktree` method to `GitClient` interface + `NodeGitClient` implementation | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| A5 | Add `readDirMatching` method to `FileSystem` interface + `NodeFileSystem` implementation | `ptah/tests/unit/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ✅ Done |
| A6 | Add `FakeFeatureResolver` and `FakeWorktreeManager` to test fixtures | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| A7 | Update existing fakes (`FakeGitClient`, `FakeFileSystem`, `FakeWorktreeRegistry`) with new methods | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |

### Phase B: Feature Resolver Service

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B1 | Feature found in `in-progress/` — returns correct path and lifecycle | `ptah/tests/unit/orchestrator/feature-resolver.test.ts` | `ptah/src/orchestrator/feature-resolver.ts` | ✅ Done |
| B2 | Feature found in `backlog/` — returns correct path and lifecycle | `ptah/tests/unit/orchestrator/feature-resolver.test.ts` | `ptah/src/orchestrator/feature-resolver.ts` | ✅ Done |
| B3 | Feature found in `completed/` — strips NNN prefix for slug matching | `ptah/tests/unit/orchestrator/feature-resolver.test.ts` | `ptah/src/orchestrator/feature-resolver.ts` | ✅ Done |
| B4 | Feature not found in any folder — returns `{ found: false }` without throwing | `ptah/tests/unit/orchestrator/feature-resolver.test.ts` | `ptah/src/orchestrator/feature-resolver.ts` | ✅ Done |
| B5 | Slug found in multiple folders — logs warning, returns first match per search order | `ptah/tests/unit/orchestrator/feature-resolver.test.ts` | `ptah/src/orchestrator/feature-resolver.ts` | ✅ Done |
| B6 | Filesystem error on a lifecycle folder — logs warning, treats folder as empty, continues | `ptah/tests/unit/orchestrator/feature-resolver.test.ts` | `ptah/src/orchestrator/feature-resolver.ts` | ✅ Done |
| B7 | Worktree root with trailing slash — normalizes correctly | `ptah/tests/unit/orchestrator/feature-resolver.test.ts` | `ptah/src/orchestrator/feature-resolver.ts` | ✅ Done |
| B8 | Empty `completed/` folder and missing `docs/` directory — returns not-found | `ptah/tests/unit/orchestrator/feature-resolver.test.ts` | `ptah/src/orchestrator/feature-resolver.ts` | ✅ Done |

### Phase C: WorktreeManager

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C1 | `create` — generates UUID path, calls `git worktree add`, registers in registry | `ptah/tests/unit/orchestrator/worktree-manager.test.ts` | `ptah/src/orchestrator/worktree-manager.ts` | ✅ Done |
| C2 | `create` — retries with new UUID on collision (first attempt fails, second succeeds) | `ptah/tests/unit/orchestrator/worktree-manager.test.ts` | `ptah/src/orchestrator/worktree-manager.ts` | ✅ Done |
| C3 | `create` — throws non-retryable error after two failed attempts | `ptah/tests/unit/orchestrator/worktree-manager.test.ts` | `ptah/src/orchestrator/worktree-manager.ts` | ✅ Done |
| C4 | `destroy` — calls `git worktree remove --force`, deregisters from registry | `ptah/tests/unit/orchestrator/worktree-manager.test.ts` | `ptah/src/orchestrator/worktree-manager.ts` | ✅ Done |
| C5 | `destroy` — logs error but does not throw when removal fails | `ptah/tests/unit/orchestrator/worktree-manager.test.ts` | `ptah/src/orchestrator/worktree-manager.ts` | ✅ Done |
| C6 | `cleanupDangling` — prunes worktrees not matching active executions, skips non-ptah worktrees | `ptah/tests/unit/orchestrator/worktree-manager.test.ts` | `ptah/src/orchestrator/worktree-manager.ts` | ✅ Done |
| C7 | `cleanupDangling` — runs `git worktree prune` after sweep | `ptah/tests/unit/orchestrator/worktree-manager.test.ts` | `ptah/src/orchestrator/worktree-manager.ts` | ✅ Done |

### Phase D: Promotion Activities

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D1 | `promoteBacklogToInProgress` — normal flow: git mv, commit, push, returns updated path | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D2 | `promoteBacklogToInProgress` — idempotent skip: feature already in in-progress | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D3 | `promoteBacklogToInProgress` — not found error: feature not in backlog or in-progress | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D4 | `promoteBacklogToInProgress` — worktree destroyed in finally block (success and failure) | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D5 | `promoteInProgressToCompleted` — Phase 1: NNN assignment (max+1, zero-pad), folder move | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D6 | `promoteInProgressToCompleted` — Phase 1 idempotency: folder already exists in completed, skips move | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D7 | `promoteInProgressToCompleted` — NNN = "001" when completed/ is empty | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D8 | `promoteInProgressToCompleted` — NNN gap handling (e.g., 001, 003 → next is 004) | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D9 | `promoteInProgressToCompleted` — Phase 2: file rename (all files get NNN prefix, including overview.md) | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D10 | `promoteInProgressToCompleted` — Phase 2 idempotency: already-prefixed files are skipped | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D11 | `promoteInProgressToCompleted` — Phase 3: internal reference update (markdown links to renamed files) | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D12 | `promoteInProgressToCompleted` — Phase 3: cross-feature links left unchanged | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D13 | `promoteInProgressToCompleted` — Phase 3: parse error on internal ref update logs warning, continues | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |
| D14 | `promoteInProgressToCompleted` — worktree destroyed in finally block | `ptah/tests/unit/orchestrator/promotion-activity.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ✅ Done |

### Phase E: Workflow Integration — Context Resolution, Cross-Review Paths, Sign-Off

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E1 | Update `resolveContextDocuments` — uses `featurePath` from state for backlog/in-progress features | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| E2 | Update `resolveContextDocuments` — extracts NNN and applies prefix for completed features (all doc types including overview) | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| E3 | Update `crossReviewPath` — accepts `featurePath` instead of `featureSlug` | `ptah/tests/unit/orchestrator/cross-review-parser.test.ts` | `ptah/src/orchestrator/pdlc/cross-review-parser.ts` | ✅ Done |
| E4 | Update cross-review path construction in workflow (line 1076) — use `state.featurePath` | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| E5 | Update `buildInitialWorkflowState` — initialize `featurePath: null`, `worktreeRoot: null`, `signOffs: {}` | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| E6 | Sign-off tracking — record agent ID + timestamp in `state.signOffs` on LGTM | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| E7 | Completion promotion trigger — detect both `qa` + `pm` sign-offs, invoke promotion activity | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| E8 | Pre-invocation backlog promotion — detect backlog lifecycle, run promotion before skill invocation | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| E9 | `continue-as-new` handling — carry `featurePath` and `signOffs` in CAN payload; null `worktreeRoot` | `ptah/tests/unit/temporal/feature-lifecycle.test.ts` | `ptah/src/temporal/workflows/feature-lifecycle.ts` | ✅ Done |
| E10 | Add `resolveFeaturePath` thin activity — wraps `FeatureResolver.resolve()` for workflow determinism | `ptah/tests/unit/temporal/skill-activity.test.ts` | `ptah/src/temporal/activities/skill-activity.ts` | ✅ Done |

### Phase F: Activity Wiring — Skill Activity Updates and Composition Root

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F1 | Update `invokeSkill` activity — delegate worktree creation to `WorktreeManager.create()` | `ptah/tests/unit/temporal/skill-activity.test.ts` | `ptah/src/temporal/activities/skill-activity.ts` | ✅ Done |
| F2 | Update `SkillActivityDeps` — add `featureResolver`, `worktreeManager`, `fs` dependencies | `ptah/tests/unit/temporal/skill-activity.test.ts` | `ptah/src/temporal/activities/skill-activity.ts` | ✅ Done |
| F3 | Update composition root in `start.ts` — wire `DefaultFeatureResolver` + `DefaultWorktreeManager`; add startup cleanup | — | `ptah/bin/ptah.ts` | ✅ Done |

### Phase G: Migration Script

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| G1 | Pre-flight: error when `docs/` does not exist | `ptah/tests/unit/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |
| G2 | Pre-flight: error when working tree is not clean | `ptah/tests/unit/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |
| G3 | Pre-flight: error when lifecycle folders are already non-empty | `ptah/tests/unit/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |
| G4 | Create lifecycle directories with `.gitkeep` files | `ptah/tests/unit/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |
| G5 | Migrate completed features — move NNN-prefixed folders to `docs/completed/` | `ptah/tests/unit/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |
| G6 | Migrate in-progress features — move remaining folders to `docs/in-progress/` | `ptah/tests/unit/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |
| G7 | Skip non-feature directories (requirements/, templates/, open-questions/) | `ptah/tests/unit/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |
| G8 | Commit migration with correct message | `ptah/tests/unit/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |
| G9 | CLI entry point for migration script | — | `ptah/bin/ptah-migrate-lifecycle.ts` | ✅ Done |
| G10 | Integration test: full migration with real FS + git | `ptah/tests/integration/commands/migrate-lifecycle.test.ts` | `ptah/src/commands/migrate-lifecycle.ts` | ✅ Done |

### Phase H: Skill File Updates

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| H1 | Update PM SKILL.md — Phase 0 algorithm (Steps 3-8 paths to `docs/backlog/`, remove NNN logic) + File Organization section | — | `.claude/skills/product-manager/SKILL.md` | ✅ Done |
| H2 | Update Engineer SKILL.md — File Organization section + document path references | — | `.claude/skills/engineer/SKILL.md` | ✅ Done |
| H3 | Update Tech Lead SKILL.md — File Organization section + document path references | — | `.claude/skills/tech-lead/SKILL.md` | ✅ Done |
| H4 | Update Test Engineer SKILL.md — File Organization section + document path references | — | `.claude/skills/test-engineer/SKILL.md` | ✅ Done |

### Phase I: Integration Tests

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| I1 | Integration test: backlog→in-progress promotion pipeline (real FS + git) | `ptah/tests/integration/orchestrator/promotion-pipeline.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ⬚ Not Started |
| I2 | Integration test: in-progress→completed promotion pipeline (real FS + git, verify `git log --follow`) | `ptah/tests/integration/orchestrator/promotion-pipeline.test.ts` | `ptah/src/orchestrator/promotion-activity.ts` | ⬚ Not Started |

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

## 3. Task Dependency Notes

```
Phase A (Foundation)
  ├── A1 (types) ─────────────┐
  ├── A2 (registry) ──────────┤
  ├── A3 (gitMvInWorktree) ───┤
  ├── A4 (listDirInWorktree) ─┤
  ├── A5 (readDirMatching) ───┤  All A tasks can run in parallel.
  ├── A6 (fake resolver/mgr) ─┤  They are leaf-level type/interface changes.
  └── A7 (update fakes) ──────┘
           │
           ▼
Phase B (Feature Resolver)          Phase C (WorktreeManager)
  B1..B8 depend on A2, A5, A6       C1..C7 depend on A2, A3, A4, A6, A7
  B tasks are sequential (TDD)       C tasks are sequential (TDD)
  B and C are independent of         B and C can run in parallel.
  each other.
           │                              │
           ▼                              ▼
Phase D (Promotion Activities)
  D1..D14 depend on B (resolver) + C (worktree manager) + A3 (gitMv)
  D tasks are sequential (TDD)
           │
           ▼
Phase E (Workflow Integration)
  E1..E4 depend on B (resolver for featurePath pattern)
  E5 depends on A1 (new state fields)
  E6..E9 depend on D (promotion activities)
  E10 depends on B (resolver)
  E tasks are sequential within phase.
           │
           ▼
Phase F (Activity Wiring + Composition Root)
  F1..F3 depend on B, C, D, E (all new modules must exist)
           │
           ▼
Phase G (Migration Script)          Phase H (Skill File Updates)
  G1..G10 depend on A3, A5          H1..H4 have no code dependencies.
  G is independent of D, E, F.       H can run in parallel with G.
  G can start after Phase A.         H can start after Phase A.
  (Listed here for logical order)    (Listed last for logical grouping)
           │                              │
           ▼                              ▼
Phase I (Integration Tests)
  I1..I2 depend on D (promotion) + B (resolver) + C (worktree manager)
  Run after Phase D is complete.
```

**Parallelization opportunities:**
- Phases B and C are fully independent — can be implemented in parallel.
- Phases G and H are independent of D/E/F — can start as soon as Phase A is done.
- Phase I can start as soon as Phase D is done.

## 4. Integration Points

### Existing Code Affected

| File | Change | Phase |
|------|--------|-------|
| `ptah/src/temporal/types.ts` | Add 3 fields to `FeatureWorkflowState` | A1 |
| `ptah/src/orchestrator/worktree-registry.ts` | Extend `ActiveWorktree` type + interface | A2 |
| `ptah/src/services/git.ts` | Add 2 methods to `GitClient` + `NodeGitClient` | A3, A4 |
| `ptah/src/services/filesystem.ts` | Add `readDirMatching` to `FileSystem` + `NodeFileSystem` | A5 |
| `ptah/tests/fixtures/factories.ts` | Add `FakeFeatureResolver`, `FakeWorktreeManager`; update `FakeGitClient`, `FakeFileSystem`, `FakeWorktreeRegistry` | A6, A7 |
| `ptah/src/orchestrator/pdlc/cross-review-parser.ts` | `crossReviewPath` param: `featureSlug` → `featurePath` | E3 |
| `ptah/src/temporal/workflows/feature-lifecycle.ts` | Replace `resolveContextDocuments`, add sign-off + promotion logic | E1–E9 |
| `ptah/src/temporal/activities/skill-activity.ts` | Delegate worktree to `WorktreeManager`; add `resolveFeaturePath` activity; update `SkillActivityDeps` | E10, F1, F2 |
| `ptah/src/commands/start.ts` | Wire new deps in composition root; add startup cleanup | F3 |
| `.claude/skills/product-manager/SKILL.md` | Phase 0 algorithm + File Organization | H1 |
| `.claude/skills/engineer/SKILL.md` | File Organization section | H2 |
| `.claude/skills/tech-lead/SKILL.md` | File Organization section | H3 |
| `.claude/skills/test-engineer/SKILL.md` | File Organization section | H4 |

### Regression Risk

- **Existing `resolveContextDocuments` tests** (D14 in feature-lifecycle.test.ts): These tests use `featurePrefix` which is being replaced by `featurePath`. All existing tests must be updated in E1/E2 to use the new `ContextResolutionContext` shape.
- **Existing `crossReviewPath` tests**: Must be updated in E3 when the parameter changes from `featureSlug` to `featurePath`.
- **Existing `invokeSkill` activity tests**: Must be updated in F1 when worktree creation is delegated to `WorktreeManager`.
- **Existing `WorktreeRegistry` consumers**: Code that calls `register(worktreePath, branch)` must be updated to pass the full `ActiveWorktree` object.

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria (REQ-FS-01..04, REQ-PR-01..05, REQ-SK-01..08, REQ-MG-01..04, REQ-WT-01..05, REQ-NF-01, REQ-NF-02). **Note:** REQ-NF-03 (P2 — legacy path fallback) is intentionally deferred per TSPEC §9.3; it is not implemented in this plan.
- [ ] Implementation matches TSPEC v1.2 (protocols, algorithms, error handling, test doubles)
- [ ] Existing tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review
