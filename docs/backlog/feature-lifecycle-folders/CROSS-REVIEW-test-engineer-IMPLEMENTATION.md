# Cross-Review: Test Engineer -- Implementation Review (v2 Re-Review)

## Feature Lifecycle Folders

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Review Type** | Re-review of implementation fixes (v2) |
| **Date** | April 5, 2026 |
| **Branch** | `feat-feature-lifecycle-folders` |
| **Fix Commits** | `1cb3772`, `823f0b0` |
| **Base Comparison** | `bd27db4..823f0b0` |

---

## Test Suite Status

All tests pass:

- **55 test files**, **1051 passed**, 1 skipped, 0 failures
- Duration: 9.86s
- No regressions introduced by the fix commits

---

## Prior Findings Resolution Status

| ID | Severity | Property | Finding Summary | Status |
|----|----------|----------|-----------------|--------|
| F-01 | Medium | PROP-PR-13 | No test for retryable `ApplicationFailure` on `git push` failure | **Resolved** |
| F-02 | Medium | PROP-WT-08 | No test for `cleanupDangling` graceful degradation when Temporal unreachable | **Resolved** |
| F-03 | Medium | PROP-MG-08 | No test for migration rename conflict (NNN-prefix collision) | **Resolved** |
| F-04 | Low | PROP-PR-12 | Test didn't verify `ApplicationFailure.nonRetryable` classification on `git mv` failure | **Resolved** |
| F-05 | Low | PROP-PR-14 | Implementation uses `safeReadDir` fallback vs. property's `ApplicationFailure.nonRetryable` throw | **Partially Resolved** |
| F-06 | Low | — | `FakeWorktreeManager` branch name hardcoded to `"main"` | **Resolved** |

### Resolution Details

#### F-01: PROP-PR-13 — Retryable push failure (Resolved)

Two new tests added in `ptah/tests/unit/orchestrator/promotion-activity.test.ts` under `"PROP-PR-13: push failure is retryable (not nonRetryable)"`:

- `promoteBacklogToInProgress throws retryable error on push failure` (line ~569): Sets `gitClient.pushInWorktreeError`, catches the error, and asserts `errObj.nonRetryable` is NOT `true`. This correctly verifies the Temporal retry distinction.
- `promoteInProgressToCompleted throws retryable error on push failure` (line ~580): Same pattern for the completed promotion path.

Both tests explicitly verify the retryable/nonRetryable classification, which is the critical Temporal behavior concern.

#### F-02: PROP-WT-08 — cleanupDangling graceful degradation (Resolved)

Two new tests in `ptah/tests/unit/orchestrator/worktree-manager.test.ts` under `"PROP-WT-08: cleanupDangling graceful degradation"`:

- `logs warning and does not throw when listWorktrees fails` (line ~200): Sets `gitClient.listWorktreesError`, asserts `resolves.toBeUndefined()`, and verifies WARN log contains "Skipping worktree cleanup" with the original error message.
- `does not call pruneWorktrees when listWorktrees fails` (line ~211): Verifies `gitClient.prunedPrefixes` is empty, confirming no downstream side effects.

Source change in `ptah/src/orchestrator/worktree-manager.ts` wraps `listWorktrees()` in try/catch with a warn log and early return. Clean implementation.

#### F-03: PROP-MG-08 — Migration rename conflict (Resolved)

Two new tests in `ptah/tests/unit/commands/migrate-lifecycle.test.ts` under `"PROP-MG-08: rename conflict"`:

- `detects when two NNN-prefixed folders map to the same slug in completed/` (line ~319): Creates `docs/001-my-feature` and `docs/002-my-feature`, verifies both are moved independently (`completedMoved === 2`). This correctly validates that NNN-prefixed folders retain their distinct prefixes in `completed/`.
- `detects when an unnumbered folder collides with an NNN-prefixed folder's slug in in-progress` (line ~333): Creates `docs/001-my-feature` and `docs/my-feature`, verifies they route to different lifecycle folders (1 completed, 1 in-progress). No actual collision.

The tests confirm the implementation's collision-avoidance strategy rather than testing for an error path, which is appropriate given the design (NNN prefixes are preserved, preventing collisions).

#### F-04: PROP-PR-12 — nonRetryable classification on git mv failure (Resolved)

