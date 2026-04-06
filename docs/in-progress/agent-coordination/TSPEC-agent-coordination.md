# Technical Specification: Agent Coordination

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-agent-coordination](REQ-agent-coordination.md) |
| **Functional Specifications** | [FSPEC-agent-coordination](FSPEC-agent-coordination.md) |
| **Date** | April 6, 2026 |
| **Status** | Draft |

---

## 1. Summary

This TSPEC covers the two coordination gaps identified in REQ-016: shared worktree/branch strategy (WB domain, 5 requirements) and ad-hoc message routing (MR domain, 8 requirements + 2 NF requirements). The WB domain changes the git branch model from per-agent branches to a single shared `feat-{featureSlug}` branch with direct-push commits. The MR domain adds @agent-directed message parsing, Temporal signal dispatch, in-workflow queue management, and downstream review cascade.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Existing |
| Language | TypeScript 5.x (ESM) | Existing |
| Temporal SDK | @temporalio/client + @temporalio/workflow + @temporalio/activity | Existing — signals, queries, conditions |
| Test framework | Vitest | Existing |
| No new dependencies | — | All features implemented with existing stack |

---

## 3. Project Structure

```
ptah/src/
├── orchestrator/
│   ├── ad-hoc-parser.ts                    ← NEW
│   ├── artifact-committer.ts               ← UPDATED (commitAndPush method)
│   ├── temporal-orchestrator.ts            ← UPDATED (handleMessage, ensureFeatureBranch)
│   └── feature-branch.ts                   ← UNCHANGED (featureBranchName reused)
├── temporal/
│   ├── client.ts                           ← UPDATED (deterministic IDs, signalAdHocRevision)
│   ├── types.ts                            ← UPDATED (AdHocRevisionSignal, queue state)
│   ├── activities/
│   │   └── skill-activity.ts               ← UPDATED (shared branch worktree, path-only idempotency)
│   └── workflows/
│       └── feature-lifecycle.ts            ← UPDATED (adHocRevision signal, queue loop, cascade)
├── services/
│   └── git.ts                              ← UPDATED (addWorktreeOnBranch method)
└── types.ts                                ← UNCHANGED

ptah/tests/
├── unit/
│   ├── orchestrator/
│   │   ├── ad-hoc-parser.test.ts           ← NEW
│   │   ├── artifact-committer.test.ts      ← UPDATED
│   │   └── temporal-orchestrator.test.ts   ← UPDATED
│   └── temporal/
│       ├── client.test.ts                  ← UPDATED
│       └── workflows/
│           ├── ad-hoc-queue.test.ts         ← NEW
│           └── cascade.test.ts              ← NEW
└── fixtures/
    └── factories.ts                        ← UPDATED
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
TemporalOrchestrator (handleMessage)
  ├── AdHocParser (parseAdHocDirective)
  ├── AgentRegistry (getAgentById)
  ├── TemporalClientWrapper (signalAdHocRevision)
  ├── ResponsePoster (postPlainMessage — ack/error)
  └── Logger

TemporalClientWrapper (client layer)
  ├── startFeatureWorkflow   ← UPDATED (deterministic ID)
  ├── signalAdHocRevision    ← NEW
  └── signalUserAnswer       ← EXISTING

featureLifecycleWorkflow (workflow layer)
  ├── adHocRevisionSignal    ← NEW signal definition
  ├── adHocQueue[]           ← NEW in-workflow state
  ├── processAdHocQueue()    ← NEW helper
  └── executeCascade()       ← NEW helper

invokeSkill (activity layer)
  ├── worktree creation      ← UPDATED (shared branch checkout)
  ├── idempotency check      ← UPDATED (path-only)
  └── commitAndPush          ← NEW (replaces commitAndMerge for non-fork-join)
```

### 4.2 Protocols (Interfaces)

#### AdHocParser

```typescript
// src/orchestrator/ad-hoc-parser.ts

export interface AdHocDirective {
  agentIdentifier: string;  // raw identifier after @, lowercased
  instruction: string;       // remainder of message, trimmed
}

export function parseAdHocDirective(messageContent: string): AdHocDirective | null;
```

| Function | Behavior |
|----------|----------|
| `parseAdHocDirective(content)` | Strips leading whitespace, extracts first token. If first token starts with `@`, returns `{ agentIdentifier, instruction }`. Otherwise returns `null`. Agent identifier is lowercased. Instruction is the trimmed remainder after the @-token. |

