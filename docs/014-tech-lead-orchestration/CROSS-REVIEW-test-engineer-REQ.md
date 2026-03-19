# Cross-Review: Test Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Review Round** | 3 (re-review of v1.2) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Re-Review Summary

This is a re-review of v1.2, which was revised to correct the requirements summary counts (P0: 17, Phase 14 total: 27). The Round 2 Low finding (TE-F-01, count discrepancy) is confirmed resolved. A fresh review of v1.2 against testability criteria identifies one new Medium finding and three new Low findings.

---

## Prior Findings — Resolution Status

| Finding | Severity | Description | Status |
|---------|----------|-------------|--------|
| TE-F-01 (Round 2) | LOW | Requirements summary count off-by-one (P0: 18 listed, 17 IDs; total 28 listed, sum = 27) | ✅ Resolved — v1.2 corrects P0 count to 17 and Phase 14 total to 27 |

All High and Medium findings from Rounds 1 and 2 (TE and BE) remain resolved. No regressions introduced in v1.2.

---

## New Findings

### F-01 — MEDIUM: REQ-NF-14-02 description contradicts acceptance criteria on failure-case worktree cleanup

**Affected requirement:** REQ-NF-14-02 (Worktree cleanup)

The requirement description states:

> "After each agent completes (success or failure), its worktree must be cleaned up."

The second sentence then says:

> "Worktrees from failed agents must be retained for debugging if the `retain_failed_worktrees` config flag is set."

These two sentences contradict each other: the first mandates cleanup on both success and failure, while the second mandates retention on failure (when configured). The acceptance criteria clarifies the intent correctly:

> "Worktrees are removed after successful completion; retained on failure if configured."

However, the contradictory description creates an ambiguity: when `retain_failed_worktrees` is **false** (or absent), should failed-agent worktrees be cleaned up or not? The description implies yes (cleanup on failure), the acceptance criteria implies yes (only "retained on failure if configured" — implying cleanup otherwise). But a test author reading only the description would need to reconcile the contradiction.

Additionally, there is no specified behavior for the default value of `retain_failed_worktrees` when the config key is absent — the requirement should state whether absence means retain or clean up.

**Resolution needed:**
1. Fix the description to read: "After each agent completes successfully, its worktree must be cleaned up. After a failed agent completes, its worktree must be cleaned up unless `retain_failed_worktrees` is set to `true` in the Ptah configuration."
2. Specify that `retain_failed_worktrees` defaults to `false` when absent (so cleanup is the default behavior on failure).

---

### F-02 — LOW: Plan file precondition failures have no specified behavior

**Affected requirements:** REQ-TL-01, REQ-PD-01

REQ-TL-01's GIVEN clause assumes the plan is in "Approved — Ready for Implementation" status and that the plan file path is valid. REQ-PD-01's GIVEN assumes the plan file has a "Task Dependency Notes" section. Neither requirement specifies what the tech lead must do if:

- The plan file path provided to the tech lead does not exist or is not readable.
- The plan document is found but its status is not "Approved — Ready for Implementation" (e.g., it is still in Draft).

Without specified behavior for these precondition failures, a test author cannot write test cases for them, and an implementation author may handle them inconsistently (silent crash, unformatted error, etc.).

**Resolution needed:** Add a brief precondition error clause to REQ-TL-01 (or a new REQ-TL-XX) specifying that if the plan file is missing, unreadable, or not in Approved status, the tech lead must report the specific error and emit `ROUTE_TO_USER` without attempting batch computation.

---

### F-03 — LOW: REQ-NF-14-01 sub-batch splitting order is unspecified

**Affected requirement:** REQ-NF-14-01 (Agent concurrency limit)

REQ-NF-14-01 specifies that a topological batch with more than 5 phases must be split into sub-batches of at most 5. The splitting algorithm and phase ordering within sub-batches are not defined. For a topological batch containing 7 phases (P1 through P7), it is not specified whether:

- The split is [P1–P5], [P6–P7] or [P1–P4], [P5–P7] or another grouping.
- Ordering within a sub-batch is by phase letter, by dependency depth, or arbitrary.

