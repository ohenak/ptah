# Execution Plan: Phase 5 — User Questions

| Field | Detail |
|-------|--------|
| **Technical Specification** | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) |
| **Functional Specification** | [005-FSPEC-ptah-user-questions](../specifications/005-FSPEC-ptah-user-questions.md) |
| **Requirements** | [REQ-DI-07], [REQ-RP-02], [REQ-PQ-01], [REQ-PQ-02], [REQ-PQ-03], [REQ-PQ-04], [REQ-PQ-05] — [005-REQ-PTAH-user-questions](../requirements/005-REQ-PTAH-user-questions.md) |
| **Date** | March 11, 2026 |
| **Status** | In Progress |

---

## 1. Summary

Implements the Phase 5 user question routing pipeline: when a Skill emits `ROUTE_TO_USER`, the Orchestrator writes the question to `docs/open-questions/pending.md`, posts an @mention in `#open-questions`, and pauses the originating thread. A background poller detects answers (either by direct file edit or by Discord reply writeback). On answer detection, the Orchestrator resumes via Pattern B — a fresh context bundle — then archives the Q/A pair to `resolved.md`. Three new modules (`QuestionStore`, `QuestionPoller`, `PatternBContextBuilder`), four new `DiscordClient` protocol methods, and `shutdown()` / `resumeWithPatternB()` on the `Orchestrator`.

---

## 2. TE Review Items Incorporated

The Test Engineer reviewed this plan and identified four items. All have been addressed:

| Finding | Severity | Resolution |
|---------|----------|------------|
| F-01: Missing task for `replyToMessage` failure during duplicate/already-resolved handling (TSPEC §6 row 4) | Medium | Added task 62 in Phase G |
| F-02: Task 9 silent about `onAnswer` closure-capture wiring required for orchestrator unit tests (tasks 51–53) | Low | Added wiring note to task 9 description |
| F-03: Composition root task doesn't document circular construction resolution for `DefaultQuestionPoller` ↔ `DefaultOrchestrator` | Low | Added closure-capture pattern note to task 64 description |
| Q-01: `postAgentResponse` failure during Pattern B resume not covered by Phase 3 tests; requires Phase 5 task | Low | Added task 53 in Phase G — postAgentResponse fails after successful invocation; archival still proceeds |

---

## 3. Task List

### Phase A: Types & Protocol Extensions

Type definitions and protocol extensions. No TDD cycle — validated by compiler and downstream tests.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Extend `ResumePattern` in `types.ts` to add `"pattern_b"` | — | `ptah/src/types.ts` | ✅ Done |
| 2 | Add `PendingQuestion`, `RegisteredQuestion`, `ChannelMessage` interfaces to `types.ts` | — | `ptah/src/types.ts` | ✅ Done |
| 3 | Extend `DiscordClient` protocol with 4 Phase 5 methods: `postChannelMessage`, `onChannelMessage`, `addReaction`, `replyToMessage` | — | `ptah/src/services/discord.ts` | ✅ Done |
| 4 | Define `QuestionStore` protocol (7 methods per TSPEC §4.2.2) in new file `src/orchestrator/question-store.ts` | — | `ptah/src/orchestrator/question-store.ts` | ✅ Done |
| 5 | Define `QuestionPoller` protocol (2 methods per TSPEC §4.2.3) in new file `src/orchestrator/question-poller.ts` | — | `ptah/src/orchestrator/question-poller.ts` | ✅ Done |
| 6 | Define `PatternBContextBuilder` protocol (1 method per TSPEC §4.2.4) in new file `src/orchestrator/pattern-b-context-builder.ts` | — | `ptah/src/orchestrator/pattern-b-context-builder.ts` | ✅ Done |
| 7 | Extend `Orchestrator` interface with `shutdown()` and `resumeWithPatternB()`; extend `OrchestratorDeps` with 3 new Phase 5 fields: `questionStore`, `questionPoller`, `patternBContextBuilder` | — | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |

### Phase B: Test Doubles

