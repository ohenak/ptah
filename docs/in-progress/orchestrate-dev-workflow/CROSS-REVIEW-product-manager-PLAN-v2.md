# Cross-Review: product-manager — PLAN

**Reviewer:** product-manager
**Document reviewed:** docs/in-progress/orchestrate-dev-workflow/PLAN-orchestrate-dev-workflow.md
**Date:** 2026-04-22
**Iteration:** 2

---

## Findings

| ID | Severity | Finding | Requirement ref |
|----|----------|---------|----------------|
| F-01 | Low | F-02 from iteration 1 (REQ-WF-04 validation error scenario) is still not fully resolved. Task 3.1 adds `revision_bound` required-field validation to `workflow-validator.ts`, and task 5.6 lists "workflow config load" as a pre-flight step. However, no named test case in any task explicitly covers the full end-to-end scenario required by REQ-WF-04's acceptance criteria: "custom `ptah.workflow.yaml` with a review phase missing `revision_bound` → `ptah run` exits 1 and prints a validation error identifying the phase." Tasks 3.1 and 5.6 each own half of this flow, but neither task explicitly owns the user-visible error-message format test that exercises both halves together. An implementer working the two tasks independently could satisfy their individual definitions without verifying the exit-code-1 + phase-identifying-error output that REQ-WF-04 requires of `ptah run`. A named test case in task 5.6 (or a new sub-task in Phase 5) that chains the validator call through `RunCommand.execute()` and asserts the correct message and exit code would close this gap. | REQ-WF-04 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | Task 4.3 specifies "19 phases (`req-creation` through `done`)". The REQ Reviewer Assignment Matrix lists 8 active phases (req-creation, req-review, fspec-creation, fspec-review, tspec-creation, tspec-review, plan-creation, plan-review, properties-creation, properties-review, implementation, properties-tests, implementation-review = 13 named phases plus implied creation/review cycles and a `done` end state). Could you confirm which 19 phases are included? If the count differs from what can be derived from the REQ matrix, the `defaults.test.ts` assertion will need to account for the correct number. This is a documentation clarity question, not a functional gap. |

---

## Positive Observations

- **All three iteration-1 Low findings resolved or substantively addressed:** F-01 (REQ-NF-01 backward compat) is fully resolved — task 1.2 now explicitly names all 7 `agentIdToSkillName()` acceptance criteria and the DoD enumerates all four legacy agent IDs (`eng`, `qa`, `pm`, `fe`) with their expected return values. F-02 (REQ-WF-04) is partially addressed (see F-01 above — the validator implementation is clearly owned; only the end-to-end user-visible behavior test remains unowned). F-03 (REQ-CLI-03 PHASE_LABELS) is fully resolved — task 5.4b now enumerates all 7 required label entries verbatim from FSPEC-CLI-03.
- **TDD enforcement is now explicit and correct.** The Red/Green splits on tasks 3.2a/3.2b, 5.3a/5.3b, and 5.4a/5.4b are exactly the right pattern: failing tests are written as a separate named deliverable before the implementation task. This removes the risk of an implementer writing tests that pass by design rather than driving design.
- **Task 5.7 integration test is well-scoped.** It tests two orthogonal behaviors (happy path and duplicate-workflow error propagation) using `FakeTemporalClient` with populated `workflowStatuses` — this is precisely the cross-module correctness check that unit tests of individual helpers cannot provide. The scope is narrow enough to be deterministic and broad enough to catch integration failures.
- **Task 1.5 regression tests for `extractRecommendationValue()` are a strong addition.** The five isolated test cases (heading-scan, bold-wrapped, code-fence skip, null-on-missing, multi-line look-ahead) directly address the risk that the refactored two-step parser produces different extraction results from the old monolithic implementation on edge-case inputs. These tests will catch any behavioral drift introduced by the signature change.
- **Task 2.5 `FakeTemporalClient` annotation is now precise.** The three required behavioral assertions (signalHumanAnswer recording, statusFilter filtering with pre-populated data, no-filter backward compat) are enumerated in the task with enough specificity for an implementer to write them without consulting the FSPEC. This is a meaningful improvement over the original task description.
- **Task 3.9 static-structure test for `checkArtifactExists` in `bin/ptah.ts`** correctly targets a silent runtime failure class (worker mis-registration) that neither TypeScript compilation nor functional tests would catch. The DoD entry for this test ensures it is not treated as optional.
- **Scope compliance is clean.** No tasks introduce Discord-driven workflow changes, skill content implementations, or parallel dispatch modifications. Out-of-scope items from REQ Section 3.2 are absent from all 32 task descriptions.
- **Phase ordering correctly reflects P0 priority.** Phases 1–3 implement all P0 requirements before Phases 4–5 address P0 init scaffolding and P1 CLI behavior. The dependency graph is accurate and the Phase 4/5 parallel-start condition is correctly stated.

---

## Recommendation

**Approved with Minor Issues**

> The single remaining finding (F-01) is Low severity and is a documentation gap rather than a functional risk: the validator implementation is clearly owned by task 3.1 and the pre-flight check is clearly owned by task 5.6. The acceptance test scenario for the user-visible error path is not explicitly named in either task, but an implementer following FSPEC-CLI-01 BR-CLI-06 and REQ-WF-04's acceptance criteria will arrive at the correct behavior. No P0 or P1 requirement is missing coverage. The plan is safe to implement as written.
