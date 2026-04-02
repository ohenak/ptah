# Cross-Review: Engineer Review of FSPEC-015

| Field | Detail |
|-------|--------|
| **Document** | 015-FSPEC-temporal-foundation.md (v1.0) |
| **Reviewer** | eng (Senior Full-Stack Engineer) |
| **Date** | April 2, 2026 |
| **Review Scope** | Technical feasibility, behavioral flow correctness, edge case coverage |

---

## Findings

### F-01: FSPEC-TF-04 ROUTE_TO_USER in Fork/Join — Worktree Lifetime Ambiguity (Medium)

FSPEC-TF-04, "ROUTE_TO_USER in Fork/Join" section, step 4 says:

> After all questions are answered, re-invoke only the agents that returned `ROUTE_TO_USER`.

But the successful agent's worktree is "held (not merged yet)" during the question flow. Two issues:

1. **Worktree lifetime across Activities:** FSPEC-TF-01 step 8 says worktrees are NOT cleaned up for `ROUTE_TO_USER`. But the successful agent's Activity has already completed with `LGTM` and its worktree was merged (FSPEC-TF-01 step 9). So which is it — is the successful agent's worktree merged or held?

2. **If held:** This contradicts FSPEC-TF-01's flow where `LGTM` always triggers merge+cleanup. If we hold the successful worktree, the Activity must know it's in a fork/join context and defer merging — that's a fork/join-specific Activity behavior not documented.

3. **If merged:** Then on re-dispatch of only the `ROUTE_TO_USER` agent, we have a single-agent dispatch merging into a branch that already has the other agent's changes. This is fine but is no longer a fork/join — it's a sequential dispatch. The no-partial-merge invariant (BR-12) might not apply here since one agent already succeeded.

**Recommendation:** Clarify whether a successful agent's worktree in a fork/join is merged immediately or held until all agents complete. The simplest approach: hold all merges until all agents succeed (the workflow orchestrates the merge, not the Activity). This requires the Activity to return artifacts without merging, and the Workflow to perform merges after collecting all results.

---

### F-02: FSPEC-TF-04 Merge Conflict Recovery — Revert Mechanism (Low)

FSPEC-TF-04-CONFLICT step 3 says "Revert first merge to restore feature branch to pre-batch state." This requires either:
- Recording the pre-merge commit SHA and `git reset --hard` to it, or
- Using `git revert` on the merge commit

Both are implementable. The TSPEC will need to pick one, but the FSPEC doesn't need to specify this level of detail. Just noting it for TSPEC awareness.

---

### F-03: FSPEC-MG-01 Fork/Join Partial Completion Transfer — Contradicts FSPEC-TF-04 (Medium)

FSPEC-MG-01 edge case says:

> Feature with `forkJoin` state partially completed: Transfer the subtask statuses. On Temporal resume, the workflow checks which subtasks are already complete and only dispatches pending ones.

But FSPEC-TF-04 BR-14 says:

> On retry after failure, ALL agents are re-dispatched, even ones that succeeded. This avoids stale worktree state.

These two rules conflict. Migration is effectively "resuming" a workflow at a fork/join phase with partial completion. If BR-14 applies, partial subtask statuses from v4 are meaningless — the workflow should re-dispatch all agents regardless. If the migration preserves partial completion and only dispatches pending agents, it violates BR-14.

**Recommendation:** Either (a) migration at a fork/join phase resets all subtasks to pending and re-dispatches all agents (consistent with BR-14), or (b) explicitly carve out an exception for migration (BR-14 applies to retry after failure, but migration is a fresh start at a known state). Option (a) is simpler and safer.

---

### F-04: FSPEC-TF-05 Review Cycle — "Approved with minor changes" Parse Location (Low)

BR-17 says "Approved with minor changes" is treated as `approved`. Step 5c says the recommendation is parsed from the cross-review file. The FSPEC doesn't specify where in the file to find the recommendation or what exact strings to match.

The current codebase parses this in `pdlc-dispatcher.ts` (`processReviewCompletion()`), which reads the cross-review file. The TSPEC will need to define the parsing contract (e.g., `## Recommendation` heading followed by one of the three values). This is a TSPEC concern, not an FSPEC gap — just noting it.

---

### F-05: FSPEC-TF-03 Retry-After Header — Activity-Level vs Temporal-Level (Low)

The edge case says: "The retry interval should respect the API's `Retry-After` header if present, overriding the backoff coefficient for that single retry."

Temporal's retry policy doesn't natively support per-attempt interval overrides based on error metadata. To implement this, the Activity would need to catch the 429, sleep for the `Retry-After` duration internally, and then retry within the same Activity attempt — rather than throwing and letting Temporal retry. This is a design decision for the TSPEC but the FSPEC should be aware that "override the backoff coefficient" isn't how Temporal retries work.

**Alternative:** The Activity catches 429s internally and implements its own sleep-and-retry for rate limits, only throwing to Temporal for other transient errors. This is actually how the current `InvocationGuard` works.

Not blocking — the TSPEC can handle this correctly. Just flagging the Temporal-level constraint.

---

## Clarification Questions

None. The behavioral flows are clear and complete.

---

## Positive Observations

1. **Excellent FSPEC coverage selection.** The 6 FSPECs cover exactly the requirements with non-trivial branching logic. The "Direct-to-TSPEC" table (Section 2) with per-requirement justifications prevents over-specification.

2. **Activity lifecycle flow (FSPEC-TF-01) is comprehensive.** The 10-step flow with idempotency check, concurrent heartbeat loop, and per-signal branching is exactly what the TSPEC needs. The separation of "Activity returns normally" vs "Activity throws" is clean.

3. **Failure classification table (FSPEC-TF-03) is implementable.** The retryable/non-retryable classification maps directly to `ApplicationFailure.nonRetryable()`. The `retry-or-cancel` Signal after exhaustion is a good UX pattern.

4. **Fork/join behavioral flows (FSPEC-TF-04) cover all four cases.** Happy path, wait-for-all failure, fail-fast failure, and ROUTE_TO_USER are each given their own numbered flow. This eliminates ambiguity for the TSPEC.

5. **Review cycle (FSPEC-TF-05) correctly resets all reviewers on revision.** BR-18 (all reviewers must re-review) matches the current v4 behavior and prevents stale approvals.

6. **Migration flow (FSPEC-MG-01) is production-grade.** Idempotent migration (BR-22), validation before creation, clear error messages, and the summary report are all well-specified.

7. **Business rules are numbered and traceable.** BR-01 through BR-25 provide a clear contract for the TSPEC. Each rule is actionable and testable.

---

## Recommendation

**Needs revision** — Two Medium-severity findings require clarification before TSPEC work:

- **F-01:** Resolve worktree merge timing for successful agents in a fork/join with `ROUTE_TO_USER`. The current flows in FSPEC-TF-01 and FSPEC-TF-04 are contradictory.
- **F-03:** Resolve the conflict between migration fork/join partial completion transfer and BR-14 (all agents re-dispatched on retry).

The PM should address both Medium findings and route the updated FSPEC back for re-review.
