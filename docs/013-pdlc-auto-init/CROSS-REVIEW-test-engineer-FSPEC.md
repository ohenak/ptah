# Cross-Review: Test Engineer → FSPEC

## PDLC Auto-Initialization (013)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | `013-FSPEC-pdlc-auto-init.md` (v1.1, Draft) |
| **Review Round** | 2 (re-review following FSPEC v1.1 update) |
| **Date** | March 15, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

FSPEC v1.1 resolves all five findings and both clarification questions raised in the round-1 TE review. The agent-turn definition now correctly uses `isBot === true AND content contains <routing> tag`; the "initial message" is consistently typed as the first chronological message with `isBot === false` across PI-01, DC-01 Description, and BR-DC-06; AT-BC-03 includes the log assertion; AT-DC-09 covers the reverse keyword-conflict case; AT-PI-01 asserts the resulting `FeatureConfig`; the race-condition edge case now specifies that the second `initializeFeature()` call does not throw; and OQ-03/OQ-04 resolve the two open clarification questions in full. The FSPEC is substantially testable.

Two issues remain before a TSPEC can be authored. The more significant one concerns the scope of AT-PI-04's concurrency scenario (also raised by the BE in their round-3 finding F-02): the test as written targets same-thread concurrency, which is already eliminated by the per-thread message queue and therefore does not exercise the actual residual risk. The second is a missing negative test on the logging infrastructure fault-tolerance path specified in REQ-PI-03.

---

## Status of Round-1 TE Findings

| Finding | Round-1 Severity | Current Status | Notes |
|---------|-----------------|---------------|-------|
| F-01: AT-BC-03 missing debug log assertion | Medium | **Resolved** | v1.1 AT-BC-03 THEN clause now includes the exact log format assertion |
| F-02: "initial message" definition ambiguous | Medium | **Resolved** | v1.1 consistently uses `isBot === false` across all three locations |
| F-03: AT-DC-07 reverse conflict case missing | Low | **Resolved** | v1.1 added AT-DC-09 for `[fullstack] [backend-only]` → `"backend-only"` |
| F-04: AT-PI-01 missing FeatureConfig assertion | Low | **Resolved** | v1.1 AT-PI-01 THEN clause now includes `{ discipline: "backend-only", skipFspec: false }` |
| F-05: Race condition edge case underspecified | Low | **Resolved** | v1.1 edge case row states the second call does not throw and the orchestrator treats it as a no-op |
| Q-01: Orchestrator posting to feature thread | — | **Resolved (OQ-03)** | `isBot + <routing>-tag` discriminator already excludes orchestrator embeds |
| Q-02: `skipFspec` end-to-end scope | — | **Resolved (OQ-04)** | Phase-skip behavior is explicitly out of scope for Feature 013 |

---

## Findings

### F-01 — **Medium** — AT-PI-04 tests a scenario that the per-thread queue already prevents; the actual cross-thread race has no acceptance test

**Location:** FSPEC-PI-01 — AT-PI-04; REQ-PI-05

AT-PI-04 reads: *"two concurrent messages arrive for the same new feature, both triggering auto-init ... exactly one state record is created."* The orchestrator uses a per-thread message queue (`this.threadQueue.enqueue(message.threadId, ...)`), which serializes all processing within a given Discord thread. Two messages on the **same thread** are therefore never concurrently processed at the `isManaged()` check — they are enqueued sequentially. AT-PI-04 as written passes trivially by virtue of the queue alone, with no need for the idempotency guard in `initializeFeature()`.

The actual race requiring the check-before-write guard is two messages arriving on **different Discord threads** whose names resolve to the same feature slug. Those messages enter separate queue lanes, call `isManaged()` concurrently, both see `false`, and both proceed to `initializeFeature()`. This is the scenario REQ-PI-05 was written to protect against, yet it has no acceptance test.

A test engineer implementing AT-PI-04 would write a test confirming sequential behavior within one thread — a test that passes even if the idempotency guard is absent — and consider REQ-PI-05 covered. The actual cross-thread guard would go untested.

**Recommendation:** Add a clarifying note to AT-PI-04 specifying that "concurrent" refers to cross-thread concurrency (two different `threadId` values resolving to the same feature slug), not same-thread concurrency. Optionally add AT-PI-05 explicitly covering the cross-thread scenario. The BE round-3 review (F-02) flags the same gap and recommends a note; a dedicated AT is more durable.

---

### F-02 — **Low** — No negative acceptance test for the logger-throws fault path in REQ-PI-03

**Location:** FSPEC-PI-01 — Acceptance Tests; REQ-PI-03

REQ-PI-03 specifies two behaviors: (1) an info-level log is emitted, and (2) *"if the logging infrastructure is unavailable or throws, the error is swallowed — the feature remains initialized and routing proceeds."* The FSPEC includes AT-PI-01 through AT-PI-04 but no acceptance test for the logger-fault case.

Without an AT for this path, a test engineer has no FSPEC-level specification to point to when writing the negative test. The error scenario table in FSPEC-PI-01 handles `initializeFeature()` throws and debug-channel failures, but the logger-fault path is only covered in the REQ — not in the FSPEC acceptance tests. Since the FSPEC is the authoritative source for AT-level test coverage, this gap means the logger-fault path may be implemented correctly but not tested.

