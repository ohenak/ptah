# Technical Specification

## Orchestrate-Dev Workflow Alignment

| Field | Detail |
|-------|--------|
| **Document ID** | TSPEC-021 |
| **Parent Documents** | REQ-021 (v1.3), FSPEC-021 (v1.2) |
| **Version** | 1.1 |
| **Date** | April 22, 2026 |
| **Author** | Senior Software Engineer |
| **Status** | Draft |

---

## 1. Overview

This document specifies the full technical design for the orchestrate-dev workflow alignment. It covers every file that must be modified or created, the exact TypeScript types, function signatures, algorithms, error handling, and integration contracts required for a developer to implement the feature directly from this document.

---

## 2. Technology Stack and Dependencies

No new external dependencies are required. All changes use existing dependencies already present in `ptah/package.json`:

- TypeScript (ESM, Node 20 LTS)
- `@temporalio/workflow`, `@temporalio/client`, `@temporalio/worker` — existing Temporal SDK
- `js-yaml` — existing YAML parser
- `node:fs/promises`, `node:path`, `node:readline` — Node.js stdlib (no new imports)
- `vitest` — existing test framework

---

## 3. Project Structure — Files Changed

### 3.1 New Files

| File | Purpose |
|------|---------|
| `ptah/src/commands/run.ts` | `RunCommand` class — `ptah run` CLI entry point |
| `ptah/tests/unit/commands/run.test.ts` | Unit tests for `RunCommand` |

### 3.2 Modified Files

| File | Change Summary |
|------|----------------|
| `ptah/bin/ptah.ts` | Add `run` case to CLI switch |
| `ptah/src/config/defaults.ts` | Replace 3-agent manifest with 8-role manifest; update `buildConfig()` and `ptah.workflow.yaml` template |
| `ptah/src/config/workflow-config.ts` | Replace `SkipCondition` type with discriminated union |
| `ptah/src/config/workflow-validator.ts` | Update `validateStructure()` to accept new `SkipCondition` variants; add `revision_bound` validation for review phases |
| `ptah/src/temporal/types.ts` | Add `writtenVersions` to `ReviewState`; add `revisionCount` to `ReadCrossReviewInput` and `SkillActivityInput`; add `artifactExists` to `FeatureWorkflowState` |
| `ptah/src/temporal/client.ts` | Add `signalHumanAnswer()` method; extend `listWorkflowsByPrefix()` with optional `statusFilter` parameter |
| `ptah/src/temporal/activities/cross-review-activity.ts` | Pass `revisionCount` to `crossReviewPath()`; refactor heading extraction out of `parseRecommendation()` into caller |
| `ptah/src/temporal/workflows/feature-lifecycle.ts` | Extend `evaluateSkipCondition()`; update `isCompletionReady()`; add `checkArtifactExists` activity proxy; pre-loop artifact scan; `deriveDocumentType` special-case; `buildContinueAsNewPayload()` carry `reviewStates`; `runReviewCycle()` revision versioning and full-reviewer context; remove `mapRecommendationToStatus()` |
| `ptah/src/orchestrator/pdlc/cross-review-parser.ts` | Add new `SKILL_TO_AGENT` entries; add `VALUE_MATCHERS` entries; add `revisionCount` param to `crossReviewPath()`; refactor `parseRecommendation()` to accept extracted value |
| `ptah/tests/fixtures/factories.ts` | Add `signalHumanAnswer()` and updated `listWorkflowsByPrefix()` to `FakeTemporalClient` |
| `ptah/tests/unit/commands/init.test.ts` | Update `FILE_MANIFEST` length assertion |
| `ptah/tests/unit/orchestrator/cross-review-parser.test.ts` | Add tests for new VALUE_MATCHERS, AGENT_TO_SKILL, and `crossReviewPath()` revision count |
| `ptah/tests/unit/temporal/cross-review-activity.test.ts` | Update tests to reflect two-step parse pattern |
| `ptah/tests/unit/temporal/workflows/feature-lifecycle.test.ts` | Add tests for all new helpers; update `buildContinueAsNewPayload` fixture; add static-scan test |

---

## 4. Type Definitions

### 4.1 `SkipCondition` — `ptah/src/config/workflow-config.ts`

Replace the current `SkipCondition` interface with a discriminated union:

```typescript
export type SkipCondition =
  | { field: `config.${string}`; equals: boolean }
  | { field: "artifact.exists"; artifact: string };
```

**Co-changes required together:**

1. Replace `interface SkipCondition { field: string; equals: boolean }` in `workflow-config.ts` with the type alias above.
2. Update `evaluateSkipCondition()` signature in `feature-lifecycle.ts` (Section 5.1).
3. Update all `evaluateSkipCondition()` call sites in `feature-lifecycle.ts` to pass the third `artifactExists` argument.

### 4.2 `ReviewState` — `ptah/src/temporal/types.ts`

Add `writtenVersions` field:

```typescript
export interface ReviewState {
  reviewerStatuses: Record<string, ReviewerStatusValue>;
  revisionCount: number;
  writtenVersions: Record<string, number>;  // agentId → highest revision dispatched
}
```

All existing `ReviewState` construction sites must initialize `writtenVersions: {}`.

### 4.3 `FeatureWorkflowState` — `ptah/src/temporal/types.ts`

Add `artifactExists` and `activeAgentIds` fields:

```typescript
export interface FeatureWorkflowState {
  // ... existing fields ...
  /** Pre-fetched artifact existence map. Keyed by docType (e.g. "REQ", "FSPEC"). */
  artifactExists: Record<string, boolean>;
  /**
   * Agent IDs currently running (dispatched but not yet returned).
   * Set by the workflow when an agent is invoked; cleared when it completes.
   * Used by pollUntilTerminal() to detect "addressing feedback" optimizer dispatch.
   */
  activeAgentIds: string[];
}
```

Initialize `artifactExists` to `{}` and `activeAgentIds` to `[]` in `buildInitialWorkflowState()`.

**`activeAgentIds` lifecycle:**
- When `invokeSkill` is dispatched for the optimizer (author) agent in `runReviewCycle()`, add the agentId to `state.activeAgentIds`.
- When the optimizer completes (or fails), remove the agentId from `state.activeAgentIds`.
- Reviewer agents are also tracked in `activeAgentIds` while they are running (added on dispatch, removed on completion). This enables `pollUntilTerminal()` to detect whether the author agent is active.

**`queryWorkflowState()` return value:** The `FeatureWorkflowState` returned by `queryWorkflowState()` includes `activeAgentIds`. The `pollUntilTerminal()` algorithm uses `state.activeAgentIds` directly — it does NOT access `state.workflowConfig`. The `PHASE_LABELS` static map in `run.ts` provides phase label lookup by phase ID; `workflowConfig` is not needed at poll time.

### 4.4 `ReadCrossReviewInput` — `ptah/src/temporal/types.ts`

Add `revisionCount`:

```typescript
export interface ReadCrossReviewInput {
  featurePath: string;
  agentId: string;
  documentType: string;
  revisionCount?: number;  // 1-indexed; undefined = revision 1 (unversioned)
}
```

### 4.5 `SkillActivityInput` — `ptah/src/temporal/types.ts`

Add `revisionCount`:

```typescript
export interface SkillActivityInput {
  // ... existing fields ...
  revisionCount?: number;  // 1-indexed; injected into agent context prompt
}
```

### 4.6 `ContinueAsNewPayload` — `ptah/src/temporal/workflows/feature-lifecycle.ts`

Extend to carry `reviewStates`:

```typescript
export interface ContinueAsNewPayload {
  featurePath: string | null;
  worktreeRoot: null;
  signOffs: Record<string, string>;
  adHocQueue: AdHocRevisionSignal[];
  reviewStates: Record<string, ReviewState>;  // NEW — carries writtenVersions
}
```

---

## 5. Function Signatures and Algorithms

### 5.1 `evaluateSkipCondition()` — `feature-lifecycle.ts`

**New signature:**

```typescript
export function evaluateSkipCondition(
  condition: SkipCondition,
  featureConfig: FeatureConfig,
  artifactExists?: Record<string, boolean>,
): boolean
```

**Algorithm:**

```
evaluateSkipCondition(condition, featureConfig, artifactExists)
  │
  ├── condition.field starts with "config." →
  │     fieldKey = condition.field.slice(7)
  │     value = featureConfig[fieldKey]
  │     if typeof value !== "boolean" → return false
  │     return value === condition.equals
  │
  └── condition.field === "artifact.exists" →
        if artifactExists === undefined →
          throw new Error(
            "evaluateSkipCondition: artifactExists map not yet populated — " +
            "checkArtifactExists Activity must run before evaluating artifact.exists conditions"
          )
        return artifactExists[condition.artifact] ?? false
```

**Call site updates** — every `evaluateSkipCondition(condition, featureConfig)` call in `feature-lifecycle.ts` becomes `evaluateSkipCondition(condition, featureConfig, state.artifactExists)`. There are three call sites:
1. In the main workflow loop (evaluating `currentPhase.skip_if`)
2. In `resolveNextPhase()` (evaluating `nextPhase.skip_if`)
3. In `executeCascade()` (evaluating `reviewPhase.skip_if`)

**Important:** `resolveNextPhase()` must NOT catch the `Error` thrown for `artifact.exists` conditions when `artifactExists` is undefined — the error propagates to the Temporal workflow boundary and fails the execution with the message intact.

### 5.2 `isCompletionReady()` — `feature-lifecycle.ts`

**New signature:**

```typescript
export function isCompletionReady(
  signOffs: Record<string, boolean>,
  workflowConfig: WorkflowConfig,
): boolean
```

**Sign-off value type:** Per REQ-WF-06 and FSPEC-WF-02 BR-WF-09, sign-offs are stored as **boolean** values in `signOffs`. Both `"approved"` and `"approved_with_minor_issues"` recommendations map through `parseRecommendation()` → `{ status: "approved" }` → stored as `true` in `signOffs`. A `"revision_requested"` or absent entry maps to `false`. The sign-off map type is therefore `Record<string, boolean>`, not `Record<string, string>`.

**Algorithm:**

```
isCompletionReady(signOffs, workflowConfig)
  │
  ├── Find phase with id === "implementation-review" in workflowConfig.phases
  │
  ├── Phase NOT found →
  │     LEGACY FALLBACK: return signOffs["qa"] === true && signOffs["pm"] === true
  │
  └── Phase found →
        requiredAgents = computeReviewerList(phase.reviewers, { discipline: "default" } as FeatureConfig)
        // computeReviewerList reads phase.reviewers; the FeatureConfig stub with
        // discipline: "default" forces the "default" reviewer-manifest fallback path.
        for each agentId in requiredAgents:
          if signOffs[agentId] !== true → return false
        return true
```

