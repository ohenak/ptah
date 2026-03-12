# Technical Specification: Phase 5 — User Questions

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-DI-07], [REQ-RP-02], [REQ-PQ-01], [REQ-PQ-02], [REQ-PQ-03], [REQ-PQ-04], [REQ-PQ-05] |
| **Functional Specifications** | [FSPEC-PQ-01], [FSPEC-PQ-02], [FSPEC-RPB-01] — [005-FSPEC-ptah-user-questions](./005-FSPEC-ptah-user-questions.md) |
| **Analysis** | N/A — FSPEC contains full behavioral specification; codebase analysis performed inline |
| **Date** | March 11, 2026 |
| **Status** | Draft |

---

## 1. Summary

Phase 5 closes the "agent needs human input" loop by implementing the full question routing pipeline. When a Skill emits `ROUTE_TO_USER`, the Orchestrator writes the question to `docs/open-questions/pending.md`, notifies the user in Discord `#open-questions` with an @mention, and pauses the originating thread. A background polling loop detects when the user writes an answer (either by editing `pending.md` directly or by replying in Discord, which triggers automatic writeback). On detection, the Orchestrator resumes the originating Skill via Pattern B — a fresh context bundle containing a pause summary, the user's verbatim answer, and re-read feature docs — then archives the Q/A pair to `resolved.md`.

Phase 5 adds three new orchestrator modules (`QuestionStore`, `QuestionPoller`, `PatternBContextBuilder`), extends the `DiscordClient` protocol with four new methods for channel-level messaging, extends `ResumePattern` with `"pattern_b"`, and adds a graceful `shutdown()` path to the `Orchestrator` interface. No new npm dependencies are required.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Continues Phase 1–4 stack |
| Language | TypeScript 5.x (ESM) | Continues Phase 1–4 stack |
| Discord library | discord.js v14 (`^14.25.1`) | Existing Phase 2 dependency |
| Claude Code SDK | `@anthropic-ai/claude-code` | Existing Phase 3 dependency |
| Test framework | Vitest | Continues Phase 1–4 stack |
| File parsing | Built-in string operations | pending.md/resolved.md are structured Markdown; no parser library needed |

**No new external dependencies for Phase 5.** All new functionality uses Node.js built-ins and existing project infrastructure.

---

## 3. Project Structure

```
ptah/
├── src/
│   ├── commands/
│   │   └── start.ts                              ← UPDATED: call orchestrator.shutdown() in cleanup
│   ├── config/
│   │   ├── defaults.ts                           ← existing
│   │   └── loader.ts                             ← existing
│   ├── services/
│   │   ├── discord.ts                            ← UPDATED: 4 new protocol methods + ChannelMessage type
│   │   ├── filesystem.ts                         ← existing (no changes)
│   │   ├── git.ts                                ← existing (no changes)
│   │   ├── logger.ts                             ← existing
│   │   └── claude-code.ts                        ← existing
│   ├── orchestrator/
│   │   ├── orchestrator.ts                       ← UPDATED: Phase 5 pipeline, paused threads, shutdown()
│   │   ├── question-store.ts                     ← NEW: pending.md/resolved.md CRUD + git commits
│   │   ├── question-poller.ts                    ← NEW: background poll loop
│   │   ├── pattern-b-context-builder.ts          ← NEW: Pattern B context assembly
│   │   ├── context-assembler.ts                  ← existing (no changes needed)
│   │   ├── artifact-committer.ts                 ← existing
│   │   ├── agent-log-writer.ts                   ← existing
│   │   ├── merge-lock.ts                         ← existing
│   │   ├── message-deduplicator.ts               ← existing
│   │   ├── response-poster.ts                    ← existing
│   │   ├── router.ts                             ← existing
│   │   ├── skill-invoker.ts                      ← existing
│   │   ├── thread-queue.ts                       ← existing
│   │   └── token-counter.ts                      ← existing
│   ├── types.ts                                  ← UPDATED: ResumePattern + 3 new types
│   └── shutdown.ts                               ← existing
├── bin/
│   └── ptah.ts                                   ← UPDATED: wire new services
└── tests/
    ├── unit/
    │   ├── orchestrator/
    │   │   ├── orchestrator.test.ts              ← UPDATED: paused thread guard, ROUTE_TO_USER pipeline
    │   │   ├── question-store.test.ts            ← NEW
    │   │   ├── question-poller.test.ts           ← NEW
    │   │   └── pattern-b-context-builder.test.ts ← NEW
    │   └── services/
    │       └── discord.test.ts                   ← UPDATED: 4 new method tests
    ├── integration/
    │   └── orchestrator/
    │       └── question-pipeline.test.ts         ← NEW: end-to-end question routing
    └── fixtures/
        └── factories.ts                          ← UPDATED: FakeQuestionStore, FakeQuestionPoller,
                                                               extended FakeDiscordClient
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/ptah.ts (composition root)
  └── src/commands/start.ts (StartCommand)                    ← UPDATED
        ├── src/config/loader.ts (ConfigLoader)               ← existing
        ├── src/services/discord.ts (DiscordClient)           ← UPDATED (4 new methods)
        ├── src/services/logger.ts (Logger)                   ← existing
        └── src/orchestrator/orchestrator.ts (Orchestrator)   ← UPDATED
              ├── src/orchestrator/router.ts (RoutingEngine)               ← existing
              ├── src/orchestrator/context-assembler.ts (ContextAssembler) ← existing
              ├── src/orchestrator/skill-invoker.ts (SkillInvoker)         ← existing
              ├── src/orchestrator/artifact-committer.ts (ArtifactCommitter) ← existing
              ├── src/orchestrator/agent-log-writer.ts (AgentLogWriter)    ← existing
              ├── src/orchestrator/message-deduplicator.ts                 ← existing
              ├── src/orchestrator/response-poster.ts (ResponsePoster)     ← existing
              ├── src/orchestrator/thread-queue.ts (ThreadQueue)           ← existing
              ├── src/orchestrator/merge-lock.ts (MergeLock)               ← existing (shared)
              ├── src/services/git.ts (GitClient)                          ← existing
              ├── src/orchestrator/question-store.ts (QuestionStore)       ← NEW
              │     ├── src/services/filesystem.ts (FileSystem)
              │     ├── src/services/git.ts (GitClient)
              │     └── src/orchestrator/merge-lock.ts (MergeLock)
              ├── src/orchestrator/question-poller.ts (QuestionPoller)     ← NEW
              │     ├── src/orchestrator/question-store.ts (QuestionStore)
              │     └── src/services/logger.ts (Logger)
              └── src/orchestrator/pattern-b-context-builder.ts            ← NEW
                    ├── src/services/filesystem.ts (FileSystem)
                    ├── src/orchestrator/token-counter.ts (TokenCounter)
                    └── src/services/logger.ts (Logger)
```

