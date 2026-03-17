# Execution Plan: Phase 7 — Polish

| Field | Detail |
|-------|--------|
| **Technical Specification** | [007-TSPEC-polish](007-TSPEC-polish.md) |
| **Requirements** | [007-REQ-polish](007-REQ-polish.md) |
| **Date** | 2026-03-17 |
| **Status** | Draft |

---

## 1. Summary

Phase 7 implements six production-readiness improvements: thread archiving on resolution, configuration-driven agent extensibility (breaking AgentConfig→AgentEntry[] schema migration), structured `[ptah:{component}] LEVEL: message` log output via a refactored Logger protocol, operator observability via ten mandatory lifecycle log events, Discord rich embed formatting for four Orchestrator message types (agent response text moving to plain messages), and human-readable error messages for five failure categories.

---

## 2. Task List

### Phase A: Foundation — Types + Logger

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A1 | Add `Component`, `LogLevel`, `LogEntry`, `UserFacingErrorType`, `UserFacingErrorContext`, `AgentValidationError`, `AgentEntry`, `RegisteredAgent`, `LlmConfig` types to `src/types.ts`; remove old `AgentConfig`; update `PtahConfig` | `tests/unit/services/logger.test.ts` | `src/types.ts` | ⬚ Not Started |
| A2 | Refactor `Logger` interface — add `forComponent(component: Component): Logger`; implement `ComponentLogger`; update `ConsoleLogger` | `tests/unit/services/logger.test.ts` | `src/services/logger.ts` | ⬚ Not Started |
| A3 | Update `FakeLogger` in factories.ts — shared `FakeLogStore`, `forComponent()` returns sibling with shared store, `entries` accessor, `entriesAt()` helper | `tests/unit/services/logger.test.ts` | `tests/fixtures/factories.ts` | ⬚ Not Started |
| A4 | Add `FakeFileSystem` to factories.ts — `existsResults: Map<string, boolean>`, stub all FileSystem methods | `tests/unit/fixtures/fake-filesystem.test.ts` | `tests/fixtures/factories.ts` | ⬚ Not Started |

### Phase B: Agent Registry + Config Migration

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B1 | Create `src/orchestrator/agent-registry.ts` — `AgentRegistry` interface, `DefaultAgentRegistry`, `buildAgentRegistry()` async factory with full validation algorithm | `tests/unit/agent-registry.test.ts` | `src/orchestrator/agent-registry.ts` | ⬚ Not Started |
| B2 | Add `FakeAgentRegistry` to factories.ts | `tests/unit/agent-registry.test.ts` | `tests/fixtures/factories.ts` | ⬚ Not Started |
| B3 | Migrate `src/config/loader.ts` — parse `agents[]` array schema + new `llm` section; reject old flat schema; validate `AgentEntry` fields; update `PtahConfig` references | `tests/unit/config/loader.test.ts` | `src/config/loader.ts` | ⬚ Not Started |

### Phase C: Error Messages

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| C1 | Create `src/orchestrator/error-messages.ts` — `buildErrorMessage()` pure function, `ErrorMessage` type, five templates ERR-RP-01..05 | `tests/unit/error-messages.test.ts` | `src/orchestrator/error-messages.ts` | ⬚ Not Started |

### Phase D: Discord + ResponsePoster

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| D1 | Add `archiveThread(threadId)` and `postPlainMessage(threadId, content)` to `DiscordClient` interface + `DiscordJsClient` implementation; remove `postSystemMessage()` | `tests/unit/services/discord.test.ts` | `src/services/discord.ts` | ⬚ Not Started |
| D2 | Update `FakeDiscordClient` in factories.ts — add `archiveThreadCalls`, `archiveThreadError`, `postPlainMessageCalls`, `postPlainMessageError` fields | `tests/unit/fixtures/fake-discord-client.test.ts` | `tests/fixtures/factories.ts` | ⬚ Not Started |
| D3 | Refactor `ResponsePoster` interface and `DefaultResponsePoster` — four typed embed methods (`postRoutingNotificationEmbed`, `postResolutionNotificationEmbed`, `postErrorReportEmbed`, `postUserEscalationEmbed`); remove old embed methods; `postAgentResponse()` uses `postPlainMessage()` with 2000-char chunks; embed fallback to plain text | `tests/unit/orchestrator/response-poster.test.ts` | `src/orchestrator/response-poster.ts` | ⬚ Not Started |
| D4 | Update `FakeResponsePoster` in factories.ts — replace old embed method stubs with new four typed embed call trackers + error injection | `tests/unit/orchestrator/response-poster.test.ts` | `tests/fixtures/factories.ts` | ⬚ Not Started |

