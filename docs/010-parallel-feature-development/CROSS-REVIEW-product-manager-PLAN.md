# Cross-Review: Product Manager — Execution Plan Review

| Field | Detail |
|-------|--------|
| **Document Reviewed** | `docs/010-parallel-feature-development/010-PLAN-TSPEC-ptah-parallel-feature-development.md` |
| **Reviewed By** | Product Manager |
| **Date** | March 14, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

The execution plan is well-structured, with a clean dependency graph, correctly sequenced phases, and thorough coverage of the implementation scope. All 17 requirements are represented by at least one task. Four product-level findings are noted — one requires a task addition before G-phase implementation (F-01), two flag gaps between the DoD's aspirational language and the actual task list (F-02, F-03), and one flags a REQ-SK-02 specificity gap in Phase H task descriptions (F-04).

---

## Findings

### F-01 — HIGH | G-08 Discord Conflict Notification Is Incomplete Relative to REQ-MG-02

**Location:** Phase G, task G-08 ("Enrich `conflict` handling")

**Finding:** REQ-MG-02 specifies four required elements in the conflict Discord notification:

1. The list of conflicting file paths
2. The absolute path to the retained worktree
3. The sub-branch name
4. The commands the developer should run: `cd {worktree-path} && git merge --continue` (after editing conflicted files) **or** `git merge --abort` to discard

G-08's test description reads: *"conflict embed now includes file list and worktree path."* Items 3 (sub-branch name) and 4 (resolution commands) are absent from the task spec and the acceptance test description. A developer implementing G-08 against this task description could pass the test without including the sub-branch name or the resolution commands — leaving the Discord notification incomplete and the developer without the information needed to resolve the conflict.

The sub-branch name is critical context: it tells the developer which agent's work is in conflict. The resolution commands are critical for discoverability — many developers will not know to run `git merge --continue` from the retained worktree without being told.

**Required action:** Update G-08's task description and test assertion to explicitly verify all four REQ-MG-02 notification elements:
- Conflict file list (already covered)
- Retained worktree absolute path (already covered)
- Sub-branch name (add)
- Resolution commands string (`git merge --continue` after editing, `git merge --abort` to discard) (add)

---

### F-02 — MEDIUM | Lock-Timeout Discord Notification Lacks an Orchestrator-Level Task

**Location:** Phase E (E-07), Phase F (F-02/F-03), Phase G (no corresponding task)

**Finding:** REQ-MG-04 requires the Discord lock-timeout notification to include three elements: (1) feature branch name, (2) sub-branch name that timed out, (3) a message indicating the merge was not performed.

