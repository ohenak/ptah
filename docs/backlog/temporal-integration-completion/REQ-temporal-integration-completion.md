# Requirements: Temporal Integration Completion

**Status:** Draft (Rev 2 — addressing eng + qa cross-review feedback)
**Feature:** temporal-integration-completion
**Created:** 2026-04-07
**Author:** PM

---

## 1. Problem Statement

The migration from the legacy in-process PDLC state machine to Temporal durable workflows was designed in phases. The core Temporal infrastructure — workflow definition, activity separation, signal/query contracts, worker setup — was completed successfully. However, the critical "Phase G" integration layer was never implemented, leaving 5 integration gaps that prevent the workflow from executing end-to-end.

The system appears to revert to older incomplete behavior because:

1. Reviews always fail with `RecommendationParseError` (cross-review parser never wired in)
2. Agents receive the entire feature folder instead of curated per-phase documents (context document refs dropped)
3. Context document template strings are never resolved to actual file paths
4. Discord cannot start workflows, answer questions, or retry failures (only ad-hoc @-directives work)
5. FSPEC phases can never be skipped even when `skipFspec: true` (field path mismatch)
6. Fork/join ROUTE_TO_USER flow double-invokes agents (question flow already re-invokes, then explicit re-invoke runs again)

These are not scalability issues — the architecture is sound. The gaps are missing integration glue between well-designed components.

---

## 2. User Stories

### US-01: Workflow Operator

As a **workflow operator**, I want to start a PDLC workflow from Discord by mentioning an agent in a thread, so that features progress through the lifecycle automatically without manual intervention.

### US-02: Reviewing Agent

As a **reviewing agent** (eng, qa, pm), I want my cross-review recommendation to be parsed from the CROSS-REVIEW markdown file I write, so that the workflow correctly determines whether the document is approved or needs revision.

### US-03: Authoring Agent

As an **authoring agent**, I want to receive only the context documents relevant to my current phase (e.g., REQ when creating FSPEC), so that I stay focused and don't waste token budget on irrelevant files.

### US-04: Workflow Operator (Questions)

As a **workflow operator**, I want to answer agent questions posted in Discord and have my answer routed back to the waiting workflow, so that the workflow can resume without manual Temporal API interaction.

### US-05: Workflow Operator (Failures)

As a **workflow operator**, I want to retry or cancel a failed phase from Discord, so that I can recover from transient errors without restarting the entire workflow.

### US-06: Feature Creator

As a **feature creator**, I want to skip FSPEC phases when `skipFspec: true` is set in the feature config, so that simple features can bypass unnecessary specification overhead.

### US-07: Fork/Join Agent

As an **agent in a fork/join phase** that asks a user question, I want to be invoked exactly once after receiving the answer — not twice — so that my work is not duplicated and token budget is not wasted.

---

## 3. Requirements

### Domain: RC — Review Cycle Integration

#### REQ-RC-01: Wire Cross-Review Parser into Review Cycle

**Description:** The review cycle in the workflow (`runReviewCycle`) must read the cross-review file written by each reviewer agent and parse its recommendation using the existing `parseRecommendation()` function from `cross-review-parser.ts`, rather than using `result.routingSignalType` as a recommendation proxy.

**Current behavior:** `feature-lifecycle.ts:1206` passes `result.routingSignalType` (which is `"LGTM"`, `"TASK_COMPLETE"`, or `"ROUTE_TO_USER"`) to `mapRecommendationToStatus()`. Most routing signals return `null`, triggering `RecommendationParseError`.

**Required behavior:** After each reviewer activity completes, a new activity must read the cross-review file from the **merged feature branch** (using the path convention `{featurePath}CROSS-REVIEW-{skillName}-{docType}.md`) and call `parseRecommendation()` on its content. The parsed `status` (`"approved"` or `"revision_requested"`) feeds into `reviewState.reviewerStatuses`.

