# Execution Plan: Phase 3 — Skill Routing

| Field | Detail |
|-------|--------|
| **Technical Specification** | [003-TSPEC-ptah-skill-routing](../specifications/003-TSPEC-ptah-skill-routing.md) |
| **Functional Specification** | [003-FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) |
| **Requirements** | [REQ-DI-04], [REQ-DI-05], [REQ-DI-09], [REQ-CB-01]–[REQ-CB-06], [REQ-RP-01], [REQ-RP-03], [REQ-RP-04], [REQ-SI-01]–[REQ-SI-04], [REQ-SI-11], [REQ-SI-12], [REQ-NF-01], [REQ-NF-04], [REQ-NF-07] |
| **Date** | March 9, 2026 |
| **Status** | Planning |

---

## 1. Summary

Implements Phase 3 (Skill Routing) — the core orchestration loop that transforms the Phase 2 Discord connection layer into a working agent coordination system. When a message arrives in a Discord thread, the Orchestrator determines which agent to invoke, assembles a three-layer Context Bundle, invokes the agent's Skill as a stateless Claude Code call in an isolated Git worktree, and posts the response back as a colour-coded embed. This completes the full message → response loop for the first time.

---

## 2. Task List

### Phase A: Dependencies & Types

Foundation types, protocol extensions, and new type definitions. No TDD cycle — these are type-only definitions validated by the compiler and downstream tests.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | Add `@anthropic-ai/claude-code` as runtime dependency in `package.json`; run `npm install` to verify | — | `ptah/package.json` | ⬚ Not Started |
| 2 | Add Phase 3 types to `types.ts`: `AgentConfig` (with optional `colours`, `role_mentions`), `TokenBudgetConfig`, extend `PtahConfig.orchestrator` with optional `token_budget` | — | `ptah/src/types.ts` | ⬚ Not Started |
| 3 | Add routing types to `types.ts`: `RoutingSignalType`, `ThreadAction`, `RoutingSignal`, `RoutingDecision`, `ResumePattern` | — | `ptah/src/types.ts` | ⬚ Not Started |
| 4 | Add context types to `types.ts`: `ContextBundle`, `PatternAContext`, `PatternCContext` | — | `ptah/src/types.ts` | ⬚ Not Started |
| 5 | Add invocation types to `types.ts`: `SkillRequest`, `SkillResponse`, `InvocationResult` | — | `ptah/src/types.ts` | ⬚ Not Started |
| 6 | Add response types to `types.ts`: `EmbedOptions`, `PostResult`, `WorktreeInfo` | — | `ptah/src/types.ts` | ⬚ Not Started |
| 7 | Extend `FileSystem` protocol with `readDir(path: string): Promise<string[]>` and `joinPath(...segments: string[]): string` | — | `ptah/src/services/filesystem.ts` | ⬚ Not Started |
| 8 | Extend `GitClient` protocol with worktree operations: `createWorktree`, `removeWorktree`, `deleteBranch`, `listWorktrees`, `pruneWorktrees`, `diffWorktree` | — | `ptah/src/services/git.ts` | ⬚ Not Started |
| 9 | Extend `DiscordClient` protocol with `postEmbed(options: EmbedOptions): Promise<string>`, `createThread(channelId, name, initialMessage): Promise<string>`, `postSystemMessage(threadId, content): Promise<void>` | — | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 10 | Define `SkillClient` protocol in new file `src/services/claude-code.ts` | — | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 11 | Define `TokenCounter` protocol in new file `src/orchestrator/token-counter.ts` | — | `ptah/src/orchestrator/token-counter.ts` | ⬚ Not Started |
| 12 | Define `RoutingEngine` protocol in new file `src/orchestrator/router.ts` | — | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 13 | Define `ContextAssembler` protocol in new file `src/orchestrator/context-assembler.ts` | — | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 14 | Define `SkillInvoker` protocol in new file `src/orchestrator/skill-invoker.ts` | — | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 15 | Define `ResponsePoster` protocol in new file `src/orchestrator/response-poster.ts` | — | `ptah/src/orchestrator/response-poster.ts` | ⬚ Not Started |
| 16 | Define `ThreadQueue` protocol in new file `src/orchestrator/thread-queue.ts` | — | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 17 | Define `Orchestrator` protocol in new file `src/orchestrator/orchestrator.ts` | — | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |

### Phase B: Test Doubles

Implement new fakes and extend existing ones for Phase 3 testing. Fakes with non-trivial logic get dedicated test files.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 18 | Implement `FakeSkillClient` — sequential responses via `callIndex`, records `invocations: SkillRequest[]`, error injection via `invokeError` | `ptah/tests/unit/fixtures/fake-skill-client.test.ts` | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 19 | Implement `FakeRoutingEngine` — configurable `parseResult`/`decideResult`/`resolveHumanResult`, error injection via `parseError`, records `parseCalls`, `resolveHumanCalls`, `decideCalls` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 20 | Implement `FakeContextAssembler` — configurable `result`, error injection via `assembleError`, records `assembleCalls` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 21 | Implement `FakeSkillInvoker` — configurable `result`, error injection via `invokeError`, records `invokeCalls`, `pruned` flag for `pruneOrphanedWorktrees()` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 22 | Implement `FakeResponsePoster` — records `postedEmbeds`, `postedErrors`, `completionEmbeds`, `createdThreads` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 23 | Implement `FakeTokenCounter` — configurable `fixedCount` override, defaults to char-based estimation | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 24 | Extend `FakeFileSystem` with `readDir()` (returns filenames from in-memory dirs) and `joinPath()` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 25 | Extend `FakeGitClient` with worktree operations: `worktrees`, `createWorktreeError`, `diffResult`, `prunedPrefix`, `removedWorktrees`, `deletedBranches` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 26 | Extend `FakeDiscordClient` with `postedEmbeds`, `createdThreads`, `systemMessages`, `postEmbedError`, `createThreadError` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 27 | Extend `defaultTestConfig()` with Phase 3 optional fields: `agents.colours`, `agents.role_mentions`, `orchestrator.token_budget` | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |
| 28 | Extend `createStubMessage()` with optional `embeds` and `mentions` fields | — | `ptah/tests/fixtures/factories.ts` | ⬚ Not Started |

### Phase C: Token Counter (TDD)

Simple module with no dependencies — foundation for ContextAssembler.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 29 | `CharTokenCounter.count()` returns `Math.ceil(text.length / 4)` for typical text | `ptah/tests/unit/orchestrator/token-counter.test.ts` | `ptah/src/orchestrator/token-counter.ts` | ⬚ Not Started |
| 30 | `CharTokenCounter.count()` returns 0 for empty string, 1 for single character, correct value at exact multiples of 4 | `ptah/tests/unit/orchestrator/token-counter.test.ts` | `ptah/src/orchestrator/token-counter.ts` | ⬚ Not Started |

### Phase D: Thread Queue (TDD)