Add new fakes and extend existing fakes. No TDD cycle — fakes are validated by the tests that consume them (and by the `FakeDiscordClient` fixture test).

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 8 | Add `FakeQuestionStore` to `factories.ts`: atomic ID assignment from in-memory map, error injection fields (`appendError`, `updateDiscordMessageIdError`, `readError`, `setAnswerError`, `archiveError`), `seedQuestion()` helper, `getArchivedQuestions()` helper, `readResolvedQuestions()` returns archived | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 9 | Add `FakeQuestionPoller` to `factories.ts`: records `registeredQuestions`, `startCalled`, `stopCalled`; `simulateAnswerDetected(question)` test helper. **Note:** `simulateAnswerDetected` only fires if `onAnswer` was passed at construction. Orchestrator test setup for tasks 51–54 must wire this via a closure-capture pattern: `let orchestrator: DefaultOrchestrator; const fakePoller = new FakeQuestionPoller((q) => orchestrator.resumeWithPatternB(q)); orchestrator = createOrchestrator({ questionPoller: fakePoller, ... });` — deferred reference ensures the callback resolves to the real orchestrator instance. | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 10 | Extend `FakeDiscordClient` in `factories.ts` with Phase 5 fields: `postChannelMessageCalls`, `postChannelMessageResponse`, `postChannelMessageError`, `addReactionCalls`, `addReactionError`, `replyToMessageCalls`, `replyToMessageError`, `simulateChannelMessage()` helper | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 11 | Add `createPendingQuestion(overrides)` factory function to `factories.ts` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 12 | Add `createChannelMessage(overrides)` factory function to `factories.ts` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 13 | Extend `fake-discord-client.test.ts` with Phase 5 fake method tests: `postChannelMessage` records calls and returns configured response; `simulateChannelMessage` routes to registered handler | `ptah/tests/unit/fixtures/fake-discord-client.test.ts` | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 14 | Update existing `orchestrator.test.ts` setup: add `FakeQuestionStore`, `FakeQuestionPoller`, and `FakePatternBContextBuilder` to all `createOrchestrator()` factory calls (no new tests — compile green only) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |

### Phase C: QuestionStore

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 15 | `appendQuestion` — empty files: assigns Q-0001, creates `pending.md` with standard header, formats entry per §5.3, returns `PendingQuestion` with `id` populated | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 16 | `appendQuestion` — scans both `pending.md` and `resolved.md` for max Q-NNNN; assigns N+1; zero-pads to 4 digits | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 17 | `appendQuestion` — commits `[ptah] System: add question {id} from {agentId}` under `MergeLock`; second concurrent call sees first's entry and advances ID | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 18 | `updateDiscordMessageId` — replaces blank Discord Message ID field in correct Q block; other blocks untouched; no-op if questionId not found in `pending.md` | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 19 | `updateDiscordMessageId` — commits `[ptah] System: update {questionId} notification` | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 20 | `readPendingQuestions` — parses well-formed entries into `PendingQuestion[]`; `discordMessageId` null when field blank; `answer` null when section is empty | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 21 | `readPendingQuestions` — absent or empty file returns `[]`; malformed entry block logs warning and is skipped; valid entries before/after malformed block are returned | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 22 | `readPendingQuestions` — detects non-empty answer: returns `PendingQuestion` with `answer` set to verbatim content after marker | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 23 | `readResolvedQuestions` — parses `resolved.md` into `PendingQuestion[]`; absent file returns `[]` | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 24 | `getQuestion` — returns matching `PendingQuestion` from `pending.md` by ID; returns `null` if not found | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 25 | `setAnswer` — writes verbatim answer text into the Answer section of the target question block; commits `[ptah] System: answer {questionId} via Discord` | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |
| 26 | `archiveQuestion` — removes question block from `pending.md`; appends resolved-format block (§5.4) to `resolved.md`; creates `resolved.md` with header if absent; issues single commit `[ptah] System: resolve {questionId}` | `ptah/tests/unit/orchestrator/question-store.test.ts` | `ptah/src/orchestrator/question-store.ts` | ⬚ Not Started |

