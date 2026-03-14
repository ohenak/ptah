# Cross-Review: Test Engineer — FSPEC-010

| Field | Detail |
|-------|--------|
| **Document Reviewed** | [010-FSPEC-ptah-parallel-feature-development](010-FSPEC-ptah-parallel-feature-development.md) |
| **Reviewer** | Test Engineer |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01 — Slug Derivation Edge Cases Are Undertested (Medium)

**Location:** FSPEC-FB-01 Edge Cases; Acceptance Tests AT-FB-01

The FSPEC defines two slug edge cases (all-special-characters → fallback, no em-dash separator → full name). The acceptance tests do not exercise the boundary between normal and edge slugs: there is no AT for the em-dash-stripping case using a concrete thread name with a suffix (the example in AT-FB-01 uses a thread name that happens to have a suffix, but the test only verifies branch creation, not the resulting slug). Specifically absent:

- No acceptance test for a thread name that produces a slug requiring hyphen-collapse (e.g., "My Feature ##2").
- No acceptance test for a thread name with leading/trailing special characters that would strip to empty and trigger the fallback slug.
- No acceptance test asserting the exact branch name produced from a thread name that contains an em-dash suffix (verifying the suffix is stripped and not included in the branch name).

Without these, a regression in slug derivation could produce an incorrectly named branch that never gets detected by the AT suite, because the ATs only verify that "some branch was created", not that the specific expected name was produced.

**Request:** Add at least two targeted acceptance tests:
1. `AT-FB-05`: Thread name with em-dash suffix → verify the suffix is excluded from the branch name (e.g., "010-parallel-feature-development — create TSPEC" → `feat-010-parallel-feature-development`, not `feat-010-parallel-feature-development-create-tspec`).
2. `AT-FB-06`: Thread name with only special characters → verify fallback branch name `feat-feature` is used.

---

### F-02 — No Negative Acceptance Tests for Branch Protection Rules (Medium)

**Location:** FSPEC-FB-01 BR-FB-02, BR-FB-03; FSPEC-MG-01 BR-MG-04

The FSPEC defines three critical "must never" rules with no corresponding acceptance tests:
- BR-FB-02: The feature branch MUST NEVER be reset, force-pushed, or deleted by the orchestrator.
- BR-FB-03: `main` MUST NEVER be the merge target.
- BR-MG-04: Merge MUST use `--no-ff`.

Positive tests verify that the happy path executes correctly. But without negative tests asserting these invariants, an implementation error (e.g., accidentally calling `git push --force`, or calling `git merge` without `--no-ff`) would produce a passing test suite while violating a business rule. Negative tests for these invariants are standard in CI pipelines (e.g., asserting that `pushWithForce` is never called, or that `gitClient.merge()` is never called with `main` as a target).

**Request:** Add acceptance tests that assert the invariant, not just the happy path:
1. `AT-FB-07`: After a successful merge-and-push cycle, assert that `main` has no new commits (observable via `git log --oneline main` before vs. after).
2. `AT-MG-06`: After a successful merge, assert a merge commit exists on the feature branch (i.e., `git log --merges --oneline feat-{slug}` returns a commit) — verifying `--no-ff` was honored.

---

### F-03 — Observable State for Conflict Worktree Is Insufficiently Specified (Medium)

**Location:** FSPEC-AB-01 AT-AB-04; FSPEC-MG-01 AT-MG-03

AT-AB-04 and AT-MG-03 both verify that the worktree is retained on conflict, but neither acceptance test specifies the observable MERGE_HEAD state that distinguishes a "retained conflict worktree" from a "retained worktree that was never involved in a merge". The THEN clauses read:

- AT-AB-04: "Agent B's worktree remains at its path in conflict state (MERGE_HEAD exists)" — MERGE_HEAD existence is mentioned parenthetically, but not as a testable assertion.
- AT-MG-03: "The merge exits with CONFLICT status" — does not specify how CONFLICT status is verified (git exit code, presence of conflict markers, MERGE_HEAD file).

A test engineer writing unit tests cannot determine from these ATs what "conflict state" looks like in the FakeGitClient or in a real git integration test. This ambiguity could lead to a test that asserts the worktree path still exists but does not check that the merge is actually in-progress (MERGE_HEAD present), allowing a false pass if the implementation incorrectly aborts the merge before retaining the worktree.

