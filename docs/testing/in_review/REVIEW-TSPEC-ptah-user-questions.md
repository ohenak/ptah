# TE Review: TSPEC and Implementation — Phase 5 User Questions

| Field | Detail |
|-------|--------|
| **Document ID** | REVIEW-TSPEC-ptah-user-questions |
| **Reviewed Documents** | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md), [005-FSPEC-ptah-user-questions](../specifications/005-FSPEC-ptah-user-questions.md), [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) |
| **Implementation Files** | `ptah/src/orchestrator/question-store.ts`, `question-poller.ts`, `pattern-b-context-builder.ts`, `orchestrator.ts` |
| **Test Files** | `tests/unit/orchestrator/question-store.test.ts`, `question-poller.test.ts`, `pattern-b-context-builder.test.ts`, `orchestrator.test.ts`, `tests/integration/orchestrator/question-pipeline.test.ts` |
| **Date** | 2026-03-11 |
| **Author** | Test Engineer |
| **Status** | Approved (v1.1) |

---

## 1. Summary

All 65 plan tasks are marked ✅ Done. The implementation is feature-complete. Unit test coverage is comprehensive across all 5 new test files. The integration test exercises the full `QuestionStore` pipeline with real filesystem and git operations.

**4 specification–implementation mismatches** were identified — all medium or low severity. None block the pipeline from functioning correctly; they represent deliberate implementation choices that diverged from specification text and should be reconciled by updating the specs.

**3 untested properties** were identified — all low severity. Two are edge cases not in the plan; one is an architectural invariant that would benefit from an explicit assertion.

**Recommendation: Approved** — M-01 and M-02 implementation fixes applied, TSPEC §5.1–§5.4 updated (F-03), FSPEC updated to v1.2. Mismatches M-03 and M-04 are resolved via spec updates. Untested properties U-01 and U-02 are documented as follow-up tasks.

---

## 2. Specification–Implementation Mismatches