### 4.2 Protocols (Interfaces)

#### 4.2.1 DiscordClient Protocol — Extended

```typescript
// src/services/discord.ts — UPDATED

export interface DiscordClient {
  // --- Phase 2 (existing) ---
  connect(token: string): Promise<void>;
  disconnect(): Promise<void>;
  findChannelByName(guildId: string, channelName: string): Promise<string | null>;
  onThreadMessage(
    parentChannelId: string,
    handler: (message: ThreadMessage) => Promise<void>,
  ): void;
  readThreadHistory(threadId: string): Promise<ThreadMessage[]>;

  // --- Phase 3 (existing) ---
  postEmbed(options: EmbedOptions): Promise<string>;
  createThread(channelId: string, name: string, initialMessage: EmbedOptions): Promise<string>;
  postSystemMessage(threadId: string, content: string): Promise<void>;

  // --- Phase 5 (new) ---
  postChannelMessage(channelId: string, content: string): Promise<string>;
  onChannelMessage(
    channelId: string,
    handler: (message: ChannelMessage) => Promise<void>,
  ): void;
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>;
  replyToMessage(channelId: string, messageId: string, content: string): Promise<void>;
}
```

| New Method | Behavior |
|------------|----------|
| `postChannelMessage(channelId, content)` | Sends a plain-text message to a non-thread `GuildText` channel. Returns the Discord message ID of the sent message. Used to post the @mention notification to `#open-questions`. |
| `onChannelMessage(channelId, handler)` | Registers a `messageCreate` listener filtered to non-thread messages in the given channel ID. Invokes handler for every non-bot message. Used to receive Discord replies in `#open-questions`. |
| `addReaction(channelId, messageId, emoji)` | Fetches the message by ID from the channel and calls `.react(emoji)`. Used to add ✅ after accepting a Discord reply answer. |
| `replyToMessage(channelId, messageId, content)` | Fetches the message by ID from the channel and calls `.reply(content)`. Used for "already resolved" / "already answered" feedback. |

#### 4.2.2 QuestionStore Protocol — New

```typescript
// src/orchestrator/question-store.ts — NEW

export interface QuestionStore {
  /**
   * Atomically assign the next question ID, append a new entry to pending.md
   * (creating the file with header if absent), and commit under the MergeLock.
   * The ID is determined by scanning both pending.md and resolved.md for the
   * highest Q-{NNNN} header inside a single MergeLock acquisition — eliminating
   * the TOCTOU window that would arise from a separate nextQuestionId() call.
   *
   * Accepts the question without an ID; returns the complete PendingQuestion
   * with the assigned ID populated.
   *
   * Commits: "[ptah] System: add question {assignedId} from {question.agentId}"
   */
  appendQuestion(question: Omit<PendingQuestion, 'id'>): Promise<PendingQuestion>;

  /**
   * Write the Discord message ID into the question entry in pending.md.
   * Commits: "[ptah] System: update {questionId} notification"
   * No-ops if the question is not found in pending.md.
   */
  updateDiscordMessageId(questionId: string, discordMessageId: string): Promise<void>;

  /**
   * Read and parse all question entries from pending.md.
   * Returns an empty array if the file does not exist or has no valid entries.
   * Logs a warning for unparseable entries; does not throw.
   */
  readPendingQuestions(): Promise<PendingQuestion[]>;

  /**
   * Read and parse all question entries from resolved.md.
   * Returns an empty array if the file does not exist or has no valid entries.
   * Logs a warning for unparseable entries; does not throw.
   * Used on startup to seed the discordMessageIdMap (PQ-R9).
   */
  readResolvedQuestions(): Promise<PendingQuestion[]>;

  /**
   * Find a single question in pending.md by ID.
   * Returns null if not found.
   */
  getQuestion(questionId: string): Promise<PendingQuestion | null>;

  /**
   * Write the user's answer into the Answer field of the question entry in pending.md.
   * Commits: "[ptah] System: answer {questionId} via Discord"
   */
  setAnswer(questionId: string, answer: string): Promise<void>;

  /**
   * Remove the question from pending.md and append it (with Answered timestamp) to resolved.md.
   * Both files are written in a single merge-locked git commit:
   * "[ptah] System: resolve {questionId}"
   * Creates resolved.md with standard header if absent.
   */
  archiveQuestion(questionId: string, resolvedAt: Date): Promise<void>;
}
```

**Implementation:** `DefaultQuestionStore` — accepts `FileSystem`, `GitClient`, `MergeLock`, `Logger`, and `docsRoot: string` (resolved from `config.docs.root` at construction time).

**Atomic ID assignment in `appendQuestion()`:** Inside a single `MergeLock` acquisition:
1. Read both `pending.md` and `resolved.md` (both may be absent — treat as empty)
2. Extract all `## Q-{NNNN}` headers across both files
3. `maxN = Math.max(0, ...allNValues)`; `assignedId = "Q-" + String(maxN + 1).padStart(4, "0")`
4. Write the new entry to `pending.md` with the assigned ID
5. Commit: `[ptah] System: add question {assignedId} from {agentId}`
6. Return the complete `PendingQuestion` with `id` populated

#### 4.2.3 QuestionPoller Protocol — New

```typescript
// src/orchestrator/question-poller.ts — NEW

export interface QuestionPoller {
  /**
   * Add a question to the active poll set.
   * Auto-starts the polling interval if not already running.
   */
  registerQuestion(question: RegisteredQuestion): void;

  /**
   * Stop the polling interval and await any in-progress poll tick.
   * Must be called during Orchestrator shutdown (PQ-R12).
   */
  stop(): Promise<void>;
}
```

**Constructor signature for `DefaultQuestionPoller`:**
```typescript
class DefaultQuestionPoller implements QuestionPoller {
  constructor(
    private store: QuestionStore,
    private onAnswer: (question: PendingQuestion) => Promise<void>,
    private intervalMs: number,
    private logger: Logger,
  ) {}
}
```

