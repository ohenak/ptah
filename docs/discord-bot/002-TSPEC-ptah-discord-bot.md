# Technical Specification: `ptah start` — Discord Bot (Orchestrator Connection Layer)

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-DI-01](../requirements/REQ-PTAH.md), [REQ-DI-02](../requirements/REQ-PTAH.md), [REQ-DI-03](../requirements/REQ-PTAH.md) |
| **Analysis** | [ANALYSIS-ptah-discord-bot.md](./ANALYSIS-ptah-discord-bot.md) |
| **Date** | March 9, 2026 |
| **Status** | Approved (Rev 3 — PM + TE review feedback addressed) |

---

## 1. Summary

A TypeScript/Node.js long-running process (`ptah start`) that connects to Discord as a bot, listens for new messages in threads under `#agent-updates`, and reads full thread history on demand. This is the Discord connection layer — the foundation that Phase 3+ builds on for skill routing, context assembly, and response posting. The Orchestrator is the exclusive owner of all Discord I/O; Skills never touch Discord directly.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Continues Phase 1 stack |
| Language | TypeScript 5.x | Continues Phase 1 stack |
| Discord library | discord.js v14 (`^14.25.1`) | Current stable, excellent TS typings, ESM support, GatewayIntentBits API (Analysis Q1) |
| Test framework | Vitest | Continues Phase 1 stack |
| CLI entry point | `bin/ptah.ts` via `tsx` | Extended from Phase 1 — adds `start` subcommand |

**New dependency for Phase 2:** `discord.js` (`^14.25.1`) is added as a runtime dependency in `package.json`. This is the first external runtime dependency.

---

## 3. Prerequisites

Before `ptah start` can function, the developer must complete these steps (Analysis Q2):

1. Create a Discord Application at the Discord Developer Portal
2. Enable **Message Content Intent** under Bot → Privileged Gateway Intents → Message Content Intent
3. Generate a bot token and set it as the `DISCORD_BOT_TOKEN` environment variable
4. Invite the bot to the target server with permissions: Read Messages, Send Messages, Read Message History, Manage Threads
5. Update `ptah.config.json` with actual `server_id`, channel names, and `mention_user_id` values

---

## 4. Project Structure

```
ptah/
├── package.json                        ← updated: add discord.js dependency
├── src/
│   ├── commands/
│   │   ├── init.ts                     ← existing (Phase 1)
│   │   └── start.ts                    ← NEW: ptah start command logic
│   ├── services/
│   │   ├── filesystem.ts              ← UPDATED: add readFile() to protocol
│   │   ├── git.ts                     ← existing (Phase 1)
│   │   ├── discord.ts                 ← NEW: DiscordClient protocol + DiscordJsClient impl
│   │   └── logger.ts                  ← NEW: Logger protocol + ConsoleLogger impl
│   ├── config/
│   │   ├── defaults.ts               ← existing (Phase 1)
│   │   └── loader.ts                 ← NEW: ConfigLoader protocol + NodeConfigLoader impl
│   └── types.ts                       ← UPDATED: add PtahConfig, ThreadMessage types
├── bin/
│   └── ptah.ts                        ← UPDATED: add start subcommand routing
└── tests/
    ├── unit/
    │   ├── commands/
    │   │   ├── init.test.ts           ← existing (Phase 1)
    │   │   └── start.test.ts          ← NEW
    │   ├── services/
    │   │   ├── discord.test.ts        ← NEW
    │   │   └── logger.test.ts         ← NEW
    │   └── config/
    │       ├── defaults.test.ts       ← existing (Phase 1)
    │       └── loader.test.ts         ← NEW
    ├── integration/
    │   └── cli/
    │       └── ptah.test.ts           ← UPDATED: add start subcommand tests
    └── fixtures/
        └── factories.ts               ← UPDATED: add FakeDiscordClient, FakeLogger, FakeConfigLoader
```

---

## 5. Module Architecture

### 5.1 Dependency Graph

```
bin/ptah.ts
  ├── src/commands/init.ts (InitCommand)     ← existing
  │     ├── src/services/filesystem.ts
  │     └── src/services/git.ts
  └── src/commands/start.ts (StartCommand)   ← NEW
        ├── src/config/loader.ts (ConfigLoader protocol)
        │     └── src/services/filesystem.ts (FileSystem protocol — readFile)
        ├── src/services/discord.ts (DiscordClient protocol)
        └── src/services/logger.ts (Logger protocol)
```

