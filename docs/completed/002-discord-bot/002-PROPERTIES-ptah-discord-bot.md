# Test Properties Document

## Ptah Discord Bot (Orchestrator Connection Layer)

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-ptah-discord-bot |
| **Requirements** | [REQ-DI-01, REQ-DI-02, REQ-DI-03](../requirements/001-REQ-PTAH.md) |
| **Specifications** | [002-TSPEC-ptah-discord-bot](../specifications/002-TSPEC-ptah-discord-bot.md) |
| **Execution Plan** | [002-PLAN-TSPEC-ptah-discord-bot](../plans/002-PLAN-TSPEC-ptah-discord-bot.md) |
| **Version** | 1.1 |
| **Date** | March 9, 2026 |
| **Author** | Test Engineer |
| **Status** | In Review |
| **Approval Date** | Pending |

---

## 1. Overview

This properties document catalogs every testable invariant for the `ptah start` CLI command — a long-running Discord bot process that connects to a Discord server, listens for new messages in threads under `#agent-updates`, and reads full thread history on demand. This is the Discord connection layer (Phase 2) that Phase 3+ builds on for skill routing, context assembly, and response posting. All properties trace to REQ-DI-01 through REQ-DI-03 and 002-TSPEC-ptah-discord-bot.md (Rev 3).

### 1.1 Scope

**In scope:**
- StartCommand behavior: config loading, env var validation, Discord connection, channel resolution, message listener registration, cleanup
- NodeConfigLoader: file reading, JSON parsing, structural validation (6 checks), value validation (4 checks)
- DiscordJsClient: connect, disconnect, findChannelByName, onThreadMessage (filtering + error boundary), readThreadHistory (pagination), toThreadMessage (conversion)
- ConsoleLogger: output formatting for info, warn, error
- FileSystem protocol extension: readFile
- Signal handling: SIGINT/SIGTERM, shuttingDown guard
- CLI entry point: start subcommand routing, help text, exit codes
- Test doubles: FakeFileSystem.readFile, FakeDiscordClient, FakeConfigLoader, FakeLogger, createStubMessage

**Out of scope:**
- Phase 3+ features (skill routing, context assembly, embed posting, thread creation)
- Live Discord server testing (manual, per TSPEC §13.5)
- Duplicate bot instance prevention (deferred to Phase 4, REQ-SI-09)
- In-flight invocation draining on shutdown (Phase 6, REQ-SI-10)
- Validation of non-discord config sections (project, agents, orchestrator, git, docs — consumed by later phases)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 3 | [REQ-DI-01, REQ-DI-02, REQ-DI-03](../requirements/001-REQ-PTAH.md) |
| Specifications analyzed | 1 | [002-TSPEC-ptah-discord-bot](../specifications/002-TSPEC-ptah-discord-bot.md) (Rev 3) |
| Plan tasks reviewed | 40 | [002-PLAN-TSPEC-ptah-discord-bot](../plans/002-PLAN-TSPEC-ptah-discord-bot.md) (Rev 2) |
| Integration boundaries identified | 6 | FileSystem protocol, ConfigLoader protocol, DiscordClient protocol, Logger protocol, CLI composition root, ptah.config.json schema |
| Implementation files reviewed | 1 | `ptah/tests/fixtures/factories.ts` (test doubles implemented) |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 15 | REQ-DI-01, REQ-DI-02, REQ-DI-03 | Unit |
| Contract | 6 | REQ-DI-01, REQ-DI-02 | Unit |
| Error Handling | 12 | REQ-DI-01, REQ-DI-02, REQ-DI-03 | Unit |
| Data Integrity | 4 | REQ-DI-01, REQ-DI-03 | Unit |
| Integration | 6 | REQ-DI-01, REQ-DI-02, REQ-DI-03 | Integration |
| Security | 2 | REQ-DI-01 | Unit / Code Review |
| Idempotency | 2 | REQ-DI-01 | Unit / Integration |
| Observability | 6 | REQ-DI-02 | Unit |
| **Total** | **53** | | |

