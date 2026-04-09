# Technical Specification: Temporal Integration Completion

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-temporal-integration-completion](REQ-temporal-integration-completion.md) |
| **Functional Specifications** | [FSPEC-temporal-integration-completion](FSPEC-temporal-integration-completion.md) |
| **Date** | 2026-04-08 |
| **Status** | Draft (Rev 2 — addressing qa cross-review feedback) |

---

## 1. Summary

This TSPEC translates 11 requirements (REQ-RC-01/02, REQ-CD-01/02, REQ-DR-01/02/03, REQ-SC-01, REQ-FJ-01, REQ-NF-01/02) and 4 FSPECs (FSPEC-RC-01, FSPEC-DR-01/02/03) into concrete implementation changes. The work completes the "Phase G" integration layer — wiring existing components together rather than building new architecture.

Changes span 3 layers:
1. **Workflow layer** — fix `evaluateSkipCondition`, wire `resolveContextDocuments`, replace `routingSignalType`-based recommendation proxy with activity-based cross-review parsing, fix fork/join double-invocation
2. **Activity layer** — new `readCrossReviewRecommendation` activity, fix `contextDocumentRefs`/`taskType`/`documentType` pass-through in `invokeSkill`
3. **Orchestrator layer** — restructure `handleMessage()` for workflow start, user-answer routing, retry/cancel/resume routing

---

## 2. Technology Stack

No new runtime dependencies. All changes use existing project infrastructure.

| Concern | Choice |
|---------|--------|
| Runtime | Node.js 20 LTS (existing) |
| Language | TypeScript 5.x ESM (existing) |
| Workflow Engine | `@temporalio/workflow`, `@temporalio/activity` (existing) |
| Test Framework | Vitest (existing) |
| Discord | `discord.js` via `DiscordClient` interface (existing) |

---

## 3. Project Structure

```
ptah/src/
├── orchestrator/
│   ├── pdlc/
│   │   └── cross-review-parser.ts        ── UPDATED (fix SKILL_TO_AGENT mapping)
│   ├── temporal-orchestrator.ts           ── UPDATED (restructure handleMessage)
│   └── ad-hoc-parser.ts                  ── unchanged
├── temporal/
│   ├── activities/
│   │   ├── skill-activity.ts             ── UPDATED (pass fields to assembler)
│   │   ├── cross-review-activity.ts      ── NEW (readCrossReviewRecommendation)
│   │   └── notification-activity.ts      ── unchanged
│   ├── workflows/
│   │   └── feature-lifecycle.ts          ── UPDATED (multiple fixes)
│   ├── worker.ts                         ── UPDATED (register new activity)
│   ├── client.ts                         ── unchanged
│   └── types.ts                          ── UPDATED (PhaseStatus + new types)

ptah/tests/
├── unit/
│   ├── orchestrator/
│   │   ├── cross-review-parser.test.ts   ── UPDATED (tests for corrected mapping)
│   │   └── temporal-orchestrator.test.ts  ── NEW (handleMessage unit tests)
│   └── temporal/
│       ├── cross-review-activity.test.ts  ── NEW
│       ├── feature-lifecycle.test.ts      ── UPDATED (skip_if prefix tests)
│       └── workflows/
│           └── feature-lifecycle.test.ts  ── UPDATED (context doc resolution tests)
├── integration/
│   └── temporal/
│       └── workflow-integration.test.ts   ── UPDATED (end-to-end integration tests)
└── fixtures/
    └── factories.ts                       ── UPDATED (new fakes/helpers)
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
TemporalOrchestrator (updated)
  ├── TemporalClientWrapper        (existing — queryWorkflowState, signals)
  ├── DiscordClient                (existing — postPlainMessage)
  ├── AgentRegistry                (existing — getAgentById, getAllAgents)
  ├── parseAdHocDirective()        (existing — only called when workflow IS running)
  ├── extractFeatureName()         (existing)
  ├── featureNameToSlug()          (existing)
  └── parseUserIntent()            (NEW — pure function, see §5.5)

feature-lifecycle.ts (workflow, updated)
  ├── resolveContextDocuments()    (existing — now called at dispatch sites)
  ├── buildInvokeSkillInput()      (existing — documentType derivation changed)
  ├── evaluateSkipCondition()      (existing — fix config. prefix stripping)
  ├── readCrossReviewRecommendation (NEW activity proxy)
  └── deriveDocumentType()         (NEW — pure function, see §5.2)

cross-review-activity.ts (NEW)
  ├── FileSystem                   (existing — readFile)
  ├── parseRecommendation()        (existing — from cross-review-parser.ts)
  ├── agentIdToSkillName()         (existing — from cross-review-parser.ts)
  └── crossReviewPath()            (existing — from cross-review-parser.ts)
```

