# Execution Plan: Phase 7 — Polish

| Field | Detail |
|-------|--------|
| **Technical Specification** | [007-TSPEC-polish](007-TSPEC-polish.md) |
| **Requirements** | [007-REQ-polish](007-REQ-polish.md) |
| **Functional Specification** | [007-FSPEC-polish](007-FSPEC-polish.md) |
| **Date** | 2026-03-17 |
| **Status** | Approved — Ready for Implementation |

---

## 1. Summary

Phase 7 delivers six production-readiness improvements to the Ptah Orchestrator: thread archiving on resolution, configuration-driven agent extensibility (breaking AgentConfig schema migration), structured `[ptah:{component}] LEVEL: message` log output via a refactored `Logger` protocol, operator observability via ten mandatory lifecycle log events, Discord rich embed formatting for four Orchestrator message types (agent response text moves to plain messages), and human-readable error messages with actionable guidance for five failure categories.

The plan is structured in twelve phases following strict TDD order: test infrastructure and shared types first, then new modules (AgentRegistry, ErrorMessages), then breaking changes (config migration, Logger protocol, ResponsePoster), then module-level logger integration, then orchestrator assembly, then integration tests, and finally the migration guide deliverable.

---

## 2. Task List

### Phase A: Foundation — Shared Types

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A1 | Add `AgentEntry`, `RegisteredAgent`, `AgentValidationError`, `Component`, `LogLevel`, `LogEntry`, `UserFacingErrorType`, `UserFacingErrorContext` to `src/types.ts` | _(pure type declarations — no runtime behavior to test)_ | `src/types.ts` | ✅ Done |

**Rationale:** All downstream modules import from `src/types.ts`. These types must exist before any test or implementation file is written. No runtime behavior — type correctness is verified by TypeScript compilation in subsequent tasks.

---

### Phase B: Test Infrastructure — Update Factories

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B1 | Update `FakeLogger`: introduce `FakeLogStore` shared-store, implement `forComponent()` returning scoped logger sharing the store, add `entries` and `entriesAt()` helpers, replace `infoCalls`/`warnCalls` etc. with `LogEntry[]` accumulation | `tests/unit/logger.test.ts` | `tests/fixtures/factories.ts` | ⬚ Not Started |
| B2 | Update `FakeDiscordClient`: add `archiveThread()`, `postPlainMessage()`, corresponding call-record arrays, and error-injection fields (`archiveThreadError`, `postPlainMessageError`) | _(verified implicitly by Phase F, I, J tests)_ | `tests/fixtures/factories.ts` | ⬚ Not Started |
| B3 | Add `FakeAgentRegistry` implementing `AgentRegistry` protocol | _(verified implicitly by Phase H, I, J tests)_ | `tests/fixtures/factories.ts` | ⬚ Not Started |
| B4 | Add `FakeFileSystem` implementing `FileSystem` protocol with `existsResults` map (defaults to `true`) | _(verified by Phase D agent-registry tests)_ | `tests/fixtures/factories.ts` | ⬚ Not Started |
| B5 | Update `FakeResponsePoster`: remove `postCompletionEmbed`, `postErrorEmbed`, `postProgressEmbed` fields; add `routingNotificationCalls`, `resolutionNotificationCalls`, `errorReportCalls`, `userEscalationCalls` records and matching error-injection fields | _(verified implicitly by Phase I, J tests)_ | `tests/fixtures/factories.ts` | ⬚ Not Started |

**Rationale:** Test doubles must exist before the tests that consume them. `FakeLogger` (B1) is the most complex double and has dedicated test coverage in `logger.test.ts` to validate shared-store accumulation and `forComponent()` scoping. The others (B2–B5) are validated implicitly by downstream phase tests.

---

### Phase C: Logger Protocol

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C1 | Add `forComponent(component: Component): Logger` to `Logger` interface; implement `ConsoleLogger.forComponent()` returning a new `ComponentLogger`; implement `ComponentLogger` formatting every call as `[ptah:{component}] LEVEL: message` (ERROR/WARN → `console.error`, INFO/DEBUG → `console.log`) | `tests/unit/logger.test.ts` | `src/services/logger.ts` | ⬚ Not Started |

**Rationale:** All eight Orchestrator modules call `deps.logger.forComponent(...)` in their constructors. The Logger protocol must be updated and tested before any module integration work begins.

---