This is not a correctness concern (all groupings that respect the 5-agent limit are valid), but it prevents a test author from writing a deterministic assertion on sub-batch grouping. Without a defined split strategy, tests can only assert the max-concurrency invariant, not the exact batches produced.

**Resolution needed (Low — acceptable to defer to TSPEC):** The TSPEC should define a deterministic sub-batch splitting rule (e.g., "phases within a topological layer are grouped in document order, with each sub-batch containing at most 5 phases"). A REQ-level acknowledgment that the split order is implementation-defined would eliminate ambiguity for test authors.

---

### F-04 — LOW: REQ-TL-02 has no termination condition for repeated modification cycles

**Affected requirement:** REQ-TL-02 (Present execution plan for confirmation)

REQ-TL-02 specifies that after a user requests a modification, the tech lead updates the plan and "re-presents for confirmation." There is no specified limit on the number of modification cycles. In theory, a user could repeatedly request modifications, and the confirmation loop would never terminate without the user approving or explicitly rejecting.

While this is unlikely to occur in practice, the absence of a termination condition makes it impossible to write a complete test case for the modification path: a test cannot assert "after N rounds of modification the system eventually exits" because N is unbounded.

**Resolution needed (Low — acceptable to defer to TSPEC):** The TSPEC should document that the modification loop is unbounded by design and that termination requires an explicit Approve or Reject from the user. A brief note in REQ-TL-02 to this effect (e.g., "Modification cycles may repeat until the user approves or rejects") would make this explicit at the REQ level.

---

## Clarification Questions

### Q-01 (Carried from Round 2): Agent completion detection mechanism

Deferred to TSPEC (unchanged from Round 2). The Agent tool's synchronous dispatch pattern is an implementation concern.

### Q-02 (Carried from Round 2): Progress reporting output target

Deferred to TSPEC (unchanged from Round 2). "Coordination thread" is expected to resolve to the Discord coordination channel in the TSPEC.

---

## Positive Observations

All positive observations from Rounds 1 and 2 remain valid. Additional observations on v1.2:

- **Count correction (v1.2)** is clean and precise. Both the P0 row and the Phase 14 total now match the enumerated IDs. The change log entry is accurate and appropriately credits the TE cross-review as the source.
- **REQ-BD-07's "no partial merges" invariant** remains the strongest testable property in the document. It yields a clean test case: given a batch with phases [B, C, D] where D fails, after the tech lead halts, the feature branch must be identical to its state before the batch began. This is assertable via `git diff`.
- **REQ-PD-06 and REQ-PD-05 together** cover the two main DAG-parsing failure modes (cycle and malformed input) with consistent behavior (sequential fallback + warning). The combination produces a complete, testable defensive envelope for the dependency analysis component.
- **REQ-BD-05's two-failure-mode distinction** (invocation failure vs. assertion failure) is well-suited to test case decomposition. Each mode maps to a distinct mock scenario: a mock that exits non-zero before running tests (invocation failure) and a mock that runs but produces failing test output (assertion failure). The requirement directly drives the test strategy without ambiguity.
- **`useTechLead` feature flag** continues to be an excellent testability affordance for regression-testing the existing PDLC flow.

---

## Recommendation

**Needs revision.**

One Medium finding (F-01, REQ-NF-14-02 description contradicts acceptance criteria on failure-case worktree cleanup, with an undefined default for `retain_failed_worktrees`) requires correction before TSPEC authoring. Three Low findings are identified; two are deferred to TSPEC and one (F-02, plan file precondition failures) is recommended for a brief REQ-level clause.

| Finding | Severity | Status |
|---------|----------|--------|
| F-01 | MEDIUM | REQ-NF-14-02 description contradicts acceptance criteria; `retain_failed_worktrees` default unspecified |
| F-02 | LOW | Plan file precondition failures (missing file, wrong status) have no specified behavior |
| F-03 | LOW | Sub-batch splitting order unspecified (acceptable to defer to TSPEC) |
| F-04 | LOW | REQ-TL-02 modification loop has no termination condition documented (acceptable to defer to TSPEC) |

**Required before re-approval:** F-01 must be resolved. F-02 is recommended but the PM may choose to defer it to TSPEC with an explicit acknowledgment.
