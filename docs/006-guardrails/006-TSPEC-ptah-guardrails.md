# Technical Specification: Phase 6 — Guardrails

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-DI-08], [REQ-RP-05], [REQ-SI-07], [REQ-SI-08], [REQ-SI-10], [REQ-NF-02] |
| **Functional Specifications** | [FSPEC-GR-01], [FSPEC-GR-02], [FSPEC-GR-03] — [006-FSPEC-ptah-guardrails](./006-FSPEC-ptah-guardrails.md) |
| **Analysis** | Inline — FSPEC contains full behavioral specification; codebase analysis performed inline |
| **Date** | March 13, 2026 |
| **Status** | Approved (v1.2) |

---

## 1. Summary

Phase 6 adds three behavioural safety nets to the Orchestrator: **retry with exponential backoff** when Skill invocations fail, **turn-limit enforcement** to prevent runaway threads, and **graceful shutdown** on SIGINT/SIGTERM.

The implementation introduces three new modules (`InvocationGuard`, `ThreadStateManager`, `WorktreeRegistry`), extends two existing modules (`ThreadQueue`, `Orchestrator`), and replaces the minimal `shutdown.ts` with a full structured shutdown sequence. All retry delays are cancellable via `AbortSignal` so shutdown can interrupt a backoff wait without leaving threads in a half-started state. No new npm dependencies are required.

Phase 6 wraps — but does not rewrite — the Phase 3/4/5 routing loop. The `InvocationGuard` sits between the orchestrator and the `SkillInvoker` / `ArtifactCommitter` pair; the orchestrator's outer flow (context assembly, response posting, signal parsing) is unchanged.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Continues Phase 1–5 stack |
| Language | TypeScript 5.x (ESM) | Continues Phase 1–5 stack |
| Backoff cancellation | `AbortController` / `AbortSignal` | Built-in; allows retry backoff delay to be interrupted on shutdown without additional dependencies |
| Test framework | Vitest | Continues Phase 1–5 stack; fake timers (`vi.useFakeTimers()`) used for backoff delay tests |

---

## 3. Project Structure

```
ptah/
├── src/
│   ├── orchestrator/
│   │   ├── invocation-guard.ts       NEW — retry + failure-handling wrapper
│   │   ├── thread-state-manager.ts   NEW — turn-count tracking, OPEN/CLOSED/STALLED
│   │   ├── worktree-registry.ts      NEW — in-memory registry of active worktrees
│   │   ├── thread-queue.ts           UPDATED — add activeCount()
│   │   └── orchestrator.ts           UPDATED — wire new modules, turn-limit checks, debug channel, enhanced shutdown
│   ├── shutdown.ts                   UPDATED — full graceful shutdown sequence
│   └── types.ts                      UPDATED — new config keys, ThreadStatus type
├── tests/
│   ├── unit/
│   │   ├── orchestrator/
│   │   │   ├── invocation-guard.test.ts   NEW
│   │   │   ├── thread-state-manager.test.ts  NEW
│   │   │   └── worktree-registry.test.ts  NEW
│   │   └── shutdown.test.ts               NEW (extended)
│   └── fixtures/
│       └── factories.ts              UPDATED — FakeInvocationGuard, FakeThreadStateManager, FakeWorktreeRegistry
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/ptah.ts (composition root)
  └─ createShutdownHandler (shutdown.ts)
       ├─ DefaultOrchestrator (orchestrator.ts)
       │    ├─ DefaultInvocationGuard (invocation-guard.ts)   NEW
       │    │    ├─ SkillInvoker
       │    │    ├─ ArtifactCommitter
       │    │    ├─ GitClient          (worktree reset before retry)
       │    │    ├─ DiscordClient      (error embed + debug channel)
       │    │    └─ Logger
       │    ├─ InMemoryThreadStateManager (thread-state-manager.ts)  NEW
       │    ├─ InMemoryWorktreeRegistry (worktree-registry.ts)       NEW
       │    └─ InMemoryThreadQueue (thread-queue.ts)   UPDATED activeCount()
       └─ DiscordClient               (disconnect on exit)
```

### 4.2 Protocols (TypeScript Interfaces)

#### 4.2.1 `InvocationGuard` — `src/orchestrator/invocation-guard.ts`

```typescript
export type FailureCategory = "transient" | "unrecoverable";

export interface InvocationGuardParams {
  agentId: string;
  threadId: string;
  threadName: string;
  bundle: ContextBundle;
  worktreePath: string;
  branch: string;
  config: PtahConfig;
  /** Set when the Orchestrator enters shutdown mode — cancels backoff delays. */
  shutdownSignal: AbortSignal;
  /**
   * Channel ID for the #agent-debug channel. May be null if the channel was
   * not found during startup. Passed at invocation time (not stored on the guard)
   * to avoid mutable guard state.
   */
  debugChannelId: string | null;
}

export type GuardResult =
  | { status: "success"; invocationResult: InvocationResult; commitResult: CommitResult }
  | { status: "exhausted" }     // error embed already posted; worktree cleaned up
  | { status: "unrecoverable" } // same as exhausted but 0 retries were attempted
  | { status: "shutdown" };     // aborted mid-backoff; error embed posted; worktree cleaned up

export interface InvocationGuard {
  invokeWithRetry(params: InvocationGuardParams): Promise<GuardResult>;
}
```

