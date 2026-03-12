# Test Properties Document

## Phase 5 — User Questions

| Field | Detail |
|-------|--------|
| **Document ID** | 005-PROPERTIES-ptah-user-questions |
| **Requirements** | [005-REQ-PTAH-user-questions](../requirements/005-REQ-PTAH-user-questions.md) |
| **Specifications** | [005-FSPEC-ptah-user-questions](../specifications/005-FSPEC-ptah-user-questions.md), [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) |
| **Execution Plan** | [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) |
| **Version** | 1.0 |
| **Date** | 2026-03-11 |
| **Author** | Test Engineer |
| **Status** | Approved |
| **Approval Date** | 2026-03-11 |

---

## 1. Overview

Phase 5 delivers the user question routing pipeline: when a Skill emits `ROUTE_TO_USER`, the Orchestrator writes the question to `open-questions/pending.md`, notifies the user via Discord `#open-questions` with an @mention, and pauses the originating thread. A background polling loop detects answers (either by direct file edit or by Discord reply writeback). On detection, the Orchestrator resumes the originating Skill via Pattern B — a fresh context bundle containing a pause summary, the user's verbatim answer, and re-read feature docs — then archives the Q/A pair to `resolved.md`.

This document covers all testable properties derived from 7 requirements across 3 domains (DI, RP, PQ), 3 FSPECs, and 1 TSPEC spanning 12 algorithm/protocol sections.

### 1.1 Scope

**In scope:**
- `DefaultQuestionStore` — pending.md/resolved.md CRUD, ID assignment, MergeLock, git commits
- `DefaultQuestionPoller` — background interval, answer detection, self-stop, graceful shutdown
- `DefaultPatternBContextBuilder` — Layer 1/2/3 assembly, token budget, pause summary derivation
- `DefaultOrchestrator` Phase 5 additions — `handleRouteToUser`, paused thread guard, `resumeWithPatternB`, `handleOpenQuestionReply`, `startup()` restart recovery, `shutdown()`
- `DiscordJsClient` — 4 new channel-level methods (`postChannelMessage`, `onChannelMessage`, `addReaction`, `replyToMessage`)
- `StartCommand.cleanup()` shutdown ordering (PQ-R12)
- End-to-end integration: `QuestionStore` pipeline with real filesystem and git

**Out of scope:**
- Phase 1–4 Orchestrator behaviors (covered by prior properties documents)
- Discord bot connection/disconnection lifecycle (Phase 2)
- Context assembly for non-Pattern-B resumes (Phase 3)
- Artifact commit pipeline (Phase 4)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 7 (all P0) | REQ-DI-07, REQ-RP-02, REQ-PQ-01–05 |
| FSPECs analyzed | 3 | FSPEC-PQ-01, FSPEC-PQ-02, FSPEC-RPB-01 |
| TSPEC sections analyzed | 12 | §4.2–§5.12 + §6 error table + §7 test strategy |
| Plan tasks reviewed | 65 (all ✅ Done) | Phases A–I |
| Integration boundaries identified | 7 | See §1.3 |
| Implementation files reviewed | 5 | question-store.ts, question-poller.ts, pattern-b-context-builder.ts, orchestrator.ts, bin/ptah.ts |
| Test files reviewed | 5 | question-store.test.ts, question-poller.test.ts, pattern-b-context-builder.test.ts, orchestrator.test.ts, question-pipeline.test.ts |

### 1.3 Integration Boundaries

