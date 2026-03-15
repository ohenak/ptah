# Cross-Review: Test Engineer Review of REQ-011

| Field | Detail |
|-------|--------|
| **Document** | [011-REQ-orchestrator-pdlc-state-machine.md](011-REQ-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Test Engineer (`qa`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: REQ-RT-06 revision loop lacks a maximum retry bound (High)

REQ-RT-06 specifies that rejection transitions the feature back to the creation phase, and after revision the review phase restarts with all reviewers reset to `pending`. There is no requirement limiting the number of revision cycles. A document could theoretically bounce between creation and review indefinitely if a reviewer keeps requesting revisions.

**Impact:** Without a bound, a feature can get stuck in an infinite revision loop. This also makes it impossible to write a test that asserts termination — the property "all features eventually reach DONE" is unprovable without a cycle limit or escalation mechanism.

**Recommendation:** Add a requirement specifying either: (a) a maximum revision count per phase (e.g., 3 cycles), after which the orchestrator pauses via `ROUTE_TO_USER` to escalate, or (b) an explicit out-of-scope statement acknowledging unbounded revision loops are accepted for v1.

---

### F-02: REQ-RT-04 unparseable recommendation fallback needs a testable contract (Medium)

REQ-RT-04 now specifies that if the recommendation field cannot be parsed, the reviewer status remains `pending` and the orchestrator pauses via `ROUTE_TO_USER`. However, the acceptance criteria don't define what constitutes "unparseable" — is it: (a) the `Recommendation` field is entirely absent, (b) the field is present but the value doesn't match any recognized string, or (c) the cross-review file itself is missing or unreadable?

**Impact:** Without distinct cases, test coverage for the fallback path will be incomplete. Each failure mode (missing field, unrecognized value, missing file, malformed markdown) should have a distinct expected behavior.

**Recommendation:** Expand REQ-RT-04 acceptance criteria to enumerate the specific failure cases: (1) file missing → `pending` + ROUTE_TO_USER, (2) file present but no Recommendation heading → `pending` + ROUTE_TO_USER, (3) Recommendation present but value not in recognized set → `pending` + ROUTE_TO_USER. This gives the TSPEC clear error categories to design against.

---

### F-03: REQ-SM-07/SM-08/SM-11 fork/join completion signal undefined (Medium)

REQ-SM-07, SM-08, and SM-11 describe the fork/join pattern for fullstack features but don't specify how individual sub-task completion is signaled. The acceptance criteria say "the orchestrator records the backend TSPEC as complete" — but what triggers this recording? Is it: (a) the agent's `LGTM` signal, (b) the artifact existing on disk (per REQ-AI-05), or (c) both?

**Impact:** Without a defined completion signal, testing the fork/join join-point requires guessing the trigger. If `LGTM` alone is sufficient (without artifact validation), then REQ-AI-05 and REQ-SM-07 have different completion semantics.

**Recommendation:** Add acceptance criteria clarifying that sub-task completion in fork/join phases uses the same signal interpretation as sequential phases (REQ-AI-04 `LGTM` signal), and that REQ-AI-05 artifact validation applies per sub-task before the sub-task is marked complete.

---

### F-04: REQ-SM-10 migration behavior is one-directional only (Medium)

REQ-SM-10 specifies forward migration (older → current) and fail-safe on unrecognized versions (newer → error). However, there is no requirement for what happens when migration itself fails (e.g., a migration function throws because the old state data is inconsistent).

**Impact:** A migration failure would leave the state file in an indeterminate state — partially migrated. This is a critical edge case for testing state recovery.

**Recommendation:** Add acceptance criteria: "If migration fails, the orchestrator must log the error with the original and target schema versions, preserve the original state file as a backup (e.g., `pdlc-state.json.bak`), and initialize fresh state." This gives a testable invariant for the migration failure path.

---

### F-05: REQ-CA-02 review phase context is underspecified (Low)

REQ-CA-02 item (8) says review phases include "document under review + source requirements." This is vague — for `TSPEC_REVIEW`, does "source requirements" mean just the REQ, or REQ + FSPEC? For `PROPERTIES_REVIEW`, does it include the TSPEC and PLAN that the properties were derived from?

**Impact:** Without precise context lists for review phases, tests for the context assembler cannot assert exact document sets. Different interpretations lead to different expected outputs.

**Recommendation:** Expand item (8) to list context documents for each review phase explicitly, matching the specificity of items (1)-(7). For example: `TSPEC_REVIEW: TSPEC under review, approved REQ, approved FSPEC (if exists). PLAN_REVIEW: PLAN under review, approved TSPEC. PROPERTIES_REVIEW: PROPERTIES under review, approved REQ, approved TSPEC, approved PLAN.`

---

### F-06: REQ-SM-NF-03 backward compatibility lacks testable acceptance criteria format (Low)

REQ-SM-NF-03 uses prose for its acceptance criteria rather than the Who/Given/When/Then format used by all functional requirements. The statement "A feature started before the state machine was deployed continues to function correctly through completion" is a goal, not a testable criterion.

**Impact:** This makes it difficult to derive specific test cases. "Functions correctly" needs to be decomposed into observable behaviors.

**Recommendation:** Rewrite as: WHO: As the orchestrator GIVEN: a Discord message arrives for a thread mapped to a feature slug with no state record WHEN: the orchestrator processes the message THEN: the message is routed using the existing `ROUTE_TO_AGENT` signal-based logic (not the state machine), and no state record is created for this feature.

---

## Clarification Questions

### Q-01: How is the reviewer-to-cross-review-file mapping resolved?

REQ-RT-04 says the orchestrator detects approval by parsing cross-review files. But when multiple reviewers review the same document, how does the orchestrator know which reviewer authored which cross-review file? The file naming convention `CROSS-REVIEW-{skill}-{doc-type}.md` includes the skill name, which maps to an agent ID — is the orchestrator expected to derive the agent ID from the skill name in the filename (e.g., `backend-engineer` → `eng`)? This mapping needs to be explicit for testing.

### Q-02: What is the expected behavior when a reviewer submits both "Approved with minor changes" and "Needs revision" in separate paragraphs?

REQ-RT-04 specifies parsing the Recommendation field. If the cross-review file contains multiple Recommendation headings or contradictory language, which takes precedence? This is an edge case that affects test design.

### Q-03: Does REQ-RT-08 concurrent review dispatch imply parallel agent invocation?

REQ-RT-08 says reviewers "may run concurrently (not sequentially) where the underlying system supports it." Is this a P1 because parallel invocation is a nice-to-have, or because the orchestrator dispatches sequentially but doesn't wait for one reviewer before dispatching the next? The distinction matters for testing — sequential dispatch with independent completion tracking is far simpler to test than true parallel invocation.

---

## Positive Observations

- **P-01:** REQ-SM-NF-04 (pure-function state machine with `(currentState, event) → newState`) is the single most important requirement for testability. This enables exhaustive property-based testing of all state transitions without any I/O or mock dependencies. Every valid and invalid transition can be tested as a pure function.

- **P-02:** The 18-phase enumeration (REQ-SM-01) provides a finite, enumerable state space. Combined with defined valid transitions (REQ-SM-03), this enables exhaustive transition matrix testing — every `(phase, event)` pair can be tested to verify it either produces the correct next phase or is rejected.

- **P-03:** The reviewer manifest computation (REQ-RT-01, REQ-FC-04) is fully deterministic given the inputs (phase + discipline). This is ideal for parameterized testing — each `(phase, discipline)` combination produces a fixed reviewer set.

- **P-04:** The separation of state transitions from side effects (state machine computes new state, persistence layer writes it, agent invoker dispatches) creates natural test boundaries. Each layer can be tested independently with fakes for the layers below.

- **P-05:** REQ-SM-05's atomic write requirement (write-to-temp + rename) is the correct approach for crash safety and creates clear testable properties: temp file exists during write, temp file is removed after rename, state file is never in a partial-write state.

- **P-06:** The context document matrix (REQ-CA-02) provides deterministic expected outputs for each phase, making it straightforward to test with a simple lookup table and assert exact document sets.

---

## Summary

This is a well-structured, testable requirements document. The pure-function state machine constraint (REQ-SM-NF-04), finite phase enumeration, and deterministic reviewer computation create an architecture that is highly amenable to comprehensive property-based testing.

The main testability concerns are:

1. **Unbounded revision loops** (F-01) — without a cycle limit, termination properties cannot be tested
2. **Unparseable recommendation cases** (F-02) — the fallback path needs distinct failure categories for complete error-path coverage
3. **Fork/join completion signal** (F-03) — sub-task completion trigger needs clarification for join-point testing
4. **Migration failure handling** (F-04) — the migration failure path needs a defined behavior for testing
5. **Review phase context underspecification** (F-05) — review phase context documents need explicit listing for assertion
6. **Backward compatibility testability** (F-06) — needs Who/Given/When/Then format for test derivation

All findings are addressable without structural changes to the requirements. The 3 clarification questions (Q-01 through Q-03) should be resolved before TSPEC creation as they affect test architecture decisions.

**Recommendation: Approved with minor changes** — address F-01, F-02, F-03, and F-04 (High/Medium severity), then proceed to TSPEC. F-05 and F-06 (Low severity) can be deferred to TSPEC-level specification.
