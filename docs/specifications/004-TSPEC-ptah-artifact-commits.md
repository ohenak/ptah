# Technical Specification: Phase 4 — Artifact Commits

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-SI-05], [REQ-SI-06], [REQ-SI-09], [REQ-SI-13], [REQ-NF-03], [REQ-NF-05] |
| **Functional Specifications** | [FSPEC-AC-01], [FSPEC-AC-02], [FSPEC-AC-03] — [004-FSPEC-ptah-artifact-commits](./004-FSPEC-ptah-artifact-commits.md) |
| **Analysis** | N/A — FSPEC contains full behavioral specification; codebase analysis performed inline |
| **Date** | March 10, 2026 |
| **Status** | Draft |

---

## 1. Summary

Phase 4 replaces Phase 3's "discard-on-complete" worktree behavior with a full artifact persistence pipeline. After a Skill invocation completes, artifact changes are committed in the worktree with agent attribution, merged to the main branch through a serialized merge lock, logged to per-agent audit files, and the worktree is cleaned up. A message deduplication layer prevents double-processing of Discord events. Phase 4 also reorders the orchestration flow so that worktree creation precedes context assembly, eliminating the TOCTOU window identified in FSPEC-AC-01 §2.3.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Continues Phase 1/2/3 stack |
| Language | TypeScript 5.x (ESM) | Continues Phase 1/2/3 stack |
| Discord library | discord.js v14 (`^14.25.1`) | Existing Phase 2 dependency |
| Claude Code SDK | `@anthropic-ai/claude-code` | Existing Phase 3 dependency |
| Test framework | Vitest | Continues Phase 1/2/3 stack |
| CLI entry point | `bin/ptah.ts` via `tsx` | Existing — updated composition root |

**No new external dependencies for Phase 4.** All new functionality uses Node.js built-ins and existing project infrastructure.

---

## 3. Project Structure

```
ptah/
├── src/
│   ├── commands/
│   │   └── start.ts                          ← existing (Phase 2/3)
│   ├── config/
│   │   ├── defaults.ts                       ← existing (Phase 3)
│   │   └── loader.ts                         ← existing (Phase 3)
│   ├── services/
│   │   ├── filesystem.ts                     ← UPDATED: add appendFile()
│   │   ├── git.ts                            ← UPDATED: add merge/commit-in-worktree ops
│   │   ├── discord.ts                        ← existing (Phase 3)
│   │   ├── logger.ts                         ← existing (Phase 2)
│   │   └── claude-code.ts                    ← existing (Phase 3)
│   ├── orchestrator/
│   │   ├── orchestrator.ts                   ← UPDATED: dedup, flow reorder, post-invocation pipeline
│   │   ├── context-assembler.ts              ← UPDATED: accept worktreePath for Layer 2 reads
│   │   ├── skill-invoker.ts                  ← UPDATED: remove worktree create/cleanup, accept worktreePath
│   │   ├── artifact-committer.ts             ← NEW: commit-in-worktree → merge-to-main pipeline
│   │   ├── agent-log-writer.ts               ← NEW: per-agent log append with serialization
│   │   ├── merge-lock.ts                     ← NEW: async mutex for main-branch operations
│   │   ├── message-deduplicator.ts           ← NEW: in-memory message ID dedup
│   │   ├── response-poster.ts                ← existing (Phase 3)
│   │   ├── router.ts                         ← existing (Phase 3)
│   │   ├── thread-queue.ts                   ← existing (Phase 3)
│   │   └── token-counter.ts                  ← existing (Phase 3)
│   ├── types.ts                              ← UPDATED: add Phase 4 types
│   └── shutdown.ts                           ← existing (Phase 2)
├── bin/
│   └── ptah.ts                               ← UPDATED: wire new services into composition root
└── tests/
    ├── unit/
    │   ├── orchestrator/
    │   │   ├── orchestrator.test.ts           ← UPDATED: dedup, flow reorder, pipeline tests
    │   │   ├── artifact-committer.test.ts     ← NEW
    │   │   ├── agent-log-writer.test.ts       ← NEW
    │   │   ├── merge-lock.test.ts             ← NEW
    │   │   ├── message-deduplicator.test.ts   ← NEW
    │   │   ├── context-assembler.test.ts      ← UPDATED: worktreePath tests
    │   │   └── skill-invoker.test.ts          ← UPDATED: no-cleanup contract
    │   └── services/
    │       ├── git.test.ts                    ← UPDATED: new method tests
    │       └── filesystem.test.ts             ← UPDATED: appendFile tests
    ├── integration/
    │   └── orchestrator/
    │       └── artifact-pipeline.test.ts      ← NEW: end-to-end commit/merge/log
    └── fixtures/
        └── factories.ts                       ← UPDATED: add new fakes
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/ptah.ts (composition root)
  └── src/commands/start.ts (StartCommand)                    ← existing
        ├── src/config/loader.ts (ConfigLoader)               ← existing
        ├── src/services/discord.ts (DiscordClient)           ← existing
        ├── src/services/logger.ts (Logger)                   ← existing
        └── src/orchestrator/orchestrator.ts (Orchestrator)   ← UPDATED
              ├── src/orchestrator/router.ts (RoutingEngine)           ← existing
              ├── src/orchestrator/context-assembler.ts (ContextAssembler) ← UPDATED
              │     ├── src/services/filesystem.ts (FileSystem)
              │     └── src/orchestrator/token-counter.ts (TokenCounter)
              ├── src/orchestrator/skill-invoker.ts (SkillInvoker)     ← UPDATED
              │     ├── src/services/claude-code.ts (SkillClient)
              │     └── (no longer owns GitClient — worktree ops moved)
              ├── src/orchestrator/artifact-committer.ts (ArtifactCommitter) ← NEW
              │     ├── src/services/git.ts (GitClient)
              │     └── src/orchestrator/merge-lock.ts (MergeLock)
              ├── src/orchestrator/agent-log-writer.ts (AgentLogWriter)     ← NEW
              │     ├── src/services/filesystem.ts (FileSystem)
              │     └── src/orchestrator/merge-lock.ts (MergeLock)
              ├── src/orchestrator/message-deduplicator.ts (MessageDeduplicator) ← NEW
              ├── src/services/git.ts (GitClient)              ← for worktree create
              ├── src/orchestrator/response-poster.ts (ResponsePoster)
              └── src/orchestrator/thread-queue.ts (ThreadQueue)
```

