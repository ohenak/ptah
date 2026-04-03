# Requirements Document

## Agent Coordination

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-021 |
| **Parent Document** | [REQ-015 — Temporal Foundation](../015-temporal-foundation/015-REQ-temporal-foundation.md) |
| **Version** | 1.0 |
| **Date** | April 3, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

Two coordination gaps discovered during feature 016 execution prevent the Temporal-based workflow from functioning correctly in production:

1. **Artifact isolation** — each agent creates a separate git branch, so downstream agents cannot read upstream artifacts. The engineer cannot see the PM's REQ; QA cannot see the engineer's TSPEC. The workflow is structurally broken for any multi-agent feature.

2. **Ad-hoc message routing** — a user message that names a specific agent (e.g. `@product-manager address feedback from CROSS-REVIEW-engineer-REQ.md`) is either ignored or misrouted, because the workflow only accepts signals from the currently active phase. There is no mechanism for the user to trigger an out-of-band revision request on a named agent.

Both gaps must be resolved before any multi-agent feature can execute end-to-end.

---

## 2. Scope

### In Scope

- Shared feature branch strategy: all agents working on a feature use one shared feature branch
- Worktree creation from the shared branch so each agent has an isolated working directory
- Merging agent worktree changes back to the shared feature branch after each phase completes
- Parsing user messages to detect an `@agent-id` directive
- Dispatching ad-hoc revision requests to the named agent when the feature workflow is active
- Acknowledging ad-hoc requests with visible Discord feedback

### Out of Scope

- Concurrent multi-agent execution (parallel phases are out of scope for this feature)
- Conflict resolution for simultaneous agent writes to the same file
- Routing ad-hoc messages when no workflow is active for the feature (unsolicited messages)
- Changing the PDLC phase sequence or adding new phases

### Assumptions

- Each feature has exactly one active Temporal workflow at a time
- The shared feature branch (`feat-{feature-slug}`) is created before the first agent runs
- Agent worktrees are still in `/tmp` and are ephemeral; only committed + pushed changes persist
- The `@agent-id` syntax mirrors agent IDs as defined in `workflow.yaml` (e.g. `@pm`, `@eng`, `@qa`)

---

## 3. User Stories

| ID | Story |
|----|-------|
| **US-01** | As an engineer agent, I want to read the PM's committed REQ document from git when my phase starts, so that I can see the upstream deliverable without it being in my local worktree. |
| **US-02** | As a QA agent, I want to read both the PM's REQ and the engineer's TSPEC when my phase starts, so that I can produce test properties that trace to actual requirements. |
| **US-03** | As a product manager agent, I want my commits to be available on the shared feature branch immediately after my phase completes, so that the next agent in the sequence can pull them. |
| **US-04** | As a user, I want to send `@product-manager address feedback from docs/016-messaging-abstraction/CROSS-REVIEW-engineer-REQ.md` to a feature thread and have the PM agent re-run with that instruction, so that I can trigger ad-hoc revisions without waiting for the sequential workflow to reach the PM phase again. |
| **US-05** | As a user, I want to receive a Discord acknowledgement when my @-mention message is dispatched to an agent, so that I know Ptah understood my intent and is acting on it. |
| **US-06** | As a user, I want to receive a Discord error message if my @-mention names an agent that is not part of the current feature's workflow, so that I understand why nothing happened. |

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
| **Dependencies** | REQ-WB-01 |

**Description:**
Each agent still gets its own worktree directory for isolation during execution. The worktree is created from `feat-{featureSlug}` at the point the phase starts (i.e., it includes all commits up to that moment). The worktree does NOT create a new branch; it checks out `feat-{featureSlug}` directly into the agent's temp directory.

Worktree path convention remains `/tmp/ptah-worktrees/{agentId}/{featureSlug}/{phaseId}` for uniqueness.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: Agent eng is starting phase req-review for feature 016-messaging-abstraction
WHEN:  invokeSkill creates the agent's worktree
THEN:  A worktree is created at /tmp/ptah-worktrees/eng/016-messaging-abstraction/req-review
       checked out at the HEAD of feat-016-messaging-abstraction,
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
After an agent finishes its skill invocation and commits artifacts to its worktree, the merge/push step must target `feat-{featureSlug}` rather than a per-agent branch. The current `mergeWorktree` activity pushes to a feature branch; this requirement formalises that the target is always the shared feature branch derived from the feature slug, not the worktree's local branch.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: Agent pm has committed docs/016-messaging-abstraction/016-REQ-messaging-abstraction.md
       to its worktree