### 5.2 Protocols (Interfaces)

#### FileSystem Protocol — Extended (Analysis Q9)

```typescript
// src/services/filesystem.ts — UPDATED

interface FileSystem {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;   // NEW — reads UTF-8 string from file
  cwd(): string;
  basename(path: string): string;
}
```

#### PtahConfig Type

```typescript
// src/types.ts — UPDATED

interface DiscordConfig {
  bot_token_env: string;
  server_id: string;
  channels: {
    updates: string;
    questions: string;
    debug: string;
  };
  mention_user_id: string;
}

interface PtahConfig {
  project: {
    name: string;
    version: string;
  };
  agents: {
    active: string[];
    skills: Record<string, string>;
    model: string;
    max_tokens: number;
  };
  discord: DiscordConfig;
  orchestrator: {
    max_turns_per_thread: number;
    pending_poll_seconds: number;
    retry_attempts: number;
  };
  git: {
    commit_prefix: string;
    auto_commit: boolean;
  };
  docs: {
    root: string;
    templates: string;
  };
}
```

#### ConfigLoader Protocol (Analysis Q8)

```typescript
// src/config/loader.ts

interface ConfigLoader {
  load(): Promise<PtahConfig>;
}
```

`load()` reads `ptah.config.json` from the current working directory (`process.cwd()` — the project root), parses JSON, and validates required fields. Throws with an actionable error message if validation fails. The relative path `"ptah.config.json"` is resolved by `NodeFileSystem.readFile()` against cwd, consistent with Phase 1's `InitCommand` which also operates relative to cwd. (Review C-06)

#### ThreadMessage Type

```typescript
// src/types.ts — UPDATED

interface ThreadMessage {
  id: string;              // Discord message ID (for idempotency — REQ-SI-09)
  threadId: string;        // Thread (channel) ID
  threadName: string;      // Thread name (for logging)
  parentChannelId: string; // Parent channel ID (for filtering to #agent-updates)
  authorId: string;        // Author user ID
  authorName: string;      // Author display name (for logging)
  isBot: boolean;          // Whether the author is a bot (Review C-05)
  content: string;         // Message text content
  timestamp: Date;         // Message creation timestamp
}
```

This type is the Orchestrator's internal representation of a Discord message. It decouples downstream consumers (Phase 3+ routing, context assembly) from discord.js types entirely, enforcing REQ-DI-01's architectural boundary. The `isBot` field is included so that Phase 3 context assembly (REQ-CB-01) can distinguish Orchestrator embed posts from human/agent-authored messages when reading thread history via `readThreadHistory()` — even though `onThreadMessage()` filters out bot messages before they reach the handler (Review C-05).

#### DiscordClient Protocol

```typescript
// src/services/discord.ts

interface DiscordClient {
  connect(token: string): Promise<void>;
  disconnect(): Promise<void>;
  findChannelByName(guildId: string, channelName: string): Promise<string | null>;
  onThreadMessage(
    parentChannelId: string,
    handler: (message: ThreadMessage) => Promise<void>,
  ): void;

  readThreadHistory(threadId: string): Promise<ThreadMessage[]>;
}
```

| Method | Behavior |
|--------|----------|
| `connect(token)` | Logs in to Discord via gateway with required intents. Resolves when `ready` event fires. Rejects after 30 seconds if `ready` is not received (connect timeout). (TE Review T4) |
| `disconnect()` | Calls `client.destroy()` to cleanly disconnect from Discord gateway. |
| `findChannelByName(guildId, channelName)` | Looks up a text channel by name within the guild. Returns the channel ID if found, `null` if not. Used at startup to resolve `channels.updates` name to an ID. |
| `onThreadMessage(parentChannelId, handler)` | Registers a `messageCreate` listener filtered to thread messages whose parent channel matches `parentChannelId`. Ignores bot messages (self and other bots). Converts discord.js `Message` to `ThreadMessage` before calling handler. The handler is `async` — Phase 3 routing logic will be async. The `DiscordJsClient` implementation wraps the handler invocation in a try/catch: if the handler throws or rejects, the error is logged via a `Logger` dependency (injected into `DiscordJsClient`) and the Orchestrator continues processing other messages. A single bad message must never crash the process. (TE Review T2, Q2) |
| `readThreadHistory(threadId)` | Fetches all messages in a thread via Discord API, paginating up to 200 messages (2 requests max). Returns messages sorted oldest-first. |