### 4.2 New Types

```typescript
// types.ts — additions

// Extend PhaseStatus with "revision-bound-reached" for Discord routing
export type PhaseStatus =
  | "running"
  | "waiting-for-user"
  | "waiting-for-reviewers"
  | "failed"
  | "revision-bound-reached"  // NEW — set when revision bound exceeded, waiting for resume/cancel
  | "completed";

// Input/output for readCrossReviewRecommendation activity
export interface ReadCrossReviewInput {
  featurePath: string;
  agentId: string;
  documentType: string;  // e.g., "REQ", "TSPEC"
}

export interface CrossReviewResult {
  status: "approved" | "revision_requested" | "parse_error";
  reason?: string;       // only when status === "parse_error"
  rawValue?: string;     // only when status === "parse_error" and value was found but unrecognized
}
```

### 4.3 Protocols (Interfaces)

No new protocols required. All new code uses existing interfaces:
- `FileSystem` — for `readFile()` in the new activity
- `TemporalClientWrapper` — for `queryWorkflowState()`, signal delivery
- `DiscordClient` — for `postPlainMessage()`, `postChannelMessage()`
- `AgentRegistry` — for `getAgentById()`, `getAllAgents()`

---

## 5. Algorithms

### 5.1 Fix: evaluateSkipCondition config. prefix stripping (REQ-SC-01)

**File:** `feature-lifecycle.ts:136-149`

**Current code (line 141):**
```typescript
const value = config[condition.field];
```

**Updated code:**
```typescript
const fieldKey = condition.field.startsWith("config.")
  ? condition.field.slice(7)   // strip "config." prefix
  : condition.field;
const value = config[fieldKey];
```

**Rationale:** The YAML uses `field: config.skipFspec` but `FeatureConfig` has a top-level `skipFspec` property. Only the single `config.` prefix is stripped — no nested path support per REQ-SC-01 scope.

### 5.2 Pure Function: deriveDocumentType (FSPEC-RC-01)

**File:** `feature-lifecycle.ts` (new export, near the other pure helpers)

```typescript
/**
 * Derive the uppercase document type abbreviation from a phase ID.
 * Strips the phase type suffix (-creation, -review, -approved) and uppercases.
 *
 * Examples:
 *   "req-review"    → "REQ"
 *   "fspec-creation" → "FSPEC"
 *   "tspec-review"  → "TSPEC"
 *   "properties-review" → "PROPERTIES"
 */
export function deriveDocumentType(phaseId: string): string {
  return phaseId.replace(/-(?:creation|review|approved)$/, "").toUpperCase();
}
```

**Design rationale:** This is a pure, deterministic function safe for use inside Temporal workflow code. It avoids a lookup table per FSPEC-RC-01's derivation rule.

### 5.3 New Activity: readCrossReviewRecommendation (REQ-RC-02)

**File:** `cross-review-activity.ts` (new file)

```typescript
export interface CrossReviewActivityDeps {
  fs: FileSystem;
  logger: Logger;
}

export function createCrossReviewActivities(deps: CrossReviewActivityDeps) {
  const { fs, logger } = deps;

  async function readCrossReviewRecommendation(
    input: ReadCrossReviewInput
  ): Promise<CrossReviewResult> {
    const { featurePath, agentId, documentType } = input;

    // Step 1: Map agentId → skillName (reviewer token)
    const skillName = agentIdToSkillName(agentId);
    if (skillName === null) {
      return {
        status: "parse_error",
        reason: `Unknown agent ID: ${agentId}`,
      };
    }

    // Step 2: Construct file path
    const filePath = crossReviewPath(featurePath, skillName, documentType);

    // Step 3: Read file
    let content: string;
    try {
      content = await fs.readFile(filePath);
    } catch (err) {
      logger.warn(`Cross-review file not found: ${filePath}`);
      return {
        status: "parse_error",
        reason: "Cross-review file not found",
      };
    }

    // Step 4: Parse recommendation
    const parsed = parseRecommendation(content);
    if (parsed.status === "parse_error") {
      return parsed;  // Already has reason and optional rawValue
    }

    return { status: parsed.status };
  }

  return { readCrossReviewRecommendation };
}
```

**Key decisions:**
- Returns `CrossReviewResult` — the workflow decides how to handle each status
- File-not-found returns `parse_error` (not an exception) — per BR-RC-02
- No internal retry — per REQ-RC-02 retry policy, the workflow handles retries via Temporal
- Reuses all three existing cross-review-parser functions (`agentIdToSkillName`, `crossReviewPath`, `parseRecommendation`)

