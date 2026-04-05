# Cross-Review: Test Engineer -- Implementation Review

## Feature Lifecycle Folders

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Review Type** | Post-implementation code review (testing perspective) |
| **Date** | April 5, 2026 |
| **Branch** | `feat-feature-lifecycle-folders` |
| **PROPERTIES Version** | v1.2 (105 properties) |

---

## Test Suite Status

All tests pass. The full suite completed in 9.50 seconds:

- **54 test files** passed (0 failed)
- **1037 tests** passed, **1 skipped** (1038 total)
- No flaky or intermittent failures observed

---

## Coverage Analysis

### Well-Covered Property Categories

| Category | Assessment | Notes |
|----------|------------|-------|
| **Functional -- Feature Resolver (PROP-FS/SK)** | Strong | `feature-resolver.test.ts` covers search order (B1-B4), NNN prefix stripping (B3), trailing slash normalization (B7), empty/missing dirs (B8), and multi-match warning (B5). Maps cleanly to PROP-SK-02, SK-03, SK-04, SK-08, SK-09, SK-10, SK-11, SK-15, SK-17, SK-18. |
| **Functional -- Promotion (PROP-PR)** | Strong | `promotion-activity.test.ts` covers backlog-to-IP (D1), idempotent skip (D2), not-found error (D3), worktree cleanup in finally (D4), NNN assignment max+1 (D5), NNN idempotency (D6), NNN=001 (D7), gap handling (D8), Phase 2 file rename (D9), Phase 2 idempotency (D10), Phase 3 internal ref update (D11), cross-feature links unchanged (D12), Phase 3 parse error handling (D13), and git mv failure (PROP-PR-12). Maps to PROP-PR-01 through PR-09, PR-16 through PR-19, PR-25, PR-26, and many negative/idempotency properties. |
| **Functional -- Worktree Manager (PROP-WT)** | Strong | `worktree-manager.test.ts` covers creation (C1), UUID retry on collision (C2), double-failure throw (C3), destroy happy path (C4), destroy-swallows-error (C5), cleanupDangling with active/dangling/non-ptah discrimination (C6), and prune-after-sweep (C7). Maps to PROP-WT-01, WT-02, WT-03, WT-04, WT-06, WT-07, WT-13, WT-14, WT-17, WT-18, WT-20. |
| **Functional -- Migration (PROP-MG)** | Strong | `migrate-lifecycle.test.ts` covers pre-flight (dirty tree, existing dirs, docs missing), lifecycle directory creation with .gitkeep, NNN-prefixed to completed, remaining to in-progress, skipping system dirs, commit message. Maps to PROP-MG-01 through MG-07, MG-10, MG-12, MG-13. |
| **Functional -- Workflow helpers** | Strong | `feature-lifecycle.test.ts` covers `resolveContextDocuments` for backlog/in-progress/completed paths (PROP-SK-23, SK-24, SK-25), `extractCompletedPrefix`, `recordSignOff`, `isCompletionReady` (PROP-SK-06, SK-07), `needsBacklogPromotion` (PROP-SK-05), `buildContinueAsNewPayload` (PROP-PR-24), and workflow determinism (no Date.now/Math.random/node:fs imports). |
| **Integration -- Promotion Pipeline** | Strong | `promotion-pipeline.test.ts` tests real git operations: backlog-to-IP folder move + push, idempotent re-run, IP-to-completed with NNN assignment, file rename with NNN prefix, and `git log --follow` history preservation (PROP-PR-27). |
| **Integration -- Migration** | Adequate | `migrate-lifecycle.test.ts` (integration) tests real git repo migration with commit verification. |
| **Contract** | Strong | Return types verified with `satisfies FeatureResolverResult`, `PromotionResult` shape assertions, `WorktreeHandle` fields, and `WorktreeRegistry` metadata in unit tests. |
| **Data Integrity** | Strong | NNN calculation, zero-padding, rename map construction, and regex matching all tested explicitly. |
| **Error Handling** | Mostly covered | See findings below for gaps. |
| **Negative** | Mostly covered | PROP-PR-21 (no rename on B2IP), PROP-PR-22 (no NNN reuse), PROP-PR-23 (cross-feature links unchanged), PROP-SK-17 (no throw on not-found), PROP-SK-18 (no fallback to main root), PROP-WT-17 (fresh worktree per activity), PROP-MG-12 (system dirs excluded), PROP-MG-13 (no renumber). |

### Categories with Gaps

