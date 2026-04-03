# Technical Specification: Tech Lead Orchestration

| Field | Detail |
|-------|--------|
| **Document ID** | 014-TSPEC-tech-lead-orchestration |
| **Requirements** | [014-REQ-tech-lead-orchestration](./014-REQ-tech-lead-orchestration.md) |
| **Functional Specification** | [014-FSPEC-tech-lead-orchestration](./014-FSPEC-tech-lead-orchestration.md) |
| **Date** | 2026-03-20 |
| **Author** | Backend Engineer |
| **Status** | Draft |

---

## 1. Summary

This specification describes the technical design for Phase 14 — Tech Lead Orchestration. The primary deliverable is a rewrite of the existing `.claude/skills/tech-lead/SKILL.md` prompt, which becomes the authoritative implementation of the FSPEC behavioral logic (dependency parsing, topological batching, confirmation loop, parallel batch execution, merge, test gate, resume). A small set of TypeScript changes support this: `FeatureConfig` gains a `useTechLead` flag, `pdlc-dispatcher.ts` routes IMPLEMENTATION to the "tl" agent when that flag is set, `ArtifactCommitter` gains a `mergeBranchIntoFeature` method (used as the pre-flight capability marker and for programmatic access), and `ptah.config.json` gains the "tl" agent registration. The plan template is also updated to document the extended fan-out dependency syntax.

---

## 2. Technology Stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js 20 LTS (existing) |
| Language | TypeScript 5.x ESM (existing) |
| Test framework | Vitest 2.x (existing) |
| Package manager | npm (existing) |
| Skill format | Markdown prompt (`.claude/skills/tech-lead/SKILL.md`) |
| New dependencies | None |

---

## 3. Project Structure

```
ptah/
├── src/
│   ├── orchestrator/
│   │   ├── pdlc/
│   │   │   ├── phases.ts                   [UPDATED] — add useTechLead to FeatureConfig
│   │   │   └── pdlc-dispatcher.ts          [UPDATED] — route IMPLEMENTATION to "tl"; suppress fork-join
│   │   └── artifact-committer.ts           [UPDATED] — add mergeBranchIntoFeature method
│   └── types.ts                            [UPDATED] — add MergeBranchParams, BranchMergeResult,
│                                                        tech_lead_agent_timeout_ms, retain_failed_worktrees
├── tests/
│   └── unit/
│       └── orchestrator/
│           ├── pdlc/
│           │   └── pdlc-dispatcher.test.ts [UPDATED] — useTechLead routing + no-fork-join tests
│           └── artifact-committer.test.ts  [UPDATED] — mergeBranchIntoFeature tests
└── ptah.config.json                        [UPDATED] — add "tl" agent entry

.claude/
└── skills/
    └── tech-lead/
        └── SKILL.md                        [UPDATED] — full FSPEC implementation (primary deliverable)

docs/
└── templates/
    └── backend-plans-template.md           [UPDATED] — document fan-out dependency syntax
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
ptah.config.json
    └── "tl" agent entry → .claude/skills/tech-lead/SKILL.md
                               (invoked by orchestrator via SkillInvoker)

pdlc-dispatcher.ts
    ├── phases.ts               (FeatureConfig.useTechLead)
    └── → "tl" when useTechLead + IMPLEMENTATION

artifact-committer.ts
    ├── types.ts                (MergeBranchParams, BranchMergeResult)
    └── services/git.ts         (mergeInWorktree, getConflictedFiles)
```

### 4.2 Updated Protocols

#### `FeatureConfig` (in `phases.ts`)

```typescript
export interface FeatureConfig {
  discipline: Discipline;
  skipFspec: boolean;
  useTechLead?: boolean;  // NEW — when true, IMPLEMENTATION routes to "tl" instead of "eng"/"fe"
                          // Default: false (absent = false). Does not affect non-IMPLEMENTATION phases.
}
```

**Design rationale:** Optional field preserves backward compatibility with all existing persisted state files. Absence is always treated as `false` — no migration required.

#### `ArtifactCommitter` (in `artifact-committer.ts`)

```typescript
export interface ArtifactCommitter {
  /** Existing: commit docs/ changes to sub-branch and merge into feature branch */
  commitAndMerge(params: CommitParams): Promise<CommitResult>;

  /** NEW: merge a worktree branch (already committed) into the feature branch.
   *  Used by the tech-lead skill after a phase agent's worktree has been verified successful.
   *  Also serves as the pre-flight capability marker (Check 2): if this method exists in
   *  the compiled codebase, Check 2 passes. */
  mergeBranchIntoFeature(params: MergeBranchParams): Promise<BranchMergeResult>;
}
```

#### New types (in `types.ts`)

```typescript
/** Parameters for merging a worktree agent branch into the feature branch */
export interface MergeBranchParams {
  /** The branch to merge (the worktree/agent branch) */
  sourceBranch: string;
  /** The target feature branch (e.g., "feat-014-tech-lead-orchestration") */
  featureBranch: string;
  /** Absolute path to a worktree that has the feature branch checked out */
  featureBranchWorktreePath: string;
  /** Agent ID for logging */
  agentId: string;
}

export type BranchMergeStatus =
  | "merged"             // merge succeeded; commit created on featureBranch
  | "already-up-to-date" // source branch is already in featureBranch history; no-op
  | "conflict"           // merge conflict; featureBranch left at pre-merge state
  | "merge-error";       // git error during merge (not a conflict)

export interface BranchMergeResult {
  status: BranchMergeStatus;
  commitSha: string | null;       // set if status === "merged"
  conflictingFiles: string[];     // set if status === "conflict"
  errorMessage: string | null;    // set if status === "merge-error"
}
```

#### `PtahConfig.orchestrator` (in `types.ts`)

```typescript
// In PtahConfig.orchestrator — add two optional fields:
orchestrator: {
  // ... existing fields ...
  /** Timeout for tech-lead-dispatched engineer agents in ms. Default: 600_000 (10 min) */
  tech_lead_agent_timeout_ms?: number;
  /** If true, retain failed agent worktrees for debugging. Default: false */
  retain_failed_worktrees?: boolean;
};
```

### 4.3 `pdlc-dispatcher.ts` Changes

Two small targeted changes:

**Change 1: `phaseToAgentId` — route IMPLEMENTATION to "tl" when `useTechLead` is set**

```typescript
function phaseToAgentId(phase: PdlcPhase, config: FeatureConfig): string {
  switch (phase) {
    case Phase.REQ_CREATION:
    case Phase.FSPEC_CREATION:
      return "pm";
    case Phase.TSPEC_CREATION:
    case Phase.PLAN_CREATION:
      return config.discipline === "frontend-only" ? "fe" : "eng";
    case Phase.IMPLEMENTATION:
      // NEW: when useTechLead is set, delegate to tech-lead regardless of discipline
      if (config.useTechLead) return "tl";
      return config.discipline === "frontend-only" ? "fe" : "eng";
    case Phase.PROPERTIES_CREATION:
      return "qa";
    default:
      return "eng";
  }
}
```

**Change 2: `isForkJoinPhase` — suppress fork-join for IMPLEMENTATION when useTechLead is set**

```typescript
function isForkJoinPhase(phase: PdlcPhase, config: FeatureConfig): boolean {
  // NEW: when useTechLead is set, tech-lead orchestrates its own internal parallelism;
  // the PDLC-level fork-join for IMPLEMENTATION is suppressed.
  if (config.useTechLead && phase === Phase.IMPLEMENTATION) return false;
  return config.discipline === "fullstack" && FORK_JOIN_PHASES.has(phase);
}
```