### 5.4 Workflow Change: Review Cycle with Cross-Review Parsing (REQ-RC-01)

**File:** `feature-lifecycle.ts`, `runReviewCycle()` function (lines 1200-1222)

**Current approach (lines 1200-1206):**
```typescript
// Parse recommendation from routingSignalType proxy
const status = mapRecommendationToStatus(result.routingSignalType);
```

**New approach:**
```typescript
// After reviewer invokeSkill completes successfully:
// 1. Derive documentType from phase ID
const docType = deriveDocumentType(reviewPhase.id);

// 2. Call readCrossReviewRecommendation activity
const crossReviewResult = await readCrossReviewRecommendation({
  featurePath: state.featurePath!,
  agentId: reviewerId,
  documentType: docType,
});

// 3. Route result
if (crossReviewResult.status === "parse_error") {
  // Enter failure flow
  const reason = crossReviewResult.rawValue
    ? `${crossReviewResult.reason}: ${crossReviewResult.rawValue}`
    : crossReviewResult.reason!;
  const action = await handleFailureFlow({
    state,
    phaseId: reviewPhase.id,
    agentId: reviewerId,
    errorType: "RecommendationParseError",
    errorMessage: reason,
    workflowId,
  });
  if (action === "cancel") return "cancelled";
  return runReviewCycle(params);
}

// approved or revision_requested
reviewState.reviewerStatuses[reviewerId] = crossReviewResult.status;
if (crossReviewResult.status === "revision_requested") anyRevisionRequested = true;
```

**Activity proxy registration** — add to the `WorkflowActivities` interface and `proxyActivities` call:
```typescript
interface WorkflowActivities {
  // ... existing ...
  readCrossReviewRecommendation(input: ReadCrossReviewInput): Promise<CrossReviewResult>;
}
```

**Retry configuration** — use a shorter timeout than `invokeSkill` since this is a fast file read:
```typescript
const { readCrossReviewRecommendation } = wf.proxyActivities<
  Pick<WorkflowActivities, "readCrossReviewRecommendation">
>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 2,
    initialInterval: "5 seconds",
  },
});
```

### 5.5 Workflow Change: Context Document Resolution at Dispatch Sites (REQ-CD-01)

**File:** `feature-lifecycle.ts`, at each dispatch call site

The `resolveContextDocuments()` function already exists and is a pure function (safe for workflow code). It must be called before `buildInvokeSkillInput()` at three call sites:

**Call site 1: `dispatchSingleAgent`** (line 793)
```typescript
// Before buildInvokeSkillInput:
const resolvedContextDocs = state.featurePath
  ? resolveContextDocuments(phase.context_documents ?? [], {
      featureSlug: state.featureSlug,
      featurePath: state.featurePath,
    })
  : phase.context_documents ?? [];
```

Then pass `resolvedContextDocs` into `buildInvokeSkillInput` via a new optional parameter `resolvedContextDocumentRefs`.

**Call site 2: `dispatchForkJoin`** (line 869) — same pattern.

**Call site 3: `runReviewCycle`** (line 1164) — same pattern.

**buildInvokeSkillInput change:** Add an optional `resolvedContextDocumentRefs` field to `BuildInvokeSkillInputParams`. When provided, use it instead of `phase.context_documents`:
```typescript
export interface BuildInvokeSkillInputParams {
  // ... existing ...
  /** Pre-resolved context document paths. When provided, overrides phase.context_documents. */
  resolvedContextDocumentRefs?: string[];
}

// In buildInvokeSkillInput:
contextDocumentRefs: params.resolvedContextDocumentRefs ?? phase.context_documents ?? [],
```

### 5.6 Workflow Change: documentType Derivation (REQ-CD-01)

**File:** `feature-lifecycle.ts`, `buildInvokeSkillInput()` (line 414)

**Current:**
```typescript
documentType: phase.id, // "req-review", "fspec-creation", etc.
```

**Updated:**
```typescript
documentType: deriveDocumentType(phase.id), // "REQ", "FSPEC", etc.
```

This produces the uppercase abbreviation that the context assembler expects for PDLC task directives.

### 5.7 Activity Change: Pass Fields to Context Assembler (REQ-CD-02)

**File:** `skill-activity.ts`, `invokeSkill()` function (lines 195-213)

**Current `contextAssembler.assemble()` call:**
```typescript
const contextBundle = await contextAssembler.assemble({
  agentId,
  threadId: `temporal-${featureSlug}-${phaseId}`,
  threadName: `${featureSlug} — ${phaseId}`,
  threadHistory: [],
  triggerMessage: { ... },
  config,
  worktreePath,
});
```

