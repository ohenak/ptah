# Technical Specification

## Fix REQ Overwrite On Workflow Start

| Field | Detail |
|-------|--------|
| **Document ID** | TSPEC-fix-req-overwrite-on-start |
| **Requirements** | [REQ-fix-req-overwrite-on-start.md](REQ-fix-req-overwrite-on-start.md) v3.0 |
| **Date** | 2026-04-10 |
| **Author** | Engineer |
| **Status** | In Review |

---

## 1. Summary

This TSPEC describes the minimal targeted change required to make `TemporalOrchestrator.startNewWorkflow()` phase-aware. A new `PhaseDetector` component inspects the active lifecycle filesystem before any workflow is started and returns the appropriate `startAtPhase` value (`"req-review"` or `"req-creation"`). The `TemporalOrchestrator` consumes `PhaseDetector` via constructor injection (a new field on `TemporalOrchestratorDeps`). No existing interface (`FileSystem`, `FeatureResolver`) is modified.

---

## 2. Technology Stack

No new runtime dependencies. All changes use the existing project stack.

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | TypeScript 5.x (ESM) | Existing project convention |
| Runtime | Node.js 20 LTS | Existing |
| Test framework | Vitest | Existing |
| Filesystem access | `FileSystem.exists()` | No interface extension needed per REQ-PD-01/02 |

---

## 3. Project Structure

```
ptah/
├── src/
│   ├── services/
│   │   └── filesystem.ts              # UPDATED: NodeFileSystem.exists() catches ENOENT only
│   └── orchestrator/
│       ├── phase-detector.ts          # NEW: PhaseDetector interface + DefaultPhaseDetector
│       └── temporal-orchestrator.ts   # UPDATED: add phaseDetector dep, update startNewWorkflow
├── bin/
│   └── ptah.ts                        # UPDATED: wire DefaultPhaseDetector in composition root
└── tests/
    ├── fixtures/
    │   └── factories.ts               # UPDATED: add existsError to FakeFileSystem, add FakePhaseDetector
    └── unit/
        └── orchestrator/
            ├── phase-detector.test.ts          # NEW: unit tests for DefaultPhaseDetector
            └── temporal-orchestrator.test.ts   # UPDATED: add phase-aware startNewWorkflow tests
        └── temporal/
            └── feature-lifecycle.test.ts       # UPDATED: add REQ-WS-06a/b invariant tests
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/ptah.ts (composition root)
  └── DefaultPhaseDetector(fs: FileSystem, logger: Logger)
        ↳ phaseDetector injected into TemporalOrchestratorDeps

TemporalOrchestrator
  ├── phaseDetector: PhaseDetector      ← NEW
  ├── temporalClient: TemporalClientWrapper
  ├── discord: DiscordClient
  └── logger: Logger
```

### 4.2 Protocol: `PhaseDetector`

**File:** `ptah/src/orchestrator/phase-detector.ts`

```typescript
/**
 * Result of a phase detection scan for a feature slug.
 */
export interface PhaseDetectionResult {
  /**
   * Phase to pass as startAtPhase to startFeatureWorkflow.
   * "req-review" when a REQ file was found; "req-creation" otherwise.
   */
  startAtPhase: "req-review" | "req-creation";

  /**
   * Which lifecycle folder was selected as the resolved folder
   * per the REQ-PD-03 decision table.
   */
  resolvedLifecycle: "in-progress" | "backlog";

  /**
   * True if a REQ file exists in any checked active lifecycle folder.
   */
  reqPresent: boolean;

  /**
   * True if an overview file exists in any checked active lifecycle folder.
   */
  overviewPresent: boolean;
}

export interface PhaseDetector {
  /**
   * Detect the appropriate starting phase for a new feature workflow.
   *
   * Checks the following paths via FileSystem.exists() (in-progress first):
   *   docs/in-progress/<slug>/REQ-<slug>.md
   *   docs/backlog/<slug>/REQ-<slug>.md
   *   docs/in-progress/<slug>/overview.md
   *   docs/backlog/<slug>/overview.md
   *
   * Applies the REQ-PD-03 decision table to determine the resolved lifecycle
   * folder and the start phase. Logs a structured warning for each
   * inconsistent-state case (A, B, C, H). Logs a structured info entry
   * containing slug, lifecycle, reqPresent, overviewPresent, startAtPhase.
   *
   * Does NOT catch errors thrown by FileSystem.exists(). If exists() throws
   * (e.g. permission denied), the error propagates to the caller.
   *
   * Is purely read-only: never creates, writes, renames, or deletes files.
   *
   * Completed lifecycle folders (docs/completed/) are not checked.
   *
   * @throws propagates any error thrown by FileSystem.exists()
   */
  detect(slug: string): Promise<PhaseDetectionResult>;
}
```

