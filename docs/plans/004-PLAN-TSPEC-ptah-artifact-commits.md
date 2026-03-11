# Execution Plan: Phase 4 — Artifact Commits

| Field | Detail |
|-------|--------|
| **Technical Specification** | [004-TSPEC-ptah-artifact-commits](../specifications/004-TSPEC-ptah-artifact-commits.md) |
| **Functional Specification** | [004-FSPEC-ptah-artifact-commits](../specifications/004-FSPEC-ptah-artifact-commits.md) |
| **Requirements** | [REQ-SI-05], [REQ-SI-06], [REQ-SI-09], [REQ-SI-13], [REQ-NF-03], [REQ-NF-05] |
| **Date** | March 10, 2026 |
| **Status** | In Progress |

---

## 1. Summary

Implements the Phase 4 artifact persistence pipeline: commit → merge → cleanup → log, with message deduplication. 4 new modules (ArtifactCommitter, AgentLogWriter, MergeLock, MessageDeduplicator), 3 updated modules (SkillInvoker, ContextAssembler, Orchestrator), protocol extensions (GitClient, FileSystem), and type/test infrastructure updates.

---

## 2. TE Review Items Incorporated

From the Test Engineer review (v1.1 feedback addressed in TSPEC):

- Branch-already-exists guard added to orchestrator algorithm (TE-F-01)
- Non-docs warning log added to ArtifactCommitter docs filter (TE-F-02)
- `merge-error` → `"conflict"` log status mapping fixed (TE-F-03)
- Renamed "retry on lock" → "retry on write failure" test category (TE-F-05)
- Added concurrent log serialization integration test (TE-F-06)
- Added malformed message (no ID) test category (TE-F-08)
- Added malformed log file test category (TE-F-09)
- `formatAgentName()` derives display name for log file header (TE-Q-02)

---

## 3. Task List

### Phase A: Types & Protocol Extensions

Type definitions and protocol extensions. No TDD cycle — validated by compiler and downstream tests.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add Phase 4 types to `types.ts`: `MergeResult`, `CommitParams`, `CommitResult`, `LogStatus`, `LogEntry` | — | `ptah/src/types.ts` | ✅ Done |
| 2 | Remove `worktreePath` and `branch` fields from `InvocationResult` in `types.ts` | — | `ptah/src/types.ts` | ✅ Done |
| 3 | Extend `GitClient` protocol with Phase 4 methods: `addInWorktree`, `commitInWorktree`, `merge`, `abortMerge`, `getShortSha`, `hasUnmergedCommits`, `diffWorktreeIncludingUntracked`, `branchExists` | — | `ptah/src/services/git.ts` | ✅ Done |
| 4 | Extend `FileSystem` protocol with `appendFile(path, content): Promise<void>` | — | `ptah/src/services/filesystem.ts` | ✅ Done |
| 5 | Define `MergeLock` protocol and `MergeLockTimeoutError` in new file `src/orchestrator/merge-lock.ts` | — | `ptah/src/orchestrator/merge-lock.ts` | ✅ Done |
| 6 | Define `ArtifactCommitter` protocol in new file `src/orchestrator/artifact-committer.ts` | — | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 7 | Define `AgentLogWriter` protocol in new file `src/orchestrator/agent-log-writer.ts` | — | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 8 | Define `MessageDeduplicator` protocol in new file `src/orchestrator/message-deduplicator.ts` | — | `ptah/src/orchestrator/message-deduplicator.ts` | ✅ Done |

### Phase B: Test Doubles

