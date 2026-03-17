# Technical Specification: Phase 7 — Polish

| Field | Detail |
|-------|--------|
| **Document ID** | TSPEC-PTAH-PHASE7 |
| **Requirements** | [007-REQ-polish](./007-REQ-polish.md) |
| **Functional Specifications** | [007-FSPEC-polish](./007-FSPEC-polish.md) |
| **Date** | March 16, 2026 |
| **Author** | Backend Engineer |
| **Status** | Draft |

---

## 1. Summary

Phase 7 delivers six production-readiness improvements to the Ptah Orchestrator: thread archiving on resolution, configuration-driven agent extensibility (breaking config schema migration), structured `[ptah:{component}] LEVEL: message` log output via a refactored `Logger` protocol, operator observability via ten mandatory lifecycle log events, Discord rich embed formatting for four Orchestrator message types (with agent response text moving to plain messages), and human-readable error messages with actionable guidance for five failure categories.

The largest engineering surface is the **AgentConfig schema migration** (REQ-NF-08). The flat `AgentConfig` object (`active`, `skills`, `colours`, `role_mentions`) is replaced by an `agents: AgentEntry[]` array. This is a hard cut-over; no backward-compatibility shim is provided. A migration guide is produced as a Phase 7 deliverable.

The second-largest surface is the **Logger protocol refactor** (REQ-NF-09). The `Logger` interface gains a `forComponent(component: Component): Logger` factory method. All eight Orchestrator modules construct component-scoped loggers at initialization. This eliminates per-call-site `[ptah:...]` string literals in favor of a structured Logger that captures `{ component, level, message }` tuples — enabling deterministic test assertions.

---

## 2. Technology Stack

| Concern | Detail |
|---------|--------|
| Runtime | Node.js 20 LTS |
| Language | TypeScript 5.x (ESM) |
| Test framework | Vitest 2.0 |
| Discord library | discord.js 14.x (`ThreadChannel.setArchived(true)` for archiving; `channel.send({ content })` for plain messages) |
| Logging | Custom structured logger (no new library — prefix + level pattern only) |
| New dependencies | None |

---

## 3. Project Structure

```
ptah/
├── src/
│   ├── services/
│   │   ├── logger.ts                    UPDATED — Logger.forComponent(), ComponentLogger, Component type
│   │   └── discord.ts                   UPDATED — DiscordClient.archiveThread(), postPlainMessage()
│   ├── config/
│   │   └── loader.ts                    UPDATED — parse AgentEntry[] schema, validate entries
│   ├── orchestrator/
│   │   ├── agent-registry.ts            NEW — AgentRegistry protocol + DefaultAgentRegistry + buildAgentRegistry()
│   │   ├── error-messages.ts            NEW — user-facing error message templates (ERR-RP-01..05)
│   │   ├── orchestrator.ts              UPDATED — thread archiving, observability events, AgentRegistry dep
│   │   ├── router.ts                    UPDATED — AgentRegistry for routing resolution, component logger
│   │   ├── response-poster.ts           UPDATED — 4 embed types, postPlainMessage() for agent responses
│   │   ├── skill-invoker.ts             UPDATED — component logger, observability events
│   │   ├── artifact-committer.ts        UPDATED — component logger, observability event EVT-OB-06
│   │   └── invocation-guard.ts          UPDATED — component logger, error message integration
│   └── types.ts                         UPDATED — AgentEntry, RegisteredAgent, Component, LogLevel,
│                                                   LogEntry, EmbedType, UserFacingErrorType
├── docs/
│   └── 007-polish/
│       └── migration-guide-v4-agents.md NEW — config schema migration guide
├── ptah.config.json                     UPDATED — new agents[] array schema
└── tests/
    ├── unit/
    │   ├── agent-registry.test.ts        NEW
    │   ├── error-messages.test.ts        NEW
    │   ├── response-poster.test.ts       UPDATED — new embed types, plain-text agent responses
    │   └── orchestrator.test.ts          UPDATED — thread archiving tests
    └── fixtures/
        └── factories.ts                  UPDATED — FakeLogger (forComponent), FakeDiscordClient
                                                    (archiveThread, postPlainMessage), FakeAgentRegistry,
                                                    FakeResponsePoster (new embed methods)
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/ptah.ts (composition root)
  └─ DefaultOrchestrator
       ├─ DefaultAgentRegistry    ← NEW (built from AgentEntry[] at startup)
       ├─ DefaultRoutingEngine    ← UPDATED (AgentRegistry injected)
       ├─ DefaultResponsePoster   ← UPDATED (4 embed types, plain agent response)
       ├─ DefaultSkillInvoker     ← UPDATED (component logger, obs. events)
       ├─ DefaultArtifactCommitter← UPDATED (component logger, EVT-OB-06)
       ├─ DefaultInvocationGuard  ← UPDATED (component logger, error-messages)
       └─ ConsoleLogger           ← UPDATED (forComponent() factory)
            └─ ComponentLogger (scoped instances per module)
```

### 4.2 Updated Protocols