The `onAnswer` callback is `orchestrator.resumeWithPatternB` — passed at composition time.

**Internal behavior:**
- Maintains `registered: Map<string, RegisteredQuestion>` — keyed by `questionId`
- `registerQuestion()` sets `registered.set(q.questionId, q)`, then starts the interval if not already running
- On each tick: if `registered` is empty, clears the interval (self-stops per FSPEC §3.3 point 3); otherwise reads `pending.md` via `store.readPendingQuestions()`, checks each registered question for a non-empty answer, fires `onAnswer` and removes from registered for each answered question
- `stop()`: clears the interval, awaits any active tick via `activeTick` promise reference

#### 4.2.4 PatternBContextBuilder Protocol — New

```typescript
// src/orchestrator/pattern-b-context-builder.ts — NEW

export interface PatternBContextBuilder {
  /**
   * Assemble a Pattern B ContextBundle.
   * Layer 1: agent role prompt + overview.md (from worktree)
   * Layer 2: feature docs read FRESH from worktree (mandatory re-read per RPB-R3)
   * Layer 3: pause summary + question verbatim + user answer verbatim (no thread history)
   * Returns a ContextBundle with resumePattern: "pattern_b"
   */
  build(params: {
    question: PendingQuestion;
    worktreePath: string;
    config: PtahConfig;
    threadHistory: ThreadMessage[];  // used only for pause summary derivation
  }): Promise<ContextBundle>;
}
```

**Implementation:** `DefaultPatternBContextBuilder` — accepts `FileSystem`, `TokenCounter`, `Logger`.

#### 4.2.5 Orchestrator Protocol — Extended

```typescript
// src/orchestrator/orchestrator.ts — UPDATED

export interface Orchestrator {
  handleMessage(message: ThreadMessage): Promise<void>;
  startup(): Promise<void>;
  shutdown(): Promise<void>;           // NEW: stop polling loop before Discord disconnect
  resumeWithPatternB(question: PendingQuestion): Promise<void>;  // NEW: called by poller callback
}
```

**New fields on `OrchestratorDeps`:**
```typescript
export interface OrchestratorDeps {
  // --- Phase 1–4 (existing) ---
  discordClient: DiscordClient;
  routingEngine: RoutingEngine;
  contextAssembler: ContextAssembler;
  skillInvoker: SkillInvoker;
  responsePoster: ResponsePoster;
  threadQueue: ThreadQueue;
  logger: Logger;
  config: PtahConfig;
  gitClient: GitClient;
  artifactCommitter: ArtifactCommitter;
  agentLogWriter: AgentLogWriter;
  messageDeduplicator: MessageDeduplicator;

  // --- Phase 5 (new) ---
  questionStore: QuestionStore;
  questionPoller: QuestionPoller;
  patternBContextBuilder: PatternBContextBuilder;
}
```

**New private instance fields on `DefaultOrchestrator` (Phase 5):**
```typescript
private pausedThreadIds = new Set<string>();
private openQuestionsChannelId: string | null = null;
/**
 * In-memory map of Discord message ID → question ID.
 * Seeded on startup from both pending.md and resolved.md (PQ-R9).
 * Updated whenever a new question notification is posted (handleRouteToUser §5.6).
 * Used by handleOpenQuestionReply to distinguish:
 *   - discordMessageId not in map → unrelated bot message → silently ignore
 *   - discordMessageId in map + question in pending.md → process reply
 *   - discordMessageId in map + question NOT in pending.md → "already resolved"
 */
private discordMessageIdMap = new Map<string, string>();  // discordMessageId → questionId
```

### 4.3 Types — Updated and New

```typescript
// src/types.ts — UPDATED

// Extended: add "pattern_b"
export type ResumePattern = "fresh" | "pattern_a" | "pattern_b" | "pattern_c";

// NEW: in-memory representation of a pending question entry
export interface PendingQuestion {
  id: string;               // "Q-0001"
  agentId: string;          // "pm-agent"
  threadId: string;         // Discord thread snowflake ID
  threadName: string;       // "auth — define requirements"
  askedAt: Date;            // when the question was written
  questionText: string;     // verbatim question from ROUTE_TO_USER signal
  answer: string | null;    // null until answered; verbatim once written
  discordMessageId: string | null;  // null until notification posted
}

// NEW: in-memory tracking record for the poller
export interface RegisteredQuestion {
  questionId: string;   // "Q-0001"
  agentId: string;      // "pm-agent"
  threadId: string;     // Discord thread snowflake ID
}

// NEW: message type for non-thread channel messages (Phase 5 Discord writeback)
export interface ChannelMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  isBot: boolean;
  content: string;
  replyToMessageId: string | null;  // ID of the message being replied to (Discord reply feature)
  timestamp: Date;
}
```

---

## 5. Algorithms

### 5.1 Question ID Assignment (internal to `QuestionStore.appendQuestion`)

ID assignment is no longer a public method — it is performed atomically inside `appendQuestion()` under a single `MergeLock` acquisition (F-02 fix, closes OQ-01). This eliminates the TOCTOU window that existed when `nextQuestionId()` was called separately before `appendQuestion()`.

```
Inside appendQuestion() — under MergeLock:

1. Read pending.md → extract all "## Q-{NNNN}" headers → collect N values
   (file may not exist — treat as empty, no error)
2. Read resolved.md → extract all "## Q-{NNNN}" headers → collect N values
   (file may not exist — treat as empty, no error)
3. maxN = Math.max(0, ...allNValues)
4. assignedId = "Q-" + String(maxN + 1).padStart(4, "0")
   → "Q-0001" when both files are empty
5. Write the new entry to pending.md with assignedId
6. Commit: "[ptah] System: add question {assignedId} from {agentId}"
7. Release MergeLock
8. Return the complete PendingQuestion with id = assignedId
```

**Regex for parsing:** `/^## (Q-\d{4})$/m` — matches question section headers.

### 5.2 pending.md Parse Rules

A question entry is the block from `## Q-{NNNN}` to (but not including) the next `## Q-{NNNN}` or end of file.

**Answer detection:** An answer is present when there is non-whitespace content between the marker line `<!-- Write your answer below this line -->` and the next `---` separator (or end of block).

