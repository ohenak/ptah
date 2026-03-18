# Test Properties Document

## Phase 7 — Polish

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-PTAH-PHASE7 |
| **Requirements** | [007-REQ-polish](./007-REQ-polish.md) |
| **Specifications** | [007-FSPEC-polish](./007-FSPEC-polish.md), [007-TSPEC-polish](./007-TSPEC-polish.md) |
| **Execution Plan** | N/A — not yet produced |
| **Version** | 1.1 |
| **Date** | March 17, 2026 |
| **Author** | Test Engineer |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview

Phase 7 (Polish) delivers six production-readiness improvements to the Ptah Orchestrator: thread archiving on resolution signal, configuration-driven agent extensibility with a breaking config schema migration, structured `[ptah:{component}] LEVEL: message` log output via a refactored Logger protocol, operator observability via ten mandatory lifecycle log events, Discord rich embed formatting for four Orchestrator message types (with agent response text moving to plain messages), and human-readable error messages with actionable guidance for five failure categories.

This document catalogs all testable invariants derived from REQ-PTAH-P7, the FSPEC (v2.2), and the TSPEC (v1.5), across six requirement domains.

### 1.1 Scope

**In scope:**
- Thread archiving on LGTM / TASK_COMPLETE signals (REQ-DI-06 / FSPEC-DI-02)
- Discord embed formatting — four Orchestrator embed types + plain agent responses (REQ-DI-10 / FSPEC-DI-03)
- Error message UX — five error types with human-readable Discord output (REQ-RP-06 / FSPEC-RP-01)
- Configuration-driven agent extensibility — AgentEntry[] schema migration (REQ-NF-08 / FSPEC-EX-01)
- Structured log output — ComponentLogger + `[ptah:{component}] LEVEL: message` format (REQ-NF-09 / FSPEC-LG-01)
- Operator observability — EVT-OB-01 through EVT-OB-10 lifecycle log events (REQ-NF-10 / FSPEC-OB-01)

