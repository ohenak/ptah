# Technical Specification: Phase 3 — Skill Routing

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-DI-04], [REQ-DI-05], [REQ-DI-09], [REQ-CB-01]–[REQ-CB-06], [REQ-RP-01], [REQ-RP-03], [REQ-RP-04], [REQ-SI-01]–[REQ-SI-04], [REQ-SI-11], [REQ-SI-12], [REQ-NF-01], [REQ-NF-04], [REQ-NF-07] |
| **Functional Specifications** | [FSPEC-CB-01], [FSPEC-RP-01], [FSPEC-RP-02], [FSPEC-RP-03], [FSPEC-SI-01], [FSPEC-DI-01] — [003-FSPEC-ptah-skill-routing](./003-FSPEC-ptah-skill-routing.md) |
| **Analysis** | N/A — FSPEC contains full behavioral specification; codebase analysis performed inline |
| **Date** | March 9, 2026 |
| **Status** | Draft |

---

## 1. Summary

Phase 3 extends the Discord connection layer (Phase 2) with the core orchestration loop: routing decisions, context assembly, Skill invocation via Claude Code, and response posting. When a message arrives in a Discord thread, the Orchestrator determines which agent to invoke, assembles a three-layer Context Bundle, invokes the agent's Skill as a stateless Claude Code call in an isolated Git worktree, and posts the response back as a colour-coded embed. This completes the full message → response loop for the first time.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Continues Phase 1/2 stack |
| Language | TypeScript 5.x (ESM) | Continues Phase 1/2 stack |
| Discord library | discord.js v14 (`^14.25.1`) | Existing Phase 2 dependency |
| Claude Code SDK | `@anthropic-ai/claude-code` | Claude Code SDK for programmatic Skill invocation. Provides a rich tool set (Edit, Read, Write, Glob, Grep) with `--cwd` scoping to worktree paths. Runs locally — no separate API key management needed. |
| Token counting | Character-based estimation (1 token ≈ 4 chars) | Simple, no external dependency. FSPEC-CB-01 specifies this as the fallback and it is sufficient for Phase 3's budget enforcement. A dedicated tokenizer can be swapped in later via the `TokenCounter` protocol. |
| Test framework | Vitest | Continues Phase 1/2 stack |
| CLI entry point | `bin/ptah.ts` via `tsx` | Existing — updated composition root |

**New dependency for Phase 3:** `@anthropic-ai/claude-code` is added as a runtime dependency. This is the second external runtime dependency (after `discord.js`). Claude Code must be installed and authenticated on the machine.

---

## 3. Project Structure

```
ptah/
├── package.json                              ← UPDATED: add @anthropic-ai/claude-code dependency
├── src/
│   ├── commands/
│   │   ├── init.ts                           ← existing (Phase 1)
│   │   └── start.ts                          ← UPDATED: wire orchestrator into message handler
│   ├── config/
│   │   ├── defaults.ts                       ← UPDATED: add agent colours and role_mentions defaults
│   │   └── loader.ts                         ← UPDATED: validate agents section
│   ├── services/
│   │   ├── filesystem.ts                     ← UPDATED: add readDir(), readFile() path join
│   │   ├── git.ts                            ← UPDATED: add worktree operations to GitClient
│   │   ├── discord.ts                        ← UPDATED: add postEmbed(), createThread(), postSystemMessage()
│   │   ├── logger.ts                         ← existing (Phase 2)
│   │   └── claude-code.ts                    ← NEW: SkillClient protocol + ClaudeCodeClient impl
│   ├── orchestrator/
│   │   ├── orchestrator.ts                   ← NEW: Orchestrator — main message processing loop
│   │   ├── router.ts                         ← NEW: RoutingEngine — routing signal parsing + decision tree
│   │   ├── context-assembler.ts              ← NEW: ContextAssembler — three-layer context bundle
│   │   ├── skill-invoker.ts                  ← NEW: SkillInvoker — worktree + API call + output capture
│   │   ├── response-poster.ts                ← NEW: ResponsePoster — embed posting + thread creation
│   │   ├── thread-queue.ts                   ← NEW: ThreadQueue — per-thread sequential processing
│   │   └── token-counter.ts                  ← NEW: TokenCounter protocol + CharTokenCounter impl
│   ├── shutdown.ts                           ← existing (Phase 2)
│   └── types.ts                              ← UPDATED: add routing, context, embed types
├── bin/
│   └── ptah.ts                               ← UPDATED: wire new services into composition root
└── tests/
    ├── unit/
    │   ├── orchestrator/
    │   │   ├── orchestrator.test.ts           ← NEW
    │   │   ├── router.test.ts                 ← NEW
    │   │   ├── context-assembler.test.ts      ← NEW
    │   │   ├── skill-invoker.test.ts          ← NEW
    │   │   ├── response-poster.test.ts        ← NEW
    │   │   ├── thread-queue.test.ts           ← NEW
    │   │   └── token-counter.test.ts          ← NEW
    │   ├── commands/
    │   │   └── start.test.ts                  ← UPDATED
    │   ├── services/
    │   │   ├── discord.test.ts                ← UPDATED: new method tests
    │   │   └── claude-code.test.ts             ← NEW
    │   └── fixtures/
    │       ├── fake-skill-client.test.ts        ← NEW
    │       └── fake-thread-queue.test.ts       ← NEW
    ├── integration/
    │   └── orchestrator/
    │       └── routing-loop.test.ts            ← NEW: end-to-end routing loop
    └── fixtures/
        └── factories.ts                        ← UPDATED: add new fakes and factories
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/ptah.ts (composition root)
  └── src/commands/start.ts (StartCommand)                    ← UPDATED
        ├── src/config/loader.ts (ConfigLoader)               ← existing
        ├── src/services/discord.ts (DiscordClient)           ← UPDATED
        ├── src/services/logger.ts (Logger)                   ← existing
        └── src/orchestrator/orchestrator.ts (Orchestrator)   ← NEW
              ├── src/orchestrator/router.ts (RoutingEngine)
              │     └── (PtahConfig for agent validation)
              ├── src/orchestrator/context-assembler.ts (ContextAssembler)
              │     ├── src/services/filesystem.ts (FileSystem)
              │     └── src/orchestrator/token-counter.ts (TokenCounter)
              ├── src/orchestrator/skill-invoker.ts (SkillInvoker)
              │     ├── src/services/claude-code.ts (SkillClient)
              │     └── src/services/git.ts (GitClient — worktree ops)
              ├── src/orchestrator/response-poster.ts (ResponsePoster)
              │     └── src/services/discord.ts (DiscordClient)
              └── src/orchestrator/thread-queue.ts (ThreadQueue)
```

### 4.2 Protocols (Interfaces)

#### 4.2.1 DiscordClient Protocol — Extended

```typescript
// src/services/discord.ts — UPDATED

export interface EmbedOptions {
  threadId: string;
  title: string;
  description: string;
  colour: number;
  footer?: string;
}

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

  // --- Phase 3 (new) ---
  postEmbed(options: EmbedOptions): Promise<string>;
  createThread(channelId: string, name: string, initialMessage: EmbedOptions): Promise<string>;
  postSystemMessage(threadId: string, content: string): Promise<void>;
}
```

