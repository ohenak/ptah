# TE Review: Phase 2 Discord Bot — Properties, Plan, and Implementation

| Field | Detail |
|-------|--------|
| **Documents Reviewed** | 002-PROPERTIES-ptah-discord-bot.md (v1.1), 002-PLAN-TSPEC-ptah-discord-bot.md, 002-TSPEC-ptah-discord-bot.md (Rev 3) |
| **Implementation State** | All source and test files implemented; 197 tests passing (15 test files) |
| **Date** | March 9, 2026 |
| **Reviewer** | Test Engineer |

---

## 1. Summary

Phase 2 implementation is substantially complete with 197 passing tests. The properties document is well-structured with 62 testable properties achieving full requirement and specification coverage. However, this review identifies **3 specification–implementation mismatches**, **5 untested properties**, **1 missing implementation**, and **2 documentation maintenance items** that should be addressed before approval.

---

## 2. Specification–Implementation Mismatches

### M-01: Startup log message missing guild name (PROP-DI-48)

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Property** | PROP-DI-48 |
| **Spec Reference** | TSPEC §6 step 3b |

**Expected (per TSPEC §6 step 3b and PROP-DI-48):**
> `logger.info("Connected to Discord server: {guild-name}")`

**Actual ([start.ts:27](ptah/src/commands/start.ts#L27)):**
> `logger.info("Connected to Discord server")`

**Root cause:** `discord.connect(token)` returns `Promise<void>` — the guild name is not available to `StartCommand` after connection. The `DiscordClient` protocol provides no mechanism to retrieve the guild name post-connect.

**Test ([start.test.ts:159](ptah/tests/unit/commands/start.test.ts#L159)):** Asserts the current (incomplete) message — test passes but doesn't match the spec.

**Question Q-01:** Should `connect()` be updated to return guild metadata (e.g., guild name), or should TSPEC §6 step 3b and PROP-DI-48 be amended to drop the `{guild-name}` placeholder? The simplest fix is to amend the spec since the guild name is cosmetic for logging.

---

### M-02: Connect-after-disconnect guard not implemented (PROP-DI-61)

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Property** | PROP-DI-61 |
| **Spec Reference** | TSPEC §12.3 |

**Expected (per PROP-DI-61):**
> DiscordJsClient must throw `"Cannot connect: client has been destroyed. Create a new DiscordJsClient instance."` when `connect()` is called after `disconnect()`.

**Actual ([discord.ts:59-76](ptah/src/services/discord.ts#L59-L76)):** No terminal-state guard exists. After `disconnect()`, calling `connect()` will attempt `client.login()` on a destroyed discord.js Client, which may throw an opaque discord.js error instead of the specified user-friendly message.

**No test exists** for this behavior.

**Question Q-02:** Should the implementation add a `destroyed` boolean flag checked at the top of `connect()`, or is this deferred given Phase 2 never calls connect-after-disconnect?

---

### M-03: TSPEC §6 steps 2a–2c validation boundary ambiguity

| Field | Detail |
|-------|--------|
| **Severity** | Low (informational) |
| **Spec Reference** | TSPEC §6 steps 2a–2c |

TSPEC §6 lists steps 2a–2c (placeholder checks for `server_id`, `mention_user_id`, `channels.updates`) under "StartCommand Algorithm". However, the execution plan's Task 17–24 section explicitly clarifies:

> "Config-file validation... is performed exclusively by ConfigLoader.load() (Tasks 14–15). StartCommand does not duplicate these checks."

The implementation correctly places these validations in `NodeConfigLoader` (Tasks 14–15). StartCommand only validates the runtime env var (step 2d). **This is correct behavior** — the TSPEC §6 algorithm describes the overall startup flow, not necessarily what lives inside `StartCommand.execute()`. However, the ambiguity could mislead future implementers.

**Recommendation:** Add a clarifying note to TSPEC §6 step 2: "Steps 2a–2c are performed inside `configLoader.load()` (Section 7.2–7.3). Step 2d is performed by StartCommand directly."

---

## 3. Untested Properties

The following properties from the properties document have no corresponding automated test:

| # | Property | Test Level | Gap Description | Risk |
|---|----------|------------|-----------------|------|
| 1 | PROP-DI-13 | Integration | Signal handler (SIGINT) — Plan Task 37 specifies child-process-spawn tests, but no SIGINT/SIGTERM integration tests exist in `ptah.test.ts` | **High** — signal handling is critical for graceful shutdown; currently only verified by code review of `bin/ptah.ts` |
| 2 | PROP-DI-14 | Integration | Signal handler (SIGTERM) — same as above | **High** — same as PROP-DI-13 |
| 3 | PROP-DI-47 | Integration | `shuttingDown` boolean guard preventing concurrent signal execution — no test | **Medium** — guard exists in code but untested; concurrent signals could cause double-cleanup |
| 4 | PROP-DI-46 | Unit | `client.destroy()` idempotent — no test that disconnect can be safely called twice | **Low** — discord.js documents this as a no-op, but no automated verification |
| 5 | PROP-DI-15 | Unit | Gateway intents (Guilds, GuildMessages, MessageContent) — not explicitly asserted in any test | **Low** — intents are set in the constructor; a wrong intent would cause runtime failures in live testing |

**Impact:** PROP-DI-13 and PROP-DI-14 are the highest-risk gaps. Plan Task 37 describes the exact test approach (spawn child process, send SIGINT, verify exit code 0 and shutdown log output) but the tests were not implemented. These are **P0 integration properties** that should be addressed before Phase 2 approval.

---

## 4. Properties Document Feedback

### Positive Observations

- **Thorough derivation:** 62 properties cover all 3 requirements and all 14 TSPEC sections with no gaps in the coverage matrix
- **Good negative properties:** 9 negative properties capture important "must NOT" behaviors (PROP-DI-54 through PROP-DI-62)
- **Test pyramid balance:** 82% unit / 15% integration / 3% code review is appropriate for a protocol-based DI architecture
- **Code review properties well-justified:** PROP-DI-45 (token leak) and PROP-DI-62 (ThreadMessage boundary) are correctly classified as design constraints

### Minor Feedback

| # | Item | Category | Detail |
|---|------|----------|--------|
| F-01 | PROP-DI-48 message text | Accuracy | Update property text to match actual implementation or resolve Q-01 |
| F-02 | PROP-DI-09 cleanup log message | Accuracy | Property says "log shutdown message" (generic). Implementation logs `"Disconnected from Discord."`. TSPEC §6 lists `"Disconnected from Discord. Goodbye."` in `bin/ptah.ts` shutdown handler. Clarify which log messages belong to the cleanup function vs the signal handler. Currently: cleanup logs "Disconnected from Discord." and the signal handler (bin/ptah.ts) additionally logs "Shutting down..." before and "Disconnected from Discord. Goodbye." after. |
| F-03 | Property count | Consistency | Properties doc header says "53 positive + 9 negative = 62 total". Count of positive properties in sections 3.1–3.8: 15+6+12+4+6+2+2+6 = 53. Correct. |

---

## 5. Execution Plan Feedback

### P-01: Plan status not updated

All 40 tasks show "⬚ Not Started" despite full implementation. Plan should be updated to reflect current status (✅ Done for all implemented tasks, or the specific status per task).

### P-02: Task 37 (Signal handling tests) not implemented

Plan Task 37 specifies:
> "Signal handling — register SIGINT/SIGTERM handlers... Tests use child process spawn approach (consistent with Phase 1 CLI integration tests): spawn `ptah start`, send SIGINT, verify exit code 0 and shutdown log output"

These tests do not exist in `ptah.test.ts`. This is the most significant implementation gap found in this review.

**Suggested approach:** Spawn `ptah start` with a mock config that causes startup to succeed but connects to no real Discord server (this may require a test-specific config or env var override). Alternatively, test the shutdown function in isolation at the unit level by extracting it from `bin/ptah.ts`.

### P-03: Test count vs estimate

Plan estimates 60–75 Phase 2 tests. Actual Phase 2-specific test count (excluding Phase 1 carryover):

| File | Phase 2 Tests |
|------|--------------|
| start.test.ts | 9 |
| loader.test.ts | 18 |
| discord.test.ts | 21 |
| logger.test.ts | 3 |
| fake-discord-client.test.ts | 10 |
| stub-message.test.ts | 19 |
| fake-filesystem.test.ts (readFile additions) | ~5 |
| integration/config/loader.test.ts | 2 |
| integration/cli/ptah.test.ts (Phase 2 additions) | ~3 |
| integration/services/filesystem.test.ts (readFile additions) | ~2 |
| **Total** | **~92** |

This exceeds the 60–75 estimate, largely due to thorough test double testing (stub-message: 19 tests, fake-discord-client: 10 tests). This is a positive outcome.

---

## 6. Implementation Quality Observations

### Strengths

1. **Clean protocol-based DI**: All dependencies are injected via constructors; no hard-coded implementations in business logic
2. **Error messages are actionable**: Every error tells the user what to do next (e.g., "Run 'ptah init' first", "Edit ptah.config.json with your Discord server ID")
3. **Consistent test patterns**: All unit tests follow the same setup pattern (fakes in beforeEach, focused assertions)
4. **Error boundary in message handler**: Try/catch around handler invocation in `onThreadMessage()` correctly prevents single-message failures from crashing the process
5. **Pagination logic is correct**: `readThreadHistory()` correctly uses `before: oldestId` for the second batch and sorts oldest-first

### Minor Observations

| # | File | Line | Observation |
|---|------|------|------------|
| O-01 | discord.ts | 80 | `disconnect()` is marked `async` but `client.destroy()` is synchronous — the async wrapper is correct for protocol conformance but adds no await. Harmless. |
| O-02 | start.test.ts | 43-58 | Happy path test ("orchestrates full startup sequence") could be enriched. It checks `connected`, `loginToken`, `registeredHandlers`, and `cleanup` type — but doesn't assert that `configLoader.load()` was called or that `findChannelByName` was called with correct args (`"test-server-123"`, `"agent-updates"`). This would strengthen PROP-DI-01 coverage. |
| O-03 | discord.test.ts | 82 | `findChannelByName` test uses `type: 0` (magic number). The implementation uses `ChannelType.GuildText`. Test should import and use `ChannelType.GuildText` for consistency and to catch enum value drift. |

---

## 7. Questions for Resolution

| # | Question | Context | Options |
|---|----------|---------|---------|
| Q-01 | Should the "Connected to Discord server" log include the guild name? | TSPEC §6 step 3b specifies `{guild-name}` but `connect()` returns void | A) Amend spec to drop guild name. B) Change `connect()` to return `{ guildName: string }`. C) Add a `getGuildName()` method to DiscordClient protocol. |
| Q-02 | Should `DiscordJsClient.connect()` enforce connect-after-disconnect guard? | PROP-DI-61 specifies this but it's not implemented | A) Implement now (add `destroyed` flag). B) Defer — Phase 2 never calls connect after disconnect. |
| Q-03 | How should signal handling (SIGINT/SIGTERM) be integration-tested? | Task 37 specifies child process spawn but `ptah start` requires a real Discord connection to succeed | A) Extract shutdown logic into a testable function. B) Use a test-only flag/env var to stub Discord connect. C) Accept as manually-tested for Phase 2 and add proper tests in Phase 3 when there's a test harness. |
| Q-04 | Should the plan status be updated to reflect implementation completion? | All 40 tasks are implemented but marked "Not Started" | A) Update all statuses now. B) Leave as-is since the plan is a planning artifact. |

---

## 8. Recommendation

**Conditional approval** — the properties document is comprehensive and well-structured. Before final approval:

1. **Must fix:** Implement signal handling integration tests (PROP-DI-13, PROP-DI-14) or document an agreed-upon alternative testing approach — these are P0 properties
2. **Should fix:** Resolve Q-01 (startup log guild name mismatch) and Q-02 (connect-after-disconnect guard)
3. **Nice to have:** Update plan task statuses; add explicit tests for PROP-DI-46 and PROP-DI-15; enrich happy path StartCommand assertions (O-02)

---

*End of Review*
