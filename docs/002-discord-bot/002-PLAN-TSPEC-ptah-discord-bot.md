# Execution Plan: `ptah start` — Discord Bot (Orchestrator Connection Layer)

| Field | Detail |
|-------|--------|
| **Technical Specification** | [002-TSPEC-ptah-discord-bot](../specifications/002-TSPEC-ptah-discord-bot.md) |
| **Requirements** | [REQ-DI-01](../requirements/001-REQ-PTAH.md), [REQ-DI-02](../requirements/001-REQ-PTAH.md), [REQ-DI-03](../requirements/001-REQ-PTAH.md) |
| **Analysis** | [ANALYSIS-ptah-discord-bot](../specifications/ANALYSIS-ptah-discord-bot.md) |
| **TE Review** | [REVIEW-TSPEC-ptah-discord-bot](../testing/in_review/REVIEW-TSPEC-ptah-discord-bot.md) |
| **Date** | March 9, 2026 |
| **Status** | Complete |

---

## 1. Summary

Implements the `ptah start` CLI command — a long-running Discord bot process that connects to a Discord server, listens for new messages in threads under `#agent-updates`, and reads full thread history on demand. This is the Discord connection layer that Phase 3+ builds on for skill routing, context assembly, and response posting. All implementation follows TDD with protocol-based dependency injection, consistent with Phase 1 conventions.

---

## 2. TE Review Items Incorporated

The TE review (Rev 3) identified 2 minor residual issues. Both are addressed in this plan:

| Residual | Description | Plan Task |
|----------|-------------|-----------|
| R1 | `FakeDiscordClient.onThreadMessage` handler must use `Promise<void>` return type; `simulateMessage` must be async and await handlers | Task 8 |
| R2 | `isNodeError` type guard utility not defined in spec | Task 12 |

---

## 3. Task List

### Phase A: Dependencies

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add `discord.js` `^14.25.1` as runtime dependency in `package.json`; run `npm install` to verify | — | `ptah/package.json` | ✅ Done |

### Phase B: Types, Protocols & Test Doubles

Define shared interfaces, types, and build the test doubles needed by all subsequent TDD tasks. No TDD cycle — these are foundational definitions.

**Test double testing policy:** Fakes with non-trivial logic (error simulation, async handler sequencing, ENOENT code attachment) have dedicated test files to prevent cascading failures in downstream tests. Simple record-and-return fakes (FakeConfigLoader, FakeLogger) are validated implicitly by the tests that consume them.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 2 | Extend `FileSystem` protocol with `readFile(path: string): Promise<string>` | — | `ptah/src/services/filesystem.ts` | ✅ Done |
| 3 | Add `PtahConfig` type (with `DiscordConfig` sub-type) and `ThreadMessage` type to `types.ts`; add `StartResult` type with `cleanup: () => Promise<void>` | — | `ptah/src/types.ts` | ✅ Done |
| 4 | Define `ConfigLoader` protocol — `load(): Promise<PtahConfig>` | — | `ptah/src/config/loader.ts` | ✅ Done |
| 5 | Define `DiscordClient` protocol — `connect`, `disconnect`, `findChannelByName`, `onThreadMessage`, `readThreadHistory` | — | `ptah/src/services/discord.ts` | ✅ Done |
| 6 | Define `Logger` protocol — `info`, `warn`, `error` | — | `ptah/src/services/logger.ts` | ✅ Done |
| 7 | Extend `FakeFileSystem` with `readFile()` — reads from in-memory `files` Map, throws `ENOENT`-coded error for missing files (TSPEC 13.2) | `ptah/tests/unit/fixtures/fake-filesystem.test.ts` | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 8 | Implement `FakeDiscordClient` — configurable `connected`, `disconnected`, `loginToken`, `registeredHandlers`, `threadHistory`, `channels` maps; async `simulateMessage()` helper that awaits handlers (TE Review R1). Supports error injection via `connectError: Error \| null` — when set, `connect()` throws the provided error (consistent with `FakeGitClient.commitError` pattern) | `ptah/tests/unit/fixtures/fake-discord-client.test.ts` | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 9 | Implement `FakeConfigLoader` and `defaultTestConfig()` factory — `FakeConfigLoader` accepts `Partial<PtahConfig>`, merges with `defaultTestConfig()`. Supports error injection via `loadError: Error \| null` — when set, `load()` throws the provided error instead of returning config (consistent with `FakeGitClient.commitError` pattern) | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 10 | Implement `FakeLogger` — records `{ level, message }[]` for assertion | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |

### Phase C: Logger Service (TDD)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 11 | `ConsoleLogger.info()` writes `[ptah] {message}` to stdout; `warn()` writes `[ptah] WARN: {message}` to stdout; `error()` writes `[ptah] Error: {message}` to stderr | `ptah/tests/unit/services/logger.test.ts` | `ptah/src/services/logger.ts` | ✅ Done |

### Phase D: Config Loader (TDD)

Each task uses `FakeFileSystem` for isolation. `NodeConfigLoader` accepts `FileSystem` via constructor injection.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 12 | File not found — `load()` throws `"ptah.config.json not found. Run 'ptah init' first."` when `readFile` throws `ENOENT`. Non-ENOENT read error — `load()` throws `"Failed to read ptah.config.json: {message}"`. Include `isNodeError` type guard utility (TE Review R2) | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ✅ Done |
| 13 | Invalid JSON — `load()` throws `"ptah.config.json contains invalid JSON: {parse-error}"` | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ✅ Done |
| 14 | Structural validation — 6 checks: missing `discord` section, missing `discord.channels`, missing `discord.server_id`, missing `discord.bot_token_env`, missing `discord.channels.updates`, missing `discord.mention_user_id`. Each throws with specific error message per TSPEC 7.2. Implementer follows one red-green cycle per check within this task — all 6 share one `validateStructure()` method and one `describe` block | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ✅ Done |
| 15 | Value validation — 4 checks: `server_id` is placeholder `"YOUR_SERVER_ID"`, `mention_user_id` is placeholder `"YOUR_USER_ID"`, `channels.updates` is empty string, `bot_token_env` is empty string. Each throws with actionable error message per TSPEC 7.3 | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ✅ Done |
| 16 | Happy path — valid config file returns typed `PtahConfig` with all fields correctly parsed | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ✅ Done |

### Phase E: StartCommand Core Logic (TDD)

Each task uses `FakeConfigLoader`, `FakeDiscordClient`, and `FakeLogger` for isolation. `StartCommand` accepts all three via constructor injection.

**Validation boundary:** Config-file validation (structural checks and placeholder detection per TSPEC §7.2–§7.3) is performed exclusively by `ConfigLoader.load()` (Tasks 14–15). `StartCommand` does **not** duplicate these checks — it relies on the config loader to reject invalid configs before returning. `StartCommand.execute()` adds only the runtime environment variable check (Task 18: `process.env[bot_token_env]`), which is a runtime concern outside the config loader's scope. TSPEC §6 steps 2a–2c describe what the overall startup flow validates, not additional checks in `StartCommand` — those validations are implemented inside `configLoader.load()` as part of step 1.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 17 | Happy path (orchestration test) — `execute()` loads config, validates env var, connects to Discord, resolves channel, registers listener, returns `StartResult` with cleanup function. This is a golden-path test validating the full orchestration sequence; individual error branches are tested in Tasks 18–24 | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ✅ Done |
| 18 | Env var validation — `execute()` throws `"Environment variable DISCORD_BOT_TOKEN is not set."` when `process.env[bot_token_env]` is empty/undefined. Note: this is the only validation `StartCommand` performs — config value validations (placeholders, empty strings) are handled by the config loader (Tasks 14–15) | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ✅ Done |
| 19 | Channel not found — `execute()` throws `"Channel #agent-updates not found in server."` when `findChannelByName` returns null | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ✅ Done |
| 20 | Discord connection failure — `execute()` propagates error from `discord.connect()` | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ✅ Done |
| 21 | Config loader error propagation — `execute()` propagates errors from `configLoader.load()` | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ✅ Done |
| 22 | Message detection — simulated thread message invokes handler; handler logs `"Message detected in thread: {thread-name} by {author}"` via logger. Test setup: call `execute()` first to register the message handler, then use `FakeDiscordClient.simulateMessage()` to trigger it, then assert on `FakeLogger` output | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ✅ Done |
| 23 | Cleanup function — calling `result.cleanup()` calls `discord.disconnect()` and logs shutdown message | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ✅ Done |
| 24 | Startup logging — `execute()` logs `"Connected to Discord server: {guild-name}"` after connect and `"Listening on #{channel-name}"` after channel resolution | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ✅ Done |

### Phase F: DiscordJsClient Implementation (TDD)

Unit tests use `createStubMessage()` factory from fixtures. `DiscordJsClient` accepts `Logger` via constructor injection (TSPEC 5.3).