### Phase D: QuestionPoller

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 27 | `registerQuestion` — auto-starts `setInterval` on first call; subsequent calls add to registered set without restarting | `ptah/tests/unit/orchestrator/question-poller.test.ts` | `ptah/src/orchestrator/question-poller.ts` | ⬚ Not Started |
| 28 | Poll tick — fires `onAnswer` callback and removes from registered set for each question whose entry in `pending.md` has a non-null answer; unanswered questions remain registered | `ptah/tests/unit/orchestrator/question-poller.test.ts` | `ptah/src/orchestrator/question-poller.ts` | ⬚ Not Started |
| 29 | Self-stop — clears interval when `registered` becomes empty after `onAnswer` fires for last question | `ptah/tests/unit/orchestrator/question-poller.test.ts` | `ptah/src/orchestrator/question-poller.ts` | ⬚ Not Started |
| 30 | `stop()` — clears interval immediately; awaits any in-progress tick before resolving | `ptah/tests/unit/orchestrator/question-poller.test.ts` | `ptah/src/orchestrator/question-poller.ts` | ⬚ Not Started |
| 31 | Malformed `pending.md` — `readPendingQuestions` returns partial/empty list due to parse errors; warns and continues polling on next tick; does not throw | `ptah/tests/unit/orchestrator/question-poller.test.ts` | `ptah/src/orchestrator/question-poller.ts` | ⬚ Not Started |

### Phase E: PatternBContextBuilder

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 32 | Layer 3 — pause summary: derives from last bot message in `threadHistory`; prefixes with "You were working on:"; appends pause note | `ptah/tests/unit/orchestrator/pattern-b-context-builder.test.ts` | `ptah/src/orchestrator/pattern-b-context-builder.ts` | ⬚ Not Started |
| 33 | Layer 3 — fallback: when `threadHistory` is empty or has no bot messages, falls back to `question.threadName` as pause summary (RPB-R4) | `ptah/tests/unit/orchestrator/pattern-b-context-builder.test.ts` | `ptah/src/orchestrator/pattern-b-context-builder.ts` | ⬚ Not Started |
| 34 | Layer 3 — structure: contains `## Pause Summary`, `## Question`, `## User Answer` sections with verbatim content; thread history not present in output | `ptah/tests/unit/orchestrator/pattern-b-context-builder.test.ts` | `ptah/src/orchestrator/pattern-b-context-builder.ts` | ⬚ Not Started |
| 35 | Layer 1 — reads role prompt from `config.agents.skills[agentId]`; reads `overview.md` from worktree (warn and continue if absent); appends `TWO_ITERATION_RULE` and `ROUTING_INSTRUCTION` constants | `ptah/tests/unit/orchestrator/pattern-b-context-builder.test.ts` | `ptah/src/orchestrator/pattern-b-context-builder.ts` | ⬚ Not Started |
| 36 | Layer 2 — reads feature files fresh from `worktreePath`; missing feature folder → Layer 2 empty, no throw, warning logged | `ptah/tests/unit/orchestrator/pattern-b-context-builder.test.ts` | `ptah/src/orchestrator/pattern-b-context-builder.ts` | ⬚ Not Started |
| 37 | Returns `ContextBundle` with `resumePattern: "pattern_b"` and `turnNumber: 1`; `agentId`, `threadId`, `featureName` correctly populated | `ptah/tests/unit/orchestrator/pattern-b-context-builder.test.ts` | `ptah/src/orchestrator/pattern-b-context-builder.ts` | ⬚ Not Started |
| 38 | Token budget — L1+L3 > 85% of `max_tokens`: omits Layer 2 with warning; `resumePattern: "pattern_b"` still set | `ptah/tests/unit/orchestrator/pattern-b-context-builder.test.ts` | `ptah/src/orchestrator/pattern-b-context-builder.ts` | ⬚ Not Started |

### Phase F: Discord Service Updates

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 39 | `DiscordJsClient.postChannelMessage` — calls `channel.send()` on the resolved `GuildText` channel; returns the Discord message ID string | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 40 | `DiscordJsClient.onChannelMessage` — registers `messageCreate` listener; thread messages ignored (`channel.isThread() === true`); wrong channel ID ignored; bot messages ignored; handler called for matching non-bot non-thread message | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 41 | `DiscordJsClient.addReaction` — fetches message by ID from channel; calls `message.react(emoji)` | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 42 | `DiscordJsClient.replyToMessage` — fetches message by ID from channel; calls `message.reply(content)` | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |

### Phase G: Orchestrator Updates

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 43 | Paused thread guard — message whose `threadId` is in `pausedThreadIds` is dropped silently with debug log; no context assembly, no skill invocation | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 44 | `handleRouteToUser` — `appendQuestion` called with question text, agentId, threadId; returned question has assigned ID; Discord notification posted via `postChannelMessage` with correct `@mention` format | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 45 | `handleRouteToUser` — `updateDiscordMessageId` called with returned `discordMessageId`; `discordMessageIdMap` seeded with `(discordMessageId → question.id)`; pause embed posted to originating thread; `pausedThreadIds` updated; `questionPoller.registerQuestion` called | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 46 | `handleRouteToUser` — Discord `postChannelMessage` fails: warning logged; question still written to store; thread still paused; poller still registered (PQ-R6) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 47 | `handleRouteToUser` — `openQuestionsChannelId` is null: warning logged; file write proceeds; no Discord notification attempt | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 48 | `startup()` — resolves `#open-questions` channel via `findChannelByName`; stores channel ID; registers `onChannelMessage` listener when channel found; logs warning when channel not found | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 49 | `startup()` — restart recovery: reads `pending.md` and `resolved.md`; seeds `discordMessageIdMap` from all `discordMessageId` fields; restores `pausedThreadIds` and registers pending questions with poller; logs restoration count | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 50 | `shutdown()` — calls `questionPoller.stop()` | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 51 | `resumeWithPatternB` — enqueues execution to `ThreadQueue` for `question.threadId` | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 52 | Pattern B resume — happy path: `patternBContextBuilder.build` called; `skillInvoker.invoke` called; `responsePoster.postAgentResponse` called; `pausedThreadIds.delete` called; `archiveQuestion` called after response posted | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 53 | Pattern B resume — `responsePoster.postAgentResponse` throws after successful Skill invocation: warning logged; `archiveQuestion` still called; `pausedThreadIds.delete` still called; error does not propagate (TSPEC §6: post-invocation Discord errors do not block archival) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 54 | Pattern B resume — failure: `skillInvoker.invoke` throws; `archiveQuestion` NOT called; `pausedThreadIds` NOT cleared; error embed posted; question remains in store for retry | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 55 | `handleOpenQuestionReply` — standard reply: `discordMessageId` in map; `getQuestion` returns pending question with null answer; `setAnswer` called; `addReaction` called with ✅ | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 56 | `handleOpenQuestionReply` — duplicate reply: `existing.answer` non-null; `replyToMessage` called with "already has an answer"; `setAnswer` not called | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 57 | `handleOpenQuestionReply` — already resolved: `discordMessageId` in map; `getQuestion` returns null (moved to `resolved.md`); `replyToMessage` called with "already been resolved" | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 58 | `handleOpenQuestionReply` — unrelated bot message: `discordMessageId` not in `discordMessageIdMap`; silently ignored; no store or Discord calls | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 59 | `handleOpenQuestionReply` — non-configured user: `message.authorId !== mention_user_id`; silently ignored | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 60 | `handleOpenQuestionReply` — non-reply message: `replyToMessageId` is null; silently ignored | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 61 | `handleOpenQuestionReply` — `addReaction` fails (permissions): warning logged; answer already written; no rollback; pipeline continues | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 62 | `handleOpenQuestionReply` — `replyToMessage` fails when rejecting a duplicate or already-resolved reply: warning logged; no file state changed; no throw; pipeline exits cleanly (TSPEC §6 row 4) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |

### Phase H: StartCommand & Composition Root

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 63 | `StartCommand.cleanup()` calls `orchestrator.shutdown()` before `discord.disconnect()` (PQ-R12) | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ⬚ Not Started |
| 64 | Update composition root in `bin/ptah.ts`: instantiate `DefaultQuestionStore` (with shared `MergeLock`), `DefaultQuestionPoller`, `DefaultPatternBContextBuilder`; wire all three into `OrchestratorDeps`. **Note:** Resolve circular construction dependency — declare `let orchestrator: DefaultOrchestrator` before constructing `DefaultQuestionPoller` with `onAnswer: (q) => orchestrator.resumeWithPatternB(q)` (closure-capture / deferred-reference pattern), then construct `DefaultOrchestrator` with the already-created poller. | — | `ptah/bin/ptah.ts` | ⬚ Not Started |