**Design rationale:**
- Throws are intentionally not caught inside `detect()` so that `TemporalOrchestrator.startNewWorkflow()` can handle I/O failures per REQ-ER-03 (log + Discord reply + no workflow start).
- `NodeFileSystem.exists()` is updated within this TSPEC to selectively catch only `ENOENT` errors (file or directory genuinely not found) and propagate all other errors (e.g., `EACCES`, `EIO`). This is not an extension of the `FileSystem` interface — the interface signature is unchanged. This correction enables REQ-ER-03 to be satisfied in production: a real I/O error propagates out of `detect()` and is caught by `startNewWorkflow()`'s try/catch, which logs the error and posts a Discord reply. See §4.4 for the implementation.
- `FakeFileSystem` in tests can be configured to throw from `exists()` (via a new `existsError` field), enabling REQ-ER-03 coverage in unit tests without requiring a real permission-denied filesystem state.

### 4.3 Concrete Implementation: `DefaultPhaseDetector`

**File:** `ptah/src/orchestrator/phase-detector.ts`

```typescript
import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";

export class DefaultPhaseDetector implements PhaseDetector {
  constructor(
    private readonly fs: FileSystem,
    private readonly logger: Logger,
  ) {}

  async detect(slug: string): Promise<PhaseDetectionResult> {
    const inProgressReqPath = `docs/in-progress/${slug}/REQ-${slug}.md`;
    const backlogReqPath = `docs/backlog/${slug}/REQ-${slug}.md`;
    const inProgressOverviewPath = `docs/in-progress/${slug}/overview.md`;
    const backlogOverviewPath = `docs/backlog/${slug}/overview.md`;

    // NOTE: errors propagate — not caught here (caller handles REQ-ER-03)
    const inProgressReq = await this.fs.exists(inProgressReqPath);
    const backlogReq = await this.fs.exists(backlogReqPath);
    const inProgressOverview = await this.fs.exists(inProgressOverviewPath);
    const backlogOverview = await this.fs.exists(backlogOverviewPath);

    const ipPath = `docs/in-progress/${slug}/`;
    const blPath = `docs/backlog/${slug}/`;

    // REQ-PD-03 warning conditions (Cases A, B, C, H)
    if (inProgressReq && backlogReq) {
      // Case C: REQ present in both folders
      this.logger.warn(
        `Phase detection: slug=${slug} REQ found in both ${ipPath} and ${blPath}; resolving to in-progress`,
      );
    } else if (inProgressReq && !backlogReq && backlogOverview) {
      // Case A: REQ in in-progress but overview also exists in backlog
      this.logger.warn(
        `Phase detection: slug=${slug} inconsistent state — REQ in ${ipPath} but overview also in ${blPath}`,
      );
    } else if (!inProgressReq && backlogReq && inProgressOverview) {
      // Case B: REQ in backlog but overview in in-progress
      this.logger.warn(
        `Phase detection: slug=${slug} inconsistent state — overview in ${ipPath} but REQ in ${blPath}`,
      );
    } else if (!inProgressReq && !backlogReq && inProgressOverview && backlogOverview) {
      // Case H: overview in both folders, no REQ
      this.logger.warn(
        `Phase detection: slug=${slug} overview found in both ${ipPath} and ${blPath}; resolving to in-progress`,
      );
    }

    // General resolution rule (REQ-PD-03)
    let resolvedLifecycle: "in-progress" | "backlog";
    let startAtPhase: "req-review" | "req-creation";

    if (inProgressReq) {
      resolvedLifecycle = "in-progress";
      startAtPhase = "req-review";
    } else if (backlogReq) {
      resolvedLifecycle = "backlog";
      startAtPhase = "req-review";
    } else if (inProgressOverview) {
      resolvedLifecycle = "in-progress";
      startAtPhase = "req-creation";
    } else if (backlogOverview) {
      resolvedLifecycle = "backlog";
      startAtPhase = "req-creation";
    } else {
      // Nothing found in any active folder (deprecated REQ-ER-01: PM Phase 0 handles this)
      resolvedLifecycle = "in-progress";
      startAtPhase = "req-creation";
    }

    const reqPresent = inProgressReq || backlogReq;
    const overviewPresent = inProgressOverview || backlogOverview;

    // REQ-ER-02: structured log entry
    this.logger.info(
      `Phase detection: slug=${slug} lifecycle=${resolvedLifecycle} reqPresent=${reqPresent} overviewPresent=${overviewPresent} startAtPhase=${startAtPhase}`,
    );

    return { startAtPhase, resolvedLifecycle, reqPresent, overviewPresent };
  }
}
```

