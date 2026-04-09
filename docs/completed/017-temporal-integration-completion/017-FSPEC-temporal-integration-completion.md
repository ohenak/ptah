# Functional Specification: Temporal Integration Completion

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-temporal-integration-completion](REQ-temporal-integration-completion.md) |
| **Date** | 2026-04-07 |
| **Status** | Draft (Rev 2 — addressing eng cross-review feedback) |
| **Author** | PM |

---

## FSPEC Coverage

Not every requirement needs a functional specification. FSPECs are written only for requirements with multi-step behavioral flows, branching logic, or business rules that the engineer should not decide alone.

| Requirement | FSPEC | Rationale |
|-------------|-------|-----------|
| REQ-RC-01, REQ-RC-02 | FSPEC-RC-01 | Multi-step review cycle with parse/error branching, file I/O timing |
| REQ-DR-01 | FSPEC-DR-01 | Complex trigger detection with precedence rules |
| REQ-DR-02 | FSPEC-DR-02 | State-dependent routing with guard conditions |
| REQ-DR-03 | FSPEC-DR-03 | Intent parsing with state-dependent signal routing |
| REQ-CD-01 | — | Pure function call at specified call sites; no branching |
| REQ-CD-02 | — | Wiring change; pass three fields to existing API |
| REQ-SC-01 | — | One-line prefix strip; no behavioral complexity |
| REQ-FJ-01 | — | Bug fix; remove redundant code block |
| REQ-NF-01, REQ-NF-02 | — | Test requirements; no behavioral specification needed |

---

## FSPEC-RC-01: Review Cycle Recommendation Parsing Flow

**Linked requirements:** [REQ-RC-01], [REQ-RC-02]

**Description:** After each reviewer agent completes its skill activity during a review cycle, the workflow must read the reviewer's cross-review file, parse the recommendation, and route the result into the review state. This replaces the current `routingSignalType`-based proxy with file-based parsing.

### Cross-Review File Path Convention

The cross-review file naming convention is:

```
{featurePath}CROSS-REVIEW-{reviewerToken}-{DOC_TYPE}.md
```

Where:
- **`reviewerToken`** is the skill's self-identified reviewer name, mapped from the agent ID
- **`DOC_TYPE`** is the uppercase document abbreviation derived from the phase ID

**Reviewer token mapping (agentId → reviewerToken):**

| Agent ID | Reviewer Token | Example File |
|----------|---------------|--------------|
| `eng` | `engineer` | `CROSS-REVIEW-engineer-REQ.md` |
| `fe` | `frontend-engineer` | `CROSS-REVIEW-frontend-engineer-REQ.md` |
| `pm` | `product-manager` | `CROSS-REVIEW-product-manager-TSPEC.md` |
| `qa` | `test-engineer` | `CROSS-REVIEW-test-engineer-REQ.md` |

> **Note:** The existing `SKILL_TO_AGENT` mapping in `cross-review-parser.ts` has `"backend-engineer": "eng"`, but the engineer skill actually writes files as `"engineer"` (not `"backend-engineer"`). The `SKILL_TO_AGENT` mapping must be corrected to `"engineer": "eng"` so that `agentIdToSkillName("eng")` returns `"engineer"`. This is a data fix — the function logic is correct, only the mapping table is wrong.

**Document type derivation (phase.id → DOC_TYPE):**

Strip the phase type suffix (`-creation`, `-review`, or `-approved`) from the phase ID, then uppercase the remainder.

| Phase ID | Suffix Stripped | DOC_TYPE |
|----------|----------------|----------|
| `req-creation` | `req` | `REQ` |
| `req-review` | `req` | `REQ` |
| `req-approved` | `req` | `REQ` |
| `fspec-review` | `fspec` | `FSPEC` |
| `tspec-review` | `tspec` | `TSPEC` |
| `plan-review` | `plan` | `PLAN` |
| `properties-review` | `properties` | `PROPERTIES` |
| `implementation-review` | `implementation` | `IMPLEMENTATION` |