### Phase D: AgentRegistry — New Module

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D1 | Implement `AgentRegistry` protocol and `DefaultAgentRegistry` class (`getAgentById`, `getAgentByMentionId`, `getAllAgents`) using `Map`-based internal storage | `tests/unit/agent-registry.test.ts` | `src/orchestrator/agent-registry.ts` | ⬚ Not Started |
| D2 | Implement `buildAgentRegistry()` async factory: validate each `AgentEntry` (required fields, `id` format `/^[a-z0-9-]+$/`, `mention_id` format `/^\d+$/`, `fs.exists()` for `skill_path` and `log_file`, duplicate `id`/`mention_id` detection); skip invalid entries, log each `AgentValidationError`; return `{ registry, errors }` | `tests/unit/agent-registry.test.ts` | `src/orchestrator/agent-registry.ts` | ⬚ Not Started |

---

### Phase E: ErrorMessages — New Module

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E1 | Implement `buildErrorMessage(type, context): ErrorMessage` as a pure function covering all five error types (ERR-RP-01..05) with correct `title`, `whatHappened`, `whatToDo` templates; assert no `Error` objects, stack traces, or raw exception text are accepted or emitted | `tests/unit/error-messages.test.ts` | `src/orchestrator/error-messages.ts` | ✅ Done |

---

### Phase F: Config Migration — AgentEntry Schema

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F1 | Update `src/config/loader.ts` to parse and validate `agents: AgentEntry[]` array schema; reject old flat `AgentConfig` object schema with a clear validation error; validate `llm` section is present | `tests/unit/config-loader.test.ts` | `src/config/loader.ts` | ⬚ Not Started |
| F2 | Update `ptah.config.json` to new `agents[]` array schema matching `AgentEntry` type | _(smoke-tested by config-loader integration path)_ | `ptah.config.json` | ⬚ Not Started |

---

### Phase G: Discord Protocol Additions

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| G1 | Add `archiveThread(threadId: string): Promise<void>` to `DiscordClient` interface; implement in `DiscordJsClient` using `ThreadChannel.setArchived(true)` | _(FakeDiscordClient is the unit-test double; DiscordJsClient is an integration boundary)_ | `src/services/discord.ts` | ✅ Done |
| G2 | Add `postPlainMessage(threadId: string, content: string): Promise<void>` to `DiscordClient` interface; implement in `DiscordJsClient` using `thread.send({ content })`; remove `postSystemMessage()` from interface and implementation (grep for stale call sites before removal) | _(FakeDiscordClient is the unit-test double)_ | `src/services/discord.ts` | ✅ Done |

---

### Phase H: ResponsePoster Refactor

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| H1 | Add four new embed methods to `ResponsePoster` interface: `postRoutingNotificationEmbed`, `postResolutionNotificationEmbed`, `postErrorReportEmbed`, `postUserEscalationEmbed` — with correct signatures from TSPEC §4.2.4 | `tests/unit/response-poster.test.ts` | `src/orchestrator/response-poster.ts` | ⬚ Not Started |
| H2 | Implement all four embed methods in `DefaultResponsePoster` with correct embed schemas (title, color integer, body fields per FSPEC-DI-03); add embed fallback to `postPlainMessage()` when embed posting throws | `tests/unit/response-poster.test.ts` | `src/orchestrator/response-poster.ts` | ⬚ Not Started |
| H3 | Change `postAgentResponse()` to chunk text at **2000-char** boundary and post each chunk via `discordClient.postPlainMessage()` (not embed); test boundary cases: exactly 2000 chars → 1 call; 2001 chars → 2 calls | `tests/unit/response-poster.test.ts` | `src/orchestrator/response-poster.ts` | ⬚ Not Started |
| H4 | Update `createCoordinationThread()` to post a Routing Notification embed (color `0x5865F2`, title `↗ Routing to {display_name}`); remove `resolveColour()` helper; remove `postCompletionEmbed()`, `postErrorEmbed()`, `postProgressEmbed()` from interface and implementation | `tests/unit/response-poster.test.ts` | `src/orchestrator/response-poster.ts` | ⬚ Not Started |

---