### 4.2 Protocols (Interfaces)

#### 4.2.1 GitClient Protocol — Extended

```typescript
// src/services/git.ts — UPDATED

export interface GitClient {
  // --- Phase 1 (existing) ---
  isRepo(): Promise<boolean>;
  hasStagedChanges(): Promise<boolean>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;

  // --- Phase 3 (existing) ---
  createWorktree(branch: string, path: string): Promise<void>;
  removeWorktree(path: string): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
  listWorktrees(): Promise<WorktreeInfo[]>;
  pruneWorktrees(branchPrefix: string): Promise<void>;
  diffWorktree(worktreePath: string): Promise<string[]>;

  // --- Phase 4 (new) ---
  addInWorktree(worktreePath: string, paths: string[]): Promise<void>;
  commitInWorktree(worktreePath: string, message: string): Promise<string>;
  merge(branch: string): Promise<MergeResult>;
  abortMerge(): Promise<void>;
  getShortSha(worktreePath: string): Promise<string>;
  hasUnmergedCommits(branch: string): Promise<boolean>;
  diffWorktreeIncludingUntracked(worktreePath: string): Promise<string[]>;
}
```

| Method | Behavior |
|--------|----------|
| `addInWorktree(worktreePath, paths)` | Runs `git add {paths}` with `cwd` set to `worktreePath`. Stages files in the worktree. Throws on failure. |
| `commitInWorktree(worktreePath, message)` | Runs `git commit -m {message}` with `cwd` set to `worktreePath`. Returns the short SHA of the new commit. Throws on failure. |
| `merge(branch)` | Runs `git merge {branch}` on the main working tree (`this.cwd`). Returns `MergeResult` with status `"merged"`, `"conflict"`, or `"error"`. On conflict, runs `git merge --abort` to restore clean state before returning. |
| `abortMerge()` | Runs `git merge --abort` on the main working tree. Used as cleanup if merge state is unclear. |
| `getShortSha(worktreePath)` | Runs `git rev-parse --short HEAD` with `cwd` set to `worktreePath`. Returns the 7-char abbreviated commit SHA. |
| `hasUnmergedCommits(branch)` | Runs `git log main..{branch} --oneline`. Returns `true` if the branch has commits not on main. Used during startup pruning to detect committed-but-unmerged worktrees. |
| `diffWorktreeIncludingUntracked(worktreePath)` | Runs `git diff --name-only HEAD` AND `git ls-files --others --exclude-standard` in the worktree. Returns the union of both — tracked changes plus untracked files. Needed because `diffWorktree` only returns tracked file changes; new files created by Skills are untracked until staged. |

**New type:**

```typescript
// src/types.ts
export interface MergeResult {
  status: "merged" | "conflict" | "error";
  message: string;
}
```

**Implementation notes for `merge()`:**

```
1. Run: git merge {branch}
2. On exit code 0 → return { status: "merged", message: "ok" }
3. On exit code 1 (conflict) →
   a. Run: git merge --abort (restore clean state)
   b. Return { status: "conflict", message: stderr/stdout }
4. On other exit code → return { status: "error", message: stderr }
```

The `--abort` after conflict is critical: the main working tree must always be left in a clean state. The committed changes are preserved on the worktree branch — retaining the worktree (per FSPEC-AC-01 Step 7) gives the developer access to the committed work.

#### 4.2.2 FileSystem Protocol — Extended

```typescript
// src/services/filesystem.ts — UPDATED

export interface FileSystem {
  // --- Phase 1/2/3 (existing) ---
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  cwd(): string;
  basename(path: string): string;
  readDir(path: string): Promise<string[]>;
  joinPath(...segments: string[]): string;

  // --- Phase 4 (new) ---
  appendFile(path: string, content: string): Promise<void>;
}
```

| Method | Behavior |
|--------|----------|
| `appendFile(path, content)` | Appends `content` to the file at `path`. Creates the file if it does not exist. Uses `node:fs/promises.appendFile()`. |

#### 4.2.3 ArtifactCommitter Protocol — NEW

```typescript
// src/orchestrator/artifact-committer.ts

export interface CommitParams {
  agentId: string;
  agentDisplayName: string;
  threadName: string;
  worktreePath: string;
  branch: string;
  artifactChanges: string[];
}

export interface CommitResult {
  commitSha: string | null;
  mergeStatus: "merged" | "conflict" | "no-changes" | "commit-error" | "merge-error" | "lock-timeout";
  worktreeRetained: boolean;
  conflictMessage: string | null;
}

export interface ArtifactCommitter {
  commitAndMerge(params: CommitParams): Promise<CommitResult>;
}
```

| Method | Behavior |
|--------|----------|
| `commitAndMerge(params)` | Executes the full commit → merge → cleanup pipeline for a single invocation. Returns a `CommitResult` describing the outcome. See §5.1 for algorithm. |

**Design rationale:** Separating the commit/merge pipeline into its own module keeps the Orchestrator focused on orchestration flow. The `ArtifactCommitter` is the single owner of Git write operations (commit, merge) and worktree cleanup. This makes the commit/merge logic independently testable.

**Constructor dependencies:**

```typescript
class DefaultArtifactCommitter implements ArtifactCommitter {
  constructor(
    private readonly gitClient: GitClient,
    private readonly mergeLock: MergeLock,
    private readonly logger: Logger,
  ) {}
}
```

#### 4.2.4 AgentLogWriter Protocol — NEW

```typescript
// src/orchestrator/agent-log-writer.ts

export type LogStatus = "completed" | "completed (no changes)" | "conflict" | "error";

export interface LogEntry {
  timestamp: string;
  agentId: string;
  threadName: string;
  status: LogStatus;
  commitSha: string | null;
  summary: string;
}

export interface AgentLogWriter {
  append(entry: LogEntry): Promise<void>;
}
```

| Method | Behavior |
|--------|----------|
| `append(entry)` | Appends a single log entry to `docs/agent-logs/{agentId}.md` on the main working tree. Acquires the merge lock before writing (AC-R9). Creates the file with header if missing. Escapes pipe characters in fields (AL-R7). Non-blocking — failures log a warning but do not throw. See §5.2 for algorithm. |