The derivation rule: `phase.id.replace(/-(?:creation|review|approved)$/, "").toUpperCase()`. This is a deterministic string transformation — no lookup table needed.

### Behavioral Flow

```
1. Reviewer's invokeSkill activity completes
   ├── Activity threw an error (non-zero exit, timeout, etc.)
   │   └── → Enter failure flow (retry/cancel) — EXISTING BEHAVIOR, unchanged
   │
   └── Activity returned successfully (SkillActivityResult)
       │
       2. Derive cross-review file path
       │   a. Map reviewer's agentId → reviewerToken via agentIdToSkillName()
       │   │   ├── Returns null (unknown agent ID)
       │   │   │   └── → Treat as parse_error: "Unknown agent ID: {agentId}"
       │   │   │       └── → Enter failure flow (retry/cancel)
       │   │   │
       │   │   └── Returns reviewerToken (e.g., "engineer")
       │   │
       │   b. Derive DOC_TYPE from phase.id (strip suffix, uppercase)
       │      e.g., "req-review" → "REQ"
       │   │
       │   c. Derive file path via crossReviewPath(featurePath, reviewerToken, DOC_TYPE)
       │      e.g., "docs/in-progress/auth/CROSS-REVIEW-engineer-REQ.md"
       │
       3. Call readCrossReviewRecommendation activity
       │   Input: { featurePath, agentId, documentType }
       │   │
       │   ├── Activity returns { status: "approved" }
       │   │   └── → Set reviewState.reviewerStatuses[reviewerId] = "approved"
       │   │
       │   ├── Activity returns { status: "revision_requested" }
       │   │   └── → Set reviewState.reviewerStatuses[reviewerId] = "revision_requested"
       │   │       └── → Set anyRevisionRequested = true
       │   │
       │   └── Activity returns { status: "parse_error", reason, rawValue? }
       │       └── → Enter failure flow (retry/cancel)
       │           - Error type: "RecommendationParseError"
       │           - Error message: reason (+ rawValue if present)
       │           - On retry: re-run entire review cycle
       │           - On cancel: return "cancelled"
       │
       4. Continue to next reviewer (loop back to step 1)
       │
       5. All reviewers processed
          ├── anyRevisionRequested === true
          │   └── → Revision flow (EXISTING BEHAVIOR, unchanged)
          │
          └── All approved
              └── → Advance to next phase (EXISTING BEHAVIOR, unchanged)
```

### Business Rules

| ID | Rule |
|----|------|
| BR-RC-01 | The `readCrossReviewRecommendation` activity runs **after** the reviewer's `invokeSkill` activity returns. The `invokeSkill` activity always merges the worktree back to the feature branch before returning — this is a precondition, not something this flow controls. |
| BR-RC-02 | If the cross-review file does not exist on disk when the activity reads it, the activity returns `parse_error` with reason "Cross-review file not found". The workflow treats this as a failure (same as a malformed recommendation). |
| BR-RC-03 | If `agentIdToSkillName()` returns `null`, the activity returns `parse_error` immediately without attempting to read a file. This prevents constructing an invalid file path. Note: `SKILL_TO_AGENT` must be corrected from `"backend-engineer": "eng"` to `"engineer": "eng"` for this mapping to produce correct file paths. |
| BR-RC-04 | Parse errors are recoverable via the existing failure flow. The operator can instruct the agent to retry (which re-runs the reviewer), or cancel the phase. |
| BR-RC-05 | The `parseRecommendation()` function recognizes exactly these values (case-insensitive, substring match): "approved", "approved with minor changes" (→ approved), "needs revision" (→ revision_requested), "lgtm" (→ approved). Any other value produces a `parse_error`. |
| BR-RC-06 | The `readCrossReviewRecommendation` activity is a **new** activity — it must NOT be inlined into the workflow. File I/O is prohibited in Temporal workflow code. |

### Input / Output

**Input to the flow (per reviewer):**

