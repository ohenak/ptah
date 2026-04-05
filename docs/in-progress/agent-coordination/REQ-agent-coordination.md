# Requirements Document

## Agent Coordination

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-016 |
| **Parent Document** | [REQ-015 — Temporal Foundation](../../completed/015-temporal-foundation/015-REQ-temporal-foundation.md) |
| **Version** | 1.2 |
| **Date** | April 3, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

Two coordination gaps discovered during messaging-abstraction feature execution prevent the Temporal-based workflow from functioning correctly in production:

1. **Artifact isolation** — each agent creates a separate git branch, so downstream agents cannot read upstream artifacts. The engineer cannot see the PM's REQ; QA cannot see the engineer's TSPEC. The workflow is structurally broken for any multi-agent feature.

2. **Ad-hoc message routing** — a user message that names a specific agent (e.g. `@product-manager address feedback from CROSS-REVIEW-engineer-REQ.md`) is either ignored or misrouted, because the workflow only accepts signals from the currently active phase. There is no mechanism for the user to trigger an out-of-band revision request on a named agent.

Both gaps must be resolved before any multi-agent feature can execute end-to-end.

---

## 2. Scope

### In Scope

- Shared feature branch strategy: all agents working on a feature use one shared feature branch
- Worktree creation from the shared branch so each agent has an isolated working directory
- Committing and pushing agent worktree changes directly to the shared feature branch after each phase completes
- Parsing user messages to detect an `@agent-id` directive
- Dispatching ad-hoc revision requests to the named agent when the feature workflow is active
- Queuing multiple ad-hoc revision requests so the user can send several before the first completes
- Acknowledging ad-hoc requests with visible Discord feedback
- Automatically re-running downstream review phases after an ad-hoc revision completes

### Out of Scope

- Concurrent multi-agent execution (parallel phases are out of scope for this feature)
- Conflict resolution for simultaneous agent writes to the same file
- Routing ad-hoc messages when no workflow is active for the feature (unsolicited messages)
- Changing the PDLC phase sequence or adding new phases

### Assumptions

- Each feature has exactly one active Temporal workflow at a time
- The shared feature branch (`feat-{feature-slug}`) is created by the system before the first agent runs, as specified in [REQ-WB-05]
- Agent worktrees are still in `/tmp` and are ephemeral; only committed + pushed changes persist
- The `@agent-id` syntax mirrors agent IDs as defined in `workflow.yaml` (e.g. `@pm`, `@eng`, `@qa`)
- Mapping from human-readable @mention text (e.g. `@product-manager`) to agent ID (e.g. `pm`) is performed by the system at message receipt time and is not a product-level concern

---

## 3. User Stories

| ID | Story |
|----|-------|
| **US-01** | As an engineer agent, I want to read the PM's committed REQ document from git when my phase starts, so that I can see the upstream deliverable without it being in my local worktree. |
| **US-02** | As a QA agent, I want to read both the PM's REQ and the engineer's TSPEC when my phase starts, so that I can produce test properties that trace to actual requirements. |
| **US-03** | As a product manager agent, I want my commits to be available on the shared feature branch immediately after my phase completes, so that the next agent in the sequence can pull them. |
| **US-04** | As a user, I want to send `@product-manager address feedback from docs/messaging-abstraction/CROSS-REVIEW-engineer-REQ.md` to a feature thread and have the PM agent re-run with that instruction, so that I can trigger ad-hoc revisions without waiting for the sequential workflow to reach the PM phase again. |
| **US-05** | As a user, I want to receive a Discord acknowledgement when my @-mention message is dispatched to an agent, so that I know Ptah understood my intent and is acting on it. |
| **US-06** | As a user, I want to receive a Discord error message if my @-mention names an agent that is not part of the current feature's workflow, so that I understand why nothing happened. |
| **US-07** | As a user, I want to send multiple @-mention revision requests in quick succession and have them processed in order, so that I can queue up several instructions without waiting for each one to complete. |
| **US-08** | As a user, when I trigger an ad-hoc revision on an upstream agent (e.g. PM), I want the downstream review phases (e.g. engineer cross-review, QA cross-review) to automatically re-run with the updated artifacts, so that I don't have to manually re-trigger each subsequent phase. |