```typescript
function extractAnswer(entryBlock: string): string | null {
  const markerIdx = entryBlock.indexOf("<!-- Write your answer below this line -->");
  if (markerIdx === -1) return null;
  const afterMarker = entryBlock.slice(markerIdx + "<!-- Write your answer below this line -->".length);
  const sepIdx = afterMarker.indexOf("\n---");
  const raw = sepIdx === -1 ? afterMarker : afterMarker.slice(0, sepIdx);
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

**Discord message ID extraction:** Read the table row `| **Discord Message ID** | {value} |` from the entry.

### 5.3 pending.md File Format (serialization)

When creating a new entry:

```markdown
## Q-0001

| Field | Value |
|-------|-------|
| **Agent** | {agentId} |
| **Thread** | {threadName} |
| **Thread ID** | {threadId} |
| **Asked** | {askedAt.toISOString()} |
| **Discord Message ID** |  |

**Question:**

{questionText}

**Answer:**

<!-- Write your answer below this line -->


---

```

When updating Discord message ID: read the file, replace the `| **Discord Message ID** |  |` row for the target question with `| **Discord Message ID** | {messageId} |`, write back.

When updating answer: read the file, find the block for the target question ID, replace content after `<!-- Write your answer below this line -->` up to the next `---` with the answer text followed by `\n\n`, write back.

**Standard file header** (created if file is absent):
```markdown
# Pending Questions

<!-- Ptah managed file — do not modify the structure. Write your answer in the Answer field. -->

---

```

### 5.4 resolved.md File Format (serialization)

When archiving (resolved entries differ from pending in three ways: no Discord Message ID field, no answer marker comment, includes Answered timestamp):

```markdown
## Q-0001

| Field | Value |
|-------|-------|
| **Agent** | {agentId} |
| **Thread** | {threadName} |
| **Thread ID** | {threadId} |
| **Asked** | {askedAt.toISOString()} |
| **Answered** | {resolvedAt.toISOString()} |

**Question:**

{questionText}

**Answer:**

{answer}

---

```

**Standard file header** (created if file is absent):
```markdown
# Resolved Questions

<!-- Ptah managed file — archived question/answer pairs. -->

---

```

### 5.5 Pattern B Context Assembly (`PatternBContextBuilder.build`)

```
INPUTS: question (PendingQuestion), worktreePath, config, threadHistory

1. Resolve featureName from question.threadName (same logic as ContextAssembler.extractFeatureName)
2. Resolve docsRoot = fs.joinPath(worktreePath, config.docs.root)

3. Layer 1:
   a. Read role prompt from config.agents.skills[question.agentId] — throw if not found
   b. Read overview.md from docsRoot/featureName/overview.md — warn and continue if absent
   c. Concatenate: rolePrompt + "\n\n## Overview\n\n" + overviewContent (if present)
   d. Append TWO_ITERATION_RULE and ROUTING_INSTRUCTION constants (same as ContextAssembler)

4. Layer 3 (built BEFORE Layer 2 for token budget):
   a. Derive pauseSummary:
      - Filter threadHistory for isBot === true, sort by timestamp ascending
      - Last bot message in list = agent's last output before ROUTE_TO_USER
      - If found: "You were working on: {lastBotMessage.content}. You asked the user a question and paused."
      - Fallback (RPB-R4): "You were working on: {question.threadName}. You asked the user a question and paused."
   b. Build Layer 3 string:
      "## Pause Summary\n\n{pauseSummary}\n\n## Question\n\n{question.questionText}\n\n## User Answer\n\n{question.answer}"

5. Layer 2:
   a. Read feature files from docsRoot/featureName/ (exclude overview.md — same as ContextAssembler)
   b. If docsRoot/featureName/ doesn't exist → log warning, Layer 2 is empty (not an error — RPB edge case)
   c. Apply token budget: config.orchestrator.token_budget.layer2_pct (or DEFAULT_TOKEN_BUDGET)

6. Token budget check (same L1+L3 > 85% guard as ContextAssembler):
   a. Compute l1Tokens + l3Tokens
   b. If > 0.85 * config.agents.max_tokens → omit Layer 2 with warning
   c. If answer length would make total exceed model context → log error, throw (RPB edge case)

7. Assemble systemPrompt:
   systemPrompt = layer2Content ? `${layer1}\n\n## Feature Files\n\n${layer2Content}` : layer1

8. Return ContextBundle:
   {
     systemPrompt,
     userMessage: layer3,
     agentId: question.agentId,
     threadId: question.threadId,
     featureName,
     resumePattern: "pattern_b",
     turnNumber: 1,   // Pattern B always starts fresh for the resume turn
     tokenCounts: { layer1, layer2, layer3, total }
   }
```

### 5.6 ROUTE_TO_USER Pipeline in Orchestrator (`handleRouteToUser`)

Called from `executeRoutingLoop` when `decision.isPaused === true`, replacing the Phase 3 placeholder behavior.

```
INPUTS: questionText (string), triggerMessage (ThreadMessage), agentId (string)

1. Build partial question object (id: omitted, answer: null, discordMessageId: null)
2. question = await questionStore.appendQuestion(partialQuestion)
   ← atomically assigns ID, writes + commits "[ptah] System: add question {assignedId} from {agentId}"

3. Post Discord notification (best-effort):
   a. If this.openQuestionsChannelId is set:
      content = formatQuestionNotification(question)  ← see §5.7
      discordMessageId = await discord.postChannelMessage(openQuestionsChannelId, content)
      await questionStore.updateDiscordMessageId(question.id, discordMessageId)  ← updates + commits
      this.discordMessageIdMap.set(discordMessageId, question.id)  ← seed in-memory map (F-01)
   b. If discord fails → log warning, continue (PQ-R6: file is the source of truth)
   c. If openQuestionsChannelId is null → log warning, continue

4. Post pause embed to originating thread:
   await discord.postSystemMessage(triggerMessage.threadId, "⏸ Paused — waiting for user answer to {question.id}")

5. Add threadId to this.pausedThreadIds set (PQ-R10)

6. Register with poller:
   questionPoller.registerQuestion({ questionId: question.id, agentId, threadId: triggerMessage.threadId })
```

### 5.7 Discord Notification Format

```
<@{config.discord.mention_user_id}> **Question from {agentId}** ({questionId})

**Thread:** {threadName}

**Question:**
{questionText}
```

### 5.8 Pattern B Resume in Orchestrator (`resumeWithPatternB`)

Called by the `QuestionPoller` callback when a non-empty answer is detected.

```
INPUT: question (PendingQuestion) — has non-null answer