| Field | Source | Description |
|-------|--------|-------------|
| `agentId` | Review phase config (reviewers list) | The reviewer's agent ID (e.g., "eng", "qa") |
| `featurePath` | Workflow state (`state.featurePath`) | Resolved feature folder path (e.g., "docs/in-progress/auth/") |
| `documentType` | Derived from `phase.id` | The document type abbreviation (e.g., "REQ", "TSPEC"). Derived by stripping `-creation`/`-review`/`-approved` suffix from `phase.id` and uppercasing. |

**Output from the flow (per reviewer):**

| Outcome | Effect on workflow state |
|---------|--------------------------|
| `approved` | `reviewState.reviewerStatuses[agentId]` = `"approved"` |
| `revision_requested` | `reviewState.reviewerStatuses[agentId]` = `"revision_requested"`, `anyRevisionRequested` = `true` |
| `parse_error` | Enters failure flow (retry/cancel prompt posted to Discord) |

### Edge Cases

| Case | Behavior |
|------|----------|
| Reviewer writes cross-review file but uses non-standard recommendation wording (e.g., "Looks good to me!") | `parse_error` — the exact substring "lgtm" would match, but "Looks good to me" does not. Operator must retry after fixing the file or asking the reviewer to rewrite. |
| Cross-review file exists but is empty (0 bytes) | `parse_error` — "No Recommendation heading found" |
| Multiple "Recommendation" headings in the file | The parser uses the **last** match (outside code blocks). This is existing `parseRecommendation()` behavior — the FSPEC does not change it. |
| Reviewer agent crashes mid-write (partial file on disk) | The `invokeSkill` activity will have thrown an error, so the flow never reaches step 2. The failure flow handles this. |
| Two reviewers write cross-review files with the same name (e.g., two "eng" reviewers) | Not possible — the review cycle dispatches each unique `agentId` once. The YAML `reviewers` list contains unique agent IDs. |

### Error Scenarios

| Scenario | User-visible behavior |
|----------|----------------------|
| Cross-review file not found | Failure notification posted to Discord: "RecommendationParseError: Cross-review file not found". Operator can retry or cancel. |
| Unrecognized recommendation value | Failure notification posted to Discord: "RecommendationParseError: Unrecognized recommendation: {rawValue}". Operator can retry or cancel. |
| Unknown agent ID | Failure notification posted to Discord: "RecommendationParseError: Unknown agent ID: {agentId}". This indicates a configuration error — the agent ID in the workflow YAML doesn't match the `SKILL_TO_AGENT` mapping. |

### Acceptance Tests

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | Reviewer "eng" completed and wrote `CROSS-REVIEW-engineer-REQ.md` with "## Recommendation\n\n**Approved**" |
| WHEN | The review cycle reads and parses the cross-review file |
| THEN | `reviewState.reviewerStatuses["eng"]` is set to `"approved"` |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | Reviewer "qa" completed and wrote a cross-review file with "## Recommendation\n\n**Needs revision**" |
| WHEN | The review cycle reads and parses the cross-review file |
| THEN | `reviewState.reviewerStatuses["qa"]` is set to `"revision_requested"` and `anyRevisionRequested` is `true` |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | Reviewer "eng" completed but the cross-review file does not exist at the expected path |
| WHEN | The review cycle attempts to read the file |
| THEN | A failure notification is posted to Discord with "Cross-review file not found", and the operator is prompted to retry or cancel |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | Reviewer "eng" completed and wrote a cross-review file containing "## Recommendation\n\nLGTM" |
| WHEN | The review cycle reads and parses the cross-review file |
| THEN | `reviewState.reviewerStatuses["eng"]` is set to `"approved"` (LGTM maps to approved) |

**Dependencies:** None

**Open questions:** None

---

## FSPEC-DR-01: Discord Workflow Start Trigger

**Linked requirements:** [REQ-DR-01]

**Description:** When a user posts a message in a Discord thread associated with the updates channel, the orchestrator must determine whether to start a new Temporal workflow. This decision depends on whether a workflow is already running for the feature: if no workflow exists and the message mentions an agent, a new workflow starts; if a workflow exists, the message is routed to the existing ad-hoc or state-dependent handlers.

### Behavioral Flow

The key design decision is that **workflow existence is checked BEFORE ad-hoc directive parsing**. This ensures that `@pm define requirements` starts a new workflow when none exists, rather than failing with "No active workflow found."