In-memory per-thread queue. Production implementation also used in tests (RP-R7).

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 31 | `InMemoryThreadQueue.enqueue()` runs task immediately when no other task is processing for the thread | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 32 | Same-thread tasks run sequentially — second task waits for first to complete | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 33 | Different-thread tasks run concurrently — tasks for thread A and thread B overlap in execution | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 34 | Error isolation — a failing task does not block the next queued task for the same thread | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |
| 35 | `isProcessing()` returns true when a task is in-flight or queued, false otherwise | `ptah/tests/unit/orchestrator/thread-queue.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |

Dedicated fake test (non-trivial async logic):

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 36 | `InMemoryThreadQueue` dedicated test — verify sequential ordering with async resolution and error isolation | `ptah/tests/unit/orchestrator/thread-queue-impl.test.ts` | `ptah/src/orchestrator/thread-queue.ts` | ⬚ Not Started |

### Phase E: Routing Engine (TDD)

Signal parsing, human message resolution, and routing decision logic. Uses no fakes — pure logic.

**Signal Parsing:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 37 | Parse valid `ROUTE_TO_AGENT` signal from `<routing>` tags — returns `RoutingSignal` with correct type, agentId, threadAction | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 38 | Parse valid `ROUTE_TO_USER` signal — returns signal with question field | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 39 | Parse valid `LGTM` and `TASK_COMPLETE` signals — returns terminal signals | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 40 | Missing routing signal — throws `RoutingParseError("missing routing signal")` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 41 | Malformed JSON inside `<routing>` tags — throws `RoutingParseError` with parse details | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 42 | Multiple routing signals — uses first, logs warning (AT-RP-10). Requires Logger injection. | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 43 | Empty response (no text) — throws `RoutingParseError("missing routing signal")` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 44 | Validation: `ROUTE_TO_AGENT` without `agent_id` throws; `ROUTE_TO_USER` without `question` throws | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 45 | `ROUTE_TO_AGENT` with missing `thread_action` defaults to `"reply"` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |

**Human Message Resolution:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 46 | `resolveHumanMessage()` detects Discord role @mention and maps to agent ID via `config.discord.role_mentions` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 47 | No @mention detected — returns `null` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 48 | Unknown role ID (not in config) — returns `null` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |

**Routing Decision:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 49 | `decide()` for `ROUTE_TO_AGENT` with `reply` — returns decision with `targetAgentId`, `isTerminal: false`, `createNewThread: false` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 50 | `decide()` for `ROUTE_TO_AGENT` with `new_thread` — returns `createNewThread: true` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 51 | `decide()` for `ROUTE_TO_USER` — returns `isPaused: true`, `isTerminal: false`, `targetAgentId: null` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 52 | `decide()` for `LGTM` / `TASK_COMPLETE` — returns `isTerminal: true`, `targetAgentId: null` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 53 | `decide()` for unknown agent — throws `RoutingError("unknown agent '{id}'")` | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |
| 54 | `decide()` allows self-routing (agent routes to itself) — valid, returns normally | `ptah/tests/unit/orchestrator/router.test.ts` | `ptah/src/orchestrator/router.ts` | ⬚ Not Started |

### Phase F: Context Assembler (TDD)

Three-layer context assembly with resume pattern detection and token budget enforcement. Uses `FakeFileSystem`, `FakeTokenCounter`, `FakeLogger`.

**Fresh Invocation:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 55 | Fresh invocation — Layer 1 contains role prompt + overview.md + two-iteration rule + routing instruction. Layer 2 contains fresh reads of feature folder files. Layer 3 contains trigger message verbatim. (AT-CB-01) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 56 | Feature name extraction — text before " — " (em dash); full name if no em dash (AT-CB-07, AT-CB-08) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 57 | overview.md deduplication — appears in Layer 1 only, excluded from Layer 2 (CB-R4, AT-CB-06) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Resume Pattern Detection:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 58 | Zero prior agent turns → `"fresh"` pattern | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 59 | Pattern A detection — most recent routing signal targets a different agent than the poster → `"pattern_a"` | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 60 | Pattern C detection — default when prior agent turns exist and Pattern A doesn't apply → `"pattern_c"` | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Pattern A — Agent-to-Agent Q&A:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 61 | Pattern A Layer 3: task reminder + question verbatim + answer verbatim (AT-RPA-01). Includes dedicated edge case: when task reminder cannot be determined from routing metadata, falls back to thread's first message (AT-RPA-03) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 62 | Multi-message question concatenation — consecutive messages from asking agent joined (AT-RPA-02) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 63 | No summarization — question and answer included verbatim regardless of length (AT-RPA-04) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Pattern C — Review Loop:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 64 | Turn counting — counts agent-posted embeds only, excludes human and system messages (AT-RPC-04) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 65 | Turn 1 Layer 3 — artifact to review verbatim, no prior turns, no final-review instruction (AT-RPC-05) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 66 | Turn 2 Layer 3 — Turn 1 + Turn 2 verbatim, no final-review instruction (AT-RPC-06) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 67 | Turn 3 Layer 3 — all prior turns + final-review instruction injected (AT-RPC-01, AT-RPC-02) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 68 | Turn 4 Layer 3 — all prior turns (max 3) + current turn, NO final-review instruction (AT-RPC-07) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 69 | Human messages between turns included as context but do not affect turn count (AT-RPC-04) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Token Budget Enforcement:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 70 | Layer 1 and Layer 3 never truncated — regardless of budget pressure (CB-R1, AT-CB-02) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 71 | Layer 2 truncated from least-relevant files first when over budget (AT-CB-12) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 72 | Layer 2 omitted entirely when Layer 1 + Layer 3 exceed 85% budget — log warning (AT-CB-09) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 73 | `test.skip` — REQ-CB-06 task splitting on budget overflow (AT-CB-05, P1 deferred). Placeholder test with reference to requirement and deferral rationale. Will be implemented when Phase 4 artifact persistence is available. | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | — | ⬚ Not Started |
| 74 | Token budget uses configurable percentages from `config.orchestrator.token_budget` (CB-R5) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

**Edge Cases:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 75 | Missing feature folder — Layer 2 empty, log warning, invocation proceeds (AT-CB-04) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 76 | Missing overview.md — Layer 1 contains only role prompt, log warning (AT-CB edge case) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 77 | Missing role prompt — throws error (fatal for this invocation) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 78 | Ambiguous thread name — exact match preferred, then longest prefix match, then Layer 2 empty (AT-CB-10) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 79 | Fresh artifact reads — Layer 2 reads from filesystem at invocation time, not cached (AT-CB-03) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |
| 80 | Token counting fallback — when `TokenCounter.count()` throws, falls back to char-based estimation (`Math.ceil(text.length / 4)`), logs warning, proceeds normally (AT-CB-11) | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | `ptah/src/orchestrator/context-assembler.ts` | ⬚ Not Started |

### Phase G: Response Poster (TDD)

Embed posting and thread creation. Uses `FakeDiscordClient`, `FakeLogger`.

**Deferred:** AT-CB-05 (task splitting on budget overflow) is P1 priority. The P0 fallback — omitting Layer 2 entirely when budget is exceeded (Task 72) — is implemented in Phase F. Task splitting (creating sub-tasks in new threads) is deferred to a future plan since it depends on Phase 4 artifact persistence to be useful.

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

### Phase H: Skill Invoker (TDD)

Worktree lifecycle and Claude Code invocation. Uses `FakeSkillClient`, `FakeGitClient`, `FakeLogger`.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 92 | Happy path — creates worktree, invokes Claude Code, detects /docs artifact changes, cleans up worktree + branch (AT-SI-01) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 93 | Branch naming — follows `ptah/{agentId}/{threadId}/{invocationId}` convention with 8-char hex ID (AT-SI-08) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 94 | Worktree path — uses `{os.tmpdir()}/ptah-worktrees/{invocationId}` | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 95 | Timeout — invocation exceeds 90s, worktree cleaned up, throws `InvocationTimeoutError` (AT-SI-04) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 96 | Invocation error — SkillClient throws, worktree cleaned up, throws `InvocationError` (AT-SI-07) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 97 | Rate limit / API error — SkillClient throws rate limit or API error, worktree cleaned up (AT-SI-11) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 98 | Worktree creation failure — git error, Skill not invoked, throws (AT-SI-06) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 99 | Artifact filtering — only /docs changes tracked, non-/docs changes ignored with warning (AT-SI-09) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 100 | Layer 1 file modification warning — changes to overview.md logged as unusual but allowed (AT-SI-12) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 101 | `pruneOrphanedWorktrees()` calls `gitClient.pruneWorktrees("ptah/")` for startup cleanup (SI-R9) | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |
| 102 | Cleanup guaranteed on success, timeout, and error — worktree removed + branch deleted in all paths | `ptah/tests/unit/orchestrator/skill-invoker.test.ts` | `ptah/src/orchestrator/skill-invoker.ts` | ⬚ Not Started |

### Phase I: Orchestrator (TDD)

Main message processing loop. Uses all fakes: `FakeRoutingEngine`, `FakeContextAssembler`, `FakeSkillInvoker`, `FakeResponsePoster`, `FakeDiscordClient`, `FakeLogger`, plus `InMemoryThreadQueue` (real implementation).

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 103 | Bot messages ignored — `message.isBot === true` → no processing (AT-RP-07) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 104 | Human message with @mention — resolves agent ID, reads history, assembles context, invokes skill, posts response (full happy path AT-E2E-01 at unit level) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 105 | Human message with no @mention — posts system message asking user to specify target agent (AT-RP-09) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 106 | ROUTE_TO_AGENT with reply — loops back to context assembly with new agentId (routing loop continuation) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 107 | ROUTE_TO_AGENT with new_thread — creates coordination thread, enqueues processing for new thread (AT-RP new thread) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 108 | ROUTE_TO_USER — posts system message with question, thread paused (AT-RP-04) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 109 | LGTM terminal signal — posts completion embed, no further routing (AT-RP-03). Also covers AT-RPC-03 (early LGTM at Turn 2 in review context) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 110 | TASK_COMPLETE terminal signal — posts completion embed, no further routing (AT-RP-06) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 111 | Routing parse error — posts error embed "Routing error: {details}", no agent invoked (AT-RP-02) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 112 | Skill invocation timeout — posts error embed "Skill invocation timed out (>90s)" | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 113 | Skill invocation API error — posts error embed "Skill invocation failed: {error}" | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 114 | Per-thread sequential processing via ThreadQueue — verifies `handleMessage` enqueues tasks (AT-RP-12, AT-RP-13) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |
| 115 | `startup()` calls `skillInvoker.pruneOrphanedWorktrees()` and resolves debug channel. `pruneOrphanedWorktrees()` failure is best-effort — log warning, continue startup (SI-R9, Q-01 resolved) | `ptah/tests/unit/orchestrator/orchestrator.test.ts` | `ptah/src/orchestrator/orchestrator.ts` | ⬚ Not Started |

### Phase J: Service Implementations (TDD)

Concrete implementations for extended protocols. These wrap external libraries (discord.js, git CLI, Claude Code SDK).

**ClaudeCodeClient:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 116 | `invoke()` calls Claude Code SDK with system prompt + user message + `cwd` set to worktree path, returns text content (happy path) | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 117 | `allowedTools` defaults to `["Edit", "Read", "Write", "Glob", "Grep"]` — no Bash access | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 118 | Timeout — throws after `timeoutMs` elapsed | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 119 | Process/API error — throws on Claude Code failure | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |
| 120 | Rate limit error — throws identifiable rate limit error | `ptah/tests/unit/services/claude-code.test.ts` | `ptah/src/services/claude-code.ts` | ⬚ Not Started |

**DiscordJsClient extensions:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 121 | `postEmbed()` posts a colour-coded embed to the specified thread, returns message ID | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 122 | `postEmbed()` splits content >4096 chars into numbered sequential embeds | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 123 | `createThread()` creates thread with name and initial embed, returns thread ID | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |
| 124 | `postSystemMessage()` posts Gray embed to thread | `ptah/tests/unit/services/discord.test.ts` | `ptah/src/services/discord.ts` | ⬚ Not Started |

**NodeGitClient extensions:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 125 | `createWorktree()` runs `git worktree add -b {branch} {path}` | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 126 | `removeWorktree()` runs `git worktree remove --force {path}` | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 127 | `deleteBranch()` runs `git branch -D {branch}` | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 128 | `listWorktrees()` parses `git worktree list --porcelain` output into `WorktreeInfo[]` | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 129 | `pruneWorktrees()` lists worktrees, removes those with matching branch prefix, deletes their branches | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |
| 130 | `diffWorktree()` runs `git diff --name-only HEAD` in worktree, returns changed file paths | `ptah/tests/unit/services/git.test.ts` | `ptah/src/services/git.ts` | ⬚ Not Started |

**NodeFileSystem extensions:**

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 131 | `readDir()` returns filenames in directory; returns empty array for non-existent directory | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ⬚ Not Started |
| 132 | `joinPath()` joins path segments via `node:path.join()` | `ptah/tests/integration/services/filesystem.test.ts` | `ptah/src/services/filesystem.ts` | ⬚ Not Started |

### Phase K: Config & Composition (TDD)

Config loader validation updates, defaults updates, StartCommand update, and composition root wiring.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 133 | `NodeConfigLoader` validates `agents.active` is non-empty array and `agents.skills` is non-empty object | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ⬚ Not Started |
| 134 | `NodeConfigLoader` applies defaults for new optional fields: `agents.colours`, `agents.role_mentions`, `orchestrator.token_budget` | `ptah/tests/unit/config/loader.test.ts` | `ptah/src/config/loader.ts` | ⬚ Not Started |
| 135 | `buildConfig()` in `defaults.ts` includes `agents.colours` and `agents.role_mentions` placeholder in generated config | — | `ptah/src/config/defaults.ts` | ⬚ Not Started |
| 136 | `StartCommand` constructor accepts `Orchestrator` as 4th parameter; `execute()` calls `orchestrator.startup()` before accepting messages and `orchestrator.handleMessage()` as the thread message handler (replaces logging handler) | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ⬚ Not Started |
| 137 | `StartCommand.execute()` validates Claude Code is available (e.g., checks `@anthropic-ai/claude-code` can be imported), throws with guidance if not | `ptah/tests/unit/commands/start.test.ts` | `ptah/src/commands/start.ts` | ⬚ Not Started |
| 138 | Update composition root in `bin/ptah.ts` — wire all new services: `ClaudeCodeClient`, `NodeGitClient`, `CharTokenCounter`, `InMemoryThreadQueue`, `DefaultRoutingEngine`, `DefaultContextAssembler`, `DefaultSkillInvoker`, `DefaultResponsePoster`, `DefaultOrchestrator` | — | `ptah/bin/ptah.ts` | ⬚ Not Started |

### Phase L: Integration Tests

End-to-end routing loop using real internal modules with fakes for external boundaries.

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 139 | Full routing loop — human message → route → assemble context → invoke skill → post response → parse routing → handle decision. Uses `FakeSkillClient`, `FakeDiscordClient`, real `DefaultRoutingEngine`, real `DefaultContextAssembler`, real `DefaultSkillInvoker` (with `FakeGitClient`), real `DefaultResponsePoster`. Includes assertion that no Discord IDs appear in any /docs content (AT-DI-03) | `ptah/tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |
| 140 | Multi-turn routing loop — ROUTE_TO_AGENT reply chains through 2 agents, ending with LGTM terminal signal | `ptah/tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |
| 141 | Pattern C review loop integration — 4-turn review with Turn 3 final-review injection, ending with LGTM (AT-RPC-01 through AT-RPC-07 at integration level) | `ptah/tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |
| 142 | Pattern A agent-to-agent Q&A integration — PM asks Dev a question (ROUTE_TO_AGENT), Dev answers (ROUTE_TO_AGENT back to PM), PM receives Pattern A context bundle with task reminder + question + answer (AT-RPA-01 through AT-RPA-04 at integration level) | `ptah/tests/integration/orchestrator/routing-loop.test.ts` | — | ⬚ Not Started |