#### 4.2.1 Logger Protocol — `src/services/logger.ts`

```typescript
// Valid component values — exhaustive union
export type Component =
  | 'orchestrator'
  | 'router'
  | 'dispatcher'
  | 'skill-invoker'
  | 'artifact-committer'
  | 'response-poster'
  | 'config'
  | 'discord';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  /** Returns a new Logger that prefixes every line with [ptah:{component}] {LEVEL}: */
  forComponent(component: Component): Logger;
}

export class ConsoleLogger implements Logger {
  info(message: string): void { console.log(message); }
  warn(message: string): void { console.warn(message); }
  error(message: string): void { console.error(message); }
  debug(message: string): void { console.log(message); }
  forComponent(component: Component): Logger {
    return new ComponentLogger(component);
  }
}

class ComponentLogger implements Logger {
  constructor(private readonly component: Component) {}
  private emit(level: LogLevel, message: string): void {
    const line = `[ptah:${this.component}] ${level}: ${message}`;
    if (level === 'ERROR' || level === 'WARN') {
      console.error(line);
    } else {
      console.log(line);
    }
  }
  info(message: string): void  { this.emit('INFO', message); }
  warn(message: string): void  { this.emit('WARN', message); }
  error(message: string): void { this.emit('ERROR', message); }
  debug(message: string): void { this.emit('DEBUG', message); }
  forComponent(component: Component): Logger { return new ComponentLogger(component); }
}
```

**Design rationale:** `forComponent()` returns a `ComponentLogger` that formats every call. The root `ConsoleLogger` (used at composition root before any component is known) delegates un-prefixed until a component scope is established. Each module calls `this.log = deps.logger.forComponent('skill-invoker')` in its constructor — the component prefix is never repeated at the call site.

#### 4.2.2 DiscordClient Protocol — `src/services/discord.ts`

Two new methods added to the existing `DiscordClient` interface:

```typescript
export interface DiscordClient {
  // ... existing methods unchanged ...

  /**
   * Archives a Discord thread. Archived threads remain readable but
   * disappear from the active thread list. Idempotent — archiving an
   * already-archived thread succeeds silently.
   */
  archiveThread(threadId: string): Promise<void>;

  /**
   * Posts a plain-text message to a thread (not a Discord embed).
   * Used for agent-authored response text after Phase 7.
   */
  postPlainMessage(threadId: string, content: string): Promise<void>;
}
```

**Implementation in `DiscordJsClient`:**

```typescript
async archiveThread(threadId: string): Promise<void> {
  const thread = await this.client.channels.fetch(threadId);
  if (!thread?.isThread()) {
    throw new Error(`Channel ${threadId} is not a thread`);
  }
  await (thread as ThreadChannel).setArchived(true);
}

async postPlainMessage(threadId: string, content: string): Promise<void> {
  const thread = await this.client.channels.fetch(threadId);
  if (!thread?.isThread()) {
    throw new Error(`Channel ${threadId} is not a thread`);
  }
  await (thread as ThreadChannel).send({ content });
}
```

**Discord.js capability confirmation:** `ThreadChannel.setArchived(true)` is a stable method in discord.js 14.x. The `send({ content })` path is already used by other Discord.js integrations and is distinct from `send({ embeds: [...] })`.

#### 4.2.3 AgentEntry and AgentRegistry — `src/types.ts` + `src/orchestrator/agent-registry.ts`

```typescript
// src/types.ts — new types

/** One entry in the ptah.config.json agents[] array. */
export interface AgentEntry {
  id: string;           // unique, /^[a-z0-9-]+$/
  skill_path: string;   // relative path from project root
  log_file: string;     // relative path from project root
  mention_id: string;   // Discord snowflake — /^\d+$/
  display_name?: string; // defaults to id if absent
}

/** A fully validated, registered agent in the live Orchestrator registry. */
export interface RegisteredAgent {
  id: string;
  skill_path: string;
  log_file: string;
  mention_id: string;
  display_name: string; // always set (id used as fallback)
}

export type Component =
  | 'orchestrator' | 'router' | 'dispatcher' | 'skill-invoker'
  | 'artifact-committer' | 'response-poster' | 'config' | 'discord';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  component: string;
  level: LogLevel;
  message: string;
}

export type UserFacingErrorType =
  | 'ERR-RP-01' // retry exhaustion
  | 'ERR-RP-02' // unknown agent
  | 'ERR-RP-03' // Discord MCP failure
  | 'ERR-RP-04' // routing signal parse failure
  | 'ERR-RP-05'; // skill file missing

export interface UserFacingErrorContext {
  agentDisplayName?: string;
  agentId?: string;
  maxRetries?: number;
}
```