---

## 4. Requirements

### Domain: WB — Shared Worktree and Branch Strategy

#### REQ-WB-01: Shared Feature Branch

| Field | Detail |
|-------|--------|
| **ID** | REQ-WB-01 |
| **Title** | All agents for a feature use one shared feature branch |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-01, US-02, US-03 |
| **Dependencies** | — |

**Description:**
The worktree branch strategy must change from per-agent branches to a single shared feature branch. Instead of `ptah/{featureSlug}/{agentId}/{phaseId}`, the branch used for the feature's git history is `feat-{featureSlug}`. Each agent creates a short-lived worktree from this branch, does their work, commits, and pushes back to `feat-{featureSlug}`. When the next agent starts, they pull from `feat-{featureSlug}` and all prior artifacts are visible.

**Acceptance Criteria:**
```
WHO:   As a downstream agent (engineer or QA)
GIVEN: A prior agent (PM) has committed and pushed artifacts to feat-{featureSlug}
WHEN:  The downstream agent's invokeSkill activity starts
THEN:  The shared feature branch contains the PM's committed artifacts, and the
       agent's worktree (created from that branch) includes those files on disk
```

---

#### REQ-WB-02: Per-Agent Worktree from Shared Branch

| Field | Detail |
|-------|--------|
| **ID** | REQ-WB-02 |
| **Title** | Each agent gets an isolated worktree checked out from the shared branch |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-01, US-02, US-03 |
| **Dependencies** | REQ-WB-01, REQ-WB-05 |

**Description:**
Each agent still gets its own worktree directory for isolation during execution. The worktree is created from `feat-{featureSlug}` at the point the phase starts (i.e., it includes all commits up to that moment). The worktree does NOT create a new branch; it checks out `feat-{featureSlug}` directly into the agent's temp directory.

Worktree path convention remains `/tmp/ptah-worktrees/{agentId}/{featureSlug}/{phaseId}` for uniqueness.

The shared feature branch must already exist before any agent's worktree is created. [REQ-WB-05] is responsible for ensuring this precondition is met.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: Agent eng is starting phase req-review for feature messaging-abstraction,
       and feat-messaging-abstraction already exists (per REQ-WB-05)
WHEN:  invokeSkill creates the agent's worktree
THEN:  A worktree is created at /tmp/ptah-worktrees/eng/messaging-abstraction/req-review
       checked out at the HEAD of feat-messaging-abstraction,
       and no new branch is created
```

---

#### REQ-WB-03: Agent Commits Push to Shared Branch

| Field | Detail |
|-------|--------|
| **ID** | REQ-WB-03 |
| **Title** | Artifacts committed in an agent worktree are pushed to the shared feature branch |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-03 |
| **Dependencies** | REQ-WB-01, REQ-WB-02 |

**Description:**
After an agent finishes its skill invocation and commits artifacts to its worktree, those commits must be pushed directly to `feat-{featureSlug}` on the remote. Because the worktree is already checked out on `feat-{featureSlug}` (per [REQ-WB-02]), there is no intermediate per-agent branch and therefore no merge step. The previous two-step mechanism (commit to per-agent branch → merge into feature branch) is eliminated. The commit pathway is: **commit in the worktree (already on `feat-{featureSlug}`) → push to remote `feat-{featureSlug}`**.

The `ArtifactCommitter` interface and its call site in `invokeSkill` must be updated to reflect this simpler pathway. The `mergeWorktree` step is no longer needed and must be removed or replaced with a direct push.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: Agent pm has committed docs/messaging-abstraction/016-REQ-messaging-abstraction.md
       in its worktree, which is checked out on feat-messaging-abstraction
WHEN:  The post-skill commit step runs
THEN:  The commit is pushed directly to feat-messaging-abstraction on the remote
       (no intermediate branch is created or merged),
       and the next agent can read the file by pulling that branch
```

