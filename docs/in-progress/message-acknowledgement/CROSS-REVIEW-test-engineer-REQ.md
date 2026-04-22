# Cross-Review: Test Engineer — REQ-message-acknowledgement

**Reviewer Role:** Senior Test Engineer
**Document Reviewed:** REQ-message-acknowledgement.md
**Review Date:** 2026-04-21
**Recommendation:** Need Attention

---

## Summary

The REQ is well-structured and most acceptance criteria are testable. Several high-severity gaps exist: the reply format in REQ-MA-02 references `postPlainMessage` but the codebase currently calls `postPlainMessage` rather than `postReply`/`replyToMessage`, and it is unclear which method name is authoritative — this ambiguity would produce untestable acceptance criteria. Two Medium findings cover a missing negative test for the ack-failure log message format and an under-specified sequencing constraint in REQ-NF-17-01. REQ-NF-17-03 explicitly delegates deduplication to Discord's native behaviour without specifying the observable outcome for the application-level test, making it untestable as written.

---

## Findings

| ID | Severity | Finding | Section ref |
|----|----------|---------|------------|
| F-01 | High | **Ambiguous Discord method for reply**: REQ-MA-02 and REQ-MA-05 specify posting a plain-text reply to the thread but do not name the method. The codebase exposes both `postPlainMessage(threadId, content)` and `replyToMessage(channelId, messageId, content)` on `DiscordClient` (confirmed in `FakeDiscordClient`). The acceptance criteria say "A plain-text bot message appears in the thread" which is consistent with `postPlainMessage`, but A-16 bundles both `addReaction` and `postPlainMessage` without mentioning `replyToMessage`. An engineer writing tests cannot know which call to assert on the fake. | REQ-MA-02, REQ-MA-05, A-16 |
| F-02 | High | **REQ-NF-17-03 is untestable at the application layer**: The acceptance criterion explicitly states "Discord deduplicates the reaction (Discord's native behaviour). No application-layer deduplication is required." There is no observable unit/integration test for this property — a test cannot call the real Discord API. As written, this requirement produces no test at all. If the intent is that the application must NOT attempt deduplication, that negative constraint must be stated explicitly so a test can assert that `addReaction` is called once (not suppressed by app logic). | REQ-NF-17-03 |
| F-03 | Medium | **Ack-failure log format not testable as specified**: REQ-MA-06 states the error must be logged "at WARN level with the message `Acknowledgement failed: {error message}`". The existing `FakeLogger` pattern in the project captures log entries with `level` and `message` fields and tests assert on substrings. However the exact format string is the only observable contract for a unit test, and the requirement uses curly-brace placeholders without specifying whether `{error message}` is the `.message` property or `String(error)`. Without this precision an engineer cannot write an unambiguous assertion. | REQ-MA-06 |
| F-04 | Medium | **REQ-NF-17-01 sequencing is untestable without an observable ordering mechanism**: The criterion says "The Temporal operation is not delayed by the acknowledgement" — this is a latency/ordering constraint, not an observable boolean. A unit test can verify that acknowledgement calls are made after the Temporal call returns, but not that they do not add latency to the Temporal path. The THEN clause should be restated as a structural invariant: "acknowledgement calls appear in the call log only after the Temporal method resolves", which is assertable against the fake clients. | REQ-NF-17-01 |
| F-05 | Low | **No negative test for REQ-MA-03 (signal routed — no reply posted)**: The acceptance criterion states "No additional bot reply is posted in the thread." This negative constraint is stated in prose but there is no explicit test anchor. An engineer might miss this and only assert the positive reaction call. The criterion should add: "AND the fake Discord client's `postPlainMessage` and `replyToMessage` call logs remain empty." | REQ-MA-03 |
| F-06 | Low | **Error truncation boundary not tested as an edge case**: REQ-MA-05 specifies `{error message}` is truncated to 200 characters "if longer." The acceptance criterion only checks that the message is human-readable and lacks a stack trace. There is no acceptance criterion covering: (a) a message exactly 200 chars is not truncated, (b) a message of 201 chars is truncated to 200, and (c) the truncation does not cut a multi-byte UTF-8 character mid-sequence. These are three distinct unit test cases. | REQ-MA-05 |
| F-07 | Low | **REQ-MA-02 reply sequencing relative to reaction is underspecified**: The acceptance criterion depends on REQ-MA-01 (reply posted "WHEN: The ✅ reaction has been added"). This implies a strict ordering: reaction first, then reply. However the THEN clause does not state this ordering must be observable, nor what happens if the reaction call succeeds but the reply call fails. The swallowing rule in REQ-MA-06 covers individual method failures but does not clarify partial success ordering. An engineer writing tests needs to know: should the reply still be attempted if the reaction call throws? | REQ-MA-02, REQ-MA-06 |
| F-08 | Low | **Success metric measurement is manual-only for a P0 requirement**: Section 4 defines all metrics as "Manual testing" for all five scenarios including P0 requirements. For a unit-testable property such as "reaction appears after workflow start", relying solely on manual testing creates a test coverage gap. The metrics section should distinguish which scenarios will have automated test coverage versus manual acceptance only. | Section 4 |

---

## Questions

| ID | Question |
|----|---------|
| Q-01 | REQ-MA-02 says the reply format is `Workflow started: {workflowId}` but the current `startNewWorkflow` implementation in `temporal-orchestrator.ts` posts `Started workflow ${workflowId} for ${slug}` via `postPlainMessage`. Which format is authoritative — the REQ or the existing code? |
| Q-02 | For REQ-MA-06: when both `addReaction` and `postPlainMessage` are called for the workflow-started case (REQ-MA-01 + REQ-MA-02) and the reaction succeeds but the reply fails, should the reply failure be swallowed independently? Or should neither be retried as a unit? |
| Q-03 | REQ-NF-17-03 defers deduplication to Discord. Is there a test environment (e.g., a Discord sandbox or recorded HTTP fixture) where this native behaviour can be exercised, or is it verified only in production? If only in production, should this requirement be classified as out-of-scope for automated test coverage? |
| Q-04 | A-19 notes that Unicode emoji strings may require additional encoding. If `addReaction` requires percent-encoding (e.g., `%E2%9C%85`), the acceptance criteria emoji literals in REQ-MA-01, REQ-MA-03, and REQ-MA-04 would need to change. Has this been verified against the real Discord API or the existing `DiscordJsClient` implementation? |

---

## Positive Observations

- The two-tier approach (reaction + optional reply) cleanly separates the observable outcomes per scenario — each tier maps to a distinct fake call on `FakeDiscordClient`, making unit tests straightforward to write.
- REQ-MA-06 is one of the stronger requirements in the document: it names the exact log level, message prefix, and expected post-condition (`handleMessage()` returns normally), providing everything needed to write a complete negative-path unit test.
- The `FakeDiscordClient` already has `addReactionCalls`, `addReactionError`, `postPlainMessage` call recording, and `postPlainMessageError` properties — the test infrastructure is ready for this feature with no new fixtures required.
- Explicitly scoping out `retry-or-cancel` and `resume-or-cancel` signals (Section 3.2) avoids scope creep and makes the test surface well-defined.

---

## Recommendation

**Need Attention**

F-01 (ambiguous method name) and F-02 (untestable NF requirement) are blocking: an engineer cannot write precise tests until the method name for reply posting is pinned and REQ-NF-17-03 is restated as an application-layer invariant. F-03 and F-04 must also be resolved to ensure the WARN log assertion and sequencing constraint can be implemented unambiguously.