**Behavioural contract:**
- Calls `SkillInvoker.invoke()` then `ArtifactCommitter.commitAndMerge()` as one logical unit.
- On failure, classifies as transient or unrecoverable (see §5.1).
- Transient: increments `retryCount`, computes backoff delay, waits (cancellable via `shutdownSignal`), resets the worktree to HEAD, then retries from `SkillInvoker.invoke()`.
- Retries up to `config.orchestrator.retry_attempts` times (default: 3).
- On exhaustion or unrecoverable failure: posts error embed to the originating thread, logs full details to `#agent-debug`, cleans up the worktree, returns `{ status: "exhausted" }`.
- On successful retry: logs success to `#agent-debug`, returns `{ status: "success", ... }`.
- If `shutdownSignal` fires during a backoff delay: returns `{ status: "shutdown" }` without posting an error embed (the shutdown handler manages exit).

#### 4.2.2 `ThreadStateManager` — `src/orchestrator/thread-state-manager.ts`

```typescript
export type ThreadStatus = "open" | "closed" | "stalled";

export interface ThreadStateEntry {
  status: ThreadStatus;
  turnCount: number;
  isReviewThread: boolean;
  reviewTurnCount: number;
  parentThreadId?: string;
}

export interface ThreadStateManager {
  /**
   * Check general turn limit. If allowed, increment turn count and return "allowed".
   * If limit reached, return "limit-reached" (caller must post close embed).
   * If thread is already CLOSED or STALLED, return "limit-reached".
   */
  checkAndIncrementTurn(threadId: string, maxTurns: number): "allowed" | "limit-reached";

  /**
   * Mark thread as CLOSED (general limit exhausted).
   * Future calls to checkAndIncrementTurn return "limit-reached".
   */
  closeThread(threadId: string): void;

  /**
   * Register a thread as a Pattern C review sub-thread.
   * Must be called when the Orchestrator creates a coordination thread.
   */
  registerReviewThread(threadId: string, parentThreadId: string): void;

  /** True if the thread was registered as a review thread. */
  isReviewThread(threadId: string): boolean;

  /**
   * Check review-thread turn limit (fixed at 4). If allowed, increment
   * reviewTurnCount and return "allowed". If >= 4, return "stalled"
   * (caller must post stall embed). Already-STALLED threads return "stalled".
   */
  checkAndIncrementReviewTurn(threadId: string): "allowed" | "stalled";

  /** Mark review thread as STALLED. */
  stallReviewThread(threadId: string): void;

  /**
   * Return the parent thread ID for a review thread, as supplied to
   * registerReviewThread(). Returns undefined if threadId is unknown or
   * was not registered as a review thread.
   * Used by the orchestrator to populate the #agent-debug stall log message
   * per FSPEC §4.4 Step 3b: "Parent thread: {parentThreadId}".
   */
  getParentThreadId(threadId: string): string | undefined;

  /** Current status for a thread (defaults to "open" if unseen). */
  getStatus(threadId: string): ThreadStatus;

  /**
   * Reconstruct turn count for a thread from its Discord message history.
   * Counts only messages that triggered routing invocations (non-bot,
   * non-system messages). Called on startup for each known active thread.
   */
  reconstructTurnCount(threadId: string, messages: ThreadMessage[], isReview: boolean): void;

  /** Returns all thread IDs with status OPEN (for monitoring). */
  openThreadIds(): string[];
}
```

**Behavioural contract:**
- All state is in-memory; does not persist to disk.
- Unknown threads are treated as OPEN with `turnCount = 0`.
- The review-thread limit is fixed at 4 (not parameterised).
- `reconstructTurnCount` counts messages where `isBot === false && !isSystemMessage(content)`, where `isSystemMessage` detects embeds posted by the Orchestrator itself (heuristic: messages starting with `⏸`, `🔒`, `🚨`, `⛔`).

#### 4.2.3 `WorktreeRegistry` — `src/orchestrator/worktree-registry.ts`

```typescript
export interface ActiveWorktree {
  worktreePath: string;
  branch: string;
}

export interface WorktreeRegistry {
  /** Called when a worktree is created before an invocation. */
  register(worktreePath: string, branch: string): void;

  /** Called after worktree cleanup (successful merge or error cleanup). */
  deregister(worktreePath: string): void;

  /** Returns a snapshot of all currently registered worktrees. */
  getAll(): ReadonlyArray<ActiveWorktree>;

  /** Total number of registered worktrees. */
  size(): number;
}
```

#### 4.2.4 `ThreadQueue` updates — `src/orchestrator/thread-queue.ts`