### 4.4 Updated: `NodeFileSystem.exists()` in `src/services/filesystem.ts`

`NodeFileSystem.exists()` currently catches all errors and returns `false`. The updated implementation catches only `ENOENT` (file or directory genuinely absent), propagating real I/O errors so that `DefaultPhaseDetector.detect()` and `TemporalOrchestrator.startNewWorkflow()` can surface them to the user per REQ-ER-03:

```typescript
async exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(path.resolve(this._cwd, filePath));
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return false;  // file/dir genuinely absent
    throw err;                            // propagate real I/O errors (EACCES, EIO, etc.)
  }
}
```

The `FileSystem` interface is untouched — same method signature, no new methods. No other methods in `NodeFileSystem` are changed. Existing integration tests for `exists()` (nonexistent path → `false`; existing file → `true`; existing dir → `true`) continue to pass unchanged.

---

### 4.5 Updated: `TemporalOrchestratorDeps`

**File:** `ptah/src/orchestrator/temporal-orchestrator.ts`

Add `phaseDetector` to the deps interface:

```typescript
import type { PhaseDetector } from "./phase-detector.js";

export interface TemporalOrchestratorDeps {
  temporalClient: TemporalClientWrapper;
  worker: Worker;
  discordClient: DiscordClient;
  gitClient: GitClient;
  logger: Logger;
  config: PtahConfig;
  workflowConfig: WorkflowConfig;
  agentRegistry: AgentRegistry;
  skillInvoker: SkillInvoker;
  phaseDetector: PhaseDetector;           // NEW
}
```

Add to `TemporalOrchestrator` constructor body:
```typescript
private readonly phaseDetector: PhaseDetector;

// In constructor:
this.phaseDetector = deps.phaseDetector;
```

### 4.6 Updated: `TemporalOrchestrator.startNewWorkflow()`

Replace the existing `startNewWorkflow` private method with:

```typescript
private async startNewWorkflow(slug: string, message: ThreadMessage): Promise<void> {
  // Phase detection (REQ-PD-01, REQ-PD-02, REQ-PD-03)
  let detection: PhaseDetectionResult;
  try {
    detection = await this.phaseDetector.detect(slug);
  } catch (err) {
    // REQ-ER-03: I/O error during detection — log and surface to user
    this.logger.error(
      `Phase detection failed for slug=${slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
    await this.discord.postPlainMessage(
      message.threadId,
      `${slug}: transient error during phase detection. Please try again.`,
    );
    return; // do NOT start workflow
  }

  const featureConfig: FeatureConfig = {
    discipline: "fullstack",
    skipFspec: false,
    useTechLead: false,
  };

  try {
    const workflowId = await this.startWorkflowForFeature({
      featureSlug: slug,
      featureConfig,
      startAtPhase: detection.startAtPhase,
    });
    await this.discord.postPlainMessage(
      message.threadId,
      `Started workflow ${workflowId} for ${slug}`,
    );
  } catch (err) {
    if (err instanceof Error && err.name === "WorkflowExecutionAlreadyStartedError") {
      await this.discord.postPlainMessage(
        message.threadId,
        `Workflow already running for ${slug}`,
      );
    } else {
      await this.discord.postPlainMessage(
        message.threadId,
        `Failed to start workflow for ${slug}. Please try again.`,
      );
    }
  }
}
```

Note: The import `PhaseDetectionResult` must also be added at the top of the file.

### 4.7 Composition Root Update: `bin/ptah.ts`

In the `start` case, after the existing `featureResolver` instantiation line, add:

```typescript
import { DefaultPhaseDetector } from "../src/orchestrator/phase-detector.js";