**Request:** Revise AT-AB-04 and AT-MG-03 THEN clauses to include explicit observable state:
- "The file `{worktree-path}/.git/MERGE_HEAD` exists (indicating the merge is in progress, not aborted)"
- "The conflicting files contain conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)"

---

### F-04 — Lock Timeout Test (AT-MG-02) Has a Timing Dependency (Low)

**Location:** FSPEC-MG-01 AT-MG-02

AT-MG-02 specifies:

```
GIVEN: Agent A holds the merge-lock
       AND Agent B has been waiting for the lock for more than 10,000ms
```

This GIVEN clause requires real elapsed time to be observable, making this acceptance test inherently time-dependent. In a unit test, the FakeGitClient and a mocked `AsyncMutex` can simulate lock contention without wall-clock delay, but the FSPEC acceptance test as written requires Agent B to actually wait 10,000ms — a 10-second test is unacceptable in a CI suite and would likely be skipped or mocked away, reducing confidence.

The TSPEC (Section 7.2) does show a FakeGitClient pattern, but the `AsyncMutex` is not faked — it is the real implementation, meaning lock-timeout tests in the unit layer will still take 10 seconds unless the timeout is injectable.

**Request:** Add a note to AT-MG-02 (or to FSPEC-MG-01 Business Rules BR-MG-02) stating that the 10,000ms timeout value must be injectable at test time (e.g., passed via `CommitParams` or `ArtifactCommitter` constructor) so unit tests can use a 1ms timeout to avoid 10-second CI delays.

---

### F-05 — Push Failure Acceptance Test (AT-FB-04) Does Not Verify Notification Content (Low)

**Location:** FSPEC-FB-01 AT-FB-04

AT-FB-04 verifies that:
1. A Discord message is posted with the worktree path and resolution instructions.
2. The worktree is NOT cleaned up.
3. The merged commit is present in the retained worktree.

The THEN clause does not specify what "with the worktree path and resolution instructions" means in observable terms. The Error Scenarios section above provides the exact Discord message template, but AT-FB-04 does not reference it. A test could pass by posting any Discord message and still satisfy the AT as written.

**Request:** Amend AT-FB-04's THEN clause to include the observable Discord notification fields: "the Discord message contains the feature branch name, the worktree path, and the resolution command `git pull origin feat-{slug} --rebase && git push origin feat-{slug}`." This makes the notification content a first-class assertion, not an implied one.

---

### F-06 — FSPEC-SK-01 Acceptance Tests Are Static Content Checks, Not Behavioral Tests (Low)

**Location:** FSPEC-SK-01 AT-SK-01, AT-SK-02

AT-SK-01 and AT-SK-02 are textual content checks ("I search for `git checkout`... and no results are found"). These are not behavioral acceptance tests — they verify the presence or absence of text strings in SKILL.md files rather than observable system behavior. While appropriate for a documentation compliance check, they provide no coverage for the runtime consequence of an agent violating the prohibition (e.g., an agent that ignores SKILL.md instructions and runs `git checkout` anyway).

This is a scope limitation acknowledged in the REQ (C-10-04), not a flaw. However, from a test strategy perspective, a note that these ATs are documentation-compliance checks (not behavioral tests) would clarify their scope and prevent a test engineer from searching for runtime behavioral assertions that do not exist.

**Request:** Add a parenthetical note to FSPEC-SK-01's Acceptance Tests section: "(These tests verify documentation compliance — that SKILL.md files contain the required content. Runtime enforcement of agent git behavior is outside scope for Phase 10.)"

---

## Clarification Questions

### Q-01 — What Is the Observable Distinction Between `merge-error` and `conflict` in the Acceptance Tests?

AT-MG-03 tests the conflict path. But there is no acceptance test for the `merge-error` (technical failure) path. The distinction — `mergeInWorktree` returning `"conflict"` vs. `"merge-error"` — is critical because they produce opposite worktree dispositions (retained vs. cleaned up). For a test engineer writing integration tests against a real git repository:

- How should a `merge-error` be induced? Corrupted objects are hard to reproduce reliably. Permission errors are platform-dependent.
- Is it acceptable in the TSPEC integration tests to simulate `merge-error` via the `FakeGitClient` only, with no real-git integration test for this path?

Knowing whether the FSPEC intends a real-git integration test for `merge-error` (and if so, how to induce it) is necessary before writing the TSPEC test cases.

---

### Q-02 — Is There a Specified Test for Multi-Instance Ptah Push Rejection?

AT-FB-04 tests push rejection when the remote advances. The FSPEC edge case (FSPEC-MG-01 §Edge Cases) notes that across multiple Ptah instances the post-merge push will fail with a rejected push. This is the multi-instance scenario. Is AT-FB-04 intended to also cover the multi-instance push rejection case, or is that a separate acceptance test that should be added? The distinction matters because testing multi-instance rejection requires either two real Ptah processes or a test that simulates a remote-advanced state between merge and push.

---

### Q-03 — Should the `featureNameToSlug` Fallback Value Be Confirmed Before Writing Tests?

The backend engineer's cross-review (F-03) flagged a discrepancy: the FSPEC specifies `"feature"` as the empty-slug fallback, but the existing implementation uses `"unnamed"`. The TSPEC notes the filter was removed but does not resolve the fallback value discrepancy for `featureNameToSlug`. Before writing unit tests for `feature-branch.ts`, the canonical fallback value must be confirmed. If the FSPEC is authoritative (`"feature"`), the implementation must change. If the implementation is authoritative (`"unnamed"`), the FSPEC must be updated. Either is fine, but the test engineer needs a single source of truth before writing the `featureNameToSlug` edge case test.

---

## Positive Observations

- **Who/Given/When/Then format is used consistently** across all acceptance tests in FSPEC-FB-01, FSPEC-AB-01, FSPEC-MG-01, and FSPEC-SK-01. Each AT has an explicit WHO (orchestrator vs. developer), making the actor clear for test scenario design.
- **Error Scenarios provide exact Discord message templates** (FSPEC-MG-01 §Discord Notification Content), which are directly usable as test oracle strings for notification content assertions. This level of precision is uncommon in FSPECs and materially reduces test authoring ambiguity.
- **The conflict vs. technical failure distinction** (BR-MG-03) is precisely defined with observable outcomes (worktree retained vs. cleaned up), making the two paths independently testable with clear pass/fail criteria.
- **AT-MG-01 (serial merge of two concurrent agents)** explicitly states the observable outcome: `git log --oneline feat-parallel-feature-development` shows BOTH agents' merge commits and neither is missing. This cross-agent invariant is a high-value integration test target.
- **AT-MG-04 and AT-MG-05** cover the pre-merge pull behavior for both the new-branch (no-op) and remote-advanced (pull required) cases. Both are independently testable and the GIVEN state for each is precisely described.
- **Business Rules table in each FSPEC** provides concise, numbered invariants that map directly to unit test cases. BR-AB-04, BR-AB-05, and BR-AB-06 together fully partition the worktree disposition logic across all outcome paths.
- **FSPEC-AB-01 AT-AB-02 (concurrent agent isolation)** uses two concrete agents (eng/a1b2c3d4 and qa/b5c6d7e8) with specific invocation IDs, making the test setup deterministic and directly implementable without additional design.
- **The `--no-ff` mandate in BR-MG-04** is a testable invariant: `git log --merges` on the feature branch after a successful merge must return a result. The TSPEC test example in Section 7.4 demonstrates this assertion pattern.

---

## Recommendation

**Approved with minor changes.** Three medium-severity findings (F-01, F-02, F-03) should be addressed before the TSPEC test cases are written. F-01 (missing slug edge case ATs) and F-02 (missing negative ATs for branch protection rules) represent gaps in acceptance test coverage that could allow behavioral regressions to pass the AT suite. F-03 (underspecified observable conflict state) creates ambiguity in what "conflict worktree retained" means at the assertion level. The three low-severity findings (F-04, F-05, F-06) are minor clarifications that improve test precision but do not block test writing. Q-03 (fallback slug value) must be resolved before `feature-branch.test.ts` is written; the answer is a one-line alignment between FSPEC and implementation.