New fakes and extensions to existing fakes.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 9 | Extend `FakeGitClient` with Phase 4 methods: `addInWorktree`, `commitInWorktree`, `merge`, `abortMerge`, `getShortSha`, `hasUnmergedCommits`, `diffWorktreeIncludingUntracked`, `branchExists` with error injection fields | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 10 | Extend `FakeFileSystem` with `appendFile` method and `appendFileError` injection | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 11 | Implement `FakeMergeLock` — records acquire/release calls, supports `acquireError` injection | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 12 | Implement `FakeArtifactCommitter` — sequential results via `callIndex`, records `commitAndMergeCalls` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 13 | Implement `FakeAgentLogWriter` — records entries, supports `appendError` injection | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 14 | Implement `FakeMessageDeduplicator` — Set-based dedup, `duplicateIds` pre-population | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 15 | Update `FakeSkillInvoker` — new `invoke(bundle, config, worktreePath)` signature, remove `worktreePath`/`branch` from result | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 16 | Update `FakeContextAssembler` — add optional `worktreePath` to `assembleCalls` recording | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |

### Phase C: MergeLock (AsyncMutex)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 17 | MergeLock — basic acquire/release: acquire succeeds, release frees lock | `ptah/tests/unit/orchestrator/merge-lock.test.ts` | `ptah/src/orchestrator/merge-lock.ts` | ✅ Done |
| 18 | MergeLock — serialization: second acquire waits until first released | `ptah/tests/unit/orchestrator/merge-lock.test.ts` | `ptah/src/orchestrator/merge-lock.ts` | ✅ Done |
| 19 | MergeLock — timeout: throws MergeLockTimeoutError after configured ms | `ptah/tests/unit/orchestrator/merge-lock.test.ts` | `ptah/src/orchestrator/merge-lock.ts` | ✅ Done |
| 20 | MergeLock — FIFO ordering: multiple waiters served in order | `ptah/tests/unit/orchestrator/merge-lock.test.ts` | `ptah/src/orchestrator/merge-lock.ts` | ✅ Done |
| 21 | MergeLock — release on every path: lock released even when holder errors (try/finally) | `ptah/tests/unit/orchestrator/merge-lock.test.ts` | `ptah/src/orchestrator/merge-lock.ts` | ✅ Done |

### Phase D: MessageDeduplicator

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 22 | MessageDeduplicator — new message: returns false, adds to set | `ptah/tests/unit/orchestrator/message-deduplicator.test.ts` | `ptah/src/orchestrator/message-deduplicator.ts` | ✅ Done |
| 23 | MessageDeduplicator — duplicate: returns true on second call with same ID | `ptah/tests/unit/orchestrator/message-deduplicator.test.ts` | `ptah/src/orchestrator/message-deduplicator.ts` | ✅ Done |
| 24 | MessageDeduplicator — different IDs: different IDs are independent | `ptah/tests/unit/orchestrator/message-deduplicator.test.ts` | `ptah/src/orchestrator/message-deduplicator.ts` | ✅ Done |

### Phase E: ArtifactCommitter

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 25 | ArtifactCommitter — no changes: empty artifactChanges returns `no-changes`, no git operations | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 26 | ArtifactCommitter — happy path: commit + merge success, worktree cleaned up, correct CommitResult | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 27 | ArtifactCommitter — commit message format: `[ptah] {Agent}: {description}` with em-dash extraction | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 28 | ArtifactCommitter — commit message fallback: thread name without em dash uses full name | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 29 | ArtifactCommitter — docs filter: only docs/ changes staged, non-docs filtered with warning logged | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 30 | ArtifactCommitter — all non-docs filtered: returns no-changes when all changes are non-docs | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 31 | ArtifactCommitter — merge conflict: conflict detected, worktree retained, lock released | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 32 | ArtifactCommitter — commit failure (git add): returns commit-error, no merge lock acquired | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 33 | ArtifactCommitter — commit failure (git commit): returns commit-error, no merge lock acquired | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 34 | ArtifactCommitter — merge error: non-conflict failure, worktree retained, lock released | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 35 | ArtifactCommitter — lock timeout: MergeLockTimeoutError, worktree retained, commitSha preserved | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |
| 36 | ArtifactCommitter — cleanup failures: removeWorktree/deleteBranch fail, warnings logged, no throw | `ptah/tests/unit/orchestrator/artifact-committer.test.ts` | `ptah/src/orchestrator/artifact-committer.ts` | ✅ Done |