**Out of scope:**
- Pre-Phase 7 routing logic, PDLC state machine, skill invocation retry mechanism — these are Phase 3/4/5 scope
- Per-thread archive opt-out — REQ document explicitly excludes this
- External observability integrations (Datadog, Sentry)
- Automated config migration script — explicitly out of scope per REQ-NF-08 risks

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 6 | [007-REQ-polish](./007-REQ-polish.md) — REQ-DI-06, REQ-DI-10, REQ-RP-06, REQ-NF-08, REQ-NF-09, REQ-NF-10 |
| FSPEC sections analyzed | 6 | FSPEC-DI-02, FSPEC-DI-03, FSPEC-RP-01, FSPEC-EX-01, FSPEC-LG-01, FSPEC-OB-01 |
| TSPEC sections reviewed | All | [007-TSPEC-polish](./007-TSPEC-polish.md) v1.5 |
| Plan tasks reviewed | 0 | N/A — PLAN not yet produced |
| Integration boundaries identified | 5 | DiscordClient↔Orchestrator, AgentRegistry↔Router, AgentRegistry↔SkillInvoker, Logger↔all 8 modules, ResponsePoster↔DiscordClient |
| Implementation files reviewed | 0 | N/A — not yet implemented |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 33 | REQ-DI-06, REQ-DI-10, REQ-RP-06, REQ-NF-08, REQ-NF-09, REQ-NF-10 | Unit |
| Contract | 6 | REQ-DI-06, REQ-DI-10, REQ-NF-08, REQ-NF-09 | Unit / Integration |
| Error Handling | 9 | REQ-DI-06, REQ-DI-10, REQ-RP-06, REQ-NF-08 | Unit |
| Data Integrity | 4 | REQ-NF-08, REQ-NF-10 | Unit |
| Integration | 4 | REQ-DI-06, REQ-NF-08, REQ-NF-09 | Integration |
| Security | 3 | REQ-RP-06 | Unit |
| Idempotency | 2 | REQ-DI-06, REQ-NF-08 | Unit |
| Observability | 10 | REQ-NF-10 | Unit |
| **Total** | **71** | | |

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-{DOMAIN}-{NUMBER}` — domain prefix matches the requirement domain.

**Priority:** Inherited from the highest-priority linked requirement (all Phase 7 requirements are P1).

### 3.1 Functional Properties

Core business logic and behavior.

#### Thread Archiving (REQ-DI-06 / FSPEC-DI-02)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-01 | Orchestrator must call `DiscordClient.archiveThread()` for a thread after receiving a `LGTM` or `TASK_COMPLETE` routing signal when `archive_on_resolution` is `true` (or absent) | [REQ-DI-06], [FSPEC-DI-02 §3.2] | Unit | P1 |
| PROP-DI-02 | Orchestrator must post Skill response content to Discord BEFORE calling `archiveThread()` | [REQ-DI-06], [FSPEC-DI-02 §3.3 step 1b], [BR-DI-02-01] | Unit | P1 |
| PROP-DI-03 | Orchestrator must complete the artifact commit pipeline BEFORE calling `archiveThread()` | [REQ-DI-06], [FSPEC-DI-02 §3.3 step 1c], [BR-DI-02-02] | Unit | P1 |
| PROP-DI-04 | Orchestrator must mark the thread as `closed` in the thread registry ONLY after `archiveThread()` returns successfully | [REQ-DI-06], [FSPEC-DI-02 §3.3 step 6], [BR-DI-02-03] | Unit | P1 |
| PROP-DI-05 | Orchestrator must skip `archiveThread()` and log at DEBUG level when `archive_on_resolution` is `false` | [REQ-DI-06], [FSPEC-DI-02 §3.3 step 3b], [BR-DI-02-05] | Unit | P1 |
| PROP-DI-06 | Orchestrator must default `archive_on_resolution` to `true` and proceed with archiving when the config key is absent | [REQ-DI-06], [FSPEC-DI-02 §3.6] | Unit | P1 |
| PROP-DI-07 | Orchestrator must log a WARN and default to `true` when `archive_on_resolution` is present but not a boolean | [REQ-DI-06], [FSPEC-DI-02 §3.3 step 3d], [FSPEC-DI-02 §3.6] | Unit | P1 |
| PROP-DI-08 | Orchestrator must treat a "Thread not found" error from `archiveThread()` as success, log WARN, and update the thread registry | [REQ-DI-06], [FSPEC-DI-02 §3.5], [FSPEC-DI-02 §3.6] | Unit | P1 |

#### Embed Formatting (REQ-DI-10 / FSPEC-DI-03)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-09 | `ResponsePoster.postRoutingNotificationEmbed()` must post an embed with color `0x5865F2`, title `↗ Routing to {display_name}`, and footer `Ptah Orchestrator` | [REQ-DI-10], [FSPEC-DI-03 §5.3.1] | Unit | P1 |
| PROP-DI-10 | `ResponsePoster.postResolutionNotificationEmbed()` must post an embed with color `0x57F287`, title `✅ Thread Resolved`, signal-type body field, and footer `Ptah Orchestrator` | [REQ-DI-10], [FSPEC-DI-03 §5.3.2] | Unit | P1 |
| PROP-DI-11 | `ResponsePoster.postUserEscalationEmbed()` must post an embed with color `0xFEE75C`, title `❓ Input Needed`, question body field, and footer `Ptah Orchestrator` | [REQ-DI-10], [FSPEC-DI-03 §5.3.4] | Unit | P1 |
| PROP-DI-12 | `ResponsePoster.postErrorReportEmbed()` must post an embed with color `0xED4245`, title beginning `⚠ Error`, "What happened" and "What to do" body fields, and footer `Ptah Orchestrator` | [REQ-DI-10], [FSPEC-DI-03 §5.3.3] | Unit | P1 |
| PROP-DI-13 | `postAgentResponse()` must post agent-authored text via `DiscordClient.postPlainMessage()` (plain message, not an embed) | [REQ-DI-10], [FSPEC-DI-03 §5.4] | Unit | P1 |
| PROP-DI-14 | `postAgentResponse()` must split text at 2000-character boundaries, posting each chunk as a separate `postPlainMessage()` call | [REQ-DI-10], [FSPEC-DI-03 §5.4], [TSPEC §4.2.4] | Unit | P1 |
| PROP-DI-15 | `createCoordinationThread()` must post a Routing Notification embed (color `0x5865F2`) instead of a per-agent color embed | [REQ-DI-10], [FSPEC-DI-03 §5.4], [TSPEC §4.2.4] | Unit | P1 |

#### Config-Driven Extensibility (REQ-NF-08 / FSPEC-EX-01)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-EX-01 | `buildAgentRegistry()` must register a valid agent entry with `id`, `skill_path`, `log_file`, and `mention_id` without requiring Orchestrator code changes | [REQ-NF-08], [FSPEC-EX-01 §4.1], [AT-EX-01-01] | Unit | P1 |
| PROP-EX-02 | `buildAgentRegistry()` must skip any agent entry missing a required field (`id`, `skill_path`, `log_file`, or `mention_id`), push an `AgentValidationError`, and continue processing remaining entries | [REQ-NF-08], [FSPEC-EX-01 §4.3 step 2a], [AT-EX-01-02] | Unit | P1 |
| PROP-EX-03 | `buildAgentRegistry()` must skip an agent entry where the `skill_path` file does not exist, push an `AgentValidationError` with `field: 'skill_path'`, and continue | [REQ-NF-08], [FSPEC-EX-01 §4.3 step 2c], [AT-EX-01-03] | Unit | P1 |
| PROP-EX-04 | `buildAgentRegistry()` must skip an agent entry where the `log_file` does not exist, push an `AgentValidationError` with `field: 'log_file'`, and continue | [REQ-NF-08], [FSPEC-EX-01 §4.3 step 2d] | Unit | P1 |
| PROP-EX-05 | `buildAgentRegistry()` must skip agent entries with an `id` that doesn't match `/^[a-z0-9-]+$/`, push an `AgentValidationError`, and continue | [REQ-NF-08], [FSPEC-EX-01 §4.3 step 2b] | Unit | P1 |
| PROP-EX-06 | `buildAgentRegistry()` must skip an entry with a duplicate `id`, push an `AgentValidationError`, and log WARN — first entry wins | [REQ-NF-08], [FSPEC-EX-01 §4.6 BR-EX-01-03], [AT-EX-01-05] | Unit | P1 |
| PROP-EX-07 | `buildAgentRegistry()` must skip an entry with a duplicate `mention_id`, push an `AgentValidationError`, and log WARN — first entry wins | [REQ-NF-08], [FSPEC-EX-01 §4.6 BR-EX-01-04], [AT-EX-01-06] | Unit | P1 |
| PROP-EX-08 | `buildAgentRegistry()` must use the agent's `id` as `display_name` when the optional `display_name` field is absent | [REQ-NF-08], [FSPEC-EX-01 §4.6 BR-EX-01-07], [AT-EX-01-07] | Unit | P1 |
| PROP-EX-09 | `buildAgentRegistry()` must log the count and IDs of successfully registered agents at INFO level after processing all entries | [REQ-NF-08], [FSPEC-EX-01 §4.3 step 3a] | Unit | P1 |
| PROP-EX-10 | `DefaultRoutingEngine.resolveHumanMessage()` must resolve @mention routing via `AgentRegistry.getAgentByMentionId()`, not via `config.agents.role_mentions` | [REQ-NF-08], [TSPEC §4.2.6] | Unit | P1 |
| PROP-EX-11 | `DefaultRoutingEngine.decide()` must validate `ROUTE_TO_AGENT` target IDs via `AgentRegistry.getAgentById()`, not via `config.agents.active` | [REQ-NF-08], [TSPEC §4.2.6] | Unit | P1 |

#### Structured Logging (REQ-NF-09 / FSPEC-LG-01)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-LG-01 | `ComponentLogger` must format every log line as `[ptah:{component}] {LEVEL}: {message}` where `{component}` is the value passed to `forComponent()` | [REQ-NF-09], [FSPEC-LG-01 §7.2], [TSPEC §4.2.1] | Unit | P1 |
| PROP-LG-02 | `Logger.forComponent()` must return a scoped Logger instance that prefixes all log calls with the given component — the component is NOT prepended at the call site | [REQ-NF-09], [FSPEC-LG-01 §7.5 BR-LG-01-05], [TSPEC §4.2.1] | Unit | P1 |
| PROP-LG-03 | `ComponentLogger` must route `WARN` and `ERROR` level messages to `console.error` and `DEBUG`/`INFO` to `console.log` | [REQ-NF-09], [TSPEC §4.2.1] | Unit | P1 |

#### Error Message UX (REQ-RP-06 / FSPEC-RP-01)

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-RP-01 | `buildErrorMessage()` must return an `ErrorMessage` with populated `title`, `whatHappened`, and `whatToDo` fields for each of the five error types (ERR-RP-01 through ERR-RP-05) | [REQ-RP-06], [FSPEC-RP-01 §6.2], [TSPEC §4.2.5] | Unit | P1 |
| PROP-RP-02 | `buildErrorMessage(ERR-RP-01, context)` must include `context.agentDisplayName` and `context.maxRetries` in the message body | [REQ-RP-06], [FSPEC-RP-01 §6.2 ERR-RP-01] | Unit | P1 |
| PROP-RP-03 | `buildErrorMessage(ERR-RP-02, context)` must include `context.agentId` and a reference to `ptah.config.json` in the message body | [REQ-RP-06], [FSPEC-RP-01 §6.2 ERR-RP-02] | Unit | P1 |
| PROP-RP-04 | Every `buildErrorMessage()` output must include at least one concrete actionable suggestion in `whatToDo` | [REQ-RP-06], [FSPEC-RP-01 §6.3 BR-RP-01-02] | Unit | P1 |

---

### 3.2 Contract Properties

API request/response shape, protocol compliance, and type conformance.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-16 | `DiscordClient` protocol must expose `archiveThread(threadId: string): Promise<void>` | [REQ-DI-06], [FSPEC-DI-02 §3.5 protocol note], [TSPEC §4.2.2] | Unit | P1 |
| PROP-DI-17 | `DiscordClient` protocol must expose `postPlainMessage(threadId: string, content: string): Promise<void>` | [REQ-DI-10], [FSPEC-DI-03 §5.4 protocol note], [TSPEC §4.2.2] | Unit | P1 |
| PROP-EX-12 | `AgentRegistry` protocol must expose `getAgentById(id: string): RegisteredAgent | null`, `getAgentByMentionId(mentionId: string): RegisteredAgent | null`, and `getAllAgents(): RegisteredAgent[]` | [REQ-NF-08], [FSPEC-EX-01 §4.1], [TSPEC §4.2.3] | Unit | P1 |
| PROP-EX-13 | `buildAgentRegistry()` must return `{ registry: AgentRegistry, errors: AgentValidationError[] }` where each `AgentValidationError` includes `index`, `field`, and `reason` | [REQ-NF-08], [TSPEC §4.2.3] | Unit | P1 |
| PROP-LG-04 | `Logger` protocol must expose `forComponent(component: Component): Logger` where `Component` is the canonical union type from `src/types.ts` | [REQ-NF-09], [FSPEC-LG-01 §7.5 BR-LG-01-05], [TSPEC §4.2.1] | Unit | P1 |
| PROP-RP-05 | `ResponsePoster` protocol must expose the four typed embed methods: `postRoutingNotificationEmbed()`, `postResolutionNotificationEmbed()`, `postErrorReportEmbed()`, and `postUserEscalationEmbed()` — replacing the old `postCompletionEmbed`, `postErrorEmbed`, and `postProgressEmbed` | [REQ-DI-10], [TSPEC §4.2.4] | Unit / Integration | P1 |

---

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-18 | Orchestrator must treat `archiveThread()` failure (network error, permissions error) as non-fatal: log WARN, continue processing, and do NOT update the thread registry | [REQ-DI-06], [FSPEC-DI-02 §3.4 BR-DI-02-03], [AT-DI-02-05] | Unit | P1 |
| PROP-DI-19 | `ResponsePoster` must fall back to `postPlainMessage()` with the type-specific plain-text fallback string (per FSPEC-DI-03 §5.6) when an embed creation call fails | [REQ-DI-10], [FSPEC-DI-03 §5.6], [TSPEC §4.2.4] | Unit | P1 |
| PROP-DI-20 | `ResponsePoster` must truncate embed field values with `…` when they exceed Discord character limits — it must not crash or skip the message | [REQ-DI-10], [FSPEC-DI-03 §5.6], [TSPEC §8] | Unit | P1 |
| PROP-EX-14 | `buildAgentRegistry()` must log WARN and return an empty (but valid) registry when the `agents` key is absent or the array is empty — it must not throw or halt startup | [REQ-NF-08], [FSPEC-EX-01 §4.8], [AT-EX-01-02] | Unit | P1 |
| PROP-EX-15 | Router must log ERROR, post ERR-RP-02 Error Report embed to the originating thread, and continue without crashing when a `ROUTE_TO_AGENT` signal targets an unregistered agent ID | [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-04], [TSPEC §8] | Unit | P1 |
| PROP-RP-06 | `buildErrorMessage()` output (`title`, `whatHappened`, `whatToDo`) must never contain stack trace lines, exception class names, or raw API error payloads | [REQ-RP-06], [FSPEC-RP-01 §6.3 BR-RP-01-01] | Unit | P1 |
| PROP-RP-07 | Orchestrator must post an Error Report embed to the originating thread for each non-recoverable error type (ERR-RP-01 through ERR-RP-05) while writing full technical details to the debug log only | [REQ-RP-06], [FSPEC-RP-01 §6.4], [AT-RP-01-01] | Unit | P1 |
| PROP-LG-05 | `ConsoleLogger.forComponent()` must return a new `ComponentLogger` instance without mutating the root logger | [REQ-NF-09], [TSPEC §4.2.1] | Unit | P1 |
| PROP-EX-16 | `buildAgentRegistry()` must skip a valid-looking entry whose `mention_id` does not match `/^\d+$/` (non-snowflake format), push an error, and continue | [REQ-NF-08], [TSPEC §5.4 step 2f] | Unit | P1 |

---

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-EX-17 | Config loader must parse `agents[]` using the new array schema; the old flat `AgentConfig` keys (`active`, `skills`, `colours`, `role_mentions`) must be absent from the parsed config object — they are silently dropped by the schema parser, not thrown as errors | [REQ-NF-08], [TSPEC §5.1], [TSPEC §5.3] | Unit | P1 |
| PROP-EX-18 | Config loader must parse `llm.model` and `llm.max_tokens` from the top-level `llm` section of `ptah.config.json` | [TSPEC §5.2], [TSPEC §5.3] *(TSPEC-derived schema migration constraint; not a direct REQ-NF-08 acceptance criterion)* | Unit | P1 |
| PROP-OB-01 | EVT-OB-01 and EVT-OB-08 log messages must truncate message content at 100 characters followed by `…` when the content exceeds 100 characters | [REQ-NF-10], [FSPEC-OB-01 §8.2], [TSPEC §9.3] | Unit | P1 |
| PROP-OB-02 | EVT-OB-06 log message must include the short git commit SHA (7 characters) and the file count | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-06] | Unit | P1 |

---

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-21 | Full routing lifecycle integration test must trace EVT-OB-01 through EVT-OB-10 across the correct components via a shared `FakeLogger` root store — all with faked Discord, FS, and Claude API boundaries | [REQ-NF-10], [REQ-DI-06], [TSPEC §9.3 integration] | Integration | P1 |
| PROP-EX-19 | `DefaultRoutingEngine` must accept `AgentRegistry` as a constructor dependency and use it for both `resolveHumanMessage()` and `decide()` — not read from `config.agents.*` directly | [REQ-NF-08], [TSPEC §4.2.6] | Integration | P1 |
| PROP-LG-06 | `FakeLogger.forComponent()` must return a new `FakeLogger` instance sharing the same internal `FakeLogStore` so that all scoped loggers (across all modules) accumulate entries on the root logger | [REQ-NF-09], [TSPEC §9.2 FakeLogger] | Integration | P1 |
| PROP-EX-21 | After a config hot-reload that removes an agent from `agents[]`, `DefaultRoutingEngine` must treat that agent's ID as unknown on the next routing decision and post an ERR-RP-02 Error Report embed to the originating thread | [REQ-NF-08], [FSPEC-EX-01 §4.4], [AT-EX-01-08] | Integration | P1 |

---

### 3.6 Performance Properties

*No performance properties are warranted for Phase 7.* All Phase 7 changes are purely behavioral — embed field values, log format, thread archiving sequencing, and config validation. REQ-PTAH-P7 defines no latency targets, throughput constraints, or resource consumption requirements for these features.

---

### 3.7 Security Properties

Authentication, authorization, input validation, and secrets handling.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-RP-08 | The `buildErrorMessage()` return value fields (`title`, `whatHappened`, `whatToDo`) must NEVER contain stack trace lines (patterns matching `at <identifier> (<file>:<line>:<col>)`), exception class names (e.g., `Error:`, `TypeError:`), or raw API response bodies — verified by asserting on the function return value directly | [REQ-RP-06], [FSPEC-RP-01 §6.3 BR-RP-01-01], [AT-RP-01-03] | Unit | P1 |
| PROP-RP-09 | `buildErrorMessage()` must be a pure function — it must NOT accept `Error` objects, stack trace strings, or raw exception messages as arguments; callers must extract safe context values before calling it | [REQ-RP-06], [TSPEC §4.2.5] | Unit | P1 |
| PROP-RP-10 | Agent names used in Discord-facing error messages must always come from `RegisteredAgent.display_name` (a sanitized config field), never from raw exception message text | [REQ-RP-06], [FSPEC-RP-01 §6.2], [TSPEC §4.2.5] | Unit | P1 |

---

### 3.8 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-22 | Orchestrator must make zero `DiscordClient.archiveThread()` calls when the thread is already marked `closed` in the thread registry — the registry check must short-circuit before any MCP call | [REQ-DI-06], [FSPEC-DI-02 §3.4 BR-DI-02-04], [AT-DI-02-07] | Unit | P1 |
| PROP-EX-20 | `DefaultAgentRegistry` must return consistent lookup results for repeated calls with the same `id` or `mention_id` after construction — the internal maps are immutable post-construction | [REQ-NF-08], [TSPEC §4.2.3] | Unit | P1 |

---

### 3.9 Observability Properties

Logging, metrics, and error reporting.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-OB-03 | EVT-OB-01 must be emitted by `orchestrator` component at INFO level including `thread_id`, `mention_id`, and first 100 chars of message content when an incoming Discord message matches a registered agent's `mention_id` | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-01] | Unit | P1 |
| PROP-OB-04 | EVT-OB-02 must be emitted by `orchestrator` component at INFO level including `thread_id`, `agent_id`, and `agent_display_name` when an agent is matched to an incoming @mention | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-02] | Unit | P1 |
| PROP-OB-05 | EVT-OB-03 must be emitted by `skill-invoker` component at INFO level including `thread_id`, `agent_id`, `attempt_number`, and `max_attempts` before each Claude API invocation | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-03] | Unit | P1 |
| PROP-OB-06 | EVT-OB-04 must be emitted by `skill-invoker` component at INFO level including `thread_id`, `agent_id`, and parsed `signal_type` after a Skill response is received | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-04] | Unit | P1 |
| PROP-OB-07 | EVT-OB-05 must be emitted by `response-poster` component at INFO level including `thread_id`, `agent_id`, and message count after agent response is posted to Discord | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-05] | Unit | P1 |
| PROP-OB-08 | EVT-OB-06 must be emitted by `artifact-committer` component at INFO level including `thread_id`, `agent_id`, short commit SHA, and file count after a git commit completes | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-06] | Unit | P1 |
| PROP-OB-09 | EVT-OB-07 must be emitted by `orchestrator` component at INFO level including `thread_id` and `signal_type` after `archiveThread()` succeeds | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-07] | Unit | P1 |
| PROP-OB-10 | EVT-OB-08 must be emitted by `orchestrator` component at INFO level including `thread_id`, `agent_id`, and first 100 chars of question text when a `ROUTE_TO_USER` signal is processed | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-08] | Unit | P1 |
| PROP-OB-11 | EVT-OB-09 must be emitted by `router` component at INFO level including `thread_id`, `source_agent_id`, and `target_agent_id` when a `ROUTE_TO_AGENT` dispatch occurs | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-09] | Unit | P1 |
| PROP-OB-12 | EVT-OB-10 must be emitted at ERROR level by the error-originating component including `agent_id`, `thread_id`, retry count, and error type identifier (ERR-RP-XX) when a skill invocation fails | [REQ-NF-10], [FSPEC-OB-01 §8.2 EVT-OB-10] | Unit | P1 |

---

## 4. Negative Properties

Properties that define what the system must NOT do.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-DI-N01 | Orchestrator must NOT call `archiveThread()` when the routing signal is `ROUTE_TO_USER` or `ROUTE_TO_AGENT` | [REQ-DI-06], [FSPEC-DI-02 §3.2 BR-DI-02-06], [AT-DI-02-03] | Unit | P1 |
| PROP-DI-N02 | Orchestrator must NOT update the thread registry when `archiveThread()` fails (any failure mode except "thread not found") | [REQ-DI-06], [FSPEC-DI-02 §3.4 BR-DI-02-03], [AT-DI-02-05] | Unit | P1 |
| PROP-DI-N03 | `postAgentResponse()` must NOT wrap agent response text in a Discord embed — agent responses must be plain messages | [REQ-DI-10], [FSPEC-DI-03 §5.4], [AT-DI-03-04] | Unit | P1 |
| PROP-DI-N04 | Embed colors must NOT be configurable per-agent or per-thread — all four embed types have fixed color integers | [REQ-DI-10], [FSPEC-DI-03 §5.5 BR-DI-03-02] | Unit | P1 |
| PROP-DI-N05 | `ResponsePoster` protocol must NOT expose `postSystemMessage()` — the method must be absent from the interface definition and all implementing classes | [TSPEC §4.2.2] | Unit (TypeScript compile-time) | P1 |
| PROP-EX-N01 | `buildAgentRegistry()` must NOT register both entries when two entries share the same `id` — only the first is registered | [REQ-NF-08], [FSPEC-EX-01 §4.6 BR-EX-01-03] | Unit | P1 |
| PROP-EX-N02 | `buildAgentRegistry()` must NOT crash or throw when any agent entry is invalid — invalid entries are skipped, startup continues | [REQ-NF-08], [FSPEC-EX-01 §4.6 BR-EX-01-02] | Unit | P1 |
| PROP-RP-N01 | The final Discord-posted error message embed fields (as captured by `FakeDiscordClient.capturedEmbeds` after `postErrorReportEmbed()` processes an `ErrorMessage`) must NOT contain stack trace lines, exception class names, or raw API error payloads — verified by asserting on the embed fields as seen by the Discord client, distinct from the `buildErrorMessage()` output assertion in PROP-RP-08 | [REQ-RP-06], [FSPEC-RP-01 §6.3 BR-RP-01-01], [AT-RP-01-03] | Unit | P1 |
| PROP-LG-N01 | Individual call sites must NOT prepend `[ptah:{component}]` manually to message strings — the component prefix is a Logger-level concern only | [REQ-NF-09], [FSPEC-LG-01 §7.5 BR-LG-01-05] | Unit | P1 |
| PROP-LG-N02 | The `Component` type must NOT be redefined in `src/services/logger.ts` — it is defined once in `src/types.ts` and imported | [REQ-NF-09], [TSPEC §4.2.1] | Unit | P1 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-DI-06 | PROP-DI-01..08, PROP-DI-16, PROP-DI-18, PROP-DI-21, PROP-DI-22, PROP-DI-N01, PROP-DI-N02 | Full |
| REQ-DI-10 | PROP-DI-09..15, PROP-DI-17, PROP-DI-19, PROP-DI-20, PROP-RP-05, PROP-DI-N03, PROP-DI-N04, PROP-DI-N05 | Full |
| REQ-RP-06 | PROP-RP-01..04, PROP-RP-06..10, PROP-RP-N01 | Full |
| REQ-NF-08 | PROP-EX-01..17, PROP-EX-19..21, PROP-LG-06, PROP-DI-21 | Full |
| REQ-NF-09 | PROP-LG-01..06, PROP-LG-N01, PROP-LG-N02 | Full |
| REQ-NF-10 | PROP-OB-01..12, PROP-DI-21 | Full |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| FSPEC-DI-02 (Thread Archiving) | PROP-DI-01..08, PROP-DI-16, PROP-DI-18, PROP-DI-22, PROP-DI-N01, PROP-DI-N02 | Full |
| FSPEC-DI-03 (Embed Formatting) | PROP-DI-09..15, PROP-DI-17, PROP-DI-19, PROP-DI-20, PROP-RP-05, PROP-DI-N03, PROP-DI-N04 | Full |
| FSPEC-RP-01 (Error Message UX) | PROP-RP-01..10, PROP-RP-N01 | Full |
| FSPEC-EX-01 (Extensibility) | PROP-EX-01..17, PROP-EX-19..21, PROP-EX-N01, PROP-EX-N02 | Full |
| FSPEC-LG-01 (Structured Logging) | PROP-LG-01..06, PROP-LG-N01, PROP-LG-N02 | Full |
| FSPEC-OB-01 (Observability) | PROP-OB-01..12 | Full |
| TSPEC (Logger/FakeLogger design; LLM config schema) | PROP-LG-04, PROP-LG-06, PROP-EX-12, PROP-EX-13, PROP-EX-18, PROP-DI-N05 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 0 | 0 | 0 | 0 |
| P1 | 6 | 6 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 |

---

## 6. Test Level Distribution

Summary of how properties are distributed across the test pyramid.

```
        /  E2E  \          0 — no E2E tests warranted; all coverage achievable at lower levels
       /----------\
      / Integration \      4 — cross-module lifecycle, registry injection, shared FakeLogger, hot-reload
     /----------------\
    /    Unit Tests     \  67 — all protocol, functional, error handling, security, and observability
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 67 | 94% |
| Integration | 4 | 6% |
| E2E (candidates) | 0 | 0% |
| **Total** | **71** | **100%** |