Pure function. No dependencies.

#### TemporalClientWrapper (extended)

```typescript
// src/temporal/client.ts — additions to existing interface

export interface TemporalClientWrapper {
  // ... existing methods ...
  signalAdHocRevision(workflowId: string, signal: AdHocRevisionSignal): Promise<void>;
}
```

| Method | Behavior |
|--------|----------|
| `signalAdHocRevision(workflowId, signal)` | Gets workflow handle, sends `"ad-hoc-revision"` signal. Throws `WorkflowNotFoundError` if workflow doesn't exist (caught by caller for REQ-MR-05). |

#### ArtifactCommitter (extended)

```typescript
// src/orchestrator/artifact-committer.ts — additions to existing interface

export interface ArtifactCommitter {
  // ... existing methods ...
  commitAndPush(params: CommitAndPushParams): Promise<CommitAndPushResult>;
}

export interface CommitAndPushParams {
  worktreePath: string;
  featureBranch: string;
  artifactChanges: string[];
  agentId: string;
  threadName: string;
}

export interface CommitAndPushResult {
  commitSha: string | null;
  pushStatus: "pushed" | "no-changes" | "push-error" | "commit-error";
  featureBranch: string;
  errorMessage?: string;
}
```

| Method | Behavior |
|--------|----------|
| `commitAndPush(params)` | Filters to docs/ changes, stages, commits in worktree (already on `feat-{featureSlug}`), pushes to `origin feat-{featureSlug}`. No merge step. No merge lock needed. |

#### GitClient (extended)

```typescript
// src/services/git.ts — additions to existing interface

export interface GitClient {
  // ... existing methods ...
  addWorktreeOnBranch(path: string, branch: string): Promise<void>;
  ensureBranchExists(branch: string, baseBranch?: string): Promise<void>;
}
```

| Method | Behavior |
|--------|----------|
| `addWorktreeOnBranch(path, branch)` | Runs `git worktree add <path> <branch>` (no `-b` flag). Checks out the existing branch into a new worktree directory. Fails if branch doesn't exist or is already checked out in another worktree. |
| `ensureBranchExists(branch, baseBranch)` | If branch doesn't exist locally or on remote, creates it from `baseBranch` (default: `main`) and pushes to origin. If it already exists, no-op. |

### 4.3 Types

```typescript
// src/temporal/types.ts — additions

export interface AdHocRevisionSignal {
  targetAgentId: string;
  instruction: string;
  requestedBy: string;
  requestedAt: string;   // ISO 8601
}

// Added to FeatureWorkflowState:
export interface FeatureWorkflowState {
  // ... existing fields ...
  adHocQueue: AdHocRevisionSignal[];  // FIFO queue of pending ad-hoc signals
  adHocInProgress: boolean;            // true while processing ad-hoc + cascade
}

// Added to SkillActivityInput:
export interface SkillActivityInput {
  // ... existing fields ...
  adHocInstruction?: string;  // Ad-hoc instruction text from user's @-mention message
}

// Added to ContinueAsNewPayload:
export interface ContinueAsNewPayload {
  // ... existing fields ...
  adHocQueue: AdHocRevisionSignal[];
}
```

### 4.4 Concrete Implementations

- **`DefaultArtifactCommitter`** — extended with `commitAndPush()`. Uses `gitClient.addInWorktree()`, `gitClient.commitInWorktree()`, `gitClient.pushInWorktree()`. No merge lock.
- **`TemporalClientWrapperImpl`** — extended with `signalAdHocRevision()`. Same handle.signal() pattern as existing signals.
- **`ShellGitClient`** — extended with `addWorktreeOnBranch()` and `ensureBranchExists()`. Shells out to `git worktree add` and `git branch`/`git push`.

### 4.5 Composition Root Changes

No new composition root wiring needed. `AdHocParser` is a pure function (no DI). Other changes extend existing interfaces that are already wired.

---

## 5. Algorithm: Domain WB — Shared Branch Strategy

### 5.1 Branch Creation at Workflow Start (REQ-WB-05)

```
1. TemporalOrchestrator.startWorkflowForFeature(params) is called
2. Construct branch name: feat-{featureSlug}
3. Call gitClient.ensureBranchExists(branchName, "main")
   a. Check if branch exists locally: git branch --list {branchName}
   b. If not local, check remote: git ls-remote --heads origin {branchName}
   c. If neither exists: git branch {branchName} main && git push origin {branchName}
   d. If exists: no-op
4. Call temporalClient.startFeatureWorkflow(params) with deterministic ID
5. Return workflow ID
```