---

#### REQ-WB-04: Worktree Idempotency with Shared Branch

| Field | Detail |
|-------|--------|
| **ID** | REQ-WB-04 |
| **Title** | Activity retry must not fail when a worktree for the shared branch already exists |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-01 |
| **Dependencies** | REQ-WB-02 |

**Description:**
Because the shared feature branch may already be checked out as a worktree (e.g., by a prior retry or a surviving `/tmp` directory), the worktree creation step must handle the case where a worktree already exists for this agent's path.

Idempotency is determined by **worktree path alone** — not by branch name. Under the shared branch model, `feat-{featureSlug}` is the branch for every agent and phase in the feature, so a branch-name match would incorrectly identify another agent's active worktree as a reusable one. The existing idempotency check `wt.branch === worktreeBranch` must be replaced with a path-only check: `wt.path === worktreeBasePath`.

The `hasUnmergedCommits` check used to short-circuit retries must also be keyed to the phase's specific committed work (e.g., presence of the expected artifact file or a phase-specific commit marker), not the shared branch's general commit history — since the shared branch accumulates commits from all agents and phases.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: A Temporal activity retry occurs and /tmp/ptah-worktrees/eng/messaging-abstraction/req-review
       already exists, checked out on feat-messaging-abstraction
WHEN:  invokeSkill attempts to create the worktree
THEN:  The activity detects the existing path and reuses it without error,
       regardless of how many other worktrees may also be checked out on feat-messaging-abstraction
```

---

---

#### REQ-WB-05: Shared Feature Branch Created Before First Agent Runs

| Field | Detail |
|-------|--------|
| **ID** | REQ-WB-05 |
| **Title** | The shared feature branch is created by the workflow start step if it does not exist |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-01, US-02, US-03 |
| **Dependencies** | REQ-WB-01 |

**Description:**
The `startWorkflowForFeature` step — immediately before the Temporal workflow execution begins — must create the shared feature branch (`feat-{featureSlug}`) on the remote if it does not already exist. This is a single synchronous git operation outside of Temporal's determinism constraints and must complete before the workflow is submitted.

Creating the branch at workflow start (rather than inside the first agent's activity) is the preferred approach because:
1. Temporal activities may not call external git operations in a non-deterministic way without an activity wrapper.
2. The branch needs to exist before `invokeSkill` tries to add a worktree to it.
3. Making branch creation the workflow initiator's responsibility gives a single, predictable owner.

If the branch already exists (e.g., from a previous run or manual creation), the step is a no-op.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: Feature messaging-abstraction is being started for the first time
       and feat-messaging-abstraction does not exist on the remote
WHEN:  startWorkflowForFeature is called
THEN:  feat-messaging-abstraction is created on the remote,
       the Temporal workflow is then submitted,
       and the first agent's invokeSkill activity can successfully add a worktree
       from feat-messaging-abstraction without error

WHO:   As the orchestration system
GIVEN: feat-messaging-abstraction already exists on the remote
WHEN:  startWorkflowForFeature is called
THEN:  No duplicate branch creation is attempted, and the workflow starts normally
```

---

### Domain: MR — Ad-Hoc Message Routing

#### REQ-MR-01: Parse @Agent Directive from User Messages

| Field | Detail |
|-------|--------|
| **ID** | REQ-MR-01 |
| **Title** | Detect and extract @agent-id from user messages sent to a feature thread |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-04 |
| **Dependencies** | — |

**Description:**
When a user sends a message to a feature thread, the orchestrator must check whether the message's **first token** (after stripping leading whitespace) is an `@{agent-id}` directive that names a specific agent participating in the feature's workflow. If the first token matches, the message is classified as an **ad-hoc agent request** rather than a generic workflow signal.

The `@{agent-id}` directive qualifies **only when it appears as the first token** of the message. An `@{agent-id}` that appears mid-sentence (e.g., "The issue is that @pm wrote conflicting docs") must NOT be classified as an ad-hoc request. This prevents incidental agent @-mentions in discussion messages from triggering unintended actions.