**Constructor dependencies:**

```typescript
class DefaultAgentLogWriter implements AgentLogWriter {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly mergeLock: MergeLock,
    private readonly logger: Logger,
  ) {}
}
```

**Design decision — AC-R9 synchronization:** The `AgentLogWriter` acquires the same `MergeLock` used by `ArtifactCommitter` before writing to the main working tree. This serializes all main-working-tree mutations (merges and log appends) through a single lock, eliminating the race condition described in AC-R9. The tradeoff is that concurrent log appends for different agents are serialized rather than parallel, but since log appends are sub-millisecond file writes, the contention is negligible.

#### 4.2.5 MergeLock Protocol — NEW

```typescript
// src/orchestrator/merge-lock.ts

export interface MergeLock {
  acquire(timeoutMs?: number): Promise<MergeLockRelease>;
}

export type MergeLockRelease = () => void;

export class MergeLockTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Merge lock acquisition timed out after ${timeoutMs}ms`);
    this.name = "MergeLockTimeoutError";
  }
}
```

| Method | Behavior |
|--------|----------|
| `acquire(timeoutMs?)` | Acquires the lock. If already held, waits up to `timeoutMs` (default: 10000ms per AC-R3). Returns a release function that **must** be called to release the lock. Throws `MergeLockTimeoutError` if timeout elapses. |

**Implementation: `AsyncMutex`** — a simple async mutex using a Promise chain:

```typescript
class AsyncMutex implements MergeLock {
  private queue: Promise<void> = Promise.resolve();

  async acquire(timeoutMs = 10_000): Promise<MergeLockRelease> {
    let release: MergeLockRelease;
    const prev = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Wait for previous holder to release, with timeout
    await Promise.race([
      prev,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new MergeLockTimeoutError(timeoutMs)), timeoutMs)
      ),
    ]);

    return release!;
  }
}
```

**Key properties:**
- FIFO ordering — callers acquire in the order they call `acquire()`
- Timeout prevents deadlock (AC-R8) — if a holder crashes without releasing, the next waiter times out
- Release function pattern ensures the lock is released even in error paths when used with `try/finally`
- Single instance shared between `ArtifactCommitter` and `AgentLogWriter`

#### 4.2.6 MessageDeduplicator Protocol — NEW

```typescript
// src/orchestrator/message-deduplicator.ts

export interface MessageDeduplicator {
  isDuplicate(messageId: string): boolean;
}
```

| Method | Behavior |
|--------|----------|
| `isDuplicate(messageId)` | Checks if `messageId` has been seen before. If NOT seen: adds it to the set and returns `false`. If seen: returns `true`. The check-and-add is atomic (synchronous). |

**Implementation: `InMemoryMessageDeduplicator`** — wraps a `Set<string>`:

```typescript
class InMemoryMessageDeduplicator implements MessageDeduplicator {
  private readonly seen = new Set<string>();

  isDuplicate(messageId: string): boolean {
    if (this.seen.has(messageId)) return true;
    this.seen.add(messageId);
    return false;
  }
}
```

**Key properties:**
- In-memory only (ID-R2) — not persisted to disk
- Message ID added **before** processing begins (ID-R3), not after completion
- Grows unboundedly — accepted for Phase 4 (see FSPEC-AC-03 §5.4)

#### 4.2.7 SkillInvoker Protocol — Updated

```typescript
// src/orchestrator/skill-invoker.ts — UPDATED

export interface SkillInvoker {
  invoke(bundle: ContextBundle, config: PtahConfig, worktreePath: string): Promise<InvocationResult>;
  pruneOrphanedWorktrees(): Promise<void>;
}
```

**Changes from Phase 3:**

| Aspect | Phase 3 | Phase 4 |
|--------|---------|---------|
| Worktree creation | SkillInvoker creates worktree | Orchestrator creates worktree (before context assembly) |
| `invoke()` signature | `invoke(bundle, config)` | `invoke(bundle, config, worktreePath)` — receives existing worktree |
| Worktree cleanup | SkillInvoker cleans up in `finally` block | Orchestrator cleans up (via ArtifactCommitter) after commit/merge |
| `InvocationResult.worktreePath` | Included (worktree path) | **Removed** — caller already knows the path |
| `InvocationResult.branch` | Included (branch name) | **Removed** — caller already knows the branch |
| `pruneOrphanedWorktrees()` | Prunes all `ptah/` worktrees unconditionally | **Updated** — flags worktrees with commits, prunes only uncommitted ones |

**Updated `InvocationResult`:**

```typescript
// src/types.ts — UPDATED
export interface InvocationResult {
  textResponse: string;
  routingSignalRaw: string;
  artifactChanges: string[];
  durationMs: number;
  // worktreePath and branch REMOVED — caller owns these
}
```

**Updated `pruneOrphanedWorktrees()` algorithm:**

```
1. List all worktrees with ptah/ branch prefix
2. For each orphaned worktree:
   a. Check hasUnmergedCommits(branch)
   b. If HAS unmerged commits → log warning:
      "Found orphaned worktree with commits: {branch} at {path}. Manual review required."
      Do NOT prune.
   c. If NO unmerged commits → prune normally (removeWorktree + deleteBranch)
```

#### 4.2.8 ContextAssembler Protocol — Updated

```typescript
// src/orchestrator/context-assembler.ts — UPDATED

export interface ContextAssembler {
  assemble(params: {
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
    worktreePath?: string;  // NEW — Phase 4: read Layer 2 from worktree
  }): Promise<ContextBundle>;
}
```

**Changes from Phase 3:**

| Aspect | Phase 3 | Phase 4 |
|--------|---------|---------|
| Layer 2 source | Main working tree (`fileSystem.cwd()`) | Worktree path (when `worktreePath` is provided) |
| `assemble()` params | No `worktreePath` | Optional `worktreePath` — when present, Layer 2 files are read from `{worktreePath}/docs/{feature}/` |

**Implementation change:** In `DefaultContextAssembler.assemble()`, the Layer 2 file read base path changes from `this.fileSystem.cwd()` to `worktreePath` when provided:

```
Phase 3: Layer 2 base = fileSystem.cwd()           → reads docs/{feature}/ from main
Phase 4: Layer 2 base = params.worktreePath ?? cwd  → reads docs/{feature}/ from worktree
```

This eliminates the TOCTOU window (FSPEC-AC-01 §2.3 / OQ-FSPEC-P4-02).

#### 4.2.9 Orchestrator Protocol — Updated

```typescript
// src/orchestrator/orchestrator.ts — UPDATED

