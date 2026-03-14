# Requirements Document

## Orchestrator-Driven PDLC State Machine

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-011 |
| **Parent Document** | [Ptah PRD v4.0](../PTAH_PRD_v4.0.docx) |
| **Version** | 1.0 |
| **Date** | March 14, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

This requirements document defines the centralization of PDLC (Product Development Lifecycle) state management from individual SKILL.md files into the Ptah orchestrator. Today, each agent (PM, backend-engineer, frontend-engineer, test-engineer) embeds its own understanding of PDLC phases, document status transitions, and routing logic within its SKILL.md instructions. Because agents are LLMs interpreting free-text instructions, this leads to non-deterministic state transitions — agents may skip phases, misroute reviews, or fail to track approval status consistently.

By moving the state machine into the orchestrator (TypeScript code), transitions become deterministic, review tracking becomes centralized, and agents can focus purely on their domain tasks without needing to manage workflow concerns.

---

## 2. User Scenarios

### US-13: Orchestrator Enforces PDLC Phase Ordering

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer starts a new feature. The orchestrator guides the feature through the full PDLC — REQ creation, review, FSPEC creation, review, TSPEC creation, review, PLAN creation, review, PROPERTIES creation, review, implementation, and final review — without any agent needing to know the full workflow. The orchestrator decides which agent to invoke next and what task to perform. |
| **Goals** | Guarantee that every feature follows the same PDLC phases in the correct order; eliminate the possibility of skipping phases or mis-ordering deliverables. |
| **Pain points** | Today, agents must interpret PDLC instructions from SKILL.md and self-select their task. An LLM may misinterpret which phase comes next, skip a review cycle, or route to the wrong agent. This has led to TSPEC being created before REQ review is complete, or reviews being sent to the wrong parties. |
| **Key needs** | A code-level state machine in the orchestrator that tracks current phase per feature and deterministically selects the next agent and task. |

### US-14: Orchestrator Tracks Review Approvals Deterministically

| Attribute | Detail |
|-----------|--------|
| **Description** | When a document (REQ, FSPEC, TSPEC, PLAN, PROPERTIES) enters a review phase, the orchestrator knows exactly which agents must review it. As each reviewer submits their cross-review file, the orchestrator tracks who has reviewed and whether they approved or requested revisions. Only when all required reviewers approve does the phase transition to "approved" and the next creation phase begins. |
| **Goals** | Eliminate the possibility of a document advancing without all required reviews; provide clear visibility into review status (who has reviewed, who is pending, who rejected). |
| **Pain points** | Today, the authoring agent (e.g., PM after creating REQ) manually routes to reviewers and manually decides when "enough" reviews are in. There is no centralized tracking of which reviewers have responded. A reviewer's rejection may be overlooked if the author decides to advance anyway. |
| **Key needs** | Per-phase reviewer manifest (who must review), per-reviewer status tracking (pending/approved/revision-requested), and orchestrator-enforced transitions that only fire when all reviewers approve. |