**File read source:** The `readCrossReviewRecommendation` activity reads from the main repository working directory after the reviewer's worktree has been merged. The `invokeSkill` activity always merges the worktree back to the feature branch before returning (for both single-agent and fork/join dispatches). Therefore, the cross-review file is guaranteed to exist on the feature branch by the time the read activity runs.

**Constraints:**
- File I/O is not allowed in Temporal workflows. The cross-review file read MUST be implemented as a new Temporal Activity.
- The existing `parseRecommendation()`, `crossReviewPath()`, and `agentIdToSkillName()` functions in `cross-review-parser.ts` should be reused — not reimplemented.
- Parse errors must still trigger the failure flow (retry/cancel) as they do today.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | A reviewer agent has completed its skill activity and written a CROSS-REVIEW file |
| WHEN | The review cycle processes the reviewer's result |
| THEN | It reads the CROSS-REVIEW file via an Activity, parses the recommendation, and correctly sets the reviewer's status to `"approved"` or `"revision_requested"` |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | A reviewer agent has completed but the CROSS-REVIEW file contains malformed content (no valid recommendation heading) |
| WHEN | The review cycle processes the reviewer's result |
| THEN | The activity returns `parse_error`, and the review cycle enters the failure flow (retry/cancel prompt posted to Discord) |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | A reviewer agent has completed but the CROSS-REVIEW file contains an unrecognized recommendation value (neither "Approved" nor "Needs revision") |
| WHEN | The review cycle processes the reviewer's result |
| THEN | The activity returns `parse_error` with the raw unrecognized value, and the review cycle enters the failure flow |

**Priority:** P0
**Phase:** 1
**Source:** [US-02]
**Dependencies:** None

---

#### REQ-RC-02: New Activity — readCrossReviewRecommendation

**Description:** Create a new Temporal Activity that reads a cross-review file from the feature folder and returns the parsed recommendation.

**Input:** `{ featurePath: string, agentId: string, documentType: string }`

**Output:** `{ status: "approved" | "revision_requested" } | { status: "parse_error", reason: string, rawValue?: string }`

**Implementation notes:**
- The activity must derive the skill name from agentId using `agentIdToSkillName()`.
- The activity must derive the file path using `crossReviewPath()`.
- The activity must read the file via `FileSystem.readFile()`.
- The activity must call `parseRecommendation()` on the content.
- If the file does not exist, return `{ status: "parse_error", reason: "Cross-review file not found" }`.
- If `agentIdToSkillName()` returns `null` (unknown agent ID), return `{ status: "parse_error", reason: "Unknown agent ID: {agentId}" }`.
- This activity should be registered alongside existing activities in `worker.ts`.

**Retry policy:** The activity should fail-fast — return `parse_error` immediately on file-not-found or parse failure. Retry logic is handled at the workflow level via Temporal's built-in activity retry policy (configured in the workflow). The activity itself does not retry internally.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | A cross-review file exists at the expected path with a valid recommendation heading |
| WHEN | The `readCrossReviewRecommendation` activity is invoked |
| THEN | It returns `{ status: "approved" }` or `{ status: "revision_requested" }` matching the file content |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | The cross-review file does not exist |
| WHEN | The `readCrossReviewRecommendation` activity is invoked |
| THEN | It returns `{ status: "parse_error", reason: "Cross-review file not found" }` |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | The agentId does not map to a known skill name |
| WHEN | The `readCrossReviewRecommendation` activity is invoked |
| THEN | It returns `{ status: "parse_error", reason: "Unknown agent ID: {agentId}" }` without attempting to read a file |

**Priority:** P0
**Phase:** 1
**Source:** [US-02]
**Dependencies:** [REQ-RC-01]

---

### Domain: CD — Context Document Resolution

#### REQ-CD-01: Resolve Context Document Template References

**Description:** The workflow must resolve `{feature}/DOC_TYPE` template strings from `ptah.workflow.yaml` into actual file paths before passing them to the skill activity. The existing pure function `resolveContextDocuments()` at `feature-lifecycle.ts:94` must be called in the dispatch path (`buildInvokeSkillInput` or the dispatch functions that call it).