```typescript
// src/orchestrator/agent-registry.ts

export interface AgentRegistry {
  getAgentById(id: string): RegisteredAgent | null;
  getAgentByMentionId(mentionId: string): RegisteredAgent | null;
  getAllAgents(): RegisteredAgent[];
}

export class DefaultAgentRegistry implements AgentRegistry {
  private readonly byId: Map<string, RegisteredAgent>;
  private readonly byMentionId: Map<string, RegisteredAgent>;

  constructor(agents: RegisteredAgent[]) {
    this.byId = new Map(agents.map(a => [a.id, a]));
    this.byMentionId = new Map(agents.map(a => [a.mention_id, a]));
  }

  getAgentById(id: string): RegisteredAgent | null {
    return this.byId.get(id) ?? null;
  }

  getAgentByMentionId(mentionId: string): RegisteredAgent | null {
    return this.byMentionId.get(mentionId) ?? null;
  }

  getAllAgents(): RegisteredAgent[] {
    return Array.from(this.byId.values());
  }
}

/**
 * Validates AgentEntry[] from config and builds a DefaultAgentRegistry.
 * Invalid or duplicate entries are skipped and logged; startup is not aborted.
 * Returns the registry and the list of validation errors for testing.
 */
export function buildAgentRegistry(
  entries: AgentEntry[],
  fs: FileSystem,
  logger: Logger,
): { registry: AgentRegistry; errors: AgentValidationError[] }
```

#### 4.2.4 ResponsePoster Protocol — `src/orchestrator/response-poster.ts`

```typescript
export interface ResponsePoster {
  /** Posts agent-authored response text as a plain Discord message (not an embed). */
  postAgentResponse(params: {
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }): Promise<PostResult>;

  /** Routing Notification embed — color 0x5865F2 (blurple). */
  postRoutingNotificationEmbed(params: {
    threadId: string;
    fromAgentDisplayName: string;
    toAgentDisplayName: string;
  }): Promise<void>;

  /** Resolution Notification embed — color 0x57F287 (green). */
  postResolutionNotificationEmbed(params: {
    threadId: string;
    signalType: 'LGTM' | 'TASK_COMPLETE';
    agentDisplayName: string;
  }): Promise<void>;

  /** Error Report embed — color 0xED4245 (red). */
  postErrorReportEmbed(params: {
    threadId: string;
    errorType: UserFacingErrorType;
    context: UserFacingErrorContext;
  }): Promise<void>;

  /** User Escalation embed — color 0xFEE75C (yellow). */
  postUserEscalationEmbed(params: {
    threadId: string;
    agentDisplayName: string;
    question: string;
  }): Promise<void>;

  /** Creates a new coordination thread using Routing Notification embed. */
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

**Embed color constants (replaces per-agent `resolveColour()`):**

```typescript
const ROUTING_NOTIFICATION_COLOUR    = 0x5865F2; // Discord blurple
const RESOLUTION_NOTIFICATION_COLOUR = 0x57F287; // green
const ERROR_REPORT_COLOUR            = 0xED4245; // red
const USER_ESCALATION_COLOUR         = 0xFEE75C; // yellow
const EMBED_FOOTER                   = 'Ptah Orchestrator';
```

**Removed:**
- `postCompletionEmbed()` — replaced by `postResolutionNotificationEmbed()`
- `postErrorEmbed()` — replaced by `postErrorReportEmbed()`
- `postProgressEmbed()` — replaced by `postRoutingNotificationEmbed()`
- `resolveColour()` — eliminated entirely (colors are now fixed per embed type)

**`postAgentResponse()` behavior change:** Currently chunks text into multiple embed messages. After Phase 7: chunks text and posts each chunk via `discordClient.postPlainMessage()`. Embed wrapping is removed. Content chunking logic (4096-char split) is preserved but uses plain messages.

**`createCoordinationThread()` behavior change:** Currently posts initial message using per-agent color embed. After Phase 7: posts a Routing Notification embed (color `0x5865F2`, title `↗ Routing to {display_name}`). The `resolveColour()` call is removed.

**Embed fallback:** If `postEmbed()` throws, `ResponsePoster` falls back to `postPlainMessage()` with the type-specific plain-text fallback string defined in FSPEC-DI-03 §5.6. This ensures the thread receives a notification even if embed creation fails.

#### 4.2.5 ErrorMessages Module — `src/orchestrator/error-messages.ts`

```typescript
export interface ErrorMessage {
  title: string;         // "⚠ Error — {short_description}"
  whatHappened: string;  // plain language
  whatToDo: string;      // actionable guidance
}

export function buildErrorMessage(
  type: UserFacingErrorType,
  context: UserFacingErrorContext,
): ErrorMessage
```

**Template table:**

| Type | Title | What happened | What to do |
|------|-------|---------------|------------|
| ERR-RP-01 | `⚠ Error — Skill Invocation Failed` | `{agentDisplayName} could not be reached after {maxRetries} attempts.` | `Try again by @mentioning {agentDisplayName} in this thread. If the problem persists, check the Ptah console log for details.` |
| ERR-RP-02 | `⚠ Error — Unknown Agent` | `A routing signal referenced an agent that is not registered: '{agentId}'.` | `Check that '{agentId}' is correctly configured in ptah.config.json and that Ptah has been restarted or hot-reloaded since the config change.` |
| ERR-RP-03 | `⚠ Error — Discord Error` | `Ptah could not complete a Discord operation for this thread.` | `Check the Ptah console log for details. If the problem persists, verify the bot's Discord permissions.` |
| ERR-RP-04 | `⚠ Error — Invalid Skill Response` | `{agentDisplayName} returned a response that Ptah could not process.` | `Try re-triggering the workflow. If this happens repeatedly for the same agent, check the Skill definition file for issues.` |
| ERR-RP-05 | `⚠ Error — Skill File Missing` | `The Skill definition for {agentDisplayName} could not be found.` | `Verify the skill file exists at the configured path and that Ptah has read access. Check the console log for the expected path.` |