export interface OrchestratorDeps {
  discordClient: DiscordClient;
  routingEngine: RoutingEngine;
  contextAssembler: ContextAssembler;
  skillInvoker: SkillInvoker;
  responsePoster: ResponsePoster;
  threadQueue: ThreadQueue;
  logger: Logger;
  config: PtahConfig;

  // --- Phase 4 (new) ---
  gitClient: GitClient;
  artifactCommitter: ArtifactCommitter;
  agentLogWriter: AgentLogWriter;
  messageDeduplicator: MessageDeduplicator;
}
```

**New dependencies:**

| Dependency | Purpose |
|------------|---------|
| `gitClient` | Worktree creation (moved from SkillInvoker) |
| `artifactCommitter` | Commit/merge pipeline after invocation |
| `agentLogWriter` | Agent log append after commit/merge |
| `messageDeduplicator` | Duplicate message filtering |

### 4.3 Types — Updated

```typescript
// src/types.ts — Phase 4 additions

// --- Phase 4: Merge types ---

export interface MergeResult {
  status: "merged" | "conflict" | "error";
  message: string;
}

// --- Phase 4: Commit types ---

export interface CommitParams {
  agentId: string;
  agentDisplayName: string;
  threadName: string;
  worktreePath: string;
  branch: string;
  artifactChanges: string[];
}

export interface CommitResult {
  commitSha: string | null;
  mergeStatus: "merged" | "conflict" | "no-changes" | "commit-error" | "merge-error" | "lock-timeout";
  worktreeRetained: boolean;
  conflictMessage: string | null;
}

// --- Phase 4: Agent log types ---

export type LogStatus = "completed" | "completed (no changes)" | "conflict" | "error";

export interface LogEntry {
  timestamp: string;
  agentId: string;
  threadName: string;
  status: LogStatus;
  commitSha: string | null;
  summary: string;
}
```

### 4.4 Composition Root — Updated

```typescript
// bin/ptah.ts — start subcommand wiring (Phase 4 changes)

// Existing Phase 3 services...
const logger = new ConsoleLogger();
const fs = new NodeFileSystem();
const configLoader = new NodeConfigLoader(fs);
const discord = new DiscordJsClient(logger);
const gitClient = new NodeGitClient();
const skillClient = new ClaudeCodeClient(claudeCodeInvokeFn);
const tokenCounter = new CharTokenCounter();
const threadQueue = new InMemoryThreadQueue();

const router = new DefaultRoutingEngine(logger);
const contextAssembler = new DefaultContextAssembler(fs, tokenCounter, logger);
const skillInvoker = new DefaultSkillInvoker(skillClient, gitClient, logger); // gitClient still needed for diffWorktree
const responsePoster = new DefaultResponsePoster(discord, logger);

// NEW: Phase 4 services
const mergeLock = new AsyncMutex();
const artifactCommitter = new DefaultArtifactCommitter(gitClient, mergeLock, logger);
const agentLogWriter = new DefaultAgentLogWriter(fs, mergeLock, logger);
const messageDeduplicator = new InMemoryMessageDeduplicator();

const orchestrator = new DefaultOrchestrator({
  discordClient: discord,
  routingEngine: router,
  contextAssembler,
  skillInvoker,
  responsePoster,
  threadQueue,
  logger,
  config,
  // Phase 4 additions:
  gitClient,
  artifactCommitter,
  agentLogWriter,
  messageDeduplicator,
});
```

---

## 5. Algorithms

### 5.1 Artifact Commit and Merge Pipeline (ArtifactCommitter)

Implements FSPEC-AC-01 §3.2.

```
commitAndMerge(params):

1. NO-CHANGE PATH
   If params.artifactChanges is empty:
     return { commitSha: null, mergeStatus: "no-changes",
              worktreeRetained: false, conflictMessage: null }

2. EXTRACT DESCRIPTION
   a. Parse threadName for " — " (em dash, U+2014)
   b. If found: description = text after " — "
   c. Fallback: description = full threadName (AC-R7)

3. STAGE ARTIFACT CHANGES
   a. Filter params.artifactChanges to docs/ only (AC-R1 defense-in-depth)
   b. Call gitClient.addInWorktree(worktreePath, docsChanges)
   c. On failure → return { commitSha: null, mergeStatus: "commit-error",
                            worktreeRetained: false, conflictMessage: error.message }

4. COMMIT IN WORKTREE
   a. Format message: "[ptah] {agentDisplayName}: {description}" (AC-R2)
   b. Call gitClient.commitInWorktree(worktreePath, message)
   c. Capture commitSha from return value
   d. On failure → return { commitSha: null, mergeStatus: "commit-error",
                            worktreeRetained: false, conflictMessage: error.message }

5. ACQUIRE MERGE LOCK
   a. Call mergeLock.acquire(10_000) → release function
   b. On MergeLockTimeoutError → return { commitSha, mergeStatus: "lock-timeout",
                                          worktreeRetained: true, conflictMessage: "timeout" }

6. MERGE TO MAIN (inside try/finally for lock release)
   a. Call gitClient.merge(params.branch)
   b. On { status: "merged" } →
      - Release lock
      - Cleanup worktree: removeWorktree(worktreePath), deleteBranch(branch)
        (best-effort, log warnings on failure)
      - return { commitSha, mergeStatus: "merged",
                 worktreeRetained: false, conflictMessage: null }
   c. On { status: "conflict", message } →
      - Release lock
      - return { commitSha, mergeStatus: "conflict",
                 worktreeRetained: true, conflictMessage: message }
   d. On { status: "error", message } →
      - Release lock
      - return { commitSha, mergeStatus: "merge-error",
                 worktreeRetained: true, conflictMessage: message }
   e. FINALLY: release lock (ensures AC-R8 — lock released on every path)