1. **QuestionStore ↔ FileSystem + GitClient + MergeLock** — file-based persistence, atomic ID assignment
2. **QuestionPoller ↔ QuestionStore + onAnswer callback** — poll tick reads store, fires `resumeWithPatternB`
3. **Orchestrator ↔ QuestionStore + QuestionPoller + PatternBContextBuilder** — Phase 5 pipeline wiring
4. **PatternBContextBuilder ↔ FileSystem + TokenCounter** — fresh worktree reads for Layer 2
5. **Orchestrator ↔ DiscordClient (4 new methods)** — channel-level messaging for question notifications
6. **StartCommand ↔ Orchestrator** — `shutdown()` before `discord.disconnect()` (PQ-R12)
7. **ThreadQueue ↔ Pattern B Resume** — serializes concurrent resumes for same thread (PQ-R11)

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 32 | REQ-PQ-01, REQ-PQ-02, REQ-PQ-03, REQ-PQ-04, REQ-PQ-05, REQ-DI-07, REQ-RP-02 | Unit |
| Contract | 5 | REQ-PQ-01–05, REQ-DI-07, REQ-RP-02 | Unit |
| Error Handling | 13 | REQ-PQ-01–05, REQ-DI-07, REQ-RP-02 | Unit |
| Data Integrity | 6 | REQ-PQ-01, REQ-PQ-02, REQ-PQ-03, REQ-RP-02 | Unit |
| Integration | 4 | REQ-PQ-01, REQ-PQ-03, REQ-PQ-04, REQ-RP-02 | Integration |
| Security | 2 | REQ-PQ-05, REQ-DI-07 | Unit |
| Idempotency | 3 | REQ-PQ-01, REQ-PQ-02, REQ-PQ-05 | Unit |
| Observability | 4 | REQ-PQ-02, REQ-DI-07, REQ-RP-02 | Unit |
| **Total** | **69** | All 7 Phase 5 requirements | |

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-PQ-{NUMBER}` — unified PQ domain prefix (covers all Phase 5 modules).

**Priority:** All Phase 5 requirements are P0; all properties inherit P0.

### 3.1 Functional Properties

Core business logic and behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-01 | `QuestionStore.appendQuestion` must assign Q-0001 when both `pending.md` and `resolved.md` are absent | TSPEC §5.1; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-02 | `QuestionStore.appendQuestion` must scan both `pending.md` and `resolved.md` for the highest existing Q-NNNN ID and assign max+1 | TSPEC §5.1; FSPEC PQ-R1; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-03 | `QuestionStore.appendQuestion` must zero-pad the assigned ID to 4 digits (e.g. Q-0010 not Q-10) | TSPEC §5.1; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-04 | `QuestionStore.appendQuestion` must create `pending.md` with standard header when the file does not exist | TSPEC §5.3; FSPEC §3.2 Step 2d; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-05 | `QuestionStore.appendQuestion` must return the complete `PendingQuestion` with the assigned `id` field populated | TSPEC §4.2.2; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-06 | `QuestionStore.appendQuestion` must commit with the exact message `[ptah] System: add question {id} from {agentId}` | TSPEC §4.2.2; FSPEC PQ-R8; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-07 | `QuestionStore.updateDiscordMessageId` must update only the Discord Message ID field in the matching question block; other blocks must be unchanged | TSPEC §5.3; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-08 | `QuestionStore.updateDiscordMessageId` must commit with the exact message `[ptah] System: update {questionId} notification` | TSPEC §4.2.2; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-09 | `QuestionStore.readPendingQuestions` must parse all well-formed entries in `pending.md` into `PendingQuestion[]`, with `discordMessageId` null when blank and `answer` null when blank | TSPEC §5.2; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-10 | `QuestionStore.readPendingQuestions` must detect a non-empty answer and return the verbatim content in the `answer` field | TSPEC §5.2; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-11 | `QuestionStore.readResolvedQuestions` must parse all entries in `resolved.md` into `PendingQuestion[]`; absent file returns `[]` | TSPEC §4.2.2; FSPEC PQ-R9; REQ-PQ-04 | Unit | P0 |
| PROP-PQ-12 | `QuestionStore.getQuestion` must return the matching `PendingQuestion` from `pending.md` by ID; return null if not found or file absent | TSPEC §4.2.2; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-13 | `QuestionStore.setAnswer` must write the user's answer into the Answer section of the target question block and commit `[ptah] System: answer {questionId} via Discord` | TSPEC §4.2.2; FSPEC §4.2 Step 4; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-14 | `QuestionStore.archiveQuestion` must remove the question block from `pending.md` | TSPEC §5.6 Step g; FSPEC §3.2 Step 8a; REQ-PQ-04 | Unit | P0 |
| PROP-PQ-15 | `QuestionStore.archiveQuestion` must append the complete Q/A entry to `resolved.md`, creating the file with standard header if absent | TSPEC §5.4; FSPEC §3.2 Step 8d; REQ-PQ-04 | Unit | P0 |
| PROP-PQ-16 | `QuestionStore.archiveQuestion` must include an `**Answered:**` timestamp in the resolved block | TSPEC §5.4; FSPEC §3.7; REQ-PQ-04 | Unit | P0 |
| PROP-PQ-17 | `QuestionStore.archiveQuestion` must issue a single git commit `[ptah] System: resolve {questionId}` covering both `pending.md` and `resolved.md` | TSPEC §4.2.2; FSPEC PQ-R8; REQ-PQ-04 | Unit | P0 |
| PROP-PQ-18 | `DefaultQuestionPoller.registerQuestion` must auto-start the polling interval on the first call and not restart it on subsequent calls | TSPEC §4.2.3; FSPEC §3.3 Point 3; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-19 | `DefaultQuestionPoller` poll tick must fire `onAnswer` callback and remove from the registered set for each question whose `pending.md` entry has a non-null answer | TSPEC §4.2.3; FSPEC §3.3 Point 2c; REQ-PQ-03 | Unit | P0 |
| PROP-PQ-20 | `DefaultQuestionPoller` must self-stop the interval when the registered set becomes empty after the last `onAnswer` fires | TSPEC §4.2.3; FSPEC §3.3 Point 3; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-21 | `DefaultQuestionPoller.stop()` must clear the interval immediately and await any in-progress tick before resolving | TSPEC §4.2.3; FSPEC §3.3 Point 5; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-22 | `DefaultPatternBContextBuilder.build` must derive the pause summary from the last bot message (by timestamp) in `threadHistory` | TSPEC §5.5 Step 4a; FSPEC RPB-R4; REQ-RP-02 | Unit | P0 |
| PROP-PQ-23 | `DefaultPatternBContextBuilder.build` must fall back to `question.threadName` as the pause summary when `threadHistory` has no bot messages | TSPEC §5.5 Step 4a; FSPEC RPB-R4; REQ-RP-02 | Unit | P0 |
| PROP-PQ-24 | `DefaultPatternBContextBuilder.build` Layer 3 must contain exactly `## Pause Summary`, `## Question`, `## User Answer` sections in that order | TSPEC §5.5 Step 4b; FSPEC FSPEC-RPB-01 §5.2 Step 3c; REQ-RP-02 | Unit | P0 |
| PROP-PQ-25 | `DefaultPatternBContextBuilder.build` must read the agent's role prompt from `config.agents.skills[agentId]` for Layer 1 | TSPEC §5.5 Step 3; REQ-RP-02 | Unit | P0 |
| PROP-PQ-26 | `DefaultPatternBContextBuilder.build` must read `overview.md` fresh from the worktree for Layer 1 when present | TSPEC §5.5 Step 3b; FSPEC RPB-R3; REQ-RP-02 | Unit | P0 |
| PROP-PQ-27 | `DefaultPatternBContextBuilder.build` must read feature files fresh from the worktree for Layer 2, excluding `overview.md` | TSPEC §5.5 Step 5; FSPEC RPB-R3; REQ-RP-02 | Unit | P0 |
| PROP-PQ-28 | `DefaultPatternBContextBuilder.build` must return a `ContextBundle` with `resumePattern: "pattern_b"` and `turnNumber: 1` | TSPEC §5.5 Step 8; REQ-RP-02 | Unit | P0 |
| PROP-PQ-29 | `DefaultPatternBContextBuilder.build` must omit Layer 2 with a warning when L1+L3 token count exceeds 85% of `config.agents.max_tokens` | TSPEC §5.5 Step 6b; REQ-RP-02 | Unit | P0 |
| PROP-PQ-30 | `Orchestrator.handleRouteToUser` must call `appendQuestion`, post an @mention notification to `#open-questions`, update the Discord message ID in the store, seed the `discordMessageIdMap`, post a pause embed to the originating thread, add the thread ID to `pausedThreadIds`, and register the question with the poller | TSPEC §5.6; FSPEC §3.2 Steps 2–5; REQ-PQ-01, REQ-DI-07 | Unit | P0 |
| PROP-PQ-31 | `Orchestrator.processMessage` must silently drop any message whose `threadId` is in the `pausedThreadIds` set, without invoking context assembly or skill invocation | TSPEC §5.12; FSPEC PQ-R10; REQ-PQ-03 | Unit | P0 |
| PROP-PQ-32 | `Orchestrator.startup` must resolve the `#open-questions` channel, register an `onChannelMessage` listener, seed `discordMessageIdMap` from both `pending.md` and `resolved.md`, restore `pausedThreadIds`, and re-register pending questions with the poller | TSPEC §5.10; FSPEC PQ-R9; REQ-PQ-02, REQ-PQ-05 | Unit | P0 |
| PROP-PQ-33 | `Orchestrator.shutdown` must call `questionPoller.stop()` | TSPEC §5.11; FSPEC PQ-R12; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-34 | `Orchestrator.resumeWithPatternB` must enqueue execution to the `ThreadQueue` for `question.threadId` | TSPEC §5.8; FSPEC PQ-R11; REQ-PQ-03 | Unit | P0 |
| PROP-PQ-35 | `executePatternBResume` happy path must: call `patternBContextBuilder.build`, invoke the skill, post the response, delete `question.threadId` from `pausedThreadIds`, and call `archiveQuestion` — in that sequence | TSPEC §5.8; FSPEC §3.2 Steps 7–8; REQ-PQ-03, REQ-PQ-04 | Unit | P0 |
| PROP-PQ-36 | `Orchestrator.handleOpenQuestionReply` must write the user's answer to the store and add a ✅ reaction for a valid reply to a pending unanswered question | TSPEC §5.9 Steps 7–8; FSPEC §4.2 Steps 4–5; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-37 | `Orchestrator.handleOpenQuestionReply` must reply with "This question already has an answer." and not call `setAnswer` when the question already has a non-null answer | TSPEC §5.9 Step 6; FSPEC §4.3 PQD-R3; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-38 | `Orchestrator.handleOpenQuestionReply` must reply with "This question has already been resolved." when `getQuestion` returns null | TSPEC §5.9 Step 5; FSPEC §4.2 Step 3c; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-39 | `StartCommand.cleanup` must call `orchestrator.shutdown()` before calling `discord.disconnect()` | TSPEC §5.11; FSPEC PQ-R12; REQ-PQ-02 | Unit | P0 |

