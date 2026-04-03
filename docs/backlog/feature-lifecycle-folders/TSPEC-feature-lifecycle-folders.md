# Technical Specification

## Feature Lifecycle Folders

| Field | Detail |
|-------|--------|
| **Document ID** | TSPEC-FLF |
| **Requirements** | [REQ-FLF](REQ-feature-lifecycle-folders.md) |
| **Functional Specification** | [FSPEC-FLF](FSPEC-feature-lifecycle-folders.md) |
| **Version** | 1.2 |
| **Date** | April 4, 2026 |
| **Status** | Draft |

---

## 1. Summary

This TSPEC defines the technical design for reorganizing `docs/` into lifecycle-based folders (`backlog/`, `in-progress/`, `completed/`), implementing a feature resolver service, promotion activities (backlog→in-progress and in-progress→completed), worktree isolation for skill invocations, a one-time migration script, and updates to all four SKILL.md files and orchestrator source code.

The design introduces five new modules, modifies six existing modules, and updates four skill files. All new code follows the project's existing DI and protocol patterns.

---

## 2. Technology Stack

No new runtime dependencies are required. All implementation uses the existing stack:

| Concern | Choice |
|---------|--------|
| Runtime | Node.js 20 LTS |
| Language | TypeScript 5.x (ESM) |
| Build | `tsc` → `dist/` |
| Test framework | Vitest |
| Workflow engine | Temporal.io (`temporalio` ^1.9.3) |
| Git operations | `node:child_process` via `NodeGitClient` |
| File I/O | `NodeFileSystem` |

New dev dependency: none. The `node:crypto` module (built-in) is used for UUID generation in worktree paths.

---

## 3. Project Structure

```
ptah/src/
├── orchestrator/
│   ├── feature-resolver.ts              # NEW — FeatureResolver protocol + implementation
│   ├── promotion-activity.ts            # NEW — Promotion activity functions (backlog→IP, IP→completed)
│   ├── worktree-manager.ts              # NEW — WorktreeManager protocol + implementation
│   ├── pdlc/
│   │   └── cross-review-parser.ts       # UPDATED — crossReviewPath uses resolved featurePath
│   ├── context-assembler.ts             # UPDATED — Layer 2 reads use resolved featurePath
│   ├── worktree-registry.ts             # UPDATED — add workflowId/runId/activityId fields
│   └── feature-branch.ts               # UNCHANGED
├── temporal/
│   ├── types.ts                         # UPDATED — add featurePath, worktreeRoot to state
│   ├── activities/
│   │   └── skill-activity.ts            # UPDATED — delegate worktree lifecycle to WorktreeManager
│   └── workflows/
│       └── feature-lifecycle.ts         # UPDATED — replace resolveContextDocuments, add promotion + sign-off
├── services/
│   ├── git.ts                           # UPDATED — add gitMvInWorktree, listDirInWorktree
│   └── filesystem.ts                    # UPDATED — add readDirMatching
├── commands/
│   └── migrate-lifecycle.ts             # NEW — one-time migration script
└── bin/
    └── ptah-migrate-lifecycle.ts        # NEW — CLI entry point for migration

ptah/tests/
├── fixtures/
│   └── factories.ts                     # UPDATED — add FakeFeatureResolver, FakeWorktreeManager
├── unit/
│   ├── orchestrator/
│   │   ├── feature-resolver.test.ts     # NEW
│   │   ├── promotion-activity.test.ts   # NEW
│   │   └── worktree-manager.test.ts     # NEW
│   └── temporal/
│       └── feature-lifecycle.test.ts    # UPDATED — new tests for lifecycle-aware resolution
├── integration/
│   ├── orchestrator/
│   │   └── promotion-pipeline.test.ts   # NEW — end-to-end promotion with real FS + git
│   └── commands/
│       └── migrate-lifecycle.test.ts    # NEW — migration with real FS + git

.claude/skills/
├── product-manager/SKILL.md             # UPDATED — File Organization section
├── engineer/SKILL.md                    # UPDATED — File Organization section
├── tech-lead/SKILL.md                   # UPDATED — File Organization section
└── test-engineer/SKILL.md              # UPDATED — File Organization section
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
featureLifecycleWorkflow (Temporal Workflow)
  ├── invokeSkill activity
  │     ├── WorktreeManager (create/destroy worktrees)
  │     ├── FeatureResolver (resolve feature path)
  │     ├── ContextAssembler (uses resolved featurePath)
  │     ├── SkillInvoker (invoke Claude Code)
  │     └── ArtifactCommitter (commit + merge)
  ├── promoteBacklogToInProgress activity
  │     ├── WorktreeManager
  │     ├── FeatureResolver
  │     └── GitClient (git mv, commit, push)
  ├── promoteInProgressToCompleted activity
  │     ├── WorktreeManager
  │     ├── FeatureResolver
  │     ├── GitClient (git mv, commit, push)
  │     └── FileSystem (readDir, readFile for ref updates)
  └── mergeWorktree activity (existing)

WorktreeManager
  ├── GitClient (worktree add/remove/list)
  ├── WorktreeRegistry (in-memory tracking)
  └── Logger

FeatureResolver
  ├── FileSystem (exists, readDir)
  └── Logger
```

### 4.2 Protocols (Interfaces)

#### 4.2.1 FeatureResolver

```typescript
// src/orchestrator/feature-resolver.ts

export interface FeatureResolverResult {
  found: true;
  /** Relative path from worktree root, e.g. "docs/in-progress/my-feature/" */
  path: string;
  /** Which lifecycle folder: "backlog" | "in-progress" | "completed" */
  lifecycle: "backlog" | "in-progress" | "completed";
} | {
  found: false;
  slug: string;
}

export interface FeatureResolver {
  /**
   * Resolve a feature slug to its folder path within a worktree.
   *
   * Search order: in-progress → backlog → completed.
   * For completed/, strips NNN- prefix when matching slugs.
   * Returns path relative to worktreeRoot (e.g. "docs/in-progress/my-feature/").
   * Returns { found: false } if not found — never throws.
   *
   * @param slug - Feature slug (e.g. "feature-lifecycle-folders")
   * @param worktreeRoot - Absolute path to the worktree root
   */
  resolve(slug: string, worktreeRoot: string): Promise<FeatureResolverResult>;
}
```