1. Enqueue to ThreadQueue for question.threadId:
   threadQueue.enqueue(question.threadId, async () => {
     await executePatternBResume(question)
   })
```

`executePatternBResume(question)`:

```
1. Generate invocationId, branch, worktreePath (same as executeRoutingLoop)
2. ensureUniqueBranch(...)
3. await gitClient.createWorktree(branch, worktreePath)

4. try:
   a. threadHistory = await discord.readThreadHistory(question.threadId)
   b. bundle = await patternBContextBuilder.build({ question, worktreePath, config, threadHistory })
   c. result = await skillInvoker.invoke(bundle, config, worktreePath)

   d. Artifact commit + merge (identical to executeRoutingLoop):
      commitResult = await artifactCommitter.commitAndMerge({
        agentId: question.agentId,
        threadName: question.threadName,
        worktreePath,
        branch,
        artifactChanges: result.artifactChanges,
      })
      await handleCommitResult(commitResult, syntheticTrigger, worktreePath, branch, agentDisplayName)
      if (commitResult.mergeStatus === "no-changes") await cleanupWorktree(...)
      await writeLogEntry(question.agentId, syntheticTrigger, logStatus, commitResult.commitSha)

   e. Post response to originating thread:
      await responsePoster.postAgentResponse({
        threadId: question.threadId,
        agentId: question.agentId,
        text: result.textResponse,
        config,
        footer: `${result.durationMs}ms`,
      })

   f. Remove from paused threads:
      this.pausedThreadIds.delete(question.threadId)

   g. Archive the question (PQ-R4: after successful resume):
      await questionStore.archiveQuestion(question.id, new Date())

   h. Parse routing signal and continue:
      signal = routingEngine.parseSignal(result.routingSignalRaw)
      decision = routingEngine.decide(signal, config)
      if (decision.isTerminal) → postCompletionEmbed, return
      if (decision.isPaused) → handleRouteToUser(signal.question!, syntheticTrigger, question.agentId), return
      if (decision.createNewThread) → responsePoster.createCoordinationThread(...), return
      // ROUTE_TO_AGENT reply → continue with executeRoutingLoop(decision.targetAgentId!, syntheticTrigger)

5. catch (error):
   - cleanupWorktree(worktreePath, branch)
   - writeLogEntry(..., "error", null)
   - Log error — question is NOT archived (PQ-R4: remains in pending.md for retry on next poll tick)
   - pausedThreadIds is NOT cleared — thread remains paused
   - responsePoster.postErrorEmbed(question.threadId, ...) if Discord is available
```

**Synthetic trigger message** (for commit message and log entry context, and for ROUTE_TO_AGENT chain):

```typescript
const syntheticTrigger: ThreadMessage = {
  id: `pattern-b-resume-${question.id}`,
  threadId: question.threadId,
  threadName: question.threadName,
  parentChannelId: threadHistory[0]?.parentChannelId ?? "",
  authorId: config.discord.mention_user_id,
  authorName: "User",
  isBot: false,
  content: question.answer!,
  timestamp: new Date(),
};
```

### 5.9 Discord Reply Writeback (`handleOpenQuestionReply`)

Registered in `startup()` via `discord.onChannelMessage(openQuestionsChannelId, ...)`.

```
INPUT: message (ChannelMessage)

1. Ignore if message.replyToMessageId is null (not a Discord reply — PQD-R1)
2. Ignore if message.authorId !== config.discord.mention_user_id (not the configured user — PQD-R5)
3. Ignore if message.content.trim() === "" (empty message edge case)

4. Look up question ID from discordMessageIdMap (F-01 — three-way distinction):
   questionId = this.discordMessageIdMap.get(message.replyToMessageId)
   If questionId is undefined → return (reply to unrelated bot message — silently ignore)

5. Check if question still pending (F-01 — may have moved to resolved.md):
   existing = await questionStore.getQuestion(questionId)
   If existing is null:
     await discord.replyToMessage(openQuestionsChannelId!, message.id, "This question has already been resolved.")
     return

6. Check if already answered (PQD-R3):
   If existing.answer !== null:
     await discord.replyToMessage(openQuestionsChannelId!, message.id, "This question already has an answer.")
     return

7. Write answer:
   await questionStore.setAnswer(questionId, message.content)

8. Confirm (best-effort — PQD-R5 edge case: permissions failure):
   try:
     await discord.addReaction(openQuestionsChannelId!, message.id, "✅")
   catch:
     logger.warn("Failed to add ✅ reaction: ...")
     (answer was already written — confirmation failure does not roll back)
```

### 5.10 Orchestrator `startup()` — Extended

Phase 5 additions after the existing startup steps:

```
3. Resolve #open-questions channel:
   this.openQuestionsChannelId = await discord.findChannelByName(
     config.discord.server_id,
     config.discord.channels.questions,
   )
   if null → log warning (Discord notifications will be skipped per PQ-R6; file flow works)

4. Register Discord reply listener:
   if (this.openQuestionsChannelId) {
     discord.onChannelMessage(this.openQuestionsChannelId, async (msg) => {
       await this.handleOpenQuestionReply(msg)
     })
   }

5. Restart recovery + discordMessageIdMap seeding (PQ-R9, F-01):
   pendingQuestions = await questionStore.readPendingQuestions()
   resolvedQuestions = await questionStore.readResolvedQuestions()

   // Seed discordMessageIdMap from both files (enables "already resolved" reply on restart)
   for each q in [...pendingQuestions, ...resolvedQuestions]:
     if (q.discordMessageId) this.discordMessageIdMap.set(q.discordMessageId, q.id)

   // Restore paused threads and poller
   for each q in pendingQuestions:
     this.pausedThreadIds.add(q.threadId)
     questionPoller.registerQuestion({ questionId: q.id, agentId: q.agentId, threadId: q.threadId })
   if pendingQuestions.length > 0:
     logger.info(`Restored ${pendingQuestions.length} pending question(s) from pending.md`)
