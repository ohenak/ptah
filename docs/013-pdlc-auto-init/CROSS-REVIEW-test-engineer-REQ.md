# Cross-Review: Test Engineer → REQ

## PDLC Auto-Initialization (013)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | `013-REQ-pdlc-auto-init.md` (v1.0, Draft) |
| **Date** | March 15, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

The REQ document is well-scoped and clearly motivated. The three functional domains (PDLC Initialization, Backward Compatibility, and Discipline Configuration) address distinct behavioral areas, and all requirements have at least one acceptance criterion in Who/Given/When/Then format. Requirements traceability from user scenarios to requirements to NFRs is consistent. However, several acceptance criteria lack sufficient precision for a test engineer to write deterministic tests without further clarification, and a handful of edge and error scenarios implied by the requirements are missing from the AC text. These gaps would create ambiguity at the TSPEC phase. None of the issues are blocking by themselves, but collectively they warrant targeted fixes before the TSPEC is authored.

---

## Findings

### F-01 — **High** — REQ-PI-05 AC does not specify observable outcome for the "skipped" second initialization

**Location:** Section 4.1 — REQ-PI-05 Acceptance Criteria

The AC for REQ-PI-05 states: *"only one state record is created; the second call detects the existing record and skips initialization."* This is behaviorally correct but does not specify what the orchestrator observes from the second `initializeFeature()` call. Specifically:

- Does the second call return the existing `FeatureState` (success, no-op return)?
- Does it return `void` or a status enum?
- Does it throw a distinguishable error that the orchestrator must catch and treat as non-fatal?

A test engineer writing the integration test for this AC cannot assert correct orchestrator behavior without knowing what the second call returns. If the implementation throws and the test expects a return value (or vice versa), the test will be wrong regardless of the implementation's correctness.

**Recommendation:** Add a THEN clause: `AND: the second call to initializeFeature() resolves without throwing; the orchestrator treats it as a no-op and proceeds to the managed PDLC path with the existing state record intact`. This is a testable, unambiguous outcome.

---

### F-02 — **Medium** — REQ-BC-01 AC is missing the "exactly 2 prior turns" boundary assertion

**Location:** Section 4.2 — REQ-BC-01 Acceptance Criteria

The AC for REQ-BC-01 tests the case where `turnCount = 3`, which is clearly above the threshold. It does not test the exact boundary at `turnCount = 2` — the minimum value that causes "not eligible." A test for `turnCount = 3` passes whether the threshold is 1, 2, or 2.5. The boundary condition (first value that fails the guard) is the most important test for any threshold-based rule.

Without a boundary assertion in the REQ, the TSPEC author may derive it from the FSPEC (where it is implied), but the REQ itself remains underspecified at the boundary.

**Recommendation:** Add a second THEN scenario to the AC: `AND GIVEN: the thread has exactly 2 prior agent turns WHEN: the orchestrator processes the routing signal THEN: the feature is NOT auto-initialized; it continues through the unmanaged/legacy path`. This makes the threshold explicitly testable from the REQ level.

---

### F-03 — **Medium** — REQ-PI-03 and REQ-PI-04 ACs do not specify failure behavior for the log/notification calls

**Location:** Section 4.1 — REQ-PI-03 and REQ-PI-04 Acceptance Criteria

REQ-PI-03 (info log) and REQ-PI-04 (debug channel notification) each specify what happens on success. Neither specifies what happens if the logging infrastructure or Discord posting fails:

- REQ-PI-03: If the logger is unavailable or throws, should the orchestrator swallow the error and continue? Should it halt?
- REQ-PI-04: The description says P1 priority (lower), which suggests it is non-fatal, but the AC contains no THEN clause for the failure case.

A test engineer verifying these requirements cannot write a negative test case (e.g., "logger throws → orchestrator still completes initialization") without knowing whether this is expected behavior. The FSPEC (FSPEC-PI-01, Error Scenarios) does address debug channel failure as non-fatal but does not address logger failure. The REQ should be self-sufficient on this point.

**Recommendation:** Add to REQ-PI-04's AC: `AND GIVEN: the debug channel post fails WHEN: the orchestrator attempts the notification THEN: a warning is logged, but the feature remains initialized and routing proceeds`. For REQ-PI-03, clarify whether logging failure is fatal or swallowed.

---

### F-04 — **Medium** — REQ-DC-01 AC does not cover the case-sensitivity rule explicitly