```typescript
export interface ThreadQueue {
  enqueue(threadId: string, task: () => Promise<void>): void;
  isProcessing(threadId: string): boolean;
  /** Phase 6: total count of threads with active or queued tasks. */
  activeCount(): number;
}
```

### 4.3 Concrete Implementations

#### `DefaultInvocationGuard`

```
Dependencies: SkillInvoker, ArtifactCommitter, GitClient, DiscordClient, Logger
Constructor params: all five as protocol types (no debugChannelId — received via InvocationGuardParams at invocation time)
```

Implements the full retry algorithm from §5.1. Maintains `malformedSignalCount: number` per invocation to enforce GR-R6 (two-strike rule for missing routing signals). Uses `vi.useFakeTimers()` in tests to control backoff delays deterministically.

#### `InMemoryThreadStateManager`

```
Dependencies: none
Constructor: no params (pure in-memory state)
```

Stores `Map<string, ThreadStateEntry>`. Returns default OPEN entry for unknown threadIds.

#### `InMemoryWorktreeRegistry`

```
Dependencies: none
Constructor: no params (pure in-memory state)
```

Stores `Map<string, ActiveWorktree>` keyed by `worktreePath`.

#### `InMemoryThreadQueue` (updated)

Adds `activeCount()` by counting entries in `processing` where the value is `true`, plus entries in `queues` where the array is non-empty. Uses the existing `queues` and `processing` maps — no new state required.

### 4.4 Composition Root Changes — `bin/ptah.ts`

Three new instantiations are added and wired into `DefaultOrchestrator`:

```typescript
// Phase 6 additions
const worktreeRegistry = new InMemoryWorktreeRegistry();
const threadStateManager = new InMemoryThreadStateManager();
const invocationGuard = new DefaultInvocationGuard(
  skillInvoker,
  artifactCommitter,
  gitClient,
  discordClient,
  logger,
  // No debugChannelId here — it is resolved in orchestrator.startup() and
  // passed via InvocationGuardParams at each invocation call site.
);
```

`DefaultOrchestrator` is extended with new required fields in `OrchestratorDeps`:

```typescript
// Phase 6 additions to OrchestratorDeps
invocationGuard: InvocationGuard;
threadStateManager: ThreadStateManager;
worktreeRegistry: WorktreeRegistry;
/**
 * Shared AbortSignal from the composition-root AbortController.
 * The orchestrator passes this to InvocationGuardParams.shutdownSignal
 * at each invokeWithRetry() call site, so that backoff delays can be
 * cancelled when the shutdown handler calls abortController.abort().
 */
shutdownSignal: AbortSignal;
```

The composition root wires the signal as follows:

```typescript
// bin/ptah.ts (Phase 6 additions)
const abortController = new AbortController();

const orchestrator = new DefaultOrchestrator({
  // ... existing deps ...
  invocationGuard,
  threadStateManager,
  worktreeRegistry,
  shutdownSignal: abortController.signal,   // ← Phase 6 addition
});
```

`createShutdownHandler` signature changes to accept the `GitClient` and `WorktreeRegistry` for the shutdown-commit step:

```typescript
export function createShutdownHandler(
  result: StartResult,
  logger: Logger,
  // Phase 6 additions:
  threadQueue: ThreadQueue,
  worktreeRegistry: WorktreeRegistry,
  gitClient: GitClient,
  shutdownTimeoutMs: number,
  abortController: AbortController,  // shared; abort() called on shutdown to cancel backoff waits
): ShutdownHandler
```

---

## 5. Algorithm Descriptions

### 5.1 Retry Algorithm — `DefaultInvocationGuard.invokeWithRetry()` (FSPEC-GR-01)