**Edge cases:**
- Empty reviewers list (`requiredAgents = []`) → returns `true` (vacuous truth — per FSPEC-WF-02 BR-WF-10)
- Sign-off values are boolean: `true` = approved, `false` = revision requested or absent. The check `signOffs[agentId] !== true` correctly handles both `false` entries and missing keys.

**Call site updates** — both `isCompletionReady(state.signOffs)` calls in `feature-lifecycle.ts` become `isCompletionReady(state.signOffs, workflowConfig)`. The `state.signOffs` type is updated from `Record<string, string>` to `Record<string, boolean>` wherever it is declared.

### 5.3 `crossReviewPath()` — `cross-review-parser.ts`

**New signature:**

```typescript
export function crossReviewPath(
  featurePath: string,
  skillName: string,
  documentType: string,
  revisionCount?: number,
): string
```

**Algorithm:**

```
crossReviewPath(featurePath, skillName, documentType, revisionCount)
  │
  ├── effectiveRevision = max(1, revisionCount ?? 1)
  │     (clamp 0 or negative to 1; undefined treated as 1)
  │
  ├── effectiveRevision === 1 →
  │     return "{featurePath}CROSS-REVIEW-{skillName}-{documentType}.md"
  │
  └── effectiveRevision >= 2 →
        return "{featurePath}CROSS-REVIEW-{skillName}-{documentType}-v{effectiveRevision}.md"
```

### 5.4 `parseRecommendation()` — `cross-review-parser.ts`

**Refactored signature** (breaking change — accepts extracted field value, not full file content):

```typescript
export function parseRecommendation(
  recommendationFieldValue: string,
): ParsedRecommendation
```

**Algorithm:**

```
parseRecommendation(recommendationFieldValue)
  │
  ├── normalized = recommendationFieldValue.trim().toLowerCase()
  │
  ├── Match against VALUE_MATCHERS (first match wins):
  │     "approved with minor changes" → { status: "approved" }
  │     "approved with minor issues"  → { status: "approved" }   ← NEW
  │     "approved"                    → { status: "approved" }
  │     "lgtm"                        → { status: "approved" }
  │     "need attention"              → { status: "revision_requested" }  ← NEW
  │     "needs revision"              → { status: "revision_requested" }
  │     "revision requested"          → { status: "revision_requested" }
  │
  └── No match → { status: "revision_requested" }  (conservative default)
```

**VALUE_MATCHERS array** (order matters — longer match first to prevent partial matches):

```typescript
const VALUE_MATCHERS: Array<{ pattern: string; status: "approved" | "revision_requested" }> = [
  { pattern: "approved with minor changes", status: "approved" },
  { pattern: "approved with minor issues",  status: "approved" },   // NEW
  { pattern: "approved",                    status: "approved" },
  { pattern: "lgtm",                        status: "approved" },
  { pattern: "need attention",              status: "revision_requested" },  // NEW
  { pattern: "needs revision",              status: "revision_requested" },
  { pattern: "revision requested",          status: "revision_requested" },
];
```

**Caller migration** — the heading-extraction logic (HEADING_PATTERN, BOLD_PATTERN, TABLE_PATTERN, code-fence handling, extractValueFromLine, multi-line look-ahead) moves from `parseRecommendation()` into a new private helper `extractRecommendationValue(fileContent: string): string | null` in `cross-review-parser.ts`. The `readCrossReviewRecommendation` activity calls `extractRecommendationValue()` then passes the result to `parseRecommendation()`:

```typescript
// In readCrossReviewRecommendation (cross-review-activity.ts):
const rawValue = extractRecommendationValue(content);
if (rawValue === null) {
  return { status: "parse_error", reason: "No Recommendation heading found" };
}
const parsed = parseRecommendation(rawValue);
if (parsed.status === "parse_error") {
  return parsed;
}
return { status: parsed.status };
```

`extractRecommendationValue()` encapsulates the existing heading scan logic and returns `null` when no heading is found or the value is empty.

### 5.5 `deriveDocumentType()` — `feature-lifecycle.ts`

**Algorithm extension** (special-case lookup before regex):

```typescript
const DOCUMENT_TYPE_OVERRIDES: Record<string, string> = {
  "properties-tests": "PROPERTIES",
};

export function deriveDocumentType(phaseId: string): string {
  if (DOCUMENT_TYPE_OVERRIDES[phaseId]) {
    return DOCUMENT_TYPE_OVERRIDES[phaseId];
  }
  return phaseId.replace(/-(?:creation|review|approved)$/, "").toUpperCase();
}
```

### 5.6 `buildInitialWorkflowState()` — `feature-lifecycle.ts`

Initialize new fields on the returned state:

```typescript
return {
  // ... existing fields ...
  reviewStates: initialReviewState ?? {},  // existing — but ReviewState now has writtenVersions
  artifactExists: {},  // NEW — populated by pre-loop checkArtifactExists Activity
};
```

When `initialReviewState` is provided (from `ContinueAsNew`), the `ReviewState` objects in it already have `writtenVersions` populated (carried forward by `buildContinueAsNewPayload()`).

### 5.7 `buildContinueAsNewPayload()` — `feature-lifecycle.ts`

**Extended parameter and return types:**

```typescript
export function buildContinueAsNewPayload(
  state: Pick<FeatureWorkflowState, "featurePath" | "signOffs" | "adHocQueue" | "reviewStates">,
): ContinueAsNewPayload {
  return {
    featurePath: state.featurePath,
    worktreeRoot: null,
    signOffs: { ...state.signOffs },
    adHocQueue: [...state.adHocQueue],
    reviewStates: structuredCopy(state.reviewStates),  // deep copy preserving writtenVersions
  };
}
```

`structuredCopy` of `reviewStates`: copy each `ReviewState` as `{ reviewerStatuses: { ...rs.reviewerStatuses }, revisionCount: rs.revisionCount, writtenVersions: { ...rs.writtenVersions } }`.

**Call site in `featureLifecycleWorkflow`:** the `ContinueAsNew` invocation (if present) must pass `reviewStates: payload.reviewStates` into the next run's `StartWorkflowParams.initialReviewState`.

### 5.8 Pre-Loop `checkArtifactExists` Activity — `feature-lifecycle.ts`

**Activity interface addition to `WorkflowActivities`:**

```typescript
interface WorkflowActivities {
  // ... existing ...
  checkArtifactExists(input: CheckArtifactExistsInput): Promise<boolean>;
}
```

**New type in `temporal/types.ts`:**

```typescript
export interface CheckArtifactExistsInput {
  slug: string;
  docType: string;
  featurePath: string;  // resolved feature folder path
}
```

**Activity proxy registration** (in `feature-lifecycle.ts`):

```typescript
const { checkArtifactExists } = wf.proxyActivities<{
  checkArtifactExists(input: CheckArtifactExistsInput): Promise<boolean>;
}>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 2, initialInterval: "2 seconds" },
});
```

**Activity implementation** (new function in `ptah/src/temporal/activities/skill-activity.ts` or a new `artifact-activity.ts`):

```typescript
export async function checkArtifactExists(
  input: CheckArtifactExistsInput,
  fs: FileSystem,
): Promise<boolean> {
  const { docType, slug, featurePath } = input;
  const filePath = `${featurePath}${docType}-${slug}.md`;
  try {
    const content = await fs.readFile(filePath);
    return content.trim().length > 0;  // non-empty file = artifact exists
  } catch {
    return false;
  }
}
```

**Pre-loop algorithm in `featureLifecycleWorkflow`** (runs after `resolveFeaturePath`, before the main `while(true)` loop):

```
Pre-loop artifact scan:
  │
  ├── Collect unique docTypes from all phases in workflowConfig where
  │   phase.skip_if?.field === "artifact.exists"
  │   (scan full config — all phases, regardless of startAtPhase)
  │
  ├── For each unique docType:
  │     result = await checkArtifactExists({
  │       slug: featureSlug,
  │       docType: docType,
  │       featurePath: state.featurePath ?? "./",
  │     })
  │     state.artifactExists[docType] = result
  │
  └── _state = state
      (pre-loop scan complete; main loop may now call evaluateSkipCondition
       with artifact.exists conditions)
```

### 5.9 `runReviewCycle()` — revision count threading

**Changes to the review dispatch block** (after initialization of `reviewState`):

```typescript
// 1. Compute current revision number (1-indexed)
const currentRevision = reviewState.revisionCount + 1;

// 2. Dispatch reviewers with revisionCount
// In the reviewer loop (replacing the existing invokeSkill call):
const input = buildInvokeSkillInput({
  phase: reviewPhase,
  agentId: reviewerId,
  featureSlug: state.featureSlug,
  featureConfig: state.featureConfig,
  forkJoin: false,
  isRevision: false,
  resolvedContextDocumentRefs: resolvedContextDocs,
  revisionCount: currentRevision,  // NEW
});

// 3. After each reviewer is dispatched:
reviewState.writtenVersions[reviewerId] = currentRevision;

// 4. Pass revisionCount to readCrossReviewRecommendation:
const crossReviewResult = await readCrossReviewRecommendation({
  featurePath: state.featurePath!,
  agentId: reviewerId,
  documentType: docType,
  revisionCount: currentRevision,  // NEW
});
```

**Changes to the revision dispatch block** (replacing the existing `crossReviewRefs` construction at line 1318):

Remove the existing `.filter((id) => reviewState.reviewerStatuses[id] === "revision_requested")` filter.

Replace with full version history enumeration (FSPEC-CR-03):

```typescript
const crossReviewRefs: string[] = [];
for (const reviewerId of Object.keys(reviewState.writtenVersions)) {
  const skillName = agentIdToSkillName(reviewerId) ?? reviewerId;
  const highestVersion = reviewState.writtenVersions[reviewerId];
  for (let v = 1; v <= highestVersion; v++) {
    const path = crossReviewPath(state.featurePath!, skillName, revisionDocType, v);
    // Check file existence (BR-CR-13: silently skip missing files)
    // Use a synchronous-style check: the path is added unconditionally,
    // and the skill-activity context assembler will skip unreadable refs.
    // For correct behavior per FSPEC-CR-03, existence is checked here:
    const pathToAdd = path;
    crossReviewRefs.push(pathToAdd);
    // Note: missing-file silent-skip is handled inside invokeSkill context assembly
    // (contextDocumentRefs that don't resolve to readable files are skipped by
    // DefaultContextAssembler). No workflow-level check needed.
  }
}
```