#### Logger Protocol (Analysis Q10)

```typescript
// src/services/logger.ts

interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

| Method | Behavior |
|--------|----------|
| `info(message)` | Writes `[ptah] {message}` to stdout |
| `warn(message)` | Writes `[ptah] WARN: {message}` to stdout |
| `error(message)` | Writes `[ptah] Error: {message}` to stderr |

No log levels, no file output, no structured JSON. Plain text to stdout/stderr.

### 5.3 Concrete Implementations

- `NodeFileSystem` — extended with `readFile()` wrapping `node:fs/promises.readFile` with UTF-8 encoding
- `NodeConfigLoader` — reads `ptah.config.json` via `FileSystem.readFile()`, parses JSON, validates required fields
- `DiscordJsClient` — wraps discord.js `Client` with required gateway intents. Accepts `Logger` via constructor for error boundary logging (TE Review T2) and reconnect event logging (TE Review G4)
- `ConsoleLogger` — writes `[ptah]`-prefixed messages to `console.log`/`console.error`

### 5.4 Composition Root — `ptah start`

```typescript
// bin/ptah.ts — start subcommand wiring

const fs = new NodeFileSystem();
const logger = new ConsoleLogger();
const configLoader = new NodeConfigLoader(fs);
const discord = new DiscordJsClient(logger);
const command = new StartCommand(configLoader, discord, logger);
await command.execute();
```

---

## 6. StartCommand Algorithm

```
1. Load config
   a. configLoader.load() — reads ptah.config.json, parses, validates
   b. On validation failure: throw (caller handles exit)

2. Validate runtime environment (Analysis Q5)
   a. discord.server_id !== "YOUR_SERVER_ID"
   b. discord.mention_user_id !== "YOUR_USER_ID"
   c. discord.channels.updates is non-empty
   d. process.env[discord.bot_token_env] is non-empty
   e. On any failure: throw with actionable message

3. Connect to Discord
   a. discord.connect(token) — with 30-second timeout (TE Review T4)
   b. On success: logger.info("Connected to Discord server: {guild-name}")
   c. On failure: throw with connection error

4. Resolve channel
   a. discord.findChannelByName(config.discord.server_id, config.discord.channels.updates)
   b. If null returned: throw "Channel #{name} not found in server"
   c. On success: logger.info("Listening on #{channel-name}")

5. Register message listener
   a. discord.onThreadMessage(channelId, handler)
   b. Handler for Phase 2 — logs message detection:
      logger.info("Message detected in thread: {thread-name} by {author}")
   c. Phase 3 will replace this handler with routing logic

6. Return cleanup function (TE Review T1, Q7)
   a. execute() returns a cleanup function: () => Promise<void>
   b. The cleanup function: calls discord.disconnect(), logs shutdown message
   c. The discord.js Client keeps the Node.js event loop alive via its WebSocket
   d. The CLI entry point (bin/ptah.ts) registers SIGINT/SIGTERM handlers
      that call the cleanup function and then process.exit(0)
   e. This keeps process.exit() out of StartCommand — testable with fakes
```

**Lifecycle design (TE Review T1, Q7):** `execute()` completes after setup — it registers listeners and returns a cleanup function. It does **not** block forever. The Node.js event loop stays alive because discord.js holds an open WebSocket connection. Signal handling and `process.exit()` live in `bin/ptah.ts` (the composition root), not in `StartCommand`. This mirrors Phase 1's pattern where `InitCommand.execute()` returns `InitResult` and the CLI handles exit codes.

```typescript
// StartCommand return type
interface StartResult {
  cleanup: () => Promise<void>;
}

// In bin/ptah.ts:
const result = await command.execute();

let shuttingDown = false;  // Guard against concurrent signals (TE Review T5)
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Shutting down...");
  await result.cleanup();
  logger.info("Disconnected from Discord. Goodbye.");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