**Design rule:** `buildErrorMessage()` is a pure function. It never receives `Error` objects, stack traces, or raw exception messages. The caller extracts safe context values (agent name, retry count, etc.) and passes them. All `Error` objects are written to the structured log by the caller before invoking this function.

---

## 5. Config Schema Migration (REQ-NF-08)

### 5.1 Migration Strategy: Hard Cut-Over

Phase 7 performs a hard cut-over from the flat `AgentConfig` object to the `AgentEntry[]` array. No backward-compatibility shim is used. The rationale: Ptah is a development tool with a single active deployment; the config file is small and manually maintained; a shim would add lasting complexity for a one-time migration.

### 5.2 Before and After

**Before (live schema):**
```json
{
  "agents": {
    "active": ["pm", "eng", "fe", "qa"],
    "skills": {
      "pm": "../.claude/skills/product-manager/SKILL.md",
      "eng": "../.claude/skills/backend-engineer/SKILL.md"
    },
    "model": "claude-sonnet-4-6",
    "max_tokens": 800000,
    "colours": { "pm": "0xE91E63" },
    "role_mentions": { "1481763846741037167": "pm" }
  }
}
```

**After (Phase 7 schema):**
```json
{
  "agents": [
    {
      "id": "pm",
      "skill_path": "../.claude/skills/product-manager/SKILL.md",
      "log_file": "agent-logs/pm.md",
      "mention_id": "1481763846741037167",
      "display_name": "Product Manager"
    },
    {
      "id": "eng",
      "skill_path": "../.claude/skills/backend-engineer/SKILL.md",
      "log_file": "agent-logs/eng.md",
      "mention_id": "1481763904982876260",
      "display_name": "Backend Engineer"
    }
  ],
  "llm": {
    "model": "claude-sonnet-4-6",
    "max_tokens": 800000
  }
}
```

**Key changes:**
- `agents` becomes an array. Each element has `id`, `skill_path`, `log_file`, `mention_id`, `display_name?`.
- `agents.model` and `agents.max_tokens` move to a new top-level `llm` section.
- `agents.colours` is eliminated — embed colors are fixed per type.
- `agents.role_mentions` is replaced by `mention_id` field per agent entry.
- `agents.active` is eliminated — all entries in the array are active.

### 5.3 PtahConfig Type Changes — `src/types.ts`

```typescript
// BEFORE
export interface AgentConfig {
  active: string[];
  skills: Record<string, string>;
  model: string;
  max_tokens: number;
  colours?: Record<string, string>;
  role_mentions?: Record<string, string>;
}

export interface PtahConfig {
  agents: AgentConfig;
  // ...
}

// AFTER
export interface LlmConfig {
  model: string;
  max_tokens: number;
}

export interface PtahConfig {
  agents: AgentEntry[];   // replaced AgentConfig
  llm: LlmConfig;         // NEW — model and max_tokens moved here
  // all other sections unchanged
}
```

**Consumer updates required** (all call sites of `config.agents.*`):

| Old access pattern | New access pattern |
|--------------------|--------------------|
| `config.agents.active` | `agentRegistry.getAllAgents().map(a => a.id)` |
| `config.agents.skills[agentId]` | `agentRegistry.getAgentById(agentId)?.skill_path` |
| `config.agents.model` | `config.llm.model` |
| `config.agents.max_tokens` | `config.llm.max_tokens` |
| `config.agents.colours?.[agentId]` | *(eliminated — embed colors are fixed per type)* |
| `config.agents.role_mentions` | `agentRegistry.getAgentByMentionId(mentionId)` |

### 5.4 `buildAgentRegistry()` Algorithm