```

### 5.2 Agent Log Append (AgentLogWriter)

Implements FSPEC-AC-02 §4.2.

```
append(entry):

1. FORMAT LOG LINE
   a. Escape pipe characters in all fields: replace "|" with "\|" (AL-R7)
   b. Format: "| {timestamp} | {status} | {threadName} | {commitSha ?? "none"} | {summary} |"

2. RESOLVE FILE PATH
   a. path = "docs/agent-logs/{entry.agentId}.md"

3. ACQUIRE MERGE LOCK
   a. Call mergeLock.acquire(10_000) → release function
   b. On timeout → logger.warn("Log append lock timeout"), return (non-blocking)

4. WRITE (inside try/finally for lock release)
   a. Check if file exists
   b. If NOT exists:
      - Create directory: "docs/agent-logs/" (mkdir recursive)
      - Write file with header:
        "# Agent Log: {displayName}\n\n| Timestamp | Status | Thread | Commit | Summary |\n|-----------|--------|--------|--------|---------|"
      - Log warning about missing file
   c. Append the formatted log line + newline
   d. On file write error (first attempt):
      - Wait 100ms
      - Retry once
      - On second failure → logger.warn("Log append failed: {error}"), return
   e. FINALLY: release lock

5. NEVER THROW
   All errors are caught and logged as warnings. Log failure does not block
   the invocation pipeline (AL-R1 best-effort).
```

### 5.3 Updated Orchestrator Message Processing

Implements FSPEC-AC-01 §2.3 flow reorder, FSPEC-AC-03 §5.2, and the end-to-end flow from FSPEC §6.

```
processMessage(message):

1. DEDUP CHECK (FSPEC-AC-03 — first in pipeline, ID-R1)
   a. If messageDeduplicator.isDuplicate(message.id) → SKIP
      - logger.debug("Skipping duplicate message {id}")
      - return

2. IGNORE BOT MESSAGES (Phase 3, unchanged)
   a. If message.isBot → return

3. RESOLVE AGENT (Phase 3, unchanged)
   a. agentId = routingEngine.resolveHumanMessage(message, config)
   b. If null → postSystemMessage, return

4. ROUTING LOOP (updated)
   → executeRoutingLoop(agentId, message)

executeRoutingLoop(initialAgentId, triggerMessage):

  currentAgentId = initialAgentId

  while (true):
    try:
      // --- WORKTREE CREATION (NEW — moved from SkillInvoker) ---
      invocationId = randomBytes(4).toString("hex")
      branch = "ptah/{currentAgentId}/{triggerMessage.threadId}/{invocationId}"
      worktreePath = "{tmpdir()}/ptah-worktrees/{invocationId}"
      gitClient.createWorktree(branch, worktreePath)

      try:
        // --- READ THREAD HISTORY (Phase 3, unchanged) ---
        threadHistory = discord.readThreadHistory(triggerMessage.threadId)

        // --- ASSEMBLE CONTEXT (updated — Layer 2 from worktree) ---
        bundle = contextAssembler.assemble({
          agentId: currentAgentId,
          threadId: triggerMessage.threadId,
          threadName: triggerMessage.threadName,
          threadHistory,
          triggerMessage,
          config,
          worktreePath,    // NEW: Layer 2 reads from worktree
        })

        // --- INVOKE SKILL (updated — receives worktreePath) ---
        result = skillInvoker.invoke(bundle, config, worktreePath)

        // --- ARTIFACT COMMIT & MERGE (NEW — FSPEC-AC-01) ---
        agentDisplayName = formatAgentName(currentAgentId)
        commitResult = artifactCommitter.commitAndMerge({
          agentId: currentAgentId,
          agentDisplayName,
          threadName: triggerMessage.threadName,
          worktreePath,
          branch,
          artifactChanges: result.artifactChanges,
        })

        // Handle commit/merge errors — post error embeds but continue pipeline
        if (commitResult.mergeStatus === "conflict"):
          responsePoster.postErrorEmbed(triggerMessage.threadId,
            "Merge conflict: {agentDisplayName}'s changes in {branch} " +
            "conflict with recent changes on main. The worktree has been " +
            "retained at {worktreePath} for manual resolution.")
        else if (commitResult.mergeStatus === "commit-error"):
          responsePoster.postErrorEmbed(triggerMessage.threadId,
            "Commit failed: {commitResult.conflictMessage}")
          // Cleanup worktree (discard changes — Step 8a)
          cleanupWorktree(worktreePath, branch)
        else if (commitResult.mergeStatus === "merge-error"):
          responsePoster.postErrorEmbed(triggerMessage.threadId,
            "Merge failed: {commitResult.conflictMessage}. " +
            "Worktree retained at {worktreePath} for manual resolution.")
        else if (commitResult.mergeStatus === "lock-timeout"):
          responsePoster.postErrorEmbed(triggerMessage.threadId,
            "Merge lock timeout: could not acquire merge lock within 10s. " +
            "Worktree retained for manual resolution.")

        // Cleanup worktree on no-changes path
        if (commitResult.mergeStatus === "no-changes"):
          cleanupWorktree(worktreePath, branch)

        // --- AGENT LOG (NEW — FSPEC-AC-02, always, AL-R1) ---
        logStatus = deriveLogStatus(commitResult, result)
        summary = extractDescription(triggerMessage.threadName)
        agentLogWriter.append({
          timestamp: new Date().toISOString(),
          agentId: currentAgentId,
          threadName: triggerMessage.threadName,
          status: logStatus,
          commitSha: commitResult.commitSha,
          summary,
        })

        // --- POST RESPONSE (Phase 3, unchanged — AC-R5) ---
        responsePoster.postAgentResponse({
          threadId: triggerMessage.threadId,
          agentId: currentAgentId,
          text: result.textResponse,
          config,
          footer: "{result.durationMs}ms",
        })

        // --- ROUTING (Phase 3, unchanged) ---
        signal = routingEngine.parseSignal(result.routingSignalRaw)
        decision = routingEngine.decide(signal, config)

        if (decision.isTerminal):
          responsePoster.postCompletionEmbed(...)
          return
        if (decision.isPaused):
          discord.postSystemMessage(...)
          return
        if (decision.createNewThread):
          responsePoster.createCoordinationThread(...)
          return

        // ROUTE_TO_AGENT with reply — loop
        currentAgentId = decision.targetAgentId!

      catch (invocationError):
        // Skill timeout/error — cleanup worktree, no commit
        cleanupWorktree(worktreePath, branch)

        // Append error log entry
        agentLogWriter.append({
          timestamp: new Date().toISOString(),
          agentId: currentAgentId,
          threadName: triggerMessage.threadName,
          status: "error",
          commitSha: null,
          summary: extractDescription(triggerMessage.threadName),
        })

        // Post error embed (Phase 3, unchanged)
        if (invocationError instanceof InvocationTimeoutError):
          responsePoster.postErrorEmbed(..., "Skill invocation timed out (>90s)")
        else:
          responsePoster.postErrorEmbed(..., "Skill invocation failed: {message}")
        return

    catch (worktreeCreationError):
      // Worktree creation failed — no cleanup needed
      responsePoster.postErrorEmbed(..., "Worktree creation failed: {message}")
      return


