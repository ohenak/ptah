# Cross-Review: Test Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — HIGH: Cycle detection is a missing failure mode with no requirement

**Affected requirements:** REQ-PD-01, REQ-PD-02

REQ-PD-02's acceptance criteria reads "Given: A valid dependency DAG with no cycles." This precondition silently assumes the input is always a well-formed acyclic graph. The plan document is authored by an agent; malformed or self-referential dependency notes are plausible inputs. There is no requirement specifying what the tech lead must do when the parsed dependency graph contains a cycle.

From a testing perspective this is a critical gap: the "valid DAG" guard rail must be actively enforced, not assumed. Without a cycle-detection requirement, the topological batch algorithm will either loop indefinitely, throw an unhandled exception, or silently produce incorrect batches — none of which have expected test outcomes defined.

REQ-PD-05 handles the case where the section is "missing, empty, or cannot be parsed into a valid DAG" but cycle detection sits in a grey zone: the section is present and syntactically valid, yet semantically invalid. The fallback clause may or may not apply, and the behavior is indeterminate.

**Resolution needed:** Add a requirement (or extend REQ-PD-05) specifying: if topological layering detects a cycle in the dependency graph, the tech lead must report the cycle (naming the phases involved) and fall back to sequential execution with an error-level warning (not just a warning).

---

### F-02 — HIGH: "Maximum parallelism" in REQ-PD-02 acceptance criteria is not precisely testable

**Affected requirements:** REQ-PD-02

REQ-PD-02 THEN clause states: "maximum parallelism is achieved within each batch." This is the central correctness property of the entire feature, yet it is stated informally and cannot be written as an automated test assertion.

A testable reformulation would be: "Each phase is placed in the earliest batch N such that all of its dependencies appear in batches 1..(N-1)." This definition admits a precise test: construct a known DAG, run the batch algorithm, and assert each phase's assigned batch index equals the length of its longest dependency chain plus one.