`agent-id` values are defined in `workflow.yaml` (e.g., `pm`, `eng`, `qa`, `tech-lead`). The parser must be case-insensitive. A message whose first token does not match a recognisable `@{agent-id}` is treated as a regular user answer signal (existing behavior, unchanged).

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: A user sends "@product-manager address feedback from CROSS-REVIEW-engineer-REQ.md"
       to the feature thread for messaging-abstraction
WHEN:  The message handler processes the message
THEN:  The message is classified as an ad-hoc request targeting agent "pm",
       with the remainder of the message as the instruction payload
```

---

#### REQ-MR-02: Dispatch Ad-Hoc Revision Request to Named Agent

| Field | Detail |
|-------|--------|
| **ID** | REQ-MR-02 |
| **Title** | Route an ad-hoc @agent request to the correct agent via Temporal signal |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-04 |
| **Dependencies** | REQ-MR-01 |

**Description:**
When an ad-hoc agent request is detected and the named agent participates in the active workflow, the orchestrator must send a Temporal signal that causes the workflow to invoke the named agent with the user's instruction as the task. This should be modeled as a new signal type distinct from `userAnswer` — for example, `adHocRevision` — carrying the target agent ID and the instruction text.

The workflow must be able to receive this signal at any point (not just during a specific wait state) and schedule the named agent's activity as an out-of-band step. After the agent completes, the workflow resumes from where it was interrupted, or proceeds to the next scheduled phase if the interrupted phase had already completed.

The orchestrator must be able to resolve the active Temporal workflow ID from the feature slug in order to send the signal. [REQ-MR-08] specifies how this resolution is performed.

**Acceptance Criteria:**
```
WHO:   As a user
GIVEN: Feature messaging-abstraction has an active workflow and pm is a participant
WHEN:  The user sends "@pm address feedback from CROSS-REVIEW-engineer-REQ.md"
THEN:  The workflow receives an adHocRevision signal for agent "pm",
       the pm agent is invoked with the instruction text,
       and the workflow resumes its normal sequence after pm completes
```

---

#### REQ-MR-03: Reject Ad-Hoc Request for Unknown Agent

| Field | Detail |
|-------|--------|
| **ID** | REQ-MR-03 |
| **Title** | Reply with an error when the @-mentioned agent is not part of the workflow |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source user stories** | US-06 |
| **Dependencies** | REQ-MR-01 |

**Description:**
If the `@{agent-id}` in the user's message does not match any agent registered in the feature's workflow configuration, the orchestrator must NOT send a signal to Temporal. Instead, it must post a visible error reply in the Discord thread explaining that the named agent is not part of this feature's workflow.

**Acceptance Criteria:**
```
WHO:   As a user
GIVEN: Feature messaging-abstraction's workflow uses agents: pm, eng, qa
WHEN:  The user sends "@designer create a mockup"
THEN:  No Temporal signal is sent,
       and the bot replies in the Discord thread:
       "Agent @designer is not part of the messaging-abstraction workflow.
        Known agents: pm, eng, qa."
```

---

#### REQ-MR-04: Acknowledge Ad-Hoc Request in Discord

| Field | Detail |
|-------|--------|
| **ID** | REQ-MR-04 |
| **Title** | Post a visible acknowledgement when an ad-hoc request is dispatched |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source user stories** | US-05 |
| **Dependencies** | REQ-MR-02 |

**Description:**
When an ad-hoc revision request is successfully dispatched (signal sent to Temporal), the orchestrator must post a brief acknowledgement reply in the Discord thread. This confirms to the user that their message was understood and the named agent has been queued. The acknowledgement must include the agent name and a short summary of the instruction.

**Acceptance Criteria:**
```
WHO:   As a user
GIVEN: An adHocRevision signal has been successfully sent to the 016 workflow for agent pm
WHEN:  The orchestrator posts the acknowledgement
THEN:  The Discord thread receives a reply such as:
       "Dispatching @pm: address feedback from CROSS-REVIEW-engineer-REQ.md"
       within a few seconds of the user's message