**Current behavior:** `buildInvokeSkillInput()` at `feature-lifecycle.ts:415` passes raw `phase.context_documents` (e.g., `["{feature}/REQ", "{feature}/FSPEC"]`) directly into `contextDocumentRefs`. These unresolved template strings match nothing on disk.

**Required behavior:** Before populating `contextDocumentRefs`, the workflow must call `resolveContextDocuments(phase.context_documents, { featureSlug, featurePath })` to convert templates to actual paths (e.g., `"docs/in-progress/my-feature/REQ-my-feature.md"`).

**Call site:** Resolution must happen at the dispatch call sites — `dispatchSingleAgent()`, `dispatchForkJoin()`, and `runReviewCycle()` — which all have access to `state.featurePath`. It should NOT be added to `buildInvokeSkillInput()` because that function's interface (`BuildInvokeSkillInputParams`) does not include `featurePath`, and changing a pure function's contract for a workflow concern is undesirable. The resolved refs should be passed into `buildInvokeSkillInput()` as the already-resolved `contextDocumentRefs` value.

**Path format:** Resolved paths are repo-root-relative (e.g., `docs/in-progress/auth/REQ-auth.md`). The context assembler's `readContextDocumentRefs()` reads them directly via `this.fs.readFile(ref)`. When running in a worktree, CWD is the worktree root, so repo-relative paths resolve correctly. No worktree-path rebasing is needed.

**Constraints:**
- `resolveContextDocuments()` is a pure function — safe to call in the workflow (no I/O).
- The `featurePath` must be resolved (via `resolveFeaturePath` activity) before context documents can be resolved. This dependency already exists in the workflow.
- Completed features with NNN prefixes must resolve correctly (e.g., `{feature}/REQ` → `docs/completed/015-my-feature/015-REQ-my-feature.md`).

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As an authoring or reviewing agent |
| GIVEN | The workflow phase has `context_documents: ["{feature}/REQ", "{feature}/FSPEC"]` and the feature is at `docs/in-progress/auth/` |
| WHEN | The skill activity is invoked |
| THEN | `contextDocumentRefs` contains `["docs/in-progress/auth/REQ-auth.md", "docs/in-progress/auth/FSPEC-auth.md"]` |

**Priority:** P0
**Phase:** 1
**Source:** [US-03]
**Dependencies:** None

---

#### REQ-CD-02: Pass contextDocumentRefs, taskType, and documentType to Context Assembler

**Description:** The `invokeSkill` activity must pass `contextDocumentRefs`, `taskType`, and `documentType` fields to `contextAssembler.assemble()` so that agents receive the curated document set for their phase AND the correct PDLC task directive (ACTION: instruction).

**Current behavior:** `skill-activity.ts:103` destructures `contextDocumentRefs`, `taskType`, and `documentType` from the input but never passes any of them to `contextAssembler.assemble()` at `skill-activity.ts:195-213`. The assembler falls back to reading all files in the feature folder, and agents receive no `ACTION:` directive when invoked from Temporal.

