# Execution Plan: Phase 3 — Skill Routing — Track 5: Response Poster

| Field | Detail |
|-------|--------|
| **Parent Plan** | [003-PLAN-TSPEC-ptah-skill-routing](003-PLAN-TSPEC-ptah-skill-routing.md) |
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Date** | March 9, 2026 |
| **Status** | Planning |

---

## 1. Summary

Implements the Response Poster (Phase G) — embed posting, thread creation, error embeds, and completion embeds. Handles colour-coded agent responses, long message splitting, retry logic, and fallback behavior for Discord API failures. Uses `FakeDiscordClient` and `FakeLogger`.

---

## 2. Prerequisites

| Prerequisite | Track |
|-------------|-------|
| Phase A (Dependencies & Types) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |
| Phase B (Test Doubles) complete | [Foundation](003a-PLAN-TSPEC-ptah-skill-routing-foundation.md) |

Specifically requires: `ResponsePoster` protocol, `EmbedOptions`/`PostResult` types, `FakeDiscordClient` (extended), `FakeLogger`.

---

## 3. Outputs

| Output | Consumers |
|--------|-----------|
| `DefaultResponsePoster` implementation | Convergence track (Orchestrator, Integration tests) |

---

## 4. Task List

### Phase G: Response Poster (TDD)

Embed posting and thread creation. Uses `FakeDiscordClient`, `FakeLogger`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 81 | `postAgentResponse()` posts embed with correct colour per agent — PM Blue, Dev Amber, Frontend Purple, Test Green (AT-DI-01) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 82 | Unknown agent colour uses default Medium Gray (#757575), logs warning (AT-DI-09) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 83 | Agent name derived from ID: `"dev-agent"` → `"Dev Agent"` (split on `-`, title-case) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 84 | Long response split — text >4096 chars split into numbered embeds ("Dev Agent (1/3)"), same colour (AT-DI-04) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 85 | Empty text — minimal embed with "No response text" (AT-DI-05, AT-SI-10) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 86 | `postErrorEmbed()` posts Gray (#9E9E9E) embed with error message (AT-DI-08) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 87 | `postCompletionEmbed()` posts completion embed (Green #1B5E20) for terminal signals | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 88 | `createCoordinationThread()` creates thread with `{feature} — {description}` naming convention, posts initial embed, returns thread ID (AT-DI-02) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 89 | Embed post failure — retries once on Discord API error; if retry fails, logs to debug channel; routing signal still processed (AT-DI-06) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 90 | Thread creation failure — retries once; if retry fails, posts in parent channel as fallback (AT-DI-07) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 91 | Discord API rate limit on embed post — retries once after `retry_after` duration; if retry fails, logs warning and skips (AT-DI-10) | `ptah/tests/unit/orchestrator/response-poster.test.ts` | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |

---

## 5. Definition of Done

- [ ] All 11 tasks (Tasks 81–91) completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling, test doubles)
- [ ] Existing Phase 1/2 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format

---

*This track runs in parallel with: Token Counter + Context Assembler, Thread Queue, Routing Engine, Skill Invoker, Service Implementations.*
