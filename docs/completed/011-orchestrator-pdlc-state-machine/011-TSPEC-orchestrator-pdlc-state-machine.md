# Technical Specification

## Orchestrator-Driven PDLC State Machine

| Field | Detail |
|-------|--------|
| **Document ID** | TSPEC-011 |
| **Requirements** | [011-REQ-orchestrator-pdlc-state-machine](011-REQ-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Functional Specification** | [011-FSPEC-orchestrator-pdlc-state-machine](011-FSPEC-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Date** | March 14, 2026 |
| **Version** | 1.2 |
| **Status** | Approved |

---

## 1. Summary

This TSPEC defines the implementation of a deterministic PDLC state machine within the Ptah orchestrator. The state machine replaces the current LLM-driven workflow logic embedded in SKILL.md files with TypeScript code that enforces phase ordering, tracks review approvals, computes reviewer sets based on feature discipline, and persists state to disk for crash recovery.

The architecture follows the pure-function reducer pattern: `transition(state, event) → { newState, sideEffects }`. All I/O (persistence, agent dispatch) is separated from the state transition logic, making the core state machine trivially unit-testable without mocks.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Existing project runtime |
| Language | TypeScript 5.x (ESM) | Existing project language |
| Test framework | Vitest | Existing project test framework |
| State persistence | JSON file + `node:fs/promises` | REQ-SM-05, C-02: file-based, no external databases |
| Atomic writes | `writeFile` to `.tmp` + `rename` | REQ-SM-NF-02: crash-safe persistence |
| New dependencies | None | All functionality built with Node.js standard library |

---

## 3. Project Structure

```
ptah/
├── src/
│   ├── orchestrator/
│   │   ├── pdlc/                              [NEW directory]
│   │   │   ├── phases.ts                      [NEW] Phase enum, event types, feature state types
│   │   │   ├── state-machine.ts               [NEW] Pure transition function
│   │   │   ├── state-store.ts                 [NEW] StateStore protocol + FileStateStore
│   │   │   ├── review-tracker.ts              [NEW] Reviewer manifest computation + status evaluation
│   │   │   ├── cross-review-parser.ts         [NEW] Approval detection from markdown files
│   │   │   ├── context-matrix.ts              [NEW] Phase-aware document selection
│   │   │   ├── pdlc-dispatcher.ts             [NEW] PdlcDispatcher protocol + DefaultPdlcDispatcher
│   │   │   └── migrations.ts                  [NEW] State schema migration infrastructure
│   │   ├── orchestrator.ts                    [UPDATED] Integrate PdlcDispatcher into routing loop
│   │   └── context-assembler.ts               [UPDATED] Support phase-aware context via context-matrix
│   ├── types.ts                               [UPDATED] Add PDLC types
│   └── services/
│       └── filesystem.ts                      [UPDATED] Add rename() method for atomic writes
├── state/                                     [NEW directory, .gitignore'd]
│   └── pdlc-state.json                        [NEW] Persisted PDLC state (runtime artifact)
├── tests/
│   ├── unit/
│   │   └── orchestrator/
│   │       └── pdlc/                          [NEW directory]
│   │           ├── state-machine.test.ts      [NEW]
│   │           ├── state-store.test.ts        [NEW]
│   │           ├── review-tracker.test.ts     [NEW]
│   │           ├── cross-review-parser.test.ts[NEW]
│   │           ├── context-matrix.test.ts     [NEW]
│   │           ├── pdlc-dispatcher.test.ts    [NEW]
│   │           └── migrations.test.ts         [NEW]
│   ├── integration/
│   │   └── orchestrator/
│   │       └── pdlc-lifecycle.test.ts         [NEW] End-to-end PDLC phase progression
│   └── fixtures/
│       └── factories.ts                       [UPDATED] Add PDLC fakes and factories
└── .gitignore                                 [UPDATED] Add state/ directory
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
orchestrator.ts
  ├── pdlcDispatcher: PdlcDispatcher         [NEW dependency]
  ├── routingEngine: RoutingEngine            [EXISTING, used for unmanaged features]
  ├── contextAssembler: ContextAssembler      [EXISTING, updated]
  └── (all other existing dependencies)

PdlcDispatcher (pdlc-dispatcher.ts)
  ├── stateMachine module (state-machine.ts)  [pure functions, imported directly]
  ├── stateStore: StateStore                  [injected protocol]
  ├── reviewTracker module (review-tracker.ts)[pure functions, imported directly]
  ├── crossReviewParser module (cross-review-parser.ts) [pure function, imported directly]
  ├── contextMatrix module (context-matrix.ts)[pure function, imported directly]
  ├── fs: FileSystem                          [injected protocol]
  └── logger: Logger                          [injected protocol]

StateStore (state-store.ts)
  ├── fs: FileSystem                          [injected protocol]
  └── logger: Logger                          [injected protocol]

ContextAssembler (context-assembler.ts) [UPDATED]
  ├── contextMatrix module (context-matrix.ts)[pure function, imported directly]
  └── (all existing dependencies)
```

### 4.2 Types and Data Models

All new types are defined in `ptah/src/orchestrator/pdlc/phases.ts`:

```typescript
// --- Phase Enumeration (REQ-SM-01) ---

export enum PdlcPhase {
  REQ_CREATION = "REQ_CREATION",
  REQ_REVIEW = "REQ_REVIEW",
  REQ_APPROVED = "REQ_APPROVED",
  FSPEC_CREATION = "FSPEC_CREATION",
  FSPEC_REVIEW = "FSPEC_REVIEW",
  FSPEC_APPROVED = "FSPEC_APPROVED",
  TSPEC_CREATION = "TSPEC_CREATION",
  TSPEC_REVIEW = "TSPEC_REVIEW",
  TSPEC_APPROVED = "TSPEC_APPROVED",
  PLAN_CREATION = "PLAN_CREATION",
  PLAN_REVIEW = "PLAN_REVIEW",
  PLAN_APPROVED = "PLAN_APPROVED",
  PROPERTIES_CREATION = "PROPERTIES_CREATION",
  PROPERTIES_REVIEW = "PROPERTIES_REVIEW",
  PROPERTIES_APPROVED = "PROPERTIES_APPROVED",
  IMPLEMENTATION = "IMPLEMENTATION",
  IMPLEMENTATION_REVIEW = "IMPLEMENTATION_REVIEW",
  DONE = "DONE",
}

// --- Feature Configuration (REQ-FC-01) ---

export type Discipline = "backend-only" | "frontend-only" | "fullstack";

export interface FeatureConfig {
  discipline: Discipline;
  skipFspec: boolean;
}

// --- Event Types (FSPEC-SM-01) ---

export type PdlcEvent =
  | { type: "lgtm"; agentId: string }
  | { type: "subtask_complete"; agentId: string }
  | { type: "review_submitted"; reviewerKey: string; recommendation: ReviewRecommendation }
  | { type: "auto" };

export type ReviewRecommendation = "approved" | "revision_requested";

// --- Reviewer Status (FSPEC-RT-02) ---

export type ReviewerStatus = "pending" | "approved" | "revision_requested";

export interface ReviewPhaseState {
  reviewerStatuses: Record<string, ReviewerStatus>;  // key: agentId or "agentId:scope"
  revisionCount: number;
}

// --- Fork/Join State (FSPEC-SM-01) ---

export type SubTaskStatus = "pending" | "complete";

export interface ForkJoinState {
  subtasks: Record<string, SubTaskStatus>;  // key: agentId
}

// --- Per-Feature State (REQ-SM-02) ---

export interface FeatureState {
  slug: string;
  phase: PdlcPhase;
  config: FeatureConfig;
  reviewPhases: Partial<Record<PdlcPhase, ReviewPhaseState>>;
  forkJoin: ForkJoinState | null;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  completedAt: string | null;  // ISO 8601, set when phase = DONE
}

// --- Persisted State File (REQ-SM-05, REQ-SM-10) ---

export interface PdlcStateFile {
  version: number;
  features: Record<string, FeatureState>;  // key: feature slug
}

// --- Transition Result ---

export interface TransitionResult {
  newState: FeatureState;
  sideEffects: SideEffect[];
}

export type SideEffect =
  | { type: "dispatch_agent"; agentId: string; taskType: TaskType; documentType: DocumentType }
  | { type: "dispatch_reviewers"; reviewerKeys: string[] }
  | { type: "pause_feature"; reason: string; message: string }
  | { type: "log_warning"; message: string }
  | { type: "auto_transition" };

export type TaskType = "Create" | "Review" | "Revise" | "Resubmit" | "Implement";
export type DocumentType = "REQ" | "FSPEC" | "TSPEC" | "PLAN" | "PROPERTIES" | "";

// --- Reviewer Manifest Entry (FSPEC-FC-01) ---

export interface ReviewerManifestEntry {
  agentId: string;
  scope?: string;  // e.g., "be_tspec", "fe_tspec" for fullstack multi-document reviews
}

// --- Context Document Set (FSPEC-CA-01) ---

export interface ContextDocument {
  type: "overview" | "req" | "fspec" | "tspec" | "plan" | "properties" | "cross_review";
  relativePath: string;  // relative to feature docs folder
  required: boolean;
}

export interface ContextDocumentSet {
  documents: ContextDocument[];
}

// --- Dispatch Result (from PdlcDispatcher) ---

export type DispatchAction =
  | { action: "dispatch"; agents: AgentDispatch[] }
  | { action: "retry_agent"; reason: string; message: string }
  | { action: "pause"; reason: string; message: string }
  | { action: "done" }
  | { action: "wait" };

export interface AgentDispatch {
  agentId: string;
  taskType: TaskType;
  documentType: DocumentType;
  contextDocuments: ContextDocumentSet;
}

// --- Parsed Recommendation (FSPEC-RT-01) ---

export type ParsedRecommendation =
  | { status: "approved" }
  | { status: "revision_requested" }
  | { status: "parse_error"; reason: string; rawValue?: string };
```

### 4.3 Protocols (Interfaces)

#### 4.3.1 StateStore

**File:** `ptah/src/orchestrator/pdlc/state-store.ts`

```typescript
/**
 * Protocol for PDLC state persistence.
 *
 * Behavioral contract:
 * - load() returns the current state file, or initializes fresh state if no file exists.
 * - save() atomically persists the state (write to .tmp, then rename).
 * - If load() encounters a corrupted or incompatible file, it initializes fresh state.
 *
 * Design rationale:
 * Separated from the state machine to keep transitions pure.
 * The orchestrator calls save() after every transition, and load() on startup.
 */
export interface StateStore {
  load(): Promise<PdlcStateFile>;
  save(state: PdlcStateFile): Promise<void>;
}
```

#### 4.3.2 PdlcDispatcher

**File:** `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts`

```typescript
/**
 * Protocol for orchestrator-driven PDLC state management.
 *
 * Behavioral contract:
 * - isManaged() checks whether a feature has a state record (managed by PDLC state machine).
 * - initializeFeature() creates a new state record and persists it.
 * - processAgentCompletion() handles an agent's LGTM/TASK_COMPLETE signal for a creation phase.
 * - processReviewCompletion() handles a reviewer's cross-review result for a review phase.
 * - getNextAction() determines what the orchestrator should do next for a feature in its current phase.
 * - getFeatureState() returns the current state for a feature.
 *
 * Design rationale:
 * This is the integration layer between the pure state machine and the orchestrator.
 * It combines state transitions, persistence, review tracking, cross-review parsing,
 * and context assembly into a single coherent interface that the orchestrator consumes.
 */
export interface PdlcDispatcher {
  /** Check if a feature is managed by the PDLC state machine */
  isManaged(featureSlug: string): Promise<boolean>;

  /** Get current state for a feature, or null if unmanaged */
  getFeatureState(featureSlug: string): Promise<FeatureState | null>;

  /** Initialize a new feature with the given configuration */
  initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState>;

  /** Process an agent's completion signal (LGTM or TASK_COMPLETE) for a creation/implementation phase */
  processAgentCompletion(params: {
    featureSlug: string;
    agentId: string;
    signal: "LGTM" | "TASK_COMPLETE";
    worktreePath: string;
  }): Promise<DispatchAction>;

  /** Process a reviewer's cross-review result */
  processReviewCompletion(params: {
    featureSlug: string;
    reviewerAgentId: string;
    reviewerScope?: string;
    worktreePath: string;
  }): Promise<DispatchAction>;

  /** Get the next action for a feature based on its current phase (used on startup recovery) */
  getNextAction(featureSlug: string): Promise<DispatchAction>;

  /** Resume a feature paused at the revision bound. Resets revision count and re-enters review. */
  processResumeFromBound(featureSlug: string): Promise<DispatchAction>;

  /** Load all state from disk (called on startup) */
  loadState(): Promise<void>;
}
```

#### 4.3.3 FileSystem Extension

**File:** `ptah/src/services/filesystem.ts` (UPDATED)

```typescript
// Add to existing FileSystem interface:
export interface FileSystem {
  // ... existing methods ...

  /** Atomically rename a file (used for atomic state writes) */
  rename(oldPath: string, newPath: string): Promise<void>;

  /** Copy a file (used for .bak backup on migration failure) */
  copyFile(src: string, dest: string): Promise<void>;
}
```

### 4.4 Concrete Implementations

#### 4.4.1 FileStateStore

**File:** `ptah/src/orchestrator/pdlc/state-store.ts`

```typescript
export class FileStateStore implements StateStore {
  constructor(
    private readonly fs: FileSystem,
    private readonly logger: Logger,
    private readonly statePath: string,     // e.g., "ptah/state/pdlc-state.json"
  ) {}
}
```

**Dependencies:** `FileSystem`, `Logger`

**Behavior:**
- `load()`: Read JSON file → validate schema version → migrate if needed → return state
- `save()`: Serialize → write to `.tmp` → rename to final path

#### 4.4.2 DefaultPdlcDispatcher

**File:** `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts`

```typescript
export class DefaultPdlcDispatcher implements PdlcDispatcher {
  constructor(
    private readonly stateStore: StateStore,
    private readonly fs: FileSystem,
    private readonly logger: Logger,
    private readonly docsRoot: string,       // e.g., "docs"
  ) {}
}
```

**Dependencies:** `StateStore`, `FileSystem`, `Logger`

**In-memory state:** `private state: PdlcStateFile | null = null` (loaded from disk on `loadState()`, cached in memory, written through on every mutation).

### 4.5 Composition Root Wiring

In the CLI entry point (`bin/ptah.ts`), add:

```typescript
// --- Phase 11: PDLC State Machine ---
const stateStore = new FileStateStore(fs, logger, "ptah/state/pdlc-state.json");
const pdlcDispatcher = new DefaultPdlcDispatcher(stateStore, fs, logger, config.docs.root);

// Add to OrchestratorDeps:
const orchestratorDeps: OrchestratorDeps = {
  // ... existing deps ...
  pdlcDispatcher,   // NEW
};
```

---

## 5. Module Specifications

### 5.1 State Machine (`state-machine.ts`)

**Pure function module — no class, no I/O, no injected dependencies.**

#### Exported Functions

```typescript
/** Create initial state for a new feature */
export function createFeatureState(slug: string, config: FeatureConfig, now: string): FeatureState;

/** Compute the next state given current state and event */
export function transition(state: FeatureState, event: PdlcEvent, now: string): TransitionResult;

/** List valid event types for a given phase and config */
export function validEventsForPhase(phase: PdlcPhase, config: FeatureConfig): string[];
```

#### Transition Map

The `transition()` function implements the following state machine:

| Current Phase | Event | Next Phase | Side Effects | Condition |
|---|---|---|---|---|
| `REQ_CREATION` | `lgtm` | `REQ_REVIEW` | `dispatch_reviewers` | — |
| `REQ_REVIEW` | `review_submitted(*)` | (see evaluation) | — | Per-reviewer update; no transition until all reviewers complete |
| `REQ_REVIEW` | (all complete, any rejected) | `REQ_CREATION` | `dispatch_agent(pm, Revise, REQ)` | revisionCount <= 3 |
| `REQ_REVIEW` | (all complete, any rejected) | (no change) | `pause_feature` | revisionCount > 3 |
| `REQ_REVIEW` | (all complete, all approved) | `REQ_APPROVED` | `auto_transition` | — |
| `REQ_APPROVED` | `auto` | `FSPEC_CREATION` or `TSPEC_CREATION` | `dispatch_agent` | skipFspec flag |
| `FSPEC_CREATION` | `lgtm` | `FSPEC_REVIEW` | `dispatch_reviewers` | — |
| `FSPEC_REVIEW` | `review_submitted(*)` | (same pattern as REQ_REVIEW) | — | — |
| `FSPEC_APPROVED` | `auto` | `TSPEC_CREATION` | `dispatch_agent` | — |
| `TSPEC_CREATION` | `lgtm` | `TSPEC_REVIEW` | `dispatch_reviewers` | Single-discipline |
| `TSPEC_CREATION` | `subtask_complete` | (update fork/join) | — | Fullstack, not all complete |
| `TSPEC_CREATION` | `subtask_complete` | `TSPEC_REVIEW` | `dispatch_reviewers` | Fullstack, all complete |
| `TSPEC_REVIEW` | `review_submitted(*)` | (same pattern) | — | — |
| `TSPEC_APPROVED` | `auto` | `PLAN_CREATION` | `dispatch_agent` | — |
| `PLAN_CREATION` | (same as TSPEC_CREATION) | — | — | — |
| `PLAN_REVIEW` | `review_submitted(*)` | (same pattern) | — | — |
| `PLAN_APPROVED` | `auto` | `PROPERTIES_CREATION` | `dispatch_agent(qa)` | — |
| `PROPERTIES_CREATION` | `lgtm` | `PROPERTIES_REVIEW` | `dispatch_reviewers` | — |
| `PROPERTIES_REVIEW` | `review_submitted(*)` | (same pattern) | — | — |
| `PROPERTIES_APPROVED` | `auto` | `IMPLEMENTATION` | `dispatch_agent` | — |
| `IMPLEMENTATION` | `lgtm` | `IMPLEMENTATION_REVIEW` | `dispatch_reviewers` | Single-discipline |
| `IMPLEMENTATION` | `subtask_complete` | (same as TSPEC fork/join) | — | Fullstack |
| `IMPLEMENTATION_REVIEW` | `review_submitted(all_approved)` | `DONE` | — | — |
| `DONE` | (any) | Error | — | Terminal state |

#### Review Phase Evaluation Algorithm

The review phase uses a **collect-all-then-evaluate** model per FSPEC-RT-02 v1.1: all reviewers must complete before the outcome is evaluated. This ensures the author receives ALL feedback in a single revision round.

When a `review_submitted` event is received in a `*_REVIEW` phase:

```
1. Update reviewerStatuses[event.reviewerKey] = event.recommendation
2. outcome = evaluateReviewOutcome(reviewPhaseState)
3. SWITCH outcome:
     "pending":
          No transition — waiting for remaining reviewers. Return empty side effects.
     "all_approved":
          Transition to *_APPROVED phase.
          Return { sideEffects: [auto_transition] }
     "has_revision_requested":
          a. Increment revisionCount
          b. IF revisionCount > 3:
               Return { sideEffects: [pause_feature("Revision bound exceeded")] }
               State unchanged.
          c. ELSE:
               For fullstack multi-document reviews: determine which sub-documents
               were rejected vs. approved. Authors of approved sub-documents receive
               a "Resubmit" directive (no changes needed). Authors of rejected
               sub-documents receive a "Revise" directive with cross-review feedback.
               Reset ALL reviewerStatuses to "pending"
               Transition to corresponding *_CREATION phase
               Return { sideEffects: [dispatch_agent(author, "Revise"/"Resubmit", docType)] }
```

**Single evaluation path:** The `transition()` function delegates to `evaluateReviewOutcome()` for all review outcome decisions, ensuring a single source of truth for the evaluation logic.

**Key behavioral difference from early-exit:** A rejection from one reviewer does NOT immediately trigger the revision loop. The orchestrator waits for all other reviewers to complete, then evaluates. This means the author receives all feedback (approvals and rejections) in one round, avoiding ping-pong revision cycles.

#### Fork/Join Algorithm

For `TSPEC_CREATION`, `PLAN_CREATION`, and `IMPLEMENTATION` when discipline is `fullstack`:

```
1. On entering the phase: initialize forkJoin = { subtasks: { eng: "pending", fe: "pending" } }
2. On subtask_complete(agentId):
     a. Validate artifact exists (caller responsibility — PdlcDispatcher does this)
     b. Set forkJoin.subtasks[agentId] = "complete"
     c. IF all subtasks === "complete":
          Clear forkJoin to null
          Transition to next phase
     d. ELSE:
          No transition — waiting for remaining subtask
```

For single-discipline features, `lgtm` directly transitions without fork/join.

#### Error Handling

| Scenario | Error Type | Message |
|----------|-----------|---------|
| Invalid transition | `InvalidTransitionError` | "Invalid event '{type}' in phase {phase}. Valid events: {list}" |
| Event on DONE feature | `InvalidTransitionError` | "Feature {slug} is complete. No further transitions allowed." |
| Unknown feature slug | `UnknownFeatureError` | "No state record for feature: {slug}" |

```typescript
export class InvalidTransitionError extends Error {
  constructor(
    public readonly phase: PdlcPhase,
    public readonly eventType: string,
    public readonly validEvents: string[],
  ) {
    super(`Invalid event '${eventType}' in phase ${phase}. Valid events: ${validEvents.join(", ")}`);
    this.name = "InvalidTransitionError";
  }
}

export class UnknownFeatureError extends Error {
  constructor(public readonly slug: string) {
    super(`No state record for feature: ${slug}`);
    this.name = "UnknownFeatureError";
  }
}
```

---

### 5.2 State Store (`state-store.ts`)

#### CURRENT_VERSION

```typescript
export const CURRENT_VERSION = 1;
```

#### Load Algorithm (FSPEC-SM-02)

```
1. Check if state file exists at statePath
2. IF not exists:
     Log info: "No state file found. Initializing fresh state."
     Return { version: CURRENT_VERSION, features: {} }
3. Read file content
4. IF empty (0 bytes):
     Log warning: "State file empty. Initializing fresh state."
     Return fresh state
5. Parse JSON
6. IF parse fails:
     Log error: "State file corrupted at {path}. Initializing fresh state."
     Return fresh state
7. Read version field
8. IF version === undefined:
     Treat as version 0 — attempt migration from v0 if exists, else treat as corrupted
9. IF version === CURRENT_VERSION:
     Return parsed state
10. IF version < CURRENT_VERSION:
      Run migration chain: migrateState(parsed, version, CURRENT_VERSION)
      IF migration succeeds:
        Save migrated state (atomic write)
        Return migrated state
      IF migration fails:
        Copy original file to .bak
        Log error with versions and error details
        Return fresh state
11. IF version > CURRENT_VERSION:
      Log error: "State file version {version} newer than supported {CURRENT_VERSION}."
      Return fresh state
```

#### Save Algorithm (FSPEC-SM-02)

```
1. Ensure state directory exists (mkdir -p)
2. Serialize state to JSON with 2-space indent
3. Write to {statePath}.tmp
4. Rename {statePath}.tmp to {statePath}
5. IF rename fails: log error, throw (caller handles as transition failure)
```

#### Edge Cases

| Case | Behavior |
|------|----------|
| `.tmp` file exists from previous crash | Overwritten on next save |
| `.bak` already exists | Overwritten on next migration failure |
| `state/` directory missing | Created on first save |
| Disk full during write | Write fails, throw error, previous state preserved |

---

### 5.3 Review Tracker (`review-tracker.ts`)

**Pure function module.**

#### Exported Functions

```typescript
/** Compute the reviewer manifest for a review phase + discipline */
export function computeReviewerManifest(
  phase: PdlcPhase,
  discipline: Discipline,
): ReviewerManifestEntry[];

/** Generate the string key for a reviewer manifest entry */
export function reviewerKey(entry: ReviewerManifestEntry): string;

/** Initialize a ReviewPhaseState with all reviewers set to "pending" */
export function initializeReviewPhaseState(
  manifest: ReviewerManifestEntry[],
): ReviewPhaseState;

/** Evaluate the outcome of a review phase */
export function evaluateReviewOutcome(
  state: ReviewPhaseState,
): "all_approved" | "has_revision_requested" | "pending";
```

#### Reviewer Computation Table (FSPEC-FC-01)

| Review Phase | backend-only | frontend-only | fullstack |
|---|---|---|---|
| `REQ_REVIEW` | `[eng, qa]` | `[fe, qa]` | `[eng, fe, qa]` |
| `FSPEC_REVIEW` | `[eng, qa]` | `[fe, qa]` | `[eng, fe, qa]` |
| `TSPEC_REVIEW` | `[pm, qa]` | `[pm, qa]` | `[pm, pm:fe_tspec, qa, qa:fe_tspec, fe:be_tspec, eng:fe_tspec]` |
| `PLAN_REVIEW` | `[pm, qa]` | `[pm, qa]` | `[pm, pm:fe_plan, qa, qa:fe_plan, fe:be_plan, eng:fe_plan]` |
| `PROPERTIES_REVIEW` | `[pm, eng]` | `[pm, fe]` | `[pm, eng, fe]` |
| `IMPLEMENTATION_REVIEW` | `[qa]` | `[qa]` | `[qa]` |

For fullstack `TSPEC_REVIEW` and `PLAN_REVIEW`, the entries use composite keys to track per-reviewer-per-document status:

- `pm` → reviews backend document (no scope = backend)
- `pm:fe_tspec` → reviews frontend TSPEC
- `qa` → reviews backend document
- `qa:fe_tspec` → reviews frontend TSPEC
- `fe:be_tspec` → frontend engineer reviews backend TSPEC (peer review)
- `eng:fe_tspec` → backend engineer reviews frontend TSPEC (peer review)

The `reviewerKey()` function generates the string key:
- If `scope` is undefined: returns `agentId` (e.g., `"eng"`)
- If `scope` is defined: returns `"agentId:scope"` (e.g., `"pm:fe_tspec"`)

#### Phase Advance Evaluation

`evaluateReviewOutcome()` returns:
- `"all_approved"` — every reviewer status is `"approved"`
- `"has_revision_requested"` — at least one reviewer has `"revision_requested"`
- `"pending"` — no rejections, but some reviewers are still `"pending"`

---

### 5.4 Cross-Review Parser (`cross-review-parser.ts`)

**Pure function module.**

#### Exported Functions

```typescript
/** Parse the recommendation from a cross-review file's content */
export function parseRecommendation(fileContent: string): ParsedRecommendation;

/** Map skill name from filename to agent ID */
export function skillNameToAgentId(skillName: string): string | null;

/** Derive expected cross-review file path */
export function crossReviewPath(
  featureSlug: string,
  skillName: string,
  documentType: string,
): string;
```

#### Parsing Algorithm (FSPEC-RT-01)

```
1. Split content into lines
2. Track insideCodeBlock = false
3. For each line:
     a. IF line starts with ``` → toggle insideCodeBlock
     b. IF insideCodeBlock → skip line
     c. Check if line matches a Recommendation heading:
        - /^#{1,6}\s+.*recommendation/i
        - /\*\*Recommendation[:\*]/i
        - /\|\s*\*?\*?Recommendation\*?\*?\s*\|/i (table row)
     d. IF match found:
        - IF already found a previous match → return { status: "parse_error", reason: "Multiple Recommendation headings found" }
        - Extract value: text after heading on same line, or next non-empty line
        - Store match
4. IF no match found → return { status: "parse_error", reason: "No Recommendation heading found" }
5. Normalize value: trim whitespace, lowercase
6. Match against recognized values:
     - Contains "approved with minor changes" → { status: "approved" }
     - Contains "needs revision" → { status: "revision_requested" }
     - Contains "approved" (but not the longer match above) → { status: "approved" }
     - No match → { status: "parse_error", reason: "Unrecognized recommendation", rawValue }
```

**Matching order:** "Approved with minor changes" is checked BEFORE "Approved" to prevent the shorter match from winning (BR-AD-02).

#### Skill Name Mapping (BR-AD-04)

```typescript
const SKILL_TO_AGENT: Record<string, string> = {
  "backend-engineer": "eng",
  "frontend-engineer": "fe",
  "product-manager": "pm",
  "test-engineer": "qa",
};
```

---

### 5.5 Context Matrix (`context-matrix.ts`)

**Pure function module.**

#### Exported Functions

```typescript
/** Get the context documents for a given phase, feature, and configuration */
export function getContextDocuments(
  phase: PdlcPhase,
  featureSlug: string,
  config: FeatureConfig,
  options?: { isRevision?: boolean; agentScope?: string },
): ContextDocumentSet;
```

#### Creation Phase Matrix (FSPEC-CA-01)

| Phase | Documents |
|-------|-----------|
| `REQ_CREATION` | overview.md |
| `FSPEC_CREATION` | overview.md, REQ |
| `TSPEC_CREATION` | overview.md, REQ, FSPEC (if exists and not skipped) |
| `PLAN_CREATION` | overview.md, TSPEC |
| `PROPERTIES_CREATION` | overview.md, REQ, FSPEC (if exists), TSPEC, PLAN |
| `IMPLEMENTATION` | TSPEC, PLAN, PROPERTIES |
| `IMPLEMENTATION_REVIEW` | TSPEC, PLAN, PROPERTIES |

#### Review Phase Matrix

| Phase | Documents |
|-------|-----------|
| `REQ_REVIEW` | REQ (under review), overview.md |
| `FSPEC_REVIEW` | FSPEC (under review), REQ |
| `TSPEC_REVIEW` | TSPEC (under review), REQ, FSPEC (if exists) |
| `PLAN_REVIEW` | PLAN (under review), TSPEC |
| `PROPERTIES_REVIEW` | PROPERTIES (under review), REQ, TSPEC, PLAN |

#### Revision Context Augmentation (BR-CA-03)

When `options.isRevision === true`: standard creation-phase documents PLUS all `CROSS-REVIEW-*-{docType}.md` files from the feature folder (glob pattern).

#### Fullstack Scope Filtering (BR-CA-04)

When `options.agentScope` is provided (e.g., `"be"` or `"fe"`):
- For `TSPEC_CREATION`: backend engineer receives only the backend TSPEC prerequisites
- For `PLAN_CREATION`: each engineer receives only their own discipline's TSPEC

#### Path Resolution

```typescript
function featureDocPath(slug: string, filename: string): string {
  // Returns "docs/{slug}/{filename}"
  // e.g., "docs/011-orchestrator-pdlc-state-machine/011-REQ-orchestrator-pdlc-state-machine.md"
}
```

The `{NNN}` prefix is extracted from the slug (e.g., `"011"` from `"011-orchestrator-pdlc-state-machine"`).

---

### 5.6 PdlcDispatcher (`pdlc-dispatcher.ts`)

#### DefaultPdlcDispatcher Implementation

This is the orchestration layer that connects the pure state machine to the I/O world.

**Key Methods:**

##### `processAgentCompletion()`

```
1. Load feature state from in-memory cache
2. IF signal === "TASK_COMPLETE" and phase !== IMPLEMENTATION_REVIEW:
     Log warning: "Agent returned TASK_COMPLETE in non-terminal phase, treating as LGTM"
     Treat as LGTM
3. Determine if this is a fork/join phase (fullstack + creation/implementation phase):
     YES: Build subtask_complete event
     NO: Build lgtm event
4. Validate artifact exists at expected path (using fs.exists())
     IF missing:
       Return { action: "retry_agent", reason: "artifact_missing", message: "Expected artifact at {path} not found" }
       Note: The orchestrator routing loop handles the retry (per FSPEC-AI-01 step 5):
       re-invoke the agent with a correction directive up to 2 times (3 total attempts).
       After 3 failed attempts, escalate via { action: "pause" } with ROUTE_TO_USER.
5. Call transition(state, event, now)
6. Persist new state via stateStore.save()
7. Process side effects → return DispatchAction
```

##### `processReviewCompletion()`

```
1. Load feature state from in-memory cache
2. Determine cross-review file path from reviewer agent + document type
3. Read cross-review file from worktree via fs.readFile()
4. Parse recommendation via parseRecommendation()
5. IF parse_error:
     Return { action: "pause", reason: "parse_error", message: FSPEC-RT-01 error message }
6. Build review_submitted event with reviewerKey
7. Call transition(state, event, now)
8. Persist new state via stateStore.save()
9. Process side effects → return DispatchAction
```

##### `getNextAction()`

Used on startup recovery. Reads current phase and determines what to dispatch:

```
1. Load feature state
2. IF phase is *_CREATION or IMPLEMENTATION:
     Return dispatch action for the creation agent(s)
3. IF phase is *_REVIEW:
     Check reviewer statuses for pending reviewers
     Return dispatch action for pending reviewers
4. IF phase is *_APPROVED:
     Return auto_transition (will immediately process to next creation phase)
5. IF phase is DONE:
     Return { action: "done" }
```

##### Side Effect Processing

Converts `SideEffect[]` from `TransitionResult` into `DispatchAction`:

- `dispatch_agent` → builds `AgentDispatch` with context from `getContextDocuments()`
- `dispatch_reviewers` → builds multiple `AgentDispatch` entries for each reviewer
- `pause_feature` → returns `{ action: "pause", ... }`
- `auto_transition` → recursively processes the auto-transition event
- `log_warning` → logs via logger

---

### 5.7 Migrations (`migrations.ts`)

**Infrastructure for future state schema migrations.**

```typescript
export type MigrationFn = (state: unknown) => unknown;

export const CURRENT_VERSION = 1;

/** Registry of migration functions. Key is the source version. */
export const migrations: Record<number, MigrationFn> = {
  // Future: 0: migrateV0ToV1,
  // Future: 1: migrateV1ToV2,
};

/**
 * Run sequential migrations from fromVersion to toVersion.
 * Throws if any migration function is missing or fails.
 */
export function migrateState(
  state: unknown,
  fromVersion: number,
  toVersion: number,
): PdlcStateFile;
```

For v1, the migrations registry is empty. The infrastructure exists for forward compatibility per REQ-SM-10.

---

### 5.8 Orchestrator Integration (`orchestrator.ts` — UPDATED)

#### Changes to OrchestratorDeps

```typescript
export interface OrchestratorDeps {
  // ... existing deps ...

  // --- Phase 11: PDLC State Machine (NEW) ---
  pdlcDispatcher: PdlcDispatcher;
}
```

#### Changes to startup()

Add after existing startup steps:

```typescript
// Load PDLC state from disk
await this.pdlcDispatcher.loadState();
```

#### Changes to executeRoutingLoop()

The routing loop is modified to check whether the current feature is PDLC-managed:

```
// After signal parsing and routing decision:

1. Extract featureSlug from threadName
2. Check if feature is managed: await pdlcDispatcher.isManaged(featureSlug)
3. IF managed:
     a. IF signal is LGTM or TASK_COMPLETE:
          dispatchAction = await pdlcDispatcher.processAgentCompletion({
            featureSlug, agentId: currentAgentId, signal: signal.type, worktreePath
          })
     b. IF signal is ROUTE_TO_USER:
          Handle via existing Pattern B (PDLC phase unchanged)
     c. IF signal is ROUTE_TO_AGENT:
          Log warning: "Agent used ROUTE_TO_AGENT in PDLC-managed feature — ad-hoc, phase unchanged"
          Handle via existing routing loop (invoke target for one turn)
          After ad-hoc turn completes, re-enter PDLC dispatch
     d. Process dispatchAction:
          - "dispatch": set next agent(s) from dispatchAction.agents, continue loop
          - "pause": handle via ROUTE_TO_USER mechanism
          - "done": post completion, return
          - "wait": return (waiting for more subtasks/reviews)
4. IF NOT managed:
     Use existing RoutingEngine.decide() logic (backward compatibility per REQ-SM-NF-03)
```

This ensures features started before the PDLC state machine was deployed continue to work with the old routing-signal model.

#### Changes to ContextAssembler

The `DefaultContextAssembler.assemble()` method is updated to accept an optional `contextDocumentSet` parameter:

```typescript
export interface ContextAssembler {
  assemble(params: {
    // ... existing params ...
    contextDocuments?: ContextDocumentSet;  // NEW: phase-aware document set
  }): Promise<ContextBundle>;
}
```

When `contextDocuments` is provided, the assembler reads only the specified documents for Layer 2 instead of reading all feature files. This replaces the "read everything and token-budget" approach with precise, phase-aware document selection.

---

## 6. Error Handling

| Scenario | Module | Behavior | Recovery |
|----------|--------|----------|----------|
| Invalid phase transition | state-machine | Throw `InvalidTransitionError` | Caller logs error, no state change |
| Unknown feature slug | state-machine | Throw `UnknownFeatureError` | Caller returns error to user |
| State file corrupted | state-store | Log error, return fresh state | Features restart from beginning |
| State file version newer than supported | state-store | Log error, return fresh state | Same as corrupted |
| Migration failure | state-store | Copy to `.bak`, log error, return fresh state | Manual recovery from `.bak` |
| Atomic write failure (rename) | state-store | Throw error, previous state preserved | Transition treated as failed (fail-closed, BR-PS-01) |
| Cross-review file missing | pdlc-dispatcher | Return `{ action: "pause" }` with message | User alerted via ROUTE_TO_USER |
| Cross-review recommendation unparseable | pdlc-dispatcher | Return `{ action: "pause" }` with message | User alerted via ROUTE_TO_USER |
| Expected artifact missing after LGTM | pdlc-dispatcher | Return `{ action: "pause" }` with message | User alerted, agent may be re-invoked |
| Revision bound exceeded (>3 cycles) | state-machine | Return `pause_feature` side effect | User intervention required |
| Feature already DONE | state-machine | Throw `InvalidTransitionError` | Caller ignores |
| Disk full | state-store | Write fails, throw | Transition not committed (fail-closed) |
| Reviewer agent crash / timeout | (not implemented) | Reviewer status remains `pending` indefinitely | **Known limitation (P1).** No reviewer timeout mechanism in P0. Feature remains in `*_REVIEW` until user intervenes manually or the reviewer is re-dispatched via startup recovery. Future enhancement: add a configurable review timeout (e.g., 30 minutes) after which the orchestrator pauses via ROUTE_TO_USER with message "Reviewer {agent_id} has not responded within the timeout period." |

---

## 7. Test Strategy

### 7.1 Approach

The architecture is designed for testability:

1. **Pure function modules** (`state-machine`, `review-tracker`, `cross-review-parser`, `context-matrix`) are tested with direct input/output assertions — no mocks needed.
2. **StateStore** is tested with `FakeFileSystem` for unit tests and real filesystem for integration tests.
3. **PdlcDispatcher** is tested with `FakeStateStore` and `FakeFileSystem` — all I/O dependencies are injected.
4. **Orchestrator integration** is tested in existing integration test infrastructure with `FakePdlcDispatcher`.

### 7.2 Test Doubles

```typescript
// --- FakeStateStore ---
export class FakeStateStore implements StateStore {
  state: PdlcStateFile = { version: 1, features: {} };
  loadError: Error | null = null;
  saveError: Error | null = null;
  saveCount = 0;

  async load(): Promise<PdlcStateFile> {
    if (this.loadError) throw this.loadError;
    return structuredClone(this.state);
  }

  async save(state: PdlcStateFile): Promise<void> {
    if (this.saveError) throw this.saveError;
    this.state = structuredClone(state);
    this.saveCount++;
  }
}

// --- FakeFileSystem extension (add to existing FakeFileSystem) ---
// The existing FakeFileSystem uses an in-memory Map<string, string>.
// Add these methods to support StateStore tests:

async rename(oldPath: string, newPath: string): Promise<void> {
  if (this.renameError) throw this.renameError;
  const content = this.files.get(oldPath);
  if (!content && content !== "") throw Object.assign(new Error(`ENOENT: ${oldPath}`), { code: "ENOENT" });
  this.files.set(newPath, content);
  this.files.delete(oldPath);
}
renameError: Error | null = null;

async copyFile(src: string, dest: string): Promise<void> {
  const content = this.files.get(src);
  if (!content && content !== "") throw Object.assign(new Error(`ENOENT: ${src}`), { code: "ENOENT" });
  this.files.set(dest, content);
}

// --- FakePdlcDispatcher ---
export class FakePdlcDispatcher implements PdlcDispatcher {
  features: Record<string, FeatureState> = {};
  nextAction: DispatchAction = { action: "done" };
  completionResult: DispatchAction = { action: "done" };
  reviewResult: DispatchAction = { action: "done" };

  processAgentCompletionCalls: Array<{
    featureSlug: string; agentId: string; signal: string;
  }> = [];

  processReviewCompletionCalls: Array<{
    featureSlug: string; reviewerAgentId: string;
  }> = [];

  async isManaged(slug: string): Promise<boolean> {
    return slug in this.features;
  }

  async getFeatureState(slug: string): Promise<FeatureState | null> {
    return this.features[slug] ?? null;
  }

  async initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState> {
    const state = createFeatureState(slug, config, new Date().toISOString());
    this.features[slug] = state;
    return state;
  }

  async processAgentCompletion(params: {
    featureSlug: string; agentId: string; signal: string; worktreePath: string;
  }): Promise<DispatchAction> {
    this.processAgentCompletionCalls.push(params);
    return this.completionResult;
  }

  async processReviewCompletion(params: {
    featureSlug: string; reviewerAgentId: string; worktreePath: string;
  }): Promise<DispatchAction> {
    this.processReviewCompletionCalls.push(params);
    return this.reviewResult;
  }

  async getNextAction(): Promise<DispatchAction> {
    return this.nextAction;
  }

  async processResumeFromBound(): Promise<DispatchAction> {
    return this.nextAction;
  }

  async loadState(): Promise<void> {}
}
```

### 7.3 Test Categories

| Module | Test File | Category | Count (est.) |
|--------|-----------|----------|-------------|
| state-machine | `tests/unit/orchestrator/pdlc/state-machine.test.ts` | Unit | ~40 |
| state-store | `tests/unit/orchestrator/pdlc/state-store.test.ts` | Unit | ~15 |
| review-tracker | `tests/unit/orchestrator/pdlc/review-tracker.test.ts` | Unit | ~25 |
| cross-review-parser | `tests/unit/orchestrator/pdlc/cross-review-parser.test.ts` | Unit | ~15 |
| context-matrix | `tests/unit/orchestrator/pdlc/context-matrix.test.ts` | Unit | ~15 |
| pdlc-dispatcher | `tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | Unit | ~25 |
| migrations | `tests/unit/orchestrator/pdlc/migrations.test.ts` | Unit | ~8 |
| pdlc-lifecycle | `tests/integration/orchestrator/pdlc-lifecycle.test.ts` | Integration | ~10 |
| **Total** | | | **~153** |

### 7.4 Key Test Scenarios

**State Machine (pure function tests):**
- Happy path: full PDLC progression from REQ_CREATION to DONE
- FSPEC skip: REQ_APPROVED → TSPEC_CREATION when skipFspec=true
- Fork/join: fullstack TSPEC_CREATION with two subtasks completing
- Fork/join: partial completion (one subtask done, waiting for other)
- Review: all approved → advance
- Review: single rejection → revision loop
- Review: revision bound exceeded (4th rejection) → pause
- Terminal state: event on DONE feature → error
- Invalid transition: wrong event for current phase → error
- Edge case: LGTM in review phase → ignored with warning
- Edge case: all_approved in creation phase → ignored with warning

**Review Tracker (pure function tests):**
- Reviewer manifest for each (phase, discipline) combination (6 phases × 3 disciplines = 18 tests)
- Fullstack TSPEC_REVIEW: 6 reviewer-document pair entries
- Unknown discipline → error
- Non-review phase → error
- evaluateReviewOutcome: all approved, partial pending, has rejection

**Cross-Review Parser:**
- "Approved" → approved
- "Approved with minor changes" → approved
- "Needs revision" → revision_requested
- Case insensitive: "APPROVED", "approved", "Approved "
- Trailing period: "Approved." → approved
- Extra text: "Approved with minor changes — see F-01" → approved
- No Recommendation heading → parse_error
- Multiple Recommendation headings → parse_error
- Recommendation inside code block → ignored
- Unrecognized value → parse_error with rawValue

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|---|---|---|
| REQ-SM-01 | `PdlcPhase` enum in `phases.ts` | 18-phase enumeration |
| REQ-SM-02 | `FeatureState` type in `phases.ts` | Per-feature state record |
| REQ-SM-03 | `transition()` in `state-machine.ts` | Valid transition enforcement |
| REQ-SM-04 | `transition()` REQ_APPROVED branch | FSPEC skip via config.skipFspec |
| REQ-SM-05 | `FileStateStore.save()` | Persist to JSON after every transition |
| REQ-SM-06 | `FileStateStore.load()` | Recovery on startup |
| REQ-SM-07 | `transition()` fork/join logic, `ForkJoinState` | Parallel TSPEC creation |
| REQ-SM-08 | `transition()` fork/join logic | Parallel PLAN creation |
| REQ-SM-09 | `transition()` DONE guard | Terminal state enforcement |
| REQ-SM-10 | `migrations.ts`, `FileStateStore.load()` | Schema versioning and migration |
| REQ-SM-11 | `transition()` fork/join logic, `ForkJoinState` | Parallel implementation for fullstack features |
| REQ-RT-01 | `computeReviewerManifest()` in `review-tracker.ts` | Reviewer manifest per phase |
| REQ-RT-02 | `computeReviewerManifest()` lookup table | Review rules encoded in code |
| REQ-RT-03 | `ReviewPhaseState.reviewerStatuses` | Per-reviewer status tracking |
| REQ-RT-04 | `parseRecommendation()` in `cross-review-parser.ts` | Approval detection from files |
| REQ-RT-05 | `evaluateReviewOutcome()` + `transition()` | Phase advance on all-approved |
| REQ-RT-06 | `transition()` revision loop | Rejection → creation phase |
| REQ-RT-07 | `getContextDocuments()` revision context | Revision feedback in context |
| REQ-RT-09 | `transition()` revisionCount > 3 check | Revision bound with escalation |
| REQ-AI-01 | `DefaultPdlcDispatcher.processAgentCompletion()` | Orchestrator-driven agent selection |
| REQ-AI-02 | Phase-to-agent mapping in `pdlc-dispatcher.ts` | Phase → agent lookup |
| REQ-AI-03 | `AgentDispatch.taskType` + `documentType` | Task directive construction |
| REQ-AI-04 | Orchestrator routing loop changes | Signal interpretation |
| REQ-AI-05 | `processAgentCompletion()` artifact validation | Artifact existence check |
| REQ-FC-01 | `Discipline` type, `FeatureConfig` | Discipline configuration |
| REQ-FC-02 | `initializeFeature()` in `PdlcDispatcher` | Configuration at creation time |
| REQ-FC-03 | Default in `initializeFeature()` | Default discipline = backend-only |
| REQ-FC-04 | `computeReviewerManifest()` | Discipline-based reviewer computation |
| REQ-FC-05 | Fullstack entries in reviewer table | Peer review assignment |
| REQ-SA-01–06 | Out of scope for TSPEC | SKILL.md text changes (documentation task) |
| REQ-CA-01 | `getContextDocuments()` in `context-matrix.ts` | Phase-aware context assembly |
| REQ-CA-02 | Context matrix lookup tables | Document matrix definition |
| REQ-CA-03 | `getContextDocuments()` with `isRevision: true` | Revision context augmentation |
| REQ-SM-NF-01 | Pure function design, in-memory state cache | <100ms transitions |
| REQ-SM-NF-02 | `FileStateStore.save()` atomic write | Crash-safe persistence |
| REQ-SM-NF-03 | `isManaged()` check in orchestrator | Backward compatibility |
| REQ-SM-NF-04 | Pure function `transition()` | Testability without I/O |
| REQ-SM-NF-05 | Logger calls in `PdlcDispatcher` | Transition logging |

---

## 9. Integration Points

### 9.1 Existing Code Modifications

| File | Change | Impact |
|---|---|---|
| `orchestrator.ts` | Add `pdlcDispatcher` to `OrchestratorDeps`, modify `executeRoutingLoop()` to check managed features | Core routing loop branching. Unmanaged features use existing path. |
| `context-assembler.ts` | Add optional `contextDocuments` parameter to `assemble()` | Backward-compatible addition. When not provided, existing behavior unchanged. |
| `types.ts` | Add PDLC types (import from `pdlc/phases.ts` or define inline) | Type-only additions, no runtime impact. |
| `services/filesystem.ts` | Add `rename()` and `copyFile()` to `FileSystem` interface and `NodeFileSystem` | New interface methods. All existing fakes updated. |
| `tests/fixtures/factories.ts` | Add `FakeStateStore`, `FakePdlcDispatcher`, update `FakeFileSystem` | Test infrastructure only. |
| `.gitignore` | Add `ptah/state/` | Prevents state file from being committed |

### 9.2 Integration with Existing Routing Loop

The PDLC dispatcher is integrated as a **parallel decision path** in the routing loop, not a replacement:

```
                    ┌─ PDLC-managed? ─┐
                    │                  │
              ┌─────┴─────┐    ┌──────┴──────┐
              │  YES: use  │    │  NO: use    │
              │  PdlcDisp. │    │  RoutingEng.│
              └────────────┘    └─────────────┘
```

This preserves backward compatibility (REQ-SM-NF-03) — features without a state record continue using the existing `RoutingEngine.decide()` path.

### 9.3 Revision Bound Resume Protocol

When the revision bound is exceeded (>3 cycles) and the feature is paused via `ROUTE_TO_USER`:

1. The developer's response is received via the existing Pattern B mechanism.
2. The orchestrator calls `pdlcDispatcher.processResumeFromBound(featureSlug)`.
3. The dispatcher resets the revision count for the current phase to 0 and re-enters the review phase with all reviewer statuses reset to `"pending"`.

This preserves the review integrity guarantee (no force-advance past unapproved reviews). The developer's act of responding is the acknowledgment that another round of reviews is acceptable.

---

## 10. Open Questions

| # | Question | Impact | Proposed Resolution |
|---|----------|--------|---------------------|
| OQ-01 | Should `REQ-SA-01` through `REQ-SA-06` (SKILL.md simplification) be tracked in this TSPEC's execution plan, or handled as a separate documentation task? | PLAN scope | Propose: separate task. SKILL.md changes are text edits, not code. They should be done after the state machine is deployed and validated, to avoid a mixed state during transition. **Transition note (per PM review F-05):** SKILL.md updates should be the immediate follow-up task before any new features use the PDLC state machine. During the transition period, the orchestrator's explicit task directives (ACTION lines) override the SKILL.md's self-selection logic, so the conflict is manageable but should be resolved promptly. |
| OQ-02 | For fullstack features, should the orchestrator dispatch backend and frontend engineers truly in parallel (concurrent invocations) or sequentially? | Performance vs. complexity | Propose: sequential dispatch (P0). Concurrent dispatch adds complexity to the invocation guard and worktree management. REQ-RT-08 is P1. |

### Resolved Questions (from QA review)

| # | Question | Resolution |
|---|----------|------------|
| QA-Q-01 | Where does artifact validation retry live? | The retry loop lives in the **orchestrator's routing loop** (the caller), not inside `processAgentCompletion()`. The dispatcher returns `{ action: "retry_agent" }` on missing artifact. The orchestrator re-invokes the agent up to 2 more times (3 total attempts per FSPEC-AI-01). After 3 failures, the orchestrator escalates via `{ action: "pause" }`. Tests for retry logic belong in `orchestrator.test.ts`, not `pdlc-dispatcher.test.ts`. |
| QA-Q-02 | How does `getNextAction()` handle fullstack TSPEC_REVIEW? | `getNextAction()` reads persisted `reviewPhases` state and dispatches **only reviewers whose status is still `pending`**. Previously completed reviews (persisted as `approved` or `revision_requested`) are NOT re-dispatched. This is efficient and correct because the persisted state includes per-reviewer-per-document status via composite keys. |

---

## 11. Quality Checklist

- [x] All requirements from REQ are mapped to technical components (Section 8)
- [x] Protocols defined for every service boundary (StateStore, PdlcDispatcher, FileSystem extension)
- [x] Error handling table covers every failure scenario (Section 6)
- [x] Test strategy with test doubles is specified (Section 7)
- [x] No product decisions made — only technical design decisions
- [x] Document status is set (Draft)

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Backend Engineer | Initial TSPEC — 8 new modules, 2 updated modules, ~148 estimated tests |
| 1.1 | March 14, 2026 | Backend Engineer | Address PM review: F-01 fix REQ-SM-11 mapping, F-02 collect-all-then-evaluate review model, F-03 artifact retry note, F-04 add Resubmit task type, F-05 transition sequencing note, Q-01 add processResumeFromBound to interface |
| 1.2 | March 14, 2026 | Backend Engineer | Address QA review: F-04 add FakeFileSystem extension, F-06 document reviewer timeout as P1 known limitation, F-07 transition() delegates to evaluateReviewOutcome(), F-08 update test estimates, resolve Q-01/Q-02 |

---

*End of Document*