```
Input: entries: AgentEntry[], fs: FileSystem, logger: Logger (component: 'config')
Output: { registry: DefaultAgentRegistry, errors: AgentValidationError[] }

1. Initialize: registered: RegisteredAgent[] = [], errors: AgentValidationError[] = []
   seenIds: Set<string> = new Set()
   seenMentionIds: Set<string> = new Set()

2. For each entry at index i:
   a. Validate required fields (id, skill_path, log_file, mention_id):
      - If any missing → log ERROR "[ptah:config] ERROR: agent entry at index {i} is missing required field '{field}'. Skipping."
        Push error. Continue to next entry.
   b. Validate id format: /^[a-z0-9-]+$/
      - If invalid → log ERROR. Push error. Continue.
   c. Check duplicate id:
      - If seenIds.has(id) → log WARN "[ptah:config] WARN: duplicate agent id '{id}' at index {i}. First registration wins; skipping duplicate."
        Push error. Continue.
   d. Validate skill_path (file must exist):
      - await fs.exists(skill_path) — if false → log ERROR "[ptah:config] ERROR: skill file not found for agent '{id}': {skill_path}. Skipping agent."
        Push error. Continue.
   e. Validate log_file (file must exist):
      - await fs.exists(log_file) — if false → log ERROR "[ptah:config] ERROR: log file not found for agent '{id}': {log_file}. Skipping agent."
        Push error. Continue.
   f. Validate mention_id: /^\d+$/
      - If invalid → log ERROR. Push error. Continue.
   g. Check duplicate mention_id:
      - If seenMentionIds.has(mention_id) → log WARN. Push error. Continue.
   h. Register agent:
      registered.push({
        id, skill_path, log_file, mention_id,
        display_name: entry.display_name ?? entry.id
      })
      seenIds.add(id); seenMentionIds.add(mention_id)

3. Log result:
   If registered.length > 0:
     "[ptah:config] INFO: {N} agent(s) registered: {id1}, {id2}, ..."
   Else:
     "[ptah:config] WARN: no agents registered. Orchestrator will start but cannot route messages."

4. Return { registry: new DefaultAgentRegistry(registered), errors }
```

---

## 6. Thread Archiving Algorithm (FSPEC-DI-02)

Thread archiving is added to the Orchestrator's post-routing sequence in `orchestrator.ts`. The existing flow after skill response is received: post response → commit artifacts. Phase 7 appends: → evaluate resolution signal → archive if applicable.

**Location:** `DefaultOrchestrator.executeRoutingLoop()` (or `processMessage()` — wherever the post-commit step currently ends).

```
After postAgentResponse() and commitAndMerge() complete:

1. Read signal type from RoutingSignal.type.
   If type is NOT 'LGTM' and NOT 'TASK_COMPLETE' → stop; continue normal routing.

2. Check config:
   const archiveEnabled = config.orchestrator?.archive_on_resolution
   If archiveEnabled === false → log "[ptah:orchestrator] DEBUG: Archiving disabled by config — thread {threadId} left open." Stop.
   If archiveEnabled is present but not boolean → log "[ptah:orchestrator] WARN: archive_on_resolution config value is not boolean — defaulting to true." Proceed.
   If archiveEnabled is undefined/absent → default true. Proceed.

3. Check thread registry:
   const state = threadStateManager.getState(threadId)
   If state?.status === 'closed' → log DEBUG "Thread {threadId} already archived — skipping." Stop.
   (BR-DI-02-04: zero MCP calls on duplicate signals)

4. Call discordClient.archiveThread(threadId).
   On success:
     log "[ptah:orchestrator] INFO: Thread {threadId} archived after resolution signal '{signalType}'."
     threadStateManager.markClosed(threadId)
   On "Thread not found" error:
     log "[ptah:orchestrator] WARN: thread {threadId} not found in Discord — treating as already archived."
     threadStateManager.markClosed(threadId)  ← treat as success
   On "already archived" state:
     log DEBUG. threadStateManager.markClosed(threadId) ← treat as success
   On other error (network, permissions):
     log "[ptah:orchestrator] WARN: failed to archive thread {threadId} — {error.message}. Thread left open."
     Do NOT update thread registry. (BR-DI-02-03, BR-DI-02-07)
   (BR-DI-02-03: archiving failure is non-blocking; routing cycle continues)
```

**`OrchestratorDeps` addition:** No new dep needed — `discordClient` is already in `OrchestratorDeps`. `config.orchestrator.archive_on_resolution: boolean | undefined` is added to `OrchestratorConfig` type.

---

## 7. Observability Log Events (FSPEC-OB-01)

The following call sites must emit their respective EVT events. All use component-scoped loggers initialized in the constructor.

| EVT | Location | Component | Level | Log message template |
|-----|----------|-----------|-------|----------------------|
| EVT-OB-01 | `orchestrator.ts` — on Discord message received | `orchestrator` | INFO | `Message received in thread {threadId} — mention: {mentionId}. Content: "{first100chars}…"` |
| EVT-OB-02 | `orchestrator.ts` — agent matched from mention | `orchestrator` | INFO | `Thread {threadId} — matched mention to agent '{agentId}' ({displayName}).` |
| EVT-OB-03 | `skill-invoker.ts` — before Claude API call | `skill-invoker` | INFO | `Invoking skill for '{agentId}' on thread {threadId} (attempt {n}/{max}).` |
| EVT-OB-04 | `skill-invoker.ts` — after response parsed | `skill-invoker` | INFO | `Skill response received from '{agentId}' on thread {threadId}. Signal: {signalType}.` |
| EVT-OB-05 | `response-poster.ts` — after posting completes | `response-poster` | INFO | `Posted response for '{agentId}' to thread {threadId} ({n} message(s)).` |
| EVT-OB-06 | `artifact-committer.ts` — after commit | `artifact-committer` | INFO | `Committed artifacts for thread {threadId} ('{agentId}'). Commit: {shortSha}. Files: {n}.` |
| EVT-OB-07 | `orchestrator.ts` — after archiveThread() succeeds | `orchestrator` | INFO | `Thread {threadId} archived after resolution signal '{signalType}'.` |
| EVT-OB-08 | `orchestrator.ts` — on ROUTE_TO_USER handling | `orchestrator` | INFO | `Thread {threadId} escalated to user by '{agentId}'. Question: "{first100chars}…"` |
| EVT-OB-09 | `router.ts` — on ROUTE_TO_AGENT dispatch | `router` | INFO | `Thread {threadId} — routing from '{sourceAgentId}' to '{targetAgentId}'.` |
| EVT-OB-10 | (component where error originated) | per-component | ERROR | `Skill invocation failed for '{agentId}' on thread {threadId} after {n} attempts. Error type: {ERR-RP-XX} ({description}).` |