### M-01 (Low): Paused thread guard — debug log missing

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Property** | PROP-PQ-31 |
| **TSPEC Reference** | §5.12 |
| **Expected (per spec)** | `this.logger.debug(\`Dropping message for paused thread ${message.threadId}\`)` is emitted before returning |
| **Actual (implementation)** | No debug log call. Implementation has a comment `// Thread is paused waiting for user answer — drop silently` and returns. |
| **File / Line** | [orchestrator.ts:205–209](../ptah/src/orchestrator/orchestrator.ts#L205-L209) |
| **Root Cause** | Implementation silently drops without any logging. TSPEC specifies a debug-level note per PQ-R10 ("no log entry beyond a debug-level note"). |
| **Impact** | No operational impact. Reduces observability — operators cannot distinguish paused-thread drops from other silent-drop paths in debug logs. |

**Q-01:** Should the debug log be added to the implementation, or should the TSPEC §5.12 code example be updated to remove it? PQ-R10 says "no log entry beyond a debug-level note" — this implies the debug log is intended, not optional. Recommend adding the debug log call.

---

### M-02 (Medium): `OrchestratorDeps` Phase 5 fields are optional in implementation but required in TSPEC

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Property** | PROP-PQ-44 |
| **TSPEC Reference** | §4.2.5 |
| **Expected (per spec)** | `questionStore: QuestionStore`, `questionPoller: QuestionPoller`, `patternBContextBuilder: PatternBContextBuilder` — all required (no `?`) |
| **Actual (implementation)** | `questionStore?: QuestionStore`, `questionPoller?: QuestionPoller`, `patternBContextBuilder?: PatternBContextBuilder` — all optional. Constructor uses `if (deps.X) this.X = deps.X` with `!` non-null assertion on the private field. |
| **File / Line** | [orchestrator.ts:46–48](../ptah/src/orchestrator/orchestrator.ts#L46-L48), [orchestrator.ts:64–66](../ptah/src/orchestrator/orchestrator.ts#L64-L66), [orchestrator.ts:89–91](../ptah/src/orchestrator/orchestrator.ts#L89-L91) |
| **Root Cause** | Optional fields preserve backward compatibility with existing orchestrator tests that were written before Phase 5 and don't supply the new deps. Task 14 was supposed to update all test setups — review confirms all orchestrator tests now supply the new deps, so the backward-compat rationale no longer applies. |
| **Impact** | TypeScript's non-null assertion (`!`) suppresses compile-time safety. If `questionStore` is not supplied, any call to `this.questionStore.appendQuestion(...)` will throw a runtime `TypeError: Cannot read properties of undefined`. The optional-field pattern also guards startup behavior with `if (this.questionStore && this.questionPoller)`, creating a conditional Phase 5 path that doesn't exist in the TSPEC. |

**Q-02:** Now that all existing tests supply the new deps (task 14 complete), can the Phase 5 fields be made required in `OrchestratorDeps`? This would remove the `!` assertions and the conditional startup guard, aligning with the TSPEC. If backward compatibility with external callers is a concern, an alternative is to add a runtime validation in the constructor that throws a clear error when Phase 5 deps are missing.

---

### M-03 (Medium): `pending.md` / `resolved.md` file format diverges from TSPEC §5.3 and FSPEC §3.6

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Property** | PROP-PQ-58, PROP-PQ-61 |
| **TSPEC Reference** | §5.1, §5.2, §5.3, §5.4 |
| **Expected (per TSPEC §5.3)** | Section headers `## Q-0001`, metadata as a markdown table `\| **Agent** \| {agentId} \|`, ID extraction regex `/^## (Q-\d{4})$/m`. FSPEC §3.6 also shows this table-based format. |
| **Actual (implementation)** | Comment markers `<!-- Q-0001 -->`, bold-label lines `**Agent:** pm-agent`, `**Thread:** auth`, etc. ID extraction uses regex `/<!--\s*Q-(\d{4,})\s*-->/g`. No markdown table. The `(blank until answered)` sentinel is used for empty answers. |
| **File / Line** | [question-store.ts:64–104](../ptah/src/orchestrator/question-store.ts#L64-L104) |
| **Root Cause** | Intentional implementation decision. The comment-marker format makes block boundaries unambiguous for programmatic parsing (no dependency on `##` heading parsing which could conflict with markdown in question text). Self-consistent: both write and parse use the same markers. |
| **Impact on tests** | All `question-store.test.ts` tests use the implemented format — they pass and correctly validate the implementation. The format divergence is from the spec documentation only. |
| **Impact on users** | Users editing `pending.md` directly see different formatting than what FSPEC §3.6 documents. The `<!-- Write your answer below this line -->` comment from FSPEC/TSPEC is absent, replaced by `(blank until answered)` — which is less clear as a user instruction. |

**Q-03:** Was this format change a deliberate engineering decision during implementation? If yes, both TSPEC §5.1–§5.3 and FSPEC §3.6 should be updated to document the implemented format. The `(blank until answered)` sentinel vs `<!-- Write your answer below this line -->` difference is the most user-visible divergence and should be explicitly chosen and documented.

---

### M-04 (Medium): `resolved.md` format includes `Discord Message ID` field; TSPEC §5.4 does not show it

| Field | Detail |
|-------|--------|
| **Severity** | Medium (implementation is arguably more correct than spec) |
| **Property** | PROP-PQ-62 |
| **TSPEC Reference** | §5.4 |
| **Expected (per TSPEC §5.4)** | Resolved entries contain: Agent, Thread, Thread ID, Asked, Answered. No Discord Message ID field. |
| **Actual (implementation)** | `formatResolvedBlock` includes `**Discord Message ID:** {discordId}`. |
| **File / Line** | [question-store.ts:107–130](../ptah/src/orchestrator/question-store.ts#L107-L130) |
| **Root Cause** | Including Discord Message ID in `resolved.md` enables startup recovery to seed `discordMessageIdMap` from resolved questions (PQ-R9), so the Orchestrator can respond "already been resolved" even to Discord replies that arrive after a restart for questions that were resolved before the restart. This is more resilient than the spec describes. |
| **Impact** | No functional defect. The implementation correctly reads `discordMessageId` from resolved entries in `readResolvedQuestions()` and uses it for `discordMessageIdMap` seeding. The TSPEC §5.4 format omission is a documentation gap. |

**Q-04:** Update TSPEC §5.4 to include the `Discord Message ID` field in the resolved entry format, with a note that it enables post-restart "already resolved" reply handling (PQ-R9). This is a spec update, not an implementation change.

---

## 3. Untested Properties

| # | Property ID | Description | Expected Test Level | Gap Description | Risk |
|---|-------------|-------------|---------------------|-----------------|------|
| U-01 | PROP-PQ-81 | `handleOpenQuestionReply` must silently ignore replies with empty/whitespace-only content | Unit | Implementation guard exists (`if (!message.content.trim()) return;` at orchestrator.ts:486) but no plan task covers this case. Tasks 60 (non-reply) and 59 (wrong user) both test silent-ignore paths, but the empty-content path is not covered. **Recommended test:** In `orchestrator.test.ts`, add a test in the `handleOpenQuestionReply` describe block: `it("ignores replies with empty content")` — simulate a channel message with `content: "   "` (whitespace only), assert that `fakeQuestionStore.setAnswerCalls.length === 0` and `fakeDiscord.addReactionCalls.length === 0`. | Low |
| U-02 | PROP-PQ-83 | `executePatternBResume` must NOT call `contextAssembler.assemble()` during a Pattern B resume | Unit | Task 52 (happy path) verifies that `patternBContextBuilder.build` is called, but does not assert that `contextAssembler.assembleCalls` remains empty. This is an architectural invariant (RPB-R6) that could be silently violated by a refactor. **Recommended assertion:** Add `expect(fakeContextAssembler.assembleCalls).toHaveLength(0)` to the existing task 52 happy-path test in `orchestrator.test.ts`. | Low |
| U-03 | PROP-PQ-64 | Concurrent `appendQuestion` calls must produce distinct IDs | Integration | Task 17 tests a single MergeLock acquisition; the sequential multi-question scenario is covered by task 16. True concurrent invocation (two calls racing before either commits) is not tested. The `AsyncMutex` implementation provides the guarantee, but no test validates the combined behavior end-to-end. | Low |

---

## 4. Test Double Correctness

### FakeQuestionStore (factories.ts)

**Positive:** Implements all 7 protocol methods. Error injection fields (`appendError`, `updateDiscordMessageIdError`, `readError`, `setAnswerError`, `archiveError`) are consistent and cover all mutable operations. `seedQuestion()` and `getArchivedQuestions()` helpers are non-trivial and correctly tested via the orchestrator tests that consume them.

**Observation:** `readPendingQuestions` and `readResolvedQuestions` share the same `readError` injection field. This means tests cannot independently inject errors for only one of the two read operations. This is unlikely to matter in practice but limits test expressiveness for the startup recovery path (task 49 calls both reads in sequence; if the second read should fail independently, the shared field prevents that).

**Observation:** `readResolvedQuestions` in the fake has no error injection separate from `readError`. The startup test (task 49) exercises the happy path only. If `readResolvedQuestions` throws during startup, the current implementation catches and warns. This path is not tested via the fake.

### FakeQuestionPoller (factories.ts)

**Positive:** `simulateAnswerDetected` correctly fires `onAnswer` only when wired at construction — the plan's closure-capture wiring note (task 9) addresses the deferred-reference pattern correctly.

**Observation:** `FakeQuestionPoller.startCalled` is set by `registerQuestion()`, which is correct. However there is no `registeredCount()` equivalent — tests verify the registered questions array directly. This is fine.

### FakeDiscordClient — Phase 5 additions

**Positive:** `postChannelMessageCalls`, `addReactionCalls`, `replyToMessageCalls` record all invocations. `simulateChannelMessage()` correctly routes to the registered handler. `postChannelMessageError` enables task 46's Discord-failure test.

**Observation:** `onChannelMessage` is not included in the `fake-discord-client.test.ts` test for call recording. The TSPEC §7.2 specifies `simulateChannelMessage()` as the key test helper. Task 13 adds tests for `postChannelMessage` and `simulateChannelMessage` — confirm `onChannelMessage` handler registration is also tested.

---

## 5. Execution Plan Feedback

### Positive

- Plan structure is clean and well-phased. The dependency graph in §4 is accurate and correctly identifies Phase B as a prerequisite for Phase G.
- Task 9's wiring note (closure-capture pattern for `FakeQuestionPoller`) is an excellent proactive clarification that prevents a common test setup mistake.
- Task 53 (post-invocation Discord error) was a TE-identified gap (Q-01 in plan §2) correctly incorporated — confirms the review process worked.
- Task 62 (replyToMessage failure) was also a TE-identified gap (F-01 in plan §2) correctly incorporated.

### Observations

- Task 43's description says "silently drop with debug log" but the implementation has no debug log (M-01). The test passes because it doesn't assert on log output. If M-01 is fixed, task 43 should also assert on `logger.debug` calls.
- The plan has no task for **empty content in `handleOpenQuestionReply`** (U-01). Should be a follow-up task in a plan addendum or patch.
- The plan has no task for **PROP-PQ-83** (Pattern B must not call `contextAssembler`). A simple assertion can be added to task 52's existing test.

---

## 6. Implementation Quality Observations

### Strengths

1. **MergeLock integration is thorough**: `appendQuestion`, `updateDiscordMessageId`, `setAnswer`, and `archiveQuestion` all acquire and release the lock in `try/finally`, ensuring no lock leak on error.

2. **Block manipulation helpers** (`replaceDiscordMessageId`, `replaceAnswerInBlock`, `removeQuestionBlock`) operate segment-by-segment on `"---"` splits, which is robust to multiline question text. The regex approach correctly scopes changes to the target question's block.

3. **QuestionPoller self-stop logic** correctly checks both in the tick start (if registered is empty) and at the tick end (after processing answers). Both paths are tested.

4. **Pattern B resume handles all 4 routing outcomes**: `isTerminal`, `isPaused` (nested question), `createNewThread`, and `ROUTE_TO_AGENT` chain. The implementation mirrors the `executeRoutingLoop` routing logic — consistency is good.

5. **Synthetic trigger message** in `executePatternBResume` correctly uses `question.answer!` as content and `config.discord.mention_user_id` as authorId — a clean solution for providing the log entry and commit message context from a Pattern B resume.

6. **Startup recovery (restart resilience)** correctly seeds `discordMessageIdMap` from BOTH `pending.md` and `resolved.md` — the resolved file seeding enables "already been resolved" replies after a restart for pre-restart-resolved questions. This is more complete than the TSPEC documents (M-04).

### Minor Observations

1. **`parseBlock` uses two separate regex passes** for question text and answer extraction. The question-text regex (`/\*\*Question:\*\*\n([\s\S]*?)\n\*\*Answer:\*\*/m`) uses a lazy quantifier — this is correct but may be fragile if question text contains `\n**Answer:**` literally. Low risk for real question content.

2. **`removeQuestionBlock` result when all questions are removed**: returns the header segment only, which produces a file with just `# Pending Questions\n`. Subsequent `readPendingQuestions()` returns `[]` correctly (content.trim().length > 0 but no valid blocks), so behavior is correct. The empty-pending-file-after-archival path is exercised by the integration test (task 65).

3. **`executePatternBResume` does not handle `decision.isTerminal` before `decision.isPaused`**: the routing-after-resume logic block at orchestrator.ts:643–675 is correct in order (terminal, then isPaused, then createNewThread, then ROUTE_TO_AGENT). This matches `executeRoutingLoop` — good consistency.

---

## 7. Questions for Resolution

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| Q-01 | Should the paused-thread debug log (M-01) be added to the implementation? | (A) Add `this.logger.debug(...)` to match TSPEC §5.12. (B) Update TSPEC §5.12 to remove the log call. | Option A. PQ-R10 says "no log entry beyond a debug-level note" — implying the debug note is expected. Low effort to add. |
| Q-02 | Should `OrchestratorDeps` Phase 5 fields be made required? (M-02) | (A) Make fields required in `OrchestratorDeps`; remove `?` and `!` assertions. (B) Keep optional; add constructor validation that throws a clear error. (C) Keep as-is (document the intentional optional pattern). | Option A — task 14 confirmed all tests now supply the deps; backward compat concern is resolved. |
| Q-03 | Was the `pending.md` format change (M-03) intentional? Should specs be updated? | (A) Confirm as intentional; update TSPEC §5.1–§5.3 and FSPEC §3.6 to match the implemented format. (B) Revert to the table-based FSPEC format. | Option A. The comment-marker format is self-consistent and parses correctly; reverting would break all existing tests and integration data. |
| Q-04 | Should TSPEC §5.4 be updated to include the `Discord Message ID` field in `resolved.md`? (M-04) | (A) Update TSPEC §5.4 to add the field with a note about PQ-R9 restart recovery. | Option A — implementation is more complete than spec; spec should match. |

---

## 8. Backend-Engineer Review Response

The backend-engineer reviewed this document on 2026-03-11 and returned **Approved with minor changes**. All findings were accepted and addressed as follows:

| BE Finding | Verdict | Action Taken |
|------------|---------|--------------|
| F-01 (Low): M-01 — add debug log | Implement fix | Added `this.logger.info(\`Dropping message for paused thread ${message.threadId}\`)` at orchestrator.ts paused-thread guard. Note: `logger.debug()` was specified in the original TSPEC §5.12, but the `Logger` protocol only exposes `info`/`warn`/`error` — no `debug` method. Updated TSPEC §5.12 to use `logger.info()` with explanatory note. |
| F-02 (Low): M-02 — make Phase 5 deps required | Implement fix | Removed `?` from `OrchestratorDeps` Phase 5 fields; removed `!` non-null assertions from private fields; replaced conditional constructor assignment with direct assignment; removed `if (this.questionPoller)` guard in `shutdown()`; removed `if (this.questionStore && this.questionPoller)` guard in `startup()`; removed fallback branch in `handleRouteToUser()`; removed `if (this.questionPoller)` guard on `registerQuestion()`. |
| F-03 (Medium — new): TSPEC §5.1–§5.4 outdated | Documentation update | Updated TSPEC §5.1 (regex), §5.2 (parse rules + answer detection), §5.3 (pending.md format), §5.4 (resolved.md format + Discord Message ID note). |
| F-04 (Low): U-01 — add test recommendation | Documentation update | Added recommended test description to U-01 row in §3. |
| F-05 (Low): U-02 — add assertion note | Documentation update | Added recommended assertion to U-02 row in §3. |

---

## 9. Recommendation

**Approved.**

The implementation is functionally complete, well-tested, and correctly implements all 7 Phase 5 requirements. All M-01 and M-02 implementation fixes have been applied. TSPEC §5.1–§5.4 has been updated to match the implementation (F-03). Test recommendations for U-01 and U-02 are documented as follow-up tasks.

**Follow-up tasks (non-blocking, low priority):**
- U-01: Add unit test for empty-content Discord reply — see recommended test in §3.
- U-02: Add `expect(fakeContextAssembler.assembleCalls).toHaveLength(0)` assertion to task 52 happy-path test.
- U-03: Concurrent `appendQuestion` integration test — deferred; `AsyncMutex` provides the guarantee.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-11 | Test Engineer | Initial review — Phase 5 TSPEC and implementation |
| 1.1 | 2026-03-11 | Test Engineer | Addressed BE review (F-01–F-05): applied M-01/M-02 implementation fixes to orchestrator.ts; updated TSPEC §5.1–§5.4 (F-03); added test recommendations for U-01/U-02; updated recommendation from Conditional Approval to Approved. |

---

*End of Document*