**Initialization of `writtenVersions`** — in the `if (!state.reviewStates[reviewPhase.id])` block:

```typescript
state.reviewStates[reviewPhase.id] = {
  reviewerStatuses: {},
  revisionCount: 0,
  writtenVersions: {},  // NEW
};
```

### 5.10 `buildInvokeSkillInput()` — `revisionCount` injection

Add `revisionCount` to `BuildInvokeSkillInputParams`:

```typescript
export interface BuildInvokeSkillInputParams {
  // ... existing ...
  revisionCount?: number;
}
```

When `revisionCount` is provided, inject the expected output filename into the agent's context prompt via a convention-string appended to the context:

```typescript
export function buildInvokeSkillInput(
  params: BuildInvokeSkillInputParams,
): SkillActivityInput {
  const { revisionCount, ...rest } = params;
  const input: SkillActivityInput = {
    // ... existing field assignments ...
    ...(revisionCount !== undefined ? { revisionCount } : {}),
  };
  return input;
}
```

The `invokeSkill` activity in `skill-activity.ts` must read `input.revisionCount` and, when present, append the cross-review output filename line to the skill prompt context. This is done in the context assembly step — after building the context bundle, prepend to the user message:

```
Cross-review output file: CROSS-REVIEW-{skillName}-{documentType}[-v{N}].md
```

Where `skillName = agentIdToSkillName(agentId) ?? agentId`, `documentType = input.documentType`, and `[-v{N}]` is omitted when `revisionCount === 1` or absent.

### 5.11 `TemporalClientWrapper` extensions — `client.ts`

**`listWorkflowsByPrefix` extended signature:**

```typescript
export interface TemporalClientWrapper {
  // ... existing methods ...
  listWorkflowsByPrefix(
    prefix: string,
    options?: { statusFilter?: ("Running" | "ContinuedAsNew")[] },
  ): Promise<string[]>;
  signalHumanAnswer(workflowId: string, answer: string): Promise<void>;
}
```

**`TemporalClientWrapperImpl` implementation of `listWorkflowsByPrefix`:**

```typescript
async listWorkflowsByPrefix(
  prefix: string,
  options?: { statusFilter?: ("Running" | "ContinuedAsNew")[] },
): Promise<string[]> {
  this.ensureConnected();
  let query = `WorkflowId STARTS_WITH '${prefix}'`;
  if (options?.statusFilter && options.statusFilter.length > 0) {
    const statuses = options.statusFilter
      .map(s => `'${s}'`)
      .join(", ");
    query += ` AND ExecutionStatus IN (${statuses})`;
  }
  const ids: string[] = [];
  const iterable = this.workflowClient!.list({ query });
  for await (const info of iterable) {
    ids.push(info.workflowId);
  }
  return ids;
}
```

**`TemporalClientWrapperImpl.signalHumanAnswer`:**

```typescript
async signalHumanAnswer(workflowId: string, answer: string): Promise<void> {
  this.ensureConnected();
  const handle = this.workflowClient!.getHandle(workflowId);
  await handle.signal("humanAnswerSignal", answer);
}
```

**`FakeTemporalClient` co-changes** (in `tests/fixtures/factories.ts`):

```typescript
export class FakeTemporalClient implements TemporalClientWrapper {
  // ... existing fields ...
  humanAnswerSignals: Array<{ workflowId: string; answer: string }> = [];
  listWorkflowsByPrefixOptions: Array<{ prefix: string; options?: { statusFilter?: ("Running" | "ContinuedAsNew")[] } }> = [];

  async listWorkflowsByPrefix(
    prefix: string,
    options?: { statusFilter?: ("Running" | "ContinuedAsNew")[] },
  ): Promise<string[]> {
    this.listWorkflowsByPrefixOptions.push({ prefix, options });
    const allIds = this.workflowIds.get(prefix) ?? [];
    if (!options?.statusFilter || options.statusFilter.length === 0) {
      return allIds;
    }
    // Filter in-memory list by status
    // FakeTemporalClient tracks statuses in workflowStatuses map
    return allIds.filter(id => {
      const status = this.workflowStatuses?.get(id);
      return status ? options.statusFilter!.includes(status as "Running" | "ContinuedAsNew") : false;
    });
  }

  workflowStatuses: Map<string, string> = new Map();

  async signalHumanAnswer(workflowId: string, answer: string): Promise<void> {
    this.humanAnswerSignals.push({ workflowId, answer });
    this.sentSignals.push({ workflowId, signal: "humanAnswerSignal", payload: answer });
  }
}
```

---

## 6. New Component: `RunCommand` — `ptah/src/commands/run.ts`

### 6.1 Interface and Dependencies

```typescript
export interface RunCommandDeps {
  fs: FileSystem;
  temporalClient: TemporalClientWrapper;
  workflowConfigLoader: WorkflowConfigLoader;
  configLoader: RunConfigLoader;  // lenient — no discord required
  stdout: NodeJS.WriteStream;     // injectable for testing (default: process.stdout)
  stderr: NodeJS.WriteStream;     // injectable for testing (default: process.stderr)
  stdin: NodeJS.ReadableStream;   // injectable for testing (default: process.stdin)
}

export interface RunCommandParams {
  reqPath: string;
  fromPhase?: string;
}

export class RunCommand {
  constructor(private deps: RunCommandDeps) {}

  async execute(params: RunCommandParams): Promise<number>  // returns exit code
}
```

### 6.2 `RunConfigLoader` — lenient config loader

`ptah start` uses `NodeConfigLoader` which requires a `discord` section. `ptah run` needs a lenient variant that treats a missing `discord` section as valid.

```typescript
export interface RunConfig {
  temporal: TemporalConfig;
  discord?: {
    bot_token_env: string;
    server_id: string;
    channels: { updates: string; questions: string; debug: string };
    mention_user_id: string;
  };
}

export class LenientConfigLoader {
  constructor(private fs: FileSystem) {}
  async load(): Promise<RunConfig>
}
```

`LenientConfigLoader.load()` reads `ptah.config.json`, parses JSON, applies Temporal defaults (same as `NodeConfigLoader.applyTemporalDefaults()`), and returns without throwing if `discord` is absent. It throws only if `ptah.config.json` is missing or contains invalid JSON.

### 6.3 `RunCommand.execute()` Algorithm

```
execute(params: { reqPath, fromPhase? })
  │
  ├── STEP 1: Validate REQ file
  │     ├── await fs.exists(reqPath) → false:
  │     │     stdout.write("Error: REQ file not found: {reqPath}\n")
  │     │     return 1
  │     └── await fs.readFile(reqPath) → content
  │           content.trim() === "":
  │             stdout.write("Error: REQ file is empty: {reqPath}\n")
  │             return 1
  │
  ├── STEP 2: Derive feature slug
  │     featureFolder = path.dirname(reqPath)  // "docs/in-progress/my-feature"
  │     slug = path.basename(featureFolder)    // "my-feature"
  │     // Edge case: no parent directory → strip "REQ-" prefix and ".md" extension
  │     if slug === "" || slug === ".":
  │       slug = path.basename(reqPath, ".md").replace(/^REQ-/, "")
  │
  ├── STEP 3: Load workflow config
  │     try:
  │       workflowConfig = await workflowConfigLoader.load()
  │     catch WorkflowConfigError:
  │       stdout.write("Error: ptah.workflow.yaml not found in current directory.\n")
  │       return 1
  │
  ├── STEP 4: Resolve startAtPhase (→ Section 6.4)
  │     result = await resolveStartPhase({ reqPath, slug, fromPhase, workflowConfig, fs })
  │     if result.error:
  │       stdout.write(result.error + "\n")
  │       return 1
  │     startAtPhase = result.phase
  │     if result.logMessage:
  │       stdout.write(result.logMessage + "\n")
  │
  ├── STEP 5: Check for duplicate running workflow
  │     try:
  │       running = await temporalClient.listWorkflowsByPrefix(
  │         "ptah-{slug}",
  │         { statusFilter: ["Running", "ContinuedAsNew"] }
  │       )
  │     catch err:
  │       stdout.write("Error: unable to check for running workflows: {err.message}\n")
  │       return 1
  │     if running.length > 0:
  │       stdout.write("Error: workflow already running for feature \"{slug}\". " +
  │                    "Use --from-phase to restart from a specific phase after " +
  │                    "terminating the existing workflow.\n")
  │       return 1
  │
  ├── STEP 6: Load ptah config (for Discord detection and Temporal config)
  │     runConfig = await configLoader.load()   // lenient — no discord required
  │     temporalConfig = runConfig.temporal ?? DEFAULT_TEMPORAL_CONFIG
  │
  ├── STEP 7: Connect and start workflow
  │     await temporalClient.connect()
  │     workflowId = await temporalClient.startFeatureWorkflow({
  │       featureSlug: slug,
  │       featureConfig: buildDefaultFeatureConfig(slug),
  │       workflowConfig,
  │       startAtPhase,
  │     })
  │
  └── STEP 8: Progress polling loop (→ Section 6.5)
        exitCode = await pollUntilTerminal({
          workflowId,
          temporalClient,
          discordConfig: runConfig.discord,
          stdout,
          stderr,
          stdin,
          featureFolder: path.dirname(reqPath),
          slug,
        })
        await temporalClient.disconnect()
        return exitCode
```

### 6.4 `resolveStartPhase()` Algorithm

```typescript
interface ResolveStartPhaseParams {
  reqPath: string;
  slug: string;
  fromPhase?: string;
  workflowConfig: WorkflowConfig;
  fs: FileSystem;
}

interface ResolveStartPhaseResult {
  phase: string;
  logMessage?: string;
  error?: string;
}

async function resolveStartPhase(
  params: ResolveStartPhaseParams,
): Promise<ResolveStartPhaseResult>
```

**Algorithm:**

This is the single authoritative algorithm for `resolveStartPhase()`. It handles all cases defined in FSPEC-CLI-02 and REQ-CLI-05.