### 3.2 Contract Properties

Protocol compliance, type conformance, and interface shape.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-40 | `QuestionStore` protocol must expose exactly 7 methods: `appendQuestion`, `updateDiscordMessageId`, `readPendingQuestions`, `readResolvedQuestions`, `getQuestion`, `setAnswer`, `archiveQuestion` | TSPEC §4.2.2; REQ-PQ-01–05 | Unit | P0 |
| PROP-PQ-41 | `QuestionPoller` protocol must expose exactly 2 methods: `registerQuestion` and `stop` | TSPEC §4.2.3; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-42 | `PatternBContextBuilder.build` must return a `ContextBundle` with all required fields: `systemPrompt`, `userMessage`, `agentId`, `threadId`, `featureName`, `resumePattern`, `turnNumber`, `tokenCounts` | TSPEC §4.2.4; REQ-RP-02 | Unit | P0 |
| PROP-PQ-43 | `DiscordClient` protocol Phase 5 additions (`postChannelMessage`, `onChannelMessage`, `addReaction`, `replyToMessage`) must be correctly implemented in `DiscordJsClient` | TSPEC §4.2.1; FSPEC §2.4; REQ-DI-07, REQ-PQ-05 | Unit | P0 |
| PROP-PQ-44 | `Orchestrator` interface must expose `shutdown(): Promise<void>` and `resumeWithPatternB(question: PendingQuestion): Promise<void>` | TSPEC §4.2.5; REQ-PQ-02, REQ-PQ-03 | Unit | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-45 | `QuestionStore.readPendingQuestions` must log a warning and skip unparseable blocks; must not throw; valid blocks before and after the malformed block must still be returned | TSPEC §6; FSPEC §3.2 Step 6d edge case; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-46 | `QuestionStore.appendQuestion` must acquire the `MergeLock` for the entire read-scan-write-commit operation and release it on both success and failure | TSPEC §4.2.2; FSPEC PQ-R1; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-47 | `QuestionStore.archiveQuestion` must acquire the `MergeLock` for the full read-remove-write-commit operation and release it on both success and failure | TSPEC §4.2.2; FSPEC PQ-R1; REQ-PQ-04 | Unit | P0 |
| PROP-PQ-48 | `DefaultQuestionPoller` must log a warning and continue polling when `readPendingQuestions` throws; must not crash or stop the interval | TSPEC §6; FSPEC §3.3 Point 4; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-49 | `DefaultQuestionPoller` must log a warning and continue when the `onAnswer` callback throws; the question must be removed from the registered set even if the callback fails | TSPEC §4.2.3; REQ-PQ-03 | Unit | P0 |
| PROP-PQ-50 | `DefaultPatternBContextBuilder.build` must warn and continue when `overview.md` is absent; Layer 1 must still be assembled from the role prompt | TSPEC §5.5 Step 3b; FSPEC §5.1; REQ-RP-02 | Unit | P0 |
| PROP-PQ-51 | `DefaultPatternBContextBuilder.build` must warn and return an empty Layer 2 (no throw) when the feature folder does not exist in the worktree | TSPEC §5.5 Step 5b; FSPEC §5.4; REQ-RP-02 | Unit | P0 |
| PROP-PQ-52 | `DefaultPatternBContextBuilder.build` must throw when no skill path is configured for the agent in `config.agents.skills` | TSPEC §5.5 Step 3a; REQ-RP-02 | Unit | P0 |
| PROP-PQ-53 | `Orchestrator.handleRouteToUser` must log a warning and continue (still write the question, pause the thread, and register the poller) when `postChannelMessage` throws | TSPEC §5.6 Step 3b; FSPEC PQ-R6; REQ-DI-07 | Unit | P0 |
| PROP-PQ-54 | `Orchestrator.handleRouteToUser` must log a warning and skip the Discord notification when `openQuestionsChannelId` is null; question write and thread pause must still proceed | TSPEC §5.6 Step 3c; FSPEC PQ-R6; REQ-DI-07 | Unit | P0 |
| PROP-PQ-55 | `Orchestrator.handleOpenQuestionReply` must log a warning and not roll back the answer write when `addReaction` fails | TSPEC §6; FSPEC §4.4 edge case; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-56 | `Orchestrator.handleOpenQuestionReply` must log a warning when `replyToMessage` fails during duplicate-reply or already-resolved handling; no file state change; no throw | TSPEC §6 row 4; FSPEC §4.4; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-57 | `executePatternBResume` must NOT archive the question and must NOT clear `pausedThreadIds` when the Skill invocation throws; the question must remain in `pending.md` for retry on the next poll tick | TSPEC §5.8 Step 5; FSPEC PQ-R4; REQ-PQ-03 | Unit | P0 |

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-58 | `QuestionStore.appendQuestion` must write the question text to `pending.md` verbatim — no summarization or reformatting | FSPEC PQ-R2; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-59 | `QuestionStore.setAnswer` must write the user's answer to `pending.md` verbatim — no parsing, validation, or transformation | FSPEC PQ-R3, PQD-R2; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-60 | `DefaultPatternBContextBuilder.build` must include the user's answer verbatim in Layer 3 — no summarization, reformatting, or truncation | FSPEC RPB-R2; REQ-RP-02 | Unit | P0 |
| PROP-PQ-61 | Question IDs must never be reused: after Q-0003 is archived to `resolved.md` and `pending.md` is empty, the next question must be assigned Q-0004, not Q-0001 | FSPEC PQ-R1; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-62 | `QuestionStore.archiveQuestion` must preserve the full question text, answer, `askedAt` timestamp, and all other fields in the resolved block | TSPEC §5.4; FSPEC §3.7; REQ-PQ-04 | Unit | P0 |
| PROP-PQ-63 | `executePatternBResume` must archive the question AFTER `postAgentResponse` — regardless of whether `postAgentResponse` throws; archival must not be blocked by Discord post failures | TSPEC §5.8 Steps e–g; FSPEC PQ-R4; REQ-PQ-04 | Unit | P0 |

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-64 | `QuestionStore.appendQuestion` under concurrent invocations protected by `MergeLock` must produce non-duplicate, monotonically increasing IDs | TSPEC §5.1; FSPEC PQ-R1; REQ-PQ-01 | Integration | P0 |
| PROP-PQ-65 | `StartCommand.cleanup` must call `orchestrator.shutdown()` before `discord.disconnect()` so the polling loop is stopped before the Discord connection drops | TSPEC §5.11; FSPEC PQ-R12; REQ-PQ-02 | Integration | P0 |
| PROP-PQ-66 | End-to-end question pipeline using real `DefaultQuestionStore`, `NodeFileSystem`, `NodeGitClient`, and `AsyncMutex` in a temp git repo must: write `pending.md`, set answer, archive to `resolved.md`, and produce correct git commits for all four operations | TSPEC §5.1–§5.4; REQ-PQ-01–04 | Integration | P0 |
| PROP-PQ-67 | `DefaultQuestionPoller` wired with `orchestrator.resumeWithPatternB` as `onAnswer` must invoke `resumeWithPatternB` when a pending question answer is detected | TSPEC §4.2.3; FSPEC §3.3; REQ-PQ-03 | Integration | P0 |

