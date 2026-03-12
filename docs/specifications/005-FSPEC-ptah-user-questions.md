# Functional Specification: Phase 5 — User Questions

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-PTAH-PHASE5 |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.1 |
| **Date** | March 11, 2026 |
| **Author** | Product Manager |
| **Status** | Approved |
| **Approval Date** | March 11, 2026 |

---

## 1. Purpose

This functional specification defines the behavioral logic for Phase 5 (User Questions) of Ptah v4.0. Phase 5 adds the question routing pipeline — the mechanism by which agents raise blocking questions to the user and automatically resume work when the user answers.

Phase 5 contains 7 requirements across 3 domains (DI, RP, PQ) that together close the "agent needs human input" gap. The core challenge is a bidirectional sync pipeline: agent question → `pending.md` + Discord notification → user answers (via Discord reply or file edit) → answer detected by polling → Pattern B context resume → archival to `resolved.md`.

**What Phase 5 delivers:** When an agent emits a `ROUTE_TO_USER` routing signal, the Orchestrator writes the question to `pending.md`, notifies the user via Discord `#open-questions` with an @mention, polls for the user's answer, re-invokes the originating Skill with Pattern B context (pause summary + user answer + fresh artifacts), archives the Q/A pair to `resolved.md`, and writes back to the Discord thread.

**Relationship to Phase 3:** Phase 3's FSPEC-RP-01 (§4.2, Step 3b) defines `ROUTE_TO_USER` as a routing signal that "pauses the thread and writes the question to `pending.md` (Phase 5)." Phase 3 deferred all question handling behavior to Phase 5. This FSPEC defines what happens after `ROUTE_TO_USER` is detected. Phase 3's Pattern A (FSPEC-RP-02) and Pattern C (FSPEC-RP-03) remain unchanged. This FSPEC adds Pattern B — the missing resume pattern.

**Relationship to Phase 4:** Phase 4's artifact commit pipeline (FSPEC-AC-01) runs before question routing. If a Skill invocation produces both artifact changes and a `ROUTE_TO_USER` signal, Phase 4 commits the artifacts first, then Phase 5 processes the question. The two pipelines are sequential, not competing.

---

## 2. Scope

### 2.1 Requirements Covered by This FSPEC

| Requirement | Title | FSPEC |
|-------------|-------|-------|
| [REQ-PQ-01] | Write agent-to-user questions to pending.md | [FSPEC-PQ-01] |
| [REQ-PQ-02] | Poll pending.md at configured interval | [FSPEC-PQ-01] |
| [REQ-PQ-03] | Invoke originating Skill with Pattern B on user answer | [FSPEC-PQ-01] |
| [REQ-PQ-04] | Move answered questions to resolved.md | [FSPEC-PQ-01] |
| [REQ-DI-07] | @mention user in #open-questions | [FSPEC-PQ-01] |
| [REQ-PQ-05] | Discord reply writeback to pending.md | [FSPEC-PQ-02] |
| [REQ-RP-02] | Pattern B — User answer resume | [FSPEC-RPB-01] |

### 2.2 Requirements NOT Requiring FSPECs

None — all 7 Phase 5 requirements have behavioral complexity warranting functional specification.

### 2.3 Phase 3 Behaviors Extended by Phase 5

Phase 5 extends Phase 3 behaviors without modifying them:

| Phase 3 Reference | Phase 3 Behavior | Phase 5 Extension |
|--------------------|------------------|-------------------|
| FSPEC-RP-01 §4.2, Step 3b — `ROUTE_TO_USER` signal | Thread is paused. Question is noted for Phase 5. | Phase 5 defines the full question lifecycle: write to `pending.md`, notify via Discord, poll for answer, resume with Pattern B, archive to `resolved.md`. |
| FSPEC-CB-01 §3.2, Step 2 — Determine resume pattern | Lists Pattern A and Pattern C. Pattern B is not yet defined. | Phase 5 adds Pattern B (user answer resume) as a new classification branch. The Orchestrator classifies a thread as Pattern B when a user answer is detected in `pending.md` for a paused thread. |

### 2.4 New Discord Capabilities Required by Phase 5

The existing `DiscordClient` covers thread-centric operations (posting embeds, reading thread history, listening for thread messages). Phase 5 requires four additional Discord capabilities that do not exist in the current protocol. The TSPEC must define these as new `DiscordClient` protocol additions:

| Capability | Required by | Description |
|------------|-------------|-------------|
| Post a plain-text @mention message to a regular (non-thread) text channel | FSPEC-PQ-01 Step 3 | Used to notify the user in `#open-questions`. The existing `postSystemMessage()` posts embeds to thread channels only. |
| Listen for messages posted in a regular (non-thread) text channel | FSPEC-PQ-02 Step 1 | Used to receive Discord replies in `#open-questions`. The existing `onThreadMessage()` listens to thread messages only. |
| Add an emoji reaction to a message | FSPEC-PQ-02 Step 5 | Used to add a ✅ confirmation reaction to the user's reply. |
| Reply to a specific message (Discord reply feature) | FSPEC-PQ-02 Steps 3c/3d | Used to post "already resolved" or "already answered" responses that are visibly threaded to the user's message. |