### 5.2 Deterministic Workflow ID (REQ-MR-08)

```
Old: ptah-feature-{slug}-{sequence}  (requires list query)
New: ptah-{featureSlug}              (deterministic, no query)
```

Change in `TemporalClientWrapperImpl.startFeatureWorkflow()`:
- Remove `resolveNextSequence()` call
- Use `ptah-${params.featureSlug}` directly as `workflowId`
- Temporal rejects duplicate running workflow IDs, enforcing single-workflow-per-feature

### 5.3 Worktree Creation from Shared Branch (REQ-WB-02)

Change in `invokeSkill` activity:

```
Old path:
  worktreeBranch = ptah/${featureSlug}/${agentId}/${phaseId}
  worktreeManager.create(featureBranch, ...) → creates ptah-wt-{uuid} branch

New path (when WorktreeManager is available):
  worktreeManager is updated to use addWorktreeOnBranch() internally
  It checks out feat-{featureSlug} directly (no new branch)
  Sequential execution (REQ-NF-01) ensures only one worktree on this branch at a time

New path (legacy fallback):
  worktreePath = /tmp/ptah-worktrees/{agentId}/{featureSlug}/{phaseId}
  gitClient.addWorktreeOnBranch(worktreePath, featureBranch)
```

### 5.4 Idempotency with Path-Only Matching (REQ-WB-04)

Change in `invokeSkill` activity step 1:

```
Old:
  existingWorktree = worktrees.find(wt => wt.branch === worktreeBranch || wt.path === basePath)

New:
  existingWorktree = worktrees.find(wt => wt.path === worktreeBasePath)

Old hasUnmergedCommits check:
  gitClient.hasUnmergedCommits(existingWorktree.branch)

New phase-specific check:
  Check for the presence of the expected artifact file in the worktree
  OR check if the last commit in the worktree was authored by this agent/phase
  (implementation detail: grep commit message for "[ptah] {agentId}: {phaseId}")
```

### 5.5 Commit and Push (REQ-WB-03)

Change in `invokeSkill` activity step 6 (post-skill commit):

```
Old (single-agent, non-fork-join):
  artifactCommitter.commitAndMerge({
    worktreePath, branch: worktreeBranch, featureBranch, ...
  })
  → commits to worktreeBranch, merges into featureBranch, cleans up

New (single-agent, non-fork-join):
  artifactCommitter.commitAndPush({
    worktreePath, featureBranch, ...
  })
  → commits in worktree (already on feat-{featureSlug}), pushes to origin
  → cleans up worktree after push

Fork-join path: unchanged (fork-join still uses per-agent branches + merge)
```

---

## 6. Algorithm: Domain MR — Ad-Hoc Message Routing

### 6.1 Message Intake Pipeline (FSPEC-MR-01)

```
TemporalOrchestrator.handleMessage(message: ThreadMessage):

1. Ignore bot messages: if message.isBot → return
2. Parse directive: result = parseAdHocDirective(message.content)
3. If result is null → pass to existing message handling (routeUserAnswer, etc.)
4. Resolve agent: agent = agentRegistry.getAgentById(result.agentIdentifier)
   If null → post error: "Agent @{id} is not part of the {slug} workflow. Known agents: ..."
   Return
5. Construct workflow ID: workflowId = "ptah-{featureSlug}"
   (featureSlug extracted from thread name via extractFeatureName + featureNameToSlug)
6. Send signal: temporalClient.signalAdHocRevision(workflowId, {
     targetAgentId: agent.id,
     instruction: result.instruction,
     requestedBy: message.authorName,
     requestedAt: message.timestamp.toISOString(),
   })
   Catch WorkflowNotFoundError → post error: "No active workflow found for {slug}."
   Catch other errors → post error: "Failed to dispatch to @{id}. Please try again."
7. Post ack: "Dispatching @{agent.id}: {first 100 chars of instruction}..."
```

### 6.2 Workflow Queue Management (FSPEC-MR-02)

Inside `featureLifecycleWorkflow`:

```typescript
// Signal definition (module level)
const adHocRevisionSignal = wf.defineSignal<[AdHocRevisionSignal]>("ad-hoc-revision");

// In workflow function body:
const adHocQueue: AdHocRevisionSignal[] = [];
let adHocInProgress = false;

wf.setHandler(adHocRevisionSignal, (signal) => {
  adHocQueue.push(signal);
});

// Queue check inserted at each phase transition point in the main loop:
async function drainAdHocQueue(): Promise<void> {
  while (adHocQueue.length > 0) {
    adHocInProgress = true;
    const signal = adHocQueue.shift()!;
    
    // Find agent's phase to build correct SkillActivityInput
    const agentPhase = findAgentPhase(signal.targetAgentId, workflowConfig);
    if (!agentPhase) {
      // Log warning, skip this signal
      continue;
    }
    
    // Dispatch agent (reuses dispatchSingleAgent)
    // The instruction is threaded through via adHocInstruction on SkillActivityInput.
    // buildInvokeSkillInput() sets input.adHocInstruction = signal.instruction.
    // ContextAssembler prepends the instruction to the user message so the agent
    // sees it as its task directive (e.g., "address feedback from CROSS-REVIEW...").
    const result = await dispatchSingleAgent({
      state, phase: agentPhase, agentId: signal.targetAgentId,
      forkJoin: false, isRevision: true, workflowId,
      adHocInstruction: signal.instruction,
    });
    
    if (result !== "cancelled") {
      // Execute cascade (FSPEC-MR-03)
      await executeCascade(signal.targetAgentId, state, workflowConfig, workflowId);
    }
    
    adHocInProgress = false;
  }
}
```

The `drainAdHocQueue()` call is inserted at each phase transition in the main while loop, after a phase completes and before advancing `state.currentPhaseId`.

### 6.3 Downstream Cascade (FSPEC-MR-03)

```typescript
async function executeCascade(
  revisedAgentId: string,
  state: FeatureWorkflowState,
  config: WorkflowConfig,
  workflowId: string,
): Promise<void> {
  // Step 2: Find revised agent's position
  const agentIndex = config.phases.findIndex(p => p.agent === revisedAgentId);
  if (agentIndex === -1) {
    // Agent not found in phases — skip cascade, log warning
    return;
  }
  
  // Step 3: Collect type:"review" phases after agent's position
  const cascadePhases = config.phases
    .slice(agentIndex + 1)
    .filter(p => p.type === "review");
  
  if (cascadePhases.length === 0) return; // No-op
  
  // Step 5: Execute each cascade phase sequentially
  for (const reviewPhase of cascadePhases) {
    // Check skip_if
    if (reviewPhase.skip_if && evaluateSkipCondition(reviewPhase.skip_if, state.featureConfig)) {
      continue;
    }
    
    // Find creation phase (positional convention: phases[reviewIndex - 1])
    const reviewIndex = config.phases.findIndex(p => p.id === reviewPhase.id);
    const creationPhase = reviewIndex > 0 ? config.phases[reviewIndex - 1] : reviewPhase;
    const authorAgentId = creationPhase.agent ?? creationPhase.agents?.[0] ?? "pm";
    
    // Run review cycle (reuses existing runReviewCycle)
    const outcome = await runReviewCycle({
      state, reviewPhase, creationPhase, authorAgentId, workflowId,
    });
    
    if (outcome === "cancelled") return;
  }
}
```

### 6.4 Helper: Find Agent's Phase

```typescript
function findAgentPhase(
  agentId: string,
  config: WorkflowConfig,
): PhaseDefinition | null {
  return config.phases.find(p => p.agent === agentId) ?? null;
}
```

Returns the first phase where `phase.agent === agentId`. Used to build `SkillActivityInput` for ad-hoc dispatch.

---

## 7. Error Handling

| Scenario | Behavior | Error Type |
|----------|----------|------------|
| First token not @-directive | Not an ad-hoc request. Pass to existing handler. | — |
| Agent ID not in registry | Discord error reply. No signal sent. | User-facing |
| Workflow not found (signal fails) | Discord error reply: "No active workflow found." | WorkflowNotFoundError |
| Temporal signal network error | Discord error reply: "Failed to dispatch." Log error. | Transient |
| Discord ack post fails | Log warning. Signal already sent — agent will execute. | Non-critical |
| Git push fails in commitAndPush | Return `push-error` status. Activity throws retryable error. | Retryable |
| Git worktree add fails (branch already checked out) | Activity throws error. Temporal retries. Sequential exec prevents this normally. | Retryable |
| ensureBranchExists fails | startWorkflowForFeature throws. Workflow not started. | Fatal |
| Cascade review phase fails | Standard failure flow (retry/cancel). Cascade halts on cancel. | Non-retryable |
| Cascade revision_bound exceeded | Phase treated as failed. Standard failure flow. | Non-retryable |
| Ad-hoc agent not found in workflow phases | Log warning. Skip cascade. Process next queued signal. | Warning |