### US-15: Feature Configuration Determines Reviewer Set

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer starts a feature that only involves backend work (no frontend). The orchestrator uses the feature's discipline configuration to determine which agents participate in reviews. For a backend-only feature, the frontend engineer is excluded from REQ review, FSPEC review, TSPEC review, etc. For a fullstack feature, both backend and frontend engineers participate. |
| **Goals** | Avoid unnecessary reviews from agents whose discipline is not involved; ensure the correct cross-discipline reviews happen (e.g., frontend reviews backend TSPEC and vice versa for fullstack features). |
| **Pain points** | Today, the SKILL.md instructions hardcode review routing (e.g., "route to eng and qa"). There is no way to conditionally include or exclude the frontend engineer based on feature scope. This leads to either missing reviews (frontend not asked to review a fullstack feature's REQ) or wasted reviews (frontend asked to review a backend-only TSPEC). |
| **Key needs** | A per-feature configuration that specifies involved disciplines (backend-only, frontend-only, fullstack), with the orchestrator using this to compute the reviewer set for each phase. |

### US-16: Rejected Reviews Trigger Revision Loops

| Attribute | Detail |
|-----------|--------|
| **Description** | A backend engineer reviews a REQ document and requests revisions (files a cross-review with "Needs revision" recommendation). The orchestrator detects this rejection, transitions the feature back to the creation phase for that document type, and invokes the author (PM) with the revision feedback. The PM updates the document, and the orchestrator re-enters the review phase, requiring fresh reviews from all reviewers. |
| **Goals** | Ensure that revision requests are never lost or ignored; guarantee that a revised document goes through a full re-review cycle. |
| **Pain points** | Today, revision handling depends on the authoring agent reading the cross-review file, deciding to update, and re-routing for review. An LLM may misinterpret "Approved with minor changes" as full approval, skip the update, or forget to re-route for review. |
| **Key needs** | Orchestrator-level detection of approval vs. rejection in cross-review files; automatic transition back to creation phase on rejection; re-review cycle after revision. |

### US-17: PDLC State Survives Orchestrator Restarts

| Attribute | Detail |
|-----------|--------|
| **Description** | The orchestrator crashes or is intentionally restarted during a feature's PDLC. When it comes back up, it reads the persisted state file and resumes the feature from the exact phase it was in, with full knowledge of which reviews have been submitted and their outcomes. |
| **Goals** | No loss of PDLC progress on restart; no need to repeat completed phases or reviews. |
| **Pain points** | Today, PDLC state is implicit — it exists only in the conversation history and the presence of document files. On restart, the orchestrator has no way to know what phase a feature is in or which reviews are pending. This can lead to re-creating documents that already exist or skipping reviews that were in progress. |
| **Key needs** | Persistent state file (JSON or similar) that records per-feature phase, review status, and configuration; state recovery on startup. |

### US-18: Simplified Agent Skills Focus on Domain Tasks

| Attribute | Detail |
|-----------|--------|
| **Description** | A backend engineer is invoked by the orchestrator to create a TSPEC. The engineer's SKILL.md contains instructions only for how to write a good TSPEC — technical specification format, quality checklist, TDD principles. It does NOT contain PDLC workflow knowledge (what comes before/after TSPEC, who reviews it, how to route). The orchestrator provides the task directive ("create TSPEC for feature X") and the relevant context documents. |
| **Goals** | Reduce SKILL.md complexity; eliminate conflicting PDLC interpretations between agents; make agents more reliable by narrowing their decision scope. |
| **Pain points** | Today, each SKILL.md contains ~600-700 lines including full PDLC workflow logic (task selection, routing, review management). This means four copies of partially overlapping PDLC logic that can drift. Agents sometimes get confused between "create TSPEC" and "review TSPEC" because the task selection logic is complex. |
| **Key needs** | SKILL.md files stripped of PDLC state management (task selection, routing, review handling, document status management); orchestrator provides explicit task directives and context. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | The existing routing signal mechanism (`<routing>` tags with `ROUTE_TO_AGENT`, `LGTM`, `TASK_COMPLETE`) will be retained as the communication protocol between agents and orchestrator. | If routing signals are replaced, all SKILL.md files and the router module need updating simultaneously. |
| A-02 | A feature has exactly one active PDLC state at a time (no branching within the state machine for a single feature). | If parallel sub-workflows are needed (e.g., backend TSPEC and frontend TSPEC simultaneously), the state machine needs to support fork/join semantics, increasing complexity. |
| A-03 | Cross-review files follow the existing naming convention (`CROSS-REVIEW-{skill}-{doc-type}.md`) and can be parsed for approval/rejection status. | If review files don't follow a parseable format, the orchestrator cannot automatically detect approvals. |
| A-04 | The feature configuration (backend-only, frontend-only, fullstack) is set once at feature creation time and does not change mid-lifecycle. | If discipline scope changes mid-feature, the reviewer sets for already-completed phases become inconsistent. |
| A-05 | FSPEC is optional — some features may go directly from REQ_APPROVED to TSPEC_CREATION if the PM determines no behavioral specification is needed. | If FSPEC is always mandatory, the state machine skip logic is unnecessary dead code. |
| A-06 | For fullstack features, backend TSPEC and frontend TSPEC can be created in parallel (fork) and must both be approved before PLAN_CREATION (join). | If parallel TSPEC creation is not needed, a simpler sequential model suffices. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | The state machine must be implemented in TypeScript within the existing `ptah/src/orchestrator/` module structure. | Ptah architecture — all orchestration logic lives in `ptah/src/`. |
| C-02 | State persistence must use file-based storage (no external databases). The orchestrator runs as a single-process CLI tool. | Ptah deployment model — single-node, file-based. |
| C-03 | Existing routing signals (`ROUTE_TO_AGENT`, `ROUTE_TO_USER`, `LGTM`, `TASK_COMPLETE`) must remain backward-compatible during migration. | Active features in progress should not break. |
| C-04 | SKILL.md changes must be coordinated — all four skill files must be updated together to avoid inconsistency during the transition. | Agents read SKILL.md at invocation time; partial updates create a mixed state. |
| C-05 | The state machine must support the Pattern B (ROUTE_TO_USER) pause/resume mechanism for any phase where user input is needed. | Existing requirement [REQ-PQ-01] through [REQ-PQ-05]. |

---

## 4. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| Phase ordering enforcement | Features that complete all PDLC phases in correct order | Audit state file transitions for completed features | ~70% (LLM-dependent) | 100% (deterministic) |
| Review completeness | Documents that advance only after all required reviews | Count phase transitions with incomplete reviewer sets | Not tracked | 0 premature transitions |
| Restart recovery | Features that resume correctly after orchestrator restart | Test restart at each phase and verify state continuity | No recovery (restart = lost state) | 100% correct resumption |
| SKILL.md complexity | Lines of PDLC workflow logic in SKILL.md files | Count lines related to task selection, routing, status management | ~200-300 lines per skill | 0 lines (moved to orchestrator) |
| State machine coverage | PDLC phases with orchestrator-enforced transitions | Count implemented phases vs. total phases | 0 / 18 | 18 / 18 |

---

## 5. Functional Requirements

Requirements are grouped by functional domain.

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| SM | State Machine — core state machine, phase definitions, transitions |
| RT | Review Tracking — reviewer sets, approval tracking, rejection loops |
| AI | Agent Invocation — orchestrator-driven agent dispatch and task directives |
| FC | Feature Configuration — discipline selection, reviewer computation |
| SA | Skill Alignment — SKILL.md simplification, removing embedded PDLC logic |
| CA | Context Assembly — state-aware context provision to agents |

### 5.1 State Machine (SM)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-SM-01 | PDLC phase enumeration | The orchestrator must define the complete set of PDLC phases as an enumeration: `REQ_CREATION`, `REQ_REVIEW`, `REQ_APPROVED`, `FSPEC_CREATION`, `FSPEC_REVIEW`, `FSPEC_APPROVED`, `TSPEC_CREATION`, `TSPEC_REVIEW`, `TSPEC_APPROVED`, `PLAN_CREATION`, `PLAN_REVIEW`, `PLAN_APPROVED`, `PROPERTIES_CREATION`, `PROPERTIES_REVIEW`, `PROPERTIES_APPROVED`, `IMPLEMENTATION`, `IMPLEMENTATION_REVIEW`, `DONE`. | WHO: As the orchestrator GIVEN: a feature exists in the system WHEN: any phase transition occurs THEN: the feature's phase is set to one of the 18 defined enum values, and no other values are accepted | P0 | 1 | [US-13] | — |
| REQ-SM-02 | Per-feature state tracking | The orchestrator must maintain a state record for each active feature, identified by the feature slug (e.g., `011-orchestrator-pdlc-state-machine`). The state record includes: current phase, feature configuration, review status per phase, and timestamps. | WHO: As the orchestrator GIVEN: a new feature is started WHEN: the PM creates the feature folder THEN: a state record is initialized with phase `REQ_CREATION` and the feature's configuration | P0 | 1 | [US-13], [US-17] | — |
| REQ-SM-03 | Valid transition enforcement | The orchestrator must only allow transitions between adjacent phases as defined in the state machine. For example, `REQ_CREATION` can only transition to `REQ_REVIEW`. The orchestrator must reject any attempt to skip phases. | WHO: As the orchestrator GIVEN: a feature is in phase `REQ_CREATION` WHEN: the PM agent returns an `LGTM` signal after creating the REQ THEN: the phase transitions to `REQ_REVIEW`, not to any other phase | P0 | 1 | [US-13] | [REQ-SM-01] |
| REQ-SM-04 | FSPEC skip transition | The orchestrator must support skipping the FSPEC phases (`FSPEC_CREATION`, `FSPEC_REVIEW`, `FSPEC_APPROVED`) when the PM determines no functional specification is needed. The transition from `REQ_APPROVED` goes directly to `TSPEC_CREATION`. | WHO: As the orchestrator GIVEN: a feature is in phase `REQ_APPROVED` WHEN: the feature configuration indicates `skipFspec: true` or the PM signals that no FSPEC is needed THEN: the phase transitions directly to `TSPEC_CREATION`, bypassing `FSPEC_CREATION` | P1 | 1 | [US-13] | [REQ-SM-01], [REQ-FC-01] |
| REQ-SM-05 | State persistence to disk | The orchestrator must persist the full state of all active features to a JSON file on disk after every phase transition. The file path must be deterministic (e.g., `ptah/state/pdlc-state.json`). | WHO: As the orchestrator GIVEN: a phase transition occurs for any feature WHEN: the transition is committed THEN: the updated state is written to the state file within the same synchronous operation, ensuring crash recovery can read the last committed state | P0 | 1 | [US-17] | [REQ-SM-02] |
| REQ-SM-06 | State recovery on startup | On startup, the orchestrator must read the state file and restore all active features to their last persisted phase. Features in a review phase must have their reviewer status restored (who has reviewed, who is pending). | WHO: As the orchestrator GIVEN: the orchestrator starts up WHEN: a state file exists at the expected path THEN: all features are restored to their persisted phase with full review status intact, and the orchestrator can continue processing from where it left off | P0 | 1 | [US-17] | [REQ-SM-05] |
| REQ-SM-07 | Parallel TSPEC creation (fork) | For fullstack features, the orchestrator must support parallel creation of backend TSPEC and frontend TSPEC. When the feature transitions to `TSPEC_CREATION`, the orchestrator dispatches both the backend and frontend engineers concurrently. The phase does not advance to `TSPEC_REVIEW` until both TSPECs are submitted. | WHO: As the orchestrator GIVEN: a fullstack feature transitions to `TSPEC_CREATION` WHEN: the backend engineer submits their TSPEC THEN: the orchestrator records the backend TSPEC as complete but waits for the frontend TSPEC before advancing to `TSPEC_REVIEW` | P0 | 1 | [US-13], [US-15] | [REQ-SM-01], [REQ-FC-01] |
| REQ-SM-08 | Parallel PLAN creation (fork) | For fullstack features, the orchestrator must support parallel creation of backend PLAN and frontend PLAN, following the same fork/join pattern as TSPEC creation. | WHO: As the orchestrator GIVEN: a fullstack feature transitions to `PLAN_CREATION` WHEN: the backend engineer submits their PLAN THEN: the orchestrator records the backend PLAN as complete but waits for the frontend PLAN before advancing to `PLAN_REVIEW` | P0 | 1 | [US-13], [US-15] | [REQ-SM-01], [REQ-FC-01] |
| REQ-SM-09 | Terminal state | When a feature reaches the `DONE` phase, the orchestrator must mark it as complete and stop processing further transitions. The state record is retained for audit purposes but no further agent invocations occur for this feature. | WHO: As the orchestrator GIVEN: the test engineer's implementation review passes WHEN: the feature transitions to `DONE` THEN: no further agent invocations are triggered for this feature, and the state record shows `DONE` with a completion timestamp | P0 | 1 | [US-13] | [REQ-SM-01] |

### 5.2 Review Tracking (RT)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-RT-01 | Reviewer manifest per phase | For each review phase, the orchestrator must compute the set of required reviewers based on the document type and feature configuration. The manifest specifies agent IDs (e.g., `["eng", "qa"]` for REQ review of a backend-only feature). | WHO: As the orchestrator GIVEN: a feature transitions to a review phase (e.g., `REQ_REVIEW`) WHEN: the reviewer manifest is computed THEN: the manifest includes exactly the agents defined by the review rules for that phase and feature configuration, no more and no fewer | P0 | 1 | [US-14], [US-15] | [REQ-FC-01] |
| REQ-RT-02 | Review rules definition | The orchestrator must encode the following review rules: (1) REQ_REVIEW: backend (if backend involved), frontend (if frontend involved), test-engineer. (2) FSPEC_REVIEW: backend, frontend (if involved), test-engineer. (3) TSPEC_REVIEW: product-manager, test-engineer, peer dev (frontend reviews backend TSPEC, backend reviews frontend TSPEC). (4) PLAN_REVIEW: product-manager, test-engineer, peer dev. (5) PROPERTIES_REVIEW: product-manager, backend, frontend (if involved). (6) IMPLEMENTATION_REVIEW: test-engineer. | WHO: As the orchestrator GIVEN: the review rules are defined in code WHEN: any review phase is entered THEN: the reviewer set exactly matches the rules listed above for that phase and feature configuration | P0 | 1 | [US-14] | [REQ-SM-01] |
| REQ-RT-03 | Per-reviewer status tracking | For each review phase, the orchestrator must track per-reviewer status: `pending` (not yet reviewed), `approved` (reviewer approved), `revision_requested` (reviewer requested changes). | WHO: As the orchestrator GIVEN: a feature is in a review phase with 3 required reviewers WHEN: 1 reviewer submits an "Approved" cross-review THEN: that reviewer's status changes to `approved`, while the other 2 remain `pending` | P0 | 1 | [US-14] | [REQ-RT-01] |
| REQ-RT-04 | Approval detection from cross-review files | The orchestrator must detect approval or rejection by parsing the cross-review file for the **Recommendation** field. Values recognized: "Approved" → `approved`, "Approved with minor changes" → `approved`, "Needs revision" → `revision_requested`. | WHO: As the orchestrator GIVEN: a reviewer agent completes and a cross-review file is committed WHEN: the orchestrator reads the cross-review file THEN: the recommendation is correctly parsed and the reviewer's status is updated accordingly | P0 | 1 | [US-14], [US-16] | [REQ-RT-03] |
| REQ-RT-05 | Phase advance on all-approved | The orchestrator must advance the feature to the next phase (e.g., `REQ_REVIEW` → `REQ_APPROVED`) only when ALL required reviewers have status `approved`. If any reviewer has status `revision_requested`, the phase must not advance. | WHO: As the orchestrator GIVEN: a feature is in `REQ_REVIEW` with reviewers `eng` (approved) and `qa` (approved) WHEN: the last reviewer's approval is recorded THEN: the phase transitions to `REQ_APPROVED` | P0 | 1 | [US-14] | [REQ-RT-03] |
| REQ-RT-06 | Revision loop on rejection | When any reviewer submits a "Needs revision" recommendation, the orchestrator must transition the feature back to the corresponding creation phase (e.g., `REQ_REVIEW` → `REQ_CREATION`). The author agent is invoked with the revision feedback as context. After the author revises, the review phase restarts with all reviewers reset to `pending`. | WHO: As the orchestrator GIVEN: a feature is in `FSPEC_REVIEW` and reviewer `eng` submits "Needs revision" WHEN: the orchestrator processes the cross-review file THEN: the phase transitions back to `FSPEC_CREATION`, the PM is invoked with the revision feedback, and upon re-entering `FSPEC_REVIEW` all reviewer statuses are reset to `pending` | P0 | 1 | [US-16] | [REQ-RT-04], [REQ-SM-03] |
| REQ-RT-07 | Revision feedback context | When transitioning back to a creation phase due to rejection, the orchestrator must provide the author agent with: (1) the current document, (2) all cross-review files from the failed review round, and (3) a clear directive to address the revision feedback. | WHO: As the orchestrator GIVEN: a feature is transitioning from `TSPEC_REVIEW` back to `TSPEC_CREATION` due to rejection WHEN: the backend engineer is invoked THEN: the context includes the current TSPEC, all TSPEC cross-review files, and a directive saying "Address revision feedback from [reviewer] and update the TSPEC" | P0 | 1 | [US-16] | [REQ-RT-06], [REQ-CA-01] |
| REQ-RT-08 | Concurrent review dispatch | When entering a review phase, the orchestrator must dispatch review requests to all required reviewers. Reviewers may run concurrently (not sequentially) where the underlying system supports it. | WHO: As the orchestrator GIVEN: a feature transitions to `TSPEC_REVIEW` with 3 required reviewers WHEN: the review phase begins THEN: all 3 reviewers are dispatched (sequentially or in parallel depending on system capability), and the orchestrator collects all results before deciding on phase advance | P1 | 1 | [US-14] | [REQ-RT-01] |

### 5.3 Agent Invocation (AI)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-AI-01 | Orchestrator-driven agent selection | The orchestrator must determine which agent to invoke based on the current PDLC phase. Agents no longer self-select their task — the orchestrator provides an explicit task directive. | WHO: As the orchestrator GIVEN: a feature is in phase `TSPEC_CREATION` WHEN: the orchestrator processes this phase THEN: the backend engineer (agent `eng`) is invoked with a directive "Create TSPEC for feature X", not any other agent | P0 | 1 | [US-13], [US-18] | [REQ-SM-02] |
| REQ-AI-02 | Phase-to-agent mapping | The orchestrator must encode the mapping from PDLC phase to responsible agent: `REQ_CREATION` → `pm`, `FSPEC_CREATION` → `pm`, `TSPEC_CREATION` → `eng` (and `fe` for fullstack), `PLAN_CREATION` → `eng` (and `fe` for fullstack), `PROPERTIES_CREATION` → `qa`, `IMPLEMENTATION` → `eng` (and `fe` for fullstack), `IMPLEMENTATION_REVIEW` → `qa`. Review phases use the reviewer manifest from [REQ-RT-01]. | WHO: As the orchestrator GIVEN: the phase-to-agent mapping is defined in code WHEN: any creation or review phase is entered THEN: the correct agent(s) are invoked as defined in the mapping | P0 | 1 | [US-13] | [REQ-SM-01], [REQ-FC-01] |
| REQ-AI-03 | Task directive in context | When invoking an agent, the orchestrator must include an explicit task directive in the user message (Layer 3 context). The directive specifies: (1) the task type (create, review, revise, implement), (2) the document type (REQ, FSPEC, TSPEC, PLAN, PROPERTIES), and (3) the feature name. | WHO: As the orchestrator GIVEN: a feature transitions to `FSPEC_CREATION` WHEN: the PM agent is invoked THEN: the user message includes a directive like "ACTION: Create FSPEC\n\nCreate the Functional Specification for feature 011-orchestrator-pdlc-state-machine based on the approved REQ." | P0 | 1 | [US-18] | [REQ-AI-01] |
| REQ-AI-04 | Agent signal interpretation | The orchestrator must interpret the agent's routing signal to determine the outcome of the invocation: `LGTM` means the agent completed its task successfully (advance phase), `ROUTE_TO_USER` means the agent needs user input (pause via Pattern B), `TASK_COMPLETE` means the feature is done. The `ROUTE_TO_AGENT` signal is no longer used for PDLC workflow routing (the orchestrator handles that), but may still be used for ad-hoc coordination. | WHO: As the orchestrator GIVEN: an agent completes a creation task and returns `LGTM` WHEN: the orchestrator processes the routing signal THEN: the feature advances to the next phase (e.g., `REQ_CREATION` → `REQ_REVIEW`) | P0 | 1 | [US-13] | [REQ-SM-03] |
| REQ-AI-05 | Agent output validation | After an agent completes a creation task, the orchestrator must verify that the expected artifact exists on disk (e.g., `docs/{NNN}-{feature}/{NNN}-REQ-{feature}.md` for REQ_CREATION). If the artifact is missing, the orchestrator must re-invoke the agent with a correction directive. | WHO: As the orchestrator GIVEN: the PM agent returns `LGTM` for REQ_CREATION WHEN: the orchestrator checks for the expected artifact THEN: if the REQ file exists, the phase advances; if it does not exist, the PM is re-invoked with "The REQ artifact was not found. Please create it." | P1 | 1 | [US-13] | [REQ-AI-01] |

### 5.4 Feature Configuration (FC)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-FC-01 | Discipline configuration | Each feature must have a discipline configuration that specifies which engineering disciplines are involved. Supported values: `backend-only`, `frontend-only`, `fullstack`. This determines which agents participate in reviews and which engineers create TSPECs/PLANs/implementations. | WHO: As the orchestrator GIVEN: a new feature is started WHEN: the feature configuration is set THEN: the discipline is one of `backend-only`, `frontend-only`, or `fullstack`, and all subsequent reviewer computations and agent dispatches use this value | P0 | 1 | [US-15] | — |
| REQ-FC-02 | Configuration at feature creation | The feature discipline configuration must be set when the feature is first created (during Phase 0 bootstrap or at the start of REQ_CREATION). The developer specifies the discipline via the initial message or thread metadata. | WHO: As a developer GIVEN: starting a new feature WHEN: the feature is created in the system THEN: the developer can specify the discipline (backend-only, frontend-only, fullstack), and this is persisted in the feature's state record | P0 | 1 | [US-15] | [REQ-SM-02] |
| REQ-FC-03 | Default discipline | If no discipline is specified, the feature defaults to `backend-only`. | WHO: As the orchestrator GIVEN: a new feature is created without a discipline specification WHEN: the feature configuration is initialized THEN: the discipline is set to `backend-only` | P1 | 1 | [US-15] | [REQ-FC-01] |
| REQ-FC-04 | Reviewer set computation | The orchestrator must compute the reviewer set for each review phase using the discipline configuration and the review rules from [REQ-RT-02]. For example, `REQ_REVIEW` for a `backend-only` feature: reviewers = `["eng", "qa"]`. For a `fullstack` feature: reviewers = `["eng", "fe", "qa"]`. | WHO: As the orchestrator GIVEN: a `fullstack` feature enters `REQ_REVIEW` WHEN: the reviewer set is computed THEN: the set includes `eng`, `fe`, and `qa` (3 reviewers) | P0 | 1 | [US-14], [US-15] | [REQ-RT-01], [REQ-RT-02], [REQ-FC-01] |
| REQ-FC-05 | Peer review assignment | For TSPEC and PLAN review phases in fullstack features, the orchestrator must assign peer reviews: frontend engineer reviews backend TSPEC/PLAN, and backend engineer reviews frontend TSPEC/PLAN. For single-discipline features, peer review is not applicable (the reviewer set from [REQ-RT-02] is sufficient). | WHO: As the orchestrator GIVEN: a fullstack feature enters `TSPEC_REVIEW` WHEN: the reviewer manifest is computed THEN: the manifest includes `pm` (reviews both), `qa` (reviews both), `fe` (reviews backend TSPEC), and `eng` (reviews frontend TSPEC) | P0 | 1 | [US-14], [US-15] | [REQ-FC-01], [REQ-RT-02] |

### 5.5 Skill Alignment (SA)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-SA-01 | Remove task selection from SKILL.md | All four SKILL.md files must have their "Task Selection" decision tables removed. Agents no longer self-select their task — the orchestrator tells them what to do via the task directive in context. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator drives task selection WHEN: SKILL.md files are updated THEN: the "Task Selection — MANDATORY FIRST STEP" section and decision table are removed from all four skill files | P0 | 1 | [US-18] | [REQ-AI-01] |
| REQ-SA-02 | Remove routing logic from SKILL.md | All four SKILL.md files must have their "Route Documents for Review and Approval" task (Task 3 in PM/BE/FE, Task 3 in QA) removed or simplified. Agents no longer decide who to route to — they return `LGTM` when done and the orchestrator handles routing. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator handles review routing WHEN: SKILL.md files are updated THEN: routing instructions (which agent to route to next, routing tag examples with specific agent_ids for workflow purposes) are removed; agents retain the ability to signal `LGTM`, `ROUTE_TO_USER`, or `TASK_COMPLETE` | P0 | 1 | [US-18] | [REQ-AI-04] |
| REQ-SA-03 | Remove document status management from SKILL.md | All four SKILL.md files must have their "Document Status" sections removed or simplified. Agents no longer update document status (Draft → In Review → Approved) — the orchestrator manages document status based on PDLC phase. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator tracks document status via PDLC phase WHEN: SKILL.md files are updated THEN: instructions for agents to update document status fields are removed; the orchestrator updates the status field in documents when phase transitions occur | P0 | 1 | [US-18] | [REQ-SM-03] |
| REQ-SA-04 | Retain domain task instructions | SKILL.md files must retain all domain-specific task instructions: how to write a good REQ, FSPEC, TSPEC, PLAN, PROPERTIES; quality checklists; TDD principles; review scope guidance. Only PDLC workflow logic is removed. | WHO: As a SKILL.md maintainer GIVEN: PDLC logic is being removed from SKILL.md WHEN: the skill files are updated THEN: all domain-specific content (format templates, quality checklists, TDD methodology, review scope guidance, web search instructions, git workflow) is preserved intact | P0 | 1 | [US-18] | [REQ-SA-01], [REQ-SA-02] |
| REQ-SA-05 | Agent response contract | Each SKILL.md must document the expected response contract: (1) create the artifact file using Write tool, (2) commit and push to the feature branch, (3) return a routing signal (`LGTM` for success, `ROUTE_TO_USER` for blocking question, `TASK_COMPLETE` for final phase). The orchestrator relies on this contract. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator expects specific agent behaviors WHEN: SKILL.md files are updated THEN: each skill file includes a "Response Contract" section specifying: write artifact → commit/push → return routing signal | P0 | 1 | [US-18] | [REQ-AI-04] |
| REQ-SA-06 | Cross-review file convention retained | SKILL.md files for review tasks must retain the cross-review file naming convention (`CROSS-REVIEW-{skill}-{doc-type}.md`) and structured format (Findings, Questions, Recommendation). The orchestrator depends on this format for approval detection [REQ-RT-04]. | WHO: As a SKILL.md maintainer GIVEN: the orchestrator parses cross-review files for approval status WHEN: SKILL.md files are updated THEN: the cross-review file convention, naming pattern, and required fields (especially "Recommendation") are preserved | P0 | 1 | [US-14], [US-18] | [REQ-RT-04] |

### 5.6 Context Assembly (CA)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-CA-01 | Phase-aware context assembly | The context assembler must use the feature's current PDLC phase to determine which documents to include in the agent's context. For creation phases, include all prerequisite documents. For review phases, include the document under review plus the REQ and FSPEC for reference. | WHO: As the orchestrator GIVEN: a feature is in `TSPEC_CREATION` WHEN: context is assembled for the backend engineer THEN: the context includes the approved REQ, approved FSPEC (if exists), and the overview.md — but NOT previous cross-review files or unrelated documents | P0 | 1 | [US-18] | [REQ-SM-02] |
| REQ-CA-02 | Context document matrix | The orchestrator must define which documents are provided for each phase: (1) REQ_CREATION: overview.md. (2) FSPEC_CREATION: overview.md, approved REQ. (3) TSPEC_CREATION: overview.md, approved REQ, approved FSPEC. (4) PLAN_CREATION: approved TSPEC. (5) PROPERTIES_CREATION: approved REQ, approved FSPEC, approved TSPEC, approved PLAN. (6) IMPLEMENTATION: approved TSPEC, approved PLAN, approved PROPERTIES. (7) IMPLEMENTATION_REVIEW: approved TSPEC, approved PLAN, approved PROPERTIES. (8) Review phases: document under review + source requirements. | WHO: As the orchestrator GIVEN: the context document matrix is defined in code WHEN: any phase requires context assembly THEN: exactly the documents listed for that phase are included, no more and no fewer | P0 | 1 | [US-18] | [REQ-CA-01] |
| REQ-CA-03 | Revision context includes feedback | When an agent is invoked for a revision (returning from review rejection), the context must include the cross-review files that triggered the rejection in addition to the standard creation-phase context. | WHO: As the orchestrator GIVEN: a feature is re-entering `REQ_CREATION` after rejection in `REQ_REVIEW` WHEN: context is assembled for the PM THEN: the context includes overview.md (standard for REQ_CREATION) PLUS all CROSS-REVIEW files from the failed review round | P0 | 1 | [US-16] | [REQ-RT-07], [REQ-CA-02] |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-SM-NF-01 | State transition latency | State transitions (phase changes, reviewer status updates) must complete within 100ms, excluding agent invocation time. State persistence I/O must not block the main event loop. | The orchestrator processes a phase transition and writes state to disk in under 100ms as measured by internal timing. | P1 | 1 |
| REQ-SM-NF-02 | State file integrity | The state file must be written atomically (write to temp file, then rename) to prevent corruption on crash. If the state file is corrupted or unreadable, the orchestrator must log an error and initialize fresh state. | A simulated crash during state write does not corrupt the state file; on next startup, either the previous valid state or fresh state is loaded. | P0 | 1 |
| REQ-SM-NF-03 | Backward compatibility | The orchestrator must continue to support features that started under the old (SKILL.md-driven) PDLC model. Features without a state record are treated as "unmanaged" and processed with the existing routing-signal logic. | A feature started before the state machine was deployed continues to function correctly through completion without manual intervention. | P0 | 1 |
| REQ-SM-NF-04 | Testability | The state machine module must be a pure-function module (no side effects) that can be unit-tested without mocking the orchestrator, Discord, or git. State transitions are computed as `(currentState, event) → newState`. | The state machine can be fully tested with unit tests that provide input state and events and assert output state, without any I/O dependencies. | P0 | 1 |
| REQ-SM-NF-05 | Observability | Every state transition must be logged with: feature slug, from-phase, to-phase, trigger (agent signal, reviewer approval, rejection), and timestamp. Logs must be queryable for debugging feature progress. | State transition logs are written to the standard logger and include all 5 fields listed. A developer can reconstruct the full PDLC timeline for any feature from the logs. | P1 | 1 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Cross-review file format drift — agents may produce cross-review files that don't match the expected format, preventing approval detection. | Medium | High | Define a strict parseable format in SKILL.md; add validation in the orchestrator that flags unparseable cross-reviews and falls back to manual routing. | [REQ-RT-04], [REQ-SA-06] |
| R-02 | FSPEC skip decision is ambiguous — the PM agent may not clearly signal whether FSPEC is needed, leaving the orchestrator uncertain about whether to skip FSPEC phases. | Medium | Medium | Require explicit skip signal from PM (e.g., `LGTM` with metadata `{"skip_fspec": true}`) or use feature configuration to pre-determine FSPEC requirement. | [REQ-SM-04], [REQ-FC-01] |
| R-03 | Migration period inconsistency — during the transition from SKILL.md-driven to orchestrator-driven PDLC, some features may be mid-lifecycle under the old model while new features use the new model. | High | Medium | [REQ-SM-NF-03] ensures backward compatibility. Deploy state machine for new features only; existing features complete under the old model. | [REQ-SM-NF-03] |
| R-04 | State file loss — if the state file is accidentally deleted, all feature progress is lost. | Low | High | Persist state file in a well-known location within the git working tree (optionally committed); add recovery logic that can reconstruct basic state from existing document files on disk. | [REQ-SM-05], [REQ-SM-NF-02] |
| R-05 | Parallel TSPEC/PLAN fork complexity — supporting fork/join for fullstack features adds significant complexity to the state machine. | Medium | Medium | Phase 1 implements sequential TSPEC creation; fork/join is a P1 enhancement if sequential proves too slow. | [REQ-SM-07], [REQ-SM-08] |
| R-06 | Agent confusion during transition — agents with updated SKILL.md may receive messages from features still using the old model, or vice versa. | Medium | High | Version-tag the SKILL.md changes; orchestrator checks feature state to determine whether to use old or new routing logic. | [REQ-SM-NF-03], [REQ-SA-01] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 27 | REQ-SM-01, REQ-SM-02, REQ-SM-03, REQ-SM-05, REQ-SM-06, REQ-SM-07, REQ-SM-08, REQ-SM-09, REQ-RT-01, REQ-RT-02, REQ-RT-03, REQ-RT-04, REQ-RT-05, REQ-RT-06, REQ-RT-07, REQ-AI-01, REQ-AI-02, REQ-AI-03, REQ-AI-04, REQ-FC-01, REQ-FC-02, REQ-FC-04, REQ-FC-05, REQ-SA-01, REQ-SA-02, REQ-SA-03, REQ-SA-04, REQ-SA-05, REQ-SA-06, REQ-CA-01, REQ-CA-02, REQ-CA-03, REQ-SM-NF-02, REQ-SM-NF-03, REQ-SM-NF-04 |
| P1 | 8 | REQ-SM-04, REQ-RT-08, REQ-AI-05, REQ-FC-03, REQ-SM-NF-01, REQ-SM-NF-05 |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 (all) | 35 | All requirements are Phase 1 — this feature is delivered as a single unit |

---

## 9. Scope Boundaries

### In Scope

- PDLC state machine implementation in the orchestrator
- Per-feature state tracking and persistence
- Review tracking with approval/rejection detection
- Orchestrator-driven agent dispatch with task directives
- Feature discipline configuration (backend-only, frontend-only, fullstack)
- SKILL.md simplification (removing PDLC workflow logic)
- Context assembly enhancements for state-aware document selection
- Backward compatibility with features started under the old model
- Revision loops (rejection → creation → re-review)
- Parallel TSPEC/PLAN creation for fullstack features (fork/join)

### Out of Scope

- UI dashboard for PDLC progress visualization (future feature)
- Automated PR creation at the `DONE` phase (separate feature)
- Multi-feature dependency tracking (e.g., feature B depends on feature A)
- PDLC template customization (phases are fixed for now)
- Time-based deadlines or SLAs for review completion
- Notification preferences (all notifications go through existing Discord mechanism)

### Assumptions

- The existing Discord-based communication and notification mechanism is sufficient
- The existing git-based artifact storage model is retained
- Agent SKILL.md files can be updated simultaneously (no gradual rollout needed per skill)

---

## 10. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Product Manager | Initial requirements document — 6 user stories, 35 requirements across 6 domains |

---

*End of Document*