Without this precision, two different implementations that produce different batch assignments (one more parallelized than the other) could both claim conformance with "maximum parallelism." The property is also indeterminate when a phase has no dependencies — does it belong to Batch 1 by definition? (The description says yes, but the THEN clause doesn't state this explicitly.)

**Resolution needed:** Replace "maximum parallelism is achieved within each batch" with a precise invariant: "Each phase is assigned to batch N = (length of longest path from any root phase to this phase) + 1. Phases with no dependencies are assigned to Batch 1." This gives the engineer a directly testable algorithm specification.

---

### F-03 — MEDIUM: Mixed source-path phases have undefined skill assignment behavior

**Affected requirements:** REQ-PD-03

REQ-PD-03 defines skill assignment by source file path: backend paths (`src/`, `config/`, `tests/`, `bin/`) → `backend-engineer`; frontend paths (`app/`, `components/`, `pages/`, `styles/`, `hooks/`) → `frontend-engineer`; docs-only (`docs/`) → `backend-engineer`.

The requirement is silent on phases whose task table contains both backend and frontend paths — a plausible scenario in integration or wiring phases. The acceptance criteria THEN clause says only "the correct engineer skill is assigned," which presupposes there is always one correct answer.

From a test design perspective: what is the expected output when a phase has tasks referencing both `src/services/foo.ts` and `components/Foo.tsx`? Any of three behaviors could be considered "correct": (a) the phase is split into two sub-phases, (b) one skill takes precedence (e.g., majority wins), or (c) an error is thrown asking the user to resolve ambiguity. Without specifying the behavior, a test cannot assert the correct outcome.

**Resolution needed:** Add a clause to REQ-PD-03 specifying the conflict resolution rule for mixed-path phases, and include it in the acceptance criteria THEN clause (e.g., "If a phase contains both backend and frontend paths, backend-engineer is used and a warning is logged" or "the phase is flagged for user assignment during the plan confirmation step per REQ-TL-02").

---

### F-04 — MEDIUM: REQ-TL-02 "modify" path is untestable as specified

**Affected requirements:** REQ-TL-02

REQ-TL-02 allows the user to "approve, modify, or reject the plan." The acceptance criteria states the developer can "request modifications (e.g., change skill assignments, adjust batch grouping)." The modification path has no specified bounds, protocol, or expected output.

For test coverage purposes: what constitutes a valid modification input? What does the tech lead do if the user's modification creates a dependency violation (moves a phase to a batch before its dependency)? What if the user reassigns a frontend phase to backend-engineer? Without constraints on the modification space and the tech lead's response to invalid modifications, there is no way to write test cases for this interaction.

The "reject" path also has no specified behavior in the acceptance criteria THEN clause. The developer can reject the plan but the tech lead's next action is not stated. Should it: exit silently, prompt for a new plan path, or route back to the orchestrator?

**Resolution needed:**
1. Narrow the modification protocol to a finite set of allowed modifications (e.g., skill assignment change, batch grouping override), and specify how the user communicates each change.
2. Specify the tech lead's response to an invalid modification (e.g., skill assignment for an unknown skill name).
3. Add a THEN clause for the reject path: what does the tech lead do when the user rejects?

---

### F-05 — MEDIUM: Sub-batch test gate semantics are unspecified for REQ-NF-14-01

**Affected requirements:** REQ-NF-14-01, REQ-BD-05

REQ-NF-14-01 caps concurrent agents at 5 and requires batches larger than 5 phases to be "split into sub-batches of at most 5." REQ-BD-05 mandates a test suite validation gate "after merging all worktree results for a batch."

These two requirements interact in an undefined way: when a topological batch of 8 phases is split into sub-batches of 5 and 3, does the test gate fire:
- Once per sub-batch (2 test runs, each blocking the next sub-batch), or
- Once after all 8 phases complete (1 test run, treating the original topological batch as the unit)?

Option A catches regressions earlier but costs more test runs. Option B is semantically consistent with the topological correctness guarantee (no phase in the next topological layer starts until all phases in the current layer are done and tested). Neither option is currently specified.

This gap produces at least two testable scenarios with different expected outcomes that cannot be written without resolution.

**Resolution needed:** Add a clause to REQ-NF-14-01 (or REQ-BD-05) specifying whether test gates apply per topological batch or per sub-batch, and whether sub-batches within the same topological layer share a single gate.

---

### F-06 — LOW: "All phases already done" edge case has no requirement

**Affected requirements:** REQ-PD-04, REQ-BD-06

REQ-PD-04 says completed phases are "excluded from batch computation." REQ-BD-06 says phases in earlier batches already marked Done are skipped during resume. Neither requirement addresses the degenerate case where ALL phases in the plan are marked Done before the tech lead runs.

This is a valid real-world scenario (user accidentally invokes tech-lead on a fully-completed plan, or a partial resume where all remaining phases were somehow pre-completed). The expected behavior is not stated: should the tech lead exit with a "nothing to do" message, run the test suite as a final validation, or treat this as an error condition?

**Resolution needed:** Add a sentence to REQ-PD-04 or REQ-BD-06 specifying behavior when phase computation results in zero batches (all phases done): e.g., "If no executable phases remain, the tech lead must post a completion notification and exit without running agents."

---

### F-07 — LOW: Agent timeout threshold and test suite failure classification are unspecified

**Affected requirements:** REQ-BD-07, REQ-BD-05

**REQ-BD-07:** "timeout" is listed as one of the failure signals that triggers batch halt, but no timeout threshold or configuration mechanism is specified. This makes timeout handling untestable — the engineer must pick an arbitrary value and there is no acceptance criterion to verify it.

**REQ-BD-05:** "If any test fails" does not distinguish between test suite invocation failures (build error, missing test runner configuration, `npx vitest run` returns a non-zero exit for a reason other than test failure) and actual test assertion failures. The tech lead's handling of these two failure modes should be specified separately, as they have different recovery paths: a build error requires developer intervention, while test failures may or may not be flaky.

**Resolution needed:**
- REQ-BD-07: Specify the timeout value or the config field that controls it.
- REQ-BD-05: Add a clause distinguishing test invocation failure (runner error) from test assertion failure, and specify how each is reported.

---

## Clarification Questions

### Q-01: Is the "Task Dependency Notes" format expected to support fan-out in the short term?

Directly tied to backend engineer F-01 and testing concern F-01 (cycle detection). The current template format (`Phase A → Phase B → Phase C`) can only represent linear chains. If REQ-NF-14-04 holds ("no changes to the plan template"), then the DAG algorithm will always produce single-phase batches and parallel dispatch (REQ-BD-02) will never have more than one agent per batch. Is MVP acceptance of single-phase batches explicitly intended? If so, the acceptance criteria for REQ-PD-02 and REQ-BD-02 should be scoped accordingly — this has direct impact on which test scenarios are meaningful.

### Q-02: How does the tech lead detect that an agent has completed — polling, event, or signal?

REQ-BD-02 says phases are "dispatched to engineer agents concurrently" and REQ-BD-07 says "if an agent reports failure." The mechanism by which the tech lead monitors in-flight agents is not specified. This matters greatly for test design: if the tech lead polls `TaskOutput`, tests need to stub polling. If agents emit routing signals that the tech lead listens for, tests need to simulate signal delivery. The completion detection mechanism is the most critical integration seam to mock in unit tests.

### Q-03: Does the progress reporting in Section 5.4 target a coordination thread, a log file, or stdout?

REQ-PR-01 through REQ-PR-04 say the tech lead "must post a notification in the coordination thread." The test approach differs significantly depending on the target: if it's a Discord/Slack thread, tests need to mock the messaging client; if it's stdout or a log file, tests can capture the output stream. Knowing the interface being invoked determines how progress reporting is testable in isolation.

---

## Positive Observations

- The acceptance criteria for REQ-PD-01, REQ-PD-03, REQ-PD-04, REQ-PD-05, and REQ-BD-01 are written in clear Who/Given/When/Then format with concrete, observable THEN clauses — a strong baseline for test derivation.
- REQ-TL-03 ("tech lead must not write code") is an excellent negative property: explicitly defined, clearly observable (no commits from the tech lead), and directly testable with a post-execution assertion on git authorship.
- REQ-NF-14-01 (5-agent concurrency cap) is a measurable constraint. Given the cap is a finite number, it is straightforwardly testable with a spy on the agent launcher.
- REQ-PD-05 (graceful fallback) is well-formed as a testable defensive requirement — it has a concrete trigger condition, a defined output (sequential execution), and a required side effect (warning log). This pattern should be replicated for the cycle detection case (F-01 above).
- REQ-BD-06 (resume) cleanly decomposes the resumption invariant: phases in earlier batches marked Done are skipped. This is directly unit-testable given a plan fixture with pre-marked phases.
- REQ-NF-14-02 (worktree cleanup) distinguishes success and failure cleanup paths via a config flag (`retain_failed_worktrees`), which is a testing-friendly design — the flag makes behavior predictable and assertable in test doubles.
- REQ-NF-14-03 (backward compatibility) is precise: "the existing PDLC flow works unchanged when tech-lead is not registered." This is a clear regression guard that maps to an integration test.

---

## Recommendation

**Needs revision.** Two High-severity findings (F-01, F-02) must be resolved before this REQ can support TSPEC authoring with sufficient test coverage:

- **F-01** leaves a critical failure mode (cyclic dependencies) without any defined behavior, making the DAG parser's error handling untestable.
- **F-02** leaves the core correctness invariant of the batch algorithm informally stated, making it impossible to write a precise acceptance test for the topological layering algorithm.

Three Medium-severity findings (F-03, F-04, F-05) should also be addressed; they will produce design gaps in the TSPEC if left open. F-03 and F-05 both produce test scenarios with ambiguous expected outputs.

Note: This review complements the backend engineer's cross-review (which identified three separate High findings — plan template DAG format, partial-batch failure merge semantics, and worktree creation mechanism). Both sets of High findings must be resolved; they are non-overlapping gaps.

Please address F-01 through F-05 and clarify Q-01 through Q-03, then route the updated REQ back for re-review.