**Updated — add three fields:**
```typescript
const contextBundle = await contextAssembler.assemble({
  agentId,
  threadId: `temporal-${featureSlug}-${phaseId}`,
  threadName: `${featureSlug} — ${phaseId}`,
  threadHistory: [],
  triggerMessage: { ... },
  config,
  worktreePath,
  contextDocumentRefs: contextDocumentRefs.length > 0 ? contextDocumentRefs : undefined,
  taskType: taskType as TaskType,
  documentType,
});
```

**Design note:** `contextDocumentRefs` is only passed when non-empty to preserve backward compatibility — the assembler falls back to folder scanning when `contextDocumentRefs` is undefined.

### 5.8 Fix: Fork/Join ROUTE_TO_USER Double-Invocation (REQ-FJ-01)

**File:** `feature-lifecycle.ts`, `dispatchForkJoin()` (lines 962-997)

**Current code (lines 964-997):**
```typescript
for (const agentId of routeToUserAgents) {
  const existingResult = results[agentId] as SkillActivityResult;
  const questionResult = await handleQuestionFlow({ ... });
  // BUG: Re-invoke the agent AGAIN from scratch
  const reinvokeResult = await invokeSkill(
    buildInvokeSkillInput({ ... })
  );
  // Uses reinvokeResult instead of questionResult
  agentResults[agentId] = { ... reinvokeResult ... };
}
```

**Fixed code:**
```typescript
for (const agentId of routeToUserAgents) {
  const existingResult = results[agentId] as SkillActivityResult;
  const questionResult = await handleQuestionFlow({
    state,
    phase,
    agentId,
    question: existingResult.question!,
    featureConfig: state.featureConfig,
    forkJoin: true,
    workflowId,
  });
  // Use questionResult directly — handleQuestionFlow already re-invoked the agent
  if (questionResult.routingSignalType === "LGTM") {
    recordSignOff(state.signOffs, agentId, new Date().toISOString());
  }
  agentResults[agentId] = {
    status: questionResult.routingSignalType === "LGTM" || questionResult.routingSignalType === "TASK_COMPLETE"
      ? "success"
      : "failed",
    worktreePath: questionResult.worktreePath,
    routingSignal: questionResult.routingSignalType,
  };
}
```

### 5.9 Orchestrator Change: handleMessage Restructure (REQ-DR-01/02/03, FSPEC-DR-01/02/03)

**File:** `temporal-orchestrator.ts`, `handleMessage()` method

The existing `handleMessage()` is completely restructured. The new implementation follows FSPEC-DR-01's behavioral flow:

```typescript
async handleMessage(message: ThreadMessage): Promise<void> {
  // Step 1: Bot filter
  if (message.isBot) return;

  // Step 2: Extract feature slug
  const featureName = extractFeatureName(message.threadName);
  const slug = featureNameToSlug(featureName);
  const workflowId = `ptah-${slug}`;

  // Step 3: Check workflow existence FIRST (FSPEC-DR-01 BR-DR-01)
  let workflowRunning = false;
  let workflowState: FeatureWorkflowState | null = null;
  try {
    workflowState = await this.temporalClient.queryWorkflowState(workflowId);
    workflowRunning = true;
  } catch (err) {
    if (err instanceof Error && err.name === "WorkflowNotFoundError") {
      // No workflow exists → Branch B (may start new workflow)
      workflowRunning = false;
    } else {
      // Temporal query failure (server unreachable, timeout) → fail-silent (FSPEC-DR-01)
      this.logger.warn(`Temporal query failed for ${workflowId}: ${err}`);
      return;
    }
  }

  if (workflowRunning && workflowState) {
    // --- Branch A: Workflow IS running ---

    // Step 4a: Try ad-hoc directive
    const directive = parseAdHocDirective(message.content);
    if (directive) {
      await this.handleAdHocDirective(directive, message, workflowId, slug);
      return;
    }

    // Step 5: State-dependent routing
    await this.handleStateDependentRouting(message, workflowId, workflowState);
    return;
  }

  // --- Branch B: No running workflow ---

  // Step 4b: Check for agent mention anywhere in message
  if (!this.containsAgentMention(message.content)) return;

  // Guard: empty slug
  if (!slug) {
    this.logger.warn("Empty slug derived from thread name; skipping workflow start");
    return;
  }

  // Step 5b: Start new workflow
  await this.startNewWorkflow(slug, message);
}
```

**New private methods on TemporalOrchestrator:**

#### handleAdHocDirective (extracted from existing handleMessage)

Existing ad-hoc logic (lines 244-300) extracted into a private method. No behavioral change — just relocated.

#### handleStateDependentRouting (FSPEC-DR-02, DR-03)