### Phase F: AgentLogWriter

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 37 | AgentLogWriter — happy path: entry appended with correct format, pipe escaping | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 38 | AgentLogWriter — all statuses: completed, completed (no changes), conflict, error each produce correct line | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 39 | AgentLogWriter — missing file: auto-created with header (display name derived from agentId), warning logged | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 40 | AgentLogWriter — malformed file: existing file without proper header, entry appended best-effort, warning logged | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 41 | AgentLogWriter — write failure: warning logged, no throw, pipeline continues | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 42 | AgentLogWriter — retry on write failure: first write fails, retries once after 100ms, succeeds | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 43 | AgentLogWriter — pipe escaping: `|` in thread name and summary escaped as `\|` | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 44 | AgentLogWriter — merge lock: lock acquired before write, released after (including on error) | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |
| 45 | AgentLogWriter — lock timeout: logs warning and returns (non-blocking), does not throw | `ptah/tests/unit/orchestrator/agent-log-writer.test.ts` | `ptah/src/orchestrator/agent-log-writer.ts` | ✅ Done |

### Phase G: Service Implementations (GitClient, FileSystem)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 46 | FileSystem — appendFile: appends to existing file, creates if missing | `ptah/tests/unit/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ✅ Done |
| 47 | GitClient — addInWorktree: runs git add in worktree cwd | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 48 | GitClient — commitInWorktree: runs git commit in worktree cwd, returns SHA | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 49 | GitClient — merge success: returns merged status | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 50 | GitClient — merge conflict: returns conflict status, merge --abort called | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 51 | GitClient — hasUnmergedCommits: true when branch has commits not on main | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 52 | GitClient — diffWorktreeIncludingUntracked: returns both tracked and untracked files | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |
| 53 | GitClient — branchExists: true when branch exists, false otherwise | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ✅ Done |

### Phase H: Updated Modules (SkillInvoker, ContextAssembler)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 54 | SkillInvoker — receives worktreePath: uses provided worktreePath, does not create worktree | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ✅ Done |
| 55 | SkillInvoker — no cleanup: worktree not removed in finally block, no branch deletion | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ✅ Done |
| 56 | SkillInvoker — diffWorktreeIncludingUntracked: uses new diff method to detect tracked + untracked files | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ✅ Done |
| 57 | ContextAssembler — worktree Layer 2: Layer 2 files read from worktreePath when provided | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ✅ Done |
| 58 | ContextAssembler — fallback to main: Layer 2 reads from main when worktreePath not provided | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ✅ Done |

### Phase I: Orchestrator Updates

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 59 | Update `OrchestratorDeps` with 4 new fields: `gitClient`, `artifactCommitter`, `agentLogWriter`, `messageDeduplicator` | — | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 60 | Update existing orchestrator tests to provide new deps (add fakes to test setup) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | — | ✅ Done |
| 61 | Orchestrator — dedup: duplicate message skipped, no routing/invocation | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 62 | Orchestrator — malformed message (no ID): message with no ID skipped, warning logged | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 63 | Orchestrator — flow reorder: worktree created before context assembly, worktreePath passed to assembler and invoker | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 64 | Orchestrator — branch-already-exists: leftover branch detected, regenerated invocationId or deleted | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 65 | Orchestrator — commit/merge success: full pipeline invoke → commit → merge → log → post → route | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 66 | Orchestrator — merge conflict continues: error embed posted, logger.error called, response still posted, routing continues | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 67 | Orchestrator — commit failure continues: error embed posted, worktree cleaned, response posted, routing continues | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 68 | Orchestrator — merge error continues: error embed posted, logger.error called, worktree retained | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 69 | Orchestrator — lock timeout: error embed posted, worktree retained | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 70 | Orchestrator — log entry always written: success, no-change, conflict, error all produce log entries with correct status | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 71 | Orchestrator — no-changes cleanup: worktree cleaned up when commitResult is no-changes | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 72 | Orchestrator — skill timeout: worktree cleaned, error log entry with "error", no commit | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 73 | Orchestrator — worktree creation failure: error embed posted, no cleanup needed | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |
| 74 | Orchestrator — orphan prune updated: committed worktrees flagged, uncommitted pruned | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |

### Phase J: Composition Root & Integration

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 75 | Update composition root in `bin/ptah.ts`: wire `AsyncMutex`, `DefaultArtifactCommitter`, `DefaultAgentLogWriter`, `InMemoryMessageDeduplicator` into orchestrator | — | `ptah/bin/ptah.ts` | ✅ Done |
| 76 | Integration — artifact pipeline: end-to-end invoke → commit → merge → log → cleanup using fakes for Discord/SkillClient but real implementations for ArtifactCommitter, AgentLogWriter, AsyncMutex | `ptah/tests/integration/orchestrator/artifact-pipeline.test.ts` | — | ✅ Done |
| 77 | Integration — concurrent log serialization: two concurrent AgentLogWriter.append() calls with real AsyncMutex, entries serialized without corruption | `ptah/tests/integration/orchestrator/artifact-pipeline.test.ts` | — | ✅ Done |

---

## 4. Task Dependency Notes

```
Phase A (Types & Protocols)
  │
  ├──→ Phase B (Test Doubles) ──→ Phase H (SkillInvoker, ContextAssembler updates)
  │                              │
  │                              └──→ Phase I (Orchestrator updates)
  │                                     │
  ├──→ Phase C (MergeLock) ──────────┐  │
  │                                  │  │
  ├──→ Phase D (MessageDeduplicator) │  │
  │                                  ▼  ▼
  ├──→ Phase E (ArtifactCommitter) ──→ Phase J (Composition Root & Integration)
  │
  ├──→ Phase F (AgentLogWriter) ─────→ Phase J
  │
  └──→ Phase G (Service Impls) ──────→ Phase J
```

- **Phase A** must complete first (all downstream phases depend on types/protocols)
- **Phase B** must complete before Phases H and I (updated fakes needed for test setup)
- **Phase C** (MergeLock) must complete before Phase E (ArtifactCommitter) and Phase F (AgentLogWriter) — they depend on MergeLock
- **Phases C, D, E, F, G** can run in parallel after their dependencies are met
- **Phase H** can run in parallel with C/D/E/F/G after Phase B completes
- **Phase I** depends on Phase B (updated fakes) and Phase H (updated SkillInvoker/ContextAssembler protocols)
- **Phase J** (integration) depends on all other phases completing

---

## 5. Integration Points with Phase 3

| # | Integration | Impact |
|---|-------------|--------|
| 1 | `SkillInvoker.invoke()` signature change | All existing SkillInvoker tests break — must update to new `(bundle, config, worktreePath)` signature |
| 2 | `InvocationResult` field removal | `worktreePath` and `branch` removed — all consumers updated |
| 3 | `OrchestratorDeps` extension | 4 new required fields — all existing orchestrator tests must provide fakes |
| 4 | `diffWorktree` → `diffWorktreeIncludingUntracked` | SkillInvoker switches detection method — existing SkillInvoker tests updated |
| 5 | Worktree lifecycle ownership transfer | SkillInvoker no longer creates/cleans worktrees — orchestrator owns this |
| 6 | `FakeSkillInvoker` update | New `invoke` signature, `result` type loses `worktreePath`/`branch` |

---

## 6. Definition of Done

- [x] All tasks completed and status updated to ✅
- [x] All tests pass (`npx vitest run`) — 0 failures (484 passed, 1 skipped)
- [ ] No skipped or pending tests (1 skipped in context-assembler)
- [ ] Code reviewed against requirement acceptance criteria
- [ ] Implementation matches TSPEC v1.1 (protocols, algorithms, error handling, test doubles)
- [x] Existing Phase 3 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done