These capabilities are behavioral requirements, not implementation choices. The engineer is free to add them as new methods on the existing `DiscordClient` protocol or restructure the protocol — that is a TSPEC decision.

### 2.5 Engineering Notes for TSPEC

The following implementation-level concerns were raised during engineering review and are flagged here to ensure they are addressed in the TSPEC:

- **`ResumePattern` type extension:** The `ResumePattern` type (currently `"fresh" | "pattern_a" | "pattern_c"`) must be extended to include `"pattern_b"`. All downstream switch/if chains over this type must handle the new branch.
- **Polling loop lifecycle:** The polling loop must be stopped as part of Orchestrator shutdown (in addition to the "no pending questions" stop condition defined in §3.3). See PQ-R12.

---

## 3. FSPEC-PQ-01: Question Routing Pipeline

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-PQ-01 |
| **Title** | Question Routing Pipeline — Write, Notify, Poll, Resume, Archive |
| **Linked Requirements** | [REQ-PQ-01], [REQ-PQ-02], [REQ-PQ-03], [REQ-PQ-04], [REQ-DI-07] |

> **Path convention:** All file paths in this FSPEC are relative to `config.docs.root` (default: `docs/`). For example, `open-questions/pending.md` resolves to `docs/open-questions/pending.md` at runtime. The engineer must resolve paths via `config.docs.root`, not as hardcoded strings.

### 3.1 Description

When a Skill response contains a `ROUTE_TO_USER` routing signal, the Orchestrator initiates the question routing pipeline. The pipeline writes the question to `pending.md`, notifies the user in Discord `#open-questions`, then polls for the user's answer. When the answer is detected, the Orchestrator resumes the originating Skill with Pattern B context and archives the completed Q/A pair.

### 3.2 Behavioral Flow

```
1. TRIGGER: The Orchestrator parses a Skill response with routing signal
   ROUTE_TO_USER: {question}
   (from FSPEC-RP-01, Step 3b)

2. WRITE QUESTION TO pending.md
   a. Open `open-questions/pending.md`
   b. Append a new question entry in the standardized format (see §3.6):
      - Question ID: Q-{NNNN} (monotonically increasing, zero-padded)
      - Agent: The agent that raised the question (e.g., "pm-agent")
      - Thread ID: The Discord thread ID where the question was raised
      - Timestamp: ISO 8601 UTC
      - Question: The question text from the ROUTE_TO_USER signal, verbatim
      - Answer: (empty — to be filled by the user)
   c. Commit the pending.md change to Git:
      [ptah] System: add question Q-{NNNN} from {Agent}
   d. If pending.md does not exist → create it with the standard header
      before appending

3. NOTIFY USER VIA DISCORD
   a. Post a message to the `#open-questions` channel (not the agent thread):
      - @mention the configured user (from ptah.config.json `discord.userId`)
      - Include the question text
      - Include the originating agent name
      - Include the thread name for context
      - Include the question ID (Q-{NNNN}) for reference
   b. Write the Discord message ID into the question entry in pending.md
      as the `Discord Message ID` field (see §3.6 format).
      This persists the ID across Orchestrator restarts so that Discord
      reply matching (FSPEC-PQ-02) can be re-established after a restart.

4. POST PAUSE EMBED TO THREAD AND ENFORCE PAUSE
   a. Post a system embed to the originating Discord thread:
      "⏸ Paused — waiting for user answer to Q-{NNNN}"
   b. The Orchestrator adds the thread ID to its in-memory set of paused threads.
      Any new human message arriving for a paused thread is dropped without
      processing — the Orchestrator does not invoke any Skill, post any response,
      or acknowledge the message. The thread remains paused until Step 7 completes
      successfully and the pause is explicitly lifted. (See PQ-R10.)

5. REGISTER POLL TARGET
   a. Add this question to the set of pending questions being polled
   b. Store: { questionId, agentId, threadId, discordMessageId }

6. POLL FOR ANSWER (runs on interval — see §3.3)
   a. Read `open-questions/pending.md`
   b. For each registered pending question:
      - Parse the question entry
      - Check if the Answer field is non-empty
   c. If answer detected → proceed to Step 7
   d. If no answer → wait for next poll interval

7. RESUME WITH PATTERN B
   a. Extract the user's answer verbatim from pending.md
   b. Assemble a Pattern B Context Bundle (→ FSPEC-RPB-01)
   c. Enqueue the Pattern B resume to the ThreadQueue for the originating
      thread ID. This ensures sequential processing — if multiple questions
      for the same thread were answered simultaneously, their resumes execute
      one at a time in question ID order. (See PQ-R11.)
   d. The ThreadQueue executes: invoke the originating Skill with the
      Pattern B context
   e. Post the Skill response to the original Discord thread
      (standard FSPEC-DI-01 embed posting)
   f. Remove the thread ID from the paused threads set (the thread is unpaused)
   g. Parse the Skill's routing signal and continue normal routing