**Backward compatibility:** When `config.useTechLead` is absent or `false`, both functions behave identically to the pre-Phase-14 logic. All existing tests pass unchanged.

### 4.4 `DefaultArtifactCommitter.mergeBranchIntoFeature` Implementation

```typescript
/** Merge lock timeout in milliseconds. 30 seconds is sufficient for serializing
 *  sequential merge operations within a single batch. */
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

async mergeBranchIntoFeature(params: MergeBranchParams): Promise<BranchMergeResult> {
  const { sourceBranch, featureBranch, featureBranchWorktreePath, agentId } = params;
  this.logger.info(`[merge] Merging ${sourceBranch} → ${featureBranch} (agent: ${agentId})`);

  // 1. Acquire merge lock to serialize concurrent merge operations
  let releaseLock: (() => void) | null = null;
  try {
    releaseLock = await this.mergeLock.acquire(DEFAULT_LOCK_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof MergeLockTimeoutError) {
      return { status: "merge-error", commitSha: null, conflictingFiles: [],
               errorMessage: "Merge lock timeout — another merge is in progress" };
    }
    throw err;
  }

  try {
    // 2. Attempt merge
    const mergeResult = await this.gitClient.mergeInWorktree(
      featureBranchWorktreePath, sourceBranch
    );

    if (mergeResult === "merged") {
      const sha = await this.gitClient.getShortSha("HEAD");
      return { status: "merged", commitSha: sha, conflictingFiles: [], errorMessage: null };
    }

    if (mergeResult === "already-up-to-date") {
      return { status: "already-up-to-date", commitSha: null, conflictingFiles: [], errorMessage: null };
    }

    if (mergeResult === "conflict") {
      // 3. Get conflicting files, then abort
      const conflictFiles = await this.gitClient.getConflictedFiles(featureBranchWorktreePath);
      await this.gitClient.abortMergeInWorktree(featureBranchWorktreePath);
      return { status: "conflict", commitSha: null, conflictingFiles: conflictFiles, errorMessage: null };
    }

    return { status: "merge-error", commitSha: null, conflictingFiles: [],
             errorMessage: `Unexpected merge result: ${mergeResult}` };
  } catch (err) {
    return { status: "merge-error", commitSha: null, conflictingFiles: [],
             errorMessage: err instanceof Error ? err.message : String(err) };
  } finally {
    releaseLock?.();
  }
}
```

### 4.5 Tech-Lead SKILL.md Architecture

The tech-lead is a **prompt-based skill** — its logic is encoded entirely in `.claude/skills/tech-lead/SKILL.md`. The skill runs as a Claude agent with access to all tools (Read, Write, Edit, Bash, Glob, Grep, Agent, WebSearch, WebFetch). It does NOT invoke TypeScript APIs directly; all interactions with the file system and git are performed via tool calls.

**Responsibilities implemented in SKILL.md:**
1. Plan ingestion and phase extraction
2. Dependency graph parsing (3 syntax forms)
3. Cycle detection and sequential fallback
4. Topological batch computation with concurrency cap
5. Phase skill assignment
6. Pre-flight infrastructure checks (via Bash + Grep)
7. Pre-execution confirmation and modification loop
8. Batch execution lifecycle (parallel Agent dispatch, sequential merge, test gate, plan update)
9. Phase failure handling with no-partial-merge invariant
10. Resume auto-detection from plan Done status

**Tools the tech-lead uses and why:**

| Tool | Used for |
|------|---------|
| `Read` | Load PLAN document, read config files, inspect source for pre-flight check |
| `Bash` | Run test suite (`npx vitest run`), run git commands (merge, push, branch cleanup), check remote branch existence |
| `Grep` | Verify `mergeBranchIntoFeature` exists in `artifact-committer.ts` (pre-flight Check 2) |
| `Agent` + `isolation: "worktree"` | Dispatch engineer phase agents in parallel worktrees |
| `Write` / `Edit` | Update plan document task statuses after batch completion |
| `AskUserQuestion` | Confirmation prompt and modification loop (awaits user input inline) |

---

## 5. Algorithm Descriptions

### 5.1 Dependency Parsing Algorithm

The dependency section is extracted by looking for a level-2 or level-3 markdown heading containing "Task Dependency Notes" (case-insensitive). Content ends at the next heading of the same or higher level.

Three supported syntax forms (matched in order):

**Form 1 — Linear chain:** `A → B → C` (or `A -> B -> C` with ASCII arrow)
- Produces sequential pairs: (A→B), (B→C)
- `→` and `->` are both accepted; surrounding whitespace is stripped

**Form 2 — Fan-out:** `A → [B, C, D]` (or `A → [B, C]`)
- Produces: (A→B), (A→C), (A→D)
- Brackets required; items separated by commas with optional whitespace

**Form 3 — Natural language:** `Phase X depends on: Phase A, Phase B`
- Produces: (A→X), (B→X)
- Match is case-insensitive; leading/trailing whitespace stripped from phase names
- The `Phase ` prefix before each name is optional in the depends-on list

Each line is attempted against Form 1 first (contains `→` or `->`), then Form 3 (contains "depends on"). If a line matches neither and is non-blank/non-comment, a debug log entry is emitted.

**Phase name matching:** All phase names from the plan's phase headers are extracted as a canonical set. Names in dependency declarations are matched case-insensitively and whitespace-stripped against this set. Unrecognized names are logged as warnings; the affected dependency edge is dropped (not propagated to the DAG). The valid edges are retained.