**Negative properties** (Section 4): **9** additional properties defining prohibited behaviors.

**Grand total:** **62** testable properties.

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-DI-{NUMBER}` — domain prefix `DI` matches the Discord Integration requirement domain.

**Priority:** All source requirements are P0, so all properties inherit P0.

### 3.1 Functional Properties

Core business logic and behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-01 | StartCommand.execute() must load config via configLoader.load(), read bot token from process.env[bot_token_env], call discord.connect(token), resolve channel via findChannelByName, register message listener via onThreadMessage, and return StartResult with cleanup function when all steps succeed | REQ-DI-01, REQ-DI-02, TSPEC §6 | Unit | P0 |
| PROP-DI-02 | NodeConfigLoader.load() must read "ptah.config.json" via FileSystem.readFile(), parse JSON, validate structure (§7.2) and values (§7.3), and return typed PtahConfig when config is valid | TSPEC §7.1 | Unit | P0 |
| PROP-DI-03 | DiscordJsClient.connect(token) must call client.login(token) and resolve when the ready event fires | REQ-DI-02, TSPEC §5.2, §12.3 | Unit | P0 |
| PROP-DI-04 | DiscordJsClient.disconnect() must call client.destroy() to close the WebSocket connection | TSPEC §5.2, §12.3 | Unit | P0 |
| PROP-DI-05 | DiscordJsClient.findChannelByName(guildId, name) must return the channel ID for a matching text channel in the guild, or null if no match exists | TSPEC §5.2, §12.3 | Unit | P0 |
| PROP-DI-06 | DiscordJsClient.onThreadMessage() must register a messageCreate listener that filters to thread messages under the specified parent channel from non-bot authors, converts to ThreadMessage, and invokes the async handler | REQ-DI-02, TSPEC §5.2, §8.2 | Unit | P0 |
| PROP-DI-07 | DiscordJsClient.readThreadHistory(threadId) must fetch thread messages via pagination (up to 200 messages, 2 API calls max) and return ThreadMessage[] sorted oldest-first | REQ-DI-03, TSPEC §5.2, §8.3 | Unit | P0 |
| PROP-DI-08 | DiscordJsClient.readThreadHistory() must return empty array when thread has no messages | REQ-DI-03, TSPEC §8.3 | Unit | P0 |
| PROP-DI-09 | StartCommand cleanup function must call discord.disconnect() and log shutdown message | TSPEC §6 step 6 | Unit | P0 |
| PROP-DI-10 | ConsoleLogger.info() must write "[ptah] {message}" to stdout via console.log | TSPEC §5.2, §12.4 | Unit | P0 |
| PROP-DI-11 | ConsoleLogger.warn() must write "[ptah] WARN: {message}" to stdout via console.log | TSPEC §5.2, §12.4 | Unit | P0 |
| PROP-DI-12 | ConsoleLogger.error() must write "[ptah] Error: {message}" to stderr via console.error | TSPEC §5.2, §12.4 | Unit | P0 |
| PROP-DI-13 | Signal handler must call result.cleanup() then process.exit(0) on SIGINT | TSPEC §6, §9 | Integration | P0 |
| PROP-DI-14 | Signal handler must call result.cleanup() then process.exit(0) on SIGTERM | TSPEC §6, §9 | Integration | P0 |
| PROP-DI-15 | DiscordJsClient must create Client with GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, and GatewayIntentBits.MessageContent | TSPEC §8.1 | Unit | P0 |

### 3.2 Contract Properties

Protocol compliance and type conformance.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-16 | DiscordJsClient must implement the DiscordClient protocol (connect, disconnect, findChannelByName, onThreadMessage, readThreadHistory) | TSPEC §5.2 | Unit | P0 |
| PROP-DI-17 | NodeConfigLoader must implement the ConfigLoader protocol with load(): Promise\<PtahConfig\> | TSPEC §5.2 | Unit | P0 |
| PROP-DI-18 | ConsoleLogger must implement the Logger protocol (info, warn, error) | TSPEC §5.2 | Unit | P0 |
| PROP-DI-19 | NodeFileSystem must implement readFile(path: string): Promise\<string\> as part of the extended FileSystem protocol | TSPEC §5.2, §12.1 | Unit | P0 |
| PROP-DI-20 | StartCommand.execute() must return StartResult with cleanup: () => Promise\<void\> | TSPEC §6 | Unit | P0 |
| PROP-DI-21 | onThreadMessage handler parameter type must be (message: ThreadMessage) => Promise\<void\> (async handler) | TSPEC §5.2, TE Review R1 | Unit | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-22 | NodeConfigLoader must throw "ptah.config.json not found. Run 'ptah init' first." when readFile throws ENOENT | TSPEC §7.1, §11 | Unit | P0 |
| PROP-DI-23 | NodeConfigLoader must throw "Failed to read ptah.config.json: {message}" when readFile throws non-ENOENT error | TSPEC §7.1, §11 | Unit | P0 |
| PROP-DI-24 | NodeConfigLoader must throw "ptah.config.json contains invalid JSON: {parse-error}" when JSON.parse fails | TSPEC §7.1, §11 | Unit | P0 |
| PROP-DI-25 | NodeConfigLoader must throw with specific message for each of 6 missing structural fields per TSPEC §7.2: missing discord section, missing discord.channels, missing discord.server_id, missing discord.bot_token_env, missing discord.channels.updates, missing discord.mention_user_id | TSPEC §7.2, §11 | Unit | P0 |
| PROP-DI-26 | NodeConfigLoader must throw with actionable message for each of 4 placeholder/empty value checks per TSPEC §7.3: server_id = "YOUR_SERVER_ID", mention_user_id = "YOUR_USER_ID", channels.updates = "", bot_token_env = "" | TSPEC §7.3, §11 | Unit | P0 |
| PROP-DI-27 | StartCommand must throw "Environment variable DISCORD_BOT_TOKEN is not set." when process.env[bot_token_env] is empty or undefined | TSPEC §6 step 2d, §11 | Unit | P0 |
| PROP-DI-28 | StartCommand must throw "Channel #{name} not found in server." when findChannelByName returns null | TSPEC §6 step 4b, §11 | Unit | P0 |
| PROP-DI-29 | StartCommand must propagate errors from discord.connect() without modification | TSPEC §6 step 3c | Unit | P0 |
| PROP-DI-30 | StartCommand must propagate errors from configLoader.load() without modification | TSPEC §6 step 1b | Unit | P0 |
| PROP-DI-31 | DiscordJsClient.connect() must reject with timeout error after 30 seconds if ready event is not received | TSPEC §5.2, §11, §12.3 | Unit | P0 |
| PROP-DI-32 | DiscordJsClient.findChannelByName() must throw when guild ID does not exist or bot is not a member of the guild | TSPEC §12.3, §11 | Unit | P0 |
| PROP-DI-33 | DiscordJsClient.onThreadMessage() must catch handler errors/rejections, log error via injected Logger, and continue processing subsequent messages | TSPEC §8.2 step 5, §11 | Unit | P0 |

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-34 | toThreadMessage must map all 9 fields correctly from discord.js Message: id → id, channelId → threadId, channel.name → threadName, channel.parentId → parentChannelId, author.id → authorId, author.displayName → authorName, author.bot → isBot, content → content, createdAt → timestamp | REQ-DI-01, TSPEC §8.4 | Unit | P0 |
| PROP-DI-35 | readThreadHistory must return messages sorted by timestamp ascending (oldest-first), as required by Phase 3 context assembly | REQ-DI-03, TSPEC §8.3 | Unit | P0 |
| PROP-DI-36 | NodeConfigLoader must return correctly typed PtahConfig with all fields preserved from a valid JSON config file | TSPEC §7.1 | Unit | P0 |
| PROP-DI-37 | isNodeError type guard must return true for Error objects with a code property and false for non-Error values and Error objects without code | TSPEC §7.1, TE Review R2 | Unit | P0 |

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-38 | CLI composition root must wire NodeFileSystem, ConsoleLogger, NodeConfigLoader(fs), DiscordJsClient(logger), StartCommand(configLoader, discord, logger) for the start subcommand | TSPEC §5.4 | Integration | P0 |
| PROP-DI-39 | NodeConfigLoader + NodeFileSystem must successfully read and parse a real ptah.config.json from disk in a temp directory | TSPEC §7.1, §12.1 | Integration | P0 |
| PROP-DI-40 | CLI must route "ptah start" to StartCommand.execute() | TSPEC §10 | Integration | P0 |
| PROP-DI-41 | CLI must exit with code 1 and log error via logger.error() on any startup failure (config not found, invalid config, env var missing, connect failure, channel not found) | TSPEC §11 | Integration | P0 |
| PROP-DI-42 | CLI help text must list both "init" and "start" commands with descriptions per TSPEC §10 | TSPEC §10 | Integration | P0 |
| PROP-DI-43 | NodeFileSystem.readFile() must wrap fs/promises.readFile(path, "utf-8") and throw raw Node.js error on failure | TSPEC §12.1 | Integration | P0 |

### 3.6 Security Properties

Authentication and secrets handling.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-44 | StartCommand must read bot token exclusively from process.env[config.discord.bot_token_env], never from a config file value | REQ-NF-06, TSPEC §6 step 2d | Unit | P0 |
| PROP-DI-45 | Error messages from StartCommand and NodeConfigLoader must not include the bot token value. **Verification: design constraint** — NodeConfigLoader never has access to the token (validates env var name only), and StartCommand's env var error is a static string. Verified by code review, not automated test. | REQ-NF-06 | Code Review | P0 |

### 3.7 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-46 | client.destroy() must be safe to call multiple times without error (discord.js no-ops on destroyed client) | TSPEC §9, §12.3 | Unit | P0 |
| PROP-DI-47 | shuttingDown boolean guard must prevent the cleanup function from executing more than once when concurrent signals arrive | TSPEC §6, §9 | Integration | P0 |

### 3.8 Observability Properties

Logging and operational visibility.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-48 | StartCommand must log "Connected to Discord server: {guild-name}" via logger.info() after successful connect | TSPEC §6 step 3b | Unit | P0 |
| PROP-DI-49 | StartCommand must log "Listening on #{channel-name}" via logger.info() after channel resolution | TSPEC §6 step 4c | Unit | P0 |
| PROP-DI-50 | StartCommand message handler must log "Message detected in thread: {thread-name} by {author}" via logger.info() when invoked | TSPEC §6 step 5b | Unit | P0 |
| PROP-DI-51 | Shutdown handler must log "Shutting down..." before cleanup and "Disconnected from Discord. Goodbye." after cleanup completes | TSPEC §6, §9 | Unit | P0 |
| PROP-DI-52 | DiscordJsClient must register internal listeners for discord.js client warn and error events and log them via injected Logger | TSPEC §11, TE Review G4 | Unit | P0 |
| PROP-DI-53 | readThreadHistory must log warning via Logger when thread has >200 messages (history truncated) | TSPEC §8.3 | Unit | P0 |

---

## 4. Negative Properties

Properties that define what the system must NOT do. Derived from specification constraints and the inverse of positive properties.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-54 | onThreadMessage must not invoke handler for messages where message.author.bot is true | TSPEC §8.2 step 1 | Unit | P0 |
| PROP-DI-55 | onThreadMessage must not invoke handler for messages where message.channel.isThread() returns false | TSPEC §8.2 step 2 | Unit | P0 |
| PROP-DI-56 | onThreadMessage must not invoke handler for thread messages whose parent channel does not match the configured parentChannelId | TSPEC §8.2 step 3 | Unit | P0 |
| PROP-DI-57 | A single handler error/rejection must not crash the Orchestrator process — other messages must continue to be processed | TSPEC §8.2 step 5, §11 | Unit | P0 |
| PROP-DI-58 | StartCommand must not call process.exit() — signal handling and exit live in bin/ptah.ts (composition root) | TSPEC §6, §9 | Unit | P0 |
| PROP-DI-59 | NodeConfigLoader must not validate environment variables — env var validation is StartCommand's responsibility | TSPEC §7.3 | Unit | P0 |
| PROP-DI-60 | readThreadHistory must not make more than 2 API calls per invocation | TSPEC §8.3 step 6 | Unit | P0 |
| PROP-DI-61 | DiscordJsClient must throw "Cannot connect: client has been destroyed. Create a new DiscordJsClient instance." when connect() is called after disconnect() — instance is in terminal state | TSPEC §12.3 | Unit | P0 |
| PROP-DI-62 | Downstream consumers must not access discord.js types directly — ThreadMessage is the protocol boundary type. **Verification: TypeScript type system + code review** — enforced by PROP-DI-16 (DiscordClient protocol signatures use only ThreadMessage and primitives). Additionally verified by import analysis: only `src/services/discord.ts` may import from `discord.js`. | REQ-DI-01, TSPEC §8.4 | Code Review | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-DI-01 — Orchestrator owns all Discord I/O | PROP-DI-01, PROP-DI-16, PROP-DI-34, PROP-DI-38, PROP-DI-62 | Full |
| REQ-DI-02 — Watch #agent-updates threads | PROP-DI-01, PROP-DI-03, PROP-DI-06, PROP-DI-13, PROP-DI-14, PROP-DI-15, PROP-DI-21, PROP-DI-33, PROP-DI-48, PROP-DI-49, PROP-DI-50, PROP-DI-54, PROP-DI-55, PROP-DI-56, PROP-DI-57 | Full |
| REQ-DI-03 — Read full thread history | PROP-DI-07, PROP-DI-08, PROP-DI-35, PROP-DI-53, PROP-DI-60 | Full |

### 5.2 Specification Coverage

| Specification Section | Properties | Coverage |
|-----------------------|------------|----------|
| TSPEC §5.2 (Protocols) | PROP-DI-03, PROP-DI-04, PROP-DI-05, PROP-DI-06, PROP-DI-07, PROP-DI-10, PROP-DI-11, PROP-DI-12, PROP-DI-15, PROP-DI-16, PROP-DI-17, PROP-DI-18, PROP-DI-19, PROP-DI-20, PROP-DI-21 | Full |
| TSPEC §5.4 (Composition Root) | PROP-DI-38 | Full |
| TSPEC §6 (StartCommand Algorithm) | PROP-DI-01, PROP-DI-09, PROP-DI-13, PROP-DI-14, PROP-DI-20, PROP-DI-27, PROP-DI-28, PROP-DI-29, PROP-DI-30, PROP-DI-44, PROP-DI-47, PROP-DI-48, PROP-DI-49, PROP-DI-50, PROP-DI-51, PROP-DI-58 | Full |
| TSPEC §7.1 (NodeConfigLoader) | PROP-DI-02, PROP-DI-22, PROP-DI-23, PROP-DI-24, PROP-DI-36, PROP-DI-37 | Full |
| TSPEC §7.2 (Structural Validation) | PROP-DI-25 | Full |
| TSPEC §7.3 (Value Validation) | PROP-DI-26, PROP-DI-59 | Full |
| TSPEC §8.1 (Gateway Intents) | PROP-DI-15 | Full |
| TSPEC §8.2 (Message Filtering) | PROP-DI-06, PROP-DI-33, PROP-DI-54, PROP-DI-55, PROP-DI-56, PROP-DI-57 | Full |
| TSPEC §8.3 (Thread History) | PROP-DI-07, PROP-DI-08, PROP-DI-35, PROP-DI-53, PROP-DI-60 | Full |
| TSPEC §8.4 (ThreadMessage Conversion) | PROP-DI-34, PROP-DI-62 | Full |
| TSPEC §9 (Signal Handling) | PROP-DI-13, PROP-DI-14, PROP-DI-46, PROP-DI-47, PROP-DI-51 | Full |
| TSPEC §10 (CLI Entry Point) | PROP-DI-40, PROP-DI-42 | Full |
| TSPEC §11 (Error Handling) | PROP-DI-22, PROP-DI-23, PROP-DI-24, PROP-DI-25, PROP-DI-26, PROP-DI-27, PROP-DI-28, PROP-DI-29, PROP-DI-30, PROP-DI-31, PROP-DI-32, PROP-DI-33, PROP-DI-41 | Full |
| TSPEC §12.1 (FileSystem) | PROP-DI-19, PROP-DI-43 | Full |
| TSPEC §12.3 (DiscordClient) | PROP-DI-03, PROP-DI-04, PROP-DI-05, PROP-DI-31, PROP-DI-32, PROP-DI-46, PROP-DI-61 | Full |
| TSPEC §12.4 (Logger) | PROP-DI-10, PROP-DI-11, PROP-DI-12, PROP-DI-18 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 3 | 3 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 — not needed for Phase 2
       /----------\
      / Integration \      9 — composition root, CLI wiring, config pipeline, signal handling, exit codes
     /----------------\
    /    Unit Tests     \  51 — functional, contract, error, data, security, observability, idempotency
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 51 | 82% |
| Integration | 9 | 15% |
| Code Review | 2 | 3% |
| E2E (candidates) | 0 | 0% |
| **Total** | **62** | **100%** |

**E2E justification:** No E2E tests are needed. The protocol-based architecture with dependency injection means all StartCommand, NodeConfigLoader, and DiscordJsClient behavior can be verified at the unit level using FakeConfigLoader, FakeDiscordClient, and FakeLogger. The 9 integration properties verify real NodeFileSystem, CLI wiring, signal handling, and config loader pipeline — they do not require a full-stack E2E test. Live Discord testing is manual and out of scope (TSPEC §13.5).

**Code Review properties:** 2 properties (PROP-DI-45, PROP-DI-62) are design constraints better verified by code review and TypeScript's type system than automated tests. PROP-DI-45 (token not in error messages) is satisfied by design — no code path exists to leak the token. PROP-DI-62 (ThreadMessage boundary) is enforced by TypeScript protocol signatures and import boundaries.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | No property for discord.js auto-reconnect behavior during operation | If the gateway disconnects and reconnects, the Orchestrator may miss messages during the reconnect window. Phase 2 relies on discord.js defaults for reconnection. | Low | Defer to Phase 6 (REQ-NF-02 Reliability). PROP-DI-52 covers warn/error event logging, which provides observability into reconnects. No action needed for Phase 2. |
| 2 | No property for FakeFileSystem.readFile behavior (ENOENT code attachment) | FakeFileSystem.readFile is a test double — not production code. If the fake's ENOENT simulation is wrong, unit tests give false confidence. | Low | Covered by existing FakeFileSystem test file (Task 7). The fake is tested against the same ENOENT contract the real NodeFileSystem exhibits. |
| 3 | REQ-DI-02 acceptance criteria specifies "within 5 seconds" detection SLA | No runtime measurement property. PM review (C-02) resolved this as a design constraint satisfied by gateway technology choice (discord.js delivers events in <1s). | Low | No property needed for Phase 2. If latency monitoring is required, it belongs in Phase 6 alongside REQ-NF-02. |

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
| 1.0 | March 9, 2026 | Test Engineer | Initial properties document — 62 properties (53 positive + 9 negative) across 8 categories derived from 3 requirements and 002-TSPEC-ptah-discord-bot (Rev 3). Full requirement and specification coverage. |
| 1.1 | March 9, 2026 | Test Engineer | PM review feedback addressed (Q-01 through Q-03): PROP-DI-45 reclassified from Unit to Code Review — token leak has no realistic code path, satisfied by design. PROP-DI-61 clarified with specific error message for connect-after-disconnect: "Cannot connect: client has been destroyed. Create a new DiscordJsClient instance." PROP-DI-62 reclassified from Unit to Code Review — architectural constraint enforced by TypeScript type system and import boundaries, verified by PROP-DI-16. Test level distribution updated: 51 Unit, 9 Integration, 2 Code Review. Total unchanged: 62 properties. |

---

*End of Document*