```

---

#### REQ-MR-05: No Signal When Workflow Is Not Active


| Field | Detail |
|-------|--------|
| **ID** | REQ-MR-05 |
| **Title** | Do not send ad-hoc signals to features with no active workflow |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source user stories** | US-06 |
| **Dependencies** | REQ-MR-01 |

**Description:**
If an `@agent-id` message arrives for a feature thread but no active Temporal workflow exists for that feature (workflow is completed, cancelled, or not yet started), the orchestrator must not attempt to signal Temporal. It must post a user-visible reply explaining that the feature has no active workflow.

**Acceptance Criteria:**
```
WHO:   As a user
GIVEN: Feature messaging-abstraction's workflow has completed or does not exist
WHEN:  The user sends "@pm address feedback from CROSS-REVIEW-engineer-REQ.md"
THEN:  No Temporal signal is sent,
       and the bot replies: "No active workflow found for messaging-abstraction."
```

---

#### REQ-MR-06: Queue Multiple Ad-Hoc Revision Signals

| Field | Detail |
|-------|--------|
| **ID** | REQ-MR-06 |
| **Title** | Multiple adHocRevision signals are queued and processed in arrival order |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-07 |
| **Dependencies** | REQ-MR-02 |

**Description:**
The workflow must maintain an ordered queue of pending `adHocRevision` signals. When a second (or third) signal arrives while the first ad-hoc activity is still running, it must be held in the queue rather than rejected or dropped. Signals are processed in the order they were received (FIFO).

**Cascade-blocking rule:** A queued `adHocRevision` signal must not be dequeued until both (a) the current ad-hoc agent activity and (b) all downstream cascade phases triggered by that activity (per [REQ-MR-07]) have fully completed. Processing the next queued signal while a cascade is in progress would allow two agent activities to run simultaneously, violating the sequential constraint in [REQ-NF-01]. The queue is considered "blocked" for the duration of the cascade.

**Queue depth:** There is no maximum queue depth — signals accumulate until the workflow terminates. This is a conscious product decision: Temporal's built-in signal buffering handles accumulation, and normal usage will not approach problematic depths. The TSPEC should note that Temporal's event history limit (default 50k events) is the practical upper bound; if adversarial or accidental message floods are a concern, a soft cap (e.g., 50 pending signals) may be enforced at the implementation layer.

**Acceptance Criteria:**
```
WHO:   As a user
GIVEN: The workflow is processing an adHocRevision for agent pm
WHEN:  The user sends "@eng update the TSPEC to reflect the PM changes"
       before the pm activity finishes
THEN:  The eng adHocRevision is held in queue,
       the pm activity completes first,
       then the eng activity runs,
       and both acknowledgements are posted to Discord in order
```

---

#### REQ-MR-07: Automatic Downstream Phase Re-run After Ad-Hoc Revision

| Field | Detail |
|-------|--------|
| **ID** | REQ-MR-07 |
| **Title** | After an ad-hoc revision, downstream review phases automatically re-execute |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-08 |
| **Dependencies** | REQ-MR-02, REQ-WB-03 |

**Description:**
When an ad-hoc revision activity completes and produces new artifacts on the shared feature branch, the workflow must automatically re-run all phases that come after the revised agent's phase in the workflow sequence and have `type: "review"` in the `WorkflowConfig`. Phases with other types (`"creation"`, `"approved"`, `"implementation"`) are not re-run.

"After" means a strictly higher position index in the workflow phase array than the revised agent's phase. All such `type: "review"` phases re-run, regardless of which creation phase they were originally reviewing. This conservative approach is simpler to implement and ensures complete downstream consistency.

**Cascade + revision loop:** If a cascaded review phase completes with a "Needs revision" outcome, the standard revision loop runs within the cascade (the target creation agent is invoked, addresses the feedback, and the review phase re-runs). This is the same behavior as the normal sequential workflow. The cascade does not short-circuit back to the original ad-hoc revision agent.

The re-run must use the latest artifacts from the shared branch (i.e., each cascaded agent pulls `feat-{featureSlug}` before starting). The user does not need to take any action to trigger the downstream cascade.

**Example:** If the PM agent is revised ad-hoc, all `type: "review"` phases after PM's position re-run automatically (e.g., eng-review, qa-cross-review). If the engineer agent is revised, all `type: "review"` phases after eng's position re-run (e.g., qa-cross-review).

**Acceptance Criteria:**
```
WHO:   As a user
GIVEN: The workflow for feature 021 has phases: pm → eng-review → qa-cross-review → ...
       and an adHocRevision for pm completes
