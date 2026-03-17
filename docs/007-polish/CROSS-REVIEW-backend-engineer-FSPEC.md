# Cross-Review: Backend Engineer — FSPEC-PTAH-PHASE7

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | [007-FSPEC-polish.md](./007-FSPEC-polish.md) v2.0 |
| **Date** | March 16, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Findings

### F-01 — HIGH: Config schema migration touches more live modules than the migration note implies

**Location:** FSPEC-EX-01 §4.1 migration note; REQ §5 Risks

The migration note correctly flags that `AgentConfig` → `agents[]` is a breaking change, but the downstream call-site impact is broader than the note conveys. Three live modules read the old schema directly:

1. **`router.ts` `decide()`** (line 147): validates routing targets against `config.agents.active`. Must be replaced with registry lookup.
2. **`router.ts` `resolveHumanMessage()`** (lines 105, 115): reads `config.agents.role_mentions[roleId]` to resolve @mentions. Must be replaced with `agents[].mention_id` lookup.
3. **`response-poster.ts` `resolveColour()`** (line 77): reads `config.agents.colours[agentId]`. This method is eliminated entirely by FSPEC-DI-03 (agent responses → plain text, embed colors are now fixed per type). Also affects `createCoordinationThread()` (line 177) which also calls `resolveColour()`.

The FSPEC is self-consistent — FSPEC-DI-03 removes per-agent colors and FSPEC-EX-01 removes the old config structure. But the TSPEC needs to scope all three modules explicitly. No FSPEC change required; flagging for TSPEC attention.

---

### F-02 — HIGH: `DiscordClient` protocol has no `archiveThread` method — confirmed scope gap

**Location:** FSPEC-DI-02 §3.3 Step 5; services/discord.ts

The live `DiscordClient` interface has no thread-archive operation. The REQ risk entry says "Engineering verifies during TSPEC research." From codebase inspection, this is a **confirmed gap** — `archiveThread(threadId: string): Promise<void>` must be added to the `DiscordClient` protocol and implemented in `DiscordJsClient`. The discord.js `ThreadChannel` type does expose `.setArchived(true)`, so the capability is available in the underlying library.

**Request:** Recommend adding a sentence to FSPEC-DI-02 §3.5 Inputs and Outputs noting that Discord MCP thread-archive support must be added to the `DiscordClient` protocol as a Phase 7 deliverable. This prevents the TSPEC from treating it as an open question rather than a known scope item.

---

### F-03 — HIGH: Logger interface requires protocol change to support component-scoped log lines

**Location:** FSPEC-LG-01 §7.2, §7.3; services/logger.ts

The live `Logger` interface is:
```ts
info(message: string): void
warn(message: string): void
error(message: string): void
debug(message: string): void
```

FSPEC-LG-01 requires every log line to carry a specific `{component}` value per call site (e.g., `[ptah:router]`, `[ptah:skill-invoker]`). The current `ConsoleLogger` uses a single fixed `[ptah]` prefix. There are two implementation paths:

- **Option A:** Add a `component` parameter to all Logger methods — breaks every call site
- **Option B:** Add a `forComponent(component: string): Logger` factory — call sites get a scoped logger instance at construction time, minimal downstream breakage

The FSPEC does not need to prescribe which option. But it should acknowledge that the `Logger` interface itself is a migration target — not just a string-prefix change. As written, FSPEC-LG-01 could be misread as "just prepend the string in the call site," which would add unstructured strings rather than a testable contract.

**Request:** Add a note to FSPEC-LG-01 §7.5 Business Rules (or §7.1) clarifying that the component prefix is a Logger-level concern, not a per-call-site string concatenation, so that the TSPEC designs the Logger protocol accordingly.

---

### F-04 — MEDIUM: `DiscordClient` has no `postPlainMessage` method — required for agent response text after FSPEC-DI-03

**Location:** FSPEC-DI-03 §5.4; services/discord.ts

After Phase 7, `postAgentResponse()` must post plain text (not embeds). The live `DiscordClient` interface has:
- `postEmbed()` — embeds only
- `postSystemMessage()` — actually calls `postEmbed()` internally (discord.ts line 210), so it's also embed-based
- No `postPlainMessage(threadId, content)` or equivalent