Two new tests in `ptah/tests/unit/orchestrator/promotion-activity.test.ts` under `"PROP-PR-12: git mv failure throws nonRetryable"`:

- `promoteBacklogToInProgress throws nonRetryable ApplicationFailure when git mv fails` (line ~527): Verifies `errObj.name === "ApplicationFailure"`, `errObj.nonRetryable === true`, and message contains "git mv failed".
- `promoteInProgressToCompleted throws nonRetryable ApplicationFailure when git mv fails during folder move` (line ~541): Same assertions for the completed path.

Source code in `ptah/src/orchestrator/promotion-activity.ts` now wraps all three `gitMvInWorktree` call sites in try/catch and rethrows as `ApplicationFailure.nonRetryable(...)`. Complete coverage.

#### F-05: PROP-PR-14 — safeReadDir vs. nonRetryable throw (Partially Resolved)

Two tests added under `"PROP-PR-14: completed/ unreadable"`:

- `promoteInProgressToCompleted treats unreadable completed/ as empty (safeReadDir returns [])` (line ~601): **This test has an empty body** -- no `await`, no assertions. It is purely a comment block explaining the design rationale. While the comment correctly describes the TSPEC vs. PROPERTIES mismatch, an empty test is misleading because it will always pass.
- `promoteInProgressToCompleted throws when Phase 2 listDirInWorktree fails` (line ~613): Sets `gitClient.listDirInWorktreeError` and asserts the error propagates. This correctly tests the downstream failure path.

The design decision (safeReadDir graceful degradation vs. nonRetryable throw) is documented in the test comment, which addresses the finding's concern. However, the empty test body is a minor issue.

#### F-06: FakeWorktreeManager branch name (Resolved)

`FakeWorktreeManager.create()` in `ptah/tests/fixtures/factories.ts` (line ~1476) now returns `branch: \`ptah-wt-fake-${this.worktreeCounter}\`` instead of `"main"`. This correctly mirrors `DefaultWorktreeManager.create()` which returns a unique worktree branch name (`ptah-wt-${uuid}`), not the feature branch.

---

## New Findings

| ID | Severity | Location | Finding |
|----|----------|----------|---------|
| F-07 | Low | `promotion-activity.test.ts:601` | Empty test body for PROP-PR-14 safeReadDir path |

### F-07 (Low): Empty test body for PROP-PR-14 safeReadDir graceful degradation

**File:** `ptah/tests/unit/orchestrator/promotion-activity.test.ts`, line 601

The test `"promoteInProgressToCompleted treats unreadable completed/ as empty (safeReadDir returns [])"` has no executable statements -- no `await`, no `expect`. It reads as documentation but will always pass regardless of implementation changes. This should either:

1. Be converted to an actual test that sets up a filesystem where `completed/` is unreadable and verifies the NNN defaults to `001`, or
2. Be renamed to a `// TODO` comment or `it.todo(...)` to make the "not yet implemented" status explicit.

---

## Positive Observations

1. **Thorough error classification testing.** The new PROP-PR-12 and PROP-PR-13 tests form a clear retryable/nonRetryable boundary, which is essential for correct Temporal retry behavior.

2. **Source code hardened.** All three `gitMvInWorktree` call sites in `promotion-activity.ts` are now wrapped with `ApplicationFailure.nonRetryable`, while push errors correctly propagate as retryable. This is a meaningful correctness improvement.

3. **Architecture fitness test added.** The new `architecture-constraints.test.ts` (PROP-SK-16) enforces that lifecycle path construction is confined to `FeatureResolver`, `promotion-activity.ts`, and `migrate-lifecycle.ts`. This is a valuable structural guard.

4. **Integration test for idempotent retry.** The new `PROP-NF-05` integration test in `promotion-pipeline.test.ts` simulates a crash after partial Phase 1 completion and verifies the retry produces the correct final state. This is a high-value test for production resilience.

5. **Clean factory updates.** The `FakeGitClient` gained `listWorktreesError` and `pushInWorktreeError` hooks following the established pattern, keeping the test infrastructure consistent.

---

## Recommendation

**Approved with minor changes.**

All 6 prior findings are resolved or adequately addressed. The single new finding (F-07) is Low severity -- an empty test body that should be converted to `it.todo()` or given actual assertions. No High or Medium issues remain.