### Phase E: Component Loggers + Observability Events

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| E1 | Add component-scoped logger to `DefaultSkillInvoker` constructor; emit EVT-OB-03 and EVT-OB-04 | `tests/unit/orchestrator/skill-invoker.test.ts` | `src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| E2 | Add component-scoped logger to `DefaultArtifactCommitter` constructor; emit EVT-OB-06 after successful commit | `tests/unit/orchestrator/artifact-committer.test.ts` | `src/orchestrator/artifact-committer.ts` | ⬚ Not Started |
| E3 | Add component-scoped logger to `DefaultInvocationGuard` constructor; integrate `buildErrorMessage()` for error-report embeds; use `postErrorReportEmbed()` instead of raw `postErrorEmbed()` | `tests/unit/orchestrator/invocation-guard.test.ts` | `src/orchestrator/invocation-guard.ts` | ⬚ Not Started |
| E4 | Add component-scoped logger to `DefaultRoutingEngine`; inject `AgentRegistry`; replace `config.agents.role_mentions` and `config.agents.active` lookups with registry calls; emit EVT-OB-09 | `tests/unit/orchestrator/router.test.ts` | `src/orchestrator/router.ts` | ⬚ Not Started |

### Phase F: Orchestrator — Thread Archiving + EVT-OB-01/02/07/08

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| F1 | Add component-scoped logger to `DefaultOrchestrator`; emit EVT-OB-01 (message received), EVT-OB-02 (agent matched), EVT-OB-08 (ROUTE_TO_USER escalation) | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| F2 | Implement thread archiving algorithm in `orchestrator.ts` — post resolution embed, call `archiveThread()`, handle errors as non-fatal, mark state closed, emit EVT-OB-07 | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| F3 | Update all `config.agents.*` call sites in orchestrator.ts to use `agentRegistry` + `config.llm.*`; add `agentRegistry: AgentRegistry` to `OrchestratorDeps`; add `archive_on_resolution?: boolean` to `OrchestratorConfig` type | `tests/unit/orchestrator/orchestrator.test.ts` | `src/orchestrator/orchestrator.ts` | ⬚ Not Started |

### Phase G: Integration + Migration Guide

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| G1 | Update `src/bin/ptah.ts` composition root — call `buildAgentRegistry()`, wire into `DefaultOrchestrator` and `DefaultRoutingEngine` | `tests/integration/cli/ptah.test.ts` | `src/bin/ptah.ts` | ⬚ Not Started |
| G2 | Update `ptah.config.json` — migrate to new `agents[]` + `llm` schema | — | `ptah.config.json` | ⬚ Not Started |
| G3 | Create migration guide at `docs/007-polish/migration-guide-v4-agents.md` | — | `docs/007-polish/migration-guide-v4-agents.md` | ⬚ Not Started |
| G4 | Write integration test `tests/integration/orchestrator/routing-loop.test.ts` — full lifecycle with archiving, all EVT events verified | `tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |
| G5 | Run full test suite; fix all failures; ensure 0 failures and 0 skips | all | all | ⬚ Not Started |

---

## 3. Task Dependency Notes

```
A (types + logger)
  └─ B (agent-registry, config migration) — requires AgentEntry types from A
  └─ C (error-messages) — requires UserFacingErrorType from A
  └─ D (discord, response-poster) — requires new types from A, FakeDiscordClient from D2
       └─ E (component loggers, observability) — requires D complete for InvocationGuard embed calls
            └─ F (orchestrator archiving) — requires D (embed methods) and E (component loggers)
                 └─ G (integration, migration guide, composition root)
```

- Phase A tasks (A1→A4) run sequentially.
- B1 and B3 can run in parallel after A.
- C1 can run in parallel with B.
- D1→D4 run sequentially (D2 needs D1 interface, D3 needs D1+D2).
- E1..E4 can run in parallel after D.
- F1..F3 run sequentially.
- G tasks run after all prior phases.

---

## 4. Integration Points

| Module | Change | Risk |
|--------|--------|------|
| `src/types.ts` | `AgentConfig` removed → `AgentEntry[]` + `LlmConfig` in `PtahConfig` | High — touches every consumer of `config.agents.*` |
| `src/orchestrator/orchestrator.ts` | New `agentRegistry` dep; `config.agents.*` → registry; archiving; EVT-OB-01/02/07/08 | High |
| `src/orchestrator/router.ts` | New `agentRegistry` constructor dep; replace config lookups; EVT-OB-09 | Medium |
| `src/orchestrator/invocation-guard.ts` | Error embeds → `postErrorReportEmbed()`; component logger | Medium |
| `tests/fixtures/factories.ts` | FakeLogger, FakeDiscordClient, FakeResponsePoster all updated; FakeAgentRegistry + FakeFileSystem added | High — touches nearly every test |

---

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria
- [ ] Implementation matches TSPEC (protocols, algorithm, error handling, test doubles)
- [ ] Existing tests remain green (no regressions)
- [ ] `ptah.config.json` migrated to new `agents[]` + `llm` schema
- [ ] `migration-guide-v4-agents.md` created
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to `feat-polish` remote for review

---

*Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done*