**Constructor pattern (all modules):**
```typescript
constructor(deps: SomeDeps) {
  this.log = deps.logger.forComponent('skill-invoker');
  // other deps...
}
```

---

## 8. Error Handling

| Scenario | Component | Behavior | Log Level | Discord message? |
|----------|-----------|----------|-----------|-----------------|
| Archive fails — network/API error | `orchestrator` | Log WARN. Do NOT update thread registry. Continue. | WARN | No |
| Archive fails — missing permissions | `orchestrator` | Log WARN. Do NOT update registry. | WARN | No |
| Archive fails — thread not found | `orchestrator` | Log WARN. Treat as success. Update registry. | WARN | No |
| `archive_on_resolution` not boolean | `config` | Log WARN. Default to `true`. | WARN | No |
| Agent entry missing required field | `config` | Log ERROR. Skip entry. Continue startup. | ERROR | No |
| Skill file not found at startup | `config` | Log ERROR. Skip agent. Continue startup. | ERROR | No |
| Log file not found at startup | `config` | Log ERROR. Skip agent. Continue startup. | ERROR | No |
| Duplicate `id` in agents array | `config` | Log WARN. First entry wins. Skip duplicate. | WARN | No |
| Duplicate `mention_id` in agents array | `config` | Log WARN. First entry wins. Skip duplicate. | WARN | No |
| Zero agents registered | `config` | Log WARN. Orchestrator starts; no routing. | WARN | No |
| `ROUTE_TO_AGENT` targets unknown agent | `router` | Log ERROR. Post ERR-RP-02 error embed to thread. | ERROR | Yes — Error Report embed |
| Retry exhaustion (ERR-RP-01) | `skill-invoker` | Log ERROR. Post ERR-RP-01 error embed to thread. | ERROR | Yes — Error Report embed |
| Routing parse failure (ERR-RP-04) | `router` | Log ERROR. Post ERR-RP-04 error embed to thread. | ERROR | Yes — Error Report embed |
| Skill file missing at invocation (ERR-RP-05) | `skill-invoker` | Log ERROR. Post ERR-RP-05 error embed to thread. | ERROR | Yes — Error Report embed |
| Discord MCP failure — non-archive (ERR-RP-03) | `discord` | Log ERROR. Post ERR-RP-03 error embed to thread (if possible). | ERROR | Yes — Error Report embed |
| Embed creation fails (any embed type) | `response-poster` | Log WARN. Fall back to postPlainMessage() with type-specific text. | WARN | Yes — plain text fallback |
| Embed field exceeds Discord char limit | `response-poster` | Truncate with `…`. Do not crash. | DEBUG | Yes — truncated embed |

---

## 9. Test Strategy

### 9.1 Test Approach

Phase 7 adds unit tests for all new modules and updates existing unit tests to cover new behaviors. TDD order follows the PLAN document. Integration tests verify the full routing lifecycle (EVT-OB-01 through EVT-OB-10) and archiving (AT-DI-02-01 through AT-DI-02-09).

### 9.2 Test Doubles

#### FakeLogger (updated)

```typescript
class FakeLogStore {
  entries: LogEntry[] = [];
}

export class FakeLogger implements Logger {
  private store: FakeLogStore;
  private _component: string;

  constructor(component: string = 'test', store?: FakeLogStore) {
    this._component = component;
    this.store = store ?? new FakeLogStore();
  }

  get entries(): LogEntry[] { return this.store.entries; }

  info(message: string): void  { this.store.entries.push({ component: this._component, level: 'INFO', message }); }
  warn(message: string): void  { this.store.entries.push({ component: this._component, level: 'WARN', message }); }
  error(message: string): void { this.store.entries.push({ component: this._component, level: 'ERROR', message }); }
  debug(message: string): void { this.store.entries.push({ component: this._component, level: 'DEBUG', message }); }

  forComponent(component: string): FakeLogger {
    return new FakeLogger(component, this.store); // shares store
  }

  /** Convenience: get all entries at a given level */
  entriesAt(level: LogLevel): LogEntry[] {
    return this.store.entries.filter(e => e.level === level);
  }
}
```