```
STATE: retryCount = 0, malformedSignalCount = 0

LOOP:
  1. Invoke skill:
     result = await skillInvoker.invoke(bundle, config, worktreePath)

  2. Parse routing signal (best-effort check for GR-R6):
     If result.routingSignalRaw is empty or contains no ROUTE_TO_* tag:
       malformedSignalCount++
       If malformedSignalCount >= 2:
         category = "unrecoverable"      → skip to EXHAUSTION
       Else:
         category = "transient"          → fall through to FAILURE path

  3. Commit artifacts:
     commitResult = await artifactCommitter.commitAndMerge(...)
     If commitResult.mergeStatus === "conflict":
       category = "unrecoverable"        → skip to EXHAUSTION
     If commitResult.mergeStatus === "commit-error" | "lock-timeout" | "merge-error":
       category = "transient"            → skip to step 6 (retry-count check)
       (These statuses are RETURNED by commitAndMerge(), not thrown. The algorithm
        must explicitly branch here to avoid falling through to SUCCESS.)

  4. SUCCESS: return { status: "success", invocationResult: result, commitResult }

  FAILURE (caught exception OR unrecoverable commit):
  5. Classify failure:
     If error is InvocationTimeoutError:          category = "transient"
     If error message contains "401" | "403" | "Unauthorized" | "authentication":
                                                   category = "unrecoverable"
     If error is InvocationError (other):          category = "transient"
     If error is RoutingParseError:
       malformedSignalCount++
       category = (malformedSignalCount >= 2) ? "unrecoverable" : "transient"

  6. If category === "unrecoverable" OR retryCount >= retry_attempts:
     → EXHAUSTION

  7. retryCount++
     delay = min(retryBaseDelayMs * 2^(retryCount - 1), retryMaxDelayMs)
     Log to #agent-debug: "[ptah] Retry {retryCount}/{retry_attempts} for
       {agentId} in thread {threadName} — retrying in {delay}ms. Error: {message}"

     Try to await delay (cancellable via shutdownSignal):
       If shutdownSignal fires during delay:
         → Post error embed to thread (same as EXHAUSTION steps 9–10 below,
           treating the last attempt's failure as the final result — per AT-GR-16)
         → Clean up worktree (removeWorktree + deleteBranch)
         → return { status: "shutdown" }
         (The orchestrator simply deregisters the worktree on receiving this status;
          no further embed is posted by the orchestrator.)

     Reset worktree to clean state:
       git -C {worktreePath} reset --hard HEAD
       git -C {worktreePath} clean -fd

     Continue LOOP

EXHAUSTION:
  8. Log to #agent-debug (full error + stacktrace):
     "[ptah] ERROR: All {retry_attempts} retries exhausted for {agentId} in
      thread {threadName}. Giving up. Final error: {message}\nStacktrace: {stack}"

  9. Post error embed to thread:
     Colour: 0xFF0000 (red), Title: "⛔ Agent Error"
     Body: "{agentId} encountered an unrecoverable error and could not complete
            its task. A developer should investigate. Error: {short description}
            See #agent-debug for details."

  10. If posting the error embed fails (Discord unavailable):
      Log to console. Proceed — do NOT retry the embed post (GR-R5).

  11. Clean up worktree (removeWorktree + deleteBranch). Log warning on failure.

  12. Return { status: "exhausted" }
```

**Post-commit response-posting failure (GR-R9 / AT-GR-17):**

This path is handled in `orchestrator.ts`, NOT in `InvocationGuard`. After `guard.invokeWithRetry()` returns `{ status: "success" }`, the orchestrator posts the agent response. If that Discord post throws:

```
1. Do NOT retry the response post (artifacts are already committed).
2. Log commit SHA to #agent-debug:
   "[ptah] ERROR: Post-commit response embed failed for {agentId} in thread
    {threadName}. Artifact commit SHA: {commitSha}. Error: {discordError}.
    Developer action required."
3. Post partial-commit error embed to thread:
   Colour: 0xFF0000, Title: "⛔ Agent Error"
   Body: "{agentId} completed its task and committed artifacts to Git, but
          failed to post its response. Artifacts may be in a partially
          committed state. A developer should inspect the Git log.
          Error: {short description}. See #agent-debug for details."
4. Clean up worktree (removeWorktree + deleteBranch).
5. Return from routing loop iteration (do not continue routing).
```

### 5.2 Turn Limit Enforcement (FSPEC-GR-02)

**Integration point in `orchestrator.processMessage()` — runs before agent resolution:**

```
1. If thread is a review thread:
   a. Check review turn: manager.checkAndIncrementReviewTurn(threadId)
   b. If "stalled":
      → postStallEmbed (red, "🚨 Review Thread Stalled", body per FSPEC §4.4 Step 3a)
      → postToDebugChannel: "[ptah] Review thread {name} ({id}) STALLED after
         4 turns — no ROUTE_TO_DONE received. Parent thread: {parentId}"
      → manager.stallReviewThread(threadId)
      → return (drop message)

2. Check general turn limit: manager.checkAndIncrementTurn(threadId, maxTurnsPerThread)
   If "limit-reached":
     → If status is already "closed": silently return (GR-R11)
     → Else:
        postCloseEmbed (orange, "🔒 Thread Closed — Maximum Turns Reached",
          body per FSPEC §4.3 Step 3a)
        postToDebugChannel: "[ptah] Thread {name} ({id}) closed — max turns
          ({maxTurnsPerThread}) reached. No further routing."
        manager.closeThread(threadId)
        return (drop message)
```

The stall log in Step 1b (review-thread path) populates `{parentId}` from `manager.getParentThreadId(threadId)`:

```
postToDebugChannel: "[ptah] Review thread {name} ({id}) STALLED after 4 turns —
  no ROUTE_TO_DONE received. Parent thread: {manager.getParentThreadId(threadId) ?? 'unknown'}"
```

3. Proceed with normal routing.
```

**Startup reconstruction** — in `orchestrator.startup()`:

```
For each known thread in the Orchestrator's set of known threads
  (threads that have sent messages since the last restart):
  threadHistory = await discord.readThreadHistory(threadId)
  isReview = threadStateManager.isReviewThread(threadId)
  threadStateManager.reconstructTurnCount(threadId, threadHistory, isReview)