8. ARCHIVE TO resolved.md
   a. Remove the question entry from `open-questions/pending.md`
   b. Append the complete Q/A entry (question + answer + resolution
      timestamp) to `open-questions/resolved.md`
   c. Commit both file changes in a single Git commit:
      [ptah] System: resolve Q-{NNNN}
   d. If resolved.md does not exist → create it with the standard header
      before appending
```

### 3.3 Polling Behavior

```
POLLING LOOP (runs as a background interval within the Orchestrator process):

1. Interval: Configurable via ptah.config.json `orchestrator.pollInterval`
   Default: 30 seconds

2. On each tick:
   a. If no pending questions are registered → skip (no file I/O)
   b. If pending questions exist → read pending.md from filesystem
   c. For each registered question, check for a non-empty Answer field
   d. For each answered question found → trigger Step 7 (resume)

3. Polling starts automatically when the first question is written
   and stops when no pending questions remain (no unnecessary I/O)

4. Polling reads from the filesystem, not from a cached copy.
   The user (or FSPEC-PQ-02's Discord writeback) may edit the file
   at any time.

5. Polling stops immediately when the Orchestrator shuts down, regardless
   of whether pending questions remain. The shutdown must cancel any
   in-progress poll tick before disconnecting from Discord. (See PQ-R12.)
```

### 3.4 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| PQ-R1 | Question IDs are monotonically increasing and never reused. If Q-0003 is archived, the next question is Q-0004, not Q-0003. To determine the next ID, the Orchestrator scans **both** `pending.md` and `resolved.md` for the highest existing Q-{NNNN} header, then uses `max + 1`. If both files have no entries, the first ID is Q-0001. This scan must happen at Orchestrator startup (to reconstruct the counter) and again before each new write (to handle concurrent multi-process scenarios, if any). | Prevents ID reuse even after all questions are resolved and `pending.md` is empty. Archived questions in `resolved.md` must count toward the monotone sequence. |
| PQ-R2 | The question text is written to `pending.md` verbatim — no summarization or reformatting. | The user must see exactly what the agent asked. Reformatting risks losing nuance. |
| PQ-R3 | The user's answer is read verbatim — no parsing, validation, or transformation by the Orchestrator. | The answer is passed directly to the Skill via Pattern B. The Skill is responsible for interpreting the answer, not the Orchestrator. |
| PQ-R4 | Archival (Step 8) happens AFTER the resumed Skill invocation completes and the response is posted. | If the resume fails (e.g., Skill invocation error), the question remains in `pending.md` so the user can see it was not processed. The Orchestrator can retry on the next poll tick. |
| PQ-R5 | Multiple questions can be pending simultaneously from different agents/threads. Each is tracked independently. | Different agents may ask questions concurrently. The polling loop checks all registered questions on each tick. |
| PQ-R6 | The `#open-questions` notification is a courtesy — `pending.md` is the source of truth. If Discord is down, the question is still in `pending.md` and the user can answer by editing the file directly. | Resilience to Discord outages. The file-based flow works independently of Discord. |
| PQ-R7 | The pause embed is posted to the *agent thread*, not to `#open-questions`. | The thread participants (other agents reading the thread) need to know the thread is paused. The `#open-questions` channel is for the user's attention. |
| PQ-R8 | Git commits for question writes and archival use the `[ptah] System:` prefix, not an agent prefix. | Question routing is an Orchestrator-level (system) action, not an agent action. This distinguishes system housekeeping commits from agent artifact commits. |
| PQ-R9 | If the Orchestrator restarts, it reads both `pending.md` and `resolved.md` on startup to: (1) reconstruct the set of pending questions (from `pending.md`), (2) reconstruct the Discord message ID → question ID mapping for reply matching — seeding from **both** `pending.md` (for still-pending questions) and `resolved.md` (for already-resolved questions, enabling "already been resolved" replies after restart), and (3) determine the next available question ID (from the highest Q-{NNNN} found across both files — see PQ-R1). No other in-memory state is required to survive restarts. | Both files together form the durable store. The polling loop, registered question set, reply matching map, and ID counter are all derived from the files on startup. Seeding the reply map from `resolved.md` ensures the Orchestrator can respond gracefully to Discord replies about pre-restart-resolved questions. |
| PQ-R10 | The Orchestrator maintains an in-memory set of paused thread IDs. When a new human message arrives for a thread in this set, the message is silently dropped — no Skill invocation, no Discord response, no log entry beyond a debug-level note. The thread ID is removed from the paused set only when a Pattern B resume completes successfully (Step 7f). | Prevents the routing loop from re-executing against stale state while a thread is waiting for a user answer. Without this guard, a user posting a follow-up message in a paused thread could trigger an unintended agent invocation. |
| PQ-R11 | Pattern B resumes are enqueued to the `ThreadQueue` for the originating thread ID, not dispatched directly. When multiple questions for the same thread are answered simultaneously, the ThreadQueue serializes their resumes in question ID order. | The `ThreadQueue` already serializes all operations per thread ID. Routing Pattern B resumes through it ensures no two Pattern B resumes for the same thread can race on the worktree or Discord. |
| PQ-R12 | The polling loop must be stopped as part of Orchestrator shutdown before the Discord client disconnects. Any in-progress poll tick must complete or be cancelled before disconnect proceeds. | A live poll interval firing after Discord disconnects would produce confusing errors. Shutdown must be clean. |

### 3.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Skill produces both artifact changes and ROUTE_TO_USER | Phase 4 pipeline (commit → merge → cleanup) runs first. Then Phase 5 pipeline (write question → notify → poll). The Skill's artifact changes are committed before the thread is paused. |
| User answers a question while the Orchestrator is down | The answer sits in `pending.md`. On restart, the Orchestrator re-reads `pending.md` (PQ-R9), detects the answer, and triggers the resume flow. No answer is lost. |
| User answers multiple pending questions at once | Each answered question triggers an independent resume (Step 7). Resumes for the same thread are enqueued to the `ThreadQueue` for that thread and processed sequentially in question ID order (PQ-R11). Resumes for different threads are independent and may proceed concurrently. |
| User edits an already-archived question in resolved.md | No effect. The Orchestrator only monitors `pending.md`, not `resolved.md`. |
| pending.md is malformed or unparseable | Log a warning. Skip the unparseable entries. Do not crash. Re-check on the next poll tick (the user may fix the file). |
| Two agents ask the user a question at the same time | Each gets a unique Q-{NNNN} ID. Both questions are appended to `pending.md` and both get Discord notifications. The user answers each independently. |
| The same agent asks a second question before the first is answered | Both questions coexist in `pending.md` with distinct IDs. The thread has two pause embeds. When the first answer is detected, that question's resume fires. The second question remains pending. |
| Discord `#open-questions` channel is unavailable | The question is still written to `pending.md` (PQ-R6). Log a warning about the Discord notification failure. The user can answer by editing the file. Do not block the question pipeline on Discord availability. |
| The originating thread was archived or deleted before the user answers | Log a warning. Still resume the Skill invocation (the Skill doesn't need the thread to exist). Post the response to a new thread or log it. The exact thread recovery behavior is a technical decision for the engineer. |

### 3.6 File Format — pending.md

> **Format note (v1.2 update):** The implemented format uses HTML comment markers (`<!-- Q-NNNN -->`) for block boundaries and bold-label lines for metadata fields, replacing the table-row layout shown in earlier versions. The `(blank until answered)` placeholder marks unanswered questions in the file. The PM notes this placeholder is less instructive than an explicit comment directive; a more instructive form (e.g., `<!-- write your answer here -->`) is a recommended future UX improvement to the implementation.

```markdown
# Pending Questions

<!-- Ptah managed file — do not modify the structure. Write your answer in the Answer field. -->

---

<!-- Q-0001 -->
**ID:** Q-0001
**Agent:** pm-agent
**Thread:** auth — define requirements
**Thread ID:** 1234567890
**Asked:** 2026-03-11T14:30:00Z
**Discord Message ID:** 987654321098765432

**Question:**
Should OAuth use Google or GitHub as the identity provider?

**Answer:**
Use Google as the primary provider. We can add GitHub later.

---

<!-- Q-0002 -->
**ID:** Q-0002
**Agent:** dev-agent
**Thread:** auth — technical specification
**Thread ID:** 1234567891
**Asked:** 2026-03-11T15:00:00Z
**Discord Message ID:** 987654321098765433

**Question:**
Should the token expiry be 1 hour or 24 hours?

**Answer:**
(blank until answered)

---
```

**Parsing rules:**
- Each question entry begins with an HTML comment marker `<!-- Q-{NNNN} -->` (ID extraction regex: `/<!--\s*Q-(\d{4,})\s*-->/g`)
- Metadata fields use bold-label inline format: `**Field:** value` — one field per line
- The `Discord Message ID` field stores the ID of the bot's notification message posted in `#open-questions`. This field is written immediately after the notification is posted (Step 3b) and is used to match Discord replies to their question (FSPEC-PQ-02). It survives Orchestrator restarts.
- The Answer field is non-empty when there is content after `**Answer:**\n` that is non-whitespace and is not the literal sentinel string `(blank until answered)`
- The Orchestrator reads the full content after `**Answer:**` as the verbatim answer (trimmed)

### 3.7 File Format — resolved.md

```markdown
# Resolved Questions

<!-- Ptah managed file — archived question/answer pairs. -->

---

<!-- Q-0001 -->
**ID:** Q-0001
**Agent:** pm-agent
**Thread:** auth — define requirements
**Thread ID:** 1234567890
**Asked:** 2026-03-11T14:30:00Z
**Answered:** 2026-03-11T14:45:00Z
**Discord Message ID:** 987654321098765432

**Question:**
Should OAuth use Google or GitHub as the identity provider?

**Answer:**
Use Google as the primary provider. We can add GitHub later.

---
```

**Differences from pending.md:**
- Includes an `**Answered**` timestamp field
- Includes the `**Discord Message ID**` field (preserved from the pending entry). This enables the Orchestrator to respond "This question has already been resolved." to Discord replies that arrive after a restart for questions resolved before the restart — see PQ-R9.
- The `(blank until answered)` placeholder is never present — the answer is final
- Entries are append-only — resolved questions are never modified

### 3.8 Acceptance Tests

**AT-PQ-01: Standard question routing pipeline — end to end**

```
WHO:   As the Orchestrator
GIVEN: PM Agent returns a Skill response with routing signal
       ROUTE_TO_USER: "Should OAuth use Google or GitHub?"
       in the thread "auth — define requirements"
WHEN:  I process the ROUTE_TO_USER signal
THEN:  1. A Q-{NNNN} entry is appended to open-questions/pending.md
          with agent=pm-agent, the question verbatim, and empty Answer
       2. pending.md change is committed: "[ptah] System: add question Q-{NNNN} from PM Agent"
       3. An @mention notification is posted to #open-questions with the question
       4. A pause embed is posted to the originating thread
       5. The thread is paused (no further routing)
```

**AT-PQ-02: User answer triggers Pattern B resume**

```
WHO:   As the Orchestrator
GIVEN: Q-0001 is pending in pending.md for pm-agent in thread "auth — define requirements"
       and the user writes "Use Google" in the Answer field
WHEN:  The next poll tick reads pending.md
THEN:  1. I detect the non-empty answer for Q-0001
       2. I assemble a Pattern B Context Bundle for pm-agent (FSPEC-RPB-01)
       3. I invoke pm-agent with the Pattern B context
       4. I post the Skill response to the "auth — define requirements" thread
       5. The thread resumes normal routing based on the Skill's routing signal
```

**AT-PQ-03: Archival after successful resume**

```
WHO:   As the Orchestrator
GIVEN: Q-0001 has been answered, Pattern B resume completed successfully,
       and the response has been posted to the thread
WHEN:  Post-resume processing completes
THEN:  1. Q-0001 is removed from pending.md
       2. Q-0001 (with question, answer, and resolution timestamp) is appended to resolved.md
       3. Both changes are committed: "[ptah] System: resolve Q-0001"
```

**AT-PQ-04: Restart recovery — pending questions survive restart**

```
WHO:   As the Orchestrator
GIVEN: Q-0001 and Q-0002 are pending in pending.md
       and the Orchestrator process restarts
WHEN:  I initialize on startup
THEN:  I read pending.md and register Q-0001 and Q-0002 as active poll targets
       Polling resumes normally on the configured interval
       No questions are lost
```

**AT-PQ-05: Discord unavailable — question still written to file**

```
WHO:   As the Orchestrator
GIVEN: PM Agent returns ROUTE_TO_USER: "Which database?"
       and the Discord #open-questions channel is unreachable
WHEN:  I process the ROUTE_TO_USER signal
THEN:  1. The question is still written to pending.md and committed
       2. A warning is logged about the Discord notification failure
       3. The thread is still paused
       4. The user can answer by editing pending.md directly
       5. The polling/resume flow works normally when the answer appears
```

**AT-PQ-06: Concurrent questions from different agents**

```
WHO:   As the Orchestrator
GIVEN: PM Agent asks Q-0001 in thread "auth — requirements"
       and Dev Agent asks Q-0002 in thread "auth — specification"
WHEN:  Both ROUTE_TO_USER signals are processed
THEN:  Both questions are in pending.md with distinct IDs
       Both threads are independently paused
       The user can answer in any order
       Each answer triggers an independent Pattern B resume for its thread
```

**AT-PQ-07: Failed resume — question remains pending**

```
WHO:   As the Orchestrator
GIVEN: Q-0001 is answered in pending.md
       and the Pattern B Skill invocation fails (e.g., API error)
WHEN:  The resume attempt fails
THEN:  Q-0001 is NOT archived — it remains in pending.md
       An error is logged
       On the next poll tick, the Orchestrator detects the answer again
       and retries the resume
```

### 3.9 Dependencies

- Depends on: [FSPEC-RP-01] (routing signal parsing — `ROUTE_TO_USER`)
- Depends on: [FSPEC-RPB-01] (Pattern B context assembly)
- Depends on: [FSPEC-DI-01] (embed posting to Discord threads)
- Depends on: [FSPEC-AC-01] (artifact commits run before question routing)
- Consumed by: [FSPEC-PQ-02] (Discord reply writeback feeds into this pipeline)

---

## 4. FSPEC-PQ-02: Discord Reply Writeback

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-PQ-02 |
| **Title** | Discord Reply Writeback — #open-questions Replies to pending.md |
| **Linked Requirements** | [REQ-PQ-05] |

### 4.1 Description

When the user replies to a question notification in Discord `#open-questions`, the Orchestrator automatically writes the user's reply to the corresponding question's Answer field in `pending.md`. This eliminates the need for the user to edit `pending.md` directly — they can answer entirely through Discord.

### 4.2 Behavioral Flow

```
1. TRIGGER: A message is posted in #open-questions by a non-bot user

2. MATCH REPLY TO QUESTION
   a. The reply must be a Discord reply (using Discord's reply feature)
      to a message posted by the Ptah bot
   b. Extract the question ID (Q-{NNNN}) from the bot's original message
   c. If the reply is not to a bot message → ignore (not a question answer)
   d. If the question ID cannot be extracted → log warning, ignore

3. VALIDATE QUESTION STATE
   a. Read pending.md
   b. Find the Q-{NNNN} entry
   c. If the question is not found in pending.md → the question was already
      resolved or never existed. Post a brief reply: "This question has
      already been resolved." Do not write to pending.md.
   d. If the question already has a non-empty answer → the user already
      answered (possibly via file edit). Post a brief reply: "This question
      already has an answer." Do not overwrite.

4. WRITE ANSWER TO pending.md
   a. Write the user's Discord message content into the Answer field
      for Q-{NNNN} in pending.md
   b. The answer is written verbatim — no formatting, no transformation
   c. Commit the change:
      [ptah] System: answer Q-{NNNN} via Discord

5. CONFIRM IN DISCORD
   a. React to the user's reply with a ✅ emoji (or post a brief confirmation)
      to indicate the answer was captured
   b. The normal polling loop (FSPEC-PQ-01 Step 6) will detect the answer
      on the next tick and trigger the resume flow
```

### 4.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| PQD-R1 | Only Discord replies (using the reply feature) to bot-posted question notifications are processed. Standalone messages in `#open-questions` are ignored. | Prevents accidental answers from unrelated discussion in the channel. The reply link provides unambiguous question-to-answer matching. |
| PQD-R2 | The user's Discord reply is written verbatim to pending.md. No markdown-to-plaintext conversion, no truncation. | Consistency with PQ-R3 — the answer flows through to the Skill exactly as written. |
| PQD-R3 | If the answer field is already non-empty, the Discord reply is rejected (not overwritten). | Prevents race conditions where the user answers via both file edit and Discord reply. First answer wins. |
| PQD-R4 | The writeback only writes to pending.md. It does NOT trigger the resume directly. The normal polling loop detects the answer. | Single responsibility — the writeback is a file writer, not an orchestration controller. This keeps the resume flow in one place (FSPEC-PQ-01 Step 7) regardless of how the answer arrived. |
| PQD-R5 | Only messages from the configured user ID (ptah.config.json `discord.userId`) are processed as answers. Messages from other users are ignored. | Only the project owner should answer agent questions. Prevents unauthorized answers. |

### 4.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| User replies to a bot message that is not a question notification (e.g., a status embed) | The message has no Q-{NNNN} reference. Ignored. |
| User replies with an empty message (e.g., only an attachment) | The text content is empty. Treat as no answer — ignore. Log a warning if an attachment is present (attachments are not supported as answers). |
| User replies multiple times to the same question | First reply is accepted (writes to pending.md). Subsequent replies see a non-empty answer and are rejected with "This question already has an answer." |
| User replies after the question was already archived (answered via file edit, polling already ran) | The question is not in pending.md. Reply with "This question has already been resolved." |
| The bot cannot react or reply in #open-questions (permissions issue) | The answer is still written to pending.md. Log a warning about the Discord confirmation failure. The writeback succeeds even if the confirmation fails. |

### 4.5 Acceptance Tests

**AT-PQD-01: Standard Discord reply writeback**

```
WHO:   As the Orchestrator
GIVEN: Q-0001 is pending in pending.md (answer is empty)
       and the bot posted a notification for Q-0001 in #open-questions
WHEN:  The configured user replies to that notification with "Use Google"
THEN:  1. "Use Google" is written to the Answer field of Q-0001 in pending.md
       2. The change is committed: "[ptah] System: answer Q-0001 via Discord"
       3. A ✅ reaction is added to the user's reply
       4. The normal polling loop detects the answer on the next tick
```

**AT-PQD-02: Duplicate reply rejected**

```
WHO:   As the Orchestrator
GIVEN: Q-0001 already has an answer in pending.md ("Use Google")
WHEN:  The user replies again to Q-0001's notification with "Actually, use GitHub"
THEN:  The second reply is NOT written to pending.md
       The bot replies: "This question already has an answer."
       pending.md is unchanged
```

**AT-PQD-03: Reply to already-resolved question**

```
WHO:   As the Orchestrator
GIVEN: Q-0001 has been archived to resolved.md (no longer in pending.md)
WHEN:  The user replies to Q-0001's notification in #open-questions
THEN:  The bot replies: "This question has already been resolved."
       No file changes
```

**AT-PQD-04: Non-reply message in #open-questions ignored**

```
WHO:   As the Orchestrator
GIVEN: The user posts a standalone message (not a reply) in #open-questions
WHEN:  I process the message
THEN:  I ignore it — no file changes, no response
       Only Discord replies to bot notifications are processed
```

**AT-PQD-05: Reply from unauthorized user ignored**

```
WHO:   As the Orchestrator
GIVEN: A user OTHER than the configured discord.userId replies to
       Q-0001's notification in #open-questions
WHEN:  I process the message
THEN:  I ignore it — no file changes, no response
       Only the configured user's replies are processed as answers
```

### 4.6 Dependencies

- Depends on: [FSPEC-PQ-01] (the question must be in `pending.md` to receive a writeback)
- Feeds into: [FSPEC-PQ-01] Step 6 (the polling loop detects the written answer)

---

## 5. FSPEC-RPB-01: Resume Pattern B — User Answer

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-RPB-01 |
| **Title** | Resume Pattern B — User Answer Context Assembly |
| **Linked Requirements** | [REQ-RP-02] |

### 5.1 Description

Pattern B is used when a user has answered a blocking question in `pending.md`. The Orchestrator re-invokes the originating Skill with a Context Bundle containing the pause summary, the user's answer verbatim, and fresh artifact reads. This is the third and final resume pattern (A = agent-to-agent, B = user answer, C = review loop).

### 5.2 Behavioral Flow

> **Classification ownership:** Pattern B is classified by the **Orchestrator**, not by the `ContextAssembler`. The Orchestrator detects the user answer in `pending.md` (via the polling loop) and assembles the Pattern B context bundle directly before invoking the Skill. The `ContextAssembler`'s thread-history-based pattern detection (`detectResumePattern()`) is **bypassed** for Pattern B — the Orchestrator does not call it for this path. The engineer must implement Pattern B as a distinct code path in the Orchestrator that constructs the context independently.

```
1. TRIGGER: The polling loop (FSPEC-PQ-01 Step 6) detects a non-empty
   answer for question Q-{NNNN} from {agent} in thread {threadId}

2. IDENTIFY PATTERN B CONTEXT
   a. From the question entry in pending.md, extract:
      - The originating agent ID
      - The originating thread ID
      - The question text (what the agent asked)
      - The user's answer text (verbatim)
   b. From the Discord thread history (read via Phase 2), extract:
      - The task the agent was working on when it paused
        (the agent's last message before the ROUTE_TO_USER signal)
   c. These elements form Layer 3 for Pattern B

3. ASSEMBLE CONTEXT BUNDLE
   a. Layer 1: Originating agent's role prompt + docs/overview.md (standard)
   b. Layer 2: Fresh read of docs/{feature}/ files (standard — CRITICAL:
      re-read even if unchanged, as other agents may have committed changes
      while this thread was paused)
   c. Layer 3 (Pattern B specific):
      - Pause summary: "You were working on: {task description from last
        agent message}. You asked the user a question and paused."
      - Question: "{the agent's question, verbatim}"
      - User answer: "{the user's answer, verbatim}"
   d. NO full thread history is included beyond the pause summary,
      question, and answer

4. INVOKE originating agent with this Context Bundle (→ FSPEC-SI-01)
```

### 5.3 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| RPB-R1 | Layer 3 contains only pause summary + question + user answer — no full thread history. | Consistent with Pattern A's approach. The Q/A pair plus the pause summary is sufficient context. Including full history wastes tokens. |
| RPB-R2 | The user's answer is included verbatim — no summarization, validation, or transformation. | The Skill is responsible for interpreting the answer. The Orchestrator is a transport layer, not an interpreter. |
| RPB-R3 | Layer 2 is re-read fresh — MANDATORY even if no other agents modified the files while paused. | The pause may have lasted hours or days. Other agents in other threads may have committed changes to shared docs/{feature}/ files. Stale reads could cause the agent to produce conflicting artifacts. This is explicitly stated in [REQ-RP-02]. |
| RPB-R4 | The pause summary uses the agent's last message (before ROUTE_TO_USER) as the task description. If the last message cannot be determined, use the thread name. | The agent needs to know what it was doing when it paused. The last message is the most specific context. The thread name is a reliable fallback. |
| RPB-R5 | Pattern B is classified when the resume trigger is a user answer detected via polling, NOT when the user posts a message in the Discord thread directly. | Direct Discord thread messages are handled by Phase 3's normal routing (Pattern A or C). Pattern B is specifically for the `pending.md` answer → poll → resume flow. |
| RPB-R6 | The Orchestrator is responsible for Pattern B classification — the `ContextAssembler`'s thread-history-based pattern detection is bypassed entirely for Pattern B resumes. The Orchestrator constructs the Pattern B context bundle directly from `pending.md` data (question, answer, agent, thread) and passes it to the Skill invocation. | Pattern B classification requires access to `pending.md` state, not thread history. It is impossible for the `ContextAssembler` to classify Pattern B from thread history alone. The Orchestrator — which already knows it is executing a user-answer resume — is the correct owner of this classification. |

### 5.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| The agent's last message before ROUTE_TO_USER cannot be found in thread history | Use the thread name as the task description (RPB-R4 fallback). |
| The user's answer is very long (thousands of words) | Include it verbatim in Layer 3. It is not subject to token budget truncation (Layer 3 is never truncated per FSPEC-CB-01, [REQ-CB-02]). If the total bundle exceeds the model's context window, this is an error — log it and do not invoke the Skill. |
| The thread had multiple agents before the pause (e.g., agent A asked agent B, agent B asked the user) | The originating agent for Pattern B is the agent whose ROUTE_TO_USER signal triggered the question — agent B in this example. Agent B is re-invoked, not agent A. |
| Layer 2 files have been deleted while the thread was paused | Layer 2 is empty (no files to read). Proceed with invocation — the agent's role prompt (Layer 1) and the Q/A context (Layer 3) may be sufficient. Log a warning. |

### 5.5 Acceptance Tests

**AT-RPB-01: Standard Pattern B resume**

```
WHO:   As the Orchestrator
GIVEN: PM Agent asked the user "Should OAuth use Google or GitHub?"
       in thread "auth — define requirements"
       and the user answered "Use Google" in pending.md
WHEN:  I assemble the Pattern B Context Bundle for PM Agent
THEN:  Layer 1: PM Agent's role prompt + docs/overview.md
       Layer 2: Fresh read of docs/auth/ files
       Layer 3 contains:
       - Pause summary: "You were working on: {PM Agent's last message}.
         You asked the user a question and paused."
       - Question: "Should OAuth use Google or GitHub?" (verbatim)
       - Answer: "Use Google" (verbatim)
       No full thread history is included
```

**AT-RPB-02: Fresh Layer 2 reads after long pause**

```
WHO:   As the Orchestrator
GIVEN: PM Agent paused 2 hours ago on Q-0001
       and Dev Agent has since committed 3 changes to docs/auth/
WHEN:  The user answers Q-0001 and I assemble Pattern B context
THEN:  Layer 2 reflects the CURRENT state of docs/auth/
       (including Dev Agent's 3 commits)
       NOT the state from 2 hours ago when PM Agent paused
```

**AT-RPB-03: Pause summary fallback to thread name**

```
WHO:   As the Orchestrator
GIVEN: PM Agent's last message before ROUTE_TO_USER cannot be determined
       from the thread history
       and the thread name is "auth — define requirements"
WHEN:  I assemble the Pattern B Context Bundle
THEN:  Layer 3 pause summary uses: "You were working on: auth — define
       requirements. You asked the user a question and paused."
```

**AT-RPB-04: Verbatim answer — no transformation**

```
WHO:   As the Orchestrator
GIVEN: The user wrote a multi-paragraph answer with markdown formatting,
       code snippets, and bullet points
WHEN:  I assemble the Pattern B Context Bundle
THEN:  The answer is included in Layer 3 exactly as written in pending.md
       No summarization, reformatting, or truncation
```

### 5.6 Dependencies

- Depends on: [FSPEC-CB-01] (three-layer context model)
- Depends on: [FSPEC-SI-01] (Skill invocation mechanism)
- Consumed by: [FSPEC-PQ-01] Step 7 (Pattern B is used for the resume invocation)

---

## 6. Traceability Summary

| FSPEC | Requirements | Domain |
|-------|-------------|--------|
| FSPEC-PQ-01 | REQ-PQ-01, REQ-PQ-02, REQ-PQ-03, REQ-PQ-04, REQ-DI-07 | Question Pipeline |
| FSPEC-PQ-02 | REQ-PQ-05 | Discord Writeback |
| FSPEC-RPB-01 | REQ-RP-02 | Resume Pattern B |

**Coverage:** All 7 Phase 5 requirements are covered by 3 FSPECs. No requirements are left unspecified.

---

## 7. Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| — | None | — | All product decisions resolved in requirements phase |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 11, 2026 | Product Manager | Initial functional specification for Phase 5 — 3 FSPECs covering all 7 requirements |
| 1.1 | March 11, 2026 | Product Manager | Revised in response to backend-engineer review. Added §2.4 (new Discord capabilities), §2.5 (engineering notes). Clarified file path convention (config.docs.root relative). Added Discord Message ID field to pending.md format. Specified thread pause enforcement mechanism (PQ-R10). Clarified Pattern B resume sequencing via ThreadQueue (PQ-R11). Specified polling loop shutdown (§3.3, PQ-R12). Updated PQ-R1 with ID generation algorithm covering both files. Updated PQ-R9 with full restart recovery scope. Added FSPEC-RPB-01 classification ownership note and RPB-R6. |
| 1.2 | March 11, 2026 | Test Engineer | Post-implementation spec alignment (TE review M-03/M-04, PM-approved). §3.6: Updated pending.md format example to match implemented comment-marker + bold-label layout; updated parsing rules to reflect `(blank until answered)` sentinel and comment-marker ID extraction. §3.7: Updated resolved.md format example to comment-marker layout; added `Discord Message ID` field with rationale. PQ-R9: Updated to specify that discordMessageIdMap seeding covers both `pending.md` and `resolved.md` on restart. |

---

*Gate: User reviews and approves this functional specification before handoff to engineering.*