### Phase I: Integration

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 65 | Full question pipeline: `ROUTE_TO_USER` → `pending.md` written with correct format → poll tick detects answer → Pattern B `resumeWithPatternB` called → `resolved.md` written → git commits verified (`add question`, `answer via Discord`, `resolve`) — using real `DefaultQuestionStore` with temp dir git repo | `ptah/tests/integration/orchestrator/question-pipeline.test.ts` | — | ⬚ Not Started |

---

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

## 4. Task Dependency Notes

```
Phase A (Types & Protocols)
  │
  ├──→ Phase B (Test Doubles) ──→ Phase G (Orchestrator — tasks 43–60)
  │         │                           │
  │         │                           └──→ Phase H (StartCommand & Composition Root)
  │         │                                       │
  │         └──→ Phase E (PatternBContextBuilder)   │
  │                                                 │
  ├──→ Phase C (QuestionStore) ─────────────────→   │
  │                                                 │
  ├──→ Phase D (QuestionPoller) ────────────────→   │
  │                                                 │
  ├──→ Phase F (Discord Service) ───────────────→   │
  │                                                 ▼
  └──────────────────────────────────────────────→ Phase I (Integration)
```

- **Phase A** must complete first — all downstream phases depend on types and protocols
- **Phase B** must complete before Phase G (updated `OrchestratorDeps` required by test setup) and Phase E (fakes consumed in PatternBContextBuilder tests)
- **Task 14** (updating existing orchestrator tests) must complete before tasks 43–60 (existing tests must compile and pass with new deps)
- **Phases C, D, E, F** are independent of each other after Phase A — can be worked in parallel
- **Phase G** depends on Phase B (fakes) and conceptually validates against C, D, E, F implementations (unit tests use fakes, so phases C–F don't block G's tests, only G's real-world wiring)
- **Phase H** (task 61) depends on Phase G completing (requires `Orchestrator.shutdown()` to exist); task 62 depends on Phases C, D, E all having their concrete classes defined
- **Phase I** depends on all phases completing

---

## 5. Integration Points with Prior Phases

| # | Integration | Impact |
|---|-------------|--------|
| 1 | `OrchestratorDeps` extended with 3 new required fields | All existing `orchestrator.test.ts` test setups must supply `questionStore`, `questionPoller`, `patternBContextBuilder` fakes — task 14 handles this |
| 2 | `RoutingDecision.isPaused === true` path | Existing Phase 3 placeholder (`postSystemMessage + return`) replaced by `handleRouteToUser()` pipeline; existing orchestrator tests that exercise this path must be updated |
| 3 | `ResumePattern` type extension | `"pattern_b"` added — `ContextAssembler.detectResumePattern()` switch unchanged; `SkillInvoker` unaffected (reads `systemPrompt`/`userMessage` directly); no existing code broken |
| 4 | `MergeLock` sharing | The same `AsyncMutex` instance from Phase 4 is shared with `DefaultQuestionStore` — wired at composition root in task 62 |
| 5 | `StartCommand.cleanup()` order | Phase 2 cleanup was `discord.disconnect()` only; Phase 5 inserts `orchestrator.shutdown()` before it — task 61 tests this ordering |
| 6 | `ThreadQueue` re-use | `resumeWithPatternB` enqueues to the existing `InMemoryThreadQueue` instance — no new queue infrastructure needed |
| 7 | `FakeDiscordClient` extension | Phase 5 adds 4 new methods — `fake-discord-client.test.ts` must be extended; all existing tests continue to pass |

---

## 6. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria (REQ-DI-07, REQ-RP-02, REQ-PQ-01–05)
- [ ] Implementation matches TSPEC v1.1 (protocols, algorithms, error handling, test doubles)
- [ ] Existing Phase 1–4 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review