```

Note: "known threads" is the set of threads that appear in the Discord message listener callbacks. On restart, the Orchestrator does not proactively enumerate all Discord threads — it only reconstructs state when the first message arrives from a thread after restart (lazy reconstruction pattern). This matches the FSPEC edge case: if messages were deleted, default to `turnCount = 0` and log a warning.

**Lazy reconstruction algorithm** in `processMessage()`:

```
Before checking turn limits:
  If thread has not been seen since startup:
    Reconstruct its turn count from Discord history.
    Log to console: "[ptah] Reconstructed turn count for thread {threadId}: {count}"
```

This avoids a bulk history fetch on startup while still supporting the "restart and continue" requirement.

### 5.3 Graceful Shutdown Sequence (FSPEC-GR-03)

The `createShutdownHandler` function in `shutdown.ts` is rewritten to implement the full 7-step sequence:

```
SIGINT/SIGTERM received:

Step 1: Guard against double-signal
  If shuttingDown flag is true: process.exit(1) immediately (GR-R21)
  Set shuttingDown = true

Step 2: Enter shutdown mode
  a. Call abortController.abort() — cancels all pending retry backoff delays
  b. Log to console: "[ptah] Shutdown signal received. Waiting for in-flight
     invocations to complete..."
  c. Best-effort: post embed to #agent-debug:
     "[ptah] System shutting down. Active threads will complete their current
      invocation. No new messages will be processed."
     (On failure: log to console, continue — GR-R22)

Step 3: Wait for in-flight invocations
  a. startTime = now
  b. While threadQueue.activeCount() > 0 AND (now - startTime) < shutdownTimeoutMs:
     Log to console every 5 seconds:
       "[ptah] Waiting for {count} in-flight invocation(s) to complete..."
     Sleep 500ms
  c. If timed out: log force-exit warning, skip Steps 4a-4c → jump to Step 6 with exitCode = 1