---

## 3. Task Dependency Notes

```
Phase A (Types & Protocols)
  └── Phase B (Test Doubles) — depends on types
        ├── Phase C (TokenCounter) — no other deps
        ├── Phase D (ThreadQueue) — no other deps
        ├── Phase E (RoutingEngine) — depends on types
        ├── Phase F (ContextAssembler) — depends on C (TokenCounter)
        ├── Phase G (ResponsePoster) — depends on types
        └── Phase H (SkillInvoker) — depends on types
              └── Phase I (Orchestrator) — depends on E, F, G, H, D
                    └── Phase K (Config & Composition) — depends on I
                          └── Phase L (Integration) — depends on all

Phase J (Service Implementations) can run in parallel with Phases C–I
since unit tests use fakes, not real service implementations.
```

Within each phase, tasks are ordered by dependency and TDD cycle (test first, then implementation). Tasks within the same phase that share a test file can be implemented in sequence within a single session.

---

## 4. Integration Points with Phase 2

| # | Integration | How Phase 3 Connects |
|---|-------------|---------------------|
| 1 | `DiscordClient` protocol | Extended with 3 new methods (`postEmbed`, `createThread`, `postSystemMessage`). Existing 5 methods unchanged. |
| 2 | `GitClient` protocol | Extended with 6 new worktree methods. Existing 4 methods unchanged. |
| 3 | `FileSystem` protocol | Extended with 2 new methods (`readDir`, `joinPath`). Existing 6 methods unchanged. |
| 4 | `StartCommand` | Constructor signature changes (adds `Orchestrator` parameter). Message handler changes from logging to `orchestrator.handleMessage()`. Existing `start.test.ts` tests must be updated. |
| 5 | `PtahConfig` type | Extended with optional fields. Backward-compatible — existing configs continue to work. |
| 6 | `bin/ptah.ts` | Composition root extended with new service wiring. Existing `init` subcommand unchanged. |
| 7 | `tests/fixtures/factories.ts` | Extended with new fakes and factory updates. Existing fakes unchanged (additive only). |

---

## 5. Definition of Done

- [ ] All 142 tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests (except deferred REQ-CB-06 task splitting — P1, tracked)
- [ ] Code reviewed against requirement acceptance criteria (61 FSPEC acceptance tests)
- [ ] Implementation matches TSPEC (protocols, algorithms, error handling, test doubles)
- [ ] Existing Phase 1/2 tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review

---

*Gate: User reviews and approves this execution plan before implementation begins.*