```
1. Message arrives in handleMessage()
   │
   2. Is the message from a bot?
   │   ├── YES → Return (ignore) — EXISTING BEHAVIOR
   │   └── NO → Continue
   │
   3. Extract feature slug from thread name
   │   a. extractFeatureName(message.threadName)
   │   b. featureNameToSlug(featureName)
   │   c. workflowId = "ptah-{slug}"
   │
   4. Check for running workflow
   │   a. Query Temporal: does workflow with ID "ptah-{slug}" exist and is running?
   │   │
   │   ├── YES (workflow exists and is running)
   │   │   │
   │   │   5a. Parse as ad-hoc directive via parseAdHocDirective()
   │   │   │   ├── Returns a directive → Handle ad-hoc (EXISTING BEHAVIOR, unchanged)
   │   │   │   └── Returns null → Go to step 6 (state-dependent routing)
   │   │   │
   │   │   6. State-dependent routing (see FSPEC-DR-02 and FSPEC-DR-03)
   │   │
   │   └── NO (workflow does not exist, or has completed/failed/cancelled)
   │       │
   │       5b. Does the message contain an @{agentId} mention?
   │       │   (Check anywhere in message content, not just first token)
   │       │   ├── NO → Return (no action — conversational message in thread)
   │       │   └── YES → Continue
   │       │
   │       6b. Start new workflow
   │           a. featureConfig = { discipline: "fullstack", skipFspec: false, useTechLead: false }
   │           b. Call startWorkflowForFeature({ featureSlug, featureConfig })
   │           │
   │           ├── Success → Post confirmation: "Started workflow ptah-{slug} for {feature}"
   │           │
   │           └── WorkflowExecutionAlreadyStartedError (race condition / dedup)
   │               └── Post notice: "Workflow already running for {slug}"
```

### Business Rules

| ID | Rule |
|----|------|
| BR-DR-01 | **Workflow existence check comes first.** The flow checks whether a workflow is running BEFORE parsing ad-hoc directives. This ensures `@pm define requirements` starts a new workflow when none exists (instead of being parsed as an ad-hoc directive and failing with "No active workflow found"). Ad-hoc directive parsing only runs when a workflow IS running. |
| BR-DR-02 | **Workflow ID is deterministic.** The workflow ID is always `ptah-{slug}` where `slug` is derived from the thread name via `extractFeatureName()` + `featureNameToSlug()`. This enables Temporal's built-in workflow-ID deduplication. |
| BR-DR-03 | **FeatureConfig uses defaults.** In this phase, config is always `{ discipline: "fullstack", skipFspec: false, useTechLead: false }`. Config override mechanisms are out of scope. |
| BR-DR-04 | **Idempotent start.** If a workflow is already running for the feature (same workflow ID), Temporal rejects the duplicate start with `WorkflowExecutionAlreadyStartedError`. The orchestrator catches this and posts a notice — it does not crash. |
| BR-DR-05 | **Agent mention detection for workflow start.** A message triggers a workflow start if it contains an `@{agentId}` pattern anywhere in the content (not just the first token), where `agentId` is a registered agent (e.g., `@pm`, `@eng`, `@qa`). This uses the agent registry. Examples: `"@pm define requirements"` matches, `"Please start @pm"` matches, `"let's define requirements"` does NOT match. |

### Input / Output

**Input:**

| Field | Source | Description |
|-------|--------|-------------|
| `message` | Discord event | The `ThreadMessage` object with `content`, `threadName`, `threadId`, `authorName`, `isBot`, `timestamp` |

**Output:**

| Outcome | Effect |
|---------|--------|
| Workflow started | New Temporal workflow running with ID `ptah-{slug}`. Confirmation posted to Discord thread. |
| Duplicate detected | No new workflow. "Workflow already running" notice posted. |
| No agent mention | No action taken. Message ignored silently. |
| Bot message | No action taken. |

### Edge Cases