| Category | Gap | Severity |
|----------|-----|----------|
| Error Handling | PROP-PR-13 (retryable error on push failure) has no test | Medium |
| Error Handling | PROP-WT-08 (cleanupDangling when Temporal unreachable) has no test | Medium |
| Error Handling | PROP-MG-08 (rename conflict on duplicate name) has no test | Medium |
| Functional | PROP-NF-01 (legacy fallback to `docs/{slug}/` when lifecycle folders missing) has no test | Low |
| Functional | PROP-SK-01 (PM skill Phase 0 creates in backlog/) has no test | Low |
| Negative | PROP-SK-16 (architectural constraint: only FeatureResolver constructs paths) has no test | Low |
| Negative | PROP-SK-19 (activities must not re-invoke resolver when path in state) is not directly tested | Low |
| Negative | PROP-SK-20 (Claude agents must not execute promotions directly) is not directly tested | Low |
| Negative | PROP-WT-15 (must not modify main working tree) is not directly tested | Low |
| Negative | PROP-WT-16 (concurrent skills must not share worktree) is not directly tested | Low |
| Integration | PROP-SK-12, SK-13, SK-14 (workflow stores featurePath, activities use path.join, crossReviewPath uses featurePath) are tested indirectly via workflow helper tests but lack a direct integration test showing end-to-end state flow | Low |
| Integration | PROP-WT-09 (resolver searches under worktreeRoot, not main tree) is implicitly tested but not labeled | Low |
| Integration | PROP-WT-11, WT-12 (composition root wiring) have no test | Low |
| Integration | PROP-WT-21 (startup crash-recovery with real dangling worktrees) has no dedicated integration test | Low |
| Integration | PROP-NF-05 (partial Phase 1 + Phase 2 retry produces identical final state) has no integration test | Low |
| Observability | PROP-MG-11 (migration summary output) has no explicit assertion on summary format | Low |

---

## Findings

### F-01: No test for PROP-PR-13 -- retryable error on push failure (Medium)

**Property:** `PROP-PR-13` -- Both promotion activities must throw a retryable `ApplicationFailure` when `git push` fails (remote conflict).

**File:** `ptah/tests/unit/orchestrator/promotion-activity.test.ts`

**Issue:** There is no test that sets `gitClient.pushInWorktreeError` to simulate a push failure and asserts that the thrown error is a retryable `ApplicationFailure` (as opposed to non-retryable). The test for `PROP-PR-12` (git mv failure) exists at line 525, but the analogous push-failure test is absent. This distinction matters because Temporal retries retryable failures but permanently fails non-retryable ones -- incorrect classification would cause the wrong runtime behavior.

**Recommendation:** Add tests for both `promoteBacklogToInProgress` and `promoteInProgressToCompleted` that inject a push error and verify `(err as { nonRetryable: boolean }).nonRetryable === false` (or that the error lacks the `nonRetryable` flag entirely).

---

### F-02: No test for PROP-WT-08 -- cleanupDangling when Temporal unreachable (Medium)

**Property:** `PROP-WT-08` -- `WorktreeManager.cleanupDangling` must log a warning and skip the cleanup sweep when the Temporal server is unreachable during startup.

**File:** `ptah/tests/unit/orchestrator/worktree-manager.test.ts`

**Issue:** The `cleanupDangling` tests (C6, C7) only cover the happy path where `listWorktrees()` succeeds. There is no test simulating `listWorktrees()` throwing (e.g., Temporal client connection failure) and verifying that the method logs a warning rather than propagating the exception. This is a P0 error-handling property.

**Recommendation:** Add a test that sets `gitClient.listWorktreesError` (may need to add this injection point to `FakeGitClient`) and asserts that `cleanupDangling` resolves without throwing and produces a warning log.

---

### F-03: No test for PROP-MG-08 -- rename conflict during migration (Medium)

**Property:** `PROP-MG-08` -- `MigrateLifecycleCommand` must exit with code 1 when a file-rename conflict occurs (duplicate name after NNN-prefix stripping).

**File:** `ptah/tests/unit/commands/migrate-lifecycle.test.ts`

**Issue:** None of the G1-G8 test groups cover the scenario where two folders would collide after stripping NNN prefixes (e.g., `docs/my-feature/` and `docs/001-my-feature/` both mapping to `my-feature`). This is a P0 error-handling property.

**Recommendation:** Add a test with both `docs/my-feature` and `docs/001-my-feature` as inputs and verify the command throws or exits with an appropriate error message about the naming conflict.

---

### F-04: PROP-PR-12 test does not verify non-retryable classification (Low)

**Property:** `PROP-PR-12` -- Both promotion activities must throw `ApplicationFailure.nonRetryable` when `git mv` fails.

**File:** `ptah/tests/unit/orchestrator/promotion-activity.test.ts`, line 525-538

**Issue:** The test at line 525 asserts `(err as Error).message.toContain("git mv")` but does not verify that the error has `nonRetryable: true`, unlike the D3 test (line 147-157) which properly checks both `name === "ApplicationFailure"` and `nonRetryable === true`. This makes the test weaker than the property requires. Currently the implementation re-throws the raw git error rather than wrapping it in `ApplicationFailure.nonRetryable`, so the test may be passing for the wrong reason.

**Recommendation:** Add assertions for `(err as Error).name === "ApplicationFailure"` and `(err as { nonRetryable: boolean }).nonRetryable === true` to the PROP-PR-12 test. Also verify the implementation wraps git mv errors in `ApplicationFailure.nonRetryable`.

