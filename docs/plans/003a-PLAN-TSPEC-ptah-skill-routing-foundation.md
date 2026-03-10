# Execution Plan: Phase 3 — Skill Routing — Track 1: Foundation

| Field | Detail |
|-------|--------|
| **Parent Plan** | [003-PLAN-TSPEC-ptah-skill-routing](003-PLAN-TSPEC-ptah-skill-routing.md) |
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Date** | March 9, 2026 |
| **Status** | Complete |

---

## 1. Summary

Foundation track establishing all types, protocols, and test doubles required by every downstream parallel track. This track MUST complete before any parallel track begins. Includes Phase A (Dependencies & Types) and Phase B (Test Doubles).

---

## 2. Prerequisites

None — this is the first track to execute.

---

## 3. Outputs

This track produces:

| Output | Consumers |
|--------|-----------|
| Phase 3 types in `types.ts` (`AgentConfig`, `TokenBudgetConfig`, `RoutingSignalType`, `ThreadAction`, `RoutingSignal`, `RoutingDecision`, `ResumePattern`, `ContextBundle`, `PatternAContext`, `PatternCContext`, `SkillRequest`, `SkillResponse`, `InvocationResult`, `EmbedOptions`, `PostResult`, `WorktreeInfo`) | All parallel tracks |
| Extended `FileSystem` protocol (`readDir`, `joinPath`) | Context Assembler track, Service Implementations track |
| Extended `GitClient` protocol (worktree operations) | Skill Invoker track, Service Implementations track |
| Extended `DiscordClient` protocol (`postEmbed`, `createThread`, `postSystemMessage`) | Response Poster track, Service Implementations track |
| `SkillClient` protocol | Skill Invoker track, Service Implementations track |
| `TokenCounter` protocol | Token Counter + Context Assembler track |
| `RoutingEngine` protocol | Routing Engine track |
| `ContextAssembler` protocol | Token Counter + Context Assembler track |
| `SkillInvoker` protocol | Skill Invoker track |
| `ResponsePoster` protocol | Response Poster track |
| `ThreadQueue` protocol | Thread Queue track |
| `Orchestrator` protocol | Convergence track |
| All fakes (`FakeSkillClient`, `FakeRoutingEngine`, `FakeContextAssembler`, `FakeSkillInvoker`, `FakeResponsePoster`, `FakeTokenCounter`) and extended fakes | All parallel tracks |
| Extended `defaultTestConfig()` and `createStubMessage()` | All parallel tracks |

---

## 4. Task List

### Phase A: Dependencies & Types