### 3.6 Security Properties

Authorization and access control.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-68 | `Orchestrator.handleOpenQuestionReply` must silently ignore replies from any user whose `authorId` does not match `config.discord.mention_user_id` | FSPEC PQD-R5; FSPEC §4.4 AT-PQD-05; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-69 | `Orchestrator.handleOpenQuestionReply` must silently ignore standalone messages (non-replies) in `#open-questions`; only Discord reply messages (with non-null `replyToMessageId`) are processed | FSPEC PQD-R1; FSPEC §4.4 AT-PQD-04; REQ-PQ-05 | Unit | P0 |

### 3.7 Idempotency Properties

Repeated operations produce correct results.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-70 | `QuestionStore.updateDiscordMessageId` must be a no-op (no file write, no commit) when the `questionId` is not found in `pending.md` | TSPEC §4.2.2; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-71 | `QuestionStore.updateDiscordMessageId` must be a no-op when `pending.md` is absent | TSPEC §4.2.2; REQ-PQ-01 | Unit | P0 |
| PROP-PQ-72 | `DefaultQuestionPoller.stop()` must be safe to call multiple times (idempotent — second call must not throw or produce errors) | TSPEC §4.2.3; REQ-PQ-02 | Unit | P0 |

### 3.8 Observability Properties