| Method | Behavior |
|--------|----------|
| `postEmbed(options)` | Posts a colour-coded embed to the specified thread. Returns the posted message ID. If content exceeds Discord's embed description limit (4096 chars), splits into numbered sequential embeds (e.g., "Dev Agent (1/3)"). Retries once on Discord API error. |
| `createThread(channelId, name, initialMessage)` | Creates a new thread in the specified channel with the given name. Posts the initial message as an embed. Returns the new thread ID. Retries once on failure; falls back to posting in parent channel if retry fails. |
| `postSystemMessage(threadId, content)` | Posts a Gray (#9E9E9E) system embed to the specified thread. Used for error messages, routing errors, and turn-limit warnings. |

#### 4.2.2 GitClient Protocol — Extended

```typescript
// src/services/git.ts — UPDATED

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export interface GitClient {
  // --- Phase 1 (existing) ---
  isRepo(): Promise<boolean>;
  hasStagedChanges(): Promise<boolean>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;

  // --- Phase 3 (new) ---
  createWorktree(branch: string, path: string): Promise<void>;
  removeWorktree(path: string): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
  listWorktrees(): Promise<WorktreeInfo[]>;
  pruneWorktrees(branchPrefix: string): Promise<void>;
  diffWorktree(worktreePath: string): Promise<string[]>;
}
```

| Method | Behavior |
|--------|----------|
| `createWorktree(branch, path)` | Runs `git worktree add -b {branch} {path}`. Creates a new worktree at the given path on a new branch. Throws on failure (disk space, Git error). |
| `removeWorktree(path)` | Runs `git worktree remove --force {path}`. Removes the worktree directory. |
| `deleteBranch(branch)` | Runs `git branch -D {branch}`. Deletes the local branch. |
| `listWorktrees()` | Runs `git worktree list --porcelain`. Returns `WorktreeInfo[]` with path and branch for each worktree. |
| `pruneWorktrees(branchPrefix)` | Lists all worktrees, removes any whose branch starts with `branchPrefix`, and deletes their branches. Used on startup for orphan cleanup (SI-R9). |
| `diffWorktree(worktreePath)` | Runs `git diff --name-only HEAD` inside the worktree. Returns an array of changed file paths relative to repo root. Used to detect artifact changes post-invocation. |

#### 4.2.3 FileSystem Protocol — Extended

```typescript
// src/services/filesystem.ts — UPDATED

export interface FileSystem {
  // --- Phase 1/2 (existing) ---
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  cwd(): string;
  basename(path: string): string;

  // --- Phase 3 (new) ---
  readDir(path: string): Promise<string[]>;
  joinPath(...segments: string[]): string;
}
```

| Method | Behavior |
|--------|----------|
| `readDir(path)` | Returns filenames in the directory. Returns empty array if directory does not exist (not an error). |
| `joinPath(...segments)` | Joins path segments using `node:path.join()`. |

#### 4.2.4 SkillClient Protocol — NEW

```typescript
// src/services/claude-code.ts

export interface SkillRequest {
  systemPrompt: string;
  userMessage: string;
  worktreePath: string;
  timeoutMs: number;
  allowedTools?: string[];   // Default: ["Edit", "Read", "Write", "Glob", "Grep"]
}

export interface SkillResponse {
  textContent: string;
}

export interface SkillClient {
  invoke(request: SkillRequest): Promise<SkillResponse>;
}
```

| Method | Behavior |
|--------|----------|
| `invoke(request)` | Invokes Claude Code SDK (`@anthropic-ai/claude-code`) with the given system prompt and user message, using `cwd` set to `worktreePath`. Claude Code handles the full agent loop internally — tool use, file operations, and multi-turn reasoning. Returns the final text content. Tools are restricted via `allowedTools` (default: Edit, Read, Write, Glob, Grep — no Bash to prevent arbitrary command execution). Throws on timeout (>90s per FSPEC-SI-01) or process failure. |

**Implementation: `ClaudeCodeClient`** wraps `@anthropic-ai/claude-code`:

```typescript
import { ClaudeCode } from "@anthropic-ai/claude-code";

class ClaudeCodeClient implements SkillClient {
  async invoke(request: SkillRequest): Promise<SkillResponse> {
    const result = await ClaudeCode.run({
      prompt: request.userMessage,
      systemPrompt: request.systemPrompt,
      cwd: request.worktreePath,
      allowedTools: request.allowedTools ?? ["Edit", "Read", "Write", "Glob", "Grep"],
      maxTurnMs: request.timeoutMs,
    });
    return { textContent: result.text };
  }
}
```

Key differences from a raw API approach:
- **No custom tool definitions needed.** Claude Code provides Edit, Read, Write, Glob, Grep out of the box — far richer than raw `read_file`/`write_file`.
- **No tool-use loop management.** Claude Code handles the agent loop internally.
- **`cwd` scoping.** Claude Code operates within `worktreePath` naturally — the Skill's file operations are scoped to the worktree.
- **Auth handled by Claude Code.** No `ANTHROPIC_API_KEY` management in Ptah — Claude Code uses its own authentication.

#### 4.2.5 TokenCounter Protocol — NEW

```typescript
// src/orchestrator/token-counter.ts

export interface TokenCounter {
  count(text: string): number;
}
```

| Method | Behavior |
|--------|----------|
| `count(text)` | Returns the estimated token count for the given text. |

**Implementation: `CharTokenCounter`** — estimates tokens as `Math.ceil(text.length / 4)` per FSPEC-CB-01 fallback rule. This is a protocol so a proper tokenizer (e.g., `tiktoken`) can be swapped in later.

#### 4.2.6 RoutingEngine Protocol — NEW

```typescript
// src/orchestrator/router.ts

export type RoutingSignalType =
  | "ROUTE_TO_AGENT"
  | "ROUTE_TO_USER"
  | "LGTM"
  | "TASK_COMPLETE";

export type ThreadAction = "reply" | "new_thread";

export interface RoutingSignal {
  type: RoutingSignalType;
  agentId?: string;          // Required for ROUTE_TO_AGENT
  question?: string;         // Required for ROUTE_TO_USER
  threadAction?: ThreadAction; // Only for ROUTE_TO_AGENT, default: "reply"
}

export interface RoutingDecision {
  signal: RoutingSignal;
  targetAgentId: string | null;  // null for terminal signals (LGTM, TASK_COMPLETE)
  isTerminal: boolean;
  isPaused: boolean;             // true for ROUTE_TO_USER
  createNewThread: boolean;
}

export interface RoutingEngine {
  parseSignal(skillResponseText: string): RoutingSignal;
  resolveHumanMessage(message: ThreadMessage, config: PtahConfig): string | null;
  decide(signal: RoutingSignal, config: PtahConfig): RoutingDecision;
}
```

| Method | Behavior |
|--------|----------|
| `parseSignal(text)` | Parses the routing signal from a Skill response text. Expects a JSON block delimited by `<routing>...</routing>` tags. Throws `RoutingParseError` if missing, malformed, or multiple signals. If multiple signals found, uses first and logs a warning (FSPEC-RP-01 §4.5). |
| `resolveHumanMessage(message, config)` | Extracts agent ID from Discord @mention role IDs in the message content. Maps role IDs to agent IDs via `config.discord.role_mentions`. Returns agent ID or `null` if no mention detected. |
| `decide(signal, config)` | Validates the signal (e.g., agent exists in `config.agents.active`). Returns a `RoutingDecision`. Throws `RoutingError` for unknown agents. |

**Routing Signal Format** (serialization decision per FSPEC-RP-01 §4.4):

```xml
<routing>
{"type": "ROUTE_TO_AGENT", "agent_id": "dev-agent", "thread_action": "reply"}
</routing>
```

The `<routing>` tag is chosen because:
- Unambiguous — one tag per response, machine-parseable
- Easy to detect with regex: `/<routing>([\s\S]*?)<\/routing>/`
- Does not conflict with Markdown content the Skill may produce
- Skills are instructed to include this block in their system prompt

#### 4.2.7 ContextAssembler Protocol — NEW

```typescript
// src/orchestrator/context-assembler.ts

export type ResumePattern = "fresh" | "pattern_a" | "pattern_c";

export interface ContextBundle {
  systemPrompt: string;    // Layer 1: role prompt + overview + two-iteration rule
  userMessage: string;     // Layer 2 (feature docs) + Layer 3 (trigger/resume)
  agentId: string;
  threadId: string;
  featureName: string;
  resumePattern: ResumePattern;
  turnNumber: number;      // 0 for fresh and Pattern A (non-review), 1-4 for Pattern C review turns
  tokenCounts: {
    layer1: number;
    layer2: number;
    layer3: number;
    total: number;
  };
}

export interface PatternAContext {
  taskReminder: string;
  question: string;
  answer: string;
}

export interface PatternCContext {
  priorTurns: string[];    // Up to 3 prior turns verbatim
  currentTurn: string;
  turnNumber: number;
  injectFinalReview: boolean;
}

export interface ContextAssembler {
  assemble(params: {
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
  }): Promise<ContextBundle>;
}
```

| Method | Behavior |
|--------|----------|
| `assemble(params)` | Assembles a three-layer Context Bundle per FSPEC-CB-01. Determines resume pattern from thread history, reads Layer 1 files (role prompt + overview), reads Layer 2 files (fresh from `docs/{feature}/`), assembles Layer 3 based on pattern, enforces token budget, and returns the bundle. |

**Assembly Algorithm** (implements FSPEC-CB-01 §3.2):

```
1. Extract feature name from threadName (text before " — ", or full name if no em dash)
2. Determine resume pattern:
   a. Count agent-authored turns (embeds) in thread history
   b. If zero prior agent turns → "fresh"
   c. Check for Pattern A (agent-to-agent Q&A):
      i.   Parse the routing signal from the most recent agent embed in history
      ii.  If that signal is ROUTE_TO_AGENT targeting Agent X, AND Agent X is
           NOT the same agent that posted the most recent embed (i.e., the
           route goes back to a *different* agent that previously asked a
           question) → "pattern_a"
      iii. The "asking agent" is Agent X (the target). The "answering agent"
           is the agent that posted the most recent embed.
      iv.  Layer 3 will contain: task reminder (first message in thread as
           fallback per RPA-R3), Agent X's question (consecutive messages
           from Agent X before the answer), and the answering agent's
           response verbatim.
   d. Otherwise → "pattern_c" (review loop)

3. Assemble Layer 1 (system prompt):
   a. Read role prompt from config.agents.skills[agentId] via FileSystem
   b. Read docs/overview.md via FileSystem (warn if missing, proceed without)
   c. Append two-iteration rule verbatim:
      "On your second review of any artifact you must either approve (LGTM)
       or escalate unresolved concerns to the user. You may not request a
       third review pass."
   d. Append routing signal format instruction

4. Assemble Layer 2 (feature docs):
   a. Resolve feature folder: docs/{featureName}/
   b. Read all files from feature folder (fresh from filesystem)
   c. Exclude docs/overview.md (already in Layer 1 — CB-R4)
   d. If folder missing → Layer 2 is empty, log warning
   e. If folder empty → Layer 2 is empty

5. Assemble Layer 3 (trigger):
   a. Fresh: triggerMessage.content verbatim
   b. Pattern A:
      - Task reminder: first message in thread (RPA-R3 fallback)
      - Question: consecutive messages from asking agent, concatenated
      - Answer: answering agent's response verbatim
   c. Pattern C:
      - All prior agent turns verbatim (max 3)
      - Current trigger turn verbatim
      - If turnNumber === 3: inject final-review instruction (RPC-R2)
      - Human messages between turns are included as context

6. Enforce token budget (FSPEC-CB-01 §3.2, step 6):
   a. Budget = config.agents.max_tokens
   b. Layer 1 allocation: 15% of budget
   c. Layer 3 allocation: 10% of budget
   d. Thread context allocation: 15% of budget
   e. Layer 2 allocation: 45% of budget
   f. Response headroom: 15% of budget
   g. Layer 1 and Layer 3 are NEVER truncated (CB-R1)
   h. If Layer 2 exceeds allocation:
      - Rank files by relevance (file being worked on > related > supporting)
      - Truncate from least-relevant files first
      - Within a file, truncate from end (preserve headers)
   i. If Layer 1 + Layer 3 alone exceed 85%: omit Layer 2, log warning

7. Compose final bundle:
   a. systemPrompt = Layer 1
   b. userMessage = Layer 2 + Layer 3 (with clear section markers)
   c. Return ContextBundle
```

#### 4.2.8 SkillInvoker Protocol — NEW

```typescript
// src/orchestrator/skill-invoker.ts

export interface InvocationResult {
  textResponse: string;
  routingSignalRaw: string;    // Raw text containing the routing signal
  artifactChanges: string[];   // Changed file paths in /docs
  worktreePath: string;
  branch: string;
  durationMs: number;
}

export interface SkillInvoker {
  invoke(bundle: ContextBundle, config: PtahConfig): Promise<InvocationResult>;
  pruneOrphanedWorktrees(): Promise<void>;
}
```

| Method | Behavior |
|--------|----------|
| `invoke(bundle, config)` | Creates a worktree, invokes the Skill via SkillClient (Claude Code), captures output, detects artifact changes, cleans up worktree, returns result. Throws `InvocationTimeoutError` if >90s. Throws `InvocationError` on invocation failure. Always cleans up worktree (success, timeout, or error). |
| `pruneOrphanedWorktrees()` | Calls `gitClient.pruneWorktrees("ptah/")` to clean up orphaned worktrees from crashes (SI-R9). Called on startup. |

**Invocation Algorithm** (implements FSPEC-SI-01):

```
1. Generate invocation ID (8-char hex from crypto.randomUUID())
2. Compose branch name: ptah/{agentId}/{threadId}/{invocationId}
3. Compose worktree path: {os.tmpdir()}/ptah-worktrees/{invocationId}
4. Create worktree: gitClient.createWorktree(branch, worktreePath)
5. Start timer
6. Call skillClient.invoke({
     systemPrompt: bundle.systemPrompt,
     userMessage: bundle.userMessage,
     worktreePath: worktreePath,
     timeoutMs: 90_000
   })
7. Capture response: textContent (includes routing signal)
8. Detect artifact changes: gitClient.diffWorktree(worktreePath)
9. Filter to /docs changes only. Warn on non-/docs changes.
10. Cleanup: removeWorktree + deleteBranch (Phase 3 discards artifacts — SI-R8)
11. Return InvocationResult
```

**Cleanup is guaranteed** via try/finally — worktree removal runs on success, timeout, and error.

#### 4.2.9 ResponsePoster Protocol — NEW

```typescript
// src/orchestrator/response-poster.ts

export interface PostResult {
  messageId: string;
  threadId: string;
  newThreadCreated: boolean;
}

export interface ResponsePoster {
  postAgentResponse(params: {
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }): Promise<PostResult>;

  postCompletionEmbed(threadId: string, agentId: string, config: PtahConfig): Promise<void>;
  postErrorEmbed(threadId: string, errorMessage: string): Promise<void>;

  createCoordinationThread(params: {
    channelId: string;
    featureName: string;
    description: string;
    agentId: string;
    initialText: string;
    config: PtahConfig;
  }): Promise<string>;
}
```

| Method | Behavior |
|--------|----------|
| `postAgentResponse(...)` | Posts the Skill response as a colour-coded embed. Colour determined by `agentId` → colour mapping. Splits long responses into numbered parts. |
| `postCompletionEmbed(...)` | Posts a completion embed (Green #1B5E20) for LGTM/TASK_COMPLETE terminal signals. |
| `postErrorEmbed(...)` | Posts a Gray error embed with the error message. |
| `createCoordinationThread(...)` | Creates a new thread named `{feature} — {description}` and posts the initial embed. Returns new thread ID. |

**Agent Colour Mapping** (per FSPEC-DI-01):

```typescript
const AGENT_COLOURS: Record<string, number> = {
  "pm-agent":       0x1F4E79,  // Blue
  "dev-agent":      0xE65100,  // Amber
  "frontend-agent": 0x6A1B9A,  // Purple
  "test-agent":     0x1B5E20,  // Green
};
const SYSTEM_COLOUR = 0x9E9E9E;    // Gray
const DEFAULT_COLOUR = 0x757575;    // Medium Gray (unknown agents)
```

Agent names displayed in embeds are derived from the agent ID: `"dev-agent"` → `"Dev Agent"` (split on `-`, title-case each word).

#### 4.2.10 ThreadQueue Protocol — NEW

```typescript
// src/orchestrator/thread-queue.ts

export interface ThreadQueue {
  enqueue(threadId: string, task: () => Promise<void>): void;
  isProcessing(threadId: string): boolean;
}
```

| Method | Behavior |
|--------|----------|
| `enqueue(threadId, task)` | Adds a task to the per-thread queue. If no task is currently processing for this thread, starts immediately. If a task is in-flight, queues for sequential processing. Tasks for different threads run concurrently. |
| `isProcessing(threadId)` | Returns true if a task is currently in-flight or queued for this thread. |

**Implementation: `InMemoryThreadQueue`** — maintains a `Map<string, Array<() => Promise<void>>>` of per-thread queues and a `Set<string>` of currently-processing threads. When a task completes, the next queued task for that thread (if any) is dequeued and started. This is in-memory only — queued tasks are lost on crash (RP-R7). On reconnect, `readThreadHistory` re-discovers unprocessed messages.

#### 4.2.11 Orchestrator — NEW

```typescript
// src/orchestrator/orchestrator.ts

export interface Orchestrator {
  handleMessage(message: ThreadMessage): Promise<void>;
  startup(): Promise<void>;
}
```

| Method | Behavior |
|--------|----------|
| `handleMessage(message)` | Entry point for all incoming thread messages. Enqueues the message for per-thread sequential processing. The processing pipeline: classify → route → assemble context → invoke skill → post response → route next (loop). |
| `startup()` | Called on startup before accepting messages. Prunes orphaned worktrees (SI-R9). Resolves debug channel ID for error logging. |

**Message Processing Algorithm** (implements FSPEC-RP-01 + end-to-end flow):

```
1. CLASSIFY MESSAGE
   a. message.isBot === true → IGNORE (RP-R6)
   b. Is this a human message? → resolveHumanMessage() to find target agent
      - If no @mention detected → postSystemMessage("Please specify target
        agent via @mention") → STOP
      - If @mention found → proceed with agent ID
   c. Is this a Skill response (embed from us)? → parseSignal() for routing
      - Note: Phase 2 filters bot messages in onThreadMessage, so Skill
        responses arrive via the routing loop, not as raw message events.
        The Orchestrator itself drives the loop after posting a response.

2. READ THREAD HISTORY
   a. discord.readThreadHistory(message.threadId)

3. ASSEMBLE CONTEXT BUNDLE
   a. contextAssembler.assemble({agentId, threadId, threadName, history, trigger, config})

4. INVOKE SKILL
   a. skillInvoker.invoke(bundle, config)
   b. On timeout → postErrorEmbed → STOP
   c. On API error → postErrorEmbed → STOP

5. POST RESPONSE
   a. responsePoster.postAgentResponse({threadId, agentId, text, config})

6. PARSE ROUTING SIGNAL from Skill response
   a. router.parseSignal(result.textResponse)
   b. On parse failure → postErrorEmbed("Routing error: {details}") → STOP
   c. router.decide(signal, config)

7. HANDLE ROUTING DECISION
   a. ROUTE_TO_AGENT with reply → Loop back to step 2 with new agentId
   b. ROUTE_TO_AGENT with new_thread →
      - Create new thread via responsePoster.createCoordinationThread()
      - Enqueue processing for the new thread
   c. ROUTE_TO_USER → postSystemMessage with question → STOP (Phase 5 handles)
   d. LGTM → postCompletionEmbed → STOP
   e. TASK_COMPLETE → postCompletionEmbed → STOP
```

### 4.3 Types — Updated

```typescript
// src/types.ts — UPDATED

// --- Existing (Phase 1/2) ---
export interface InitResult { /* ... */ }
export interface DiscordConfig { /* ... */ }
export interface PtahConfig { /* ... updated — see §4.4 */ }
export interface ThreadMessage { /* ... */ }
export interface StartResult { /* ... */ }

// --- Phase 3 (new) ---

export interface AgentConfig {
  active: string[];
  skills: Record<string, string>;
  model: string;
  max_tokens: number;
  colours?: Record<string, string>;          // NEW: agent embed colours (hex)
  role_mentions?: Record<string, string>;    // NEW: agent → Discord role ID mapping
}

// Token budget configuration (configurable per CB-R5)
export interface TokenBudgetConfig {
  layer1_pct: number;    // Default: 0.15
  layer2_pct: number;    // Default: 0.45
  layer3_pct: number;    // Default: 0.10
  thread_pct: number;    // Default: 0.15
  headroom_pct: number;  // Default: 0.15
}
```

### 4.4 PtahConfig Extension

The `PtahConfig` type is extended with optional Phase 3 fields. Existing Phase 2 configs remain valid — new fields have defaults.

```typescript
// src/types.ts — PtahConfig additions

export interface PtahConfig {
  // ... existing fields ...
  agents: {
    active: string[];
    skills: Record<string, string>;
    model: string;
    max_tokens: number;
    colours?: Record<string, string>;         // NEW optional
    role_mentions?: Record<string, string>;   // NEW optional
  };
  orchestrator: {
    max_turns_per_thread: number;
    pending_poll_seconds: number;
    retry_attempts: number;
    token_budget?: TokenBudgetConfig;         // NEW optional — defaults per §4.2.7
  };
}
```

**Defaults** (applied in config loader when fields are absent):

| Field | Default |
|-------|---------|
| `agents.colours` | `{ "pm-agent": "#1F4E79", "dev-agent": "#E65100", "frontend-agent": "#6A1B9A", "test-agent": "#1B5E20" }` |
| `agents.role_mentions` | `{}` (empty — must be configured by user) |
| `orchestrator.token_budget` | `{ layer1_pct: 0.15, layer2_pct: 0.45, layer3_pct: 0.10, thread_pct: 0.15, headroom_pct: 0.15 }` |

### 4.5 Composition Root — Updated

```typescript
// bin/ptah.ts — start subcommand wiring (Phase 3)

const logger = new ConsoleLogger();
const fs = new NodeFileSystem();
const configLoader = new NodeConfigLoader(fs);
const discord = new DiscordJsClient(logger);
const gitClient = new NodeGitClient();
const skillClient = new ClaudeCodeClient();
const tokenCounter = new CharTokenCounter();
const threadQueue = new InMemoryThreadQueue();

const router = new DefaultRoutingEngine();
const contextAssembler = new DefaultContextAssembler(fs, tokenCounter, logger);
const skillInvoker = new DefaultSkillInvoker(skillClient, gitClient, logger);
const responsePoster = new DefaultResponsePoster(discord, logger);

const orchestrator = new DefaultOrchestrator(
  router,
  contextAssembler,
  skillInvoker,
  responsePoster,
  threadQueue,
  discord,
  logger,
);

const command = new StartCommand(configLoader, discord, logger, orchestrator);
```

---

## 5. Routing Signal Serialization

The routing signal is a JSON object wrapped in `<routing>` XML tags, embedded in the Skill's text response:

```
Here is my review of the requirements document...

<routing>
{"type": "ROUTE_TO_AGENT", "agent_id": "dev-agent", "thread_action": "reply"}
</routing>
```

### 5.1 Signal Schema

```typescript
interface RoutingSignalPayload {
  type: "ROUTE_TO_AGENT" | "ROUTE_TO_USER" | "LGTM" | "TASK_COMPLETE";
  agent_id?: string;          // Required when type === "ROUTE_TO_AGENT"
  thread_action?: "reply" | "new_thread";  // Only for ROUTE_TO_AGENT, default "reply"
  question?: string;          // Required when type === "ROUTE_TO_USER"
}
```

### 5.2 Parsing Rules

1. Scan response text for `<routing>` tags using regex: `/<routing>([\s\S]*?)<\/routing>/g`
2. If zero matches → throw `RoutingParseError("missing routing signal")`
3. If multiple matches → use first, log warning about duplicate, **and post error embed** (AT-RP-10)
4. Parse inner JSON with `JSON.parse()`
5. Validate required fields by type:
   - `ROUTE_TO_AGENT` requires `agent_id` (non-empty string)
   - `ROUTE_TO_USER` requires `question` (non-empty string)
   - `LGTM` and `TASK_COMPLETE` require no additional fields
6. If JSON parse fails or validation fails → throw `RoutingParseError` with details

### 5.3 Skill Prompt Instruction

Every Skill system prompt includes this instruction block:

```
## Routing Signal

You MUST include exactly one routing signal at the end of every response using this format:

<routing>
{"type": "ROUTE_TO_AGENT", "agent_id": "{agent-id}", "thread_action": "reply"}
</routing>

Valid signal types:
- ROUTE_TO_AGENT: Route to the specified agent. Include "thread_action": "new_thread" to start a new coordination thread.
- ROUTE_TO_USER: Pause and ask the user a question. Include "question": "your question here".
- LGTM: Approve the current artifact. Review is complete.
- TASK_COMPLETE: The assigned task is finished.
```

---

## 6. Error Handling

| Scenario | Behavior | Exit Code |
|----------|----------|-----------|
| Claude Code not available | `logger.error("Claude Code is not installed or not authenticated. Run 'claude' to verify.")` | 1 |
| Claude Code rate limit / API error | Post error embed to thread: "Skill invocation failed: {error}". Log to debug channel. No retry in Phase 3. | — |
| Skill invocation timeout (>90s) | Terminate invocation. Post error embed: "Skill invocation timed out (>90s)". Cleanup worktree. | — |
| Routing signal missing | Post error embed: "Routing error: missing routing signal". Log. Do not invoke any agent. | — |
| Routing signal malformed | Post error embed: "Routing error: {parse details}". Log. Do not invoke any agent. | — |
| Routing signal references unknown agent | Post error embed: "Routing error: unknown agent '{id}'". Log. Do not invoke any agent. | — |
| Multiple routing signals | Use first signal. Log warning about duplicate. Post error embed. | — |
| Empty Skill response (no text, no signal) | Post error embed: "Routing error: missing routing signal". Log. | — |
| Role prompt file not found | Post error embed: "Agent '{id}' role prompt not found at {path}". Do not invoke Skill. | — |
| Worktree creation failure | Post error embed: "Worktree creation failed: {error}". Do not invoke Skill. Log. | — |
| Filesystem read failure for Layer 2 | Post error embed. Do not invoke Skill. Log. | — |
| Token counting failure | Fall back to char-based estimation (1 token ≈ 4 chars). Log warning. Proceed. | — |
| Discord embed post failure | Retry once. If retry fails, log to debug channel. Routing signal still processed. | — |
| Discord thread creation failure | Retry once. If retry fails, post in parent channel as fallback. Log. | — |
| Discord API rate limit on post | Retry once after `retry_after` duration from the rate limit response. If retry also fails, log warning and skip. No persistent queue — simple retry-with-delay. | — |
| Human message with no @mention | Post system message: "Please specify the target agent using @mention". | — |
| Skill modifies files outside /docs | Ignore non-/docs changes. Log warning. Allow invocation to proceed. | — |
| Skill modifies Layer 1 files (overview.md) | Log warning. Allow the change (captured in worktree, discarded in Phase 3). | — |

---

## 7. Test Strategy

### 7.1 Approach

Follows Phase 1/2 conventions: protocol-based DI with fake test doubles for unit tests. No `@anthropic-ai/claude-code` or `discord.js` dependencies in unit tests. All new modules depend on protocols only.

### 7.2 Test Doubles — New

```typescript
// tests/fixtures/factories.ts — NEW additions

class FakeSkillClient implements SkillClient {
  responses: SkillResponse[] = [];
  invokeError: Error | null = null;
  invocations: SkillRequest[] = [];
  private callIndex = 0;

  async invoke(request: SkillRequest): Promise<SkillResponse> {
    this.invocations.push(request);
    if (this.invokeError) throw this.invokeError;
    if (this.callIndex >= this.responses.length) {
      throw new Error("FakeSkillClient: no more responses configured");
    }
    return this.responses[this.callIndex++];
  }
}

class FakeRoutingEngine implements RoutingEngine {
  parseResults: RoutingSignal[] = [];        // Sequential results for multi-turn tests
  parseError: Error | null = null;
  resolveHumanResult: string | null = null;
  decideResults: RoutingDecision[] = [];     // Sequential results for multi-turn tests
  parseCalls: string[] = [];
  resolveHumanCalls: Array<{ message: ThreadMessage; config: PtahConfig }> = [];
  decideCalls: Array<{ signal: RoutingSignal; config: PtahConfig }> = [];
  private parseIndex = 0;
  private decideIndex = 0;

  parseSignal(text: string): RoutingSignal {
    this.parseCalls.push(text);
    if (this.parseError) throw this.parseError;
    if (this.parseIndex >= this.parseResults.length) {
      throw new Error("FakeRoutingEngine: no more parse results configured");
    }
    return this.parseResults[this.parseIndex++];
  }

  resolveHumanMessage(message: ThreadMessage, config: PtahConfig): string | null {
    this.resolveHumanCalls.push({ message, config });
    return this.resolveHumanResult;
  }

  decide(signal: RoutingSignal, config: PtahConfig): RoutingDecision {
    this.decideCalls.push({ signal, config });
    if (this.decideIndex >= this.decideResults.length) {
      throw new Error("FakeRoutingEngine: no more decide results configured");
    }
    return this.decideResults[this.decideIndex++];
  }
}

class FakeContextAssembler implements ContextAssembler {
  result: ContextBundle | null = null;
  assembleError: Error | null = null;
  assembleCalls: Array<{
    agentId: string; threadId: string; threadName: string;
    threadHistory: ThreadMessage[]; triggerMessage: ThreadMessage;
    config: PtahConfig;
  }> = [];

  async assemble(params: {
    agentId: string; threadId: string; threadName: string;
    threadHistory: ThreadMessage[]; triggerMessage: ThreadMessage;
    config: PtahConfig;
  }): Promise<ContextBundle> {
    this.assembleCalls.push(params);
    if (this.assembleError) throw this.assembleError;
    if (!this.result) throw new Error("FakeContextAssembler: no result configured");
    return this.result;
  }
}

class FakeSkillInvoker implements SkillInvoker {
  results: InvocationResult[] = [];          // Sequential results for multi-turn tests
  invokeError: Error | null = null;
  pruned = false;
  invokeCalls: Array<{ bundle: ContextBundle; config: PtahConfig }> = [];
  private callIndex = 0;

  async invoke(bundle: ContextBundle, config: PtahConfig): Promise<InvocationResult> {
    this.invokeCalls.push({ bundle, config });
    if (this.invokeError) throw this.invokeError;
    if (this.callIndex >= this.results.length) {
      throw new Error("FakeSkillInvoker: no more results configured");
    }
    return this.results[this.callIndex++];
  }

  async pruneOrphanedWorktrees(): Promise<void> {
    this.pruned = true;
  }
}

class FakeResponsePoster implements ResponsePoster {
  postedEmbeds: Array<{
    threadId: string; agentId: string; text: string;
    config: PtahConfig; footer?: string;
  }> = [];
  postedErrors: Array<{ threadId: string; errorMessage: string }> = [];
  completionEmbeds: Array<{ threadId: string; agentId: string }> = [];
  createdThreads: Array<{ channelId: string; featureName: string }> = [];

  async postAgentResponse(params: {
    threadId: string; agentId: string; text: string;
    config: PtahConfig; footer?: string;
  }): Promise<PostResult> {
    this.postedEmbeds.push(params);
    return { messageId: "embed-1", threadId: params.threadId, newThreadCreated: false };
  }

  async postCompletionEmbed(threadId: string, agentId: string): Promise<void> {
    this.completionEmbeds.push({ threadId, agentId });
  }

  async postErrorEmbed(threadId: string, errorMessage: string): Promise<void> {
    this.postedErrors.push({ threadId, errorMessage });
  }

  async createCoordinationThread(params: { /* ... */ }): Promise<string> {
    this.createdThreads.push({ channelId: params.channelId, featureName: params.featureName });
    return "new-thread-id";
  }
}

class FakeTokenCounter implements TokenCounter {
  fixedCount: number | null = null;

  count(text: string): number {
    if (this.fixedCount !== null) return this.fixedCount;
    return Math.ceil(text.length / 4);
  }
}

class InMemoryThreadQueue implements ThreadQueue {
  /* production implementation is also the test implementation —
     in-memory by design (RP-R7) */
}

// Extended FakeGitClient with worktree operations
// Add to existing FakeGitClient:
//   worktrees: WorktreeInfo[] = [];
//   createWorktreeError: Error | null = null;
//   diffResult: string[] = [];
//   prunedPrefix: string | null = null;
```

### 7.3 Test Categories

| Category | What is tested | Test file |
|----------|---------------|-----------|
| **Routing — signal parsing** | Parse valid signals, missing signal, malformed JSON, multiple signals, empty response | `tests/unit/orchestrator/router.test.ts` |
| **Routing — human message** | @mention detection, no mention, unknown role ID | `tests/unit/orchestrator/router.test.ts` |
| **Routing — decision** | ROUTE_TO_AGENT, ROUTE_TO_USER, LGTM, TASK_COMPLETE, unknown agent, self-routing | `tests/unit/orchestrator/router.test.ts` |
| **Context — fresh invocation** | Three-layer assembly, feature extraction, Layer 2 fresh read | `tests/unit/orchestrator/context-assembler.test.ts` |
| **Context — Pattern A** | Task reminder + Q/A verbatim, multi-message question, fallback to first message | `tests/unit/orchestrator/context-assembler.test.ts` |
| **Context — Pattern C** | All prior turns verbatim, Turn 3 final-review injection, turn counting excludes humans | `tests/unit/orchestrator/context-assembler.test.ts` |
| **Context — token budget** | L1/L3 never truncated, L2 truncation by relevance, L2 omitted when L1+L3 exceed 85% | `tests/unit/orchestrator/context-assembler.test.ts` |
| **Context — deduplication** | overview.md appears in Layer 1 only, never duplicated in Layer 2 (CB-R4) | `tests/unit/orchestrator/context-assembler.test.ts` |
| **Context — edge cases** | Missing feature folder, missing overview.md, ambiguous thread name, no em dash | `tests/unit/orchestrator/context-assembler.test.ts` |
| **Skill invoker — happy path** | Worktree created, API called, artifacts detected, worktree cleaned up | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **Skill invoker — timeout** | Invocation exceeds 90s, worktree cleaned up, error thrown | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **Skill invoker — API error** | Rate limit, general error, worktree cleaned up | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **Skill invoker — worktree failure** | Worktree creation fails, Skill not invoked | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **Skill invoker — artifact filtering** | Only /docs changes tracked, non-/docs changes warned | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **Skill invoker — branch naming** | Branch follows `ptah/{agent}/{thread}/{id}` convention | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **Skill invoker — startup prune** | Orphaned worktrees with `ptah/` prefix cleaned on startup | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **Response poster — colour mapping** | Correct colour per agent, system Grey, unknown default | `tests/unit/orchestrator/response-poster.test.ts` |
| **Response poster — long response split** | Responses >4096 chars split into numbered embeds | `tests/unit/orchestrator/response-poster.test.ts` |
| **Response poster — empty text** | Minimal embed with "No response text" | `tests/unit/orchestrator/response-poster.test.ts` |
| **Response poster — thread creation** | New thread created with naming convention | `tests/unit/orchestrator/response-poster.test.ts` |
| **Response poster — error/completion** | Error embeds Gray, completion embeds posted | `tests/unit/orchestrator/response-poster.test.ts` |
| **Thread queue — sequential** | Same-thread tasks sequential, different-thread tasks concurrent | `tests/unit/orchestrator/thread-queue.test.ts` |
| **Thread queue — error isolation** | Failed task does not block next queued task | `tests/unit/orchestrator/thread-queue.test.ts` |
| **Token counter** | Character-based estimation accuracy | `tests/unit/orchestrator/token-counter.test.ts` |
| **Orchestrator — full loop** | Human message → route → assemble → invoke → post → route next | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — bot ignore** | Bot messages ignored, no routing triggered | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — LGTM terminal** | LGTM signal → completion embed → no further routing | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — ROUTE_TO_USER** | Thread paused, system message posted | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — new thread** | ROUTE_TO_AGENT + new_thread → thread created, processing enqueued | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — routing error** | Missing signal → error embed, no agent invoked | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — concurrent threads** | Two threads process concurrently via ThreadQueue | `tests/unit/orchestrator/orchestrator.test.ts` |
| **SkillClient — Claude Code wrapper** | Invocation, timeout, error handling | `tests/unit/services/claude-code.test.ts` |
| **DiscordClient — new methods** | postEmbed, createThread, postSystemMessage, embed splitting | `tests/unit/services/discord.test.ts` |
| **GitClient — worktree ops** | createWorktree, removeWorktree, deleteBranch, listWorktrees, pruneWorktrees, diffWorktree | `tests/unit/services/git.test.ts` |
| **Integration — routing loop** | End-to-end: message → route → context → invoke → post → route, using fakes for Discord/SkillClient | `tests/integration/orchestrator/routing-loop.test.ts` |

### 7.4 DiscordJsClient Stub Extensions

The existing `createStubMessage()` factory is extended with fields for embed detection:

```typescript
// tests/fixtures/factories.ts — extended

interface StubMessageOptions {
  // ... existing fields ...
  embeds?: Array<{ description?: string; color?: number }>;
  mentions?: { roles: Map<string, unknown> };
}
```

### 7.5 FakeDiscordClient Extensions

```typescript
// tests/fixtures/factories.ts — FakeDiscordClient extended

class FakeDiscordClient implements DiscordClient {
  // ... existing Phase 2 fields ...

  // Phase 3 additions:
  postedEmbeds: EmbedOptions[] = [];
  createdThreads: Array<{ channelId: string; name: string }> = [];
  systemMessages: Array<{ threadId: string; content: string }> = [];
  postEmbedError: Error | null = null;
  createThreadError: Error | null = null;

  async postEmbed(options: EmbedOptions): Promise<string> {
    if (this.postEmbedError) throw this.postEmbedError;
    this.postedEmbeds.push(options);
    return `embed-${this.postedEmbeds.length}`;
  }

  async createThread(channelId: string, name: string, initial: EmbedOptions): Promise<string> {
    if (this.createThreadError) throw this.createThreadError;
    this.createdThreads.push({ channelId, name });
    return `thread-${this.createdThreads.length}`;
  }

  async postSystemMessage(threadId: string, content: string): Promise<void> {
    this.systemMessages.push({ threadId, content });
  }
}
```

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-DI-04 | `ResponsePoster`, `DiscordClient.postEmbed()`, agent colour mapping | Skill responses posted as colour-coded embeds. Colour determined by agent ID. Long responses split into numbered parts. |
| REQ-DI-05 | `ResponsePoster.createCoordinationThread()`, `DiscordClient.createThread()` | New threads created when routing signal has `thread_action: "new_thread"`. Thread name follows `{feature} — {description}` convention. |
| REQ-DI-09 | `RoutingEngine.parseSignal()`, `RoutingEngine.decide()` | Routing determined solely from `<routing>` signal in Skill response. No fallback heuristics. Missing/malformed signals are errors. |
| REQ-CB-01 | `ContextAssembler.assemble()` | Three-layer Context Bundle: Layer 1 (role prompt + overview), Layer 2 (feature docs fresh), Layer 3 (trigger/resume context). |
| REQ-CB-02 | `ContextAssembler` budget enforcement logic | Layer 1 and Layer 3 are never truncated. Only Layer 2 is subject to truncation under budget pressure. |
| REQ-CB-03 | `ContextAssembler` Layer 2 reads via `FileSystem.readFile()` | Files read fresh from filesystem at invocation time. Never cached or reconstructed from thread history. |
| REQ-CB-04 | `ContextAssembler` feature folder resolution | Layer 2 scoped to `docs/{feature}/` only. Feature name extracted from thread name. Other feature folders excluded. |
| REQ-CB-05 | `ContextAssembler`, `TokenCounter`, `TokenBudgetConfig` | Configurable token budget with default allocations (15/45/10/15/15). Layer 2 truncated from least-relevant files first. |
| REQ-CB-06 | `ContextAssembler` task splitting logic (P1) | When truncation insufficient, creates focused sub-task in new thread. System message posted to original thread. |
| REQ-RP-01 | `ContextAssembler` Pattern A logic | Layer 3 contains task reminder + question + answer verbatim. No full thread history. Multi-message questions concatenated. |
| REQ-RP-03 | `ContextAssembler` Pattern C logic | All prior agent turns verbatim (max 3) + current turn. Turn counting excludes human/system messages. |
| REQ-RP-04 | `ContextAssembler` Turn 3 injection | Final-review instruction injected at Turn 3: "This is your second and final review pass..." |
| REQ-SI-01 | `SkillInvoker`, `SkillClient` | Skills invoked as stateless Claude Code calls. Receive only Context Bundle. No Discord access, no session state. |
| REQ-SI-02 | `SkillClient.invoke()`, `InvocationResult` | Skill output captured: text response + artifact changes (file diffs in worktree). Routing signal parsed from text. |
| REQ-SI-03 | `ContextAssembler` Layer 1 system prompt | Two-iteration rule included verbatim in every Skill system prompt. Defense-in-depth alongside Turn 3 injection. |
| REQ-SI-04 | `RoutingEngine`, `<routing>` tag format | Structured routing signal in every Skill response. JSON in `<routing>` tags. Validated by `parseSignal()`. |
| REQ-SI-11 | `ThreadQueue`, `Orchestrator` | Independent threads process concurrently. `ThreadQueue` ensures same-thread sequential, cross-thread concurrent. |
| REQ-SI-12 | `SkillInvoker`, `GitClient.createWorktree()` | Each invocation gets its own worktree at `ptah/{agent}/{thread}/{id}`. Always created, even for single invocation (SI-R4). |
| REQ-NF-01 | `SkillInvoker` 90s timeout, `SkillClient` timeout parameter | End-to-end invocation must complete within 90 seconds. Timer starts at worktree creation. |
| REQ-NF-04 | `ContextAssembler` Layer 2 scoping | Only current feature's docs included. Never the full /docs tree. Token budget enforcement prevents bloat. |
| REQ-NF-07 | `ResponsePoster` portability rule | No Discord IDs, thread IDs, or Discord links written to any /docs file. Discord-specific identifiers exist only in memory and logs. |

---

## 9. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | `package.json` | `@anthropic-ai/claude-code` added as runtime dependency | Second external runtime dependency. Requires Claude Code installed and authenticated on machine. |
| 2 | `src/types.ts` | `PtahConfig.agents` extended with `colours` and `role_mentions`; `PtahConfig.orchestrator` extended with `token_budget` | Backward-compatible — new fields are optional with defaults |
| 3 | `src/services/discord.ts` | `DiscordClient` protocol extended with `postEmbed()`, `createThread()`, `postSystemMessage()` | Additive — existing methods unchanged |
| 4 | `src/services/git.ts` | `GitClient` protocol extended with worktree operations | Additive — existing methods unchanged |
| 5 | `src/services/filesystem.ts` | `FileSystem` protocol extended with `readDir()`, `joinPath()` | Additive — existing methods unchanged |
| 6 | `src/commands/start.ts` | `StartCommand` constructor accepts `Orchestrator`; message handler calls `orchestrator.handleMessage()` instead of logging | Breaking change to `StartCommand` constructor signature — test updates required |
| 7 | `bin/ptah.ts` | Composition root wires new services (SkillClient, GitClient, TokenCounter, etc.) | Extended composition root |
| 8 | `src/config/loader.ts` | `NodeConfigLoader` validates `agents.active` non-empty, `agents.skills` non-empty | New validation — existing configs pass (fields are already populated by `ptah init`) |
| 9 | `src/config/defaults.ts` | `buildConfig()` adds `agents.colours` and default `role_mentions` placeholder | Config template updated |
| 10 | Phase 2 → Phase 3 | `onThreadMessage` handler is the extension point. Phase 2's logging handler is replaced by `orchestrator.handleMessage()`. | Handler replacement is the designed integration point (Phase 2 TSPEC §15 #6) |
| 11 | Phase 3 → Phase 4 | Worktree artifact changes are detected but discarded in Phase 3 (SI-R8). Phase 4 adds commit-before-cleanup to `SkillInvoker`. | `SkillInvoker` is designed with the commit hook point ready |
| 12 | Phase 3 → Phase 5 | `ROUTE_TO_USER` signal posts a system message but does not write to `pending.md`. Phase 5 adds the `pending.md` write and poll/resume flow. | `ROUTE_TO_USER` handling is a stub in Phase 3 |
| 13 | Phase 3 → Phase 6 | No retry on Skill failure. Phase 6 adds retry with exponential backoff. `SkillInvoker` error handling is designed to allow wrapping with retry logic. | No retry in Phase 3 |

---

## 10. Open Questions

| # | Question | Resolution | Date |
|---|----------|------------|------|
| OQ-01 | Should `ContextAssembler` determine Layer 2 file relevance ranking using filename heuristics or a configurable mapping? | **Option A: Filename heuristic.** Files containing task keywords are ranked highest. Simpler, no config overhead, matches FSPEC-CB-01 §3.2 step 7. Config-based mapping (Option B) can be added later as an override if truncation quality is insufficient. | March 9, 2026 |
| OQ-02 | Should Skills be invoked via raw Anthropic API (`@anthropic-ai/sdk`) or Claude Code CLI/SDK (`@anthropic-ai/claude-code`)? | **Claude Code SDK.** Rich built-in tools (Edit, Read, Write, Glob, Grep), no custom tool definitions or tool-use loop management needed, `cwd` scoping to worktrees, no API key management in Ptah. If server deployment is needed later, the `SkillClient` protocol allows swapping to a raw API implementation. | March 9, 2026 |

---

## 11. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 9, 2026 | Backend Engineer | Initial technical specification for Phase 3 (Skill Routing). Covers all 21 Phase 3 requirements across 6 FSPECs. |
| 1.1 | March 9, 2026 | Backend Engineer | Addressed cross-skill review feedback. PM F-02: expanded resume pattern classification algorithm in §4.2.7 step 2 with detailed Pattern A detection logic. TE F-01: added input recording arrays to FakeRoutingEngine, FakeContextAssembler, FakeSkillInvoker in §7.2. TE F-02: added explicit "Context — deduplication" test category for CB-R4 in §7.3. |
| 1.2 | March 9, 2026 | Backend Engineer | Resolved open questions. OQ-01: filename heuristic for Layer 2 relevance ranking. OQ-02: switched from raw Anthropic API to Claude Code SDK for Skill invocation. |
| 1.3 | March 9, 2026 | Backend Engineer | Replaced `AnthropicClient`/`AnthropicSdkClient` with `SkillClient`/`ClaudeCodeClient` throughout. Removed custom tool definitions (read_file, write_file, list_files) — Claude Code provides Edit, Read, Write, Glob, Grep. Removed `anthropic_api_key_env` config. Renamed `anthropic.ts` → `claude-code.ts`. Simplified SkillInvoker algorithm (11 steps → 11 steps, removed tool scoping). Updated error handling, test doubles, test categories, requirement mapping, and integration points. |
| 1.4 | March 9, 2026 | Backend Engineer | Addressed TE review (REVIEW-TSPEC-PLAN). F-01: §5.2 parsing rule 3 now explicitly includes error embed posting for multiple routing signals. F-05: `FakeRoutingEngine` updated to sequential `parseResults[]`/`decideResults[]` with `callIndex` for multi-turn tests. F-06: `FakeResponsePoster.postAgentResponse()` records full params including `config` and `footer`. F-07/Q-04: `ContextBundle.turnNumber` documented as "0 for fresh and Pattern A, 1-4 for Pattern C." F-09: Discord rate-limit handling clarified as retry-once-with-delay, not persistent queue. F-12: `FakeSkillInvoker` updated to sequential `results[]` with `callIndex`. |

---

*Gate: User reviews and approves this technical specification before proceeding to Planning.*