Foundation types, protocol extensions, and new type definitions. No TDD cycle — these are type-only definitions validated by the compiler and downstream tests.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add `@anthropic-ai/claude-code` as runtime dependency in `package.json`; run `npm install` to verify | — | `ptah/package.json` | ✅ Done |
| 2 | Add Phase 3 types to `types.ts`: `AgentConfig` (with optional `colours`, `role_mentions`), `TokenBudgetConfig`, extend `PtahConfig.orchestrator` with optional `token_budget` | — | `ptah/src/types.ts` | ✅ Done |
| 3 | Add routing types to `types.ts`: `RoutingSignalType`, `ThreadAction`, `RoutingSignal`, `RoutingDecision`, `ResumePattern` | — | `ptah/src/types.ts` | ✅ Done |
| 4 | Add context types to `types.ts`: `ContextBundle`, `PatternAContext`, `PatternCContext` | — | `ptah/src/types.ts` | ✅ Done |
| 5 | Add invocation types to `types.ts`: `SkillRequest`, `SkillResponse`, `InvocationResult` | — | `ptah/src/types.ts` | ✅ Done |
| 6 | Add response types to `types.ts`: `EmbedOptions`, `PostResult`, `WorktreeInfo` | — | `ptah/src/types.ts` | ✅ Done |
| 7 | Extend `FileSystem` protocol with `readDir(path: string): Promise<string[]>` and `joinPath(...segments: string[]): string` | — | `ptah/src/services/filesystem.ts` | ✅ Done |
| 8 | Extend `GitClient` protocol with worktree operations: `createWorktree`, `removeWorktree`, `deleteBranch`, `listWorktrees`, `pruneWorktrees`, `diffWorktree` | — | `ptah/src/services/git.ts` | ✅ Done |
| 9 | Extend `DiscordClient` protocol with `postEmbed(options: EmbedOptions): Promise<string>`, `createThread(channelId, name, initialMessage): Promise<string>`, `postSystemMessage(threadId, content): Promise<void>` | — | `ptah/src/services/discord.ts` | ✅ Done |
| 10 | Define `SkillClient` protocol in new file `src/services/claude-code.ts` | — | `ptah/src/services/claude-code.ts` | ✅ Done |
| 11 | Define `TokenCounter` protocol in new file `src/orchestrator/token-counter.ts` | — | `ptah/src/orchestrator/token-counter.ts` | ✅ Done |
| 12 | Define `RoutingEngine` protocol in new file `src/orchestrator/router.ts` | — | `ptah/src/orchestrator/router.ts` | ✅ Done |
| 13 | Define `ContextAssembler` protocol in new file `src/orchestrator/context-assembler.ts` | — | `ptah/src/orchestrator/context-assembler.ts` | ✅ Done |
| 14 | Define `SkillInvoker` protocol in new file `src/orchestrator/skill-invoker.ts` | — | `ptah/src/orchestrator/skill-invoker.ts` | ✅ Done |
| 15 | Define `ResponsePoster` protocol in new file `src/orchestrator/response-poster.ts` | — | `ptah/src/orchestrator/response-poster.ts` | ✅ Done |
| 16 | Define `ThreadQueue` protocol in new file `src/orchestrator/thread-queue.ts` | — | `ptah/src/orchestrator/thread-queue.ts` | ✅ Done |
| 17 | Define `Orchestrator` protocol in new file `src/orchestrator/orchestrator.ts` | — | `ptah/src/orchestrator/orchestrator.ts` | ✅ Done |

### Phase B: Test Doubles

Implement new fakes and extend existing ones for Phase 3 testing. Fakes with non-trivial logic get dedicated test files.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 18 | Implement `FakeSkillClient` — sequential responses via `callIndex`, records `invocations: SkillRequest[]`, error injection via `invokeError` | `ptah/tests/unit/fixtures/fake-skill-client.test.ts` | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 19 | Implement `FakeRoutingEngine` — configurable `parseResult`/`decideResult`/`resolveHumanResult`, error injection via `parseError`, records `parseCalls`, `resolveHumanCalls`, `decideCalls` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 20 | Implement `FakeContextAssembler` — configurable `result`, error injection via `assembleError`, records `assembleCalls` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 21 | Implement `FakeSkillInvoker` — configurable `result`, error injection via `invokeError`, records `invokeCalls`, `pruned` flag for `pruneOrphanedWorktrees()` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 22 | Implement `FakeResponsePoster` — records `postedEmbeds`, `postedErrors`, `completionEmbeds`, `createdThreads` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 23 | Implement `FakeTokenCounter` — configurable `fixedCount` override, defaults to char-based estimation | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 24 | Extend `FakeFileSystem` with `readDir()` (returns filenames from in-memory dirs) and `joinPath()` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 25 | Extend `FakeGitClient` with worktree operations: `worktrees`, `createWorktreeError`, `diffResult`, `prunedPrefix`, `removedWorktrees`, `deletedBranches` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 26 | Extend `FakeDiscordClient` with `postedEmbeds`, `createdThreads`, `systemMessages`, `postEmbedError`, `createThreadError` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 27 | Extend `defaultTestConfig()` with Phase 3 optional fields: `agents.colours`, `agents.role_mentions`, `orchestrator.token_budget` | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |
| 28 | Extend `createStubMessage()` with optional `embeds` and `mentions` fields | — | `ptah/tests/fixtures/factories.ts` | ✅ Done |

---

## 5. Definition of Done

- [x] All 28 tasks completed and status updated to ✅
- [x] TypeScript compiler accepts all new types and protocols (`npm run build`)
- [x] Existing Phase 1/2 tests remain green (no regressions) — 209 tests pass
- [x] FakeSkillClient dedicated test passes — 5 tests
- [ ] Changes committed in logical units with `type(scope): description` format

---

*Upon completion, all 6 parallel tracks and the convergence track are unblocked.*