**E2E justification:** Phase 7 changes are internal to the Orchestrator. All observable behaviors — embed fields, log entries, thread registry state, error message content — can be verified via unit tests using the rich test doubles specified in TSPEC §9.2 (FakeDiscordClient, FakeAgentRegistry, FakeLogger, FakeFileSystem, FakeResponsePoster). The single integration test (PROP-DI-21) covers the full lifecycle assembly without real external I/O. No E2E test is warranted for Phase 7.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | ~~`postSystemMessage()` removal is not explicitly covered by a property~~ **RESOLVED** — elevated to named property **PROP-DI-N05** (§4). `ResponsePoster` must NOT expose `postSystemMessage()` — verified at TypeScript compile-time by removing the method from the interface. DoD item is now trackable in the PLAN. | — | — | Closed — see PROP-DI-N05 in §4. |
| 2 | `resolveColour()` elimination is not directly asserted by a test property | `resolveColour()` is removed entirely in Phase 7 (TSPEC §4.2.4). If residual call sites remain, per-agent colours may persist in unexpected places. | Low | Add a gap test or compile-time check verifying `resolveColour` is unreachable. Covered by the `createCoordinationThread()` Routing Notification embed property (PROP-DI-15) in spirit. |
| 3 | ~~Hot-reload registry rebuild behavior is confirmed in TSPEC OQ-TSPEC-01 but no dedicated integration property covers it~~ **RESOLVED** — added as **PROP-EX-21** (§3.5). Integration test level confirmed by TE and BE. | — | — | Closed — see PROP-EX-21 in §3.5. |
| 4 | The 2000-char chunk boundary edge cases (exactly 2000 chars → 1 call; 2001 chars → 2 calls) in TSPEC §9.3 are mentioned but not property IDs | These boundary cases are specified in the TSPEC test category table but not reified as named properties. | Low | These are sub-cases of PROP-DI-14 (chunking at 2000-char boundary). Ensure the PLAN test script for PROP-DI-14 includes both boundary cases explicitly. |

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
| 1.1 | March 17, 2026 | Test Engineer | Revision addressing cross-review findings (TE v1.2, BE v1.2, PM v1.3): added PROP-EX-21 (hot-reload integration, §3.5); added §3.6 Performance placeholder; added PROP-DI-N05 (postSystemMessage removal, §4); fixed §2 Functional count (32→33), Integration count (3→4), Total (69→71); fixed §6 Unit (66→67), Integration (3→4); disambiguated PROP-EX-17 (silent schema drop); retraced PROP-EX-18 source to TSPEC; removed redundant PROP-EX-12..19 sub-range from §5.1/§5.2; differentiated PROP-RP-08 vs PROP-RP-N01 scope; updated §5 coverage matrix; resolved Gaps #1 and #3 as closed |
| 1.0 | March 17, 2026 | Test Engineer | Initial properties document — derived from REQ-PTAH-P7 v1.5, FSPEC-PTAH-PHASE7 v2.2, TSPEC-PTAH-PHASE7 v1.5 |

---

*End of Document*