**Design rationale:** A single protocol ensures all path resolution goes through one code path. The `lifecycle` field in the result tells callers which folder the feature is in without re-parsing the path. The not-found result is a value (not an exception) per FSPEC-SK-01 BR-05.

#### 4.2.2 WorktreeManager

```typescript
// src/orchestrator/worktree-manager.ts

export interface WorktreeHandle {
  /** Absolute path to the worktree root */
  path: string;
  /** The branch checked out in this worktree */
  branch: string;
}

export interface WorktreeManager {
  /**
   * Create a new worktree for a skill invocation or promotion activity.
   * Generates a UUID-based path under /tmp/ptah-wt-{uuid}/.
   * Registers the worktree in the in-memory registry.
   *
   * @param featureBranch - Branch to check out (e.g. "feat-my-feature")
   * @param workflowId - Temporal workflow ID
   * @param runId - Temporal workflow run ID
   * @param activityId - Temporal activity ID (from Context.current().info.activityId)
   */
  create(
    featureBranch: string,
    workflowId: string,
    runId: string,
    activityId: string,
  ): Promise<WorktreeHandle>;

  /**
   * Destroy a worktree. Runs `git worktree remove --force`.
   * Deregisters from the in-memory registry.
   * Runs in a finally block — must not throw on cleanup failure (logs instead).
   */
  destroy(worktreePath: string): Promise<void>;

  /**
   * Crash-recovery sweep on orchestrator startup.
   * Enumerates all git worktrees, cross-references against active Temporal
   * workflow executions, and prunes dangling worktrees.
   *
   * @param activeExecutions - Set of active workflow execution identifiers
   *   (formatted as "workflowId:runId") from Temporal server query.
   */
  cleanupDangling(activeExecutions: Set<string>): Promise<void>;
}
```

**Design rationale:** Worktree creation is centralized behind this protocol so that skill activities and promotion activities share the same lifecycle logic. The `cleanupDangling` method takes active executions as input (queried externally by the caller) to keep the manager free of Temporal client dependency.

#### 4.2.3 Updated WorktreeRegistry

```typescript
// src/orchestrator/worktree-registry.ts (UPDATED)

export interface ActiveWorktree {
  worktreePath: string;
  branch: string;
  workflowId: string;
  runId: string;
  activityId: string;
  createdAt: string; // ISO 8601
}

export interface WorktreeRegistry {
  register(entry: ActiveWorktree): void;
  deregister(worktreePath: string): void;
  getAll(): ReadonlyArray<ActiveWorktree>;
  findByActivity(activityId: string): ActiveWorktree | undefined;
  size(): number;
}
```

**Design rationale:** The existing `ActiveWorktree` type only stores `worktreePath` and `branch`. Adding workflow/activity identifiers is required for crash-recovery cross-referencing (REQ-WT-02) and for the `WorktreeManager.cleanupDangling` method to match worktrees to executions.

#### 4.2.4 Updated FeatureWorkflowState

```typescript
// src/temporal/types.ts (UPDATED — new fields)

export interface FeatureWorkflowState {
  // ... existing fields ...

  /**
   * Resolved feature folder path relative to worktree root.
   * Set after FeatureResolver.resolve() runs.
   * Example: "docs/in-progress/my-feature/"
   * Updated by promotion activities.
   */
  featurePath: string | null;

  /**
   * Absolute path to the active worktree root.
   * Set when WorktreeManager.create() runs for the current skill invocation.
   * Example: "/tmp/ptah-wt-abc123/"
   */
  worktreeRoot: string | null;

  /**
   * Sign-off tracking for completion promotion.
   * Records which agent IDs have emitted LGTM signals in the current workflow run.
   * Key: agent ID (e.g. "qa", "pm"). Value: ISO 8601 timestamp of LGTM.
   */
  signOffs: Record<string, string>;
}
```

#### 4.2.5 Updated GitClient (new methods)

```typescript
// src/services/git.ts (UPDATED — new methods added to interface)

export interface GitClient {
  // ... existing methods ...

  /**
   * Run `git mv` within a worktree.
   * @param worktreePath - Absolute path to the worktree root
   * @param source - Source path relative to worktree root
   * @param destination - Destination path relative to worktree root
   */
  gitMvInWorktree(worktreePath: string, source: string, destination: string): Promise<void>;

  /**
   * List directory contents within a worktree.
   * @param worktreePath - Absolute path to the worktree root
   * @param dirPath - Directory path relative to worktree root
   * @returns Array of entry names (files and subdirectories)
   */
  listDirInWorktree(worktreePath: string, dirPath: string): Promise<string[]>;
}
```

**Design rationale:** Promotion activities need `git mv` and directory listing within worktrees. These are added to the existing `GitClient` protocol rather than creating a new interface, since git operations are already centralized there. The `listDirInWorktree` uses `fs.readdir` scoped to the worktree path (not a git command), but lives on `GitClient` to keep worktree-scoped operations together.

#### 4.2.6 Updated FileSystem (new method)

```typescript
// src/services/filesystem.ts (UPDATED — new method)

export interface FileSystem {
  // ... existing methods ...

  /**
   * Read directory entries matching a regex pattern.
   * @param dirPath - Absolute path to the directory
   * @param pattern - Regex to filter entries
   * @returns Matching entry names
   */
  readDirMatching(dirPath: string, pattern: RegExp): Promise<string[]>;
}
```

### 4.3 Concrete Implementations

#### 4.3.1 DefaultFeatureResolver

```typescript
// src/orchestrator/feature-resolver.ts

export class DefaultFeatureResolver implements FeatureResolver {
  constructor(
    private fs: FileSystem,
    private logger: Logger,
  ) {}

  async resolve(slug: string, worktreeRoot: string): Promise<FeatureResolverResult> {
    // See Algorithm §5.1
  }
}
```