**Key design:** `forComponent()` returns a new `FakeLogger` sharing the same `FakeLogStore`. All entries from all scoped loggers accumulate in the root logger's `entries` array. Tests assert `logger.entries` for structured `{ component, level, message }` tuples.

#### FakeDiscordClient (additions)

```typescript
// New fields added to existing FakeDiscordClient:
archiveThreadCalls: string[] = [];               // threadIds passed to archiveThread()
archiveThreadError: Error | null = null;          // if set, archiveThread() throws this
postPlainMessageCalls: Array<{ threadId: string; content: string }> = [];
postPlainMessageError: Error | null = null;

async archiveThread(threadId: string): Promise<void> {
  if (this.archiveThreadError) throw this.archiveThreadError;
  this.archiveThreadCalls.push(threadId);
}

async postPlainMessage(threadId: string, content: string): Promise<void> {
  if (this.postPlainMessageError) throw this.postPlainMessageError;
  this.postPlainMessageCalls.push({ threadId, content });
}
```

#### FakeAgentRegistry (new)

```typescript
export class FakeAgentRegistry implements AgentRegistry {
  private agents: RegisteredAgent[];

  constructor(agents: RegisteredAgent[] = []) {
    this.agents = agents;
  }

  getAgentById(id: string): RegisteredAgent | null {
    return this.agents.find(a => a.id === id) ?? null;
  }

  getAgentByMentionId(mentionId: string): RegisteredAgent | null {
    return this.agents.find(a => a.mention_id === mentionId) ?? null;
  }

  getAllAgents(): RegisteredAgent[] { return [...this.agents]; }
}
```

#### FakeResponsePoster (updated methods)

```typescript
// New fields replacing old embed methods:
routingNotificationCalls: Array<{ threadId: string; fromAgentDisplayName: string; toAgentDisplayName: string }> = [];
resolutionNotificationCalls: Array<{ threadId: string; signalType: string; agentDisplayName: string }> = [];
errorReportCalls: Array<{ threadId: string; errorType: UserFacingErrorType; context: UserFacingErrorContext }> = [];
userEscalationCalls: Array<{ threadId: string; agentDisplayName: string; question: string }> = [];

// Error injection
postRoutingNotificationError: Error | null = null;
postResolutionNotificationError: Error | null = null;
postErrorReportError: Error | null = null;
postUserEscalationError: Error | null = null;
```

### 9.3 Test Categories

| Category | Test File | What is tested |
|----------|-----------|----------------|
| AgentRegistry unit | `tests/unit/agent-registry.test.ts` | `buildAgentRegistry()` validation rules, duplicate detection, startup log messages, FakeFs integration |
| ErrorMessages unit | `tests/unit/error-messages.test.ts` | `buildErrorMessage()` returns correct title/whatHappened/whatToDo for each of 5 error types; no stack traces in output |
| ResponsePoster unit | `tests/unit/response-poster.test.ts` | 4 embed type schemas (color, title, footer), plain-text agent response, embed fallback to plain, truncation |
| Logger unit | `tests/unit/logger.test.ts` | `forComponent()` returns scoped logger; FakeLogger shared-store behavior; ComponentLogger format string |
| Thread archiving unit | `tests/unit/orchestrator.test.ts` | AT-DI-02-01 through AT-DI-02-09; archiving is last (ordering); non-fatal on failure; idempotency |
| Observability unit | `tests/unit/orchestrator.test.ts` | EVT-OB-01..10 emitted with correct component, level, and required fields |
| Config migration unit | `tests/unit/config-loader.test.ts` | New schema parsed; old schema rejected; validation errors; `llm` section |
| Integration | `tests/integration/routing-loop.test.ts` | Full lifecycle: message received → archived; multi-agent routing traceable via logs |

---

## 10. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-DI-06 | `DiscordClient.archiveThread()`, archiving algorithm in `orchestrator.ts`, `ThreadStateManager.markClosed()` | After resolution signal, archive thread via Discord MCP. Non-fatal on failure. Idempotent via registry check. |
| REQ-DI-10 | `ResponsePoster` (4 embed types), `DiscordClient.postPlainMessage()`, `buildErrorMessage()` | Four embed types with fixed colors. Agent response text → plain messages. `postAgentResponse()` uses `postPlainMessage()`. `createCoordinationThread()` uses Routing Notification embed. |
| REQ-RP-06 | `buildErrorMessage()` in `error-messages.ts`, Error Report embed via `postErrorReportEmbed()` | 5 error templates (ERR-RP-01..05). No stack traces. Caller extracts safe context before calling. |
| REQ-NF-08 | `AgentEntry` type, `buildAgentRegistry()`, `DefaultAgentRegistry`, `config/loader.ts` migration, `ptah.config.json` update, `migration-guide-v4-agents.md` | Hard cut-over from flat AgentConfig to AgentEntry[]. Zero-code-change extensibility: add config entry → agent registered. |
| REQ-NF-09 | `Logger.forComponent()`, `ComponentLogger`, `Component` type, constructor-level scoped logger in all 8 modules | `[ptah:{component}] {LEVEL}: {message}` format enforced by Logger, not call sites. `FakeLogger` captures structured tuples for tests. |
| REQ-NF-10 | EVT-OB-01..10 call sites in `orchestrator.ts`, `router.ts`, `skill-invoker.ts`, `response-poster.ts`, `artifact-committer.ts` | 10 mandatory log events covering full routing lifecycle. Operator can reconstruct any thread's lifecycle from logs alone. |