Logging and diagnostics.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-73 | `Orchestrator.startup` must log an info message reporting the count of pending questions restored when pending questions exist on restart | TSPEC §5.10; FSPEC PQ-R9; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-74 | `Orchestrator.startup` must log a warning when the `#open-questions` channel cannot be found | TSPEC §5.10; FSPEC PQ-R6; REQ-DI-07 | Unit | P0 |
| PROP-PQ-75 | `DefaultQuestionPoller` must log a warning on each tick error (store read failure or callback failure), including the error message | TSPEC §4.2.3; REQ-PQ-02 | Unit | P0 |
| PROP-PQ-76 | `DefaultPatternBContextBuilder.build` must log a warning when Layer 2 is omitted due to the 85% token budget constraint | TSPEC §5.5 Step 6b; REQ-RP-02 | Unit | P0 |

---

## 4. Negative Properties

Properties that define what the system must NOT do.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-PQ-77 | `Orchestrator` must NOT invoke skill assembly, context assembly, or any agent logic for messages arriving on paused threads | FSPEC PQ-R10; REQ-PQ-03 | Unit | P0 |
| PROP-PQ-78 | `executePatternBResume` must NOT archive the question if Skill invocation fails; the question must remain in `pending.md` for retry | FSPEC PQ-R4; REQ-PQ-03 | Unit | P0 |
| PROP-PQ-79 | `executePatternBResume` must NOT clear `pausedThreadIds` if Skill invocation fails; the thread must remain paused | FSPEC PQ-R4; REQ-PQ-03 | Unit | P0 |
| PROP-PQ-80 | `Orchestrator.handleOpenQuestionReply` must NOT overwrite an existing non-null answer in `pending.md` (first answer wins) | FSPEC PQD-R3; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-81 | `Orchestrator.handleOpenQuestionReply` must NOT process Discord replies with empty or whitespace-only content | FSPEC §4.4 edge case; REQ-PQ-05 | Unit | P0 |
| PROP-PQ-82 | `DefaultPatternBContextBuilder.build` must NOT include full thread history verbatim in Layer 3; only the last bot message is used as the pause summary | FSPEC RPB-R1; REQ-RP-02 | Unit | P0 |
| PROP-PQ-83 | `Orchestrator` must NOT call `ContextAssembler.detectResumePattern()` for Pattern B resumes; Pattern B classification and context assembly are handled directly by `executePatternBResume` | FSPEC RPB-R6; REQ-RP-02 | Unit | P0 |
| PROP-PQ-84 | `QuestionStore` must NOT modify or delete entries in `resolved.md`; entries are append-only | FSPEC §3.7; REQ-PQ-04 | Unit | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-PQ-01 (Write to pending.md) | PROP-PQ-01–08, PROP-PQ-46, PROP-PQ-58, PROP-PQ-61, PROP-PQ-64, PROP-PQ-66, PROP-PQ-70–71 | Full |
| REQ-PQ-02 (Poll pending.md) | PROP-PQ-18–21, PROP-PQ-32–33, PROP-PQ-39, PROP-PQ-48, PROP-PQ-65, PROP-PQ-67, PROP-PQ-72–75 | Full |
| REQ-PQ-03 (Resume on answer) | PROP-PQ-19, PROP-PQ-31, PROP-PQ-34–35, PROP-PQ-49, PROP-PQ-57, PROP-PQ-67, PROP-PQ-77–79 | Full |
| REQ-PQ-04 (Archive to resolved.md) | PROP-PQ-14–17, PROP-PQ-35, PROP-PQ-47, PROP-PQ-62–63, PROP-PQ-66, PROP-PQ-84 | Full |
| REQ-PQ-05 (Discord reply writeback) | PROP-PQ-13, PROP-PQ-36–38, PROP-PQ-55–56, PROP-PQ-59, PROP-PQ-68–69, PROP-PQ-80–81 | Full |
| REQ-DI-07 (@mention in #open-questions) | PROP-PQ-30, PROP-PQ-43, PROP-PQ-53–54, PROP-PQ-74 | Full |
| REQ-RP-02 (Pattern B resume) | PROP-PQ-22–29, PROP-PQ-34–35, PROP-PQ-50–52, PROP-PQ-60, PROP-PQ-63, PROP-PQ-76, PROP-PQ-82–83 | Full |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| FSPEC-PQ-01 (Question Routing Pipeline) | PROP-PQ-01–21, PROP-PQ-30–35, PROP-PQ-45–49, PROP-PQ-53–54, PROP-PQ-58, PROP-PQ-61–66, PROP-PQ-73–75, PROP-PQ-77–79, PROP-PQ-84 | Full |
| FSPEC-PQ-02 (Discord Reply Writeback) | PROP-PQ-36–38, PROP-PQ-55–56, PROP-PQ-59, PROP-PQ-68–69, PROP-PQ-72, PROP-PQ-80–81 | Full |
| FSPEC-RPB-01 (Pattern B Context Assembly) | PROP-PQ-22–29, PROP-PQ-50–52, PROP-PQ-60, PROP-PQ-76, PROP-PQ-82–83 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 7 | 7 | 0 | 0 |
| P1 | 0 | — | — | — |
| P2 | 0 | — | — | — |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 — all critical journeys covered at integration level
       /----------\
      / Integration \      4 (5.8%) — QuestionStore pipeline, MergeLock concurrency, shutdown ordering, poller wiring
     /----------------\
    /    Unit Tests     \  65 (94.2%) — all module-level behaviors
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 65 | 94.2% |
| Integration | 4 | 5.8% |
| E2E | 0 | 0% |
| **Total** | **69** | **100%** |

**E2E rationale:** No E2E tests are needed. The full question routing pipeline is exercised by the Phase 65 integration test (`question-pipeline.test.ts`) using real `NodeFileSystem` + `NodeGitClient` in a temp git repo. The Orchestrator unit tests exercise the coordination logic with fakes. The combination provides sufficient coverage without introducing brittle E2E tests requiring real Discord or Claude API access.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | **PROP-PQ-81** — Empty/whitespace Discord reply content not tested. The `handleOpenQuestionReply` implementation has the guard at line 486 (`if (!message.content.trim()) return;`) but no task in the plan covers this case. | Unanswered question remains properly unanswered; no false-positive answer write. | Low | Add a unit test for task 55 scope: `handleOpenQuestionReply — empty content: silently ignored` |
| 2 | **PROP-PQ-83** — The property that `ContextAssembler.detectResumePattern()` is bypassed for Pattern B is not explicitly tested. It is an invariant by architecture (Pattern B takes a distinct code path), but no test asserts that `contextAssembler.assembleCalls` is not invoked during `executePatternBResume`. | Pattern B could inadvertently call the wrong context path on refactor. | Low | Add assertion in task 52 test: `contextAssembler.assembleCalls.length` should be 0 during Pattern B resume |
| 3 | **PROP-PQ-64 (Integration)** — MergeLock TOCTOU protection under concurrent `appendQuestion` calls is not tested beyond the single-call unit test (task 17). True concurrent protection requires either a delay-injection test or real concurrent invocations. | Duplicate Q-NNNN IDs possible if the MergeLock is bypassed. | Low | Consider adding a concurrency test: `Promise.all([store.appendQuestion(...), store.appendQuestion(...)])` and asserting distinct IDs. The integration test (task 65) exercises sequential calls only. |
| 4 | **Format divergence (resolved)** — FSPEC §3.6, §3.7, and PQ-R9 have been updated (v1.2) to document the implemented comment-marker + bold-label format, the `(blank until answered)` sentinel, and seeding of `discordMessageIdMap` from both files on restart. TSPEC §5.2–§5.3 still reflects the original table-row format and should be updated to align with the implementation. Remaining PM note: the `(blank until answered)` answer placeholder is less instructive than an explicit directive; replacing it with `<!-- write your answer here -->` in the implementation is a recommended low-priority UX improvement. | Low residual risk from TSPEC documentation drift. | Low | Update TSPEC §5.2–§5.3 to reflect the implemented format (follow-up task for backend-engineer). |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |
| Technical Lead | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-11 | Test Engineer | Initial properties document — Phase 5 User Questions |
| 1.1 | 2026-03-11 | Test Engineer | Post-review updates: Gap 4 updated to reflect FSPEC v1.2 spec alignment (M-03/M-04 resolved). Status set to Approved following PM review (F-01 approved, F-02/F-03 addressed via FSPEC updates). |

---

*End of Document*