#### 4.3.2 DefaultWorktreeManager

```typescript
// src/orchestrator/worktree-manager.ts

export class DefaultWorktreeManager implements WorktreeManager {
  constructor(
    private gitClient: GitClient,
    private registry: WorktreeRegistry,
    private logger: Logger,
  ) {}

  async create(featureBranch, workflowId, runId, activityId): Promise<WorktreeHandle> {
    // See Algorithm §5.3
  }

  async destroy(worktreePath: string): Promise<void> {
    // See Algorithm §5.3
  }

  async cleanupDangling(activeExecutions: Set<string>): Promise<void> {
    // See Algorithm §5.4
  }
}
```

### 4.4 Composition Root Updates

The composition root in the `start` command (`ptah/src/commands/start.ts`) wires new dependencies:

```typescript
// New instances
const featureResolver = new DefaultFeatureResolver(fs, logger);
const worktreeManager = new DefaultWorktreeManager(gitClient, worktreeRegistry, logger);

// Updated activity factory — inject new deps
const activities = createActivities({
  skillInvoker,
  contextAssembler,
  artifactCommitter,
  gitClient,
  routingEngine,
  agentRegistry,
  logger,
  config,
  featureResolver,    // NEW
  worktreeManager,    // NEW
  fs,                 // NEW — needed by promotion activities for file content updates
});

// Startup cleanup — after Temporal client connects
const activeExecutions = await temporalClient.listActiveWorkflowExecutions();
await worktreeManager.cleanupDangling(activeExecutions);
```

---

## 5. Algorithms

### 5.1 Feature Resolver — `resolve(slug, worktreeRoot)`

Per FSPEC-SK-01:

```
1. Normalize worktreeRoot: strip trailing slash.
2. searchRoot = path.join(worktreeRoot, "docs")
3. SEARCH in-progress:
   a. candidate = path.join(searchRoot, "in-progress", slug)
   b. if exists(candidate) → inProgressMatch = "docs/in-progress/{slug}/"
4. SEARCH backlog:
   a. candidate = path.join(searchRoot, "backlog", slug)
   b. if exists(candidate) → backlogMatch = "docs/backlog/{slug}/"
5. SEARCH completed:
   a. entries = readDir(path.join(searchRoot, "completed"))
   b. for each entry matching /^[0-9]{3}-/:
      - strip NNN- prefix → entrySuffix
      - if entrySuffix === slug → completedMatch = "docs/completed/{entry}/"
6. Collect all matches into matches[].
7. If matches.length > 1:
   a. Log warning: "[ptah:resolver] WARNING: slug {slug} found in multiple
      lifecycle folders: {list}. Returning first match per search order."
8. If matches.length >= 1:
   a. Return { found: true, path: firstMatch.path, lifecycle: firstMatch.lifecycle }
9. If matches.length === 0:
   a. Return { found: false, slug }
```

**Error handling for filesystem errors:** If `exists()` or `readDir()` throws (e.g., permission denied), log a warning and treat that lifecycle folder as empty. Continue to the next folder. Never throw from `resolve()`.

### 5.2 Promotion Activities

#### 5.2.1 `promoteBacklogToInProgress(input)`

Per FSPEC-PR-01 (backlog→in-progress flow):

```typescript
interface PromotionInput {
  featureSlug: string;
  featureBranch: string;
  workflowId: string;
  runId: string;
}

interface PromotionResult {
  featurePath: string;    // Updated relative path
  promoted: boolean;      // true if git mv was run, false if idempotent skip
}
```

Algorithm:

```
1. Create worktree via WorktreeManager.create(featureBranch, workflowId, runId, activityId).
2. try:
   a. Check if docs/backlog/{slug}/ exists in worktree.
      - If NO → check docs/in-progress/{slug}/:
        - If YES → log "Idempotent skip: {slug} already in in-progress."
                    Return { featurePath: "docs/in-progress/{slug}/", promoted: false }.
        - If NO  → throw ApplicationFailure.nonRetryable(
                      "Feature {slug} not found in backlog or in-progress.")
   b. Run git mv docs/backlog/{slug}/ docs/in-progress/{slug}/ in worktree.
   c. Commit in worktree: "chore(lifecycle): promote {slug} backlog → in-progress"
   d. Push from worktree to origin/{featureBranch}.
   e. Return { featurePath: "docs/in-progress/{slug}/", promoted: true }.
3. finally:
   a. WorktreeManager.destroy(worktreePath).
```

#### 5.2.2 `promoteInProgressToCompleted(input)`

Per FSPEC-PR-01 (in-progress→completed flow):

Algorithm:

```
1. Create worktree via WorktreeManager.create(featureBranch, workflowId, runId, activityId).
2. try:
   --- Phase 1: NNN assignment and folder move ---
   a. Scan docs/completed/ for any folder matching {NNN}-{slug} (any NNN).
      - If found → record existing NNN. Skip to Phase 2.
      - If not found:
        i.  Scan docs/completed/ for all folders matching /^[0-9]{3}-/.
        ii. Extract leading 3-digit integers. Take max. Add 1. Zero-pad to 3 digits.
            If none, NNN = "001".
        iii. git mv docs/in-progress/{slug}/ docs/completed/{NNN}-{slug}/ in worktree.
        iv.  Commit: "chore(lifecycle): promote {slug} in-progress → completed ({NNN})"

   --- Phase 2: File rename ---
   b. List all files directly in docs/completed/{NNN}-{slug}/.
   c. For each file NOT already prefixed with "{NNN}-":
      - git mv {file} {NNN}-{file} in worktree.
   d. If any files were renamed:
      - Commit: "chore(lifecycle): rename docs in {NNN}-{slug} with NNN prefix"

   --- Phase 3: Internal reference update ---
   e. Build a rename map: { oldFilename → newFilename } for all files renamed in Phase 2.
   f. For each file in docs/completed/{NNN}-{slug}/:
      - Read file content.
      - Scan for markdown link patterns: /\[([^\]]*)\]\((\.\/)?(FILENAME)\)/g
        where FILENAME is an old filename from the rename map.
      - Replace matched targets with NNN-prefixed versions.
   g. If any files were modified:
      - git add + commit: "chore(lifecycle): update internal refs in {NNN}-{slug}"

   h. Push from worktree to origin/{featureBranch}.
   i. Return { featurePath: "docs/completed/{NNN}-{slug}/", promoted: true }.
3. finally:
   a. WorktreeManager.destroy(worktreePath).
```