**Location:** Section 4.3 — REQ-DC-01 Acceptance Criteria

REQ-DC-01 states that keywords must appear in square brackets. The description mentions `[backend-only]`, `[frontend-only]`, and `[fullstack]` as supported keywords. However, the AC only tests the positive case (`[fullstack]` → `discipline: "fullstack"`). There is no negative AC in REQ-DC-01 for case variants like `[FULLSTACK]` or `[Fullstack]`.

Without a negative AC at the REQ level, an implementation that performs case-insensitive matching would satisfy REQ-DC-01 as written. The case-sensitivity rule is only enforced downstream in FSPEC-DC-01 (BR-DC-01). The REQ should not rely on the FSPEC to close this gap — requirements should be independently testable.

**Recommendation:** Add a second THEN clause: `AND GIVEN: the message contains "[FULLSTACK]" (incorrect case) WHEN: the orchestrator auto-initializes THEN: the unrecognized keyword is ignored and default discipline ("backend-only") is applied`. This makes case-sensitivity a testable REQ-level property.

---

### F-05 — **Low** — REQ-NF-01 latency AC lacks measurement protocol

**Location:** Section 5 — REQ-NF-01 Acceptance Criteria

The AC states: *"Auto-initialization latency is under 100ms as measured in integration tests."* This is a reasonable bound, but the AC does not specify:
- How latency is defined (wall clock from entering auto-init branch to completing `initializeFeature()`, or end-to-end routing loop overhead?)
- What the test environment is (CI, local dev, specific hardware?)
- Whether the 100ms bound is a p50, p95, or p99 target

Without these details, two engineers could write tests that both claim to verify REQ-NF-01 but measure different things and produce incomparable results.

**Recommendation:** Add one sentence: *"Latency is measured as wall-clock time from the auto-init eligibility check entry to the return of `initializeFeature()`, in the CI test environment, as a p95 value across 100 runs."* If a simpler bound is intended (single-run maximum), state that explicitly.

---

### F-06 — **Low** — REQ-BC-02 AC does not specify the log level or format must be verifiable in tests

**Location:** Section 4.2 — REQ-BC-02 Acceptance Criteria

REQ-BC-02 requires a debug-level log message when auto-initialization is skipped. The AC specifies the exact message format, which is good. However, it does not state that the log level must be `debug` in a way that is assertable in tests — only that the message "explains why." A test engineer verifying this requirement needs to assert:
1. The log was emitted (presence check)
2. The log level is `debug` (not `info` or `warn`)
3. The log message matches the exact format

The current AC covers (3) partially (the format is given) but is silent on (1) and (2). If the implementation emits an `info`-level log instead of `debug`, it passes the text-format check but violates the requirement.

**Recommendation:** Revise the THEN clause: `THEN: a debug-level (not info or warn) log message is emitted matching the exact format \`[ptah] Skipping PDLC auto-init for "{featureSlug}" — thread has {turnCount} prior turns (threshold: 1)\`; the log level must be assertable via the test logger spy`.

---

### F-07 — **Low** — Missing negative test case: feature slug not resolvable from thread context

**Location:** Section 4.1 — REQ-PI-01 and Section 7 (Scope Boundaries)

The scope section mentions "Feature slug cannot be resolved from thread context → orchestrator falls through to existing error handling" but this case has no corresponding requirement or acceptance criterion. This leaves an implied behavior (fall through to existing error handling) that is tested nowhere in the requirements document.

If a test engineer is asked to validate REQ-PI-01's claim that auto-initialization only triggers when a feature slug exists, they have no REQ-level assertion to verify the negative: that the orchestrator correctly handles an unresolvable slug without attempting auto-init.

**Recommendation:** Add a brief negative requirement or extend REQ-PI-01's AC: `AND GIVEN: the feature slug cannot be resolved from thread context WHEN: the orchestrator processes the signal THEN: auto-initialization is NOT attempted; existing error handling (error path, no state mutation) applies`. Alternatively, document this explicitly as a scope exclusion referencing the existing error path.

---

## Clarification Questions

### Q-01 — What constitutes "prior agent turns" for the age guard — and is this definition consistent with the actual `ThreadMessage` type?

**Location:** Section 4.2 — REQ-BC-01