Step 4: Commit pending Git changes
  a. worktrees = worktreeRegistry.getAll()
  b. For each worktree:
     hasChanges = await gitClient.hasUncommittedChanges(worktreePath)
     If true:
       git -C {worktreePath} add -A
       git -C {worktreePath} commit -m "[ptah] System: shutdown commit — uncommitted changes preserved"
       Log to console: "[ptah] Committed pending Git changes in {worktreePath}."
  c. If git fails: log to console, continue (don't block shutdown)

Step 5: Stop Phase 5 polling loop
  await orchestrator.shutdown()  (stops questionPoller, already implemented)

Step 6: Disconnect from Discord
  await discord.disconnect() with 5-second timeout
  (Force-close if timeout exceeded — log to console)

Step 7: Exit
  process.exit(exitCode)  // 0 = clean, 1 = force-exit
```

**`shutdownSignal` integration with retry backoff:**
A single `AbortController` is created at the composition root and shared with:
- `DefaultOrchestrator` (passed through to each `InvocationGuard.invokeWithRetry()` call)
- `createShutdownHandler` (calls `abort()` in Step 2a)

When `abort()` fires during a retry backoff delay, the `InvocationGuard` posts an error embed to the originating thread (per AT-GR-16 — the aborted attempt's last failure is treated as the final result), cleans up the worktree, and returns `{ status: "shutdown" }`. The orchestrator receives this result, deregisters the worktree from the registry, and exits the routing loop. No additional embed is posted by the orchestrator. The shutdown sequence continues.

When `abort()` fires during an active Skill invocation (not a backoff wait), the invocation runs to completion (GR-R17). `AbortSignal` is only checked at the backoff delay — not passed to `SkillInvoker.invoke()`.

---

## 6. Error Handling

| Scenario | Classification | Behaviour | Exit Code |
|----------|---------------|-----------|-----------|
| `InvocationTimeoutError` on attempt N | Transient | Retry with backoff; error embed on exhaustion | — |
| `InvocationError` (network, 5xx) | Transient | Retry with backoff; error embed on exhaustion | — |
| `InvocationError` with "401"/"403"/"auth" | Unrecoverable | Skip retries; error embed immediately | — |
| `RoutingParseError` on 1st occurrence | Transient (GR-R6) | Retry once; error embed if 2nd also malformed | — |
| `RoutingParseError` on 2nd consecutive | Unrecoverable (GR-R6) | Error embed; no further retry | — |
| Empty Skill output (no content) | Transient (GR-R6) | Same as malformed signal | — |
| `CommitResult.mergeStatus === "conflict"` | Unrecoverable | Skip retries; error embed immediately | — |
| `CommitResult.mergeStatus === "commit-error"` | Transient | Retry the full invocation + commit (returned, not thrown — §5.1 Step 3 handles) | — |
| `CommitResult.mergeStatus === "lock-timeout"` | Transient | Retry the full invocation + commit (returned, not thrown — §5.1 Step 3 handles) | — |
| `CommitResult.mergeStatus === "merge-error"` | Transient | Retry the full invocation + commit (returned, not thrown — §5.1 Step 3 handles) | — |
| Error posting error embed (Step 10 of exhaustion) | Non-blocking | Log to console; continue cleanup | — |
| Thread at general turn limit | N/A | Post orange "🔒" close embed; drop message | — |
| Thread already CLOSED | N/A | Silently drop message (GR-R11) | — |
| Review thread at 4-turn limit | N/A | Post red "🚨" stall embed; drop message | — |
| Review thread already STALLED | N/A | Silently drop message (GR-R11) | — |
| `maxTurnsPerThread` < 5 on startup | Configuration | Log startup warning; continue | — |
| Graceful shutdown, no in-flight | Clean | Complete < 2s; process.exit(0) | 0 |
| Graceful shutdown, in-flight completes in time | Clean | Wait for completion; process.exit(0) | 0 |
| `shutdownTimeoutMs` exceeded | Force exit | Log force-exit message; process.exit(1) | 1 |
| Second SIGINT during shutdown | Immediate exit | process.exit(1) immediately | 1 |
| Git index.lock exists during shutdown commit | Non-blocking | Log to console; skip that worktree's commit | 0 |
| Discord disconnect fails at shutdown | Non-blocking | Force-close after 5s; still process.exit(exitCode) | 0 or 1 |
| Phase 4 committed but Discord embed post fails | Partial-commit path | Partial-commit error embed; log SHA to #agent-debug | — |

---

## 7. Test Strategy

### 7.1 Approach

Phase 6 adds three new modules with complex async behaviour (retry backoff, shutdown coordination, turn-count state). All unit tests use Vitest's `vi.useFakeTimers()` to control `setTimeout`-based backoff delays without real wall-clock waits. Integration points with the Orchestrator are tested via the existing `FakeSkillInvoker`, `FakeArtifactCommitter`, and `FakeDiscordClient` extended with Phase 6 state.

### 7.2 Test Doubles

All test doubles live in `tests/fixtures/factories.ts`.

**`FakeInvocationGuard` implements `InvocationGuard`:**
```typescript
class FakeInvocationGuard implements InvocationGuard {
  // Configure per-test
  results: GuardResult[] = [];  // returned in order; last result repeats if list exhausted
  callCount = 0;
  lastParams: InvocationGuardParams | null = null;
  lastShutdownSignal: AbortSignal | null = null;  // captured for shutdown propagation assertions

  async invokeWithRetry(params: InvocationGuardParams): Promise<GuardResult> {
    this.lastParams = params;
    this.lastShutdownSignal = params.shutdownSignal;
    const result = this.results[this.callCount] ?? this.results[this.results.length - 1];
    this.callCount++;
    return result;
  }
}
```

**`FakeThreadStateManager` implements `ThreadStateManager`:**
```typescript
class FakeThreadStateManager implements ThreadStateManager {
  // Controllable outcomes per threadId
  turnResults = new Map<string, "allowed" | "limit-reached">();
  reviewTurnResults = new Map<string, "allowed" | "stalled">();
  reviewThreadIds = new Set<string>();
  turnCounts = new Map<string, number>();
  openThreadIdSet = new Set<string>();  // populated by tests for monitoring assertions
  parentThreadIds = new Map<string, string>();  // threadId → parentThreadId

  // openThreadIds() required by protocol — returns threads explicitly registered as open
  openThreadIds(): string[] { return Array.from(this.openThreadIdSet); }

  // getParentThreadId() required by protocol — returns from parentThreadIds map
  getParentThreadId(threadId: string): string | undefined {
    return this.parentThreadIds.get(threadId);
  }
  // ... full protocol implementation with test-injectable outcomes
}
```

**`FakeWorktreeRegistry` implements `WorktreeRegistry`:**
```typescript
class FakeWorktreeRegistry implements WorktreeRegistry {
  worktrees: ActiveWorktree[] = [];
  register(p: string, b: string): void { this.worktrees.push({ worktreePath: p, branch: b }); }
  deregister(p: string): void { this.worktrees = this.worktrees.filter(w => w.worktreePath !== p); }
  getAll(): ReadonlyArray<ActiveWorktree> { return this.worktrees; }
  size(): number { return this.worktrees.length; }
}
```

**`FakeDiscordClient` extension:**
Already exists; add a `debugChannelMessages: string[]` field to capture `#agent-debug` posts.
Note: this field is named `debugChannelMessages` and is separate from any existing
`postChannelMessageCalls` field to avoid confusion between debug-channel posts and
general channel posts.

**`FakeGitClient` extension (Phase 6 additions):**
Add:
- `hasUncommittedChangesResult = false` — return value for `hasUncommittedChanges()`
- `resetHardCalls: string[] = []` — captures worktree paths passed to reset-hard
- `addAllCalls: string[] = []` — captures worktree paths for `git add -A` (shutdown commit step)
- `commitCalls: Array<{ path: string; message: string }> = []` — captures shutdown commit invocations

### 7.3 Test Categories

| Category | File | Focus |
|----------|------|-------|
| InvocationGuard unit | `tests/unit/orchestrator/invocation-guard.test.ts` | Retry count, backoff delays (fake timers), failure classification, GR-R6 two-strike rule, worktree reset before retry, exhaustion embed, shutdown abort (error embed posted per AT-GR-16), CommitResult transient statuses ("commit-error"/"lock-timeout"/"merge-error") trigger retry path |
| ThreadStateManager unit | `tests/unit/orchestrator/thread-state-manager.test.ts` | Turn count increments, CLOSED/STALLED state transitions, review thread limit (fixed 4), lazy reconstruction, GR-R12 (review limit checked first), GR-R11 (silent drop) |
| WorktreeRegistry unit | `tests/unit/orchestrator/worktree-registry.test.ts` | Register, deregister, getAll snapshot |
| ThreadQueue unit (updated) | `tests/unit/orchestrator/thread-queue.test.ts` | `activeCount()` reflects processing + queued state |
| Orchestrator unit (updated) | `tests/unit/orchestrator/orchestrator.test.ts` | Turn limit integration, guard result handling, post-commit error path (GR-R9), worktree registry wiring |
| Shutdown unit | `tests/unit/shutdown.test.ts` | Double-SIGINT guard, wait loop (fake timers), shutdown timeout → exit 1, abort signal propagation, shutdown commit step |
| Acceptance tests (AT-GR-01–17) | `tests/integration/orchestrator/guardrails.test.ts` | End-to-end scenarios from FSPEC acceptance tests using real implementations with controlled fake clock |

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Components | Description |
|-------------|---------------------|-------------|
| REQ-SI-07 | `InvocationGuard`, `DefaultInvocationGuard` | Retry logic with exponential backoff |
| REQ-SI-08 | `InvocationGuard` (exhaustion path) | Error embed + continue running on failure |
| REQ-NF-02 | `InvocationGuard` (GR-R1: catch-all), `DefaultOrchestrator` wiring | Failures isolated per invocation; Orchestrator never re-throws |
| REQ-DI-08 | `ThreadStateManager`, `DefaultOrchestrator.processMessage()` | General turn limit check, close embed |
| REQ-RP-05 | `ThreadStateManager` (review thread tracking), `DefaultOrchestrator.processMessage()` | Review-thread 4-turn limit, stall embed |
| REQ-SI-10 | `createShutdownHandler` (Phase 6 rewrite), `ThreadQueue.activeCount()`, `WorktreeRegistry`, `AbortController` | Graceful shutdown: wait for in-flight, commit pending, exit cleanly |

---

## 9. Integration Points

### 9.1 Phase 3 (Skill Routing)

`DefaultInvocationGuard` wraps the existing `SkillInvoker.invoke()` call. The `ContextAssembler` and routing-signal parsing in `orchestrator.ts` are unchanged. The guard returns `CommitResult` alongside `InvocationResult` so the orchestrator can access the commit SHA for the GR-R9 error path.

### 9.2 Phase 4 (Artifact Commits)

`DefaultInvocationGuard` calls `ArtifactCommitter.commitAndMerge()` inside the retry scope. A `CommitResult.mergeStatus === "conflict"` is treated as unrecoverable (FSPEC §3.2 Step 2b). The worktree reset step (`git reset --hard HEAD && git clean -fd`) before retrying ensures no partial commit state bleeds into the next attempt.

### 9.3 Phase 5 (User Questions)

`DefaultOrchestrator.shutdown()` already calls `questionPoller.stop()`. The Phase 6 shutdown sequence calls `orchestrator.shutdown()` in Step 5 to preserve this behaviour. The `AbortController.abort()` fires before the shutdown wait (Step 2a), so any retry backoff in progress for a thread that asked a question is cancelled cleanly.

### 9.4 Config Schema

Two new keys are added to `PtahConfig.orchestrator` in `src/types.ts`:

```typescript
orchestrator: {
  max_turns_per_thread: number;   // existing
  pending_poll_seconds: number;   // existing
  retry_attempts: number;         // existing
  invocation_timeout_ms?: number; // existing
  retry_base_delay_ms?: number;   // NEW (Phase 6) — default: 2000
  retry_max_delay_ms?: number;    // NEW (Phase 6) — default: 30000
  shutdown_timeout_ms?: number;   // NEW (Phase 6) — default: 60000
  token_budget?: TokenBudgetConfig; // existing
};
```

Defaults are added to `buildConfig()` in `src/config/defaults.ts`.

A startup validation warning is logged if `max_turns_per_thread < 5` (FSPEC §4.6 last edge case).

### 9.5 Discord — `#agent-debug` Channel

Phase 6 requires posting structured log messages to `#agent-debug` (not just to the originating thread). The existing `DiscordClient.postChannelMessage(channelId, content)` (added in Phase 5 for `#open-questions`) is reused for this purpose.

The `debugChannelId` is resolved in `DefaultOrchestrator.startup()`. Phase 6 stores it as `private debugChannelId: string | null` on the orchestrator. It is **NOT** stored on `DefaultInvocationGuard` as a constructor field; instead it is passed at invocation time via `InvocationGuardParams.debugChannelId`. This avoids mutable guard state and makes the injection testable (tests can assert the field is populated correctly in params).

The orchestrator adds a helper:

```typescript
private async postToDebugChannel(message: string): Promise<void> {
  if (!this.debugChannelId) return;
  try {
    await this.discord.postChannelMessage(this.debugChannelId, message);
  } catch (error) {
    this.logger.warn(`Failed to post to #agent-debug: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

This helper is called from:
- `DefaultOrchestrator.processMessage()` when posting close/stall embeds (FSPEC-GR-02)
- `createShutdownHandler` for the shutdown notification embed (FSPEC-GR-03 Step 2d)

`DefaultInvocationGuard` accesses `debugChannelId` from `params.debugChannelId` and posts directly to the Discord client for retry logs and exhaustion/shutdown-abort logs (FSPEC-GR-01). It does NOT use a `postToDebugChannel` helper (that helper lives on the orchestrator, not the guard).

---

## 10. Open Questions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| Q-01 | **Lazy vs eager turn count reconstruction.** The FSPEC (AT-GR-10) implies the Orchestrator reconstructs turn counts on startup. Eager reconstruction would require enumerating all active threads on startup (no Discord API for this without channel history). Lazy (first message triggers reconstruction) is simpler and correct. | Lazy: reconstruct on first message after restart. Eager: requires thread enumeration. | **Decision: Lazy.** Matches AT-GR-10 semantics: the count is correct before the next routing event, which is all that matters. Requires that the first message after restart is treated as "turn N+1" where N is reconstructed from history. |
| Q-02 | **`setDebugChannelId` vs constructor injection.** The `debugChannelId` is only known after `startup()`. Pass as a mutable setter, or use a wrapper/closure. | Setter method on the guard; constructor injection via late-set field; `InvocationGuardParams`. | **Decision: Via `InvocationGuardParams`.** Avoids mutable state on the guard. The `debugChannelId` field is on `DefaultOrchestrator` and included in `InvocationGuardParams` at each invocation call site. This is now reflected consistently throughout the TSPEC (§4.2.1, §4.3, §9.5). |
| Q-03 | **Does `ArtifactCommitter.commitAndMerge()` throw or return for transient commit failures (`"commit-error"`, `"lock-timeout"`)?** This determines whether §5.1 Step 3 needs an explicit branch for these statuses, or whether they are caught by Step 5's exception classifier. | Throws → Step 5 catches as `InvocationError` (no algorithm change). Returns → Step 3 must branch explicitly. | **Decision: RETURNS (confirmed by codebase inspection of `artifact-committer.ts`).** `"commit-error"` is returned when `addInWorktree()` or `commitInWorktree()` raises. `"lock-timeout"` is returned when `MergeLockTimeoutError` is caught. `"merge-error"` is also returned (merge step non-conflict failure). All three are now handled explicitly in §5.1 Step 3 and listed as transient in §6. |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 13, 2026 | Backend Engineer | Initial technical specification for Phase 6 — guardrails |
| 1.1 | March 13, 2026 | Backend Engineer | TE review findings resolved: (M-01) Shutdown-aborted backoff now posts error embed per FSPEC AT-GR-16; (M-02) §5.1 Step 3 extended to handle CommitResult transient statuses returned by commitAndMerge() — "commit-error", "lock-timeout", "merge-error" now correctly routed to retry path; "merge-error" added to §6 error table; (M-03) GR-R numbering corrected throughout — 6 locations updated to match FSPEC v1.2; (M-04) debugChannelId injection standardised to Option A (via InvocationGuardParams) — §4.2.1, §4.3, §4.4, §9.5, §10 Q-02 updated for consistency; minor test double improvements: FakeInvocationGuard captures shutdownSignal, FakeThreadStateManager implements openThreadIds(), FakeGitClient adds addAllCalls/commitCalls |
| 1.2 | March 13, 2026 | Backend Engineer | BE cross-review F-01 resolved: added `shutdownSignal: AbortSignal` to `OrchestratorDeps` additions in §4.4 and added composition-root wiring snippet; BE cross-review F-02 resolved: added `getParentThreadId(threadId: string): string \| undefined` to `ThreadStateManager` protocol in §4.2.2 with full behavioural contract, updated §5.2 Step 1b stall-log algorithm to reference `manager.getParentThreadId(threadId)` as source of {parentId}, updated `FakeThreadStateManager` in §7.2 to add `parentThreadIds: Map<string, string>` field and implement `getParentThreadId()`; status updated to Approved (v1.2) |

---

*Gate: User reviews and approves this TSPEC before planning begins.*