```typescript
private async handleStateDependentRouting(
  message: ThreadMessage,
  workflowId: string,
  state: FeatureWorkflowState,
): Promise<void> {
  const phaseStatus = state.phaseStatus;

  if (phaseStatus === "waiting-for-user") {
    // FSPEC-DR-02: Route as user answer
    try {
      await this.routeUserAnswer({
        workflowId,
        answer: message.content,
        answeredBy: message.authorName,
        answeredAt: message.timestamp.toISOString(),
      });
    } catch (err) {
      await this.discord.postPlainMessage(
        message.threadId,
        "Failed to deliver answer. Please try again.",
      );
    }
    return;
  }

  if (phaseStatus === "failed" || phaseStatus === "revision-bound-reached") {
    // FSPEC-DR-03: Parse intent and route
    const intent = parseUserIntent(message.content);
    if (!intent) return; // No keyword — silent ignore

    await this.handleIntentRouting(message, workflowId, phaseStatus, intent);
    return;
  }

  // Any other state: silently ignore
}
```

#### containsAgentMention (FSPEC-DR-01 BR-DR-05)

```typescript
private containsAgentMention(content: string): boolean {
  const allAgents = this.agentRegistry.getAllAgents();
  return allAgents.some((agent) => {
    const pattern = new RegExp(`@${agent.id}\\b`, "i");
    return pattern.test(content);
  });
}
```

#### startNewWorkflow (FSPEC-DR-01 step 6b)

```typescript
private async startNewWorkflow(slug: string, message: ThreadMessage): Promise<void> {
  const featureConfig: FeatureConfig = {
    discipline: "fullstack",
    skipFspec: false,
    useTechLead: false,
  };

  try {
    const workflowId = await this.startWorkflowForFeature({
      featureSlug: slug,
      featureConfig,
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

### 5.10 Pure Function: parseUserIntent (FSPEC-DR-03)

**File:** `temporal-orchestrator.ts` (module-level export for testing)

```typescript
export type UserIntent = "retry" | "cancel" | "resume";

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: UserIntent }> = [
  { pattern: /\bretry\b/i, intent: "retry" },
  { pattern: /\bcancel\b/i, intent: "cancel" },
  { pattern: /\bresume\b/i, intent: "resume" },
];

/**
 * Parse the first recognized intent keyword from a message.
 * Returns null if no keyword is found.
 *
 * Per FSPEC-DR-03 BR-DR-10/11/12:
 * - Standalone word matching (word boundary regex)
 * - Case-insensitive
 * - First match wins (scan order: retry, cancel, resume)
 */