| Case | Behavior |
|------|----------|
| Thread name contains em dash separator (e.g., "auth — define requirements") | `extractFeatureName()` strips the suffix. Slug = "auth". |
| Thread name has no em dash separator | Full thread name is slugified. |
| Multiple agents mentioned in the same message (e.g., "@pm @eng define requirements") | Only one workflow is started (workflow ID is per-feature, not per-agent). The first agent mentioned determines the initial task context, but the workflow follows the YAML phase order regardless. |
| Workflow previously ran for this feature and completed | A new workflow starts (Temporal allows reuse of workflow IDs after completion). |
| Workflow previously ran and was cancelled | Same as above — a new workflow starts. |
| Two users post simultaneously in the same thread | First start succeeds; second gets `WorkflowExecutionAlreadyStartedError` and sees the "already running" notice. |

### Error Scenarios

| Scenario | User-visible behavior |
|----------|----------------------|
| Temporal workflow-existence query fails (step 4 — server unreachable, timeout) | Fail-silent: the message falls through without routing. No error is posted (consistent with FSPEC-DR-02). The user can retry by posting again. |
| Temporal server unreachable when starting workflow (step 6b) | Error posted to Discord thread: "Failed to start workflow for {slug}. Please try again." |
| `extractFeatureName()` produces empty slug | Edge case in slugification — should not happen with valid thread names. If it does, the workflow ID would be `ptah-` which is invalid. Guard: skip start and log warning. |

### Acceptance Tests

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | No active workflow for feature "auth" and I post "@pm define requirements" in the "auth" thread |
| WHEN | `handleMessage()` processes my message |
| THEN | A Temporal workflow starts with ID "ptah-auth", and "Started workflow ptah-auth for auth" is posted to the thread |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | A workflow is already running for "auth" (ID "ptah-auth") |
| WHEN | I post "@pm define requirements" in the "auth" thread |
| THEN | The message is parsed as an ad-hoc directive (since a workflow IS running) and handled via the existing ad-hoc flow — NOT treated as a new workflow start |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | No active workflow for "auth" |
| WHEN | I post a message in the "auth" thread WITHOUT mentioning any agent (e.g., "let's start working on auth") |
| THEN | The message is ignored — no workflow starts, no error is posted |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | No active workflow for "auth" |
| WHEN | I post "Please start the requirements process @pm" in the "auth" thread |
| THEN | A workflow starts — the `@pm` mention is detected anywhere in the message content, not just as the first token |

**Dependencies:** None

**Open questions:** None

---

## FSPEC-DR-02: Discord User Answer Routing

**Linked requirements:** [REQ-DR-02]

**Description:** When a workflow is running and waiting for a user answer (`waiting-for-user` state), non-bot messages in the thread must be routed as `user-answer` signals. This connects the Discord conversation to the Temporal workflow's question flow.

### Behavioral Flow

```
1. Message arrives in handleMessage()
   │  (Steps 1-4 from FSPEC-DR-01 already executed: not a bot, workflow exists,
   │   not an ad-hoc directive)
   │
   5. Query workflow state
   │   a. Call temporalClient.queryWorkflowState(workflowId)
   │   │
   │   ├── State: "waiting-for-user"
   │   │   └── 6. Route as user answer
   │   │       a. Call routeUserAnswer({
   │   │            workflowId,
   │   │            answer: message.content,
   │   │            answeredBy: message.authorName,
   │   │            answeredAt: message.timestamp.toISOString()
   │   │          })
   │   │       │
   │   │       ├── Success → No confirmation needed (the workflow will post its own
   │   │       │              response once the agent processes the answer)
   │   │       │
   │   │       └── Error → Post error to thread: "Failed to deliver answer. Please try again."
   │   │
   │   ├── State: "failed" or "revision-bound-reached"
   │   │   └── → Route to retry/cancel handling (FSPEC-DR-03)
   │   │
   │   └── Any other state ("running", "skipped", etc.)
   │       └── → Return (ignore message silently)
   │
```

### Business Rules

