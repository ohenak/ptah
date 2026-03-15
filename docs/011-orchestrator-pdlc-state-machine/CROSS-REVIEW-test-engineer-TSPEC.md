# Cross-Review: Test Engineer Review of TSPEC-011

| Field | Detail |
|-------|--------|
| **Document** | [011-TSPEC-orchestrator-pdlc-state-machine.md](011-TSPEC-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Test Engineer (`qa`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Needs revision |

---

## Findings

### F-01: Review phase evaluation algorithm contradicts FSPEC-RT-02 collect-all-then-evaluate model (High)

The `transition()` review phase evaluation algorithm (Section 5.1, lines 460-477) immediately acts on a `revision_requested` event:

```
2. IF event.recommendation === "revision_requested":
     a. Increment revisionCount
     b. IF revisionCount > 3: pause
     c. ELSE: Reset ALL reviewerStatuses to "pending", transition to *_CREATION
```

This triggers a revision loop on the **first** rejection received, before other reviewers have responded. However, FSPEC-RT-02 (v1.1) explicitly specifies the **collect-all-then-evaluate** model:

> "The orchestrator dispatches ALL reviewers and waits for ALL to complete before evaluating the outcome (collect-all-then-evaluate). This ensures the author receives all feedback in a single revision round rather than fixing one reviewer's issues only to be rejected by another."

The correct algorithm should be:

```
1. Update reviewerStatuses[event.reviewerKey] = event.recommendation
2. IF any reviewerStatuses === "pending":
     No transition — waiting for remaining reviewers.
3. ELSE (all reviewers have completed):
     a. IF any reviewerStatuses === "revision_requested":
          Increment revisionCount, check bound, transition to *_CREATION
     b. ELSE IF all reviewerStatuses === "approved":
          Transition to *_APPROVED
```

**Impact:** This is the core review lifecycle behavior. Tests written against the current algorithm would assert incorrect behavior (early-exit on first rejection). Every review-phase test is affected.

**Recommendation:** Rewrite the review phase evaluation algorithm to match the collect-all-then-evaluate model from FSPEC-RT-02. This changes the transition function's behavior: a `review_submitted(revision_requested)` event when other reviewers are still `pending` should NOT trigger a transition — it should update the status and wait.

---

### F-02: `processResumeFromBound()` method missing from PdlcDispatcher protocol (High)

Section 9.3 references `pdlcDispatcher.processResumeFromBound(featureSlug)` for handling revision bound escalation resume. However, this method is NOT defined in the `PdlcDispatcher` protocol (Section 4.3.2, lines 297-328). The protocol lists: `isManaged`, `getFeatureState`, `initializeFeature`, `processAgentCompletion`, `processReviewCompletion`, `getNextAction`, `loadState`.

**Impact:** An engineer implementing against the protocol will not know this method exists. Tests cannot be written against the protocol for this behavior. The `FakePdlcDispatcher` test double (Section 7.2) also omits this method.

**Recommendation:** Add `processResumeFromBound(featureSlug: string): Promise<DispatchAction>` to the `PdlcDispatcher` protocol definition. Add a corresponding stub to `FakePdlcDispatcher`. Define the expected behavior: reset revision count to 0, reset all reviewer statuses to `pending`, return dispatch action for reviewers.

---

### F-03: REQ-SM-11 incorrectly mapped in Section 8 (Medium)

Section 8 (line 1109) maps:
> `REQ-SM-11` → `transition()` revision bound check | 3-cycle revision limit per phase

REQ-SM-11 in the approved REQ (v1.1) is **"Parallel implementation (fork)"** — the fork/join pattern for the `IMPLEMENTATION` phase. The 3-cycle revision limit is `REQ-RT-09` (added via FSPEC-RT-02). This misattribution means:
- REQ-SM-11 (parallel implementation) appears unmapped to its correct component (the fork/join logic in `transition()`)
- The revision bound is attributed to the wrong requirement

**Impact:** The traceability matrix is broken for these two requirements. A test engineer deriving tests from the requirement mapping would miss the implementation fork/join tests and create duplicate revision bound tests.

**Recommendation:** Fix Section 8:
- `REQ-SM-11` → `transition()` fork/join logic | Parallel implementation (fork) for fullstack features
- Add `REQ-RT-09` → `transition()` revision bound check | 3-cycle revision limit per phase (if not already present)

---

### F-04: FakeFileSystem not updated with `rename()` and `copyFile()` in test doubles section (Medium)

Section 9.1 states that `FakeFileSystem` must be updated with `rename()` and `copyFile()` methods. However, Section 7.2 (Test Doubles) only shows `FakeStateStore` and `FakePdlcDispatcher` — the updated `FakeFileSystem` is not specified.

The `FileStateStore` tests depend heavily on `FakeFileSystem` having correct `rename()` and `copyFile()` behavior. Without specification, an engineer might implement `rename()` as a no-op or throw, leading to misleading test results.

**Impact:** State-store tests (~15 estimated) depend on `FakeFileSystem` correctly simulating atomic writes and backup copies. Incorrect fake behavior silently masks real bugs.

**Recommendation:** Add the `FakeFileSystem` extension to Section 7.2:
```typescript
// In FakeFileSystem (existing fake, extended):
async rename(oldPath: string, newPath: string): Promise<void> {
  const content = this.files.get(oldPath);
  if (!content) throw new Error(`ENOENT: ${oldPath}`);
  this.files.set(newPath, content);
  this.files.delete(oldPath);
}

async copyFile(src: string, dest: string): Promise<void> {
  const content = this.files.get(src);
  if (!content) throw new Error(`ENOENT: ${src}`);
  this.files.set(dest, content);
}
```

---

### F-05: Artifact validation in `processAgentCompletion()` returns `pause` instead of retry (Medium)

Section 5.6 (line 791-793) specifies that when an artifact is missing after `LGTM`:
```
Return { action: "pause", reason: "artifact_missing", message: "..." }
```

However, FSPEC-AI-01 specifies a retry mechanism: "Maximum 2 re-invocation attempts. After 2 failures → pause via ROUTE_TO_USER." The TSPEC's `processAgentCompletion()` immediately pauses on the first missing artifact without attempting re-invocation.

**Impact:** The FSPEC's bounded retry behavior is lost — the system pauses immediately instead of giving the agent another chance. Tests written against the TSPEC would assert immediate pause, while tests written against the FSPEC would assert retry-then-pause.

**Recommendation:** Either (a) implement the FSPEC-AI-01 retry mechanism with a retry counter in `processAgentCompletion()`, or (b) document that the retry logic lives in the orchestrator's routing loop (caller) rather than in the PdlcDispatcher, and add a comment + test scenario for this decision.

---

### F-06: No test scenario for reviewer timeout / agent crash (Medium)

Section 7.4 (Key Test Scenarios) does not include any scenario for a reviewer agent that fails to produce a cross-review file. If a reviewer agent crashes, the feature remains in `*_REVIEW` with a permanently `pending` reviewer. No timeout or dead-letter mechanism is specified.

This was raised in the FSPEC cross-review (Q-01) but remains unresolved in the TSPEC.

**Impact:** Without a timeout mechanism, the system has no termination guarantee for review phases under failure conditions. Integration tests cannot assert correct behavior for crashed reviewers because no behavior is defined.

**Recommendation:** Either (a) add a timeout mechanism (e.g., reviewer status set to `pending` for longer than X minutes → pause via ROUTE_TO_USER), or (b) explicitly document this as a known limitation with a planned mitigation in a future phase, and add a note in the test strategy acknowledging this gap.

---

### F-07: `evaluateReviewOutcome()` return type not used consistently in transition algorithm (Low)

The `evaluateReviewOutcome()` function (Section 5.3) returns `"all_approved" | "has_revision_requested" | "pending"`. However, the `transition()` algorithm (Section 5.1) doesn't call `evaluateReviewOutcome()` — it manually checks `event.recommendation` and `reviewerStatuses`. This creates two independent evaluation paths that could diverge.

**Impact:** If the evaluation logic is duplicated in `transition()` and `evaluateReviewOutcome()`, a change in one location may not be reflected in the other. Tests for `evaluateReviewOutcome()` would pass while `transition()` uses different logic.

**Recommendation:** The corrected review algorithm (per F-01 fix) should call `evaluateReviewOutcome()` after all reviewers complete, ensuring a single evaluation path. The algorithm should be:

```
1. Update reviewerStatuses[event.reviewerKey] = event.recommendation
2. outcome = evaluateReviewOutcome(reviewPhaseState)
3. SWITCH outcome:
     "pending": no transition (waiting)
     "all_approved": transition to *_APPROVED + auto_transition
     "has_revision_requested": increment revisionCount, check bound, transition or pause
```

---

### F-08: Test estimate discrepancy for review-tracker module (Low)

Section 7.3 estimates ~20 tests for review-tracker. Section 7.4 lists 18 tests for reviewer manifest alone (6 phases × 3 disciplines), plus outcome evaluation tests (≥3), plus error tests (≥2). This totals ≥23, exceeding the estimate.

**Impact:** Minor — affects planning accuracy but not correctness.

**Recommendation:** Update estimate to ~25.

---

## Clarification Questions

### Q-01: Where does the reviewer dispatch retry live?

FSPEC-AI-01 specifies that when an artifact is missing after LGTM, the agent is re-invoked up to 2 times before pausing. The TSPEC's `processAgentCompletion()` returns `pause` immediately. Is the retry loop intended to live:
- (a) Inside `processAgentCompletion()` (the method retries internally)?
- (b) In the orchestrator's routing loop (the caller retries based on the `pause` action)?
- (c) Intentionally omitted for P0 (immediate pause is acceptable)?

This determines where the retry tests should be written.

### Q-02: How does `getNextAction()` handle the fullstack TSPEC_REVIEW status model?

Section 5.6 specifies that `getNextAction()` checks "reviewer statuses for pending reviewers." For fullstack `TSPEC_REVIEW`, the reviewer keys include compound entries like `pm:fe_tspec`. When recovering from a restart, does `getNextAction()` re-dispatch ALL reviewers (ignoring previously completed reviews), or does it only dispatch reviewers whose status is still `pending`? The latter is more efficient but requires the persisted state to include reviewer-level completion status — which it does via `reviewPhases`, so this should work. Confirm this is the intended behavior.

---

## Positive Observations

- **P-01:** The pure-function reducer pattern (`transition(state, event) → { newState, sideEffects }`) is the single best architectural decision for testability. Every state transition is deterministic and can be tested without any I/O or mock setup. The side effects list is an explicit, assertable output rather than implicit behavior.

- **P-02:** The separation of pure modules (state-machine, review-tracker, cross-review-parser, context-matrix) from I/O modules (state-store, pdlc-dispatcher) creates natural test boundaries. ~105 of the estimated ~148 tests are pure-function unit tests requiring zero mocks.

- **P-03:** The `FakeStateStore` design (Section 7.2) with `loadError`, `saveError`, and `saveCount` is well-crafted for testing failure paths. The error injection points align exactly with the state-store error scenarios in Section 6.

- **P-04:** The `FakePdlcDispatcher` with call recording arrays (`processAgentCompletionCalls`, `processReviewCompletionCalls`) enables assertion on method invocation patterns, which is crucial for verifying the orchestrator routes signals correctly.

- **P-05:** The requirement-to-component mapping (Section 8) covers all 43 requirements. This makes it straightforward to derive a coverage matrix for the PROPERTIES document and verify that every requirement has test coverage.

- **P-06:** The `TransitionResult` type returning both `newState` and `sideEffects[]` is elegant. Tests can assert the state change AND the expected side effects (dispatch, pause, log) in a single assertion, making test intent clear.

- **P-07:** The context matrix (Section 5.5) as a pure lookup function with a simple options interface (`isRevision`, `agentScope`) is highly testable — each matrix cell is an independent test case with deterministic output.

---

## Summary

The TSPEC is well-structured and the architecture is highly testable. The pure-function reducer pattern, protocol-based dependency injection, and well-designed test doubles are excellent.

However, there is one critical defect that requires revision before this TSPEC can be approved:

1. **F-01 (High): The review evaluation algorithm contradicts the approved FSPEC-RT-02 collect-all-then-evaluate model.** The current algorithm early-exits on the first rejection, meaning authors only receive one reviewer's feedback per revision cycle. This is the exact problem the FSPEC change was designed to solve. All review-phase test scenarios depend on this behavior being correct.

2. **F-02 (High): `processResumeFromBound()` is missing from the PdlcDispatcher protocol.** Without it, the revision bound resume behavior (Section 9.3) cannot be implemented or tested against the protocol.

Additional Medium findings (F-03 through F-06) should be addressed but do not block approval:
- F-03: REQ-SM-11 misattribution in traceability
- F-04: FakeFileSystem extension not specified
- F-05: Artifact validation retry vs. immediate pause
- F-06: No reviewer timeout mechanism

**Recommendation: Needs revision** — address F-01 (rewrite review evaluation algorithm to collect-all-then-evaluate) and F-02 (add `processResumeFromBound()` to PdlcDispatcher protocol), then route back for re-review.