WHEN:  The pm ad-hoc activity finishes and pushes updated artifacts
THEN:  The workflow automatically schedules eng-review and qa-cross-review to re-run,
       each agent pulls the latest shared branch before starting,
       and the user sees Discord notifications for each re-run phase without
       having to send any additional messages
```

---

#### REQ-MR-08: Deterministic Workflow ID from Feature Slug

| Field | Detail |
|-------|--------|
| **ID** | REQ-MR-08 |
| **Title** | Workflow IDs are derived deterministically from feature slug |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-04, US-06 |
| **Dependencies** | REQ-MR-02, REQ-MR-05 |

**Description:**
To send an `adHocRevision` signal or check for an active workflow, the orchestrator must know the Temporal workflow ID for a given feature. Rather than maintaining an in-memory map or querying Temporal's list API, workflow IDs must be **deterministically derived from the feature slug**: `ptah-{featureSlug}` (e.g., `ptah-messaging-abstraction`).

This approach has three advantages:
1. No state to maintain — the orchestrator can reconstruct the workflow ID at any time from the feature slug.
2. No Temporal query API dependency — no search attributes or custom namespace configuration required.
3. "No active workflow" detection becomes a handled error: if a signal to `ptah-{featureSlug}` returns "workflow not found", the orchestrator treats this as the inactive case ([REQ-MR-05]).

Workflow IDs must be assigned this deterministic format when workflows are started. Existing workflows not using this format are out of scope.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: A user sends "@pm address feedback" for feature messaging-abstraction
WHEN:  The orchestrator constructs the Temporal signal target
THEN:  The workflow ID used is "ptah-messaging-abstraction",
       no lookup table or query API is consulted,
       and if that workflow ID is not found in Temporal, the response follows REQ-MR-05

WHO:   As the orchestration system
GIVEN: startWorkflowForFeature is called for feature messaging-abstraction
WHEN:  The Temporal workflow is submitted
THEN:  The workflow is registered under the ID "ptah-messaging-abstraction"
```

---

### Domain: NF — Non-Functional

#### REQ-NF-01: No Sequential Phase Disruption

| Field | Detail |
|-------|--------|
| **ID** | REQ-NF-01 |
| **Title** | Ad-hoc agent invocations must not corrupt the workflow's sequential phase state |
| **Priority** | P0 |
| **Phase** | 1 |
| **Source user stories** | US-04 |
| **Dependencies** | REQ-MR-02 |

**Description:**
When an ad-hoc revision activity runs and triggers an automatic downstream cascade ([REQ-MR-07]), the workflow's phase state must remain internally consistent throughout. No phase may be skipped, duplicated, or lost. The cascade re-runs are treated as re-executions of existing phases, not insertions of new phases. The workflow's phase cursor advances only after each re-run completes successfully.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: The workflow phase sequence is: pm → eng-review → qa-cross-review
       and an adHocRevision for pm triggers a cascade
WHEN:  The pm ad-hoc activity and the downstream cascade both complete
THEN:  The workflow's phase log shows each phase executed exactly once per cycle,
       no phase is missing from the execution history,
       and the final workflow state is consistent with a clean sequential run