| ID | Rule |
|----|------|
| BR-DR-06 | **Full message content is the answer.** The entire `message.content` is sent as the answer text. No parsing, trimming, or extraction is performed. |
| BR-DR-07 | **Only the first answer matters.** The Temporal workflow's question flow (BR-08 in `handleQuestionFlow`) captures only the first valid answer signal and ignores subsequent ones. If two users answer simultaneously, the first signal received by Temporal wins. |
| BR-DR-08 | **No confirmation posted for answers.** Unlike workflow start (which posts a confirmation), user answers are delivered silently. The workflow will post its own response (agent re-invocation result) once it processes the answer. Posting a redundant "answer received" message would clutter the thread. |
| BR-DR-09 | **Messages during "running" state are ignored.** If the workflow is actively executing (not waiting for user input), user messages are silently dropped. They remain visible in the Discord thread but have no effect on the workflow. This avoids accidental signal delivery. |

### Input / Output

**Input:**

| Field | Source | Description |
|-------|--------|-------------|
| `message.content` | Discord message | The full text of the user's reply |
| `message.authorName` | Discord message | The user's display name |
| `message.timestamp` | Discord message | When the message was posted |
| `workflowId` | Derived from thread name | `ptah-{slug}` |

**Output:**

| Outcome | Effect |
|---------|--------|
| Answer delivered | `user-answer` signal sent to workflow. Agent re-invoked with question+answer context. |
| Workflow not waiting | Message silently ignored. |
| Signal delivery failed | Error posted to Discord thread. |

### Edge Cases

| Case | Behavior |
|------|----------|
| User replies with an empty message (e.g., image-only, attachment-only) | Empty string is sent as the answer. The workflow's signal handler filters empty answers (BR from `handleQuestionFlow`: empty `signal.answer` is ignored, workflow re-waits). |
| User edits their message after posting | Edited messages are not re-routed. Only the original message content is delivered. Discord message edit events are not handled by the current `handleMessage()` flow. |
| Workflow transitions from "waiting-for-user" to "running" between state query and signal delivery | The signal is buffered by Temporal and delivered when the workflow next checks for it. If the workflow is no longer waiting (e.g., timed out), the signal is harmlessly ignored. |
| Two workflows exist for different features in the same thread | Not possible — thread name determines the slug, and the slug determines the workflow ID. One thread = one feature = one workflow. |

### Error Scenarios

| Scenario | User-visible behavior |
|----------|----------------------|
| Temporal query fails (server unreachable) | The message falls through without routing. No error is posted (fail-silent for non-critical path). The user can retry by posting again. |
| Signal delivery fails after successful query | Error posted: "Failed to deliver answer. Please try again." |

### Acceptance Tests

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | Workflow "ptah-auth" is in "waiting-for-user" state with a pending question |
| WHEN | I reply in the thread with "Use JWT tokens for authentication" |
| THEN | The `user-answer` signal is sent to the workflow with my answer text, and the agent is re-invoked with the question and answer in context |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | Workflow "ptah-auth" is in "running" state (agent actively executing) |
| WHEN | I post "Just checking on progress" in the thread |
| THEN | The message is silently ignored — no signal is sent, no error is posted |

| | |
|---|---|
| WHO | As the workflow engine |
| GIVEN | The Ptah bot posts a notification message in the thread (e.g., "Agent completed review") |
| WHEN | `handleMessage()` processes the message |
| THEN | The message is ignored at step 2 (bot filter) — never reaches the routing logic |

**Dependencies:** [FSPEC-DR-01]

**Open questions:** None

---

## FSPEC-DR-03: Discord Retry/Cancel/Resume Routing

**Linked requirements:** [REQ-DR-03]

**Description:** When a workflow is in a failed or revision-bound-reached state, user messages containing recognized intent keywords must be routed as the appropriate Temporal signal. Messages without recognized keywords are silently ignored.

### Behavioral Flow