### Phase I: Module Logger Integration

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| I1 | Update `DefaultRoutingEngine`: inject `AgentRegistry` as constructor dependency; replace `config.agents.role_mentions` look-up with `agentRegistry.getAgentByMentionId()`; replace `config.agents.active` validation with `agentRegistry.getAgentById()`; add `this.log = deps.logger.forComponent('router')` | `tests/unit/router.test.ts` | `src/orchestrator/router.ts` | ⬚ Not Started |
| I2 | Update `DefaultSkillInvoker`: add `this.log = deps.logger.forComponent('skill-invoker')`; emit EVT-OB-03 (skill invocation start) and EVT-OB-04 (skill response received) at correct log level and component | `tests/unit/skill-invoker.test.ts` | `src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| I3 | Update `DefaultArtifactCommitter`: add `this.log = deps.logger.forComponent('artifact-committer')`; emit EVT-OB-06 (commit completed) | `tests/unit/artifact-committer.test.ts` | `src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| I4 | Update `DefaultInvocationGuard`: add `this.log = deps.logger.forComponent('invocation-guard')`; integrate `buildErrorMessage()` for user-facing error context extraction before calling `postErrorReportEmbed()` | `tests/unit/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ⬚ Not Started |

---

### Phase J: Orchestrator Updates + Composition Root

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| J1 | Add `agentRegistry: AgentRegistry` to `OrchestratorDeps` interface; add `archive_on_resolution?: boolean` to `PtahConfig.orchestrator` (defaults to `true`); add `this.log = deps.logger.forComponent('orchestrator')` | `tests/unit/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts`, `src/types.ts` | ⬚ Not Started |
| J2 | Implement thread archiving on resolution signal (`LGTM`/`TASK_COMPLETE`): after skill response is posted and artifact commits are complete, call `postResolutionNotificationEmbed()` then `discordClient.archiveThread()` then `threadStateManager.markClosed()`; archiving failure is non-fatal (log ERROR, do not throw); skip if thread already archived (idempotency via registry check) | `tests/unit/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| J3 | Emit all 10 observability events (EVT-OB-01..10) at correct components and log levels; truncate message content to 100 chars with `…` for EVT-OB-01 and EVT-OB-08; assert boundary cases: ≤100 chars → no truncation, >100 chars → truncated | `tests/unit/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| J4 | Update composition root `bin/ptah.ts`: call `buildAgentRegistry()` from loaded config before constructing `DefaultOrchestrator`; wire `agentRegistry` into `OrchestratorDeps` and `DefaultRoutingEngine` constructor | _(smoke-tested via integration test in Phase K)_ | `bin/ptah.ts` | ⬚ Not Started |

---

### Phase K: Integration Test

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| K1 | Write full routing lifecycle integration test: message received → `buildAgentRegistry()` called with real in-memory `AgentEntry[]` → agent invoked → resolution signal (`LGTM`) returned → `postResolutionNotificationEmbed()` called → `archiveThread()` called; verify all 10 EVT-OB events present in `rootLogger.entries` with correct `{ component, level, message }` tuples; all external boundaries (Discord, FS, Claude API) faked via §9.2 test doubles | `tests/integration/routing-loop.test.ts` | _(cross-module — all Orchestrator modules wired)_ | ⬚ Not Started |

---

### Phase L: Migration Guide

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| L1 | Write `migration-guide-v4-agents.md`: document old flat `AgentConfig` schema vs new `agents: AgentEntry[]` schema; provide step-by-step migration instructions; list all `AgentValidationError` messages operators may encounter; note that Ptah must be restarted after config changes | _(documentation artifact — no test file)_ | `docs/007-polish/migration-guide-v4-agents.md` | ⬚ Not Started |

---

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

## 3. Task Dependency Notes

```
A1 (types.ts)
  └─ B1 (FakeLogger) ──────────────────────────────→ C1 (logger.ts)
  └─ B2 (FakeDiscordClient)
  └─ B3 (FakeAgentRegistry) ──────────────────────→ D1, D2 (agent-registry.ts)
  └─ B4 (FakeFileSystem) ──────────────────────────→ D2 (buildAgentRegistry)
  └─ B5 (FakeResponsePoster)

C1 (logger.ts)
  └─ I1 (router.ts)
  └─ I2 (skill-invoker.ts)
  └─ I3 (artifact-committer.ts)
  └─ I4 (invocation-guard.ts)
  └─ J1 (orchestrator.ts)

D1, D2 (agent-registry.ts)
  └─ F1 (config/loader.ts) ───────────────────────→ F2 (ptah.config.json)
  └─ I1 (router.ts)
  └─ J1 (orchestrator.ts)

E1 (error-messages.ts)
  └─ I4 (invocation-guard.ts)

G1, G2 (discord.ts)
  └─ H2, H3 (response-poster.ts embed + plain)
  └─ J2 (orchestrator archiving)

H1, H2, H3, H4 (response-poster.ts)
  └─ J2, J3 (orchestrator archiving + observability)

I1, I2, I3, I4 (module logger integration)
  └─ J1, J2, J3 (orchestrator assembly)

J1, J2, J3 (orchestrator.ts)
  └─ J4 (bin/ptah.ts composition root)

J4 (composition root)
  └─ K1 (integration test)