```

### 5.11 Orchestrator `shutdown()` — New

```typescript
async shutdown(): Promise<void> {
  await this.questionPoller.stop();
}
```

Called from `StartCommand.cleanup()` before `discord.disconnect()` (PQ-R12).

### 5.12 Paused Thread Guard in `processMessage`

Insert after the dedup check (Step 1) and before the bot-message filter (Step 2):

```typescript
// Phase 5: silently drop messages for paused threads (PQ-R10)
if (this.pausedThreadIds.has(message.threadId)) {
  this.logger.debug(`Dropping message for paused thread ${message.threadId}`);
  return;
}
```

---

## 6. Error Handling

| Scenario | Behavior | Details |
|----------|----------|---------|
| `pending.md` malformed or has unparseable entries | Log warning per entry; skip the unparseable block; continue | `readPendingQuestions()` returns valid entries only. Does not throw. Re-checked on next poll tick. |
| `#open-questions` channel unavailable when posting notification | Log warning; write question to `pending.md` (already committed); pause thread; register with poller | Discord failure does not block the question pipeline (PQ-R6). User can answer by editing the file. |
| Discord `addReaction` fails (permissions) | Log warning; answer is already written and committed | Confirmation is best-effort. File write is authoritative. |
| Discord `replyToMessage` fails when rejecting duplicate reply | Log warning; no file change | Reply feedback is best-effort. |
| Pattern B Skill invocation fails (any error) | Log error; clean up worktree; question remains in `pending.md`; paused threads set unchanged | On next poll tick, the answer is still detected and resume is retried (PQ-R4). |
| Thread history unavailable when building Pattern B context | Fallback to thread name for pause summary (RPB-R4); proceed with invocation | No error thrown. |
| Layer 2 feature folder missing during Pattern B build | Layer 2 is empty (log warning); Layer 1 + Layer 3 still passed to Skill | Non-fatal per FSPEC §5.4 edge case. |
| User answer exceeds model context window (L1+L2+L3 > max_tokens) | Log error; throw; question remains pending | Extremely unlikely in practice. The Skill is not invoked. |
| Thread deleted/archived before Pattern B resume | `readThreadHistory` may return empty array; use thread name fallback for pause summary; proceed with invocation; `postAgentResponse` may fail | Log warning; invocation still attempted. Post-invocation Discord errors logged but do not block archival. |
| Two Pattern B resumes queued for the same thread simultaneously (PQ-R11) | `ThreadQueue` serializes them; second resume runs only after first completes | Enforced by existing `ThreadQueue` infrastructure. No extra code needed. |
| Two `ROUTE_TO_USER` signals processed simultaneously for different threads calling `appendQuestion()` concurrently | `MergeLock` serializes all `appendQuestion()` invocations — each call scans both files and assigns an ID atomically inside a single lock acquisition; the second caller sees the first's committed entry and advances to the next ID | TOCTOU window closed by F-02 fix; no duplicate IDs possible. |
| Orchestrator shutdown with pending questions | `questionPoller.stop()` cancels the timer and awaits any active tick; pending questions survive in `pending.md`; polling resumes on next startup | PQ-R12 behavior. |

---

## 7. Test Strategy

### 7.1 Approach

- **Unit tests** use `FakeQuestionStore`, `FakeQuestionPoller`, and the extended `FakeDiscordClient` from `factories.ts`. All external I/O is replaced with in-memory fakes.
- **Integration tests** use real `NodeFileSystem` and `NodeGitClient` in temp directories; `DefaultQuestionStore` and `DefaultQuestionPoller` are exercised end-to-end.
- **Fake timers** (`vi.useFakeTimers()`) are used in `question-poller.test.ts` to control the poll interval without real `setInterval` delays.
- **No `vi.mock()`** for project-owned modules — all dependencies are injected through constructors.

### 7.2 Test Doubles

#### FakeQuestionStore

```typescript
// tests/fixtures/factories.ts — add to existing file

export class FakeQuestionStore implements QuestionStore {
  private questions = new Map<string, PendingQuestion>();
  private archived: Array<{ question: PendingQuestion; resolvedAt: Date }> = [];

  // Error injection
  appendError: Error | null = null;
  updateDiscordMessageIdError: Error | null = null;
  readError: Error | null = null;
  setAnswerError: Error | null = null;
  archiveError: Error | null = null;

  // Test helpers
  seedQuestion(q: PendingQuestion): void { this.questions.set(q.id, q); }
  getArchivedQuestions(): Array<{ question: PendingQuestion; resolvedAt: Date }> {
    return [...this.archived];
  }

  async appendQuestion(q: Omit<PendingQuestion, 'id'>): Promise<PendingQuestion> {
    if (this.appendError) throw this.appendError;
    const allIds = [
      ...[...this.questions.keys()],
      ...this.archived.map((a) => a.question.id),
    ];
    const maxN = allIds.reduce((max, id) => {
      const n = parseInt(id.slice(2), 10);
      return n > max ? n : max;
    }, 0);
    const id = `Q-${String(maxN + 1).padStart(4, "0")}`;
    const question: PendingQuestion = { ...q, id };
    this.questions.set(id, question);
    return question;
  }

  async updateDiscordMessageId(questionId: string, messageId: string): Promise<void> {
    if (this.updateDiscordMessageIdError) throw this.updateDiscordMessageIdError;
    const q = this.questions.get(questionId);
    if (q) this.questions.set(questionId, { ...q, discordMessageId: messageId });
  }

  async readPendingQuestions(): Promise<PendingQuestion[]> {
    if (this.readError) throw this.readError;
    return [...this.questions.values()];
  }

  async readResolvedQuestions(): Promise<PendingQuestion[]> {
    return this.archived.map((a) => a.question);
  }

  async getQuestion(questionId: string): Promise<PendingQuestion | null> {
    return this.questions.get(questionId) ?? null;
  }

  async setAnswer(questionId: string, answer: string): Promise<void> {
    if (this.setAnswerError) throw this.setAnswerError;
    const q = this.questions.get(questionId);
    if (q) this.questions.set(questionId, { ...q, answer });
  }

  async archiveQuestion(questionId: string, resolvedAt: Date): Promise<void> {
    if (this.archiveError) throw this.archiveError;
    const q = this.questions.get(questionId);
    if (q) {
      this.archived.push({ question: q, resolvedAt });
      this.questions.delete(questionId);
    }
  }
}
```

#### FakeQuestionPoller