export function parseUserIntent(content: string): UserIntent | null {
  // Find the earliest matching keyword by position
  let earliest: { intent: UserIntent; index: number } | null = null;

  for (const { pattern, intent } of INTENT_PATTERNS) {
    const match = pattern.exec(content);
    if (match && (earliest === null || match.index < earliest.index)) {
      earliest = { intent, index: match.index };
    }
  }

  return earliest?.intent ?? null;
}
```

**Design note on "first match":** BR-DR-12 says "first match in the message" — this means earliest position, not first pattern tried. The implementation finds the match with the smallest `index` across all patterns.

### 5.11 Intent Routing with Hints (FSPEC-DR-03 BR-DR-13)

**File:** `temporal-orchestrator.ts`, private method

```typescript
private async handleIntentRouting(
  message: ThreadMessage,
  workflowId: string,
  state: PhaseStatus,
  intent: UserIntent,
): Promise<void> {
  // State-action validation matrix
  const VALID_ACTIONS: Record<string, UserIntent[]> = {
    "failed": ["retry", "cancel"],
    "revision-bound-reached": ["resume", "cancel"],
  };

  const HINT_MESSAGES: Record<string, string> = {
    "failed": "Workflow is in failed state. Use 'retry' to re-execute or 'cancel' to abort.",
    "revision-bound-reached": "Workflow reached revision bound. Use 'resume' to continue or 'cancel' to abort.",
  };

  const validActions = VALID_ACTIONS[state] ?? [];
  if (!validActions.includes(intent)) {
    // Invalid action for current state — post hint
    const hint = HINT_MESSAGES[state];
    if (hint) {
      await this.discord.postPlainMessage(message.threadId, hint);
    }
    return;
  }

  // Route signal
  try {
    if (state === "failed") {
      await this.routeRetryOrCancel({ workflowId, action: intent as "retry" | "cancel" });
    } else {
      await this.routeResumeOrCancel({ workflowId, action: intent as "resume" | "cancel" });
    }

    // Best-effort ack (BR-DR-14)
    try {
      await this.discord.postPlainMessage(
        message.threadId,
        `Sent ${intent} signal to workflow ${workflowId}`,
      );
    } catch {
      this.logger.warn(`Failed to post ack for ${intent} signal`);
    }
  } catch (err) {
    await this.discord.postPlainMessage(
      message.threadId,
      `Failed to send ${intent} signal. Please try again.`,
    );
  }
}
```

### 5.12 Workflow Change: Set "revision-bound-reached" PhaseStatus

**File:** `feature-lifecycle.ts`, revision bound check (lines 1237-1254)

**Current code** does not set `phaseStatus` before waiting for the resume/cancel signal. Add:

```typescript
if (reviewState.revisionCount > revisionBound) {
  state.phaseStatus = "revision-bound-reached";  // NEW — enables Discord routing
  _state = state;

  await sendNotification({ ... });
  // ... existing wait for resumeOrCancelSignal ...
}
```

### 5.13 Fix: SKILL_TO_AGENT Mapping (FSPEC-RC-01)

**File:** `cross-review-parser.ts`, line 6

**Current:**
```typescript
const SKILL_TO_AGENT: Record<string, string> = {
  "backend-engineer": "eng",
  ...
};
```

**Updated:**
```typescript
const SKILL_TO_AGENT: Record<string, string> = {
  "engineer": "eng",
  ...
};
```

This ensures `agentIdToSkillName("eng")` returns `"engineer"` (matching the file naming convention used by the engineer skill).

### 5.14 Workflow Change: Cross-Review Refs in Revision Dispatch

**File:** `feature-lifecycle.ts`, `runReviewCycle()` revision dispatch (lines 1257-1261)

The current code constructs cross-review refs using raw `creationPhase.id` as the document type suffix:
```typescript
.map((id) => `${state.featurePath}CROSS-REVIEW-${id}-${creationPhase.id}.md`)
```

This produces paths like `CROSS-REVIEW-eng-req-creation.md`, but the actual files use the reviewer's skill name and the uppercase document type. Fix:

```typescript
const docType = deriveDocumentType(reviewPhase.id);
const crossReviewRefs = Object.keys(reviewState.reviewerStatuses)
  .filter((id) => reviewState.reviewerStatuses[id] === "revision_requested")
  .map((id) => {
    const skillName = agentIdToSkillName(id) ?? id;
    return crossReviewPath(state.featurePath!, skillName, docType);
  });
```

Note: This requires importing `agentIdToSkillName` and `crossReviewPath` into the workflow. Since these are pure functions with no I/O, they are safe for use in Temporal workflow code. Import them via the Temporal workflow sandbox's module import mechanism.

**Important:** Temporal workflow code runs in a sandboxed V8 isolate. Pure functions can be imported if they don't perform I/O or use non-deterministic APIs. The cross-review-parser functions (`agentIdToSkillName`, `crossReviewPath`) are pure string operations — safe to import directly.

---

## 6. Error Handling

| Scenario | Component | Behavior | Error Type |
|----------|-----------|----------|------------|
| Cross-review file not found | `readCrossReviewRecommendation` | Returns `parse_error` | — (not an exception) |
| Unknown agent ID | `readCrossReviewRecommendation` | Returns `parse_error` | — |
| Unrecognized recommendation value | `readCrossReviewRecommendation` | Returns `parse_error` with `rawValue` | — |
| Workflow parse_error from activity | `runReviewCycle` | Enters `handleFailureFlow` (retry/cancel) | `RecommendationParseError` |
| Temporal query fails | `handleMessage` | Fail-silent, message falls through | — (caught, logged) |
| Temporal signal delivery fails | `handleStateDependentRouting` | Error posted to Discord thread | — |
| Workflow start fails | `startNewWorkflow` | Error posted to Discord thread | — |
| `WorkflowExecutionAlreadyStartedError` | `startNewWorkflow` | "Workflow already running" posted | — |
| Empty slug from thread name | `handleMessage` | Skip start, log warning | — |
| `resolveContextDocuments` with null featurePath | dispatch sites | Fallback to raw `phase.context_documents` | — |
| Ack message fails to post after successful signal | `handleIntentRouting` | Log warning, do not fail — signal already delivered | — (caught, logged) |

---

## 7. Test Strategy

### 7.1 Test Doubles

**Existing fakes (from `factories.ts`):**
- `FakeTemporalClient` — extends with `queryWorkflowState` return value control
- `FakeDiscordClient` — tracks `postPlainMessage` calls via `postPlainMessageCalls` array
- `FakeFileSystem` — in-memory file store
- `FakeLogger` — captures log messages

**New/updated fakes:**

```typescript
// FakeTemporalClient — extend existing implementation (preserves workflowStates Map)
class FakeTemporalClient implements TemporalClientWrapper {
  // ... existing fields (workflowStates Map, startedWorkflows, sentSignals, etc.) ...