REQ-BC-01 references "prior agent turns" but does not define this term at the REQ level — the definition is deferred to the FSPEC. For a REQ document to be self-sufficient for testing purposes, it should at minimum specify what observable unit constitutes an "agent turn." The backend engineer's FSPEC cross-review (F-01) identified that the `ThreadMessage` type uses `isBot: boolean` (not a `role` field) as the discriminator. If the REQ-level definition references undefined terms, a test author reading only the REQ cannot write a correct test.

Can the REQ-BC-01 description or a footnote clarify that "prior agent turn" means a message in the thread history that originates from a bot (agent or orchestrator)? Or explicitly state that the precise definition is in the FSPEC with a cross-reference?

---

### Q-02 — Does auto-initialization occur on ANY first routing signal, or only on specific signal types (e.g., LGTM)?

**Location:** Section 4.1 — REQ-PI-01 Acceptance Criteria

REQ-PI-01's AC example uses LGTM as the trigger signal: *"GIVEN: an agent returns LGTM for a feature slug with no state record."* However, the description says *"when the orchestrator processes a routing signal"* — which suggests any signal type (LGTM, ROUTE_TO_USER, TASK_COMPLETE, ROUTE_TO_AGENT) could trigger auto-initialization.

A test engineer needs to know whether to test auto-init behavior for all four signal types, or only for LGTM. If auto-init is gated to specific signal types, that gate condition should appear in the requirement. If it applies to all signal types, the AC example should say "any routing signal" instead of "LGTM."

---

### Q-03 — What is the ordering guarantee between the log (REQ-PI-03) and the channel notification (REQ-PI-04)?

**Location:** Section 4.1 — REQ-PI-03 and REQ-PI-04

Both are required to fire "when the state record is created." Should the log precede the channel notification, or is the order undefined? If both can interleave with the managed-path routing that immediately follows, a test might assert on log presence but miss a race between posting and routing. Specifying a sequential order (log → notify → route) or stating that order is undefined would allow a test engineer to write deterministic assertions.

---

## Positive Observations

- **Traceability is complete and bidirectional.** Every requirement links to at least one user scenario ([US-20], [US-21], [US-22]) and back-references its parent from Feature 011 ([REQ-SM-02], [REQ-FC-02], etc.). This means a test engineer can trace each AC back to a user need — which prevents over-testing incidental behavior.

- **Acceptance criteria format is consistently correct.** All 10 functional requirements use Who/Given/When/Then format. The majority of ACs are specific enough to derive a test name and assertion directly. REQ-PI-03's exact log message format is exemplary.

- **The age guard threshold is explicitly justified.** The rationale for threshold = 1 (in the FSPEC's "Why 1" section, referenced from REQ-BC-01) makes the boundary condition defensible and documents the design intent. This removes ambiguity about whether a threshold-off-by-one is a bug or a feature — an important property for regression test writing.

- **Idempotency is a first-class P0 requirement.** REQ-PI-05 raises race-condition handling to P0 rather than deferring it to implementation. This ensures it will be tested, not treated as an edge case to handle "if we have time."

- **Keyword parsing requirements specify exact format constraints.** REQ-DC-01's square-bracket requirement and REQ-DC-03's "unknown keyword ignored" requirement together form a complete contract for a property-based test: any string → either recognized keyword with known effect, or unknown keyword with no effect. No third outcome is possible.

- **NFR-03 ties test coverage explicitly to requirements.** "All new requirements have corresponding test cases" is a testability requirement itself — it creates a contractual obligation that no requirement is implemented without a test, which is an excellent practice for a feature of this scope.

---

## Recommendation

**Approved with minor changes.**

The REQ document is structurally sound and provides enough context for a TSPEC author to begin work. Address F-01 (REQ-PI-05 idempotency observable outcome) and F-02 (REQ-BC-01 boundary condition) before the TSPEC is written — both would otherwise force the TSPEC to make product-level decisions that belong in the REQ. F-03 (log/notification failure behavior) should also be clarified since it determines whether negative tests for REQ-PI-04 are in scope. F-04 through F-07 are low severity and can be addressed in the same pass.

Q-01 requires a one-line clarification or cross-reference. Q-02 is potentially blocking for TSPEC test scope and should be resolved before TSPEC authoring. Q-03 is a test ordering question that affects test determinism but not product behavior.

The PM may proceed to TSPEC authoring after addressing F-01, F-02, F-03, and Q-02.

---

*Reviewed by Test Engineer (`qa`) · March 15, 2026*