---

## 8. Test Strategy

### 8.1 Approach

All new code follows TDD with protocol-based DI. Pure functions (AdHocParser) are tested directly. Workflow logic is tested via Temporal's workflow testing utilities or by testing the pure helper functions extracted from the workflow. Integration points use existing fakes from `factories.ts`.

### 8.2 Test Doubles

```typescript
// tests/fixtures/factories.ts — additions

// FakeTemporalClient — extend with signalAdHocRevision
class FakeTemporalClient implements TemporalClientWrapper {
  // ... existing fakes ...
  adHocSignals: Array<{ workflowId: string; signal: AdHocRevisionSignal }> = [];
  signalError: Error | null = null;
  
  async signalAdHocRevision(workflowId: string, signal: AdHocRevisionSignal): Promise<void> {
    if (this.signalError) throw this.signalError;
    this.adHocSignals.push({ workflowId, signal });
  }
}

// FakeGitClient — extend with addWorktreeOnBranch, ensureBranchExists
class FakeGitClient implements GitClient {
  // ... existing fakes ...
  worktreesOnBranch: Array<{ path: string; branch: string }> = [];
  ensuredBranches: string[] = [];
  addWorktreeOnBranchError: Error | null = null;
  
  async addWorktreeOnBranch(path: string, branch: string): Promise<void> {
    if (this.addWorktreeOnBranchError) throw this.addWorktreeOnBranchError;
    this.worktreesOnBranch.push({ path, branch });
  }
  
  async ensureBranchExists(branch: string, baseBranch?: string): Promise<void> {
    this.ensuredBranches.push(branch);
  }
}
```

### 8.3 Test Categories

| Category | What is tested | Test file |
|----------|---------------|-----------|
| Ad-hoc parser | parseAdHocDirective: @-token extraction, case insensitivity, mid-sentence rejection, empty instruction, bot messages | `tests/unit/orchestrator/ad-hoc-parser.test.ts` |
| handleMessage flow | End-to-end: parse → resolve agent → signal → ack. Unknown agent, no workflow, signal error. | `tests/unit/orchestrator/temporal-orchestrator.test.ts` |
| Deterministic workflow ID | startFeatureWorkflow uses `ptah-{slug}` without sequence query | `tests/unit/temporal/client.test.ts` |
| commitAndPush | Filters docs/, stages, commits, pushes. No merge. Error cases. | `tests/unit/orchestrator/artifact-committer.test.ts` |
| Shared branch worktree | addWorktreeOnBranch called instead of createWorktreeFromBranch. Path-only idempotency. | `tests/unit/temporal/skill-activity.test.ts` |
| ensureBranchExists | Branch created if missing, no-op if exists | `tests/unit/orchestrator/temporal-orchestrator.test.ts` |
| Ad-hoc queue (pure helpers) | FIFO ordering, drainAdHocQueue logic, findAgentPhase | `tests/unit/temporal/workflows/ad-hoc-queue.test.ts` |
| Cascade (pure helpers) | collectCascadePhases, skip_if filtering, positional creation-phase lookup | `tests/unit/temporal/workflows/cascade.test.ts` |

---

