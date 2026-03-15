# Cross-Review: Product Manager Review of TSPEC-011

| Field | Detail |
|-------|--------|
| **Document** | [011-TSPEC-orchestrator-pdlc-state-machine.md](011-TSPEC-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Product Manager (`pm`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: REQ-SM-11 mapped to wrong requirement in Section 8 (Medium)

Section 8 (Requirement → Technical Component Mapping) maps REQ-SM-11 to "3-cycle revision limit per phase." REQ-SM-11 is actually "Parallel implementation (fork)" — the fork/join requirement for fullstack IMPLEMENTATION. The revision bound is REQ-RT-09. This is a copy error in the mapping table.

**Impact:** Traceability gap — REQ-SM-11 (parallel implementation) appears to be mapped but is actually unmapped, while REQ-RT-09 appears mapped twice (once correctly under its own row, once incorrectly under SM-11).

**Recommendation:** Fix the mapping: `REQ-SM-11 → transition() fork/join logic | Parallel implementation for fullstack features`.

---

### F-02: Review phase evaluation uses early-exit on rejection, contradicting FSPEC-RT-02 v1.1+ collect-all-then-evaluate (Medium)

TSPEC Section 5.1, "Review Phase Evaluation Algorithm" step 2 states:
```
2. IF event.recommendation === "revision_requested":
     a. Increment revisionCount
     b. IF revisionCount > 3: ... pause
     c. ELSE: Reset ALL reviewerStatuses to "pending" → transition to creation
```

This processes rejection immediately upon receiving a single `review_submitted` event, which is the early-exit model. FSPEC-RT-02 v1.1 changed to collect-all-then-evaluate (BR-RL-03): "The orchestrator dispatches ALL reviewers and waits for ALL to complete before evaluating the outcome."

In the FSPEC model, `review_submitted` events update per-reviewer status, but the phase outcome is only evaluated when NO reviewers remain `pending`. The TSPEC's algorithm evaluates on every single event, which means a rejection from the first reviewer would trigger revision before the second reviewer completes.

**Impact:** This contradicts a product decision made to ensure authors receive ALL feedback in a single revision round. The TSPEC must implement collect-all-then-evaluate.

**Recommendation:** Revise the evaluation algorithm:
1. On `review_submitted`: update `reviewerStatuses[key] = recommendation`. No phase change yet.
2. After update: check if any reviewer is still `pending`. If yes → no action (wait).
3. If no reviewers are `pending`: evaluate — any `revision_requested` → revision loop; all `approved` → advance.

---

### F-03: `processAgentCompletion()` handles artifact validation differently than FSPEC-AI-01 (Low)

TSPEC Section 5.6 `processAgentCompletion()` step 4 returns `{ action: "pause" }` when an artifact is missing. FSPEC-AI-01 step 5 specifies re-invoking the agent (up to 2 re-invocations, 3 total attempts) before pausing.

The TSPEC appears to immediately pause on missing artifact, skipping the re-invocation retry. FSPEC-AI-01 AT-DI-04 expects re-invocation, and AT-DI-07 expects escalation only after 3 total attempts.

**Impact:** Low — this is a behavioral difference but may be intentional simplification for the TSPEC's `processAgentCompletion()` scope (the retry logic may live in the orchestrator's routing loop). However, the artifact validation retry behavior should be explicitly specified somewhere in the TSPEC.

**Recommendation:** Either add a note that artifact validation retry (FSPEC-AI-01 step 5, max 2 re-invocations) is handled by the orchestrator routing loop before calling `processAgentCompletion()`, or add the retry logic inside the dispatcher.

---

### F-04: Fullstack partial-rejection "Resubmit" directive not reflected in TSPEC (Low)

FSPEC-RT-02 v1.2 edge case specifies that when fullstack TSPEC_REVIEW has a partial rejection (e.g., frontend TSPEC rejected, backend TSPEC approved), the approved sub-task author receives a "Resubmit" directive (not "Revise"). The TSPEC's `SideEffect` type and `TaskType` only include `"Create" | "Review" | "Revise" | "Implement"` — there is no "Resubmit" task type.

**Impact:** Low — "Resubmit" was a product UX decision to avoid confusing the approved author. Without it, the approved author would receive a "Revise" directive even though their work was approved, which is the scenario FSPEC-RT-02 AT-RL-08 was designed to prevent.

**Recommendation:** Add `"Resubmit"` to the `TaskType` union, or handle it as a variant of "Create" with a specific message template that communicates "no changes needed."

---

### F-05: OQ-01 proposes deferring REQ-SA-01 through SA-06 — product alignment needed (Low)

Open Question OQ-01 proposes handling SKILL.md simplification (REQ-SA-01–SA-06) as a separate documentation task after the state machine is deployed. This is a reasonable sequencing decision — deploying the state machine first, then updating SKILL.md files, avoids a mixed state during transition (per Risk R-06 in the REQ).

However, the REQ-SM-NF-03 backward compatibility mechanism (managed vs. unmanaged features) means agents will still read the old SKILL.md with embedded PDLC logic for managed features. The PDLC state machine will drive workflow, but the agents' SKILL.md will still instruct them to self-select tasks and manage routing. This creates a conflict until SKILL.md files are updated.

**Impact:** During the transition period, agents receive conflicting instructions — the orchestrator says "Create TSPEC" via the task directive, but the SKILL.md says "check the incoming message and self-select your task." The task directive should take precedence (agents see the ACTION line), but the SKILL.md's task selection logic may interfere.

**Recommendation:** Agree with deferring SA-01–SA-06 as a separate task, but add a note that SKILL.md updates should happen as the immediate follow-up before any new features use the PDLC state machine. The transition risk is acceptable because the orchestrator's explicit task directive (ACTION line) overrides the SKILL.md's self-selection logic — agents have been trained to prioritize ACTION directives.

---

## Clarification Questions

### Q-01: `processResumeFromBound()` method not in PdlcDispatcher interface

Section 9.3 references `pdlcDispatcher.processResumeFromBound(featureSlug)` for handling the revision bound resume protocol. However, this method is not listed in the `PdlcDispatcher` interface definition in Section 4.3.2. Is this an intentional omission (to be added during implementation), or is the resume handled through a different method?

---

## Positive Observations

- **P-01:** The pure-function reducer pattern `transition(state, event) → { newState, sideEffects }` perfectly implements the product requirement for deterministic transitions (US-13). Side effects are returned as data rather than executed, making every transition testable without I/O.

- **P-02:** The `SideEffect` discriminated union cleanly represents every action the orchestrator needs to take after a transition. This maps exactly to the behavioral flows in FSPEC-SM-01 and FSPEC-RT-02.

- **P-03:** The `PdlcDispatcher` protocol provides a clean integration boundary. The orchestrator doesn't need to understand the state machine internals — it calls `processAgentCompletion()` or `processReviewCompletion()` and receives a `DispatchAction`. This achieves the simplification goal from US-18.

- **P-04:** The reviewer status model using `Record<string, ReviewerStatus>` with composite keys (`"pm:fe_tspec"`) correctly implements FSPEC-RT-02's reviewer-document pair tracking. The `ReviewerManifestEntry` type with optional `scope` field is an elegant solution.

- **P-05:** The backward compatibility design (Section 5.8) — checking `isManaged()` and branching between `PdlcDispatcher` and `RoutingEngine` — preserves existing functionality exactly as specified in REQ-SM-NF-03.

- **P-06:** The requirement-to-component mapping (Section 8) covers all 45 requirements, with appropriate handling of REQ-SA-01–06 as out of TSPEC scope. Every functional requirement has a clear technical home.

- **P-07:** The migration infrastructure (Section 5.7) is forward-looking but lightweight — an empty registry with the sequential migration pattern ready for future schema changes. This fulfills REQ-SM-10 without over-engineering.

- **P-08:** Test strategy (Section 7) with ~148 estimated tests and clear separation between pure-function unit tests and integration tests aligns with the project's testing philosophy.

---

## Summary

This is a well-structured TSPEC that faithfully translates the approved REQ and FSPEC into a concrete technical design. The pure-function architecture, protocol-based dependency injection, and clear module boundaries demonstrate strong engineering discipline.

The main product-perspective concern is **F-02** — the review phase evaluation algorithm implements early-exit on rejection rather than the collect-all-then-evaluate model specified in FSPEC-RT-02 v1.1. This is a product decision (ensuring authors receive all feedback in one round) that must be reflected in the implementation.

**F-01** (mapping error) is a simple fix. **F-03** and **F-04** are minor behavioral differences that need clarification. **F-05** is a transition sequencing note that can be addressed in the execution plan.

**Recommendation: Approved with minor changes** — address F-01 (mapping error) and F-02 (collect-all-then-evaluate), then proceed to PLAN.