// In the start case, after featureResolver:
const phaseDetector = new DefaultPhaseDetector(fs, logger);
```

Then add `phaseDetector` to the `TemporalOrchestrator` constructor call:

```typescript
const orchestrator = new TemporalOrchestrator({
  temporalClient,
  worker,
  discordClient: discord,
  gitClient: git,
  logger,
  config,
  workflowConfig,
  agentRegistry,
  skillInvoker,
  phaseDetector,    // NEW
});
```

---

## 5. Algorithm: Phase Detection Decision Table

The `DefaultPhaseDetector.detect(slug)` algorithm checks exactly four paths and applies the following decision table (REQ-PD-03). All four `exists()` calls are made unconditionally before any branching, so there are no short-circuit side effects on subsequent checks.

| Case | `in-progress` REQ | `in-progress` overview | `backlog` REQ | `backlog` overview | Resolved folder | Start phase | Action |
|------|:-:|:-:|:-:|:-:|---|---|---|
| G | ✓ | ✓ | — | — | `in-progress` | `req-review` | Normal |
| A | ✓ | ✓ | — | ✓ | `in-progress` | `req-review` | WARN (both paths) |
| C | ✓ | any | ✓ | any | `in-progress` | `req-review` | WARN (both paths) |
| D | — | any | ✓ | any | `backlog` | `req-review` | Normal |
| B | — | ✓ | ✓ | ✓ | `backlog` | `req-review` | WARN (both paths) |
| E | — | ✓ | — | — | `in-progress` | `req-creation` | Normal |
| H | — | ✓ | — | ✓ | `in-progress` | `req-creation` | WARN (both paths) |
| F | — | — | — | ✓ | `backlog` | `req-creation` | Normal |
| (none) | — | — | — | — | `in-progress` | `req-creation` | Normal (PM Phase 0 handles folder creation) |

**Warning message format (all WARN cases):** The warning must contain `slug`, `docs/in-progress/<slug>/`, and `docs/backlog/<slug>/` as literal substrings (REQ-PD-03 AC).

**Structured log format (REQ-ER-02):** Always emitted after resolution:
```
Phase detection: slug=<slug> lifecycle=<lifecycle> reqPresent=<bool> overviewPresent=<bool> startAtPhase=<phase>
```

---

## 6. Error Handling

| Scenario | Component | Behavior |
|----------|-----------|----------|
| `FileSystem.exists()` returns `false` for all paths | `DefaultPhaseDetector` | Normal — resolves to `req-creation` |
| `FileSystem.exists()` throws (FakeFileSystem in tests) | `DefaultPhaseDetector` → propagates | `startNewWorkflow()` catches; logs error; posts Discord reply with slug + `"transient error during phase detection"`; does NOT start workflow |
| `FileSystem.exists()` throws real I/O error (NodeFileSystem in production) | `DefaultPhaseDetector` → propagates | `NodeFileSystem.exists()` (updated in this TSPEC — see §4.4) catches only `ENOENT`; all other errors (e.g., `EACCES`, `EIO`) propagate out of `detect()` and are caught by `startNewWorkflow()`'s try/catch, which logs the error and posts a Discord reply. REQ-ER-03 is satisfied in production. |
| Cross-lifecycle inconsistency (Cases A, B, C, H) | `DefaultPhaseDetector` | Logs warning with slug + both paths; continues with resolved result per general rule |
| `WorkflowExecutionAlreadyStartedError` from Temporal | `TemporalOrchestrator.startNewWorkflow()` | Posts "Workflow already running for `<slug>`" in thread (existing behavior preserved) |
| Other `startWorkflowForFeature` error | `TemporalOrchestrator.startNewWorkflow()` | Posts "Failed to start workflow for `<slug>`. Please try again." (existing behavior preserved) |

---

## 7. Test Strategy

### 7.1 Approach

- **Unit tests for `DefaultPhaseDetector`** use `FakeFileSystem` (configured via `existsResults` map and new `existsError` field) and `FakeLogger`. No live filesystem access.
- **Unit tests for `TemporalOrchestrator.startNewWorkflow()`** use a new `FakePhaseDetector` injected via `TemporalOrchestratorDeps`. Existing `startNewWorkflow` tests are updated to provide a `FakePhaseDetector`.
- **Workflow invariant tests** (REQ-WS-06) use the existing `resolveNextPhase()` unit test infrastructure and a `YamlWorkflowConfigLoader` against `ptah.workflow.yaml`.
- All tests are fast, isolated, and deterministic — no filesystem I/O, no Temporal server, no Discord.

### 7.2 Test Double: `FakeFileSystem` Extension

Add `existsError: Error | null = null` to the existing `FakeFileSystem` in `tests/fixtures/factories.ts`:

```typescript
export class FakeFileSystem implements FileSystem {
  // ...existing fields...
  existsError: Error | null = null;  // NEW: when set, exists() throws this error