  // NEW: Global error injection for Temporal outage simulation
  queryWorkflowStateError: Error | null = null;

  async queryWorkflowState(workflowId: string): Promise<FeatureWorkflowState> {
    // Global error injection takes priority (simulates Temporal server outage)
    if (this.queryWorkflowStateError) throw this.queryWorkflowStateError;

    // Existing behavior: per-workflow-ID lookup from Map
    const state = this.workflowStates.get(workflowId);
    if (!state) {
      const err = new Error(`Workflow ${workflowId} not found`);
      err.name = "WorkflowNotFoundError";
      throw err;
    }
    return state;
  }
}
```

This extends the existing `workflowStates: Map<string, FeatureWorkflowState>` pattern rather than replacing it. The Map-based lookup supports multi-workflow test scenarios and preserves backward compatibility with existing tests. The new `queryWorkflowStateError` property enables Temporal outage simulation (fail-silent path from §5.9).

### 7.2 Test Categories

| Category | Test File | What Is Tested |
|----------|-----------|----------------|
| Unit | `cross-review-parser.test.ts` | SKILL_TO_AGENT correction: `agentIdToSkillName("eng")` → `"engineer"` |
| Unit | `cross-review-activity.test.ts` | `readCrossReviewRecommendation` — all 3 result paths (approved, revision_requested, parse_error) |
| Unit | `feature-lifecycle.test.ts` | `evaluateSkipCondition` with `"config.skipFspec"` field, `deriveDocumentType()` |
| Unit | `feature-lifecycle.test.ts` | `resolveContextDocuments` at dispatch call sites (via `buildInvokeSkillInput` parameter) |
| Unit | `temporal-orchestrator.test.ts` | `parseUserIntent` — all keywords, edge cases, no-match, position-based precedence (e.g., `"cancel first, then retry"` → `"cancel"`) |
| Unit | `temporal-orchestrator.test.ts` | `handleMessage` — workflow start, user-answer routing, retry/cancel/resume routing, hints, fail-silent on query failure, ack failure after signal |
| Unit | `temporal-orchestrator.test.ts` | `containsAgentMention` — matches anywhere, case sensitivity |
| Integration | `workflow-integration.test.ts` | Review cycle with `readCrossReviewRecommendation` activity |
| Integration | `workflow-integration.test.ts` | Context document resolution end-to-end |
| Integration | `workflow-integration.test.ts` | Discord message → Temporal signal routing |

### 7.3 Activity Test Pattern

The `readCrossReviewRecommendation` activity tests follow the same pattern as `notification-activity.test.ts`:

```typescript
// tests/unit/temporal/cross-review-activity.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  heartbeat: vi.fn(),
  Context: { current: vi.fn() },
}));

import { createCrossReviewActivities } from "...";
import { FakeFileSystem, FakeLogger } from "../../fixtures/factories.js";