---

## 11. Integration Points

| Integration Point | Impact | Risk |
|-------------------|--------|------|
| `config.agents.*` consumers | All modules reading `config.agents.skills`, `config.agents.model`, `config.agents.role_mentions` must be updated. Estimate: ~12 call sites across `orchestrator.ts`, `router.ts`, `skill-invoker.ts`, `invocation-guard.ts`, `context-assembler.ts`, `agent-log-writer.ts`, `pdlc-dispatcher.ts`. | Medium — mechanical substitution but high call-site count |
| `DefaultRoutingEngine.resolveHumanMessage()` | Currently reads `config.agents.role_mentions` (Record). After migration: reads `agentRegistry.getAgentByMentionId()`. `RoutingEngine` interface gains an `agentRegistry` constructor dependency. | Medium — interface change propagates to all `RoutingEngine` consumers and fakes |
| `DefaultRoutingEngine.decide()` | Currently validates `agentId` against `config.agents.active`. After migration: validates against `agentRegistry.getAgentById()`. | Low — same logic, different data source |
| `ResponsePoster` callers in `orchestrator.ts` | `postCompletionEmbed()`, `postErrorEmbed()`, `postProgressEmbed()` call sites must be replaced with the four new method names. Estimate: ~6 call sites. | Low — mechanical rename |
| `FakeResponsePoster` in `tests/fixtures/factories.ts` | Old method signatures removed; new embed method records added. All existing tests using `FakeResponsePoster` need review to ensure they reference the correct new method names. | Medium — test update pass required |
| `FakeLogger` in `tests/fixtures/factories.ts` | Existing tests use `fakeLogger.infoCalls`, `fakeLogger.warnCalls` etc. After Phase 7, these become `fakeLogger.entries` (structured). All `FakeLogger` usage across all test files requires migration. | High — high call-site count; touches nearly every test file |
| `discord.js ThreadChannel` | `archiveThread()` implementation calls `setArchived(true)` — confirmed available in discord.js 14.x on `ThreadChannel`. Type assertion required: `thread as ThreadChannel`. | Low |
| `OrchestratorDeps` interface | `agentRegistry: AgentRegistry` must be added. Composition root in `bin/ptah.ts` must build registry before constructing orchestrator. | Low — additive change |
| `PtahConfig.orchestrator` type | Add `archive_on_resolution?: boolean` field. `NodeConfigLoader` must not fail validation when key is absent (default true). | Low |

---

## 12. Open Questions

| # | Question | Resolution |
|---|----------|------------|
| OQ-TSPEC-01 | Where does `AgentRegistry` hot-reload fit within `NodeConfigLoader`'s existing hot-reload? Does the registry rebuild on config file change? | **Assumed: yes.** The composition root rebuilds the registry and updates the Orchestrator's registry reference on hot-reload. This mirrors Phase 1 config hot-reload behavior. Confirm with Product Manager if de-registration semantics for in-flight invocations need additional handling. |
| OQ-TSPEC-02 | FSPEC-EX-01 BR-EX-01-06 says the skill file is read at invocation time (not startup). Should `skill-invoker.ts` use `agentRegistry.getAgentById(agentId).skill_path` at invocation, or cache the path? | **Decision: read path from registry at invocation time.** The registry holds the path string; the file is read from disk by `skill-invoker.ts`. On config hot-reload with a changed `skill_path`, the registry is updated and the next invocation picks up the new path. No file handle caching. |
| OQ-TSPEC-03 | `postAgentResponse()` currently chunks at 4096 chars (embed limit). After moving to plain messages, Discord's plain message limit is 2000 chars. Should the chunk size change? | **Decision: reduce chunk size to 2000 chars** for plain message compatibility. This is a silent behavioral change from the current embed chunking. Flagging here for PM awareness but not a blocker — it improves compatibility. |
| OQ-TSPEC-04 | The FSPEC notes that `postProgressEmbed` maps to Routing Notification (§5.5 BR-DI-03-03). The existing `postProgressEmbed()` takes `(threadId, message: string)` — a free-form string. The new `postRoutingNotificationEmbed()` takes structured `{fromAgentDisplayName, toAgentDisplayName}` params. Are there callers of `postProgressEmbed()` that don't have from/to agent context? | **Needs audit:** All `postProgressEmbed()` call sites must be reviewed during implementation. If a call site has only a free-form message (no agent context), it may use the Routing Notification embed with a `fromAgentDisplayName` of `'Ptah'` as a fallback, or the caller must be refactored to provide the context. |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 16, 2026 | Backend Engineer | Initial draft |

---

*End of Document*