The plan correctly covers the `ArtifactCommitter` returning `"lock-timeout"` (E-07) and `InvocationGuard` treating it as unrecoverable (F-02 handles pull-error, F-03 handles push-error — but there's no F-task for lock-timeout as unrecoverable). More critically, there is no G-phase task that enriches the `handleCommitResult` branch for `"lock-timeout"` to include the Phase 10 fields (feature branch name, sub-branch name).

The pre-Phase-10 lock-timeout notification in the Orchestrator, if it exists, would not know about `featureBranch` or the new `ptah/{feature-name}/{agentId}/{invocationId}` sub-branch format. Without an explicit G-task, the lock-timeout Discord embed will likely post with stale or missing context.

**Required action:**
1. Add a task **F-04** to `InvocationGuard` to treat `lock-timeout` as unrecoverable (analogous to F-02/F-03 for pull-error/push-error).
2. Add a task **G-10** to `Orchestrator.handleCommitResult` for lock-timeout: post Discord embed including feature branch name, sub-branch name that timed out, and "merge was not performed" message — verifying all three REQ-MG-04 notification elements.

---

### F-03 — MEDIUM | DoD Claims All 17 Requirements Have Tests, But REQ-PF-NF-01 and REQ-PF-NF-02 Have No Implementing Tasks

**Location:** Section 5 (Definition of Done), bullet: "REQ-FB-01 through REQ-PF-NF-03 each have at least one unit test verifying the acceptance criteria"

**Finding:** The DoD asserts that REQ-PF-NF-01 (merge latency < 10 seconds) and REQ-PF-NF-02 (worktree count = active invocations + conflict-retained) each have at least one unit test. However, no task in the plan creates these tests:

- **REQ-PF-NF-01**: No task measures or asserts merge latency. The AC specifies a local bare repo as the remote and a < 10 second elapsed time. This is a performance integration test, not something that falls out of unit tests for individual methods.
- **REQ-PF-NF-02**: No task asserts that `git worktree list` count equals active invocations plus conflict-retained. This would require an integration-level assertion after multiple concurrent runs.

This is a product concern because these requirements represent explicit product commitments (merge latency and disk hygiene). If the DoD claims they are tested but no test exists, the team will ship without verifying these properties and the DoD checkbox cannot honestly be marked.

**Required action:** Either:
- **Option A:** Add tasks for REQ-PF-NF-01 and REQ-PF-NF-02 test coverage (integration test using local bare repo for NF-01; worktree list count assertion for NF-02).
- **Option B:** Revise the DoD to accurately state that NF-01 and NF-02 are verified by code review and manual validation (not automated tests), and document this as an accepted gap with a rationale (e.g., latency is environment-dependent and not suitable for CI).

Either option is acceptable from a product perspective, but Option B requires honest acknowledgment of the gap rather than claiming test coverage that doesn't exist.

---

### F-04 — LOW | Phase H Task Descriptions Don't Explicitly Mandate REQ-SK-02 Wording

**Location:** Phase H, tasks H-01 through H-04

**Finding:** REQ-SK-02 requires that agents are explicitly informed: (a) they are running in an isolated worktree, (b) their working directory is the worktree root, and (c) they must not assume they are in the main repository checkout. The Phase H task descriptions say "add orchestrator-managed branch statement + worktree context" — which is sufficient to address REQ-SK-01 (remove conflicting git commands) but is vague about REQ-SK-02.

A developer implementing H-01 to H-04 against the current task description could write language that mentions worktrees without explicitly including the "do not navigate to or modify the main repository checkout" statement required by REQ-SK-02's acceptance criteria. The manual verification note (`N/A (manual verification against REQ-SK-01, REQ-SK-02)`) correctly calls this out, but without the specific language requirements in the task description, reviewers may miss the gap.

**Required action (advisory):** Update H-01 through H-04 task descriptions to explicitly state the required SKILL.md language: agents must include a clear statement that file operations are relative to the worktree root AND that agents must not navigate to or modify the main repository checkout. This is low-severity since Phase H is manually verified, but explicit guidance reduces the chance of REQ-SK-02 gaps surviving review.

---

## Clarification Questions

None — the plan is clear enough on implementation approach for the areas within product scope.

---

## Positive Observations

- **Dependency graph (Section 3)** is clean, accurate, and correctly identifies parallel opportunities (A+B concurrently, D-01 through D-08 in any order, H fully independent). The graph directly matches the task ordering implicit in the Phase labels.
- **Phase B (`feature-branch.ts` pure functions)** correctly isolates slug derivation and branch naming as pure functions before using them in orchestrator logic. This makes the naming logic independently testable without standing up a full orchestrator — good product risk reduction.
- **"Existing tests requiring updates" (Section 4)** proactively identifies regression risk from type changes and `FakeGitClient` additions. This is exactly the kind of pre-work identification that prevents mid-sprint breakage.
- **E-04 conflict handling** correctly specifies that `abortMergeInWorktree` is NOT called and the merge worktree is NOT removed — consistent with the REQ-MG-02 correction made in REQ v1.2.
- **Phase I (`bin/ptah.ts` verification)** correctly scopes the composition root check as verification-only with no code changes required — demonstrates that the TSPEC's dependency injection design was preserved.
- **G-09 (pattern B resume parity)** explicitly ensures the resume path receives the same Phase 10 treatment. This is a common source of behavioral inconsistency when new parameters are added — good catch.
- **H-01 through H-04 as fully independent** allows Phase H to proceed in parallel with any code phase, reducing total implementation time without coupling risk.

---

## Requirements Coverage Spot-Check

| Requirement | Covering Tasks | Gap? |
|-------------|---------------|------|
| REQ-FB-01 | B-03, G-01 | None |
| REQ-FB-02 | G-02 | None |
| REQ-FB-03 (push + push-error) | E-02 (push), E-06 (push-error), G-07 (Discord) | None |
| REQ-FB-04 (no merge to main) | E-01, E-02 (changes merge target); implicitly all E tasks | No dedicated "main unchanged" test |
| REQ-AB-01 | B-04, G-03 | None |
| REQ-AB-02 | G-04 | None |
| REQ-AB-03 | Inherent in worktree model; no dedicated test | Acceptable — structural |
| REQ-AB-04 | E-02 (success cleanup), E-03/E-05 (error cleanup), E-04 (sub-branch cleanup on conflict) | None |
| REQ-MG-01 | E-02 through E-07 (lock lifecycle) | None |
| REQ-MG-02 | E-04 (retain worktree), G-08 (Discord) | **F-01: G-08 incomplete** |
| REQ-MG-03 | D-04 (pull skip), E-03 (pull-error), G-06 (Discord) | None |
| REQ-MG-04 | E-07 (lock-timeout) | **F-02: No F or G task for lock-timeout** |
| REQ-SK-01 | H-01 through H-04 | None |
| REQ-SK-02 | H-01 through H-04 | **F-04: Wording not explicit** |
| REQ-PF-NF-01 | None | **F-03: No test task** |
| REQ-PF-NF-02 | None | **F-03: No test task** |
| REQ-PF-NF-03 | I-01 (existing test passes) | Partial — covers wiring only |

---

## Recommendation

**Approved with minor changes.**

F-01 requires a task description update before G-phase implementation begins (adding sub-branch name and resolution commands to the G-08 conflict notification test spec). F-02 requires two new tasks (F-04 for InvocationGuard lock-timeout, G-10 for Orchestrator lock-timeout Discord embed). These are straightforward additions with no architectural impact.

F-03 and F-04 are advisory — the plan can proceed with engineering and QA addressing these in their respective reviews. However, the DoD language for NF-01/NF-02 should be corrected before the feature is marked Done.