```typescript
// tests/fixtures/factories.ts — add to existing file

export class FakeQuestionPoller implements QuestionPoller {
  startCalled = false;
  stopCalled = false;
  registeredQuestions: RegisteredQuestion[] = [];
  private onAnswer: ((q: PendingQuestion) => Promise<void>) | null = null;

  constructor(onAnswer?: (q: PendingQuestion) => Promise<void>) {
    this.onAnswer = onAnswer ?? null;
  }

  registerQuestion(q: RegisteredQuestion): void {
    this.registeredQuestions.push(q);
    this.startCalled = true;
  }

  async stop(): Promise<void> {
    this.stopCalled = true;
  }

  // Test helper: simulate the poller detecting an answer for the given question
  async simulateAnswerDetected(question: PendingQuestion): Promise<void> {
    if (this.onAnswer) await this.onAnswer(question);
  }
}
```

#### Extended FakeDiscordClient

Add to the existing `FakeDiscordClient` in `factories.ts`:

```typescript
// Additions to FakeDiscordClient in factories.ts

// Phase 5 fields
postChannelMessageCalls: Array<{ channelId: string; content: string }> = [];
postChannelMessageResponse: string = "mock-discord-msg-id";
postChannelMessageError: Error | null = null;
addReactionCalls: Array<{ channelId: string; messageId: string; emoji: string }> = [];
addReactionError: Error | null = null;
replyToMessageCalls: Array<{ channelId: string; messageId: string; content: string }> = [];
replyToMessageError: Error | null = null;
private channelMessageHandlers = new Map<string, (msg: ChannelMessage) => Promise<void>>();

async postChannelMessage(channelId: string, content: string): Promise<string> {
  this.postChannelMessageCalls.push({ channelId, content });
  if (this.postChannelMessageError) throw this.postChannelMessageError;
  return this.postChannelMessageResponse;
}

onChannelMessage(channelId: string, handler: (msg: ChannelMessage) => Promise<void>): void {
  this.channelMessageHandlers.set(channelId, handler);
}

async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
  this.addReactionCalls.push({ channelId, messageId, emoji });
  if (this.addReactionError) throw this.addReactionError;
}

async replyToMessage(channelId: string, messageId: string, content: string): Promise<void> {
  this.replyToMessageCalls.push({ channelId, messageId, content });
  if (this.replyToMessageError) throw this.replyToMessageError;
}

// Test helper: simulate a message arriving in a channel
async simulateChannelMessage(channelId: string, msg: ChannelMessage): Promise<void> {
  const handler = this.channelMessageHandlers.get(channelId);
  if (handler) await handler(msg);
}
```

#### Factory helpers

```typescript
// tests/fixtures/factories.ts — factory helpers

export function createPendingQuestion(overrides: Partial<PendingQuestion> = {}): PendingQuestion {
  return {
    id: "Q-0001",
    agentId: "pm-agent",
    threadId: "111222333",
    threadName: "auth — define requirements",
    askedAt: new Date("2026-03-11T14:30:00Z"),
    questionText: "Should OAuth use Google or GitHub?",
    answer: null,
    discordMessageId: null,
    ...overrides,
  };
}

export function createChannelMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: "999888777",
    channelId: "open-questions-channel-id",
    authorId: "configured-user-id",
    authorName: "Kane",
    isBot: false,
    content: "Use Google as the primary provider.",
    replyToMessageId: "mock-discord-msg-id",
    timestamp: new Date(),
    ...overrides,
  };
}
```

### 7.3 Test Categories

| Category | File | What Is Tested |
|----------|------|----------------|
| QuestionStore — appendQuestion (atomic ID) | `question-store.test.ts` | Empty files → Q-0001; scanning both pending + resolved for max; zero-padding; file created with header if absent; entry formatted correctly; git commit called; returned question has assigned ID |
| QuestionStore — updateDiscordMessageId | `question-store.test.ts` | Correct row updated; other entries untouched; no-op if question not found |
| QuestionStore — readPendingQuestions | `question-store.test.ts` | Parses valid entries; skips malformed entries (warns, no throw); empty file returns [] |
| QuestionStore — setAnswer | `question-store.test.ts` | Answer written verbatim; entry updated; git commit called |
| QuestionStore — archiveQuestion | `question-store.test.ts` | Entry removed from pending; appended to resolved with Answered timestamp; single git commit; resolved.md created if absent |
| QuestionPoller — lifecycle | `question-poller.test.ts` | Auto-starts on first question; self-stops when empty; stop() clears interval; stop() awaits active tick |
| QuestionPoller — answer detection | `question-poller.test.ts` | onAnswer callback fires for answered questions; unanswered questions remain registered; malformed pending.md logged/skipped |
| PatternBContextBuilder — Layer 3 | `pattern-b-context-builder.test.ts` | Pause summary from last bot message; fallback to thread name; verbatim answer; no thread history in output |
| PatternBContextBuilder — Layer 2 fresh read | `pattern-b-context-builder.test.ts` | Reads from worktreePath; missing feature folder → empty Layer 2, no throw |
| PatternBContextBuilder — resumePattern | `pattern-b-context-builder.test.ts` | Returns ContextBundle with `resumePattern: "pattern_b"` |
| Orchestrator — paused thread guard | `orchestrator.test.ts` | Message for paused thread dropped silently; no Skill invocation; debug log only |
| Orchestrator — ROUTE_TO_USER pipeline | `orchestrator.test.ts` | appendQuestion called; Discord notification posted; pause embed posted; poller registered; pausedThreadIds updated |
| Orchestrator — Discord unavailable during notify | `orchestrator.test.ts` | Warning logged; question still in store; thread still paused; poller still registered |
| Orchestrator — resumeWithPatternB enqueues to ThreadQueue | `orchestrator.test.ts` | Job enqueued to correct threadId queue |
| Orchestrator — startup restart recovery | `orchestrator.test.ts` | Pending questions seeded to poller; pausedThreadIds restored; discordMessageIdMap seeded from both pending.md and resolved.md |
| Orchestrator — shutdown stops poller | `orchestrator.test.ts` | questionPoller.stop() called on shutdown() |
| Orchestrator — Pattern B archive on success | `orchestrator.test.ts` | archiveQuestion called after successful resume and response post |
| Orchestrator — Pattern B no archive on failure | `orchestrator.test.ts` | archiveQuestion NOT called when Skill invocation throws |
| Discord writeback — standard reply | `orchestrator.test.ts` | discordMessageId found in map; getQuestion returns pending question; answer written; reaction added |
| Discord writeback — duplicate reply rejected | `orchestrator.test.ts` | replyToMessage called with "already has an answer"; setAnswer not called |
| Discord writeback — already resolved | `orchestrator.test.ts` | discordMessageId in map; getQuestion returns null (moved to resolved.md); replyToMessage called with "already been resolved" |
| Discord writeback — unrelated bot message ignored | `orchestrator.test.ts` | discordMessageId not in discordMessageIdMap → silently ignored; no store or Discord calls |
| Discord writeback — non-configured user ignored | `orchestrator.test.ts` | Silently ignored; no store or Discord calls |
| Discord writeback — non-reply message ignored | `orchestrator.test.ts` | replyToMessageId is null; silently ignored |
| DiscordJsClient — postChannelMessage | `discord.test.ts` | channel.send() called; message ID returned |
| DiscordJsClient — onChannelMessage filters | `discord.test.ts` | Thread messages ignored; wrong channel ignored; bot messages ignored; handler called for matching message |
| DiscordJsClient — addReaction | `discord.test.ts` | message.react() called with correct emoji |
| DiscordJsClient — replyToMessage | `discord.test.ts` | message.reply() called with correct content |
| Integration: full question pipeline | `question-pipeline.test.ts` | ROUTE_TO_USER → pending.md written → poll detects answer → Pattern B invoked → resolved.md written → git commits verified |

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-DI-07 — @mention in #open-questions | `DiscordClient.postChannelMessage()`, `Orchestrator.handleRouteToUser()` §5.6 | `handleRouteToUser` calls `postChannelMessage` with @mention formatted per §5.7 |
| REQ-RP-02 — Pattern B resume | `PatternBContextBuilder`, `Orchestrator.executePatternBResume()` §5.8 | Bypasses `ContextAssembler.detectResumePattern()`; assembles L1+L2+L3 directly; L2 mandatory re-read from fresh worktree |
| REQ-PQ-01 — Write to pending.md | `QuestionStore.appendQuestion()`, `Orchestrator.handleRouteToUser()` | Called when `ROUTE_TO_USER` is detected; `appendQuestion()` atomically assigns ID and writes; entry written in FSPEC §3.6 format; committed with `[ptah] System:` prefix |
| REQ-PQ-02 — Poll pending.md | `QuestionPoller`, `QuestionStore.readPendingQuestions()` | Background interval (default 30s from `config.orchestrator.pending_poll_seconds`); auto-starts/stops |
| REQ-PQ-03 — Resume on user answer | `Orchestrator.resumeWithPatternB()`, `executePatternBResume()`, `PatternBContextBuilder` | Poller callback → enqueue to ThreadQueue → Pattern B context → Skill invocation → response posted |
| REQ-PQ-04 — Archive to resolved.md | `QuestionStore.archiveQuestion()` called in `executePatternBResume()` after successful resume | PQ-R4: archive happens AFTER response is posted; not on failure |
| REQ-PQ-05 — Discord reply writeback | `DiscordClient.onChannelMessage()`, `DiscordClient.addReaction()`, `DiscordClient.replyToMessage()`, `Orchestrator.handleOpenQuestionReply()` §5.9 | Listener registered in `startup()`; writes answer via `QuestionStore.setAnswer()`; polling loop detects it |