```
resolveStartPhase({ reqPath, slug, fromPhase, workflowConfig, fs })
  │
  ├── TIER 1: fromPhase provided
  │     phaseIds = workflowConfig.phases.map(p => p.id)
  │     if phaseIds.includes(fromPhase):
  │       return { phase: fromPhase }
  │     else:
  │       return { phase: "", error:
  │         "Error: phase \"{fromPhase}\" not found. Valid phases: {phaseIds.join(", ")}" }
  │
  └── TIER 2: Auto-detection
        featureFolder = path.dirname(reqPath)
        DETECTION_SEQUENCE = [
          { docType: "REQ",        nextPhase: "req-review",          found: false },
          { docType: "FSPEC",      nextPhase: "fspec-creation",      found: false },
          { docType: "TSPEC",      nextPhase: "tspec-creation",      found: false },
          { docType: "PLAN",       nextPhase: "plan-creation",       found: false },
          { docType: "PROPERTIES", nextPhase: "properties-creation", found: false },
        ]
        // Note: DETECTION_SEQUENCE[0] is REQ (the file that was validated in Step 1).
        // Step 1 guarantees the REQ file exists and is non-empty, so
        // lastContiguousIndex will be >= 0 after the scan below.

        for each entry in DETECTION_SEQUENCE:
          filePath = path.join(featureFolder, "{entry.docType}-{slug}.md")
          exists = await fs.exists(filePath)
          if exists:
            content = await fs.readFile(filePath)
            entry.found = content.trim().length > 0  // non-empty = present

        // Find the length of the contiguous present prefix starting at index 0
        lastContiguousIndex = -1
        for i = 0 to DETECTION_SEQUENCE.length - 1:
          if DETECTION_SEQUENCE[i].found:
            lastContiguousIndex = i
          else:
            break  // gap breaks contiguity

        // Determine derivedPhase and logMessage

        if lastContiguousIndex === -1:
          // No artifacts present at all (REQ itself absent/empty).
          // Step 1 prevents this in practice; treat as default start.
          derivedPhase = "req-review"
          logMessage = undefined

        elif lastContiguousIndex === DETECTION_SEQUENCE.length - 1:
          // All 5 artifacts present — start at implementation
          derivedPhase = "implementation"
          logMessage = "Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)"

        elif lastContiguousIndex === 0:
          // Only REQ is contiguously present.
          // Check whether any artifact beyond the first gap (FSPEC) exists.
          hasGapArtifactBeyondFSPEC = DETECTION_SEQUENCE.slice(2).some(e => e.found)
          // DETECTION_SEQUENCE.slice(2) = [TSPEC, PLAN, PROPERTIES]

          if hasGapArtifactBeyondFSPEC:
            // Gap: FSPEC absent but TSPEC (or later) present.
            // Per FSPEC-CLI-02 BR-CLI-08, derived phase is the first missing artifact's creation phase.
            derivedPhase = "fspec-creation"
            logMessage = "Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)"
          else:
            // Pure default: only REQ exists, nothing beyond.
            derivedPhase = "req-review"
            logMessage = undefined

        else:  // lastContiguousIndex > 0 and < length-1
          // At least REQ and one more artifact present; next artifact is the gap.
          nextEntry = DETECTION_SEQUENCE[lastContiguousIndex + 1]
          present = DETECTION_SEQUENCE[lastContiguousIndex].docType
          missing = nextEntry.docType
          derivedPhase = nextEntry.nextPhase
          logMessage = "Auto-detected resume phase: {derivedPhase} ({present} found, {missing} missing)"

        // Validate derived phase exists in config
        phaseIds = workflowConfig.phases.map(p => p.id)
        if !phaseIds.includes(derivedPhase):
          return { phase: "", error:
            "Error: auto-detected phase \"{derivedPhase}\" not found in workflow config. " +
            "Use --from-phase to specify a valid start phase." }

        return { phase: derivedPhase, logMessage }
```

**Note on `lastContiguousIndex === -1` (empty folder):** Step 1 of `RunCommand.execute()` validates that the REQ file exists and is non-empty before calling `resolveStartPhase()`. Therefore `lastContiguousIndex === -1` is an impossible state at runtime when called from `execute()`. The branch is included for defensive completeness and to make the function safe when called in isolation (e.g., in tests with a fake filesystem that has no files).

**FSPEC-CLI-02 phase map, fully realized:**

| Scenario | `lastContiguousIndex` | `derivedPhase` | `logMessage` |
|----------|----------------------|----------------|-------------|
| Empty folder (no REQ) | -1 | `req-review` | none |
| REQ only, no gap | 0, `!hasGapBeyondFSPEC` | `req-review` | none |
| REQ only, gap (FSPEC absent, TSPEC present) | 0, `hasGapBeyondFSPEC` | `fspec-creation` | `"Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)"` |
| REQ + FSPEC | 1 | `tspec-creation` | `"Auto-detected resume phase: tspec-creation (FSPEC found, TSPEC missing)"` |
| REQ + FSPEC + TSPEC | 2 | `plan-creation` | `"Auto-detected resume phase: plan-creation (TSPEC found, PLAN missing)"` |
| REQ + FSPEC + TSPEC + PLAN | 3 | `properties-creation` | `"Auto-detected resume phase: properties-creation (PLAN found, PROPERTIES missing)"` |
| All 5 present | 4 (= length-1) | `implementation` | `"Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)"` |

### 6.5 `pollUntilTerminal()` — Progress Polling

```typescript
interface PollParams {
  workflowId: string;
  temporalClient: TemporalClientWrapper;
  discordConfig?: RunConfig["discord"];
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadableStream;
  featureFolder: string;
  slug: string;
}

async function pollUntilTerminal(params: PollParams): Promise<number>
```

**Algorithm:**

```
pollUntilTerminal(params)
  │
  ├── lastEmittedState: {
  │     phaseId: string;
  │     iteration: number;
  │     reviewerStatuses: Record<string, string>;
  │     activeAgentIds: string[];
  │   } | null = null
  │
  └── LOOP every 2 seconds:
        try:
          state = await temporalClient.queryWorkflowState(workflowId)
        catch:
          continue  // transient query error — keep polling

        // Detect terminal states
        if state.phaseStatus === "completed":
          stdout.write("Workflow completed ✅\n")
          return 0
        if state.phaseStatus === "failed":
          stdout.write("Workflow failed ❌\n")
          return 1
        if state.phaseStatus === "revision-bound-reached":
          stdout.write("Workflow Revision Bound Reached ⚠️\n")
          return 1
        if state.phaseStatus === "cancelled":
          stdout.write("Workflow cancelled\n")
          return 1

        // Handle ROUTE_TO_USER (→ Section 6.7)
        if state.phaseStatus === "waiting-for-user" && state.pendingQuestion:
          await handleQuestion(state.pendingQuestion, workflowId, params)
          continue

        // Progress emission (deduplication)
        // Phase lookup uses PHASE_LABELS static map — workflowConfig is NOT accessed.
        // state.currentPhaseId identifies the phase; type is determined by checking
        // whether the phase ID exists in PHASE_LABELS (review phases) or not.
        // For simplicity: only emit progress lines for phases that are in PHASE_LABELS.
        if PHASE_LABELS[state.currentPhaseId] !== undefined:
          reviewState = state.reviewStates?.[state.currentPhaseId]
          currentIteration = reviewState?.revisionCount ?? 0
          currentActiveAgentIds = state.activeAgentIds ?? []

          hasChanged = (
            lastEmittedState?.phaseId !== state.currentPhaseId ||
            lastEmittedState?.iteration !== currentIteration ||
            !deepEqual(lastEmittedState?.reviewerStatuses, reviewState?.reviewerStatuses) ||
            !arrayEqual(lastEmittedState?.activeAgentIds, currentActiveAgentIds)
          )

          if hasChanged:
            emitProgressLines(state, state.currentPhaseId, reviewState, featureFolder, slug, stdout)
            lastEmittedState = {
              phaseId: state.currentPhaseId,
              iteration: currentIteration,
              reviewerStatuses: { ...(reviewState?.reviewerStatuses ?? {}) },
              activeAgentIds: [...currentActiveAgentIds],
            }

        await sleep(2000)
```

### 6.6 `emitProgressLines()` — Stdout Format

```typescript
function emitProgressLines(
  state: FeatureWorkflowState,
  phaseId: string,
  reviewState: ReviewState | undefined,
  featureFolder: string,
  slug: string,
  stdout: NodeJS.WriteStream,
): void
```

**Phase label map** (matches FSPEC-CLI-03):

```typescript
const PHASE_LABELS: Record<string, { label: string; title: string }> = {
  "req-review":            { label: "R",   title: "REQ Review" },
  "fspec-review":          { label: "F",   title: "FSPEC Review" },
  "tspec-review":          { label: "T",   title: "TSPEC Review" },
  "plan-review":           { label: "P",   title: "PLAN Review" },
  "properties-review":     { label: "PT",  title: "PROPERTIES Review" },
  "properties-tests":      { label: "PTT", title: "Properties Tests" },
  "implementation-review": { label: "IR",  title: "Implementation Review" },
};
```

**Emission logic:**

```
emitProgressLines(state, phaseId, reviewState, featureFolder, slug, stdout)
  │
  ├── phaseInfo = PHASE_LABELS[phaseId]
  ├── label = phaseInfo?.label ?? phaseId    // fallback for unknown/custom phase IDs
  ├── title = phaseInfo?.title ?? phaseId    // fallback for unknown/custom phase IDs
  ├── iteration = (reviewState?.revisionCount ?? 0) + 1
  │
  ├── emit: "[Phase {label} — {title}] Iteration {iteration}\n"
  │
  ├── for each [agentId, status] in reviewState?.reviewerStatuses ?? {}:
  │     if status === "approved":
  │       emit: "  {agentId}:  Approved ✅\n"
  │     elif status === "revision_requested":
  │       N = countFindingsInCrossReviewFile(featureFolder, agentId, phaseId, reviewState, slug)
  │       emit: "  {agentId}:  Need Attention ({N} findings)\n"
  │
  └── // Optimizer (author) dispatch detection:
      // The phase's author agent ID is stored in the phase config, but for progress
      // reporting we detect it via state.activeAgentIds.
      // After reviewer results are emitted, if the phase is still running AND an agent
      // in state.activeAgentIds is the known author for this phase:
      //   - For review phases, the author is the phase's "agent" field.
      //   - We look up the phase author by checking the phase config's agent property.
      //   - For simplicity in progress reporting, if state.activeAgentIds is non-empty
      //     and no reviewer result lines were emitted in this tick (all reviewers are
      //     complete), the active agent is the optimizer (author addressing feedback).
      //
      // Practical detection rule:
      allReviewersDone = (Object.keys(reviewState?.reviewerStatuses ?? {}).length > 0 &&
                          Object.values(reviewState?.reviewerStatuses ?? {})
                            .every(s => s !== "pending" && s !== "running"))
      if allReviewersDone && (state.activeAgentIds ?? []).length > 0:
        authorAgentId = (state.activeAgentIds ?? [])[0]
        emit: "[Phase {label} — {title}] {authorAgentId} addressing feedback...\n"
```