```
1. Message arrives (steps 1-4 from FSPEC-DR-01 + step 5 from DR-02 already executed)
   │  Workflow exists and state is "failed" or "revision-bound-reached"
   │
   2. Parse user intent from message content
   │   a. Normalize: lowercase the full message content
   │   b. Search for standalone keyword match (word boundary):
   │      - "retry" → action = "retry"
   │      - "cancel" → action = "cancel"
   │      - "resume" → action = "resume"
   │   c. If multiple keywords present, use the FIRST match in the message
   │   d. If no keyword matches → Return (ignore message silently)
   │
   3. Route signal based on workflow state + action
   │
   │   ├── State: "failed"
   │   │   ├── action = "retry"
   │   │   │   └── Call routeRetryOrCancel({ workflowId, action: "retry" })
   │   │   │       └── Workflow re-executes the failed phase
   │   │   │
   │   │   ├── action = "cancel"
   │   │   │   └── Call routeRetryOrCancel({ workflowId, action: "cancel" })
   │   │   │       └── Workflow transitions to cancelled state
   │   │   │
   │   │   └── action = "resume"
   │   │       └── Post hint: "Workflow is in failed state. Use 'retry' to re-execute or 'cancel' to abort."
   │   │           No signal sent.
   │   │
   │   └── State: "revision-bound-reached"
   │       ├── action = "resume"
   │       │   └── Call routeResumeOrCancel({ workflowId, action: "resume" })
   │       │       └── Workflow continues past the revision bound
   │       │
   │       ├── action = "cancel"
   │       │   └── Call routeResumeOrCancel({ workflowId, action: "cancel" })
   │       │       └── Workflow transitions to cancelled state
   │       │
   │       └── action = "retry"
   │           └── Post hint: "Workflow reached revision bound. Use 'resume' to continue or 'cancel' to abort."
   │               No signal sent.
   │
   4. Post acknowledgement (best effort, non-critical)
      └── "Sent {action} signal to workflow ptah-{slug}"
```

### Business Rules

| ID | Rule |
|----|------|
| BR-DR-10 | **Standalone word matching.** Intent keywords must appear as standalone words — not as substrings. "retry" matches in "please retry" and "Retry the phase" but NOT in "retrying" or "do not retry!!" (the exclamation marks are not word characters, so "retry" before "!!" IS a match — the word boundary is between "y" and "!"). Use word-boundary regex: `/\bretry\b/i`. |
| BR-DR-11 | **Case-insensitive matching.** "Retry", "RETRY", "rEtRy" all match. |
| BR-DR-12 | **First keyword wins.** If the message contains "retry and then cancel if it fails again", the action is "retry" (first match). |
| BR-DR-13 | **State-action validation with hints.** Not all actions are valid for all states. "resume" is only valid for "revision-bound-reached". "retry" is only valid for "failed". "cancel" is valid for both. Invalid action+state combinations post a helpful hint message telling the user which commands are valid for the current state — no signal is sent. |
| BR-DR-14 | **Acknowledgement is best-effort.** If the ack message fails to post (Discord API error), the signal has already been sent. Log a warning but do not fail. |

### Input / Output

**Input:**

| Field | Source | Description |
|-------|--------|-------------|
| `message.content` | Discord message | The full text to scan for intent keywords |
| Workflow state | Temporal query | `"failed"` or `"revision-bound-reached"` |
| `workflowId` | Derived from thread name | `ptah-{slug}` |

**Output:**

| Outcome | Effect |
|---------|--------|
| Valid action + state match | Appropriate signal sent to workflow. Ack posted to thread. |
| Recognized keyword but invalid for state | Hint posted with valid commands for current state. No signal sent. |
| No recognized keyword | Silently ignored. No signal, no error. |
| Signal delivery fails | Error posted: "Failed to send {action} signal. Please try again." |

### Edge Cases

| Case | Behavior |
|------|----------|
| Message is just "retry" (single word) | Matches. `retry-or-cancel` signal sent with action "retry". |
| Message is "can you retry?" | Matches — "retry" is a standalone word. |
| Message is "I'm retrying" | Does NOT match — "retrying" ≠ "retry" at word boundary. |
| Message is "retry or cancel?" | "retry" is the first match. Action = "retry". |
| Message says "please resume" but state is "failed" | "resume" is recognized but invalid for "failed" state. Hint posted: "Workflow is in failed state. Use 'retry' to re-execute or 'cancel' to abort." |
| Message is "what happened?" | No keyword match. Silently ignored. Failure notification remains visible with instructions. |