```

---

#### REQ-NF-02: Shared Branch Must Not Block Parallel Future Work

| Field | Detail |
|-------|--------|
| **ID** | REQ-NF-02 |
| **Title** | The shared branch strategy must not preclude future parallel phase execution |
| **Priority** | P1 |
| **Phase** | 1 |
| **Source user stories** | US-01, US-02 |
| **Dependencies** | REQ-WB-01 |

**Description:**
The shared branch design must not create an architectural dead-end for future parallel agent execution (tracked separately). The branch strategy should allow for worktree-per-agent isolation during execution; only the commit/push step need be serialised. This means the design should document how merge conflicts would be handled if two agents ever write to different files on the same branch simultaneously — even if parallel execution is not implemented in this feature.

**Acceptance Criteria:**
```
WHO:   As an engineer reviewing the design
GIVEN: The shared branch architecture document (TSPEC)
WHEN:  Evaluating whether parallel agents could be added later
THEN:  The TSPEC explicitly addresses how concurrent writes to feat-{featureSlug}
       would be handled (e.g., rebase-then-push, or sequential merge lock)
```

---

## 5. Requirements Summary

| ID | Title | Priority | Phase | Domain |
|----|-------|----------|-------|--------|
| REQ-WB-01 | Shared feature branch for all agents | P0 | 1 | WB |
| REQ-WB-02 | Per-agent worktree from shared branch | P0 | 1 | WB |
| REQ-WB-03 | Agent commits push directly to shared branch | P0 | 1 | WB |
| REQ-WB-04 | Worktree idempotency via path-only matching | P0 | 1 | WB |
| REQ-WB-05 | Shared feature branch created before first agent runs | P0 | 1 | WB |
| REQ-MR-01 | Parse @agent directive (first-token rule) | P0 | 1 | MR |
| REQ-MR-02 | Dispatch ad-hoc revision to named agent | P0 | 1 | MR |
| REQ-MR-03 | Reject ad-hoc request for unknown agent | P1 | 1 | MR |
| REQ-MR-04 | Acknowledge ad-hoc request in Discord | P1 | 1 | MR |
| REQ-MR-05 | No signal when workflow is not active | P1 | 1 | MR |
| REQ-MR-06 | Queue multiple ad-hoc revision signals | P0 | 1 | MR |
| REQ-MR-07 | Automatic downstream phase re-run after ad-hoc revision | P0 | 1 | MR |
| REQ-MR-08 | Deterministic workflow ID from feature slug | P0 | 1 | MR |
| REQ-NF-01 | No sequential phase disruption | P0 | 1 | NF |
| REQ-NF-02 | Shared branch must not block parallel future work | P1 | 1 | NF |

---

## 6. Open Questions

| # | Question | Owner | Status | Resolution |
|---|----------|-------|--------|------------|
| OQ-01 | Should `adHocRevision` signals queue or be rejected if one is already in flight? | User | **Closed** | Signals queue (FIFO). Multiple can be pending. → [REQ-MR-06] |
| OQ-02 | Should downstream review phases re-run automatically or wait for user re-trigger? | User | **Closed** | Automatic downstream cascade. → [REQ-MR-07] |
| OQ-03 | Canonical mapping from Discord @mention text to agent ID? | User | **Closed** | Handled by the system at message receipt time; not a product-level concern. `@product-manager` and `@pm` both acceptable; system resolves to agent ID. No new requirement. |
| OQ-04 | For REQ-MR-07 cascade: does it re-run ALL subsequent `type: "review"` phases, or only those whose `creationPhase` directly corresponds to the revised agent? | Engineer | **Closed** | All `type: "review"` phases with a strictly higher position index than the revised agent's phase re-run, regardless of which creation phase they originally reviewed. Conservative approach ensures full downstream consistency. → [REQ-MR-07] |
| OQ-05 | For REQ-MR-07 cascade: if a cascaded review phase returns "Needs revision", does the standard revision loop run or is it short-circuited? | Engineer | **Closed** | Standard revision loop runs within the cascade. The cascade does not short-circuit; each cascaded phase follows normal outcome logic. → [REQ-MR-07] |