**Cycle detection (Kahn's pre-check):** After building the initial edge list, perform one pass of Kahn's topological sort. If any nodes remain with unresolved in-edges after the sort completes, a cycle exists. Extract the cycle path by following back-edges from one of the remaining nodes; log it as: `"Cycle detected: Phase C → Phase E → Phase C"`. Enter sequential fallback.

### 5.2 Topological Layering Algorithm

Input: validated DAG (no cycles), set of completed phases.

```
1. Remove completed phases from the node set.
   For each completed phase P: remove P from the DAG.
   For each remaining phase Q that had P as a dependency:
     remove the edge P→Q from Q's in-edge set.
   (This simulates those edges being "satisfied".)

2. Kahn's layering:
   Layer 0 queue = all remaining phases with in-degree 0
   While queue is non-empty:
     Record current queue as a batch
     For each phase in the queue:
       For each successor S of that phase:
         decrement S's in-degree
         if S's in-degree is now 0: add S to next queue
     queue = next queue

3. Within each batch, sort phases in document order (tie-breaker: position
   in the original phase list). This makes sub-batch splitting deterministic.

4. Apply concurrency cap:
   For each batch B of size N > 5:
     Split into sub-batches of at most 5 phases each, in document order.
     Label as B.1, B.2, ...

5. Return ordered list of batches/sub-batches.
```

**Empty result:** If no phases remain after excluding completed phases, the batch list is empty. The tech-lead posts: "All phases are already marked Done. Nothing to execute." and exits with `LGTM`.

### 5.3 Phase Skill Assignment Algorithm

Skill assignment inspects only the **Source File** column of the phase's task table. The Test File column is ignored.

```
For each task row in the phase's task table:
  Extract the source file path prefix (characters before the first "/")

Classify each prefix:
  backend prefixes: "src", "config", "tests", "bin"
  frontend prefixes: "app", "components", "pages", "styles", "hooks"
  docs prefix: "docs"
  empty/dash: backend default (silent)
  unrecognized: backend default (silent)

Decision:
  All backend (or empty/unrecognized/docs) → backend-engineer (no warning)
  All frontend → frontend-engineer (no warning)
  Mix of backend + frontend → backend-engineer + WARNING posted in confirmation
```

**Mixed-layer warning text:**
> "Warning: Phase {X} has tasks spanning both backend ({backend_paths}) and frontend ({frontend_paths}) source paths. Defaulted to backend-engineer. Review skill assignment before approving."

### 5.4 Pre-flight Infrastructure Check Algorithm

Runs when at least one batch has more than one phase (parallel execution is intended). Skipped entirely in sequential fallback mode.

**Check 1 — Feature branch on remote:**
```bash
git ls-remote --heads origin feat-{feature-name}
```
If output is non-empty → Pass. If empty → Fail.
Failure message: "Feature branch 'feat-{feature-name}' not found on remote origin. Parallel execution requires the branch to exist on the remote."

**Check 2 — ArtifactCommitter two-tier merge capability:**
Use `Grep` to check for `mergeBranchIntoFeature` in `ptah/src/orchestrator/artifact-committer.ts`.
If found → Pass. If not found → Fail.
Failure message: "ArtifactCommitter.mergeBranchIntoFeature not found. Phase 010 two-tier merge support is required for parallel execution."

**Fallback behavior:** Either check failing triggers sequential fallback (one phase per batch, document order). The confirmation is presented with the sequential plan and explains the failure. Pre-flight does NOT re-run before sequential execution begins.

### 5.5 Batch Execution Lifecycle

Per the FSPEC, the tech-lead executes batches sequentially, phases within a batch in parallel:

```
For each batch B (and sub-batch B.M):

1. POST batch start notification

2. DISPATCH phases in parallel:
   For each phase P in the batch, concurrently:
     Use the Agent tool with:
       subagent_type: "backend-engineer" | "frontend-engineer" (per skill assignment)
       isolation: "worktree"
       prompt: structured context per §5.6 below
     Record the agent result (success/failure, worktree branch name)

3. COLLECT results (await all)

4. POST phase completion notifications (one per phase)

5. EVALUATE:
   If ANY phase failed → enter Failure Handling (§5.7). STOP.
   If ALL phases succeeded → continue.

6. MERGE worktrees (serialized, document order):
   For each successful phase P, in document order:
     Run: git merge --no-ff {worktree-branch} in the feature branch worktree
     If conflict: enter Conflict Handling (§5.8). STOP.
     If success: clean up worktree (git worktree remove / branch delete)

7. (Final sub-batch only, or full batch if no sub-batches)
   RUN TEST GATE:
     cd ptah/ && npx vitest run
     If all tests pass → continue.
     If assertion failures → report failing test names; halt. Plan NOT updated.
     If runner fails to start → report runner error; halt. Plan NOT updated.

8. UPDATE PLAN STATUS:
   Edit the plan document — mark all tasks in all batch phases as Done (✅)
   Commit: "chore: mark Batch {N} phases as Done in plan"
   Push to feature branch

9. POST batch summary

10. Proceed to next batch
```

**Sub-batch note:** For sub-batches N.1, N.2, …, the test gate (step 7), plan update (step 8), and batch summary (step 9) are deferred until after the FINAL sub-batch of the topological layer completes. Sub-batches N.1 through N.(last-1) proceed directly from step 6 to the next sub-batch. If any sub-batch fails, remaining sub-batches are cancelled and failure handling applies to the entire topological batch.

### 5.6 Agent Dispatch Context (per phase)

When dispatching an engineer agent for phase P, the tech-lead provides:

```
ACTION: Implement TSPEC following the PLAN

Plan file: {absolute path to PLAN document}
Feature branch: feat-{feature-name}
Phase to implement: {Phase letter} — {Phase title}

Completed dependency phases: {comma-separated list, or "none"}

Your task is to implement ONLY the following phase from the plan:

{Copy of phase P's task table from the plan document}

Important:
- Implement only the tasks listed above. Do NOT implement other phases.
- Follow the git workflow in your skill definition.
- Commit and push when done. Signal LGTM when complete.
```

### 5.7 Phase Failure Handling

When any phase agent fails (non-LGTM signal, non-zero exit, or timeout):

1. Allow all remaining running agents to complete naturally.
2. Once ALL agents have completed: post failure notifications for each failed phase.
3. Post overall batch failure notice with resume instructions.
4. **DO NOT MERGE any worktrees** — not for failed phases, not for successful ones.
5. Clean up ALL worktrees for this batch:
   - Successful worktrees: always delete (using worktree path and branch from Agent result)
   - Failed worktrees: delete unless `retain_failed_worktrees: true` in config
   - **Branch name unavailable fallback (see OQ-03):** If the Agent tool result for a failed agent does not include the worktree branch name, the tech-lead cannot clean up that specific worktree. In this case: log a warning (`"Failed agent for Phase {X} did not return a worktree branch — manual cleanup may be required"`), skip cleanup for that worktree, and continue with cleanup for the remaining worktrees whose branch names are known.
6. HALT. Plan is NOT updated.

**No-partial-merge invariant:** The feature branch is left in exactly the same state as before the batch began. All phases in the batch will be re-run when the developer re-invokes.

**Timeout threshold:** Defined by `orchestrator.tech_lead_agent_timeout_ms` in `ptah.config.json` (default: 600,000 ms). The Agent tool infrastructure enforces the timeout — the tech-lead receives a failure result when the threshold is exceeded.

### 5.8 Merge Conflict Handling

When a conflict occurs during step 6 of the batch execution lifecycle:

1. Abort the merge: `git merge --abort` in the feature branch worktree.
2. Stop merging remaining phases in this batch.
3. Post conflict notification with conflicting files.
4. Clean up unmerged phase worktrees without merging.
5. HALT. Plan is NOT updated for this batch.

**Resume behavior:** Because the plan is not updated, the resume algorithm will re-run all phases in the batch. Phases that were already merged before the conflict will be re-implemented over existing code.

### 5.9 Plan Status Update Algorithm

After all merges and test gate succeed:

```
1. Read the plan document.
2. For each phase in the batch:
   a. Find the phase header (e.g., "### Phase B —").
   b. For each task row under that header:
      Replace the status value (⬚, 🔴, 🟢, 🔵) with ✅
3. Write the updated plan document.
4. Stage the file: git add {plan_path}
5. Commit: "chore: mark Batch {N} phases as Done in plan"
6. Push to feature branch.
```

**Serialization invariant:** This step runs sequentially AFTER all merges (step 7) and test gate (step 8). Even when phases from sub-batches complete at different times, their plan updates are batched into a single write per topological batch.

### 5.10 Confirmation Loop

The tech-lead presents the Batch Execution Plan and collects user input via the `AskUserQuestion` tool. The loop runs up to 5 modification cycles before forcing a final approve/cancel prompt.

**Modification types:**
- `change {Phase X} to {skill}` — override skill assignment
- `move {Phase X} to Batch {N}` — validated against dependency constraints (phase cannot be placed in the same or earlier batch as any of its dependencies)
- `split Batch {N}` — user specifies which phases stay and which move to a new batch; validated against dependency ordering
- `re-run {Phase X}` — marks an in-memory not-completed override; warns about downstream Done phases (full transitive closure)

**Timeout:** 10 minutes of user inactivity cancels execution. The `AskUserQuestion` tool's built-in timeout enforces this. **Defensive handling:** Since the exact return value on timeout is unverified (see OQ-02), the SKILL.md must treat BOTH a `null` return AND a sentinel timeout signal (e.g., `{ timeout: true }` or an empty string) as a timeout event. The implementation should check: if the return value is falsy, empty, or contains a timeout indicator → post the cancellation message and exit with `LGTM` (no agents were dispatched).

**Iteration counter:** Only SUCCESSFUL modifications (reaching re-presentation) count toward the 5-cycle limit. Unrecognized inputs and rejected-but-recognized modifications (dependency violations) do NOT consume a cycle.

---

## 6. Error Handling

| Scenario | Detection | Behavior | Exit |
|----------|-----------|----------|------|
| Plan file not found | File read returns ENOENT | Report error with path; no agents dispatched | LGTM |
| Plan file is a directory | File read fails or is-directory check | Report: "Expected a file, not a directory: {path}"; halt | LGTM |
| Plan file is empty | Content length === 0 | Report: "Plan file is empty: {path}"; halt | LGTM |
| No "Task Dependency Notes" section | Section extraction returns null | Log warning; enter sequential fallback | — |
| Dependency section is unparseable | Zero valid edges extracted | Log warning; enter sequential fallback | — |
| Cycle in dependency graph | Kahn's sort leaves residual nodes | Log cycle path; enter sequential fallback | — |
| Dangling reference in dependency | Phase name not in canonical set | Log warning for each; drop that edge; continue | — |
| All phases already Done | Empty batch list after exclusion | Post "nothing to do"; exit cleanly | LGTM |
| Pre-flight Check 1 fails (remote branch missing) | `git ls-remote` returns empty | Post notification; revert to sequential plan; re-present to user | — |
| Pre-flight Check 2 fails (no mergeBranchIntoFeature) | Grep returns no match | Post notification; revert to sequential plan; re-present to user | — |
| Phase agent failure (ROUTE_TO_USER / error / timeout) | Agent result is non-LGTM | No-partial-merge; cleanup worktrees; halt | ROUTE_TO_USER |
| Merge conflict between phases | `git merge` exits conflict | Abort merge; post conflict files; halt | ROUTE_TO_USER |
| Test gate — assertion failure | Vitest exits non-zero | Post failing tests; halt; plan NOT updated | ROUTE_TO_USER |
| Test gate — runner failure | Vitest fails to start | Post runner error output; halt | ROUTE_TO_USER |
| Confirmation cancelled by user | User types "cancel" | Post cancellation message; no agents dispatched | LGTM |
| Confirmation timeout (10 min) | AskUserQuestion timeout | Post timeout message; no agents dispatched | LGTM |
| Max modification iterations (5) | Iteration counter reaches 5 | Post "maximum modifications reached"; re-present plan; force approve/cancel | — |
| Merge lock timeout in mergeBranchIntoFeature | Lock acquire times out | Return merge-error with lock timeout message | — |

---

## 7. Test Strategy

### 7.1 Approach

The TypeScript changes (dispatcher routing, `mergeBranchIntoFeature`) follow full TDD. The tech-lead SKILL.md is prompt-based and cannot be unit-tested in the Vitest sense — its correctness is validated through the acceptance tests specified in the FSPEC and the PROPERTIES document.

### 7.2 Test Doubles

```typescript
// tests/fixtures/factories.ts — additions

/** Fake implementation of the updated ArtifactCommitter interface */
class FakeArtifactCommitter implements ArtifactCommitter {
  commitAndMergeError: Error | null = null;
  commitAndMergeResult: CommitResult = defaultCommitResult();
  mergeBranchError: Error | null = null;
  mergeBranchResult: BranchMergeResult = { status: "merged", commitSha: "abc123",
                                            conflictingFiles: [], errorMessage: null };

  async commitAndMerge(params: CommitParams): Promise<CommitResult> {
    if (this.commitAndMergeError) throw this.commitAndMergeError;
    return this.commitAndMergeResult;
  }

  async mergeBranchIntoFeature(params: MergeBranchParams): Promise<BranchMergeResult> {
    if (this.mergeBranchError) throw this.mergeBranchError;
    return this.mergeBranchResult;
  }
}

/** Stub FeatureConfig with useTechLead=true */
function makeTechLeadConfig(overrides?: Partial<FeatureConfig>): FeatureConfig {
  return {
    discipline: "backend-only",
    skipFspec: false,
    useTechLead: true,
    ...overrides,
  };
}

/** GitClient interface — the subset used by DefaultArtifactCommitter.mergeBranchIntoFeature */
interface GitClient {
  mergeInWorktree(worktreePath: string, sourceBranch: string): Promise<"merged" | "already-up-to-date" | "conflict">;
  getShortSha(ref: string): Promise<string>;
  getConflictedFiles(worktreePath: string): Promise<string[]>;
  abortMergeInWorktree(worktreePath: string): Promise<void>;
}

/** Fake GitClient for mergeBranchIntoFeature tests */
class FakeGitClient implements GitClient {
  mergeInWorktreeResult: "merged" | "already-up-to-date" | "conflict" = "merged";
  mergeInWorktreeError: Error | null = null;
  shortSha: string = "abc1234";
  conflictedFiles: string[] = [];
  abortMergeInWorktreeCalled = false;

  async mergeInWorktree(_worktreePath: string, _sourceBranch: string) {
    if (this.mergeInWorktreeError) throw this.mergeInWorktreeError;
    return this.mergeInWorktreeResult;
  }
  async getShortSha(_ref: string) { return this.shortSha; }
  async getConflictedFiles(_worktreePath: string) { return this.conflictedFiles; }
  async abortMergeInWorktree(_worktreePath: string) { this.abortMergeInWorktreeCalled = true; }
}

/** MergeLock interface */
interface MergeLock {
  acquire(timeoutMs: number): Promise<() => void>;
}

/** Fake MergeLock that records acquire/release calls for assertion */
class FakeMergeLock implements MergeLock {
  acquireCalled = false;
  releaseCalled = false;
  releaseCallCount = 0;

  async acquire(_timeoutMs: number): Promise<() => void> {
    this.acquireCalled = true;
    return () => {
      this.releaseCalled = true;
      this.releaseCallCount++;
    };
  }
}

/** Fake MergeLock that simulates a lock timeout */
class FakeMergeLockWithTimeout implements MergeLock {
  async acquire(_timeoutMs: number): Promise<() => void> {
    throw new MergeLockTimeoutError("Merge lock timeout — another merge is in progress");
  }
}

/** Factory: create a DefaultArtifactCommitter with a FakeGitClient and default FakeMergeLock */
function makeCommitter(git: GitClient): DefaultArtifactCommitter {
  return new DefaultArtifactCommitter(git, new FakeMergeLock(), new FakeLogger());
}

/** Factory: create a DefaultArtifactCommitter with a specific lock implementation */
function makeCommitterWithLock(git: GitClient, lock: MergeLock): DefaultArtifactCommitter {
  return new DefaultArtifactCommitter(git, lock, new FakeLogger());
}

/** Factory: default MergeBranchParams for tests */
function makeMergeBranchParams(overrides?: Partial<MergeBranchParams>): MergeBranchParams {
  return {
    sourceBranch: "worktree/phase-a",
    featureBranch: "feat-014-tech-lead-orchestration",
    featureBranchWorktreePath: "/tmp/worktree-feature",
    agentId: "eng",
    ...overrides,
  };
}
```

### 7.3 Test Categories

| Category | File | What is tested |
|----------|------|----------------|
| Dispatcher routing (useTechLead) | `pdlc-dispatcher.test.ts` | phaseToAgentId returns "tl" for IMPLEMENTATION when useTechLead=true; returns "eng"/"fe" when false; fork-join suppressed for tl |
| Dispatcher backward compat | `pdlc-dispatcher.test.ts` | All existing behavior unchanged when useTechLead is absent |
| mergeBranchIntoFeature happy path | `artifact-committer.test.ts` | Returns { status: "merged", commitSha: ... } on clean merge |
| mergeBranchIntoFeature conflict | `artifact-committer.test.ts` | Returns { status: "conflict", conflictingFiles: [...] }; merge is aborted |
| mergeBranchIntoFeature already-up-to-date | `artifact-committer.test.ts` | Returns { status: "already-up-to-date" } |
| mergeBranchIntoFeature lock timeout | `artifact-committer.test.ts` | Returns { status: "merge-error", errorMessage: "Merge lock timeout..." } |
| mergeBranchIntoFeature git error | `artifact-committer.test.ts` | Returns { status: "merge-error", errorMessage: ... } |
| Config loader — mentionable field | `config/loader.test.ts` | Agent with `mentionable: false` passes validation with empty `mention_id`; agent with `mentionable: true` or absent still requires valid snowflake |
| Agent registry wiring (integration) | `integration/agent-registry.test.ts` | Loads `ptah.config.json`, resolves "tl" agent, asserts `skill_path` resolves to an existing file |
| SKILL.md logic | FSPEC acceptance tests | Validated via acceptance test scenarios defined in §7.5 |

### 7.4 Specific Test Cases

#### `pdlc-dispatcher.test.ts` additions

```typescript
describe("phaseToAgentId — useTechLead routing", () => {
  it("returns 'tl' for IMPLEMENTATION when useTechLead is true (backend-only)", () => {
    const config = makeTechLeadConfig({ discipline: "backend-only" });
    expect(phaseToAgentId(Phase.IMPLEMENTATION, config)).toBe("tl");
  });

  it("returns 'tl' for IMPLEMENTATION when useTechLead is true (fullstack)", () => {
    const config = makeTechLeadConfig({ discipline: "fullstack" });
    expect(phaseToAgentId(Phase.IMPLEMENTATION, config)).toBe("tl");
  });

  it("returns 'tl' for IMPLEMENTATION when useTechLead is true (frontend-only)", () => {
    const config = makeTechLeadConfig({ discipline: "frontend-only" });
    expect(phaseToAgentId(Phase.IMPLEMENTATION, config)).toBe("tl");
  });

  it("preserves existing routing when useTechLead is absent", () => {
    const config: FeatureConfig = { discipline: "backend-only", skipFspec: false };
    expect(phaseToAgentId(Phase.IMPLEMENTATION, config)).toBe("eng");
  });

  it("preserves existing routing when useTechLead is false", () => {
    const config: FeatureConfig = { discipline: "frontend-only", skipFspec: false, useTechLead: false };
    expect(phaseToAgentId(Phase.IMPLEMENTATION, config)).toBe("fe");
  });

  it("does not affect TSPEC_CREATION routing even when useTechLead is true", () => {
    const config = makeTechLeadConfig({ discipline: "backend-only" });
    expect(phaseToAgentId(Phase.TSPEC_CREATION, config)).toBe("eng");
  });
});

describe("isForkJoinPhase — useTechLead suppresses fork-join for IMPLEMENTATION", () => {
  it("returns false for IMPLEMENTATION when useTechLead is true and fullstack", () => {
    const config = makeTechLeadConfig({ discipline: "fullstack" });
    expect(isForkJoinPhase(Phase.IMPLEMENTATION, config)).toBe(false);
  });

  it("returns true for IMPLEMENTATION when useTechLead is absent and fullstack", () => {
    const config: FeatureConfig = { discipline: "fullstack", skipFspec: false };
    expect(isForkJoinPhase(Phase.IMPLEMENTATION, config)).toBe(true);
  });

  it("returns true for TSPEC_CREATION when useTechLead is true and fullstack (no suppression for non-IMPLEMENTATION)", () => {
    const config = makeTechLeadConfig({ discipline: "fullstack" });
    expect(isForkJoinPhase(Phase.TSPEC_CREATION, config)).toBe(true);
  });
});
```

#### `artifact-committer.test.ts` additions

```typescript
describe("DefaultArtifactCommitter.mergeBranchIntoFeature", () => {
  it("returns merged status with commitSha on successful merge and releases lock", async () => {
    const git = new FakeGitClient();
    git.mergeInWorktreeResult = "merged";
    git.shortSha = "abc123";
    const lock = new FakeMergeLock();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("merged");
    expect(result.commitSha).toBe("abc123");
    expect(result.conflictingFiles).toHaveLength(0);
    expect(lock.releaseCalled).toBe(true);
    expect(lock.releaseCallCount).toBe(1);
  });

  it("returns conflict status and conflicting files, aborts merge, and releases lock", async () => {
    const git = new FakeGitClient();
    git.mergeInWorktreeResult = "conflict";
    git.conflictedFiles = ["src/foo.ts", "src/bar.ts"];
    const lock = new FakeMergeLock();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("conflict");
    expect(result.conflictingFiles).toEqual(["src/foo.ts", "src/bar.ts"]);
    expect(git.abortMergeInWorktreeCalled).toBe(true);
    expect(lock.releaseCalled).toBe(true);
    expect(lock.releaseCallCount).toBe(1);
  });

  it("returns already-up-to-date when source is already in target history and releases lock", async () => {
    const git = new FakeGitClient();
    git.mergeInWorktreeResult = "already-up-to-date";
    const lock = new FakeMergeLock();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("already-up-to-date");
    expect(result.commitSha).toBeNull();
    expect(lock.releaseCalled).toBe(true);
    expect(lock.releaseCallCount).toBe(1);
  });

  it("returns merge-error on lock timeout (lock not acquired, no release)", async () => {
    const git = new FakeGitClient();
    const lock = new FakeMergeLockWithTimeout();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("merge-error");
    expect(result.errorMessage).toContain("Merge lock timeout");
  });

  it("returns merge-error when git throws an unexpected error and releases lock", async () => {
    const git = new FakeGitClient();
    git.mergeInWorktreeError = new Error("git internal error");
    const lock = new FakeMergeLock();
    const committer = makeCommitterWithLock(git, lock);
    const result = await committer.mergeBranchIntoFeature(makeMergeBranchParams());
    expect(result.status).toBe("merge-error");
    expect(result.errorMessage).toBe("git internal error");
    expect(lock.releaseCalled).toBe(true);
    expect(lock.releaseCallCount).toBe(1);
  });
});
```

#### `config/loader.test.ts` additions

```typescript
describe("config loader — mentionable field validation", () => {
  it("accepts an agent entry with mentionable: false and empty mention_id", async () => {
    const config = makeConfigWithAgent({
      id: "tl",
      mention_id: "",
      mentionable: false,
      skill_path: "../.claude/skills/tech-lead/SKILL.md",
      display_name: "Tech Lead",
    });
    const result = await loadConfig(config);
    expect(result.agents).toContainEqual(expect.objectContaining({ id: "tl" }));
  });

  it("rejects an agent entry with mentionable: true and empty mention_id", async () => {
    const config = makeConfigWithAgent({
      id: "bad",
      mention_id: "",
      mentionable: true,
      skill_path: "./some-skill.md",
      display_name: "Bad Agent",
    });
    await expect(loadConfig(config)).rejects.toThrow(/mention_id/);
  });

  it("requires valid snowflake for mention_id when mentionable is absent (defaults to true)", async () => {
    const config = makeConfigWithAgent({
      id: "pm",
      mention_id: "123456789012345678",
      skill_path: "./pm-skill.md",
      display_name: "Product Manager",
    });
    const result = await loadConfig(config);
    expect(result.agents).toContainEqual(expect.objectContaining({ id: "pm" }));
  });

  it("rejects empty mention_id when mentionable is absent", async () => {
    const config = makeConfigWithAgent({
      id: "bad",
      mention_id: "",
      skill_path: "./some-skill.md",
      display_name: "Bad Agent",
    });
    await expect(loadConfig(config)).rejects.toThrow(/mention_id/);
  });
});
```

#### `integration/agent-registry.test.ts`

```typescript
import { resolve } from "node:path";
import { existsSync } from "node:fs";

describe("agent registry wiring — integration", () => {
  it("resolves 'tl' agent from ptah.config.json with a valid skill_path", async () => {
    const config = await loadConfig(); // loads real ptah.config.json
    const tlAgent = config.agents.find((a) => a.id === "tl");
    expect(tlAgent).toBeDefined();
    expect(tlAgent!.mentionable).toBe(false);

    // skill_path is relative to ptah.config.json location — resolve it
    const configDir = resolve(__dirname, "../../"); // ptah/ root
    const skillPath = resolve(configDir, tlAgent!.skill_path);
    expect(existsSync(skillPath)).toBe(true);
  });
});
```

### 7.5 Acceptance Test Scenarios (SKILL.md)

The SKILL.md is prompt-based and cannot be unit-tested in Vitest. The following acceptance test scenarios define the manual validation criteria. Each scenario specifies preconditions, actions, and expected outcomes.

#### AT-PD-01 — Dependency parsing: linear chain syntax

| Field | Value |
|-------|-------|
| **Precondition** | Plan contains `Phase A → Phase B → Phase C` in Task Dependency Notes |
| **Action** | Tech-lead parses the plan |
| **Expected** | DAG contains edges (A→B), (B→C). Batches: Batch 1 = [A], Batch 2 = [B], Batch 3 = [C] |

#### AT-PD-02 — Dependency parsing: fan-out syntax

| Field | Value |
|-------|-------|
| **Precondition** | Plan contains `Phase A → [Phase B, Phase C, Phase D]` |
| **Action** | Tech-lead parses the plan |
| **Expected** | DAG contains edges (A→B), (A→C), (A→D). Batches: Batch 1 = [A], Batch 2 = [B, C, D] |

#### AT-PD-03 — Dependency parsing: natural language syntax

| Field | Value |
|-------|-------|
| **Precondition** | Plan contains `Phase C depends on: Phase A, Phase B` |
| **Action** | Tech-lead parses the plan |
| **Expected** | DAG contains edges (A→C), (B→C). Batches: Batch 1 = [A, B], Batch 2 = [C] |

#### AT-PD-04 — Cycle detection triggers sequential fallback

| Field | Value |
|-------|-------|
| **Precondition** | Plan contains `Phase A → Phase B` and `Phase B → Phase A` (cycle) |
| **Action** | Tech-lead parses the plan |
| **Expected** | Cycle detected and logged: `"Cycle detected: Phase A → Phase B → Phase A"`. Sequential fallback activated. Confirmation shows sequential plan with explanation |

#### AT-PD-05 — Missing dependency section triggers sequential fallback

| Field | Value |
|-------|-------|
| **Precondition** | Plan has no "Task Dependency Notes" heading |
| **Action** | Tech-lead parses the plan |
| **Expected** | Warning logged. Sequential fallback activated (phases in document order, one per batch) |

#### AT-PD-06 — Topological batching with sub-batch splitting

| Field | Value |
|-------|-------|
| **Precondition** | Plan with 8 phases: A (root), B–H all depend on A. Concurrency cap = 5 |
| **Action** | Tech-lead computes batches |
| **Expected** | Batch 1 = [A]. Batch 2.1 = [B, C, D, E, F] (first 5 in document order). Batch 2.2 = [G, H]. Test gate fires once after Batch 2.2 merges, NOT between 2.1 and 2.2 |

#### AT-PD-07 — Skill assignment: all backend

| Field | Value |
|-------|-------|
| **Precondition** | Phase has tasks with source files in `src/` and `tests/` only |
| **Action** | Tech-lead assigns skill |
| **Expected** | Skill = `backend-engineer`. No warning |

#### AT-PD-08 — Skill assignment: all frontend

| Field | Value |
|-------|-------|
| **Precondition** | Phase has tasks with source files in `app/` and `components/` only |
| **Action** | Tech-lead assigns skill |
| **Expected** | Skill = `frontend-engineer`. No warning |

#### AT-PD-09 — Skill assignment: mixed layers

| Field | Value |
|-------|-------|
| **Precondition** | Phase has tasks with source files in both `src/` and `app/` |
| **Action** | Tech-lead assigns skill |
| **Expected** | Skill = `backend-engineer`. Mixed-layer warning posted in confirmation |

#### AT-PD-10 — Skill assignment: docs-only defaults to backend

| Field | Value |
|-------|-------|
| **Precondition** | Phase has tasks with source files in `docs/` only |
| **Action** | Tech-lead assigns skill |
| **Expected** | Skill = `backend-engineer`. No warning |

#### AT-BD-01-01 — Pre-flight: both checks pass

| Field | Value |
|-------|-------|
| **Precondition** | Feature branch exists on remote. `mergeBranchIntoFeature` exists in `artifact-committer.ts` |
| **Action** | Tech-lead runs pre-flight checks |
| **Expected** | Both checks pass. Parallel plan presented in confirmation |

#### AT-BD-01-02 — Pre-flight: remote branch missing

| Field | Value |
|-------|-------|
| **Precondition** | Feature branch does NOT exist on remote |
| **Action** | Tech-lead runs pre-flight checks |
| **Expected** | Check 1 fails. Sequential fallback activated. Confirmation shows sequential plan with failure explanation |

#### AT-BD-01-03 — Pre-flight: mergeBranchIntoFeature missing

| Field | Value |
|-------|-------|
| **Precondition** | `mergeBranchIntoFeature` not found in `artifact-committer.ts` |
| **Action** | Tech-lead runs pre-flight checks |
| **Expected** | Check 2 fails. Sequential fallback activated. Confirmation shows sequential plan with failure explanation |

#### AT-BD-02-01 — Confirmation loop: change skill assignment

| Field | Value |
|-------|-------|
| **Precondition** | Confirmation presented with Phase B assigned to backend-engineer |
| **Action** | User types `change Phase B to frontend-engineer` |
| **Expected** | Phase B skill updated. Plan re-presented with updated assignment. Modification counter incremented by 1 |

#### AT-BD-02-02 — Confirmation loop: move phase to different batch

| Field | Value |
|-------|-------|
| **Precondition** | Phase C in Batch 2 depends on Phase A (Batch 1) only |
| **Action** | User types `move Phase C to Batch 3` |
| **Expected** | Phase C moved to Batch 3. Plan re-presented. Modification counter incremented |

#### AT-BD-02-03 — Confirmation loop: move phase rejected (dependency violation)

| Field | Value |
|-------|-------|
| **Precondition** | Phase B in Batch 2 depends on Phase A (Batch 1) |
| **Action** | User types `move Phase B to Batch 1` |
| **Expected** | Rejected: Phase B cannot be in same or earlier batch as its dependency Phase A. Error message posted. Modification counter NOT incremented |

#### AT-BD-02-04 — Confirmation loop: re-run completed phase

| Field | Value |
|-------|-------|
| **Precondition** | Phase A is marked Done. Phase B depends on Phase A and is also Done |
| **Action** | User types `re-run Phase A` |
| **Expected** | Phase A marked for re-run. Warning posted about downstream Done phases (Phase B). Plan re-presented |

#### AT-BD-02-05 — Confirmation loop: cancel

| Field | Value |
|-------|-------|
| **Precondition** | Confirmation presented |
| **Action** | User types `cancel` |
| **Expected** | Cancellation message posted. No agents dispatched. Exit with LGTM |

#### AT-BD-02-06 — Confirmation loop: timeout

| Field | Value |
|-------|-------|
| **Precondition** | Confirmation presented via AskUserQuestion |
| **Action** | User does not respond for 10 minutes |
| **Expected** | Timeout message posted. No agents dispatched. Exit with LGTM |

#### AT-BD-02-07 — Confirmation loop: max modifications reached

| Field | Value |
|-------|-------|
| **Precondition** | User has made 5 successful modifications |
| **Action** | User attempts a 6th modification |
| **Expected** | "Maximum modifications reached" message. Plan re-presented with approve/cancel only |

#### AT-BD-03-01 — Batch execution: success path

| Field | Value |
|-------|-------|
| **Precondition** | Batch 1 with Phases A, B. Both agents succeed. Merges succeed. Tests pass |
| **Action** | Tech-lead executes Batch 1 |
| **Expected** | Both agents dispatched in parallel with worktrees. Results collected. Merges performed in document order. Test gate runs and passes. Plan updated — Phase A and B tasks marked ✅. Commit and push |

#### AT-BD-03-02 — Batch execution: phase failure (no-partial-merge)

| Field | Value |
|-------|-------|
| **Precondition** | Batch 1 with Phases A, B. Phase A succeeds, Phase B fails |
| **Action** | Tech-lead executes Batch 1 |
| **Expected** | Both agents complete (A succeeds, B fails). NO worktrees merged (not A, not B). All worktrees cleaned up (B retained if `retain_failed_worktrees: true`). Failure notification with resume instructions. Plan NOT updated. Exit with ROUTE_TO_USER |

#### AT-BD-03-03 — Batch execution: merge conflict

| Field | Value |
|-------|-------|
| **Precondition** | Batch 1 with Phases A, B, C (all succeed). Merge of Phase B conflicts with Phase A's merge |
| **Action** | Tech-lead merges in document order |
| **Expected** | Phase A merged successfully. Phase B merge conflicts. Merge aborted. Phase C NOT attempted. Conflict notification with file names. Unmerged worktrees cleaned up. Plan NOT updated. Exit with ROUTE_TO_USER |

#### AT-BD-03-04 — Batch execution: test gate assertion failure

| Field | Value |
|-------|-------|
| **Precondition** | Batch 1 merges succeed. Vitest run produces assertion failures |
| **Action** | Tech-lead runs test gate |
| **Expected** | Failing test names reported. Plan NOT updated. Exit with ROUTE_TO_USER |

#### AT-BD-03-05 — Batch execution: test gate runner failure

| Field | Value |
|-------|-------|
| **Precondition** | Batch 1 merges succeed. Vitest fails to start (compilation error) |
| **Action** | Tech-lead runs test gate |
| **Expected** | Runner error output reported. Plan NOT updated. Exit with ROUTE_TO_USER |

#### AT-BD-03-06 — Resume auto-detection

| Field | Value |
|-------|-------|
| **Precondition** | Plan has Phases A–D. Phase A and B are marked ✅ Done. Phase C and D are not |
| **Action** | Tech-lead is invoked |
| **Expected** | Phases A and B excluded from DAG. Batching computed from C and D only. Resume note shown in confirmation: "Resuming from Phase C (Phases A, B already completed)" |

#### AT-BD-03-07 — Plan status update

| Field | Value |
|-------|-------|
| **Precondition** | Batch 1 (Phases A, B) completes successfully (merges + test gate pass) |
| **Action** | Tech-lead updates plan |
| **Expected** | All task rows under Phase A and Phase B have status changed to ✅. Single commit: `"chore: mark Batch 1 phases as Done in plan"`. Pushed to feature branch |

#### AT-BD-03-08 — Sub-batch: test gate fires only after final sub-batch

| Field | Value |
|-------|-------|
| **Precondition** | Topological batch with 7 phases (all depend on Phase A, which is Done). Concurrency cap = 5 |
| **Action** | Tech-lead splits into sub-batches 2.1 (5 phases) and 2.2 (2 phases) and executes |
| **Expected** | Sub-batch 2.1: dispatch, collect, merge. NO test gate, NO plan update. Sub-batch 2.2: dispatch, collect, merge. Test gate runs ONCE after 2.2 merges. Plan update covers all 7 phases. Single batch summary |

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component | Description |
|-------------|---------------------|-------------|
| REQ-PD-01 | SKILL.md §Plan Parsing | Parse plan file, extract phases, parse 3 dependency syntax forms, build DAG; missing/unreadable plan → halt |
| REQ-PD-02 | SKILL.md §Batch Computation | Kahn's topological layering; batch assignment formula N = longest-path + 1 |
| REQ-PD-03 | SKILL.md §Skill Assignment | Source file prefix → skill type; mixed-layer → backend-engineer + warning |
| REQ-PD-04 | SKILL.md §Completed Phase Exclusion | All tasks Done → phase excluded; empty result → "nothing to do" + LGTM |
| REQ-PD-05 | SKILL.md §Sequential Fallback | Missing/unparseable section → sequential fallback with warning |
| REQ-PD-06 | SKILL.md §Cycle Detection | Kahn's residual nodes → cycle; log path; sequential fallback |
| REQ-BD-01 | SKILL.md §Batch Lifecycle | Strict sequential batch order; batch N+1 waits for N completion + tests pass |
| REQ-BD-02 | SKILL.md §Parallel Dispatch | Agent tool with `isolation: "worktree"` for each phase; all dispatched concurrently |
| REQ-BD-03 | SKILL.md §Worktree Isolation | Agent tool `isolation: "worktree"` parameter provides per-agent git isolation |
| REQ-BD-04 | SKILL.md §Sequential Merge | git merge in document order; serialized via sequential loop |
| REQ-BD-05 | SKILL.md §Test Gate | `npx vitest run` from `ptah/`; assertion failure vs runner failure distinguished |
| REQ-BD-06 | SKILL.md §Resume Logic | Completed-phase exclusion gives automatic resume; first non-empty batch = resume point |
| REQ-BD-07 | SKILL.md §Phase Failure | No-partial-merge invariant; worktree cleanup per `retain_failed_worktrees`; halt |
| REQ-BD-08 | SKILL.md §Plan Update | Edit plan tasks to ✅; commit + push to feature branch; runs after test gate |
| REQ-TL-01 | `phases.ts` + `pdlc-dispatcher.ts` | `FeatureConfig.useTechLead`; `phaseToAgentId` returns "tl"; fork-join suppressed |
| REQ-TL-02 | SKILL.md §Confirmation Loop | AskUserQuestion for approve/modify/cancel; modification loop with 5-iteration cap |
| REQ-TL-03 | SKILL.md (constraint) | Skill never uses Edit/Write for source code; only for plan updates and docs |
| REQ-TL-04 | SKILL.md §Merge Conflict | Conflict handling in §5.8; halt with file names |
| REQ-TL-05 | SKILL.md §Agent Context | Structured prompt per §5.6; includes plan path, phase, branch, completed deps, ACTION |
| REQ-PR-01 | SKILL.md §Batch Notifications | Batch start message format |
| REQ-PR-02 | SKILL.md §Phase Notifications | Phase completion message format |
| REQ-PR-03 | SKILL.md §Batch Summary | Batch summary message format |
| REQ-PR-04 | SKILL.md §Final Summary | Final summary after all batches |
| REQ-NF-14-01 | SKILL.md §Sub-batching | Concurrency cap of 5; sub-batch labeling N.1, N.2; test gate fires once per topological batch |
| REQ-NF-14-02 | SKILL.md §Worktree Cleanup | Configurable via `retain_failed_worktrees`; default false; path logged when retained |
| REQ-NF-14-03 | `pdlc-dispatcher.ts` | `useTechLead` absent/false → existing dispatch unchanged; fork-join logic preserved |
| REQ-NF-14-04 | SKILL.md §Parsing + `backend-plans-template.md` | Plan template updated; both syntax forms parsed; linear-chain → single-phase batches |
| REQ-NF-14-05 | SKILL.md §Pre-flight + `artifact-committer.ts` | Check 1: git ls-remote; Check 2: grep for `mergeBranchIntoFeature`; sequential fallback on failure |

---

## 9. Integration Points

| Integration Point | File | How This Feature Connects |
|-------------------|------|--------------------------|
| PDLC dispatcher → tech-lead routing | `pdlc-dispatcher.ts` | New `useTechLead` branch in `phaseToAgentId`; new suppression in `isForkJoinPhase` |
| Agent registry | `ptah.config.json` | New "tl" agent entry with skill_path pointing to SKILL.md |
| Feature state | `phases.ts` | `FeatureConfig.useTechLead?: boolean` persisted in `pdlc-state.json` |
| ArtifactCommitter | `artifact-committer.ts` | New `mergeBranchIntoFeature` method; pre-flight Check 2 grepping for it |
| Config validation | `config/loader.ts` | Add `mentionable?: boolean` to `AgentEntry`; when `false`, skip snowflake regex for `mention_id`. Required for "tl" agent registration (see OQ-01 resolution) |
| Plan template | `docs/templates/backend-plans-template.md` | Fan-out syntax documentation in Task Dependency Notes section |
| Test gate command | SKILL.md | `npx vitest run` from `ptah/` directory — must match actual project layout |
| Agent dispatch timeout | SKILL.md + `ptah.config.json` | Tech-lead reads `orchestrator.tech_lead_agent_timeout_ms` from config (default 600,000 ms) |

---

## 10. Worktree Branch Naming Convention

When dispatching a phase agent with `isolation: "worktree"`, the Agent tool infrastructure creates the worktree branch. The returned result includes the worktree path and branch name. The tech-lead skill uses the returned branch name for the subsequent merge operation and does not need to predict it in advance.

For the merge step (§5.5 step 6), the tech-lead:
1. Receives the worktree branch name from the Agent tool result
2. Runs `git merge --no-ff {branch}` in the feature branch worktree
3. After successful merge, cleans up: `git worktree remove {worktree-path}` and `git branch -d {branch}`

For failed agent worktrees that are retained (`retain_failed_worktrees: true`):
- The worktree path is logged: `"Failed worktree for Phase {X} retained at: {path} (branch: {branch-name})"`
- No `git worktree remove` or branch delete is called

---

## 11. `ptah.config.json` Changes

Add the "tl" agent entry and the two optional orchestrator fields:

```json
{
  "agents": [
    ...existing entries...,
    {
      "id": "tl",
      "skill_path": "../.claude/skills/tech-lead/SKILL.md",
      "log_file": "./docs/agent-logs/tl.md",
      "mention_id": "",
      "mentionable": false,
      "display_name": "Tech Lead"
    }
  ],
  "orchestrator": {
    ...existing fields...,
    "tech_lead_agent_timeout_ms": 600000,
    "retain_failed_worktrees": false
  }
}
```

**Note on `mention_id` and `mentionable`:** The tech-lead agent does not correspond to a Discord role (it is dispatched internally by the orchestrator, not via Discord mentions). The `mention_id` is left empty and `mentionable` is set to `false`, which instructs the config loader to skip the snowflake regex validation for this agent entry (see OQ-01 resolution).

---

## 12. Tech-Lead SKILL.md — Implementation Summary

The SKILL.md is the primary deliverable. It must implement:

1. **Git workflow** — sync `feat-{feature-name}` branch before starting; commit/push after each batch completes
2. **Plan parsing** — see §5.1
3. **Topological batching** — see §5.2
4. **Skill assignment** — see §5.3
5. **Pre-flight checks** — see §5.4 (skip in sequential mode)
6. **Confirmation loop** — see §5.10 (AskUserQuestion; up to 5 modification cycles; 10-min timeout)
7. **Batch execution** — see §5.5
8. **Agent context** — see §5.6
9. **Failure handling** — see §5.7
10. **Merge conflict handling** — see §5.8
11. **Plan status update** — see §5.9
12. **Progress reporting** — batch start, phase completion, batch summary, final summary
13. **Resume detection** — auto-detected from plan Done status; resume note in confirmation

**Response contract:** The tech-lead skill emits `LGTM` when all batches complete successfully (or when cleanly halting with no-agents-dispatched outcomes: cancel, timeout, nothing-to-do). It emits `ROUTE_TO_USER` only if a blocking failure occurs that requires human decision (phase failure, merge conflict, test gate failure) — and in these cases, the failure is described in the `question` field so the orchestrator can surface it.

---

## 13. Open Questions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| OQ-01 | `config/loader.ts` validates `mention_id` as a non-empty string matching `/^\d+$/` (lines 140–150). The "tl" agent has no Discord role mention. **Resolution: Option (a) — add `mentionable?: boolean` to `AgentEntry`.** When `mentionable` is `false`, the loader skips snowflake regex validation for `mention_id` (empty string is allowed). When `mentionable` is `true` or absent (default), the existing validation applies. This correctly models the intent that some agents are internal orchestration agents, not user-mentionable Discord roles. **The PLAN must include an explicit task for this change (add `mentionable` field to `AgentEntry`, update `loader.ts` validation), scheduled before the `ptah.config.json` update task.** Test coverage for this change is specified in §7.3 and §7.4. | eng | **Resolved — option (a)** |
| OQ-02 | The `AskUserQuestion` tool's timeout behavior (return value when user doesn't respond) needs to be verified against the 10-minute confirmation timeout requirement. **Mitigation:** §5.10 specifies defensive handling — the SKILL.md treats both a `null` return and a sentinel timeout signal as a timeout event. This ensures correct behavior regardless of the tool's actual return value. Verification should still be performed during integration testing. | eng | Open — mitigated by defensive handling in §5.10; verify in integration |
| OQ-03 | When the Agent tool returns a result for a failed agent (ROUTE_TO_USER), does it also return the worktree branch name? The tech-lead needs to know the branch for cleanup. **Mitigation:** §5.7 step 5 now includes a fallback: if the branch name is unavailable, the tech-lead logs a warning and skips cleanup for that worktree. Manual cleanup may be required. Verification should still be performed during integration testing. | eng | Open — mitigated by fallback in §5.7; verify in integration |

---

## 14. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Engineer | — | 2026-03-20 | Draft |

---

*End of Document*