**Required behavior:**
- Add `contextDocumentRefs` to the `assemble()` call. The assembler already supports this parameter (see `context-assembler.ts:168-169`): when `contextDocumentRefs` is provided, it calls `readContextDocumentRefs()` instead of scanning the full folder.
- Add `taskType` and `documentType` to the `assemble()` call. The assembler uses these to inject PDLC task directives into Layer 1 (see `context-assembler.ts:118-141`) and to select the correct document set (line 170-171). Without them, agents receive no `ACTION:` directive, which degrades task-specific behavior (e.g., review agents won't know to write a CROSS-REVIEW file).

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As an authoring agent in the FSPEC creation phase |
| GIVEN | The phase config specifies `context_documents: ["{feature}/REQ"]` |
| WHEN | The skill activity invokes context assembly |
| THEN | The agent receives only the REQ document in its Layer 2 context, not all feature files |

| | |
|---|---|
| WHO | As a reviewing agent in a cross-review phase |
| GIVEN | The phase config specifies `taskType: "review"` and `documentType: "TSPEC"` |
| WHEN | The skill activity invokes context assembly |
| THEN | The agent receives an `ACTION:` directive in its Layer 1 context instructing it to write a CROSS-REVIEW file |

**Priority:** P0
**Phase:** 1
**Source:** [US-03]
**Dependencies:** [REQ-CD-01]

---

### Domain: DR — Discord Routing

#### REQ-DR-01: Start Workflow from Discord Thread

**Description:** When a user creates a thread in the updates channel and mentions an agent role, the orchestrator must parse the thread name to extract the feature slug, determine the feature config, and call `startWorkflowForFeature()` to begin the PDLC workflow.

**Current behavior:** `temporal-orchestrator.ts:handleMessage()` only handles ad-hoc `@agent` directives via `parseAdHocDirective()`. If the message is not an ad-hoc directive, it returns immediately (line 240-242). There is no code path to start a new workflow.

**Required behavior:** `handleMessage()` must detect when a message is a workflow trigger (first message in thread, mentions an agent role, no active workflow for this feature) and call `startWorkflowForFeature()`.

**Design considerations:**
- Must not conflict with ad-hoc directive parsing (ad-hoc is for *running* workflows).
- Must be idempotent: if a workflow is already running for the feature (`ptah-{slug}`), do not start a duplicate.
- Should post a confirmation message to the thread after starting the workflow.

**Feature slug extraction:** The feature slug is extracted from the Discord thread name using the existing `extractFeatureName()` function from `context-assembler.ts`. This function strips the ` — ` (em dash) suffix used for task descriptions (e.g., thread name `"auth — define requirements"` → slug `"auth"`). If no ` — ` separator is found, the full thread name is slugified.

**FeatureConfig sourcing:** FeatureConfig defaults to `{ discipline: "fullstack", skipFspec: false, useTechLead: false }`. In this phase, config is not parsed from the message content or a config file — the default is always used. Config override via thread message or feature-folder config file is out of scope for this feature and can be added in a future iteration.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | No active workflow exists for the feature |
| WHEN | I create a thread in the updates channel and mention @PM with "define requirements for auth" |
| THEN | A Temporal workflow starts for the feature with ID `ptah-auth`, and a confirmation is posted to the thread |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A workflow is already running for the feature |
| WHEN | I mention an agent in the thread |
| THEN | The message is treated as an ad-hoc directive (existing behavior), not a new workflow start |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A workflow is already running for the feature with ID `ptah-auth` |
| WHEN | A second workflow start is attempted for the same feature (e.g., concurrent messages or duplicate trigger) |
| THEN | The duplicate is prevented (Temporal's workflow-ID-based deduplication rejects it), and a "workflow already running" notice is posted to the thread |

**Priority:** P0
**Phase:** 2
**Source:** [US-01]
**Dependencies:** [REQ-RC-01], [REQ-CD-01], [REQ-CD-02] (workflow must function once started)

---

#### REQ-DR-02: Route User Answers from Discord

**Description:** When a workflow is waiting for a user answer (phase status `"waiting-for-user"`), user messages in the thread must be routed as `user-answer` signals to the running workflow.

**Current behavior:** `routeUserAnswer()` exists at `temporal-orchestrator.ts:195` but has zero call sites from Discord message handling.

**Required behavior:** `handleMessage()` must detect when a user (non-bot) posts in a thread associated with a running workflow that has a pending question, and call `routeUserAnswer()` with the message content.

**Design considerations:**
- Only route when the workflow is in `"waiting-for-user"` state (query workflow state first).
- Do not route bot messages as answers.
- The answer text is the full message content.
- **Performance note:** Querying workflow state on every user message adds Temporal server load. The TSPEC may choose to optimize this via local state caching (e.g., tracking `waiting-for-user` state via signal callbacks). This is a technical implementation choice — the correctness requirement is that only waiting-state messages are routed.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A workflow is waiting for a user answer (pending question displayed in the thread) |
| WHEN | I reply in the thread with my answer |
| THEN | The answer is delivered to the workflow, the agent is re-invoked with my answer, and execution resumes |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A workflow is running but NOT in `waiting-for-user` state (e.g., an agent is actively executing) |
| WHEN | I post a message in the thread |
| THEN | The message is silently ignored (not routed as an answer), and no error is posted. The message remains visible in the thread for reference. |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | A bot (including Ptah itself) posts a message in the thread |
| WHEN | The message handler processes the message |
| THEN | The message is ignored — bot messages are never routed as user answers |

**Priority:** P0
**Phase:** 2
**Source:** [US-04]
**Dependencies:** [REQ-DR-01]

---

#### REQ-DR-03: Route Retry/Cancel from Discord

**Description:** When a workflow is in a failed state (phase status `"failed"`), user messages containing retry or cancel intent must be routed as `retry-or-cancel` or `resume-or-cancel` signals.

**Current behavior:** `routeRetryOrCancel()` and `routeResumeOrCancel()` exist at `temporal-orchestrator.ts:209-224` but have zero call sites from Discord message handling.

**Required behavior:** `handleMessage()` must detect failure/revision-bound states and parse user intent (e.g., "retry", "cancel", "resume") from message content or reactions.

**Intent matching:** Intent keywords are matched case-insensitively against the full message content. The message must contain the keyword as a standalone word (e.g., "retry" matches in "please retry" and "Retry" but not "retrying"). Recognized keywords: `retry`, `cancel`, `resume`.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A workflow phase has failed and posted a failure notification |
| WHEN | I reply with "retry" in the thread |
| THEN | The `retry-or-cancel` signal is sent with action `"retry"`, and the phase re-executes |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A review cycle has exceeded its revision bound |
| WHEN | I reply with "resume" or "cancel" in the thread |
| THEN | The appropriate `resume-or-cancel` signal is sent to the workflow |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A workflow phase has failed |
| WHEN | I reply with a message that does not contain a recognized intent keyword (e.g., "what happened?" or "show me the error") |
| THEN | The message is silently ignored — no signal is sent, and the workflow remains in its current state. The failure notification remains visible with instructions on recognized commands. |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A workflow phase has failed |
| WHEN | I reply with "Retry" or "CANCEL" (any case) |
| THEN | The intent is recognized (case-insensitive match) and the appropriate signal is sent |

**Priority:** P0
**Phase:** 2
**Source:** [US-05]
**Dependencies:** [REQ-DR-01]

---

### Domain: SC — Skip Condition Fix

#### REQ-SC-01: Fix skip_if Field Path Resolution

**Description:** The `evaluateSkipCondition()` function must strip the `config.` prefix from the `field` value before looking up the property on `FeatureConfig`.

**Current behavior:** `feature-lifecycle.ts:141` does `config[condition.field]` where `condition.field` is `"config.skipFspec"` (from YAML). This looks up `config["config.skipFspec"]` which is always `undefined`, so the function returns `false` (do not skip). FSPEC phases can never be skipped.

**Required behavior:** Strip the `config.` prefix: if `condition.field` starts with `"config."`, use `condition.field.slice(7)` as the lookup key. This makes `config["skipFspec"]` resolve to `true` when set. Fields without the `config.` prefix must continue to work as-is (backward compatible — look up directly on config).

**Scope of prefix stripping:** Only the single `config.` prefix is stripped. The YAML schema does not support nested paths (e.g., `config.nested.field` is not a valid pattern). The only `skip_if` fields currently defined in the YAML are `config.skipFspec` and potentially `config.useTechLead`. No generic nested property access is needed.

**Alternative approach:** Change the YAML to use `field: skipFspec` (without prefix). However, this changes the configuration contract. The code fix is preferred because it preserves the YAML convention and is a one-line change.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As a feature creator |
| GIVEN | Feature config has `skipFspec: true` and the YAML uses `field: config.skipFspec` |
| WHEN | The workflow evaluates the `skip_if` condition for FSPEC phases |
| THEN | The condition evaluates to `true` and all three FSPEC phases (creation, review, approved) are skipped |

| | |
|---|---|
| WHO | As a feature creator |
| GIVEN | Feature config has `skipFspec: false` or the field is absent |
| WHEN | The workflow evaluates the `skip_if` condition |
| THEN | The condition evaluates to `false` and FSPEC phases execute normally |

**Priority:** P0
**Phase:** 1
**Source:** [US-06]
**Dependencies:** None

---

### Domain: FJ — Fork/Join Fix

#### REQ-FJ-01: Eliminate Double-Invocation in Fork/Join ROUTE_TO_USER

**Description:** When a fork/join agent returns `ROUTE_TO_USER`, the `handleQuestionFlow()` function already re-invokes the agent with the user's answer. The explicit re-invoke at `feature-lifecycle.ts:976-984` must be removed to prevent double-invocation.

**Current behavior:** Lines 964-974 call `handleQuestionFlow()` which internally re-invokes the agent with question+answer context. Lines 976-984 then invoke the agent *again* from scratch without the answer context, wasting tokens and producing duplicate work.

**Required behavior:** After `handleQuestionFlow()` returns, use its result directly. Remove the explicit `invokeSkill()` call at lines 976-984. The `questionResult` from `handleQuestionFlow()` should be used to update `agentResults`.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As a fork/join agent that asked a user question |
| GIVEN | I returned ROUTE_TO_USER during a fork/join phase and the user answered |
| WHEN | The question flow completes |
| THEN | The `invokeSkill` activity is called exactly once for the re-invocation (via `handleQuestionFlow`), the result from `handleQuestionFlow()` is used to update `agentResults`, and no second `invokeSkill` call occurs |

**Priority:** P1
**Phase:** 1
**Source:** [US-07]
**Dependencies:** None

---

### Domain: NF — Non-Functional

#### REQ-NF-01: Test Coverage for Integration Paths

**Description:** Integration tests must cover the newly wired paths: cross-review parsing in review cycles, context document resolution, and Discord → Temporal routing. The existing skeleton integration tests in `workflow-integration.test.ts` must be expanded to exercise real (or properly mocked) activity logic rather than returning canned responses.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As a developer |
| GIVEN | The integration test suite |
| WHEN | I run `npm test` |
| THEN | At least one integration test exercises the review cycle calling `readCrossReviewRecommendation` and verifying the recommendation flows into `reviewerStatuses` |

| | |
|---|---|
| WHO | As a developer |
| GIVEN | The integration test suite |
| WHEN | I run `npm test` |
| THEN | At least one integration test exercises context document resolution from template strings through to the assembler receiving resolved paths |

| | |
|---|---|
| WHO | As a developer |
| GIVEN | The integration test suite |
| WHEN | I run `npm test` |
| THEN | At least one integration test exercises Discord message handling triggering the correct Temporal signals (workflow start, user-answer, retry-or-cancel) |

**Priority:** P1
**Phase:** 2
**Source:** [US-01], [US-02], [US-03]
**Dependencies:** [REQ-RC-01], [REQ-CD-01], [REQ-CD-02], [REQ-DR-01], [REQ-DR-02], [REQ-DR-03]

#### REQ-NF-02: Unit Test for skip_if Field Path

**Description:** Add unit tests to `feature-lifecycle.test.ts` that use the actual YAML convention `"config.skipFspec"` (with prefix) in the `field` property, not the simplified `"skipFspec"` form. This ensures the test catches the real-world mismatch.

**Acceptance Criteria:**

| | |
|---|---|
| WHO | As a developer |
| GIVEN | A unit test for `evaluateSkipCondition()` |
| WHEN | The test uses `field: "config.skipFspec"` (matching the YAML) |
| THEN | The test passes and the skip condition evaluates correctly |

**Priority:** P0
**Phase:** 1
**Source:** [US-06]
**Dependencies:** [REQ-SC-01]

---

## 4. Scope

### In Scope

- Wiring the existing cross-review parser into the review cycle via a new Activity
- Resolving context document template references using the existing `resolveContextDocuments()` function
- Passing resolved `contextDocumentRefs` to the context assembler
- Implementing Discord → Temporal routing for workflow start, user answers, and retry/cancel
- Fixing the `skip_if` field path resolution to strip the `config.` prefix
- Removing the double-invocation in fork/join ROUTE_TO_USER handling
- Integration and unit tests for all new paths

### Out of Scope

- Changes to the Temporal workflow architecture (no new signals, queries, or structural changes)
- Changes to the cross-review parser logic itself (already working correctly)
- Changes to the context assembler logic (already supports `contextDocumentRefs`)
- New Discord bot features (reactions, slash commands, etc.)
- Performance optimization or scalability improvements
- Migration tooling updates

### Assumptions

- The Temporal server is running and accessible at the configured address
- The existing Activity infrastructure (worker, heartbeat, retry) is functioning correctly
- The cross-review file naming convention (`CROSS-REVIEW-{skillName}-{docType}.md`) is stable
- The `ptah.workflow.yaml` schema is stable and will not change during implementation
- The `FeatureConfig` type will not change (only `skipFspec`, `discipline`, `useTechLead` fields)

---

## 5. Phasing

### Phase 1: Core Workflow Fixes (No Discord Changes)

**Goal:** Make the Temporal workflow execute correctly end-to-end when triggered programmatically.

| Requirement | Description | Priority |
|---|---|---|
| [REQ-SC-01] | Fix skip_if field path resolution | P0 |
| [REQ-NF-02] | Unit test for skip_if with real YAML convention | P0 |
| [REQ-CD-01] | Resolve context document template references | P0 |
| [REQ-CD-02] | Pass contextDocumentRefs to context assembler | P0 |
| [REQ-RC-01] | Wire cross-review parser into review cycle | P0 |
| [REQ-RC-02] | New Activity — readCrossReviewRecommendation | P0 |
| [REQ-FJ-01] | Eliminate fork/join ROUTE_TO_USER double-invocation | P1 |

### Phase 2: Discord Integration

**Goal:** Enable Discord as the control plane for starting and interacting with workflows.

| Requirement | Description | Priority |
|---|---|---|
| [REQ-DR-01] | Start workflow from Discord thread | P0 |
| [REQ-DR-02] | Route user answers from Discord | P0 |
| [REQ-DR-03] | Route retry/cancel from Discord | P0 |
| [REQ-NF-01] | Integration test coverage | P1 |

---

## 6. Dependency Graph

```
REQ-SC-01 ──────────────────────────────────────────────┐
REQ-NF-02 ← REQ-SC-01                                  │
                                                        │
REQ-CD-01 ──────────────┐                               │
REQ-CD-02 ← REQ-CD-01   ├── Phase 1 (parallel batch) ──┤
                         │                               │
REQ-RC-02 ──────────────┤                               │
REQ-RC-01 ← REQ-RC-02   │                               │
                         │                               │
REQ-FJ-01 ──────────────┘                               │
                                                        │
REQ-DR-01 ← Phase 1 complete ──┐                        │
REQ-DR-02 ← REQ-DR-01          ├── Phase 2 ────────────┘
REQ-DR-03 ← REQ-DR-01          │
REQ-NF-01 ← Phase 2 complete ──┘
```

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-review file may not exist when Activity reads it (race condition with git push) | Review cycle fails with parse error → user must retry | Activity should retry once after a short delay; or the review dispatch should ensure worktree merge completes before parsing |
| Discord routing may conflict with ad-hoc directives (both handle messages in threads) | Wrong handler fires | Clear precedence: check for running workflow state first, fall back to new-workflow detection |
| `resolveContextDocuments()` depends on `featurePath` being non-null | Context resolution fails silently | Guard: if `featurePath` is null, skip resolution and log a warning |