**"Addressing feedback" line precondition:** This line is emitted only after all reviewer results have been populated in `reviewState.reviewerStatuses` for the current iteration AND at least one entry in `state.activeAgentIds` exists. This matches the workflow state when `runReviewCycle()` has dispatched all reviewers, collected their results, and then dispatched the optimizer (author) for the revision pass. The optimizer's agentId is in `state.activeAgentIds` while it is running.

**`countFindingsInCrossReviewFile()`:**

```typescript
function countFindingsInCrossReviewFile(
  featureFolder: string,
  agentId: string,
  phase: PhaseDefinition,
  reviewState: ReviewState | undefined,
  slug: string,
): number | "?"
```

Resolves the cross-review file path using the versioned path for the current iteration, consistent with REQ-CLI-03 and FSPEC-CLI-03:

```
countFindingsInCrossReviewFile(featureFolder, agentId, phase, reviewState, slug)
  │
  ├── docType = deriveDocumentType(phase.id)
  │   // e.g. "req-review" → "REQ", "tspec-review" → "TSPEC"
  │
  ├── skillName = agentIdToSkillName(agentId) ?? agentId
  │
  ├── currentRevision = reviewState?.writtenVersions[agentId] ?? 1
  │   // Use the version that was actually written by this reviewer in this iteration.
  │   // writtenVersions[agentId] is set by runReviewCycle() after each reviewer dispatch.
  │   // Falls back to 1 if writtenVersions is absent (first iteration or legacy state).
  │
  ├── filePath = crossReviewPath(featureFolder + "/", skillName, docType, currentRevision)
  │   // e.g. round 1: "...CROSS-REVIEW-product-manager-REQ.md"
  │   //      round 2: "...CROSS-REVIEW-product-manager-REQ-v2.md"
  │
  ├── try:
  │     content = fs.readFileSync(filePath, "utf-8")
  │   catch:
  │     return "?"  // file not found or unreadable
  │
  └── Count data rows in ## Findings table:
        scan for the separator line matching /^\|[-|:\s]+\|/ (the header separator row)
        count subsequent lines starting with "|" before the next blank line or end-of-file
        // separator row itself is NOT counted (only data rows below it)
        return count  // 0 if table is empty or not found
```

The finding count uses `reviewState.writtenVersions[agentId]` to locate the versioned file written in the most recent review round for that agent. This ensures round-2+ progress output shows findings from the current iteration's cross-review file, not the stale round-1 file.

**Phase completed/revision-bound-reached signals:** These are detected from `phaseStatus` transitions in the poll loop and emitted as:
- `[Phase {label} — {title}] Passed ✅\n`
- `[Phase {label} — {title}] Revision Bound Reached ⚠️\n`

### 6.7 `handleQuestion()` — Human-in-the-Loop (no Discord)

```typescript
async function handleQuestion(
  question: PendingQuestionState,
  workflowId: string,
  params: PollParams,
): Promise<void>
```

**Algorithm (no-Discord path):**

```
handleQuestion(question, workflowId, params)
  │
  ├── if params.discordConfig exists:
  │     // Discord handles this — do nothing, return (Discord path is existing behavior)
  │     return
  │
  └── No Discord:
        // Print question
        params.stdout.write("[Question] {question.question}\n")

        // Print prompt without newline, then read stdin
        // Must use write callback to guarantee flush before stdin read
        await new Promise<void>(resolve => {
          params.stdout.write("Answer: ", () => resolve())
        })

        answer = await readOneLine(params.stdin)
          // Returns: first line from stdin, OR null if EOF/closed

        if answer === null:
          params.stderr.write(
            "Warning: stdin closed before answer was provided; " +
            "resuming workflow with empty answer.\n"
          )
          answer = ""

        await params.temporalClient.signalHumanAnswer(workflowId, answer)
```

**`readOneLine(stdin)`:** Returns a `Promise<string | null>`. Uses `readline.createInterface({ input: stdin, terminal: false })` and resolves on the first `"line"` event (returns the line string) or `"close"` event (returns `null`). After resolving, the readline interface is closed.

---

## 7. AGENT_TO_SKILL Mapping — `cross-review-parser.ts`

### 7.1 Constraint Analysis

REQ-CR-01 states two requirements that are in tension:

1. "`AGENT_TO_SKILL` is derived by reversing `SKILL_TO_AGENT` and must not be maintained independently."
2. "The existing entries for old agent IDs (`pm`, `eng`, `qa`, `fe`) must be preserved so that `agentIdToSkillName("eng")` still returns `"engineer"`."
3. (From REQ-CR-01 AC) `agentIdToSkillName("pm-review")` returns `"product-manager"` AND `agentIdToSkillName("pm")` returns `"product-manager"` (the existing mapped value).

**The conflict:** A pure reversal of `SKILL_TO_AGENT` produces a one-to-one map (`skillName → agentId`). If `"product-manager" → "pm-review"` is the sole entry for that skill name, then reversing gives `"pm-review" → "product-manager"` — but `"pm" → "product-manager"` is lost. Two different agent IDs (`pm` and `pm-review`) both require `agentIdToSkillName()` to return `"product-manager"`, which is a many-to-one relationship that a pure reversal of `SKILL_TO_AGENT` cannot represent.

**Resolution chosen:** Implement `SKILL_TO_AGENT` with new entries for `pm-review` and `te-review` using their canonical skill names, and build `AGENT_TO_SKILL` as a reversal of `SKILL_TO_AGENT` merged with an explicit backward-compat supplement `LEGACY_AGENT_TO_SKILL`. This deviates from the "derived exclusively by reversal" wording of REQ-CR-01 only in that it adds a supplemental merge; the reversal is still computed and serves as the primary source. A **REQ amendment** to REQ-CR-01 is recommended to acknowledge this implementation: change "must not be maintained independently" to "is primarily derived from reversing `SKILL_TO_AGENT`; backward-compat entries for old agent IDs that cannot be expressed via reversal alone are maintained in a supplemental `LEGACY_AGENT_TO_SKILL` table."

### 7.2 Implementation

```typescript
const SKILL_TO_AGENT: Record<string, string> = {
  // Existing entries — preserved for backward compatibility (REQ-NF-01)
  "engineer":           "eng",
  "frontend-engineer":  "fe",
  // Updated: "product-manager" and "test-engineer" now point to new role agent IDs.
  // Reversing these gives AGENT_TO_SKILL["pm-review"] = "product-manager"
  // and AGENT_TO_SKILL["te-review"] = "test-engineer".
  "product-manager":    "pm-review",
  "test-engineer":      "te-review",
  // New entry for software-engineer role (REQ-CR-01)
  "software-engineer":  "se-review",
};

// Backward-compat supplement: old agent IDs whose skillName cannot be recovered
// from pure SKILL_TO_AGENT reversal because the skill name key has been reassigned
// to the new role agent. Merged AFTER the reversal so reversal entries take precedence.
const LEGACY_AGENT_TO_SKILL: Record<string, string> = {
  "pm":  "product-manager",  // old pm agent — skill name unchanged
  "qa":  "test-engineer",    // old qa agent — skill name unchanged
  "eng": "engineer",         // old eng agent
  "fe":  "frontend-engineer", // old fe agent
};

const AGENT_TO_SKILL: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SKILL_TO_AGENT).map(([k, v]) => [v, k])),
  ...LEGACY_AGENT_TO_SKILL,  // supplement — does not overwrite reversal entries
};
```

**Verification of all acceptance criteria:**
- `agentIdToSkillName("se-review")` → `"software-engineer"` ✓ (from reversal)
- `agentIdToSkillName("pm-review")` → `"product-manager"` ✓ (from reversal)
- `agentIdToSkillName("te-review")` → `"test-engineer"` ✓ (from reversal)
- `agentIdToSkillName("eng")` → `"engineer"` ✓ (from LEGACY supplement)
- `agentIdToSkillName("qa")` → `"test-engineer"` ✓ (from LEGACY supplement)
- `agentIdToSkillName("pm")` → `"product-manager"` ✓ (from LEGACY supplement)
- `agentIdToSkillName("fe")` → `"frontend-engineer"` ✓ (from LEGACY supplement)

**Note on `skillNameToAgentId("product-manager")`:** The reversal maps `"product-manager" → "pm-review"` (new role). Old projects using the old `pm` agent ID must continue to work via `agentIdToSkillName("pm")`, which they do through `LEGACY_AGENT_TO_SKILL`. The forward direction `skillNameToAgentId("product-manager")` now returns `"pm-review"` — this is the intended behavior for new workflows.

---

## 8. `ptah init` Scaffold Updates — `defaults.ts`

### 8.1 Updated `FILE_MANIFEST`

Remove old skill stubs (`pm-agent.md`, `dev-agent.md`, `test-agent.md`) and old agent log stubs (`pm-agent.md`, `dev-agent.md`, `test-agent.md` in `docs/agent-logs/`). Add 8 new skill stubs.

**New skill files** (added to `FILE_MANIFEST`):