**Recommendation:** Add AT-PI-05 (or renumber as appropriate): *WHO: As the orchestrator GIVEN: a feature is eligible for auto-initialization AND the logger throws when emitting the info-level log WHEN: the routing loop processes the signal THEN: the logger error is swallowed; `initializeFeature()` has already been called and the state record exists; routing proceeds through the managed PDLC path.*

---

### F-03 — **Low** — No acceptance test confirms that keyword parsing is skipped (and defaults apply) when the initial message is unavailable

**Location:** FSPEC-PI-01 — Edge Cases; FSPEC-DC-01 — Edge Cases

FSPEC-PI-01 specifies in the edge case table: *"Initial message is unavailable (conversation history is empty) → Default configuration is used — no keyword parsing attempted. Feature is initialized with `{ discipline: 'backend-only', skipFspec: false }`."* FSPEC-DC-01 separately specifies the empty-string case in its edge case table.

Neither FSPEC has an acceptance test that covers the empty-history → default-config path end-to-end through the orchestrator. AT-DC-01 covers the no-keyword message case, but not the case where there is no initial message to parse at all. The distinction matters because the code path is different: an empty string is passed to the parser vs. the parser is not called and defaults are applied directly.

**Recommendation:** Add an AT to FSPEC-PI-01 (e.g., AT-PI-06) covering the empty-history case end-to-end: *GIVEN: a feature is eligible for auto-initialization AND the conversation history is empty WHEN: the routing loop processes the signal THEN: keyword parsing is not attempted; `initializeFeature()` is called with `{ discipline: "backend-only", skipFspec: false }`; routing proceeds through the managed PDLC path.*

---

## Clarification Questions

### Q-01 — Is there an observable artifact (return value or log entry) that distinguishes a successful initialization from the idempotent no-op path at the orchestrator level?

**Location:** FSPEC-PI-01 — Edge Cases (race condition row)

The FSPEC specifies that `initializeFeature()` returns the existing `FeatureState` without throwing. However, it does not specify whether the orchestrator emits any log or takes any action to distinguish the two outcomes — a freshly initialized feature vs. one that was already initialized by a concurrent call.

For testing, this is relevant: an integration test for AT-PI-04 / the cross-thread race scenario needs to assert that the second caller did not modify the state record. If `initializeFeature()` returns the existing state silently, the test must inspect the state file directly to confirm no overwrite occurred. If the orchestrator logs a debug message (e.g., `"skipped: already initialized"`), the test can assert on the log instead.

Either approach is acceptable, but the FSPEC should specify which observable signal is available so test engineers can write deterministic assertions without probing the filesystem directly.

---

## Positive Observations

- **All five round-1 TE findings were addressed in a single revision pass.** The change log enumerates each resolved item precisely and the OQ table records the resolution rationale for Q-01 and Q-02. This makes re-review fast and provides a clear audit trail.

- **AT-BC-03 log assertion is now exact-format.** The THEN clause includes the full log string with the interpolated `featureSlug` and turn count, matching the format specified in REQ-BC-02. A test engineer can write a spy assertion against this exact string without any ambiguity.

- **OQ-04 resolution is well-scoped.** Explicitly documenting that Feature 013 is only responsible for parsing and writing `skipFspec` into `FeatureConfig`, with the runtime phase-skip behavior owned by Feature 011's state machine, prevents scope confusion during TSPEC authoring and test planning.

- **BR-DC-01 through BR-DC-06 remain comprehensive.** The case-sensitivity rule (BR-DC-01), last-keyword-wins rule (BR-DC-02), and orthogonality of `skip-fspec` (BR-DC-03) give the test engineer a full property set from which a parameterized test suite can be derived mechanically. The addition of AT-DC-09 confirms position-based precedence is tested in both orderings.

- **Fail-open design for malformed history (FSPEC-BC-01) is explicitly justified.** The stated tradeoff ("better to auto-initialize incorrectly ... than to block a new feature") removes ambiguity about whether the fail-open behavior is intentional. The test engineer can write a negative test asserting that a warning is logged, without needing to verify that the feature was blocked.

- **Fatal vs. non-fatal error classification is clear and complete** for `initializeFeature()` failure (fatal — halt loop, remain unmanaged) and debug-channel failure (non-fatal — warn and continue). These are the two most important error paths for test coverage prioritization and they are unambiguously specified.

---

## Recommendation

**Approved with minor changes.**

F-01 (AT-PI-04 concurrency scope) should be addressed before TSPEC authoring — without it, the idempotency guard in `initializeFeature()` will likely not have a meaningful acceptance test. F-02 and F-03 are low severity and can be addressed at the PM's discretion; they add test completeness but are not blocking for TSPEC authoring. Q-01 is a clarification that does not require a behavioral change — a one-sentence note in the edge case row is sufficient.

The FSPEC is ready for TSPEC authoring after F-01 is resolved.

---

*Reviewed by Test Engineer (`qa`) · March 15, 2026*