describe("readCrossReviewRecommendation", () => {
  it("returns approved when file contains Approved recommendation", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting(
      "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md",
      "## Recommendation\n\n**Approved**"
    );
    const { readCrossReviewRecommendation } = createCrossReviewActivities({
      fs, logger: new FakeLogger()
    });

    const result = await readCrossReviewRecommendation({
      featurePath: "docs/in-progress/auth/",
      agentId: "eng",
      documentType: "REQ",
    });

    expect(result).toEqual({ status: "approved" });
  });
  // ... additional tests per §7.2
});
```

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-SC-01 | `evaluateSkipCondition()` | Strip `config.` prefix from `condition.field` before property lookup |
| REQ-NF-02 | `feature-lifecycle.test.ts` | Unit tests using `"config.skipFspec"` field format |
| REQ-CD-01 | `resolveContextDocuments()` call sites in `dispatchSingleAgent`, `dispatchForkJoin`, `runReviewCycle`; `BuildInvokeSkillInputParams.resolvedContextDocumentRefs` | Resolve `{feature}/DOC_TYPE` templates before dispatch |
| REQ-CD-02 | `skill-activity.ts` → `contextAssembler.assemble()` | Pass `contextDocumentRefs`, `taskType`, `documentType` |
| REQ-RC-01 | `runReviewCycle()` replacement of lines 1200-1222 | Replace `routingSignalType` proxy with `readCrossReviewRecommendation` activity call |
| REQ-RC-02 | `cross-review-activity.ts`, `CrossReviewActivityDeps`, `createCrossReviewActivities()` | New activity: read file, parse recommendation, return result |
| REQ-FJ-01 | `dispatchForkJoin()` lines 976-984 | Remove redundant `invokeSkill` call, use `questionResult` directly |
| REQ-DR-01 | `handleMessage()` restructure, `containsAgentMention()`, `startNewWorkflow()` | Workflow existence check before ad-hoc, agent mention detection, workflow start |
| REQ-DR-02 | `handleStateDependentRouting()` | Route user messages as `user-answer` signal when state is `waiting-for-user` |
| REQ-DR-03 | `parseUserIntent()`, `handleIntentRouting()` | Parse retry/cancel/resume keywords, validate against state, send signals or hints |
| REQ-NF-01 | `workflow-integration.test.ts`, `temporal-orchestrator.test.ts` | Integration tests for all new paths |

---

## 9. Integration Points

### 9.1 Worker Registration

**File:** `worker.ts`

The `WorkerActivities` interface and `createTemporalWorker` must include `readCrossReviewRecommendation`. The composition root that builds `WorkerActivities` must construct a `CrossReviewActivityDeps` object and call `createCrossReviewActivities()`.

```typescript
// worker.ts — WorkerActivities interface addition
export interface WorkerActivities {
  // ... existing ...
  readCrossReviewRecommendation: (...args: any[]) => Promise<any>;
}
```

The composition root (wherever `createActivities()` and `createNotificationActivities()` are composed) must also compose `createCrossReviewActivities({ fs, logger })` and spread the result into the activities object.

### 9.2 Workflow Activity Proxy

**File:** `feature-lifecycle.ts`

A second `proxyActivities` call (or extension of the existing one) must include `readCrossReviewRecommendation` with a shorter timeout configuration appropriate for file reads (30s vs 30min for `invokeSkill`).

### 9.3 PhaseStatus Type Extension

**File:** `types.ts`

Adding `"revision-bound-reached"` to the `PhaseStatus` union type affects:
- The `workflowStateQuery` handler return type (automatic — it returns `FeatureWorkflowState`)
- Any code that does exhaustive matching on `PhaseStatus` (check for `switch` statements)
- The `FeatureWorkflowState.phaseStatus` field type

### 9.4 Pure Function Imports in Workflow

The workflow file needs to import `agentIdToSkillName`, `crossReviewPath`, and `deriveDocumentType` (the latter is defined locally). The first two come from `cross-review-parser.ts` — they must be importable in the Temporal workflow sandbox. Since they are pure string operations with no side effects, Node.js I/O imports, or non-deterministic APIs, they are safe.

### 9.5 Context Assembler Integration

The `contextAssembler.assemble()` call in `skill-activity.ts` already accepts `contextDocumentRefs`, `taskType`, and `documentType` as optional parameters (see `context-assembler.ts:26-30`). No changes needed to the `ContextAssembler` interface — only the call site in `skill-activity.ts`.

---

## 10. Open Questions

None — all product decisions have been resolved in the REQ (Rev 2) and FSPEC (Rev 2).

---

## 11. Appendix: Key Line References

These references are based on the current `feat-temporal-integration-completion` branch and may shift as implementation progresses.

| Component | File | Lines | Change Type |
|-----------|------|-------|-------------|
| `evaluateSkipCondition` | `feature-lifecycle.ts` | 136-149 | Fix prefix strip |
| `buildInvokeSkillInput` | `feature-lifecycle.ts` | 395-422 | Add `resolvedContextDocumentRefs`, fix `documentType` |
| `dispatchSingleAgent` | `feature-lifecycle.ts` | 769-842 | Add `resolveContextDocuments` call |
| `dispatchForkJoin` | `feature-lifecycle.ts` | 848-1063 | Add `resolveContextDocuments` call, fix ROUTE_TO_USER double-invoke |
| `runReviewCycle` | `feature-lifecycle.ts` | 1128-1292 | Replace routingSignalType proxy, add activity call, fix crossReviewRefs |
| Revision bound | `feature-lifecycle.ts` | 1237-1254 | Set `phaseStatus = "revision-bound-reached"` |
| `WorkflowActivities` | `feature-lifecycle.ts` | 590-597 | Add `readCrossReviewRecommendation` |
| `proxyActivities` | `feature-lifecycle.ts` | 601-617 | Add second proxy with shorter timeout |
| `invokeSkill` (activity) | `skill-activity.ts` | 195-213 | Pass fields to `contextAssembler.assemble()` |
| `SKILL_TO_AGENT` | `cross-review-parser.ts` | 5-10 | Fix `"backend-engineer"` → `"engineer"` |
| `handleMessage` | `temporal-orchestrator.ts` | 231-301 | Complete restructure |
| `WorkerActivities` | `worker.ts` | 21-34 | Add `readCrossReviewRecommendation` |