```typescript
"ptah/skills/pm-author.md": `# PM Author Skill\n\n<!-- TODO: Populate this skill prompt with the pm-author role definition. -->\n<!-- This file is loaded by Ptah as the pm-author agent's role prompt. -->\n`,
"ptah/skills/pm-review.md": `# PM Review Skill\n\n<!-- TODO: Populate this skill prompt with the pm-review role definition. -->\n<!-- This file is loaded by Ptah as the pm-review agent's role prompt. -->\n`,
"ptah/skills/se-author.md": `# SE Author Skill\n\n<!-- TODO: Populate this skill prompt with the se-author role definition. -->\n<!-- This file is loaded by Ptah as the se-author agent's role prompt. -->\n`,
"ptah/skills/se-review.md": `# SE Review Skill\n\n<!-- TODO: Populate this skill prompt with the se-review role definition. -->\n<!-- This file is loaded by Ptah as the se-review agent's role prompt. -->\n`,
"ptah/skills/te-author.md": `# TE Author Skill\n\n<!-- TODO: Populate this skill prompt with the te-author role definition. -->\n<!-- This file is loaded by Ptah as the te-author agent's role prompt. -->\n`,
"ptah/skills/te-review.md": `# TE Review Skill\n\n<!-- TODO: Populate this skill prompt with the te-review role definition. -->\n<!-- This file is loaded by Ptah as the te-review agent's role prompt. -->\n`,
"ptah/skills/tech-lead.md": `# Tech Lead Skill\n\n<!-- TODO: Populate this skill prompt with the tech-lead role definition. -->\n<!-- This file is loaded by Ptah as the tech-lead agent's role prompt. -->\n`,
"ptah/skills/se-implement.md": `# SE Implement Skill\n\n<!-- TODO: Populate this skill prompt with the se-implement role definition. -->\n<!-- This file is loaded by Ptah as the se-implement agent's role prompt. -->\n`,
```

**Manifest count impact:** The old manifest had 18 entries. Remove 3 old skill stubs and 3 old agent-log stubs (6 removed). Add 8 new skill stubs. Net change: −6 + 8 = +2. New total: **20 entries**. Update the `init.test.ts` assertion to `expect(Object.keys(FILE_MANIFEST).length).toBe(20)`.

**Note:** Agent-log files for old agents are removed because `ptah init` should not create `pm-agent.md`, `dev-agent.md`, `test-agent.md` in `docs/agent-logs/`. Remove those 3 entries. If agent-log files are to be generated for the new 8 agents, that is out of scope per REQ-AG-01 (scope: skill stub files under `ptah/skills/`).

### 8.2 Updated `buildConfig()`

```typescript
export function buildConfig(projectName: string): string {
  const name = projectName === "" ? "my-app" : projectName;

  const config = {
    project: { name },
    agents: {
      active: [
        "pm-author", "pm-review",
        "se-author", "se-review",
        "te-author", "te-review",
        "tech-lead", "se-implement",
      ],
      skills: {
        "pm-author":    "./ptah/skills/pm-author.md",
        "pm-review":    "./ptah/skills/pm-review.md",
        "se-author":    "./ptah/skills/se-author.md",
        "se-review":    "./ptah/skills/se-review.md",
        "te-author":    "./ptah/skills/te-author.md",
        "te-review":    "./ptah/skills/te-review.md",
        "tech-lead":    "./ptah/skills/tech-lead.md",
        "se-implement": "./ptah/skills/se-implement.md",
      },
      // ... other existing fields preserved ...
    },
    // ... discord, orchestrator, git, docs, temporal sections unchanged ...
  };

  return JSON.stringify(config, null, 2) + "\n";
}
```

### 8.3 Updated `ptah.workflow.yaml` Template

The full YAML template in `FILE_MANIFEST["ptah.workflow.yaml"]` is replaced with the following:

```yaml
version: 1
phases:
  # --- Requirements ---
  - id: req-creation
    name: Requirements Creation
    type: creation
    agent: pm-author
    context_documents:
      - "{feature}/overview"
    transition: req-review
    skip_if:
      field: artifact.exists
      artifact: REQ

  - id: req-review
    name: REQ Review
    type: review
    agent: pm-author
    reviewers:
      default: [se-review, te-review]
    context_documents:
      - "{feature}/REQ"
    transition: req-approved
    revision_bound: 5

  - id: req-approved
    name: Requirements Approved
    type: approved
    transition: fspec-creation

  # --- Functional Specification ---
  - id: fspec-creation
    name: FSPEC Creation
    type: creation
    agent: pm-author
    context_documents:
      - "{feature}/REQ"
    transition: fspec-review

  - id: fspec-review
    name: FSPEC Review
    type: review
    agent: pm-author
    reviewers:
      default: [se-review, te-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
    transition: fspec-approved
    revision_bound: 5

  - id: fspec-approved
    name: FSPEC Approved
    type: approved
    transition: tspec-creation

  # --- Technical Specification ---
  - id: tspec-creation
    name: TSPEC Creation
    type: creation
    agent: se-author
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
    transition: tspec-review

  - id: tspec-review
    name: TSPEC Review
    type: review
    agent: se-author
    reviewers:
      default: [pm-review, te-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
    transition: tspec-approved
    revision_bound: 5

  - id: tspec-approved
    name: TSPEC Approved
    type: approved
    transition: plan-creation

  # --- Execution Plan ---
  - id: plan-creation
    name: PLAN Creation
    type: creation
    agent: se-author
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
    transition: plan-review

  - id: plan-review
    name: PLAN Review
    type: review
    agent: se-author
    reviewers:
      default: [pm-review, te-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
    transition: plan-approved
    revision_bound: 5

  - id: plan-approved
    name: PLAN Approved
    type: approved
    transition: properties-creation

  # --- Test Properties ---
  - id: properties-creation
    name: PROPERTIES Creation
    type: creation
    agent: te-author
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
    transition: properties-review

  - id: properties-review
    name: PROPERTIES Review
    type: review
    agent: te-author
    reviewers:
      default: [pm-review, se-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: properties-approved
    revision_bound: 5

  - id: properties-approved
    name: PROPERTIES Approved
    type: approved
    transition: implementation

  # --- Implementation ---
  - id: implementation
    name: Implementation
    type: implementation
    agent: tech-lead
    context_documents:
      - "{feature}/REQ"
      - "{feature}/FSPEC"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: properties-tests

  # --- Properties Tests ---
  - id: properties-tests
    name: Properties Tests
    type: creation
    agent: se-implement
    context_documents:
      - "{feature}/REQ"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: implementation-review

  # --- Final Review ---
  - id: implementation-review
    name: Implementation Review
    type: review
    agent: se-author
    reviewers:
      default: [pm-review, te-review]
    context_documents:
      - "{feature}/REQ"
      - "{feature}/TSPEC"
      - "{feature}/PLAN"
      - "{feature}/PROPERTIES"
    transition: done
    revision_bound: 5

  - id: done
    name: Done
    type: approved
```

**Notes:**
- `req-creation` includes `skip_if: { field: artifact.exists, artifact: REQ }` — the workflow engine skips creation when the REQ already exists (REQ-WF-01).
- **FSPEC, TSPEC, PLAN, and PROPERTIES creation phases intentionally have no `skip_if` conditions.** REQ-WF-01 and REQ-WF-05 specify the `artifact.exists` skip condition for `req-creation` only. Mid-pipeline resume for all other creation phases is handled by the CLI-side auto-detection algorithm (`resolveStartPhase()`) which derives the correct `startAtPhase` and passes it to `featureLifecycleWorkflow`. The workflow-engine-level `skip_if` mechanism is a safety net for the REQ case; it is not required for FSPEC through PROPERTIES phases. Adding `skip_if` conditions to those phases is out of scope for this feature per REQ §3.1 (scope is limited to the `SkipCondition` discriminated union enabling `artifact.exists` checks, applied only to `req-creation`).
- All review phases have `revision_bound: 5` (REQ-WF-04).
- Reviewer assignments match the matrix in REQ-WF-02 exactly.
- Phase PT (`properties-tests`) is positioned between `implementation` and `implementation-review` (REQ-WF-03).
- `properties-tests` uses `type: creation` with `agent: se-implement` — it dispatches `se-implement` to write TDD tests.

---

## 9. `workflow-validator.ts` Updates

### 9.1 `validateStructure()` — SkipCondition Branch Validation

Add a `validateSkipIfBlock()` call inside `YamlWorkflowConfigLoader.validateStructure()`:

```typescript
for (let i = 0; i < config.phases.length; i++) {
  const phase = config.phases[i] as Record<string, unknown>;
  // ... existing field validations ...

  if (phase.skip_if !== undefined) {
    this.validateSkipIfBlock(phase.skip_if, i, path);
  }
}

private validateSkipIfBlock(
  skipIf: unknown,
  phaseIndex: number,
  configPath: string,
): void {
  const block = skipIf as Record<string, unknown>;

  if (typeof block.field !== "string") {
    throw new WorkflowConfigError(
      `${configPath} phases[${phaseIndex}].skip_if.field must be a string.`
    );
  }

  if (block.field === "artifact.exists") {
    // Discriminated union branch: artifact.exists
    if (typeof block.artifact !== "string" || (block.artifact as string).trim() === "") {
      throw new WorkflowConfigError(
        `${configPath} phases[${phaseIndex}].skip_if with field "artifact.exists" requires a non-empty "artifact" string.`
      );
    }
    if ("equals" in block) {
      throw new WorkflowConfigError(
        `${configPath} phases[${phaseIndex}].skip_if with field "artifact.exists" must not have an "equals" property.`
      );
    }
  } else if (block.field.startsWith("config.")) {
    // Discriminated union branch: config.*
    if (typeof block.equals !== "boolean") {
      throw new WorkflowConfigError(
        `${configPath} phases[${phaseIndex}].skip_if with field "${block.field}" requires a boolean "equals" property.`
      );
    }
    if ("artifact" in block) {
      throw new WorkflowConfigError(
        `${configPath} phases[${phaseIndex}].skip_if with field "${block.field}" must not have an "artifact" property.`
      );
    }
  } else {
    throw new WorkflowConfigError(
      `${configPath} phases[${phaseIndex}].skip_if.field "${block.field}" is invalid. Must start with "config." or be exactly "artifact.exists".`
    );
  }
}
```

### 9.2 `revision_bound` Validation

In `DefaultWorkflowValidator.validateRequiredFields()`, add validation that review phases declare `revision_bound`:

```typescript
if (phase.type === "review") {
  if (!phase.reviewers || Object.keys(phase.reviewers).length === 0) {
    errors.push({ /* existing */ });
  }
  // NEW: revision_bound required on review phases
  if (phase.revision_bound === undefined || phase.revision_bound === null) {
    errors.push({
      phase: phase.id,
      field: "revision_bound",
      message: `Phase "${phase.id}" of type "review" is missing required field "revision_bound".`,
    });
  }
}
```

This causes `ptah run` to exit with code 1 (via the existing validation path in `ptah start` and mirrored in `RunCommand.execute()`) when a review phase lacks `revision_bound`.

---

## 10. `ptah.ts` CLI Entry Point Update

Add `run` case to the switch:

```typescript
case "run": {
  const reqPath = args[1];
  if (!reqPath) {
    console.error("Error: ptah run requires a <req-path> argument.");
    console.error("Usage: ptah run <req-path> [--from-phase <phase-id>]");
    process.exitCode = 1;
    break;
  }

  const fromPhaseIdx = args.indexOf("--from-phase");
  const fromPhase = fromPhaseIdx !== -1 ? args[fromPhaseIdx + 1] : undefined;

  const fs = new NodeFileSystem();
  const workflowConfigLoader = new YamlWorkflowConfigLoader(fs);
  const { LenientConfigLoader } = await import("../src/commands/run.js");
  const configLoader = new LenientConfigLoader(fs);

  // Build Temporal config from loaded config
  let runConfig;
  try {
    runConfig = await configLoader.load();
  } catch {
    runConfig = { temporal: DEFAULT_TEMPORAL_CONFIG };
  }

  const temporalConfig: TemporalConfig = runConfig.temporal ?? DEFAULT_TEMPORAL_CONFIG;
  const temporalClient = new TemporalClientWrapperImpl(temporalConfig);

  const { RunCommand } = await import("../src/commands/run.js");
  const command = new RunCommand({
    fs,
    temporalClient,
    workflowConfigLoader,
    configLoader,
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
  });

  try {
    const exitCode = await command.execute({ reqPath, fromPhase });
    process.exitCode = exitCode;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
  break;
}
```

Also update the `printHelp()` output to include the `run` command.

---

## 11. Worker Registration — `checkArtifactExists` Activity

In `bin/ptah.ts` (and any run-mode worker), register the new `checkArtifactExists` activity:

```typescript
// In the activities block passed to createTemporalWorker:
import { createArtifactActivities } from "../src/temporal/activities/artifact-activity.js";

const artifactActivities = createArtifactActivities({ fs });

worker = await createTemporalWorker({
  config,
  activities: {
    // ... existing ...
    checkArtifactExists: artifactActivities.checkArtifactExists,
  },
  logger,
});
```

Create `ptah/src/temporal/activities/artifact-activity.ts`:

```typescript
import type { FileSystem } from "../../services/filesystem.js";
import type { CheckArtifactExistsInput } from "../types.js";

export interface ArtifactActivityDeps {
  fs: FileSystem;
}

export function createArtifactActivities(deps: ArtifactActivityDeps) {
  const { fs } = deps;

  async function checkArtifactExists(input: CheckArtifactExistsInput): Promise<boolean> {
    const { docType, slug, featurePath } = input;
    const filePath = `${featurePath}${docType}-${slug}.md`;
    try {
      const content = await fs.readFile(filePath);
      return content.trim().length > 0;
    } catch {
      return false;
    }
  }

  return { checkArtifactExists };
}
```

---

## 12. Error Handling

### 12.1 `RunCommand` Error Scenarios

| Scenario | Behavior |
|----------|---------|
| REQ file not found | Print error to stdout, exit 1, no Temporal workflow started |
| REQ file empty (whitespace only) | Print error to stdout, exit 1 |
| `ptah.workflow.yaml` missing | Catch `WorkflowConfigError`, print reformatted error to stdout, exit 1 |
| `--from-phase` with invalid phase ID | Print error with full phase list to stdout, exit 1 |
| Auto-detected phase not in config | Print error to stdout, exit 1 |
| Temporal query throws during duplicate check | Print error to stdout, exit 1 |
| Duplicate running workflow found | Print error to stdout, exit 1 |
| `temporalClient.connect()` throws | Propagates — caught by outer `try/catch` in `ptah.ts`, prints error, exits 1 |
| `startFeatureWorkflow()` throws | Propagates — caught by outer `try/catch`, prints error, exits 1 |
| `queryWorkflowState()` throws during polling | Log warning to stderr, continue polling (transient errors) |
| Workflow reaches `failed` state | Print "Workflow failed ❌", exit 1 |
| Workflow reaches `revision-bound-reached` | Print "Workflow Revision Bound Reached ⚠️", exit 1 |
| Workflow reaches `cancelled` | Print "Workflow cancelled", exit 1 |
| Workflow reaches `completed` | Print "Workflow completed ✅", exit 0 |
| stdin closed before answering question | Send empty string signal, print warning to stderr, continue polling |

### 12.2 `evaluateSkipCondition()` Error Scenario

When called with an `artifact.exists` condition before `state.artifactExists` is populated (`artifactExists === undefined`):

```
throw new Error(
  "evaluateSkipCondition: artifactExists map not yet populated — " +
  "checkArtifactExists Activity must run before evaluating artifact.exists conditions"
)
```

This propagates to the Temporal workflow boundary and causes the workflow execution to fail with this message. It is a programming error (Activity ordering violation), not a user error.

### 12.3 `mapRecommendationToStatus()` Removal

The function `mapRecommendationToStatus()` in `feature-lifecycle.ts` (lines ~491–505) must be deleted entirely. All callers must be migrated to use `parseRecommendation()` imported from `cross-review-parser.ts`. After deletion, no test or source file may reference or call `mapRecommendationToStatus`.

The static-analysis test in `feature-lifecycle.test.ts` verifies this:

```typescript
it("does not contain mapRecommendationToStatus after cleanup", () => {
  const src = fs.readFileSync(
    new URL("../../../../../src/temporal/workflows/feature-lifecycle.ts", import.meta.url),
    "utf-8"
  );
  expect(src).not.toContain("mapRecommendationToStatus");
});
```

---

## 13. Test Strategy

### 13.1 Test Doubles

| Double | Where | Purpose |
|--------|-------|---------|
| `FakeFileSystem` | `tests/fixtures/factories.ts` (existing) | File I/O for RunCommand, artifact detection |
| `FakeTemporalClient` | `tests/fixtures/factories.ts` (extended) | Temporal client calls including `signalHumanAnswer`, `listWorkflowsByPrefix` with status filter |
| `FakeWorkflowConfigLoader` | Inline in test files | Returns controlled `WorkflowConfig` |
| `FakeLenientConfigLoader` | Inline in test files | Returns controlled `RunConfig` |
| Stub stdin/stdout/stderr | `Readable`/`Writable` from `node:stream` | Capture output and inject input in RunCommand tests |

### 13.2 Unit Tests by File

**`tests/unit/commands/run.test.ts`** — covers all `RunCommand.execute()` scenarios:

| Test | Scenario |
|------|----------|
| REQ file not found | Returns exit 1, error on stdout |
| REQ file whitespace only | Returns exit 1, error on stdout |
| `ptah.workflow.yaml` missing | Returns exit 1, reformatted error |
| `--from-phase` valid | Workflow starts at given phase |
| `--from-phase` invalid | Returns exit 1, full phase list in error |
| Auto-detection — full prefix (REQ+FSPEC+TSPEC present, PLAN absent) | Derives `plan-creation`, prints log message |
| Auto-detection — gap (FSPEC absent, TSPEC present) | Derives `fspec-creation`, correct message `(REQ found, FSPEC missing)` |
| Auto-detection — REQ only, no gap | Derives `req-review`, no log message |
| Auto-detection — all 5 artifacts present | Derives `implementation`, prints log message `(PROPERTIES found, implementation artifact missing)` — covers `lastContiguousIndex === DETECTION_SEQUENCE.length - 1` case (TE F-04-b) |
| Auto-detection — empty folder (no artifacts, Step 1 bypassed via fake FS) | Derives `req-review`, no log message — covers `lastContiguousIndex === -1` case (TE F-04-a) |
| Auto-detection — gap at position 2 (TSPEC absent, PLAN present) | Derives `fspec-creation` (FSPEC is the first missing artifact), prints correct message — covers gap at non-REQ position (TE F-04-c) |
| Auto-detection — phase not in config | Returns exit 1, error message |
| Duplicate running workflow | Returns exit 1, error message |
| Temporal query exception during check | Returns exit 1, error with message |
| Happy path start | Starts workflow, polls until terminal |
| Workflow completed | Returns exit 0 |
| Workflow failed | Returns exit 1 |
| Workflow revision-bound-reached | Returns exit 1 |
| Workflow cancelled | Returns exit 1 |
| ROUTE_TO_USER — no Discord — stdin answered | Sends humanAnswerSignal, resumes polling |
| ROUTE_TO_USER — no Discord — stdin closed | Sends empty signal, warning to stderr |
| ROUTE_TO_USER — Discord present | Does not read stdin |
| Progress deduplication | Same state → no new lines |
| Finding count from cross-review file — round 1 (unversioned path) | Correct data-row count from `CROSS-REVIEW-{skill}-{doc}.md` |
| Finding count from cross-review file — round 2 (versioned path) | Correct data-row count from `CROSS-REVIEW-{skill}-{doc}-v2.md` (uses `writtenVersions`) |
| Finding count — file missing | Reports "?" |
| `emitProgressLines` — unknown/custom phase ID fallback | `label` and `title` both fall back to `phaseId` (TE F-02: unknown phase ID in `PHASE_LABELS`) |
| `statusFilter` passed to listWorkflowsByPrefix — filter values correct | Asserts `["Running", "ContinuedAsNew"]` is passed |
| `FakeTemporalClient.listWorkflowsByPrefix` with statusFilter — excludes non-matching statuses | Populate `workflowIds` and `workflowStatuses` with mix of Running and Terminated; assert only Running/ContinuedAsNew are returned (TE F-03: verifies fake correctly filters by status, not just records the call) |

**`tests/unit/orchestrator/cross-review-parser.test.ts`** — add:

| Test | Covers |
|------|--------|
| `parseRecommendation("Approved with Minor Issues")` → approved | REQ-CR-05 |
| `parseRecommendation("Need Attention")` → revision_requested | REQ-CR-06 |
| `parseRecommendation("NEED ATTENTION")` → revision_requested | Case insensitive |
| `parseRecommendation("Approved")` → approved | Regression |
| `parseRecommendation("Approved with Minor Issues — see findings")` → revision_requested | **Negative/partial-match test (TE F-01):** a superset string that contains "approved with minor issues" as a substring but has additional text must NOT match and must fall through to the conservative default. This verifies VALUE_MATCHERS uses exact-equality matching (after normalize), not `includes()`. |
| `parseRecommendation("needs revision")` → revision_requested | Regression — existing matcher |
| `crossReviewPath(…, 1)` → unversioned | REQ-CR-02 |
| `crossReviewPath(…, undefined)` → unversioned | REQ-CR-02 |
| `crossReviewPath(…, 2)` → -v2 suffix | REQ-CR-02 |
| `crossReviewPath(…, 0)` → unversioned (clamped) | REQ-CR-02 |
| `crossReviewPath(…, -3)` → unversioned (clamped) | REQ-CR-02 |
| `agentIdToSkillName("se-review")` → "software-engineer" | REQ-CR-01 |
| `agentIdToSkillName("pm-review")` → "product-manager" | REQ-CR-01 |
| `agentIdToSkillName("te-review")` → "test-engineer" | REQ-CR-01 |
| `agentIdToSkillName("eng")` → "engineer" | REQ-NF-01 backward compat |
| `agentIdToSkillName("qa")` → "test-engineer" | REQ-NF-01 backward compat |
| `agentIdToSkillName("pm")` → "product-manager" | REQ-NF-01 backward compat |
| `agentIdToSkillName("fe")` → "frontend-engineer" | REQ-NF-01 backward compat (TE F-08) |

**`tests/unit/temporal/cross-review-activity.test.ts`** — update:

| Test | Covers |
|------|--------|
| Activity reads versioned path when revisionCount = 2 | REQ-CR-03 |
| Activity reads unversioned path when revisionCount absent | REQ-CR-03 |
| Two-step parse (extractRecommendationValue → parseRecommendation) | FSPEC-CR-02 |

**`tests/unit/temporal/workflows/feature-lifecycle.test.ts`** — add:

| Test | Covers |
|------|--------|
| `evaluateSkipCondition` — config.* branch works unchanged | Regression |
| `evaluateSkipCondition` — artifact.exists with populated map | REQ-WF-05 |
| `evaluateSkipCondition` — artifact.exists with undefined map → throws | REQ-WF-05 |
| `evaluateSkipCondition` — unknown artifact key → returns false | REQ-WF-05 |
| `deriveDocumentType("properties-tests")` → "PROPERTIES" | REQ-WF-03 |
| `deriveDocumentType("req-review")` → "REQ" (regression) | — |
| `isCompletionReady` — all reviewers signed off (`=== true`) → true | REQ-WF-06 (sign-offs are boolean per FSPEC-WF-02 BR-WF-09) |
| `isCompletionReady` — one reviewer has `false` sign-off → false | REQ-WF-06 |
| `isCompletionReady` — one reviewer absent from signOffs → false | REQ-WF-06 |
| `isCompletionReady` — no implementation-review phase → legacy fallback (`qa === true && pm === true`) | REQ-WF-06 |
| `isCompletionReady` — empty reviewers → true (vacuous) | REQ-WF-06 FSPEC-WF-02 BR-WF-10 |
| `buildInitialWorkflowState` — reviewStates have writtenVersions: {} | REQ-NF-04 |
| `buildInitialWorkflowState` — state has artifactExists: {} | Section 4.3 |
| `buildInitialWorkflowState` — state has activeAgentIds: [] | Section 4.3 |
| `buildContinueAsNewPayload` — writtenVersions preserved | REQ-NF-04 |
| `buildContinueAsNewPayload` — reviewStates carried across CAN | FSPEC-CR-01 AT-CR-01-F |
| Static-scan: no `mapRecommendationToStatus` in source | REQ-CR-05 FSPEC-CR-02 AT-CR-02-E |

**`tests/unit/commands/init.test.ts`** — update:

| Test | Covers |
|------|--------|
| `FILE_MANIFEST` has 20 entries | REQ-AG-01 updated count |
| All 8 skill files created by init | REQ-AG-01 |
| `buildConfig()` — 8 agents in `agents.active` | REQ-AG-02 |
| `buildConfig()` — all 8 skill paths present | REQ-AG-02 |

---

## 14. Integration Points

| Component | Integration |
|-----------|-------------|
| `ptah.ts` `case "run"` | Creates `RunCommand`, passes `TemporalClientWrapperImpl`, `YamlWorkflowConfigLoader`, `LenientConfigLoader`, Node.js stdio |
| `RunCommand` → `TemporalClientWrapper` | Uses `connect()`, `startFeatureWorkflow()`, `queryWorkflowState()`, `listWorkflowsByPrefix()` with `statusFilter`, `signalHumanAnswer()`, `disconnect()` |
| `featureLifecycleWorkflow` → `checkArtifactExists` | New Temporal Activity registered in worker; called pre-loop |
| `runReviewCycle` → `crossReviewPath()` | Passes `revisionCount`; result used in `readCrossReviewRecommendation` and `invokeSkill` context |
| `invokeSkill` Activity → `SkillActivityInput.revisionCount` | Injects `Cross-review output file:` line into agent prompt context in `skill-activity.ts` |
| `readCrossReviewRecommendation` → `crossReviewPath()` + `parseRecommendation()` | Two-step: extract heading, then parse value |
| `YamlWorkflowConfigLoader.validateStructure()` | Validates new `SkipCondition` discriminated union branches |
| `DefaultWorkflowValidator.validateRequiredFields()` | Validates `revision_bound` presence on review phases |
| `FakeTemporalClient` | Implements updated `TemporalClientWrapper` interface — all tests using `FakeTemporalClient` continue to compile |

---

## 15. Requirements Traceability

| Requirement | Technical Components |
|-------------|---------------------|
| REQ-CLI-01 | `RunCommand.execute()`, `ptah.ts` `case "run"` |
| REQ-CLI-02 | `RunCommand.execute()` Steps 1–2 |
| REQ-CLI-03 | `emitProgressLines()`, `pollUntilTerminal()`, `countFindingsInCrossReviewFile()` |
| REQ-CLI-04 | `resolveStartPhase()` Tier 1 |
| REQ-CLI-05 | `resolveStartPhase()` Tier 2 |
| REQ-CLI-06 | `RunCommand.execute()` Step 5; `listWorkflowsByPrefix()` `statusFilter` |
| REQ-WF-01 | `ptah.workflow.yaml` template `skip_if`; pre-loop `checkArtifactExists`; `evaluateSkipCondition()` |
| REQ-WF-02 | Updated `ptah.workflow.yaml` template with 8-role reviewer matrix |
| REQ-WF-03 | `properties-tests` phase in YAML; `deriveDocumentType()` special-case |
| REQ-WF-04 | `revision_bound: 5` in YAML; `DefaultWorkflowValidator` validation |
| REQ-WF-05 | `SkipCondition` discriminated union; `evaluateSkipCondition()` extended signature; `checkArtifactExists` Activity; `FeatureWorkflowState.artifactExists` |
| REQ-WF-06 | `isCompletionReady()` new signature with `workflowConfig` param |
| REQ-AG-01 | `FILE_MANIFEST` 8 skill stubs |
| REQ-AG-02 | `buildConfig()` 8 agents |
| REQ-CR-01 | `SKILL_TO_AGENT`/`AGENT_TO_SKILL` updates in `cross-review-parser.ts` |
| REQ-CR-02 | `crossReviewPath()` `revisionCount` param |
| REQ-CR-03 | `ReadCrossReviewInput.revisionCount`; `readCrossReviewRecommendation` passes it to `crossReviewPath()` |
| REQ-CR-04 | `runReviewCycle()` threads `revisionCount`; updates `writtenVersions` |
| REQ-CR-05 | `VALUE_MATCHERS` new entry; `mapRecommendationToStatus()` deleted |
| REQ-CR-06 | `VALUE_MATCHERS` new entry for "need attention" |
| REQ-CR-07 | Full version history enumeration in `runReviewCycle()` optimizer context assembly |
| REQ-NF-01 | `LEGACY_AGENT_TO_SKILL` preserved; old `SKILL_TO_AGENT` entries preserved |
| REQ-NF-02 | `handleQuestion()` no-Discord path; `LenientConfigLoader`; `signalHumanAnswer()` |
| REQ-NF-03 | `ReadCrossReviewInput.revisionCount`; `SkillActivityInput.revisionCount` |
| REQ-NF-04 | `ReviewState.writtenVersions`; `buildInitialWorkflowState()` init; `buildContinueAsNewPayload()` carry |

---

## 16. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 22, 2026 | Senior Software Engineer | Initial TSPEC. Full technical design covering all 25 requirements across CLI, workflow engine, agent configuration, cross-review mechanics, and non-functional requirements. |
| 1.1 | April 22, 2026 | Senior Software Engineer | Addressed cross-review feedback (iteration 1) from product-manager (6 High/Medium findings) and test-engineer (4 High findings). Key changes: (1) **PM F-01 / TE F-02 (High):** Corrected `isCompletionReady()` sign-off type from timestamp string to boolean (`=== true` check); updated function signature to `Record<string, boolean>`; updated legacy fallback to use `=== true`; aligned with FSPEC-WF-02 BR-WF-09. (2) **PM F-02 (High):** Resolved `SKILL_TO_AGENT`/`AGENT_TO_SKILL` key-collision: documented constraint conflict (REQ-CR-01 "derived exclusively by reversal" is irreconcilable with backward-compat many-to-one requirement); chose `LEGACY_AGENT_TO_SKILL` supplement approach with REQ amendment recommendation; removed `LEGACY_AGENT_TO_SKILL` as a rogue workaround, elevated it as the specified and justified implementation; all 7 `agentIdToSkillName` ACs satisfied. (3) **PM F-03 / TE F-04 (High):** Removed the in-document correction note from `resolveStartPhase()`; published single authoritative algorithm with clearly enumerated cases (`lastContiguousIndex === -1`, `=== 0 with/without gap`, `> 0`, `=== length-1`); added phase-map summary table. (4) **PM F-04 (Medium):** `countFindingsInCrossReviewFile()` now resolves versioned path via `reviewState.writtenVersions[agentId]` instead of always using the unversioned path; full function signature and algorithm specified. (5) **PM F-05 (Medium):** Added `activeAgentIds: string[]` field to `FeatureWorkflowState` (Section 4.3) with lifecycle semantics; fixed `pollUntilTerminal()` to use `PHASE_LABELS` static map (not `state.workflowConfig`) for phase lookup; fixed `emitProgressLines()` to derive optimizer dispatch line from `state.activeAgentIds`; fallback for unknown phase IDs documented. (6) **PM F-06 (Medium):** Added explicit note to YAML template stating FSPEC/TSPEC/PLAN/PROPERTIES creation phases intentionally have no `skip_if` conditions; documented scope rationale. (7) **TE F-01 (High):** Added negative partial-match test for `parseRecommendation()` (superset string must return `revision_requested`). (8) **TE F-03 (High):** Added `FakeTemporalClient` status-filter correctness test (populate both `workflowIds` and `workflowStatuses`; verify non-matching statuses are excluded). (9) **TE F-04 (High):** Added missing `resolveStartPhase()` test cases: empty folder (`lastContiguousIndex === -1`), all-5-artifacts-present (`implementation`), gap at position 2 (TSPEC absent, PLAN present). (10) **TE F-08 (Medium):** Added `agentIdToSkillName("fe")` → `"frontend-engineer"` to test table. (11) General: updated `emitProgressLines()` signature to accept `phaseId: string` instead of `phase: PhaseDefinition`; `pollUntilTerminal()` deduplication state now includes `activeAgentIds`; removed `state.workflowConfig` access from polling loop. |

---

*End of Document*