**Mocking strategy for discord.js `Client`:** `DiscordJsClient` accepts a client factory `(options: ClientOptions) => Client` via constructor, defaulting to `(opts) => new Client(opts)` in production. Tests pass a factory that returns a stub — a minimal `EventEmitter`-based object with spied methods (`login`, `destroy`, `guilds.fetch`) cast as `unknown as Client`. This is consistent with the project's protocol-based DI pattern (constructor injection of dependencies). Tests control behavior by: (a) emitting events on the stub (e.g., `stub.emit("ready", stub)` for connect, `stub.emit("messageCreate", message)` for message handling), (b) configuring spy return values (e.g., `login` resolves, `guilds.fetch` returns a stub guild), (c) using fake timers (`vi.useFakeTimers()`) to test the 30-second connect timeout without waiting. The stub does not need to implement the full `Client` interface — only the subset that `DiscordJsClient` accesses.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 25 | Implement `createStubMessage()` factory with `StubMessageOptions` interface (TSPEC 13.4) — minimal plain objects cast as `unknown as Message`. Include smoke tests verifying: default values match TSPEC 13.4, each option overrides correctly, `isThread()` returns expected boolean | `ptah/tests/unit/fixtures/stub-message.test.ts` | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 26 | `connect()` — calls `client.login(token)`, resolves when `ready` fires. Rejects after 30 seconds if `ready` not received (connect timeout) | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ✅ Done |
| 27 | `disconnect()` — calls `client.destroy()` to close WebSocket. Instance is terminal after disconnect | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ✅ Done |
| 28 | `findChannelByName()` — returns channel ID for matching text channel, null if not found. Throws if guild not found or bot not a member | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ✅ Done |
| 29 | `onThreadMessage()` — filters: bot messages ignored, non-thread messages ignored, wrong parent channel ignored. Only matching thread messages invoke handler with converted `ThreadMessage` | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ✅ Done |
| 30 | `onThreadMessage()` error boundary — handler errors caught and logged via injected `Logger`; single bad message never crashes the process (TE Review T2) | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ✅ Done |
| 31 | `toThreadMessage()` conversion — all 9 fields mapped correctly from discord.js `Message`: `id`, `threadId`, `threadName`, `parentChannelId`, `authorId`, `authorName`, `isBot`, `content`, `timestamp` | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ✅ Done |
| 32 | `readThreadHistory()` — pagination up to 200 messages (2 API calls max), returns `ThreadMessage[]` sorted oldest-first. Empty thread returns `[]`. Logs warning if >200 messages | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ✅ Done |
| 33 | `DiscordJsClient` registers internal `warn`/`error` listeners on discord.js client, logs via injected `Logger` (TE Review G4) | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ✅ Done |

### Phase G: Concrete Service Implementations (Integration TDD)

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 34 | `NodeFileSystem.readFile()` — wraps `fs/promises.readFile(path, "utf-8")`. Throws raw Node.js error on failure (callers differentiate `ENOENT` vs other errors) | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ✅ Done |

### Phase H: CLI Entry Point

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 35 | Add `start` subcommand routing — wires `NodeFileSystem`, `ConsoleLogger`, `NodeConfigLoader`, `DiscordJsClient`, `StartCommand`. Existing `init` command unaffected | — | `ptah/bin/ptah.ts` | ✅ Done |
| 36 | Update help text — show both `init` and `start` commands per TSPEC Section 10 | `ptah/tests/integration/cli/ptah.test.ts` | `ptah/bin/ptah.ts` | ✅ Done |
| 37 | Signal handling — register `SIGINT`/`SIGTERM` handlers that call `result.cleanup()` then `process.exit(0)`. `shuttingDown` boolean guard prevents concurrent shutdown (TE Review T5). Shutdown logic extracted to `ptah/src/shutdown.ts` for testability; unit tests cover PROP-DI-13/14/47 | `ptah/tests/unit/shutdown.test.ts` | `ptah/src/shutdown.ts`, `ptah/bin/ptah.ts` | ✅ Done |