**Regex for internal reference update (Phase 3):**

```typescript
// For each oldFilename in the rename map:
const escaped = oldFilename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = new RegExp(
  `(\\[[^\\]]*\\]\\()(\\.\\/)?(${escaped})(\\))`,
  "g"
);
// Replace group 3 with the NNN-prefixed filename
```

This matches `[text](oldFilename)` and `[text](./oldFilename)` per FSPEC-PR-01 BR-06. Per REQ-PR-04 v2.4, the following link formats are explicitly **out of scope** and are not matched by this regex: wiki-style links, reference-style links (`[text][ref]`), HTML `<a href="">` patterns, bare filename mentions in prose, absolute paths, and cross-feature references. These exclusions are intentional — the two in-scope patterns cover all link styles used in this project's documents.

### 5.3 WorktreeManager — Create / Destroy

**Create:**

```
1. Generate UUID: crypto.randomUUID().
2. worktreePath = `/tmp/ptah-wt-${uuid}/`
3. Run: git worktree add {worktreePath} {featureBranch}
   - If fails and worktreePath exists (UUID collision, negligible probability):
     Retry once with a new UUID. If second attempt fails, throw non-retryable error.
4. Register in WorktreeRegistry:
   { worktreePath, branch: featureBranch, workflowId, runId, activityId, createdAt: now() }
5. Return { path: worktreePath, branch: featureBranch }
```

**Destroy:**

```
1. Run: git worktree remove --force {worktreePath}
   - If fails: log error "[ptah:worktree] Failed to remove worktree {path}: {error}"
     Do NOT throw — this runs in a finally block.
2. Deregister from WorktreeRegistry.
```

### 5.4 Crash-Recovery Cleanup (Orchestrator Startup)

Per FSPEC-WT-01 (crash-recovery behavioral flow):

```
1. Run: git worktree list --porcelain. Parse output.
2. Exclude the main working tree (first entry — the repo root).
3. For each non-main worktree:
   a. Extract worktreePath.
   b. If path does not match /^\/tmp\/ptah-wt-/ → skip (not a Ptah-managed worktree).
   c. Check if any entry in activeExecutions matches this worktree.
      - Match is performed by checking the in-memory registry for worktreePath.
        Since the registry doesn't survive a crash, check by querying Temporal:
        for each execution in activeExecutions, check if any activity metadata
        references this worktreePath. If no match is found → dangling.
   d. If dangling:
      - Run: git worktree remove --force {worktreePath}
      - Log: "[ptah:startup] Pruned dangling worktree: {worktreePath}"
4. Run: git worktree prune (clean up stale admin files).
```

**Temporal unreachable fallback:** If the Temporal server query fails, log a warning and skip the cleanup sweep entirely. Do not prune worktrees that might be legitimately in use.

### 5.5 Updated Context Document Resolution

The existing `resolveContextDocuments` function currently constructs paths as `docs/{prefix}-{slug}/{prefix}-{docType}-{slug}.md`. This must change to use the resolved `featurePath` from workflow state.

**New signature and behavior:**

```typescript
export interface ContextResolutionContext {
  featureSlug: string;
  /** Resolved feature folder path from workflow state, e.g. "docs/in-progress/my-feature/" */
  featurePath: string;
  docsRoot?: string;  // kept for backward compat, but ignored when featurePath is set
}
```

**New resolution table — backlog and in-progress features (unnumbered):**

| Reference | Resolves To |
|-----------|-------------|
| `{feature}/overview` | `{featurePath}overview.md` |
| `{feature}/REQ` | `{featurePath}REQ-{slug}.md` |
| `{feature}/FSPEC` | `{featurePath}FSPEC-{slug}.md` |
| `{feature}/TSPEC` | `{featurePath}TSPEC-{slug}.md` |
| `{feature}/PLAN` | `{featurePath}PLAN-{slug}.md` |
| `{feature}/PROPERTIES` | `{featurePath}PROPERTIES-{slug}.md` |
| other (no `{feature}`) | passed through unchanged |

**Completed features (NNN-prefixed) — all document types including overview.md:**

| Reference | Resolves To |
|-----------|-------------|
| `{feature}/overview` | `{featurePath}{NNN}-overview.md` |
| `{feature}/REQ` | `{featurePath}{NNN}-REQ-{slug}.md` |
| `{feature}/FSPEC` | `{featurePath}{NNN}-FSPEC-{slug}.md` |
| `{feature}/TSPEC` | `{featurePath}{NNN}-TSPEC-{slug}.md` |
| `{feature}/PLAN` | `{featurePath}{NNN}-PLAN-{slug}.md` |
| `{feature}/PROPERTIES` | `{featurePath}{NNN}-PROPERTIES-{slug}.md` |
| other (no `{feature}`) | passed through unchanged |

The NNN prefix is extracted from the folder name in `featurePath`. Per FSPEC-PR-01 Phase 2, **all** files in a completed folder are renamed with the NNN prefix — this includes `overview.md`. The resolution logic applies the NNN prefix uniformly to every document type when the feature is in `completed/`:

```
if featurePath starts with "docs/completed/":
  extract NNN from folder name (e.g., "015" from "docs/completed/015-my-feature/")
  {feature}/overview → {featurePath}{NNN}-overview.md
  {feature}/REQ     → {featurePath}{NNN}-REQ-{slug}.md
  (same pattern for all document types)
else:
  {feature}/overview → {featurePath}overview.md
  {feature}/REQ     → {featurePath}REQ-{slug}.md
  (no NNN prefix)
```