Plain message posting to a thread requires a separate Discord API call (`channel.send({ content })` rather than `channel.send({ embeds: [...] })`). A new method must be added to the `DiscordClient` protocol.

**Request:** Add a note to FSPEC-DI-03 §5.4 flagging that `DiscordClient` requires a new `postPlainMessage` method to implement the agent-response plain-text change. This keeps TSPEC scope explicit.

---

### F-05 — LOW: `postCompletionEmbed` signature does not match Resolution Notification schema

**Location:** FSPEC-DI-03 §5.3.2, BR-DI-03-03; response-poster.ts line 14

The live `postCompletionEmbed(threadId, agentId, config)` generates: title `"Task Complete"`, description `"{agentName} has completed the task."`. The FSPEC-DI-03 Resolution Notification schema requires: title `"✅ Thread Resolved"`, color `0x57F287`, body fields `Signal` and `Resolved by`, footer `"Ptah Orchestrator"`. The existing method is at best a starting-point stub. BR-DI-03-03 says "Engineering determines whether to refactor or replace" — that covers it. No FSPEC change needed, just flagging for TSPEC awareness.

---

## Clarification Questions

### Q-01: Discord MCP vs. discord.js — which client handles archiving?

The FSPEC uses "Discord MCP" throughout but the current `DiscordJsClient` is a direct discord.js wrapper (no MCP layer in the source). Is "Discord MCP" used as a generic term for "the Discord client layer," or is there a planned MCP-based client that replaces `DiscordJsClient`? The answer affects where `archiveThread` is implemented (new method in `DiscordJsClient` vs. a new MCP-based client).

### Q-02: `archive_on_resolution` key placement — nested under `orchestrator` or top-level?

FSPEC §2.3 Configuration Keys table lists it as `orchestrator.archive_on_resolution`. The live `PtahConfig.orchestrator` block in `types.ts` (line 55–65) uses camelCase keys for all existing orchestrator config. The FSPEC uses snake_case consistent with `ptah.config.json`. Confirming the nesting path is `ptah.config.json → orchestrator → archive_on_resolution` (not `orchestrator.archiveOnResolution`) would prevent a TSPEC ambiguity.

---

## Positive Observations

- **Signal naming is clean.** v2.0 correctly uses live signal types (`LGTM`, `TASK_COMPLETE`, `ROUTE_TO_USER`, `ROUTE_TO_AGENT`) throughout. These match `RoutingSignalType` in `types.ts` exactly.
- **Registry-before-MCP ordering in FSPEC-DI-02 §3.3** is correct. Checking the in-memory registry before making the MCP call for idempotency (BR-DI-02-04) is the right design and maps directly to a testable invariant.
- **Embed color integers are exact.** Specifying `0x5865F2`, `0x57F287`, `0xED4245`, `0xFEE75C` as exact integers (not named colors) is testable and eliminates ambiguity.
- **FSPEC-EX-01 validation rules are complete and implementable.** Required field checks, `id` format validation (lowercase alphanumeric + hyphens), duplicate `id` and `mention_id` detection, and skip-not-fatal behavior are all well-specified. They map directly to unit tests.
- **Error scenario enumeration in FSPEC-RP-01** (ERR-RP-01 through ERR-RP-05) with exact field templates is excellent — this enables testing error message content without ambiguity.
- **FSPEC-OB-01 lifecycle completeness table (§8.3)** is valuable — it explicitly maps observable states to log event IDs, making acceptance test authoring straightforward.
- **OQ-07-01 and OQ-07-02 are resolved with clear assumptions.** No ambiguity left for engineering.

---

## Recommendation

**Approved with minor changes.**

Four items warrant small additions to the FSPEC before TSPEC begins (F-02, F-03, F-04) to prevent scope ambiguity in engineering. F-01 and F-05 are TSPEC-level concerns, no FSPEC edit needed. Q-01 and Q-02 are low-risk clarifications that can be resolved in TSPEC if PM confirmation is not needed.

The FSPEC is behaviorally complete and technically sound. The acceptance tests are specific and directly implementable as unit/integration tests. Ready to proceed to TSPEC once the three requested additions are made.

---

*End of Review*