### Error Scenarios

| Scenario | User-visible behavior |
|----------|----------------------|
| Temporal signal delivery fails | Error posted: "Failed to send retry signal. Please try again." |
| Workflow transitioned from "failed" to "running" between query and signal | Signal is buffered by Temporal. If the workflow is no longer in the handler loop, the signal may be ignored or picked up on next failure. No user-visible error. |

### Acceptance Tests

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | Workflow "ptah-auth" is in "failed" state |
| WHEN | I reply with "retry" in the thread |
| THEN | A `retry-or-cancel` signal with action "retry" is sent to the workflow, and "Sent retry signal to workflow ptah-auth" is posted to the thread |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | Workflow "ptah-auth" is in "failed" state |
| WHEN | I reply with "CANCEL" in the thread |
| THEN | A `retry-or-cancel` signal with action "cancel" is sent to the workflow |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | Workflow "ptah-auth" is in "revision-bound-reached" state |
| WHEN | I reply with "resume" in the thread |
| THEN | A `resume-or-cancel` signal with action "resume" is sent to the workflow |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | Workflow "ptah-auth" is in "failed" state |
| WHEN | I reply with "resume" in the thread |
| THEN | A hint is posted: "Workflow is in failed state. Use 'retry' to re-execute or 'cancel' to abort." No signal is sent. |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | Workflow "ptah-auth" is in "failed" state |
| WHEN | I reply with "what happened? show me the error" |
| THEN | The message is silently ignored — no recognized intent keyword found |

| | |
|---|---|
| WHO | As a workflow operator |
| GIVEN | Workflow "ptah-auth" is in "failed" state |
| WHEN | I reply with "Please Retry" |
| THEN | "retry" is matched (case-insensitive, standalone word), and the retry signal is sent |

**Dependencies:** [FSPEC-DR-01]

**Open questions:** None

---

## Summary of State-Dependent Message Routing (FSPEC-DR-01 + DR-02 + DR-03)

The following table summarizes how `handleMessage()` routes non-bot messages based on workflow state. **Workflow existence is checked first** — ad-hoc directive parsing only happens when a workflow IS running.

| Workflow State | Message Type | Action |
|----------------|-------------|--------|
| No workflow | Contains `@{agentId}` mention | Start new workflow (FSPEC-DR-01) |
| No workflow | No agent mention | Ignore |
| Running workflow | Starts with `@agent` (ad-hoc) | Handle ad-hoc directive (existing behavior) |
| `running` | Non-ad-hoc | Ignore |
| `waiting-for-user` | Non-ad-hoc | Route as user answer (FSPEC-DR-02) |
| `failed` | "retry" | Send `retry-or-cancel` with "retry" (FSPEC-DR-03) |
| `failed` | "cancel" | Send `retry-or-cancel` with "cancel" (FSPEC-DR-03) |
| `failed` | "resume" | Post hint with valid commands (FSPEC-DR-03) |
| `failed` | No keyword | Ignore |
| `revision-bound-reached` | "resume" | Send `resume-or-cancel` with "resume" (FSPEC-DR-03) |
| `revision-bound-reached` | "cancel" | Send `resume-or-cancel` with "cancel" (FSPEC-DR-03) |
| `revision-bound-reached` | "retry" | Post hint with valid commands (FSPEC-DR-03) |
| `revision-bound-reached` | No keyword | Ignore |
| `skipped`, `completed`, `cancelled` | Any | Ignore (internal phase reached terminal state while Temporal execution is still open) |

> **Note on "No workflow running" vs terminal states:** "No workflow running" (rows 1-2) means the Temporal execution itself is closed (completed, failed, cancelled, or never started). The `skipped`/`completed`/`cancelled` row refers to **internal workflow phase states** where the Temporal execution is still open but the lifecycle has reached a terminal phase. When a Temporal execution is closed, the step 4 query returns "no running workflow," enabling a new workflow start (per the edge case in FSPEC-DR-01).
