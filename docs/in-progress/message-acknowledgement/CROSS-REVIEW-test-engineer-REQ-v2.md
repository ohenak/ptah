# Cross-Review: Test Engineer — REQ-message-acknowledgement (v2)

**Reviewer Role:** Senior Test Engineer
**Document Reviewed:** REQ-message-acknowledgement.md v1.1
**Review Date:** 2026-04-21
**Recommendation:** Approved with Minor Issues

---

## Summary

All four High and Medium findings from iteration 1 (F-01 through F-04) have been adequately addressed. `replyToMessage()` is now named consistently in REQ-MA-02, REQ-MA-05, and A-16; REQ-NF-17-03 now carries an application-layer at-most-once invariant; REQ-MA-06 now specifies `.message` with `String(err)` fallback; and REQ-NF-17-01 is now a clear call-ordering structural invariant. One new Medium finding was introduced in v1.1: REQ-MA-05 names `query workflows` as an in-scope operation label for the error reply, directly contradicting Section 3.2's explicit exclusion of the `queryWorkflowState()` failure path from acknowledgement scope. The four Low findings from iteration 1 (F-05 through F-08) remain open and are carried forward unchanged. No blocking issues exist — the new contradiction is resolvable by a single clarifying edit to either REQ-MA-05 or Section 3.2.

---

## Prior Findings Resolution

| Prior ID | Severity | Resolution Status | Notes |
|----------|----------|-------------------|-------|
| F-01 | High | Resolved | `replyToMessage(channelId, messageId, content)` named in REQ-MA-02, REQ-MA-05, and A-16. |
| F-02 | High | Resolved | REQ-NF-17-03 now specifies application-layer invariant: `addReaction()` called at most once per (messageId, emoji) pair per `handleMessage()` invocation. THEN clause is assertable against `FakeDiscordClient.addReactionCalls`. |
| F-03 | Medium | Resolved | REQ-MA-06 THEN clause specifies `{err.message}` as `.message` property with `String(err)` fallback for non-Error thrown values. |
| F-04 | Medium | Resolved | REQ-NF-17-01 is now a call-ordering invariant: THEN states "`addReaction()` is called first, then `replyToMessage()` if applicable. Neither acknowledgement call precedes the Temporal operation's resolution." Assertable against fake call logs. |

---

## Findings

### Finding 1: REQ-MA-05 operation label scope contradicts Section 3.2

- **Severity:** Medium
- **Location:** REQ-MA-05, Section 3.2 (Out of Scope)
- **Issue:** REQ-MA-05 lists `query workflows` as one of the three in-scope operation labels for the error reply (`Failed to query workflows: {error message}`). However, Section 3.2 explicitly excludes the Temporal query failure path: "when `queryWorkflowState()` throws a non-`WorkflowNotFoundError`... `handleMessage()` performs a silent early-exit... intentionally excluded from acknowledgement scope." These two statements directly contradict each other. A test engineer cannot determine whether to write a test that asserts an error reply is posted when `queryWorkflowState()` throws a non-`WorkflowNotFoundError`. If the test is written and the implementation follows Section 3.2 (silent early-exit), the test will fail; if the test is written and the implementation follows REQ-MA-05, Section 3.2 is violated.
- **Recommendation:** Resolve the contradiction by choosing one of two options: (A) Remove `query workflows` from REQ-MA-05's operation label list and update the list to only cover `start workflow` and `route answer`, keeping Section 3.2's silent early-exit unchanged. (B) Update Section 3.2 to remove the `queryWorkflowState()` failure path from the out-of-scope list, and add acknowledgement for that path. Option A is preferred as it preserves the existing intent and requires fewer changes.

---

### Finding 2: No negative test anchor for REQ-MA-03 no-reply constraint (carried from F-05)

- **Severity:** Low
- **Location:** REQ-MA-03
- **Issue:** The THEN clause states "No additional bot reply is posted in the thread" but does not provide an explicit acceptance criterion anchor that specifies which fake call log must remain empty. An engineer writing tests might only assert the positive reaction call and overlook the negative.
- **Recommendation:** Add to the THEN clause: "AND `FakeDiscordClient.replyToMessageCalls` remains empty for this invocation."

---

### Finding 3: Error truncation boundary cases absent from acceptance criteria (carried from F-06)

- **Severity:** Low
- **Location:** REQ-MA-05
- **Issue:** The description specifies truncation to 200 characters "if longer" but the THEN clause only verifies human-readable output and absence of stack trace. Three distinct unit test cases are implied but not anchored: (a) error message exactly 200 characters is not truncated, (b) error message of 201 characters is truncated to exactly 200 characters, (c) truncation does not split a multi-byte UTF-8 character sequence.
- **Recommendation:** Add explicit acceptance criteria for the boundary cases. At minimum: "A 200-character error message is not truncated; a 201-character message is truncated to 200 characters in the reply."

---

### Finding 4: Partial success ordering under REQ-MA-06 swallowing is unspecified (carried from F-07)

- **Severity:** Low
- **Location:** REQ-MA-02, REQ-MA-06
- **Issue:** REQ-MA-02 depends on REQ-MA-01 (reaction must be added before reply is posted) and REQ-MA-06 specifies per-call swallowing. It remains unspecified whether `replyToMessage()` should still be attempted if `addReaction()` throws and is swallowed. A test engineer writing the partial-success case (reaction fails, reply proceeds vs. reply is skipped) has no authoritative acceptance criterion.
- **Recommendation:** Add a single sentence to REQ-MA-06: "Each acknowledgement call is wrapped independently — the failure of `addReaction()` does not suppress a subsequent `replyToMessage()` call, and vice versa."

---

### Finding 5: P0 success metrics are manual-only with no automated test coverage distinction (carried from F-08)

- **Severity:** Low
- **Location:** Section 4
- **Issue:** All five success metrics are listed as "Manual testing: ..." including P0 requirements that are fully unit-testable (e.g., reaction appears after workflow start, error reply is posted on failure). This creates a documentation gap — engineers may not realize automated test coverage is expected for these properties.
- **Recommendation:** Add a "Test Level" column to Section 4 distinguishing "Automated (unit)" from "Manual (E2E)" per scenario. The reaction/reply presence checks for P0 scenarios are unit-testable via `FakeDiscordClient`; only the latency check (within 5 seconds) requires manual or integration-level verification.

---

## Positive Observations

- The resolution of F-01 is clean and comprehensive: `replyToMessage` is named consistently in the description, THEN clause, and A-16 of every affected requirement — no ambiguity remains for test authorship.
- REQ-NF-17-03's new application-layer invariant ("at most once per (messageId, emoji) pair per invocation") maps directly to asserting `fake.addReactionCalls.filter(c => c.messageId === X && c.emoji === Y).length === 1` — a precise, implementable assertion.
- REQ-MA-05's three operation labels (`query workflows`, `start workflow`, `route answer`) with explicit scoping of exclusions is well-structured. Once Finding 1 is resolved (removing `query workflows` or aligning with Section 3.2), the test surface for REQ-MA-05 will be unambiguous.
- The `FakeDiscordClient` already exposes `addReactionCalls`, `addReactionError`, `replyToMessageCalls`, and `replyToMessageError` — no new fake infrastructure is needed for this feature's unit tests.

---

## Recommendation

**Approved with Minor Issues**

Finding 1 (Medium) should be resolved before the FSPEC is authored to prevent the contradiction from propagating into behavioral specs. The Low findings (2–5) can be addressed in the FSPEC or TSPEC phase without blocking progress. No High findings remain.