### 5.6 Updated Cross-Review Path Construction

The `crossReviewPath` function currently returns `docs/${featureSlug}/CROSS-REVIEW-...`. It must accept the resolved feature path:

```typescript
export function crossReviewPath(
  featurePath: string,  // Changed: was featureSlug
  skillName: string,
  documentType: string,
): string {
  return `${featurePath}CROSS-REVIEW-${skillName}-${documentType}.md`;
}
```

Callers pass `state.featurePath` (e.g., `"docs/in-progress/my-feature/"`) instead of the bare slug. The line in `feature-lifecycle.ts:1076` changes from:

```typescript
// Before
.map((id) => `docs/${state.featureSlug}/CROSS-REVIEW-${id}-${creationPhase.id}.md`)
// After
.map((id) => `${state.featurePath}CROSS-REVIEW-${id}-${creationPhase.id}.md`)
```

### 5.7 Sign-Off Detection for Completion Promotion

Per FSPEC-PR-01 (in-progress→completed behavioral flow):

The workflow tracks sign-offs in `state.signOffs`. When a skill activity returns an LGTM signal, the workflow records the agent ID.

```
1. After each skill activity completes with routingSignalType === "LGTM":
   a. state.signOffs[agentId] = currentTimestamp
2. Check completion condition:
   a. requiredSignOffs = ["qa", "pm"]  (test-engineer and product-manager agent IDs)
   b. if every requiredSignOffs is present in state.signOffs:
      → Execute promoteInProgressToCompleted activity
      → Update state.featurePath with result
```

**`continue-as-new` handling:** Per FSPEC-PR-01 BR-07, `state.signOffs` must be explicitly passed in the `continue-as-new` payload. The `buildInitialWorkflowState` function initializes `signOffs` from the CAN payload when present, otherwise initializes to `{}`.

### 5.8 Pre-Invocation Backlog Promotion

Per FSPEC-PR-01 (backlog→in-progress behavioral flow, orchestrator-first model):

Before invoking any engineer or tech-lead skill, the workflow:

```
1. Resolve feature path via FeatureResolver.
2. If lifecycle === "backlog":
   a. Execute promoteBacklogToInProgress activity.
   b. Update state.featurePath with result.
3. If lifecycle === "completed":
   a. Log warning: "Feature {slug} is already completed."
4. Store featurePath in workflow state.
5. Proceed to invoke the skill activity with the resolved featurePath.
```

This detection runs within the workflow function before dispatching the `invokeSkill` activity. Since `FeatureResolver.resolve()` is an I/O operation, it is called inside an activity (a thin `resolveFeaturePath` activity), not directly in the workflow.

### 5.9 Migration Script

Per FSPEC-MG-01:

```typescript
// src/commands/migrate-lifecycle.ts

export interface MigrateLifecycleResult {
  completedMoved: number;
  inProgressMoved: number;
  committed: boolean;
}

export class MigrateLifecycleCommand {
  constructor(
    private gitClient: GitClient,
    private fs: FileSystem,
    private logger: Logger,
  ) {}

  async execute(): Promise<MigrateLifecycleResult> {
    // See algorithm below
  }
}
```

Algorithm:

```
1. PRE-FLIGHT:
   a. Verify docs/ exists. Exit 1 if not.
   b. Verify working tree is clean (git status --short). Exit 1 if dirty.
   c. Verify docs/backlog/, docs/in-progress/, docs/completed/ are empty or don't exist.
      Exit 1 if any contain files.

2. CREATE LIFECYCLE DIRECTORIES:
   a. mkdir -p docs/backlog docs/in-progress docs/completed
   b. Create .gitkeep in each.

3. MIGRATE COMPLETED FEATURES:
   a. Scan docs/ for folders matching /^[0-9]{3}-/. Sort ascending.
   b. For each: git mv docs/{NNN}-{slug}/ docs/completed/{NNN}-{slug}/

4. MIGRATE IN-PROGRESS FEATURES:
   a. Scan docs/ for remaining directories (exclude requirements/, templates/,
      open-questions/, backlog/, in-progress/, completed/, and non-directory entries).
      Note: All NNN-prefixed folders were already moved to docs/completed/ in Step 3.
      Any remaining directories are unnumbered feature folders.
   b. For each remaining directory:
      - git mv docs/{slug}/ docs/in-progress/{slug}/

5. COMMIT:
   a. git add -A docs/
   b. git commit -m "chore(migration): reorganize docs/ into lifecycle folders
      (backlog/in-progress/completed)"

6. PRINT SUMMARY.
```

---

## 6. Error Handling