---

## 9. Integration Points

### With Phase 3 (Skill Routing)

- **`RoutingDecision.isPaused`** — the condition that triggers the Phase 5 pipeline. Phase 5 replaces the Phase 3 placeholder (post system message, return) with `handleRouteToUser()`.
- **`ThreadQueue`** — Pattern B resumes are enqueued to the existing per-thread queue, ensuring serialization with any concurrent operations on the same thread (PQ-R11).
- **`ContextBundle.resumePattern`** — extended with `"pattern_b"`; the `SkillInvoker` does not inspect this field (it uses `systemPrompt` and `userMessage` directly), so no changes to `SkillInvoker` are required.
- **`ContextAssembler.detectResumePattern()`** — not called for Pattern B. The `DefaultContextAssembler` is unchanged; `"pattern_b"` never enters its switch chains.

### With Phase 4 (Artifact Commits)

- **`MergeLock`** — the existing `AsyncMutex` instance is shared between `ArtifactCommitter`, `AgentLogWriter`, and `DefaultQuestionStore`. All three serialize main-branch git operations through the same lock.
- **Phase 4 then Phase 5 ordering** — when a Skill produces both artifact changes and `ROUTE_TO_USER`, the artifact commit pipeline runs to completion (within `executeRoutingLoop`) before `handleRouteToUser` is called. This ordering is preserved by the existing code flow (commit pipeline precedes routing signal evaluation).

### With `StartCommand` and `shutdown.ts`

- **`StartResult.cleanup`** — updated in `StartCommand` to call `orchestrator.shutdown()` before `discord.disconnect()`. This ensures the polling loop stops before the Discord connection drops (PQ-R12).
- **`createShutdownHandler`** in `shutdown.ts` — no changes required; it already calls `result.cleanup()` on SIGINT/SIGTERM.

---

## 10. Open Questions

| # | Question | Resolution |
|---|----------|------------|
| OQ-01 | ~~Two simultaneous `ROUTE_TO_USER` signals from different threads could call `nextQuestionId()` concurrently and both compute the same next ID before either's `appendQuestion()` commits.~~ | **Resolved (v1.1 — F-02):** Option C adopted. `nextQuestionId()` removed from the public `QuestionStore` protocol. ID scan and file write are now performed atomically inside a single `MergeLock` acquisition in `appendQuestion()`. The TOCTOU window is eliminated. |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | March 11, 2026 | Backend Engineer | PM review (F-01, F-02) addressed: (F-02) removed `nextQuestionId()` from `QuestionStore` protocol; `appendQuestion()` now atomically assigns ID under `MergeLock`, takes `Omit<PendingQuestion, 'id'>`, returns `Promise<PendingQuestion>`; `readResolvedQuestions()` added. (F-01) added `discordMessageIdMap` to `DefaultOrchestrator`; seeded from both `pending.md` and `resolved.md` on startup; updated in `handleRouteToUser` after `updateDiscordMessageId()`; used in `handleOpenQuestionReply` for three-way distinction (not in map → ignore; in map + pending → proceed; in map + not pending → "already resolved"). OQ-01 closed. |
| 1.0 | March 11, 2026 | Backend Engineer | Initial TSPEC for Phase 5 — 3 new modules, 4 new Discord protocol methods, Pattern B context assembly, ResumePattern extension |