  async exists(path: string): Promise<boolean> {
    if (this.existsError) throw this.existsError;          // NEW
    if (this.existsResults.has(path)) return this.existsResults.get(path)!;
    return this.files.has(path) || this.dirs.has(path);
  }
  // ...rest unchanged...
}
```

### 7.3 Test Double: `FakePhaseDetector`

Add to `tests/fixtures/factories.ts`:

```typescript
import type { PhaseDetector, PhaseDetectionResult } from "../../src/orchestrator/phase-detector.js";

export class FakePhaseDetector implements PhaseDetector {
  /** Default result returned by detect(). Override per test. */
  result: PhaseDetectionResult = {
    startAtPhase: "req-creation",
    resolvedLifecycle: "in-progress",
    reqPresent: false,
    overviewPresent: false,
  };

  /** When set, detect() throws this error instead of returning result. */
  detectError: Error | null = null;

  /** Records all slugs passed to detect(). */
  detectedSlugs: string[] = [];

  async detect(slug: string): Promise<PhaseDetectionResult> {
    this.detectedSlugs.push(slug);
    if (this.detectError) throw this.detectError;
    return this.result;
  }
}
```

### 7.4 Test Double: Updated `makeDeps()` in `temporal-orchestrator.test.ts`

The existing `makeDeps()` helper must be updated to include `phaseDetector`:

```typescript
function makeDeps(overrides?: Partial<TemporalOrchestratorDeps>): TemporalOrchestratorDeps {
  return {
    temporalClient: new FakeTemporalClient(),
    worker: new FakeTemporalWorker() as unknown as TemporalOrchestratorDeps["worker"],
    discordClient: new FakeDiscordClient(),
    logger: new FakeLogger(),
    config: defaultTestConfig(),
    workflowConfig: defaultTestWorkflowConfig(),
    agentRegistry: new FakeAgentRegistry(),
    skillInvoker: new FakeSkillInvoker(),
    gitClient: new FakeGitClient(),
    phaseDetector: new FakePhaseDetector(),   // NEW
    ...overrides,
  };
}
```

### 7.5 Test Categories

#### `tests/unit/orchestrator/phase-detector.test.ts`

| # | Description | REQ | Type |
|---|-------------|-----|------|
| 1 | REQ present in `in-progress` → returns `req-review`, `in-progress` | REQ-WS-01, REQ-PD-01 | unit |
| 2 | REQ present in `backlog` only → returns `req-review`, `backlog` | REQ-WS-01, REQ-PD-01 | unit |
| 3 | Overview only in `in-progress`, no REQ → returns `req-creation`, `in-progress` | REQ-WS-02, REQ-PD-02 | unit |
| 4 | Overview only in `backlog`, no REQ → returns `req-creation`, `backlog` | REQ-WS-02 | unit |
| 5 | Neither REQ nor overview anywhere → returns `req-creation`, `in-progress` (covers REQ-NF-02 scenario 4 "PM Phase 0 bootstrap not disrupted" [REQ-WS-02, REQ-PD-04]; the read-only invariant — zero write/delete/rename operations — is additionally asserted in test #9) | REQ-WS-02, REQ-NF-02, REQ-PD-04 | unit |
| 6 | Case B (overview in `in-progress`, REQ+overview in `backlog`) → `backlog`, `req-review`, warning containing slug + both paths | REQ-PD-03 | unit |
| 7 | Case C (REQ in both folders) → `in-progress`, `req-review`, warning containing slug + both paths | REQ-PD-03 | unit |
| 8 | Case H (overview in both folders, no REQ) → `in-progress`, `req-creation`, warning containing slug + both paths | REQ-PD-03 | unit |
| 9 | Detection is read-only: FakeFileSystem records zero write/rename/delete calls | REQ-PD-04 | unit |
| 10 | Structured log entry contains all five key-value fields (slug, lifecycle, reqPresent, overviewPresent, startAtPhase) | REQ-ER-02 | unit |
| 11 | `existsError` set on FakeFileSystem → `detect()` throws (propagated) | REQ-ER-03 | unit |

#### `tests/unit/orchestrator/temporal-orchestrator.test.ts` (additions)

| # | Description | REQ | Type |
|---|-------------|-----|------|
| 12 | `handleMessage` Branch B with REQ detected → `startWorkflowForFeature` called with `startAtPhase: "req-review"` | REQ-WS-01, REQ-WS-03 | unit |
| 13 | `handleMessage` Branch B with no REQ → `startWorkflowForFeature` called with `startAtPhase: "req-creation"` | REQ-WS-02 | unit |
| 14 | `phaseDetector.detect()` throws → Discord reply in thread contains slug and `"transient error during phase detection"`, no workflow started | REQ-ER-03 | unit |
| 15 | `handleMessage` Branch A (running workflow + ad-hoc directive) → routes through ad-hoc path, `phaseDetector.detect()` NOT called | REQ-WS-05 | unit |

#### `tests/unit/temporal/feature-lifecycle.test.ts` (additions)

| # | Description | REQ | Type |
|---|-------------|-----|------|
| 16 | `resolveNextPhase()` with sequential config never returns a phase at array index lower than the input phase (REQ-WS-06a) | REQ-WS-06 | unit |
| 17 | `ptah.workflow.yaml`: no phase at index ≥ index of `req-review` has a `transition` pointing to `req-creation` (REQ-WS-06b) | REQ-WS-06 | unit |
| 18 | `resolveNextPhase()` walked forward from `req-review` in a sequential config that includes `req-creation` before `req-review`: `req-creation` never appears in the resulting phase sequence; and the sequence from `req-review` onward is identical to the suffix of the full sequence starting from `req-creation` with `req-creation` omitted (REQ-WS-04 activity-sequence AC) | REQ-WS-04 | unit |

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | How Realized |
|-------------|----------------------|--------------|
| REQ-PD-01 | `DefaultPhaseDetector.detect()` | Checks `docs/in-progress/<slug>/REQ-<slug>.md` and `docs/backlog/<slug>/REQ-<slug>.md` via `fs.exists()` |
| REQ-PD-02 | `DefaultPhaseDetector.detect()` | Checks `docs/in-progress/<slug>/overview.md` and `docs/backlog/<slug>/overview.md` via `fs.exists()` |
| REQ-PD-03 | `DefaultPhaseDetector.detect()` (decision table + warning logic) | Decision table applied in order per algorithm; warns via `logger.warn()` with both paths as substrings |
| REQ-PD-04 | `DefaultPhaseDetector.detect()` — no write calls made | `FileSystem.exists()` is the only method called; no `writeFile`, `rename`, `copyFile`, `mkdir`, or `appendFile` |
| REQ-WS-01 | `DefaultPhaseDetector.detect()` → `startAtPhase: "req-review"` → `startWorkflowForFeature(startAtPhase)` | When `inProgressReq || backlogReq`, returns `"req-review"`; passed to `startWorkflowForFeature` |
| REQ-WS-02 | `DefaultPhaseDetector.detect()` → `startAtPhase: "req-creation"` | When no REQ found, returns `"req-creation"` |
| REQ-WS-03 | `TemporalOrchestrator.startNewWorkflow()` + `FakePhaseDetector` (unit test) | Test verifies `startFeatureWorkflow` receives `startAtPhase: "req-review"` and `FakeFileSystem` records zero write operations |
| REQ-WS-04 | `resolveNextPhase()` (test #18 in `feature-lifecycle.test.ts`) + existing `buildInitialWorkflowState` test | Test #18 walks `resolveNextPhase()` forward from `req-review` in a sequential config and asserts: (a) `req-creation` never appears in the resulting sequence; (b) the sequence from `req-review` onward equals the suffix of the full sequence from `req-creation` with `req-creation` omitted. The existing `buildInitialWorkflowState` test ("starts at the specified phase when startAtPhase is provided") at `feature-lifecycle.test.ts:342` verifies that `currentPhaseId` is set to the requested start phase. Together these cover the REQ-WS-04 activity-sequence AC. |
| REQ-WS-05 | `TemporalOrchestrator.handleMessage()` Branch A (no change) | Ad-hoc path checked before `startNewWorkflow` — `phaseDetector.detect()` is never called for running workflows |
| REQ-WS-06 | `resolveNextPhase()` unit test (a) + `ptah.workflow.yaml` config integrity test (b) | (a) Pure function test with sequential config; (b) YAML loaded and inspected for backward transitions |
| REQ-ER-02 | `DefaultPhaseDetector.detect()` — `logger.info()` call | Structured key-value message logged after every successful detection |
| REQ-ER-03 | `TemporalOrchestrator.startNewWorkflow()` try/catch around `phaseDetector.detect()` | Catches throw → `logger.error()` + `discord.postPlainMessage(threadId, "<slug>: transient error during phase detection...")` + return without starting workflow |
| REQ-NF-02 | All 9 test scenarios (see §7.5) | Each scenario maps to a numbered test case |
| REQ-NF-03 | No changes to API surface | No Discord message shape, `StartWorkflowParams` fields (beyond `startAtPhase` which already existed), or config schema change |
| REQ-NF-04 | `DefaultPhaseDetector.detect()` uses `this.logger.info()` / `this.logger.warn()` | Existing `Logger` interface is used; `console.log` is never called |

---

## 9. Integration Points

| Integration Point | File | Change Type | Notes |
|------------------|------|-------------|-------|
| `NodeFileSystem.exists()` | `src/services/filesystem.ts:36-43` | Behavior change | Catch only `ENOENT`; propagate all other errors to enable REQ-ER-03 in production (see §4.4) |
| `TemporalOrchestratorDeps` | `temporal-orchestrator.ts:68-78` | Add field | Add `phaseDetector: PhaseDetector` |
| `TemporalOrchestrator` constructor | `temporal-orchestrator.ts:126-136` | Add assignment | `this.phaseDetector = deps.phaseDetector` |
| `TemporalOrchestrator.startNewWorkflow()` | `temporal-orchestrator.ts:399-428` | Replace body | Phase detection before workflow start |
| `bin/ptah.ts` composition root | `bin/ptah.ts:258-268` | Add instantiation + wiring | `new DefaultPhaseDetector(fs, logger)` wired into deps |
| `FakeFileSystem` | `tests/fixtures/factories.ts:57-197` | Add field | `existsError: Error | null = null` + guard in `exists()` |
| `makeDeps()` | `tests/unit/orchestrator/temporal-orchestrator.test.ts:21-34` | Add field | `phaseDetector: new FakePhaseDetector()` |

**Existing tests affected:**
- All existing `handleMessage` tests that exercise Branch B (no running workflow + agent mention) must have a `FakePhaseDetector` in `makeDeps()`. Since `makeDeps()` is updated to include a default `FakePhaseDetector` (with `startAtPhase: "req-creation"`), existing tests for Branch B that don't check `startAtPhase` will continue to pass without modification.
- Existing `startWorkflowForFeature` tests are unaffected (they call `startWorkflowForFeature` directly, bypassing `startNewWorkflow`).

---

## 10. Open Questions

None. All REQ-level decisions have been resolved in REQ v3.0:

- **Q-01 resolved:** `FileSystem.exists()` is sufficient; no interface extension required. `NodeFileSystem.exists()` is updated to catch only `ENOENT` and propagate all other errors, satisfying REQ-ER-03 in production without any interface change (§4.4). No REQ update is required.
- **Q-02 resolved:** `FeatureResolver` interface must not be modified. `DefaultPhaseDetector` makes independent `fs.exists()` calls per path. `FeatureResolver` is not used by `PhaseDetector`.
- **REQ-WS-06:** Two-part test — `resolveNextPhase()` algorithm unit test + `ptah.workflow.yaml` config integrity test.
- **TemporalOrchestratorDeps extension:** Expected and pre-authorized in REQ-PD-03 Scope Boundaries.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-10 | Engineer | Initial TSPEC for fix-req-overwrite-on-start |
| 1.1 | 2026-04-10 | Engineer | Addressed product-manager cross-review findings. **F-01 (High):** Updated `NodeFileSystem.exists()` to catch only `ENOENT` and propagate real I/O errors (EACCES, EIO, etc.), satisfying REQ-ER-03 in production without extending the `FileSystem` interface (option b from PM review). Added §4.4 with implementation; updated §3 project structure, §4.2 design rationale, §6 error handling row 3, §9 integration points, and §10 open questions accordingly. **F-02 (Medium):** Added test #18 to §7.5 for REQ-WS-04 activity-sequence AC (`resolveNextPhase()` walked forward from `req-review`); updated §8 REQ-WS-04 mapping to cite test #18 alongside the existing `buildInitialWorkflowState` test. **F-03 (Low):** Annotated test #5 description to explicitly reference REQ-NF-02 scenario 4, REQ-PD-04, and the link to test #9's read-only assertion. |