---

### F-05: PROP-PR-14 test exists but is incomplete -- only tests promoteInProgressToCompleted (Low)

**Property:** `PROP-PR-14` -- `promoteInProgressToCompleted` must throw `ApplicationFailure.nonRetryable` when `docs/completed/` is unreadable.

**File:** `ptah/tests/unit/orchestrator/promotion-activity.test.ts`, line 553+

**Issue:** The test description references PROP-PR-14 (confirmed by grep), but the implementation uses `safeReadDir` (line 302 of `promotion-activity.ts`) which catches errors and returns an empty array. This means an unreadable `completed/` would silently default to NNN=001 rather than throw. The test and implementation may not align with the property's intent.

**Recommendation:** Verify whether the PROPERTIES document intends this to be a hard failure (as stated) or a graceful degradation. If it should be a hard failure, the implementation needs to be updated to throw when `completed/` exists but is unreadable.

---

### F-06: FakeWorktreeManager.create returns featureBranch as branch, not a ptah-wt-{uuid} branch (Low)

**File:** `ptah/tests/fixtures/factories.ts`, line 1473

**Issue:** `FakeWorktreeManager.create` returns `{ path: "/tmp/ptah-wt-fake-N/", branch: featureBranch }` where `branch` is the feature branch name (e.g., `feat-my-feature`). The real `DefaultWorktreeManager` returns a unique `ptah-wt-{uuid}` branch name (as tested in `worktree-manager.test.ts` C1). This discrepancy means tests using `FakeWorktreeManager` operate against a different branch naming contract than production.

**Recommendation:** Update `FakeWorktreeManager.create` to return `branch: "ptah-wt-fake-N"` to match the production behavior more closely. This is low severity because no current test depends on the branch name from the fake.

---

## Clarification Questions

### Q-01: PROP-PR-14 vs safeReadDir behavior

The PROPERTIES document states that `promoteInProgressToCompleted` must throw `ApplicationFailure.nonRetryable` when `docs/completed/` is unreadable (PROP-PR-14). However, the implementation wraps the `readDir` call in `safeReadDir` which returns `[]` on any error. Should this be treated as a bug in the implementation, or should PROP-PR-14 be revised to reflect the graceful-degradation design?

### Q-02: PROP-SK-01 testing approach

PROP-SK-01 (PM skill Phase 0 creates features in `backlog/`) describes behavior that exists in the PM skill's init template, not in the feature-lifecycle-folders implementation files. Should this property be tested here, or is it expected to be covered by existing PM skill tests?

---

## Positive Observations

1. **Test isolation is excellent.** All unit tests use `FakeFileSystem`, `FakeGitClient`, `FakeWorktreeManager`, and `FakeLogger` with no cross-test state leakage. Each test sets up its own preconditions.

2. **Test doubles are well-designed.** `FakeFileSystem` faithfully simulates directory/file state with `addExistingDir`/`addExisting`/`getFile` methods. `FakeGitClient` provides fine-grained error injection points (`gitMvInWorktreeError`, `pushInWorktreeError`, etc.) and call tracking arrays. `FakeWorktreeRegistry` correctly implements the `WorktreeRegistry` interface.

3. **Integration tests use real git operations.** The promotion pipeline integration tests (`promotion-pipeline.test.ts`) create actual git repos with bare remotes, perform real `git mv` + commit + push operations, and verify `git log --follow` history preservation. This is the correct level for PROP-PR-27 and PROP-PR-10.

4. **Idempotency is thoroughly tested.** Both backlog-to-IP idempotent skip (D2) and completed Phase 1/Phase 2 idempotency (D6, D10) are covered at the unit level, and backlog-to-IP idempotency is also verified at the integration level.

5. **Workflow determinism test (PROP-TF-89) is creative and valuable.** The static analysis test that scans the workflow source file for banned APIs (`Date.now`, `Math.random`, `node:fs` imports) is an effective guardrail against non-determinism bugs.

6. **`resolveContextDocuments` has comprehensive coverage** for all six document types across all three lifecycle states, with NNN prefix extraction tested via `extractCompletedPrefix`.

7. **Tests are fast.** The entire suite of 1037 tests runs in under 10 seconds, with unit tests completing in milliseconds.

8. **Sign-off and completion-readiness logic is well-tested.** `recordSignOff` immutability, `isCompletionReady` with various sign-off combinations, and `buildContinueAsNewPayload` carry-forward behavior all have explicit tests.

---

## Recommendation

**Needs revision.**

Three Medium-severity findings (F-01, F-02, F-03) identify missing test coverage for P0 properties:
- PROP-PR-13: retryable push error classification (Medium)
- PROP-WT-08: cleanupDangling graceful degradation when Temporal unreachable (Medium)
- PROP-MG-08: migration rename conflict detection (Medium)

These are all error-handling properties at P0 priority that have zero test coverage. Adding tests for these three properties would bring the implementation to an approvable state.

---

*End of Review*