| Scenario | Error Type | Behavior | Exit Code |
|----------|-----------|----------|-----------|
| Feature slug not found in any lifecycle folder | `ApplicationFailure.nonRetryable` | Activity fails. Workflow enters failed state. User notified. | — |
| `git mv` fails (source doesn't exist) | `ApplicationFailure.nonRetryable` | Activity fails permanently. No retry. | — |
| `git push` fails (remote conflict) | `ApplicationFailure` (retryable) | Temporal retry policy applies. Idempotency checks protect against duplicate work. | — |
| `git worktree add` fails | `ApplicationFailure.nonRetryable` | Skill not invoked. User notified. | — |
| `git worktree remove` fails in finally | Logged, not thrown | Dangling worktree pruned on next startup. | — |
| `docs/completed/` unreadable (FS error) | `ApplicationFailure.nonRetryable` | Completion promotion fails. User investigates. | — |
| Internal ref update parse error | Logged as warning | File skipped. Promotion continues — structural move is more important. | — |
| Temporal server unreachable during startup cleanup | Logged as warning | Cleanup sweep skipped. Retried on next startup. | — |
| Migration: working tree not clean | Logged + exit | No changes made. | 1 |
| Migration: lifecycle folder already non-empty | Logged + exit | No changes made. | 1 |
| Migration: `git mv` fails | Logged + exit | Partial state — developer inspects `git status`. | 1 |
| Migration: file-rename conflict (duplicate name) | Logged + exit | Manual intervention required. | 1 |

---

## 7. Test Strategy

### 7.1 Approach

All new modules follow TDD (Red → Green → Refactor). Dependencies are injected via constructor parameters. External I/O (filesystem, git, Temporal) is faked in unit tests.

### 7.2 Test Doubles

#### FakeFeatureResolver

```typescript
export class FakeFeatureResolver implements FeatureResolver {
  private results = new Map<string, FeatureResolverResult>();
  resolveCalls: Array<{ slug: string; worktreeRoot: string }> = [];

  /** Pre-configure a result for a given slug */
  setResult(slug: string, result: FeatureResolverResult): void {
    this.results.set(slug, result);
  }

  async resolve(slug: string, worktreeRoot: string): Promise<FeatureResolverResult> {
    this.resolveCalls.push({ slug, worktreeRoot });
    const result = this.results.get(slug);
    if (result) return result;
    return { found: false, slug };
  }
}
```

#### FakeWorktreeManager

```typescript
export class FakeWorktreeManager implements WorktreeManager {
  createCalls: Array<{ featureBranch: string; workflowId: string; runId: string; activityId: string }> = [];
  destroyCalls: string[] = [];
  cleanupCalls: Set<string>[] = [];
  worktreeCounter = 0;

  async create(featureBranch: string, workflowId: string, runId: string, activityId: string): Promise<WorktreeHandle> {
    this.createCalls.push({ featureBranch, workflowId, runId, activityId });
    this.worktreeCounter++;
    return { path: `/tmp/ptah-wt-fake-${this.worktreeCounter}/`, branch: featureBranch };
  }

  async destroy(worktreePath: string): Promise<void> {
    this.destroyCalls.push(worktreePath);
  }

  async cleanupDangling(activeExecutions: Set<string>): Promise<void> {
    this.cleanupCalls.push(activeExecutions);
  }
}
```

### 7.3 Test Categories

| # | Test Category | Test File | Focus |
|---|---------------|-----------|-------|
| 1 | Feature resolver — unit | `tests/unit/orchestrator/feature-resolver.test.ts` | Search order, slug matching, NNN stripping, not-found, multi-match warning, FS errors |
| 2 | Promotion backlog→IP — unit | `tests/unit/orchestrator/promotion-activity.test.ts` | Normal flow, idempotent skip, not-found error, git mv + commit + push calls |
| 3 | Promotion IP→completed — unit | `tests/unit/orchestrator/promotion-activity.test.ts` | NNN assignment, folder move, file rename, internal ref update, Phase 1/2 idempotency, NNN gap handling |
| 4 | WorktreeManager — unit | `tests/unit/orchestrator/worktree-manager.test.ts` | Create (UUID path, registry), destroy (force remove, deregister), cleanup (pruning, skip non-ptah worktrees) |
| 5 | Context resolution — unit | `tests/unit/temporal/feature-lifecycle.test.ts` | Updated resolveContextDocuments with lifecycle-aware paths, completed NNN-prefix handling |
| 6 | Cross-review path — unit | `tests/unit/orchestrator/cross-review-parser.test.ts` | Updated crossReviewPath with featurePath parameter |
| 7 | Sign-off detection — unit | `tests/unit/temporal/feature-lifecycle.test.ts` | signOffs accumulation, completion condition, CAN carry-forward |
| 8 | Workflow state — unit | `tests/unit/temporal/feature-lifecycle.test.ts` | buildInitialWorkflowState with new fields (featurePath, worktreeRoot, signOffs) |
| 9 | Migration — unit | `tests/unit/commands/migrate-lifecycle.test.ts` | Pre-flight checks, completed/in-progress classification, NNN stripping, .gitkeep creation |
| 10 | Promotion pipeline — integration | `tests/integration/orchestrator/promotion-pipeline.test.ts` | Real FS + real git: create folders, run promotion, verify git mv history preserved |
| 11 | Migration — integration | `tests/integration/commands/migrate-lifecycle.test.ts` | Real FS + real git: create repo structure, run migration, verify results |

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-FS-01 | Migration script, `.gitkeep` files | Creates `backlog/`, `in-progress/`, `completed/` under `docs/` |
| REQ-FS-02 | FeatureResolver, PM skill update | Backlog features resolved without NNN prefix |
| REQ-FS-03 | FeatureResolver, promotion activity | In-progress features resolved without NNN prefix |
| REQ-FS-04 | promoteInProgressToCompleted, FeatureResolver | Completed features get NNN prefix on folder and files |
| REQ-PR-01 | promoteBacklogToInProgress activity | `git mv` from backlog to in-progress, no NNN |
| REQ-PR-02 | promoteInProgressToCompleted activity | `git mv` + NNN assignment + file rename |
| REQ-PR-03 | promoteInProgressToCompleted (NNN calculation) | `max(existing NNN) + 1`, zero-padded |
| REQ-PR-04 | promoteInProgressToCompleted Phase 3 | Regex-based markdown link update for renamed files |
| REQ-PR-05 | Both promotion activities | All moves use `git mv` for history preservation |
| REQ-SK-01 | PM skill SKILL.md Phase 0 algorithm update (§9.2.1) | Phase 0 bootstrap creates folders under `docs/backlog/{feature-slug}/`, removes NNN assignment logic entirely |
| REQ-SK-02 | FeatureResolver.resolve() | Search order: in-progress → backlog → completed with NNN stripping |
| REQ-SK-03 | Workflow pre-invocation logic | Orchestrator detects backlog, runs promotion before skill invocation |
| REQ-SK-04 | Workflow sign-off detection | Orchestrator detects dual LGTM, runs completion promotion |
| REQ-SK-05 | SKILL.md updates (all four) | File Organization sections document lifecycle folders |
| REQ-SK-06 | FeatureResolver protocol + DefaultFeatureResolver | Single service, behavioral contract per FSPEC-SK-01 |
| REQ-SK-07 | FeatureWorkflowState.featurePath | Activities read resolved path from state, don't re-resolve |
| REQ-SK-08 | Promotion activities + workflow orchestration | Skills never run `git mv`; orchestrator owns promotion execution |
| REQ-MG-01 | MigrateLifecycleCommand step 2 | Creates three lifecycle directories with .gitkeep |
| REQ-MG-02 | MigrateLifecycleCommand step 3 | Moves numbered folders to `docs/completed/` |
| REQ-MG-03 | MigrateLifecycleCommand step 4 | Moves active features to `docs/in-progress/`, strips NNN prefix |
| REQ-MG-04 | MigrateLifecycleCommand step 5 | Skips `requirements/`, `templates/`, `open-questions/` |
| REQ-WT-01 | WorktreeManager.create() | Each skill invocation gets a dedicated worktree |
| REQ-WT-02 | WorktreeManager (create, destroy, cleanupDangling) | Full worktree lifecycle management + crash recovery |
| REQ-WT-03 | FeatureResolver.resolve(slug, worktreeRoot) | Resolver accepts and searches under worktree root |
| REQ-WT-04 | FeatureWorkflowState.worktreeRoot + featurePath | Both stored separately in workflow state |
| REQ-WT-05 | Promotion activities use WorktreeManager.create() | Fresh worktree per promotion activity |
| REQ-NF-01 | All git mv calls in promotions and migration | `git mv` preserves `git log --follow` |
| REQ-NF-02 | Two-phase idempotency in promoteInProgressToCompleted | Phase 1 checks folder, Phase 2 checks per-file prefix |
| REQ-NF-03 | FeatureResolver fallback search | Resolver searches old `docs/{NNN}-{slug}/` as part of completed search |

---

## 9. Integration Points

### 9.1 Existing Code Modifications

| File | Line(s) | Current Behavior | New Behavior |
|------|---------|-----------------|--------------|
| `src/orchestrator/pdlc/cross-review-parser.ts` | 154–159 | `crossReviewPath(featureSlug, ...)` → `docs/${featureSlug}/CROSS-REVIEW-...` | `crossReviewPath(featurePath, ...)` → `${featurePath}CROSS-REVIEW-...` |
| `src/temporal/workflows/feature-lifecycle.ts` | 1076 | `.map((id) => \`docs/${state.featureSlug}/CROSS-REVIEW-...\`)` | `.map((id) => \`${state.featurePath}CROSS-REVIEW-...\`)` |
| `src/temporal/workflows/feature-lifecycle.ts` | 42–46 | `ContextResolutionContext` with `featurePrefix` | Replace `featurePrefix` with `featurePath` |
| `src/temporal/workflows/feature-lifecycle.ts` | 74–101 | `resolveContextDocuments` uses `{prefix}-{slug}` pattern | Uses `featurePath` directly from state |
| `src/temporal/types.ts` | 81–96 | `FeatureWorkflowState` without lifecycle fields | Add `featurePath`, `worktreeRoot`, `signOffs` |
| `src/temporal/activities/skill-activity.ts` | 97–98 | Worktree path constructed inline | Delegate to `WorktreeManager.create()` |
| `src/orchestrator/worktree-registry.ts` | 1–31 | `ActiveWorktree` with only `path` + `branch` | Add `workflowId`, `runId`, `activityId`, `createdAt` |
| `src/services/git.ts` | 8–47 | `GitClient` interface | Add `gitMvInWorktree`, `listDirInWorktree` |
| `src/services/filesystem.ts` | 4–22 | `FileSystem` interface | Add `readDirMatching` |
| `src/commands/start.ts` | composition root | No resolver or worktree manager | Wire `DefaultFeatureResolver` + `DefaultWorktreeManager` |

### 9.2 Skill File Updates (REQ-SK-01, REQ-SK-05)

#### 9.2.1 PM SKILL.md — Phase 0 Algorithm Changes

The PM SKILL.md Phase 0 (Feature Folder Bootstrap) hardcodes `docs/{feature-slug}` and `docs/{full-folder-name}` paths. These must be updated to create features in `docs/backlog/`. Additionally, the NNN prefix assignment logic is removed entirely — backlog features are always unnumbered.

**Step 3 — Check for existing folder:**

```bash
# Before:
test -d docs/{feature-slug} && echo "EXISTS" || echo "NOT_FOUND"

# After:
test -d docs/backlog/{feature-slug} && echo "EXISTS" || echo "NOT_FOUND"
```

Also add a secondary check across all lifecycle folders using the feature resolver search order (in-progress → backlog → completed) to detect the feature even if it has been promoted. If found in any folder, skip bootstrap.

**Step 4 — Determine NNN prefix: REMOVE ENTIRELY.**

The entire Step 4 (both Condition A and Condition B) is removed. New features in backlog are unnumbered. The `full-folder-name` variable is replaced by `feature-slug` in all subsequent steps. NNN assignment only happens during the orchestrator's in-progress→completed promotion activity.

**Step 5 — Log:**

```
# Before:
[ptah:pm] Bootstrapping feature folder: docs/{full-folder-name}/

# After:
[ptah:pm] Bootstrapping feature folder: docs/backlog/{feature-slug}/
```

**Step 6 — Create feature folder:**

```bash
# Before:
mkdir -p docs/{full-folder-name}

# After:
mkdir -p docs/backlog/{feature-slug}
```

**Step 7 — Synthesize overview.md content:**

The title line derivation changes: replace hyphens in `feature-slug` (not `full-folder-name`) with spaces, then title-case. Since there is no NNN prefix, the title is cleaner (e.g., `"feature-lifecycle-folders"` → `# Feature Lifecycle Folders`).

**Step 8 — Write overview.md:**

```bash
# Before:
test -f docs/{full-folder-name}/overview.md && echo "EXISTS" || echo "NOT_FOUND"
# Write to: docs/{full-folder-name}/overview.md

# After:
test -f docs/backlog/{feature-slug}/overview.md && echo "EXISTS" || echo "NOT_FOUND"
# Write to: docs/backlog/{feature-slug}/overview.md
```

**Idempotency scope note (Step 3):** The existing caveat about unnumbered threads and NNN-prefix mismatch (AF-R8) is no longer relevant — since no NNN is ever assigned in Phase 0, `feature-slug` is always the folder name, and the Step 3 existence check reliably detects the folder on every subsequent invocation.

#### 9.2.2 All Skill Document Path References

Beyond Phase 0, the PM SKILL.md and the other three SKILL.md files reference `docs/{NNN}-{feature-name}/` paths in their task descriptions (Create REQ, Create FSPEC, Review, etc.). These path templates must be updated:

- `docs/{NNN}-{feature-name}/{NNN}-REQ-{feature-name}.md` → `docs/{lifecycle}/{feature-slug}/REQ-{feature-slug}.md` (for backlog/in-progress) or `docs/completed/{NNN}-{feature-slug}/{NNN}-REQ-{feature-slug}.md` (for completed)
- All skills should note that the feature folder path is provided by the orchestrator via workflow state — skills should not construct lifecycle paths independently.

#### 9.2.3 File Organization Section Updates (All Four Skills)

All four SKILL.md files have a "File Organization" or "Working with Project Documentation" section that documents the `docs/` structure. Each must be updated to show:

```
docs/
├── backlog/
│   └── {feature-slug}/           # Unnumbered — features not yet started
│       ├── overview.md
│       ├── REQ-{feature-slug}.md
│       └── ...
├── in-progress/
│   └── {feature-slug}/           # Unnumbered — features actively being worked on
│       ├── overview.md
│       ├── REQ-{feature-slug}.md
│       ├── FSPEC-{feature-slug}.md
│       └── ...
├── completed/
│   └── {NNN}-{feature-slug}/     # NNN-prefixed — completed features
│       ├── {NNN}-overview.md
│       ├── {NNN}-REQ-{feature-slug}.md
│       └── ...
├── requirements/
├── templates/
└── open-questions/
```

The document naming convention table must note:
- Backlog and in-progress: files are unnumbered (e.g., `REQ-my-feature.md`)
- Completed: ALL files are NNN-prefixed, including `overview.md` (e.g., `015-overview.md`, `015-REQ-my-feature.md`)
- NNN is assigned only upon promotion to completed

### 9.3 Backward Compatibility (REQ-NF-03)

The `FeatureResolver` does not natively search the old flat `docs/{NNN}-{slug}/` layout. However, the `completed/` search already matches `docs/completed/{NNN}-{slug}/`, which is where the migration moves old numbered folders. A skill encountering a pre-migration repository will not find the feature via the resolver. This is acceptable because:

1. The migration runs before any skill invocations under the new system.
2. As a safety fallback, if the resolver returns `{ found: false }`, the workflow can check the legacy path `docs/{featureSlug}/` (or `docs/*-{featureSlug}/`) as a last resort. This fallback is low-priority (REQ-NF-03 is P2) and can be implemented as a simple `fs.exists` check appended to the resolver's search order.

---

## 10. Open Questions

| # | Question | Impact | Proposed Resolution |
|---|----------|--------|---------------------|
| OQ-01 | Should the `FeatureResolver` be callable from within the Temporal Workflow function (deterministic), or only from Activities? | Workflow determinism. `FeatureResolver.resolve()` does filesystem I/O, which violates Temporal's determinism requirement. | **Resolution:** Wrap `resolve()` in a thin `resolveFeaturePath` Temporal activity. The workflow calls this activity, then stores the result in state. All subsequent activities read from state. This is already designed in §5.8. |
| OQ-02 | How does the `listDirInWorktree` method on `GitClient` handle the `docs/completed/` directory in the main working tree vs. a worktree? | Path correctness. | **Resolution:** `listDirInWorktree` takes the worktree root as an argument and constructs the absolute path: `path.join(worktreeRoot, dirPath)`. It uses `fs.readdir`, not a git command. This ensures it reads the worktree's view of the filesystem, not the main tree. |
| OQ-03 | For `continue-as-new`, which fields of the updated `FeatureWorkflowState` must be carried forward? | State loss across CAN boundaries. | **Resolution:** `featurePath`, `worktreeRoot` (reset to `null` — new run gets new worktree), and `signOffs` must be carried. `worktreeRoot` is nulled because each run creates its own worktrees. `signOffs` is carried per FSPEC-PR-01 BR-07. |

---

## 11. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 3, 2026 | Engineer | Initial technical specification |
| 1.1 | April 4, 2026 | Engineer | Address PM cross-review of TSPEC v1.0. F-01 (High): expanded §9.2 with detailed PM SKILL.md Phase 0 algorithm changes — Steps 3, 4 (removed), 5, 6, 7, 8 updated to use `docs/backlog/{feature-slug}/` paths, NNN assignment removed entirely. F-02 (Medium): fixed §5.5 context resolution table — NNN-prefix now explicitly applied to ALL document types including `overview.md` for completed features, with separate tables for unnumbered vs. completed. F-03 (Low): removed dead "If has NNN prefix" branch from §5.9 migration Step 4 — all NNN-prefixed folders are handled by Step 3. Updated §8 REQ-SK-01 mapping to reference Phase 0 changes. |
| 1.2 | April 4, 2026 | Engineer | Sync with REQ v2.4 (test-engineer cross-review updates). Added explicit out-of-scope link format note in §5.2.2 Phase 3 regex section per REQ-PR-04 v2.4 (wiki-style, reference-style, HTML `<a>` patterns). No structural changes required — all v2.4 acceptance criteria expansions (REQ-PR-01, REQ-PR-03, REQ-SK-02, REQ-SK-08, REQ-NF-02) were already covered by the existing TSPEC design. |

---

*End of Document*