## 9. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-WB-01 | `invokeSkill` activity, `WorktreeManager` | Change from per-agent branch to shared `feat-{featureSlug}` checkout |
| REQ-WB-02 | `GitClient.addWorktreeOnBranch()`, `invokeSkill` | Worktree checks out existing branch directly, no new branch created |
| REQ-WB-03 | `ArtifactCommitter.commitAndPush()`, `invokeSkill` | Commit in worktree → push to origin. No merge step. |
| REQ-WB-04 | `invokeSkill` idempotency check | Path-only matching (`wt.path === basePath`), no branch matching |
| REQ-WB-05 | `TemporalOrchestrator.startWorkflowForFeature()`, `GitClient.ensureBranchExists()` | Create shared branch before workflow submission |
| REQ-MR-01 | `parseAdHocDirective()` | First-token @-directive extraction, case-insensitive |
| REQ-MR-02 | `TemporalOrchestrator.handleMessage()`, `TemporalClientWrapper.signalAdHocRevision()`, workflow `drainAdHocQueue()`, `SkillActivityInput.adHocInstruction` | Orchestrator sends signal; workflow dequeues, passes instruction via `adHocInstruction` field, and dispatches agent |
| REQ-MR-03 | `TemporalOrchestrator.handleMessage()` | Error reply when agent not found in registry |
| REQ-MR-04 | `TemporalOrchestrator.handleMessage()` | Discord ack after successful signal dispatch |
| REQ-MR-05 | `TemporalOrchestrator.handleMessage()` | WorkflowNotFoundError caught → error reply |
| REQ-MR-06 | Workflow `adHocQueue[]`, `drainAdHocQueue()` | FIFO signal queue with cascade-blocking dequeue condition |
| REQ-MR-07 | Workflow `executeCascade()` | Collect downstream `type:"review"` phases, execute sequentially with revision loops |
| REQ-MR-08 | `TemporalClientWrapperImpl.startFeatureWorkflow()` | Workflow ID = `ptah-{featureSlug}` (deterministic, no sequence) |
| REQ-NF-01 | `drainAdHocQueue()` + cascade-blocking rule | `adHocInProgress` flag prevents concurrent dispatch |
| REQ-NF-02 | TSPEC documentation (this section) | Shared branch + sequential push is compatible with future parallel; only push step needs serialization |

---

## 10. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | `temporal-orchestrator.ts` | Add `handleMessage()` method + `ensureFeatureBranch()` call in `startWorkflowForFeature()` | New method on existing class. Existing methods unchanged. |
| 2 | `start.ts` | `handleMessage` is already wired in StartCommand (line 88-92). TemporalOrchestrator just needs to implement it. | No change to start.ts needed. |
| 3 | `temporal/client.ts` | Change workflow ID format from `ptah-feature-{slug}-{seq}` to `ptah-{slug}`. Add `signalAdHocRevision()`. Remove `resolveNextSequence()`. | Breaking change to workflow ID format. Existing workflows unaffected (out of scope per REQ). |
| 4 | `skill-activity.ts` | Replace `createWorktreeFromBranch` with `addWorktreeOnBranch`. Replace `commitAndMerge` with `commitAndPush` for non-fork-join. Update idempotency check. | Core activity changes. Existing fork-join path unchanged. |
| 5 | `artifact-committer.ts` | Add `commitAndPush()` method. Existing `commitAndMerge()` and `mergeBranchIntoFeature()` remain for fork-join. | Additive change. No existing method signatures change. |
| 6 | `services/git.ts` | Add `addWorktreeOnBranch()` and `ensureBranchExists()` to interface and implementation. | Additive change. |
| 7 | `feature-lifecycle.ts` | Add `adHocRevisionSignal` definition, queue state, `drainAdHocQueue()` at phase transitions, `executeCascade()`. Update `buildInitialWorkflowState()` and `buildContinueAsNewPayload()` with queue fields. | Significant workflow changes. Main loop structure preserved; queue drain inserted at transition points. |
| 8 | `temporal/types.ts` | Add `AdHocRevisionSignal`, extend `FeatureWorkflowState` and `ContinueAsNewPayload`. | Additive type changes. |
| 9 | `factories.ts` | Extend `FakeTemporalClient`, `FakeGitClient` with new methods. Add `FakeResponsePoster` if not present. | Test infrastructure. |

---

## 11. Open Questions

| # | Item | Type | Resolution |
|---|------|------|------------|
| 1 | Thread-to-feature-slug resolution | Design | `handleMessage` extracts feature slug from `message.threadName` using existing `extractFeatureName()` + `featureNameToSlug()` from `feature-branch.ts`. Thread name convention `[feature-name] description` is already established. |
| 2 | WorktreeManager vs legacy path | Design | Both paths updated. WorktreeManager's `create()` is changed to use `addWorktreeOnBranch()` internally. Legacy fallback in `invokeSkill` also uses `addWorktreeOnBranch()`. |
| 3 | Fork-join path | Scope | Fork-join phases continue using per-agent branches + merge. Only single-agent (non-fork-join) phases use the shared-branch direct-push model. This minimizes blast radius. |

---

*Gate: User reviews and approves this technical specification before proceeding to Planning.*