WHEN:  The mergeWorktree activity runs
THEN:  The commit appears on feat-016-messaging-abstraction on the remote,
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
Because the shared feature branch may already be checked out as a worktree (e.g., by a prior retry or a surviving `/tmp` directory), the worktree creation step must handle the case where `feat-{featureSlug}` is already checked out elsewhere. The system must reuse or recreate the worktree without error, consistent with the general idempotency requirement already present in `invokeSkill`.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: A Temporal activity retry occurs and /tmp/ptah-worktrees/eng/.../req-review already exists
       checked out at feat-016-messaging-abstraction
WHEN:  invokeSkill attempts to create the worktree
THEN:  The activity reuses the existing worktree path without error and continues normally
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
When a user sends a message to a feature thread, the orchestrator must check whether the message begins with (or contains) an `@{agent-id}` directive that names a specific agent participating in the feature's workflow. If such a directive is found, the message is classified as an **ad-hoc agent request** rather than a generic workflow signal.

`agent-id` values are defined in `workflow.yaml` (e.g., `pm`, `eng`, `qa`, `tech-lead`). The parser must be case-insensitive and must ignore leading whitespace. A message that does not contain a recognisable `@{agent-id}` is treated as a regular user answer signal (existing behavior, unchanged).

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: A user sends "@product-manager address feedback from CROSS-REVIEW-engineer-REQ.md"
       to the feature thread for 016-messaging-abstraction
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

**Acceptance Criteria:**
```
WHO:   As a user
GIVEN: Feature 016-messaging-abstraction has an active workflow and pm is a participant
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
GIVEN: Feature 016-messaging-abstraction's workflow uses agents: pm, eng, qa
WHEN:  The user sends "@designer create a mockup"
THEN:  No Temporal signal is sent,
       and the bot replies in the Discord thread:
       "Agent @designer is not part of the 016-messaging-abstraction workflow.
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
GIVEN: Feature 016-messaging-abstraction's workflow has completed or does not exist
WHEN:  The user sends "@pm address feedback from CROSS-REVIEW-engineer-REQ.md"
THEN:  No Temporal signal is sent,
       and the bot replies: "No active workflow found for 016-messaging-abstraction."
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
When an ad-hoc revision request interrupts the normal workflow sequence, the workflow's phase state must remain consistent. After the ad-hoc agent activity completes, the workflow must resume the correct next phase without skipping, duplicating, or losing any scheduled phases. The ad-hoc step is a side-effect inserted between phases, not a phase replacement.

**Acceptance Criteria:**
```
WHO:   As the orchestration system
GIVEN: The workflow is between phase req-review (eng) and req-cross-review (qa),
       and an adHocRevision for pm runs
WHEN:  The pm ad-hoc activity completes
THEN:  The workflow proceeds to the qa req-cross-review phase as originally scheduled,
       and the qa agent sees the pm's updated artifacts on the shared branch
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
| REQ-WB-03 | Agent commits push to shared branch | P0 | 1 | WB |
| REQ-WB-04 | Worktree idempotency with shared branch | P0 | 1 | WB |
| REQ-MR-01 | Parse @agent directive from user messages | P0 | 1 | MR |
| REQ-MR-02 | Dispatch ad-hoc revision to named agent | P0 | 1 | MR |
| REQ-MR-03 | Reject ad-hoc request for unknown agent | P1 | 1 | MR |
| REQ-MR-04 | Acknowledge ad-hoc request in Discord | P1 | 1 | MR |
| REQ-MR-05 | No signal when workflow is not active | P1 | 1 | MR |
| REQ-NF-01 | No sequential phase disruption | P0 | 1 | NF |
| REQ-NF-02 | Shared branch must not block parallel future work | P1 | 1 | NF |

---

## 6. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| OQ-01 | Should `adHocRevision` signals queue (i.e., the user can send multiple before the first completes) or be rejected if one is already in flight? | User | Open |
| OQ-02 | When an ad-hoc pm run produces updated artifacts, should the workflow re-run downstream review phases automatically, or wait for the user to re-trigger? | User | Open |
| OQ-03 | What is the canonical mapping from Discord @mention text to agent ID? Does `@product-manager` map to `pm`, or must users type `@pm`? | User | Open |