cleanupWorktree(worktreePath, branch):
  // Best-effort cleanup (same as Phase 3)
  try: gitClient.removeWorktree(worktreePath)
  catch: logger.warn(...)
  try: gitClient.deleteBranch(branch)
  catch: logger.warn(...)
```

### 5.4 Helper Functions

```typescript
// Extract description from thread name (AC-R7)
function extractDescription(threadName: string): string {
  const emDashIndex = threadName.indexOf(" \u2014 ");
  if (emDashIndex !== -1) {
    return threadName.slice(emDashIndex + 3); // 3 = " — ".length
  }
  return threadName;
}

// Format agent display name: "dev-agent" → "Dev Agent"
function formatAgentName(agentId: string): string {
  return agentId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Derive log status from commit result and invocation result
function deriveLogStatus(commitResult: CommitResult, _invocationResult: InvocationResult): LogStatus {
  switch (commitResult.mergeStatus) {
    case "merged": return "completed";
    case "no-changes": return "completed (no changes)";
    case "conflict": return "conflict";
    default: return "error"; // commit-error, merge-error, lock-timeout
  }
}
```

---

## 6. Error Handling

| Scenario | Behavior | FSPEC Reference |
|----------|----------|-----------------|
| `git add` fails in worktree | CommitResult with `commit-error`. Worktree cleaned up. Error embed posted. Log entry with "error". Pipeline continues (Discord posting, routing). | FSPEC-AC-01 Step 8a |
| `git commit` fails in worktree | CommitResult with `commit-error`. Worktree cleaned up. Error embed posted. Log entry with "error". Pipeline continues. | FSPEC-AC-01 Step 8a |
| `git merge` returns conflict | CommitResult with `conflict`. Worktree **retained**. Error embed with conflict details. Log entry with "conflict". Pipeline continues. | FSPEC-AC-01 Step 7 |
| `git merge` fails (non-conflict) | CommitResult with `merge-error`. Worktree **retained**. Error embed posted. Pipeline continues. | FSPEC-AC-01 Step 8b |
| Merge lock timeout (>10s) | CommitResult with `lock-timeout`. Worktree **retained**. Error embed posted. Pipeline continues. | AC-R3, AT-AC-17 |
| Worktree removal fails after merge | Warning logged. Worktree remains on disk. Startup pruning handles it. | FSPEC-AC-01 §3.6 |
| Branch deletion fails after merge | Warning logged. Orphaned branch remains. Startup pruning handles it. | FSPEC-AC-01 §3.6 |
| Agent log file missing | File auto-created with header. Warning logged. | FSPEC-AC-02 §4.5 |
| Agent log file malformed | Entry appended best-effort. Warning logged. | AL-R2, AT-AL-09 |
| Agent log file locked | Retry once after 100ms. If still locked, skip entry. Warning logged. Pipeline not blocked. | FSPEC-AC-02 §4.5 |
| Agent log write failure | Warning logged. Pipeline not blocked. | FSPEC-AC-02 §4.6 |
| Duplicate Discord message | Silently skipped. Debug log. No error, no warning. | ID-R4, AT-ID-01 |
| Message with no ID | Skipped. Warning logged. | AT-ID-07 |
| Skill timeout/crash | Worktree cleaned up (no commit). Log entry with "error". Error embed. | FSPEC-AC-01 §3.4(d)/(e) |
| Orphaned worktree with commits (startup) | Warning logged, not pruned. Manual review required. | FSPEC-AC-01 §3.4(f) |
| Orphaned worktree without commits (startup) | Pruned normally (Phase 3 behavior). | FSPEC-AC-01 §3.4(f) |

---

## 7. Test Strategy

### 7.1 Approach

Follows Phase 1/2/3 conventions: protocol-based DI with fake test doubles for unit tests. No `@anthropic-ai/claude-code`, `discord.js`, or real Git operations in unit tests. All new modules depend on protocols only.

### 7.2 Test Doubles — New and Updated

```typescript
// tests/fixtures/factories.ts — Phase 4 additions

// --- FakeArtifactCommitter ---

class FakeArtifactCommitter implements ArtifactCommitter {
  results: CommitResult[] = [];
  commitAndMergeCalls: CommitParams[] = [];
  private callIndex = 0;

  async commitAndMerge(params: CommitParams): Promise<CommitResult> {
    this.commitAndMergeCalls.push(params);
    if (this.callIndex >= this.results.length) {
      throw new Error("FakeArtifactCommitter: no more results configured");
    }
    return this.results[this.callIndex++];
  }
}

// --- FakeAgentLogWriter ---

class FakeAgentLogWriter implements AgentLogWriter {
  entries: LogEntry[] = [];
  appendError: Error | null = null;

  async append(entry: LogEntry): Promise<void> {
    if (this.appendError) throw this.appendError;
    this.entries.push(entry);
  }
}

// --- FakeMergeLock ---

class FakeMergeLock implements MergeLock {
  acquireCalls = 0;
  releaseCalls = 0;
  acquireError: Error | null = null;
  held = false;

  async acquire(timeoutMs?: number): Promise<MergeLockRelease> {
    this.acquireCalls++;
    if (this.acquireError) throw this.acquireError;
    this.held = true;
    return () => {
      this.releaseCalls++;
      this.held = false;
    };
  }
}

// --- FakeMessageDeduplicator ---

class FakeMessageDeduplicator implements MessageDeduplicator {
  duplicateIds = new Set<string>();

  isDuplicate(messageId: string): boolean {
    if (this.duplicateIds.has(messageId)) return true;
    this.duplicateIds.add(messageId);
    return false;
  }
}

// --- FakeGitClient — Extended for Phase 4 ---

// Add to existing FakeGitClient:
//   addInWorktreeCalls: Array<{ worktreePath: string; paths: string[] }> = [];
//   commitInWorktreeCalls: Array<{ worktreePath: string; message: string }> = [];
//   commitInWorktreeResult: string = "abc1234";
//   commitInWorktreeError: Error | null = null;
//   mergeResults: MergeResult[] = [];
//   mergeCalls: string[] = [];
//   abortMergeCalls: number = 0;
//   shortShaResult: string = "abc1234";
//   hasUnmergedResult: boolean = false;
//   addInWorktreeError: Error | null = null;

// --- FakeFileSystem — Extended for Phase 4 ---

// Add to existing FakeFileSystem:
//   appendedFiles: Map<string, string[]> = new Map();  // path → appended content
//   appendFileError: Error | null = null;
```

### 7.3 Test Categories

| Category | What is tested | Test file |
|----------|---------------|-----------|
| **ArtifactCommitter — happy path** | No changes (skip), commit + merge success, worktree cleaned up | `tests/unit/orchestrator/artifact-committer.test.ts` |
| **ArtifactCommitter — commit message** | Format `[ptah] {Agent}: {description}`, em-dash extraction, fallback | `tests/unit/orchestrator/artifact-committer.test.ts` |
| **ArtifactCommitter — docs filter** | Only docs/ changes staged, non-docs ignored | `tests/unit/orchestrator/artifact-committer.test.ts` |
| **ArtifactCommitter — merge conflict** | Conflict detected, worktree retained, lock released | `tests/unit/orchestrator/artifact-committer.test.ts` |
| **ArtifactCommitter — commit failure** | git add/commit error, worktree not retained, lock not acquired | `tests/unit/orchestrator/artifact-committer.test.ts` |
| **ArtifactCommitter — merge error** | Non-conflict merge failure, worktree retained, lock released | `tests/unit/orchestrator/artifact-committer.test.ts` |
| **ArtifactCommitter — lock timeout** | MergeLockTimeoutError, worktree retained | `tests/unit/orchestrator/artifact-committer.test.ts` |
| **ArtifactCommitter — cleanup failures** | removeWorktree/deleteBranch fail, warnings logged, no throw | `tests/unit/orchestrator/artifact-committer.test.ts` |
| **AgentLogWriter — happy path** | Entry appended, correct format, pipe escaping | `tests/unit/orchestrator/agent-log-writer.test.ts` |
| **AgentLogWriter — all statuses** | completed, completed (no changes), conflict, error | `tests/unit/orchestrator/agent-log-writer.test.ts` |
| **AgentLogWriter — missing file** | Auto-created with header, warning logged | `tests/unit/orchestrator/agent-log-writer.test.ts` |
| **AgentLogWriter — write failure** | Warning logged, no throw, pipeline continues | `tests/unit/orchestrator/agent-log-writer.test.ts` |
| **AgentLogWriter — retry on lock** | First write fails, retries once, succeeds | `tests/unit/orchestrator/agent-log-writer.test.ts` |
| **AgentLogWriter — pipe escaping** | `\|` in thread name, summary | `tests/unit/orchestrator/agent-log-writer.test.ts` |
| **AgentLogWriter — merge lock** | Lock acquired before write, released after | `tests/unit/orchestrator/agent-log-writer.test.ts` |
| **MergeLock — basic acquire/release** | Acquire succeeds, release frees lock | `tests/unit/orchestrator/merge-lock.test.ts` |
| **MergeLock — serialization** | Second acquire waits until first released | `tests/unit/orchestrator/merge-lock.test.ts` |
| **MergeLock — timeout** | MergeLockTimeoutError after configured ms | `tests/unit/orchestrator/merge-lock.test.ts` |
| **MergeLock — FIFO ordering** | Multiple waiters served in order | `tests/unit/orchestrator/merge-lock.test.ts` |
| **MergeLock — release on every path** | Lock released even when holder errors | `tests/unit/orchestrator/merge-lock.test.ts` |
| **MessageDeduplicator — new message** | Returns false, adds to set | `tests/unit/orchestrator/message-deduplicator.test.ts` |
| **MessageDeduplicator — duplicate** | Returns true on second call with same ID | `tests/unit/orchestrator/message-deduplicator.test.ts` |
| **MessageDeduplicator — different IDs** | Different IDs are independent | `tests/unit/orchestrator/message-deduplicator.test.ts` |
| **Orchestrator — dedup** | Duplicate message skipped, no routing/invocation | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — flow reorder** | Worktree created before context assembly, worktreePath passed | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — commit/merge success** | Full pipeline: invoke → commit → merge → log → post → route | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — merge conflict continues** | Error embed posted, response still posted, routing continues | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — commit failure continues** | Error embed posted, worktree cleaned, response posted, routing continues | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — log entry always written** | success, no-change, conflict, error all produce log entries | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — skill timeout** | Worktree cleaned, error log, no commit | `tests/unit/orchestrator/orchestrator.test.ts` |
| **Orchestrator — orphan prune** | Committed worktrees flagged, uncommitted pruned | `tests/unit/orchestrator/orchestrator.test.ts` |
| **SkillInvoker — no cleanup** | Worktree not removed in finally block, no branch deletion | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **SkillInvoker — receives worktreePath** | Uses provided worktreePath, does not create worktree | `tests/unit/orchestrator/skill-invoker.test.ts` |
| **ContextAssembler — worktree Layer 2** | Layer 2 files read from worktreePath when provided | `tests/unit/orchestrator/context-assembler.test.ts` |
| **ContextAssembler — fallback to main** | Layer 2 reads from main when worktreePath not provided | `tests/unit/orchestrator/context-assembler.test.ts` |
| **GitClient — addInWorktree** | Runs git add in worktree cwd | `tests/unit/services/git.test.ts` |
| **GitClient — commitInWorktree** | Runs git commit in worktree cwd, returns SHA | `tests/unit/services/git.test.ts` |
| **GitClient — merge success** | Returns merged status | `tests/unit/services/git.test.ts` |
| **GitClient — merge conflict** | Returns conflict status, abort called | `tests/unit/services/git.test.ts` |
| **GitClient — hasUnmergedCommits** | True when branch has commits, false otherwise | `tests/unit/services/git.test.ts` |
| **GitClient — diffWorktreeIncludingUntracked** | Returns both tracked and untracked files | `tests/unit/services/git.test.ts` |
| **FileSystem — appendFile** | Appends to existing file, creates if missing | `tests/unit/services/filesystem.test.ts` |
| **Integration — artifact pipeline** | End-to-end: invoke → commit → merge → log → cleanup, using fakes for Discord/SkillClient | `tests/integration/orchestrator/artifact-pipeline.test.ts` |

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-SI-05 | `ArtifactCommitter.commitAndMerge()`, `GitClient.addInWorktree()`, `GitClient.commitInWorktree()`, `GitClient.merge()` | Artifact changes committed in worktree with `[ptah] {Agent}: {description}` format, merged to main branch. Commit message derived from thread name (AC-R7). Only docs/ changes committed (AC-R1). |
| REQ-SI-06 | `AgentLogWriter.append()`, `FileSystem.appendFile()` | Timestamped log entry appended to `docs/agent-logs/{agent}.md` after every invocation. Four statuses: completed, completed (no changes), conflict, error. Pipe characters escaped (AL-R7). Not individually committed (AL-R3). |
| REQ-SI-09 | `MessageDeduplicator.isDuplicate()`, `Orchestrator.processMessage()` | Dedup check is first in pipeline (ID-R1). In-memory Set tracks processed message IDs. Added before processing (ID-R3). Duplicates silently skipped (ID-R4). Thread history serves as durable dedup on restart (ID-R5). |
| REQ-SI-13 | `ArtifactCommitter.commitAndMerge()`, `MergeLock`, `Orchestrator` cleanup logic | Merge serialized via MergeLock with 10s timeout (AC-R3). On success: worktree removed + branch deleted. On conflict: worktree retained (AC-R4). Lock released on every path (AC-R8). |
| REQ-NF-03 | `MessageDeduplicator`, `Orchestrator.processMessage()` | Same Discord message never processed twice during normal operation. On restart, thread history provides durable dedup. Partial-crash double-commit is a known limitation (FSPEC-AC-03 §5.4). |
| REQ-NF-05 | `ArtifactCommitter` (commit attribution), `AgentLogWriter` (audit trail) | Every artifact change has a Git commit with `[ptah]` prefix and agent name. Every invocation has an agent log entry. Both provide independent audit trails — `git log --grep="[ptah]"` for commits, `docs/agent-logs/` for invocation records. |

---

## 9. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | `src/orchestrator/skill-invoker.ts` | `invoke()` signature changes: adds `worktreePath` parameter, removes worktree creation and cleanup. `InvocationResult` removes `worktreePath` and `branch` fields. | **Breaking change** to SkillInvoker protocol — existing tests must be updated |
| 2 | `src/orchestrator/context-assembler.ts` | `assemble()` params gains optional `worktreePath` field. When present, Layer 2 reads from worktree instead of main. | Backward-compatible — existing callers without `worktreePath` get Phase 3 behavior |
| 3 | `src/orchestrator/orchestrator.ts` | `OrchestratorDeps` gains 4 new fields: `gitClient`, `artifactCommitter`, `agentLogWriter`, `messageDeduplicator`. `processMessage()` flow reordered. | **Breaking change** to OrchestratorDeps — existing tests must be updated |
| 4 | `src/services/git.ts` | `GitClient` protocol extended with 6 new methods for Phase 4 operations. | Additive — existing methods unchanged |
| 5 | `src/services/filesystem.ts` | `FileSystem` protocol extended with `appendFile()`. | Additive — existing methods unchanged |
| 6 | `src/types.ts` | New types: `MergeResult`, `CommitParams`, `CommitResult`, `LogStatus`, `LogEntry`. `InvocationResult` loses `worktreePath` and `branch` fields. | `InvocationResult` change affects all consumers |
| 7 | `bin/ptah.ts` | Composition root wires 4 new services: `AsyncMutex`, `DefaultArtifactCommitter`, `DefaultAgentLogWriter`, `InMemoryMessageDeduplicator`. | Extended composition root |
| 8 | `tests/fixtures/factories.ts` | 4 new fakes: `FakeArtifactCommitter`, `FakeAgentLogWriter`, `FakeMergeLock`, `FakeMessageDeduplicator`. FakeGitClient and FakeFileSystem extended. `FakeSkillInvoker` updated for new `invoke()` signature. | Test infrastructure updates |
| 9 | Phase 3 → Phase 4 | Phase 3's `SkillInvoker.cleanup()` in `finally` block is removed. Worktree lifecycle owned by Orchestrator + ArtifactCommitter. | Replaces Phase 3's discard-on-complete behavior |
| 10 | Phase 4 → Phase 5 | Agent logs accumulate as unstaged changes on main. The next artifact commit's staging of `/docs/` will include accumulated log entries. | Log entries piggyback on artifact commits |
| 11 | Phase 4 → Phase 6 | Merge conflict and commit failure paths retain worktrees for manual resolution. Phase 6 may add automated retry or conflict resolution. | Conflict recovery is manual in Phase 4 |

---

## 10. Open Questions

None at this time. All design decisions were informed by resolved FSPEC open questions (OQ-FSPEC-P4-01, OQ-FSPEC-P4-02) and the codebase analysis.

---

## 11. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Backend Engineer | Initial technical specification for Phase 4 (Artifact Commits). Covers all 6 Phase 4 requirements across 3 FSPECs. 4 new modules: ArtifactCommitter, AgentLogWriter, MergeLock (AsyncMutex), MessageDeduplicator. 3 updated protocols: SkillInvoker, ContextAssembler, Orchestrator. |

---

*Gate: User reviews and approves this technical specification before proceeding to Planning.*