```

**Strict ordering constraints:**
- Phase A must complete before Phase B (types needed for test doubles)
- Phase B1 must complete before Phase C1 (FakeLogger needed to test Logger)
- Phase B3, B4 must complete before Phase D (FakeAgentRegistry, FakeFileSystem needed)
- Phase C1 must complete before Phase I (all modules consume `forComponent()`)
- Phase D must complete before Phase F1 (config loader calls `buildAgentRegistry()`)
- Phase D must complete before Phase I1 (router depends on AgentRegistry)
- Phase E1 must complete before Phase I4 (invocation guard consumes `buildErrorMessage()`)
- Phases G, H must complete before Phase J2 (orchestrator archiving calls both)
- Phases I, H must complete before Phase J (orchestrator wires all modules)
- Phase J4 must complete before Phase K1 (integration test needs wired composition root)

---

## 4. Integration Points

### Connects to Previous Phases

| Phase | Integration Impact |
|-------|--------------------|
| Phase 1 (Discord bot) | `DiscordClient` interface extended with `archiveThread()` + `postPlainMessage()`; `postSystemMessage()` removed |
| Phase 2–5 (Orchestrator modules) | All eight modules updated to consume `Logger.forComponent()`; `config.agents.*` call sites (~12 across all modules) migrated to `AgentRegistry` lookups |
| Phase 4 (Artifact commits) | `DefaultArtifactCommitter` gains component logger and emits EVT-OB-06 |
| Phase 6 (Guardrails) | `DefaultInvocationGuard` gains component logger and integrates `buildErrorMessage()` for user-facing errors |

### Existing Code Affected

| File | Nature of Change |
|------|------------------|
| `src/types.ts` | Additive: new types. Existing types unchanged. |
| `src/services/logger.ts` | Extension: `forComponent()` added to interface. Existing methods unchanged. `ConsoleLogger` gains implementation. |
| `src/services/discord.ts` | Breaking: `postSystemMessage()` removed; `archiveThread()` + `postPlainMessage()` added. All call sites must be updated. |
| `src/config/loader.ts` | Breaking: `agents[]` array schema replaces flat `AgentConfig`. Old config files will fail validation. |
| `src/orchestrator/response-poster.ts` | Breaking: `postCompletionEmbed()`, `postErrorEmbed()`, `postProgressEmbed()`, `resolveColour()` removed. New embed methods replace them. |
| `tests/fixtures/factories.ts` | High-impact: `FakeLogger` interface changes (`entries` replaces individual call arrays); `FakeResponsePoster` method names change. **Nearly every test file will need a review pass for `FakeLogger` and `FakeResponsePoster` usage.** |

### Breaking Change Surface Summary

1. **`FakeLogger` API change** — `infoCalls`, `warnCalls`, `errorCalls`, `debugCalls` → `entries: LogEntry[]`. Affects every test file that inspects log output. Migration: replace `fakeLogger.infoCalls` assertions with `rootLogger.entries` assertions.
2. **`config.agents.*` removal** — All consumers reading `config.agents.skills`, `config.agents.model`, `config.agents.role_mentions`, `config.agents.active` must be updated to use `AgentRegistry` or the new `AgentEntry[]` config shape.
3. **`postSystemMessage()` removal** — Callers must switch to `postPlainMessage()` or one of the four embed methods.
4. **`FakeResponsePoster` method rename** — Tests asserting `fakeResponsePoster.completionEmbedCalls` etc. must update to the new call-record field names.

---

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against all six requirement acceptance criteria (REQ-DI-06, REQ-DI-10, REQ-RP-06, REQ-NF-08, REQ-NF-09, REQ-NF-10)
- [ ] Implementation matches TSPEC v1.5 (protocols, algorithms, embed schemas, error templates, observability events, test doubles)
- [ ] `[ptah:{component}] LEVEL: message` format verified in `ComponentLogger` output for all 8 components
- [ ] Thread archiving is non-fatal on failure and idempotent (verified by unit tests AT-DI-02-01..09)
- [ ] All 10 observability events (EVT-OB-01..10) emitted at correct components and levels (verified by unit + integration tests)
- [ ] `buildErrorMessage()` output for all 5 error types contains no stack traces, raw exceptions, or internal IDs
- [ ] `ptah.config.json` updated to new `agents[]` schema
- [ ] `migration-guide-v4-agents.md` written and committed
- [ ] Existing tests across all prior phases remain green (no regressions from `FakeLogger`/`FakeResponsePoster` breaking changes)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] All commits pushed to `feat-007-polish` remote branch

---

*End of Document*