### Phase I: Integration Tests

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 38 | CLI — `ptah --help` output includes `start` command description | `ptah/tests/integration/cli/ptah.test.ts` | `ptah/bin/ptah.ts` | ✅ Done |
| 39 | CLI — `ptah start` without valid config exits with code 1 and actionable error message | `ptah/tests/integration/cli/ptah.test.ts` | `ptah/bin/ptah.ts` | ✅ Done |
| 40 | Config loader pipeline — write a valid `ptah.config.json` to a temp directory, run `NodeConfigLoader` + `NodeFileSystem` end-to-end, verify parsed `PtahConfig` matches expected values. Also test with missing file to verify real ENOENT propagation. Catches wiring bugs (path resolution, encoding) that unit tests with fakes cannot | `ptah/tests/integration/config/loader.test.ts` | `ptah/src/config/loader.ts` | ✅ Done |

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

## 4. Task Dependency Notes

- **Task 1** (dependencies) must complete before any discord.js-dependent tasks (Phase F).
- **Tasks 2–6** (protocols/types) must complete before Tasks 7–10 (test doubles) since fakes implement the protocols.
- **Tasks 7–10** (test doubles) must complete before Phase D and E (config loader, StartCommand) since all unit tests depend on fakes.
- **Task 11** (Logger) must complete before Tasks 17–24 (StartCommand) since StartCommand depends on Logger.
- **Tasks 12–16** (config loader) can proceed in parallel with Phase F (DiscordJsClient) after test doubles are ready.
- **Tasks 17–24** (StartCommand) depend on FakeConfigLoader, FakeDiscordClient, FakeLogger (Tasks 8–10).
- **Task 25** (createStubMessage) must complete before Tasks 26–33 (DiscordJsClient unit tests).
- **Task 34** (NodeFileSystem.readFile) is independent of StartCommand tests and can proceed after protocol is defined.
- **Tasks 35–37** (CLI entry point) depend on all Phase C–F tasks.
- **Tasks 38–39** (CLI integration tests) depend on all prior tasks.
- **Task 40** (config loader integration test) depends on Tasks 12–16 (config loader) and Task 34 (NodeFileSystem.readFile).

```
Phase A (1) → Phase B (2-10) → Phase C (11) → Phase E (17-24) → Phase H (35-37) → Phase I (38-39)
              Phase B (2-10) → Phase D (12-16) ───────────────→ Phase H (35-37) → Phase I (38-39)
Phase A (1) → Phase B (25)  → Phase F (26-33) ───────────────→ Phase H (35-37) → Phase I (38-39)
              Phase B (2)   → Phase G (34)    ───────────────→ Phase H (35-37) → Phase I (38-39)
              Phase D (12-16) + Phase G (34)  → Task 40 (config loader integration)
```

---

## 5. Integration Points with Phase 1

| # | Location | Change | Impact on Existing Code |
|---|----------|--------|------------------------|
| 1 | `ptah/src/services/filesystem.ts` | Add `readFile()` to `FileSystem` interface and `NodeFileSystem` | Additive — existing methods unchanged. `FakeFileSystem` must be extended. |
| 2 | `ptah/src/types.ts` | Add `PtahConfig`, `ThreadMessage`, `StartResult` types alongside existing `InitResult` | Additive — `InitResult` unchanged |
| 3 | `ptah/bin/ptah.ts` | Add `start` subcommand branch alongside existing `init` | Existing `init` logic unchanged. Signal handling added for `start` only. |
| 4 | `ptah/tests/fixtures/factories.ts` | Add `FakeConfigLoader`, `FakeDiscordClient`, `FakeLogger`, `createStubMessage` alongside existing `FakeFileSystem`, `FakeGitClient` | Existing test doubles unchanged. `FakeFileSystem` extended with `readFile()`. |
| 5 | `ptah/package.json` | Add `discord.js` as runtime dependency | First external runtime dependency |
| 6 | `ptah/tests/integration/cli/ptah.test.ts` | Add tests for `start` subcommand and updated help text | Existing `init` tests unchanged |

---

## 6. Definition of Done

- [x] All 40 tasks completed and status updated to ✅
- [x] All tests pass (`npx vitest run`) — 0 failures, 204 tests across 16 files. Phase 2 added ~100 tests.
- [x] No skipped or pending tests
- [x] Code reviewed against requirement acceptance criteria (REQ-DI-01, REQ-DI-02, REQ-DI-03)
- [x] Implementation matches TSPEC-ptah-discord-bot.md (protocols, algorithm, error handling, test doubles)
- [x] TE Review residual items addressed (R1: FakeDiscordClient async handlers, R2: isNodeError utility)
- [x] Existing Phase 1 tests remain green (no regressions)
- [x] Changes committed in logical units with `type(scope): description` format
- [x] Pushed to remote for review