---

## 7. Config Loader

### 7.1 NodeConfigLoader

```typescript
// src/config/loader.ts

class NodeConfigLoader implements ConfigLoader {
  constructor(private fs: FileSystem) {}

  async load(): Promise<PtahConfig> {
    let raw: string;
    try {
      raw = await this.fs.readFile("ptah.config.json");
    } catch (error: unknown) {
      // Distinguish file-not-found from other FS errors (TE Review G3)
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error("ptah.config.json not found. Run 'ptah init' first.");
      }
      throw new Error(
        `Failed to read ptah.config.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error: unknown) {
      throw new Error(
        `ptah.config.json contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.validateStructure(parsed);
    this.validateValues(parsed as PtahConfig);
    return parsed as PtahConfig;
  }
}

// Type guard for Node.js errors with error codes (TE Review R2)
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
```

### 7.2 Validation — Structural Checks (TE Review Q1, G1)

Validation is two-phase: **structural checks** verify that required sections and fields exist in the parsed JSON, **value checks** verify that values are not placeholders. Structural checks run first — a config like `{ "project": { "name": "foo" } }` with no `discord` key will fail with a clear structural error, not a runtime TypeError.

| Check | Rule | Error Message |
|-------|------|---------------|
| Top-level `discord` section | `typeof config.discord === "object"` | `ptah.config.json is missing the "discord" section.` |
| `discord.channels` section | `typeof config.discord.channels === "object"` | `ptah.config.json is missing "discord.channels".` |
| `discord.server_id` exists | `typeof config.discord.server_id === "string"` | `ptah.config.json is missing "discord.server_id".` |
| `discord.bot_token_env` exists | `typeof config.discord.bot_token_env === "string"` | `ptah.config.json is missing "discord.bot_token_env".` |
| `discord.channels.updates` exists | `typeof config.discord.channels.updates === "string"` | `ptah.config.json is missing "discord.channels.updates".` |
| `discord.mention_user_id` exists | `typeof config.discord.mention_user_id === "string"` | `ptah.config.json is missing "discord.mention_user_id".` |

Only the `discord` section is structurally validated in Phase 2 — it is the only section consumed by `StartCommand`. The `project`, `agents`, `orchestrator`, `git`, and `docs` sections are consumed by later phases and will be validated when those phases are implemented.

### 7.3 Validation — Value Checks (Analysis Q5)

| Field | Rule | Error Message |
|-------|------|---------------|
| `discord.server_id` | Not `"YOUR_SERVER_ID"` | `discord.server_id is still set to placeholder value "YOUR_SERVER_ID". Edit ptah.config.json with your Discord server ID.` |
| `discord.mention_user_id` | Not `"YOUR_USER_ID"` | `discord.mention_user_id is still set to placeholder value "YOUR_USER_ID". Edit ptah.config.json with your Discord user ID.` |
| `discord.channels.updates` | Non-empty string | `discord.channels.updates is empty. Edit ptah.config.json with your channel name.` |
| `discord.bot_token_env` | Non-empty string | `discord.bot_token_env is empty.` |

Environment variable validation (`process.env[bot_token_env]`) is performed by `StartCommand` after config load — not by the config loader itself, since env vars are a runtime concern separate from config file parsing.

---

## 8. DiscordJsClient Implementation

### 8.1 Gateway Intents (Analysis Q2)

```typescript
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
```

### 8.2 Message Filtering (Analysis Q3, Q4)

The `onThreadMessage` method applies three filters before invoking the handler:

```
1. message.author.bot === true  → ignore (filters self + other bots)
2. !message.channel.isThread()  → ignore (not a thread message)
3. message.channel.parentId !== parentChannelId → ignore (wrong parent channel)
4. Passes all filters → convert to ThreadMessage, invoke handler
5. If handler throws/rejects → catch, log error via logger, continue
```

Filter order is intentional: bot check is cheapest, thread check avoids unnecessary parent lookups. The error boundary at step 5 ensures a single bad message never crashes the Orchestrator (TE Review T2). `DiscordJsClient` accepts a `Logger` via constructor injection to support this.

### 8.3 Thread History Pagination (Analysis Q6)

```
readThreadHistory(threadId):
  1. Fetch first batch: channel.messages.fetch({ limit: 100 })
  2. If batch.size < 100, all messages retrieved → return sorted oldest-first
  3. If batch.size === 100, fetch second batch:
     channel.messages.fetch({ limit: 100, before: oldest-message-id })
  4. Combine both batches → return sorted oldest-first
  5. If total > 200, log warning: "Thread {name} has >200 messages, history truncated"
  6. Never make more than 2 API calls per readThreadHistory invocation
```

Return type: `ThreadMessage[]` sorted by timestamp ascending (oldest first). Returns an empty array if the thread has no messages (not an error condition — though in practice Discord threads always have at least a system message). (TE Review Q3)

This ordering is required by Phase 3's Pattern C review context assembly (REQ-RP-03), which includes "all prior turns verbatim" in chronological order.

### 8.4 ThreadMessage Conversion

The `DiscordJsClient` converts discord.js `Message` objects to `ThreadMessage` at the protocol boundary. Downstream code never sees discord.js types. This enforces REQ-DI-01's architectural constraint — only the `DiscordJsClient` implementation depends on discord.js.

```typescript
function toThreadMessage(message: Message): ThreadMessage {
  return {
    id: message.id,
    threadId: message.channelId,
    threadName: (message.channel as ThreadChannel).name,
    parentChannelId: (message.channel as ThreadChannel).parentId!,
    authorId: message.author.id,
    authorName: message.author.displayName,  // displayName already falls back to username internally in discord.js v14.14+ (TE Review Q6)
    isBot: message.author.bot,
    content: message.content,
    timestamp: message.createdAt,
  };
}
```

---

## 9. Signal Handling (Analysis Q7, TE Review T1, T5)

Phase 2 includes basic graceful disconnect. Phase 6 (REQ-SI-10) will extend this with in-flight invocation draining.

Signal handling lives in `bin/ptah.ts` (the composition root), **not** in `StartCommand`. This keeps `process.exit()` out of testable business logic (TE Review T1). A `shuttingDown` guard flag prevents concurrent signal handling when SIGTERM arrives while a prior SIGINT shutdown is still in progress (TE Review T5). `client.destroy()` is safe to call on an already-destroyed client (discord.js no-ops), but the guard prevents double logging.

See Section 6 for the full signal handler code.

---

## 10. CLI Entry Point Update

`bin/ptah.ts` is extended to handle the `start` subcommand alongside `init`:

```
ptah init   → InitCommand (existing Phase 1)
ptah start  → StartCommand (new Phase 2)
ptah --help → updated help text listing both commands
```

The help text is updated:

```
ptah v0.1.0

Usage: ptah <command>

Commands:
  init    Scaffold the Ptah docs structure into the current Git repository
  start   Start the Orchestrator as a Discord bot

Options:
  --help  Show this help message
```

---

## 11. Error Handling

| Scenario | Behavior | Exit Code |
|----------|----------|-----------|
| `ptah.config.json` not found | `logger.error("ptah.config.json not found. Run 'ptah init' first.")` | 1 |
| `ptah.config.json` invalid JSON | `logger.error("ptah.config.json contains invalid JSON: {parse-error}")` | 1 |
| Config validation failure (placeholder values) | `logger.error("{actionable message per Section 7.2}")` | 1 |
| `DISCORD_BOT_TOKEN` env var not set | `logger.error("Environment variable DISCORD_BOT_TOKEN is not set.")` | 1 |
| Discord login failure (invalid token) | `logger.error("Failed to connect to Discord: {error}")` | 1 |
| Discord connect timeout (30s) | `logger.error("Failed to connect to Discord: connection timed out after 30 seconds.")` | 1 |
| Guild not found / bot not a member | `logger.error("Discord server {server_id} not found. Verify the bot has been invited to the server.")` | 1 |
| `#agent-updates` channel not found | `logger.error("Channel #agent-updates not found in server.")` | 1 |
| Discord gateway disconnect during operation | discord.js auto-reconnects by default. `DiscordJsClient` registers internal listeners on `client.on("warn")` and `client.on("error")` to log via the injected `Logger`. These are implementation details — not exposed in the `DiscordClient` protocol. (TE Review G4) | — |
| SIGINT/SIGTERM received | Graceful disconnect (Section 9) | 0 |

---

## 12. Service Architecture

### 12.1 FileSystem Service — Extended

| Method | Behavior |
|--------|----------|
| `exists(path)` | Returns true if path exists (existing) |
| `mkdir(path)` | Creates directory recursively (existing) |
| `writeFile(path, content)` | Writes UTF-8 string to file (existing) |
| `readFile(path)` | **NEW.** Reads UTF-8 string from file. Throws the raw Node.js error on failure — callers (e.g., `NodeConfigLoader`) catch and re-throw with user-friendly messages based on `error.code` (`ENOENT` for not-found, `EACCES` for permission denied). (TE Review G3) |
| `cwd()` | Returns `process.cwd()` (existing) |
| `basename(path)` | Returns last segment of path (existing) |

**Implementation:** `NodeFileSystem.readFile()` wraps `node:fs/promises.readFile(path, "utf-8")`.

### 12.2 ConfigLoader Service

| Method | Behavior |
|--------|----------|
| `load()` | Reads `ptah.config.json` via `FileSystem.readFile()`, parses JSON, validates structure and placeholder values, returns typed `PtahConfig`. Throws on missing file, invalid JSON, or validation failure. |

**Implementation:** `NodeConfigLoader` accepts `FileSystem` via constructor injection.

### 12.3 DiscordClient Service

| Method | Behavior |
|--------|----------|
| `connect(token)` | Creates discord.js `Client` with intents, calls `client.login(token)`, waits for `ready` event with 30-second timeout. Rejects with timeout error if `ready` is not received. (TE Review T4) |
| `disconnect()` | Calls `client.destroy()` to close the WebSocket connection. After `disconnect()`, the `DiscordJsClient` instance is in a terminal state — `connect()` must not be called again on the same instance. discord.js `Client.destroy()` is idempotent (safe to call multiple times). If reconnection is needed in future phases (Phase 6), a new `DiscordJsClient` instance must be created. (TE Review Q5) |
| `findChannelByName(guildId, name)` | Fetches the guild, searches its channels for a text channel with the given name. Returns channel ID or null. Throws if the guild ID does not exist or the bot is not a member of the guild — `StartCommand` catches this and logs an error. (TE Review Q4) |
| `onThreadMessage(parentChannelId, handler)` | Registers filtered `messageCreate` listener per Section 8.2. |
| `readThreadHistory(threadId)` | Fetches thread messages with pagination per Section 8.3. |

**Implementation:** `DiscordJsClient` wraps the discord.js `Client` class.

### 12.4 Logger Service

| Method | Behavior |
|--------|----------|
| `info(message)` | Writes `[ptah] {message}` to stdout via `console.log` |
| `warn(message)` | Writes `[ptah] WARN: {message}` to stdout via `console.log` |
| `error(message)` | Writes `[ptah] Error: {message}` to stderr via `console.error` |

**Implementation:** `ConsoleLogger` — no dependencies.

---

## 13. Test Strategy

### 13.1 Approach

Follows Phase 1 conventions: **protocol-based dependency injection** with fake test doubles for unit tests. No discord.js dependency in unit tests — the `DiscordClient` protocol is the boundary.

### 13.2 Test Doubles

```typescript
// tests/fixtures/factories.ts — UPDATED

// FakeFileSystem — extended from Phase 1 (TE Review G2)
// The existing FakeFileSystem is updated with readFile():
//
//   async readFile(path: string): Promise<string> {
//     const content = this.files.get(path);
//     if (content === undefined) {
//       const error = new Error(`ENOENT: no such file: ${path}`) as NodeJS.ErrnoException;
//       error.code = "ENOENT";
//       throw error;
//     }
//     return content;
//   }
//
// Tests pre-populate files via the existing addExisting(path, content) method.
// readFile() reads from the same in-memory Map that writeFile() writes to.

class FakeDiscordClient implements DiscordClient {
  connected = false;
  disconnected = false;
  loginToken: string | null = null;
  registeredHandlers: Array<{
    parentChannelId: string;
    handler: (message: ThreadMessage) => Promise<void>;
  }> = [];
  threadHistory: Map<string, ThreadMessage[]> = new Map();
  channels: Map<string, string> = new Map();  // name → id

  async connect(token: string): Promise<void> {
    this.loginToken = token;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
    this.connected = false;
  }

  async findChannelByName(guildId: string, name: string): Promise<string | null> {
    return this.channels.get(name) ?? null;
  }

  onThreadMessage(
    parentChannelId: string,
    handler: (message: ThreadMessage) => Promise<void>,
  ): void {
    this.registeredHandlers.push({ parentChannelId, handler });
  }

  async readThreadHistory(threadId: string): Promise<ThreadMessage[]> {
    return this.threadHistory.get(threadId) ?? [];
  }

  // Test helper: simulate an incoming message (TE Review R1)
  async simulateMessage(message: ThreadMessage): Promise<void> {
    for (const { parentChannelId, handler } of this.registeredHandlers) {
      if (message.parentChannelId === parentChannelId) {
        await handler(message);
      }
    }
  }
}

class FakeConfigLoader implements ConfigLoader {
  config: PtahConfig;

  constructor(config?: Partial<PtahConfig>) {
    this.config = { ...defaultTestConfig(), ...config };
  }

  async load(): Promise<PtahConfig> {
    return this.config;
  }
}

class FakeLogger implements Logger {
  messages: { level: string; message: string }[] = [];

  info(message: string): void {
    this.messages.push({ level: "info", message });
  }

  warn(message: string): void {
    this.messages.push({ level: "warn", message });
  }

  error(message: string): void {
    this.messages.push({ level: "error", message });
  }
}
```

### 13.3 Test Categories

| Category | What is tested | Test file |
|----------|---------------|-----------|
| Config loading — structural | Missing `discord` section, missing `discord.channels`, missing individual fields | `tests/unit/config/loader.test.ts` |
| Config loading — values | Placeholder detection, empty strings, valid config passes | `tests/unit/config/loader.test.ts` |
| Config loading — file errors | Missing file (`ENOENT`), permission denied (`EACCES`), invalid JSON | `tests/unit/config/loader.test.ts` |
| StartCommand — happy path | Loads config, validates env, connects to Discord, resolves channel, registers listener, logs status | `tests/unit/commands/start.test.ts` |
| StartCommand — config errors | Placeholder server_id, missing env var, channel not found | `tests/unit/commands/start.test.ts` |
| StartCommand — connection errors | Discord login failure, invalid token, connect timeout, guild not found | `tests/unit/commands/start.test.ts` |
| StartCommand — message detection | Handler invoked on simulated thread message, correct ThreadMessage fields | `tests/unit/commands/start.test.ts` |
| StartCommand — shutdown | `disconnect()` called on shutdown, correct log messages | `tests/unit/commands/start.test.ts` |
| DiscordJsClient — message filtering | Bot messages ignored, non-thread messages ignored, wrong parent channel ignored, handler error caught and logged | `tests/unit/services/discord.test.ts` |
| DiscordJsClient — thread history | Pagination logic, oldest-first ordering, 200-message cap, empty thread returns [] | `tests/unit/services/discord.test.ts` |
| DiscordJsClient — ThreadMessage conversion | All fields mapped correctly from discord.js Message | `tests/unit/services/discord.test.ts` |
| Logger | ConsoleLogger output format (`[ptah]` prefix, stderr for errors) | `tests/unit/services/logger.test.ts` |
| FileSystem — readFile | NodeFileSystem.readFile wraps fs/promises correctly | `tests/integration/services/filesystem.test.ts` |
| CLI — start subcommand | `ptah start` invokes StartCommand, `ptah --help` shows both commands | `tests/integration/cli/ptah.test.ts` |

### 13.4 discord.js Stub Factory (TE Review T3)

Unit tests for `DiscordJsClient` internal logic (filtering, pagination, conversion) use a `createStubMessage()` factory function in `tests/fixtures/factories.ts`. This factory creates minimal plain objects cast as `unknown as Message` — satisfying only the fields that `DiscordJsClient` actually reads. This approach avoids constructing real discord.js objects (which require an active `Client` instance).

```typescript
// tests/fixtures/factories.ts

interface StubMessageOptions {
  id?: string;
  content?: string;
  authorId?: string;
  authorName?: string;
  authorBot?: boolean;
  channelId?: string;
  channelName?: string;
  parentId?: string | null;
  isThread?: boolean;
  createdAt?: Date;
}

function createStubMessage(options: StubMessageOptions = {}): Message {
  return {
    id: options.id ?? "msg-1",
    content: options.content ?? "test message",
    channelId: options.channelId ?? "thread-1",
    createdAt: options.createdAt ?? new Date("2026-03-09T12:00:00Z"),
    author: {
      id: options.authorId ?? "user-1",
      displayName: options.authorName ?? "TestUser",
      username: options.authorName ?? "testuser",
      bot: options.authorBot ?? false,
    },
    channel: {
      id: options.channelId ?? "thread-1",
      name: options.channelName ?? "test-thread",
      parentId: options.parentId ?? "parent-1",
      isThread: () => options.isThread ?? true,
    },
  } as unknown as Message;
}
```

**Design rationale:** The stub only includes fields that `DiscordJsClient` accesses (per Section 8.2 and 8.4). If the implementation changes to access new fields, tests will fail at runtime with `undefined` — this is intentional, as it signals the stub needs updating. This is preferable to maintaining full discord.js mock objects.

### 13.5 Integration Testing Note

Live Discord testing (connecting to a real server) is manual and out of scope for the automated test suite.

---

## 14. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-DI-01 | `DiscordClient` protocol, `DiscordJsClient` impl, `ThreadMessage` type | All Discord I/O is behind the `DiscordClient` protocol. `ThreadMessage` is the platform-agnostic type — downstream consumers never see discord.js types. Skills receive Context Bundles, not Discord access. |
| REQ-DI-02 | `DiscordJsClient.onThreadMessage()`, `StartCommand.execute()` (listener registration) | Registers `messageCreate` listener filtered to threads under `#agent-updates`. Message filtering (Section 8.2) ensures only relevant thread messages are processed. The 5-second detection SLA (acceptance criteria) is a design constraint satisfied by the technology choice — discord.js gateway events deliver messages in near-real-time (<1s typical). No runtime latency measurement is needed in Phase 2. If latency monitoring is required in the future, it belongs in Phase 6 (Guardrails) alongside REQ-NF-02 (Reliability). (Review C-02) |
| REQ-DI-03 | `DiscordJsClient.readThreadHistory()` | Reads full thread history with pagination (up to 200 messages, 2 API calls max). Returns `ThreadMessage[]` sorted oldest-first. Consumed by Phase 3 Context Bundle assembly. |

---

## 15. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | `package.json` | `discord.js` added as runtime dependency | First external runtime dependency |
| 2 | `src/services/filesystem.ts` | `FileSystem` protocol extended with `readFile()` | Existing `FakeFileSystem` must be updated; existing tests unaffected (additive change) |
| 3 | `src/types.ts` | `PtahConfig` and `ThreadMessage` types added | Consumed by config loader, StartCommand, and Phase 3+ |
| 4 | `bin/ptah.ts` | `start` subcommand routing added | Existing `init` command unaffected |
| 5 | `ptah.config.json` | Config file read at startup (was write-only in Phase 1) | Config schema defined in Phase 1 is consumed as-is — no schema changes |
| 6 | Phase 3 — `StartCommand.execute()` | Phase 3 will replace the logging-only message handler with routing logic | The `onThreadMessage` handler is the extension point |
| 7 | Phase 3 — `DiscordClient` protocol | Phase 3 will add `postEmbed()` and `createThread()` methods | Protocol designed for extension — new methods added to interface |
| 8 | Phase 4 — Duplicate bot instances | If a developer runs `ptah start` twice concurrently, both instances receive `messageCreate` events, causing duplicate processing. In Phase 2 this is harmless (handler only logs). In Phase 3+, when handlers trigger Skill invocations, duplicate processing becomes a real problem. Mitigation options: (a) lock file on startup, (b) message-ID deduplication per REQ-SI-09 (Phase 4). (Review C-04) | Phase 4 must address this before Skill invocation is enabled |

---

## 16. Open Questions

| # | Item | Type | Resolution |
|---|------|------|------------|
| — | None | — | All questions resolved in Analysis phase |

---

*Gate: User reviews and approves this technical specification before proceeding to Planning.*
