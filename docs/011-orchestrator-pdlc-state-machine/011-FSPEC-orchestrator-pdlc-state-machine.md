# Functional Specification

## Orchestrator-Driven PDLC State Machine

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-011 |
| **Parent Document** | [011-REQ-orchestrator-pdlc-state-machine](011-REQ-orchestrator-pdlc-state-machine.md) (v1.2, Approved) |
| **Version** | 1.0 |
| **Date** | March 14, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This functional specification defines the behavioral logic for the orchestrator-driven PDLC state machine. It covers the 7 areas of behavioral complexity identified in REQ-011 that require product-level specification before engineering can make implementation decisions. Requirements that are straightforward (configuration defaults, SKILL.md text changes, non-functional constraints) are left to the TSPEC.

---

## 2. FSPEC Index

| ID | Title | Linked Requirements |
|----|-------|---------------------|
| FSPEC-SM-01 | PDLC State Machine Transition Logic | [REQ-SM-01], [REQ-SM-03], [REQ-SM-04], [REQ-SM-07], [REQ-SM-08], [REQ-SM-09], [REQ-SM-11] |
| FSPEC-SM-02 | State Persistence and Recovery | [REQ-SM-05], [REQ-SM-06], [REQ-SM-10], [REQ-SM-NF-02] |
| FSPEC-RT-01 | Cross-Review Approval Detection | [REQ-RT-04] |
| FSPEC-RT-02 | Review Phase Lifecycle | [REQ-RT-01], [REQ-RT-02], [REQ-RT-03], [REQ-RT-05], [REQ-RT-06], [REQ-RT-07], [REQ-RT-09] |
| FSPEC-AI-01 | Orchestrator-Driven Agent Dispatch | [REQ-AI-01], [REQ-AI-02], [REQ-AI-03], [REQ-AI-04], [REQ-AI-05] |
| FSPEC-FC-01 | Reviewer Set Computation | [REQ-FC-01], [REQ-FC-04], [REQ-FC-05] |
| FSPEC-CA-01 | Phase-Aware Context Assembly | [REQ-CA-01], [REQ-CA-02], [REQ-CA-03] |

---

## 3. Functional Specifications

### FSPEC-SM-01: PDLC State Machine Transition Logic

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-SM-01 |
| **Title** | PDLC State Machine Transition Logic |
| **Linked Requirements** | [REQ-SM-01], [REQ-SM-03], [REQ-SM-04], [REQ-SM-07], [REQ-SM-08], [REQ-SM-09], [REQ-SM-11] |

#### Description

The state machine defines 18 phases and the valid transitions between them. It is a pure function: `(currentState, event) → newState`. The orchestrator calls this function and then applies the side effects (persistence, agent dispatch) separately.

#### Behavioral Flow

**Phase enumeration and transition map:**

```
REQ_CREATION ──[LGTM]──► REQ_REVIEW
REQ_REVIEW ──[all_approved]──► REQ_APPROVED
REQ_REVIEW ──[revision_requested]──► REQ_CREATION  (via FSPEC-RT-02)
REQ_APPROVED ──[auto]──► FSPEC_CREATION  (if skipFspec = false)
REQ_APPROVED ──[auto]──► TSPEC_CREATION  (if skipFspec = true, per SM-04)

FSPEC_CREATION ──[LGTM]──► FSPEC_REVIEW
FSPEC_REVIEW ──[all_approved]──► FSPEC_APPROVED
FSPEC_REVIEW ──[revision_requested]──► FSPEC_CREATION
FSPEC_APPROVED ──[auto]──► TSPEC_CREATION

TSPEC_CREATION ──[all_subtasks_complete]──► TSPEC_REVIEW
TSPEC_REVIEW ──[all_approved]──► TSPEC_APPROVED
TSPEC_REVIEW ──[revision_requested]──► TSPEC_CREATION
TSPEC_APPROVED ──[auto]──► PLAN_CREATION

PLAN_CREATION ──[all_subtasks_complete]──► PLAN_REVIEW
PLAN_REVIEW ──[all_approved]──► PLAN_APPROVED
PLAN_REVIEW ──[revision_requested]──► PLAN_CREATION
PLAN_APPROVED ──[auto]──► PROPERTIES_CREATION

PROPERTIES_CREATION ──[LGTM]──► PROPERTIES_REVIEW
PROPERTIES_REVIEW ──[all_approved]──► PROPERTIES_APPROVED
PROPERTIES_REVIEW ──[revision_requested]──► PROPERTIES_CREATION
PROPERTIES_APPROVED ──[auto]──► IMPLEMENTATION

IMPLEMENTATION ──[all_subtasks_complete]──► IMPLEMENTATION_REVIEW
IMPLEMENTATION_REVIEW ──[all_approved]──► DONE

DONE ──(terminal, no transitions)──
```

**Event types:**

| Event | Trigger | Applies to phases |
|-------|---------|-------------------|
| `LGTM` | Agent returns LGTM signal | All `*_CREATION` phases (single-discipline) |
| `all_subtasks_complete` | All fork/join sub-tasks return LGTM + artifact validated | `TSPEC_CREATION`, `PLAN_CREATION`, `IMPLEMENTATION` (fullstack only) |
| `all_approved` | All reviewers have status `approved` | All `*_REVIEW` phases |
| `revision_requested` | Any reviewer has status `revision_requested` | All `*_REVIEW` phases |
| `auto` | Automatic transition after entering an `*_APPROVED` phase | All `*_APPROVED` phases + `REQ_APPROVED` |

**Decision point — REQ_APPROVED branching:**

1. Read `skipFspec` from feature configuration.
2. If `skipFspec === true` → transition to `TSPEC_CREATION`.
3. If `skipFspec === false` (default) → transition to `FSPEC_CREATION`.

**Decision point — fork/join for fullstack features:**

Applies to: `TSPEC_CREATION`, `PLAN_CREATION`, `IMPLEMENTATION`.

1. Read `discipline` from feature configuration.
2. If `discipline === "fullstack"`:
   - Initialize sub-task tracker: `{ eng: "pending", fe: "pending" }`.
   - Dispatch both agents (see FSPEC-AI-01).
   - On each agent's `LGTM` + artifact validation pass: update sub-task to `"complete"`.
   - When ALL sub-tasks are `"complete"`: emit `all_subtasks_complete` event → advance phase.
3. If `discipline === "backend-only"` or `"frontend-only"`:
   - Single agent dispatched. `LGTM` + artifact validation → advance phase directly.

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-SM-01 | Only transitions defined in the transition map are valid. Any other transition attempt must be rejected (return error, no state change). |
| BR-SM-02 | `*_APPROVED` → next creation phase is an automatic (immediate) transition. No agent invocation occurs during the `*_APPROVED` phase itself — it is a transient state. |
| BR-SM-03 | The `DONE` phase is terminal. No events are accepted. Any event targeting a `DONE` feature returns an error. |
| BR-SM-04 | Fork/join sub-task completion requires BOTH `LGTM` signal AND artifact existence on disk. `LGTM` without artifact → re-invoke agent (per REQ-AI-05). |
| BR-SM-05 | The `skipFspec` decision is read from configuration at `REQ_APPROVED` time. It cannot be changed after the feature passes `REQ_APPROVED`. |

#### Edge Cases

| Case | Behavior |
|------|----------|
| Feature already in `DONE` receives an event | Return error: "Feature {slug} is complete. No further transitions allowed." |
| `LGTM` received while in a `*_REVIEW` phase | Ignore — `LGTM` is only valid in `*_CREATION` phases. Log warning. |
| `all_approved` received while in a `*_CREATION` phase | Ignore — `all_approved` is only valid in `*_REVIEW` phases. Log warning. |
| Fork/join: one sub-task completes, other fails after retry | The completed sub-task remains `"complete"`. Only the failed sub-task is retried. The phase does not advance until both are complete. |
| `skipFspec = true` but FSPEC already exists on disk | Skip FSPEC phases anyway — configuration takes precedence over disk state. |

#### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Invalid transition attempted | Return error with current phase, attempted event, and valid events for current phase. No state change. |
| Unknown event type | Return error: "Unknown event type: {type}". No state change. |
| Unknown feature slug | Return error: "No state record for feature: {slug}". |

#### Acceptance Tests

| # | Test | Format |
|---|------|--------|
| AT-SM-01 | WHO: As the orchestrator GIVEN: a feature in `REQ_CREATION` WHEN: LGTM event is received THEN: phase transitions to `REQ_REVIEW` |
| AT-SM-02 | WHO: As the orchestrator GIVEN: a feature in `REQ_APPROVED` with `skipFspec: false` WHEN: auto-transition fires THEN: phase transitions to `FSPEC_CREATION` |
| AT-SM-03 | WHO: As the orchestrator GIVEN: a feature in `REQ_APPROVED` with `skipFspec: true` WHEN: auto-transition fires THEN: phase transitions to `TSPEC_CREATION` |
| AT-SM-04 | WHO: As the orchestrator GIVEN: a fullstack feature in `TSPEC_CREATION` with sub-tasks `{eng: "complete", fe: "pending"}` WHEN: frontend returns LGTM + artifact exists THEN: sub-task updates to `{eng: "complete", fe: "complete"}` and phase transitions to `TSPEC_REVIEW` |
| AT-SM-05 | WHO: As the orchestrator GIVEN: a feature in `DONE` WHEN: any event is received THEN: error is returned and state does not change |
| AT-SM-06 | WHO: As the orchestrator GIVEN: a backend-only feature in `TSPEC_CREATION` WHEN: backend returns LGTM + artifact exists THEN: phase transitions directly to `TSPEC_REVIEW` (no fork/join) |
| AT-SM-07 | WHO: As the orchestrator GIVEN: a feature in `REQ_CREATION` WHEN: `all_approved` event is received THEN: event is ignored, warning logged, state unchanged |

#### Dependencies

- [FSPEC-RT-02] for revision loop transitions
- [FSPEC-FC-01] for discipline-dependent fork/join decisions

---

### FSPEC-SM-02: State Persistence and Recovery

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-SM-02 |
| **Title** | State Persistence and Recovery |
| **Linked Requirements** | [REQ-SM-05], [REQ-SM-06], [REQ-SM-10], [REQ-SM-NF-02] |

#### Description

The orchestrator persists the full PDLC state to a JSON file after every transition and recovers it on startup. The file uses atomic writes for crash safety and includes schema versioning for forward compatibility.

#### Behavioral Flow

**Write path (after every phase transition):**

1. Compute new state via state machine (pure function).
2. Serialize full state (all features) to JSON string.
3. Write JSON to temporary file: `pdlc-state.json.tmp`.
4. Rename temporary file to `pdlc-state.json` (atomic).
5. If rename succeeds → transition complete, return new state to caller.
6. If rename fails → log error, return error to caller. Previous state file is preserved.

**Read path (on startup):**

1. Check if `pdlc-state.json` exists at expected path.
2. If file does not exist → initialize empty state `{ version: CURRENT_VERSION, features: {} }`. Log info: "No state file found. Initializing fresh state."
3. If file exists → read and parse JSON.
4. If JSON parse fails (corrupted file) → log error with file path, initialize fresh state. Log warning: "State file corrupted. Initializing fresh state. Manual recovery may be needed."
5. If JSON parse succeeds → validate schema version field.

**Schema version validation (step 5 continuation):**

6. Read `version` field from parsed state.
7. If `version === CURRENT_VERSION` → load state as-is. Done.
8. If `version < CURRENT_VERSION` (older schema) → attempt migration:
   a. Run migration function chain: `migrate_v1_to_v2(state)`, `migrate_v2_to_v3(state)`, etc.
   b. If migration succeeds → set `version = CURRENT_VERSION`, persist migrated state (using write path), load state.
   c. If migration fails (migration function throws) → log error with original version, target version, and error details. Copy original file to `pdlc-state.json.bak`. Initialize fresh state.
9. If `version > CURRENT_VERSION` (newer schema) → log error: "State file version {version} is newer than supported version {CURRENT_VERSION}. Refusing to load." Initialize fresh state.

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-PS-01 | State is persisted AFTER the state machine computes the new state but BEFORE the transition result is returned to the caller. If persistence fails, the transition is NOT applied (fail-closed). |
| BR-PS-02 | The state file is located at `ptah/state/pdlc-state.json` within the git working tree and excluded via `.gitignore`. |
| BR-PS-03 | Atomic write: temp file + rename. At no point should the state file be in a partial-write state. |
| BR-PS-04 | Schema version is an integer starting at 1. Each structural change to the state format increments the version. |
| BR-PS-05 | Migration is sequential: v1→v2→v3, not v1→v3 directly. Each migration step is a separate function. |
| BR-PS-06 | On migration failure, the original file is always preserved as `.bak` before initializing fresh state. |

#### Edge Cases

| Case | Behavior |
|------|----------|
| `pdlc-state.json.tmp` exists from a previous crash | Overwrite it — it represents an incomplete previous write. |
| `pdlc-state.json.bak` already exists when migration fails | Overwrite it — the most recent backup is more valuable than an older one. |
| State file is empty (0 bytes) | Treat as corrupted → fresh state. |
| State file contains valid JSON but no `version` field | Treat as schema version 0 → attempt migration from v0 if a v0→v1 migration exists, otherwise treat as corrupted. |
| `ptah/state/` directory does not exist | Create it on first write. |

#### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Disk full during temp file write | Write fails, temp file may be partial. Log error. Transition fails (state not updated). Previous state file preserved. |
| Rename fails (permission error) | Log error. Transition fails. Previous state file preserved. Temp file left on disk (overwritten on next attempt). |
| Read permission denied on startup | Log error. Initialize fresh state. |

#### Acceptance Tests

| # | Test | Format |
|---|------|--------|
| AT-PS-01 | WHO: As the orchestrator GIVEN: a phase transition occurs WHEN: state is persisted THEN: `pdlc-state.json` contains the updated state and no `.tmp` file remains |
| AT-PS-02 | WHO: As the orchestrator GIVEN: the orchestrator starts up with a valid state file WHEN: the state is loaded THEN: all features are restored to their persisted phases |
| AT-PS-03 | WHO: As the orchestrator GIVEN: the state file is corrupted (invalid JSON) WHEN: the orchestrator starts up THEN: fresh state is initialized and a warning is logged |
| AT-PS-04 | WHO: As the orchestrator GIVEN: the state file has version 1 and current version is 2 WHEN: the orchestrator starts up THEN: migration runs, state is upgraded to version 2, and migrated state is persisted |
| AT-PS-05 | WHO: As the orchestrator GIVEN: migration from v1 to v2 fails WHEN: the orchestrator starts up THEN: original file is copied to `.bak`, fresh state is initialized, and error is logged with both versions |
| AT-PS-06 | WHO: As the orchestrator GIVEN: the state file has version 3 and current version is 2 WHEN: the orchestrator starts up THEN: error is logged and fresh state is initialized |
| AT-PS-07 | WHO: As the orchestrator GIVEN: no state file exists WHEN: the orchestrator starts up THEN: fresh state is initialized with current version and empty features map |

#### Dependencies

None — this is a foundational FSPEC.

---

### FSPEC-RT-01: Cross-Review Approval Detection

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-RT-01 |
| **Title** | Cross-Review Approval Detection |
| **Linked Requirements** | [REQ-RT-04] |

#### Description

The orchestrator parses cross-review files to detect whether a reviewer approved or requested revisions. This is the critical integration point between agent-produced artifacts and the deterministic state machine.

#### Behavioral Flow

**Step 1 — Locate the cross-review file:**

1. After a reviewer agent completes, determine expected file path: `docs/{NNN}-{feature}/CROSS-REVIEW-{skill-name}-{doc-type}.md`.
2. The skill name is the full skill name (e.g., `backend-engineer`, `test-engineer`, `product-manager`).
3. Derive the reviewer's agent ID from the skill name in the filename:
   - `backend-engineer` → `eng`
   - `frontend-engineer` → `fe`
   - `product-manager` → `pm`
   - `test-engineer` → `qa`

**Step 2 — Read the file:**

4. Attempt to read the file from the feature branch working tree.
5. If file does not exist or is unreadable → **Failure Case 1** (see below).

**Step 3 — Parse the Recommendation field:**

6. Scan the file for a markdown heading containing the word "Recommendation" (case-insensitive). Recognized heading formats: `## Recommendation`, `**Recommendation:**`, `| **Recommendation** |` (table row).
7. If no heading found → **Failure Case 2**.
8. If multiple headings containing "Recommendation" are found → **Failure Case 3** (ambiguous, treated as unparseable).
9. Extract the value following the heading (the text on the same line or the next non-empty line).
10. Normalize: trim whitespace, convert to lowercase.
11. Match against recognized values:
    - Contains `"approved with minor changes"` → `approved`
    - Contains `"approved"` (but not "approved with minor changes") → `approved`
    - Contains `"needs revision"` → `revision_requested`
    - No match → **Failure Case 3**.

**Failure cases:**

| Case | Condition | Behavior |
|------|-----------|----------|
| Failure Case 1 | File missing or unreadable | Reviewer status remains `pending`. Orchestrator pauses feature via `ROUTE_TO_USER`: "Cross-review file not found for reviewer {agent_id}: expected at {path}. Please check if the reviewer committed and pushed." |
| Failure Case 2 | File exists but no Recommendation heading | Reviewer status remains `pending`. Orchestrator pauses via `ROUTE_TO_USER`: "Cross-review file from {agent_id} at {path} does not contain a Recommendation field. Please add a Recommendation heading." |
| Failure Case 3 | Recommendation value unrecognized OR multiple Recommendation headings | Reviewer status remains `pending`. Orchestrator pauses via `ROUTE_TO_USER`: "Could not parse recommendation from {agent_id}'s cross-review at {path}. Found: '{raw_value}'. Expected: 'Approved', 'Approved with minor changes', or 'Needs revision'." |

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-AD-01 | Matching is case-insensitive and whitespace-tolerant. "APPROVED", "approved", "Approved " are all valid. |
| BR-AD-02 | "Approved with minor changes" takes precedence over bare "Approved" when both substrings are present (the longer match wins). |
| BR-AD-03 | Only the FIRST Recommendation heading is used. If multiple exist, the file is treated as unparseable (Failure Case 3). |
| BR-AD-04 | The skill-name-to-agent-ID mapping is hardcoded: `{backend-engineer: "eng", frontend-engineer: "fe", product-manager: "pm", test-engineer: "qa"}`. |
| BR-AD-05 | All failure cases result in `ROUTE_TO_USER` with a specific, actionable error message identifying the reviewer and file. |

#### Edge Cases

| Case | Behavior |
|------|----------|
| Recommendation value is "Approved." (with trailing period) | Normalized to "approved." — contains "approved" → `approved`. |
| Recommendation value is "Approved with minor changes — see F-01" | Contains "approved with minor changes" → `approved`. Extra text after is ignored. |
| File is valid markdown but Recommendation heading is inside a code block | Code blocks should be ignored during heading search. Only top-level headings are parsed. |
| Cross-review file from an unknown skill name (e.g., `CROSS-REVIEW-devops-engineer-REQ.md`) | Unknown skill name cannot be mapped to agent ID → log warning, treat as Failure Case 1. |

#### Acceptance Tests

| # | Test | Format |
|---|------|--------|
| AT-AD-01 | WHO: As the orchestrator GIVEN: a cross-review file with "Recommendation: Approved" WHEN: the file is parsed THEN: the reviewer status is set to `approved` |
| AT-AD-02 | WHO: As the orchestrator GIVEN: a cross-review file with "Recommendation: Approved with minor changes" WHEN: the file is parsed THEN: the reviewer status is set to `approved` |
| AT-AD-03 | WHO: As the orchestrator GIVEN: a cross-review file with "Recommendation: Needs revision" WHEN: the file is parsed THEN: the reviewer status is set to `revision_requested` |
| AT-AD-04 | WHO: As the orchestrator GIVEN: no cross-review file exists at the expected path WHEN: the orchestrator attempts to read it THEN: reviewer status remains `pending` and feature pauses via ROUTE_TO_USER with missing-file message |
| AT-AD-05 | WHO: As the orchestrator GIVEN: a cross-review file with no Recommendation heading WHEN: the file is parsed THEN: reviewer status remains `pending` and feature pauses via ROUTE_TO_USER with missing-heading message |
| AT-AD-06 | WHO: As the orchestrator GIVEN: a cross-review file with "Recommendation: Looks good" (unrecognized) WHEN: the file is parsed THEN: reviewer status remains `pending` and feature pauses via ROUTE_TO_USER with parse-error message |
| AT-AD-07 | WHO: As the orchestrator GIVEN: a cross-review file with "APPROVED" (all caps) WHEN: the file is parsed THEN: the reviewer status is set to `approved` (case-insensitive) |
| AT-AD-08 | WHO: As the orchestrator GIVEN: a cross-review file with two Recommendation headings WHEN: the file is parsed THEN: treated as unparseable, reviewer status remains `pending`, ROUTE_TO_USER |

#### Dependencies

None — this is a leaf FSPEC.

---

### FSPEC-RT-02: Review Phase Lifecycle

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-RT-02 |
| **Title** | Review Phase Lifecycle |
| **Linked Requirements** | [REQ-RT-01], [REQ-RT-02], [REQ-RT-03], [REQ-RT-05], [REQ-RT-06], [REQ-RT-07], [REQ-RT-09] |

#### Description

Defines the complete lifecycle of a review phase: entering the phase, dispatching reviewers, collecting results, advancing on all-approved, and handling revision loops with a bound.

#### Behavioral Flow

**Entering a review phase:**

1. Compute the reviewer manifest for this phase + discipline (see [FSPEC-FC-01]).
2. Initialize per-reviewer status: each reviewer → `pending`.
3. Initialize revision count for this phase (if not already tracked): `revisionCount = 0`.
4. Dispatch review requests to each reviewer sequentially (see [FSPEC-AI-01]).

**Collecting a review result:**

5. When a reviewer agent completes, parse the cross-review file (see [FSPEC-RT-01]).
6. Update the reviewer's status: `pending` → `approved` or `revision_requested`.
7. Evaluate phase outcome:

**Decision — phase outcome evaluation:**

```
IF any reviewer has status "revision_requested":
    → Check revision count (step 8)
ELSE IF all reviewers have status "approved":
    → Advance phase (step 10)
ELSE:
    → Wait for remaining reviewers (some still "pending")
```

**Revision loop (step 8):**

8. Increment `revisionCount` for this phase.
9. Check against bound:
   - If `revisionCount <= 3`: transition back to corresponding creation phase (e.g., `TSPEC_REVIEW` → `TSPEC_CREATION`). Reset all reviewer statuses to `pending`. Invoke author agent with revision context (see [FSPEC-CA-01] revision context).
   - If `revisionCount > 3`: do NOT transition. Pause feature via `ROUTE_TO_USER`: "Review phase {phase} has exceeded the maximum of 3 revision cycles. Reviewer {agent_id} requested revision for the 4th time. Developer intervention required."

**Phase advance (step 10):**

10. All reviewers approved → transition to `*_APPROVED` phase (which auto-transitions to next creation phase per [FSPEC-SM-01]).

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-RL-01 | Revision count is tracked per review phase, not globally. Each review phase (REQ_REVIEW, FSPEC_REVIEW, etc.) has its own counter. |
| BR-RL-02 | The revision count resets to 0 when the phase successfully advances (all-approved). If the same phase is re-entered later (e.g., after TSPEC changes require re-review), the count starts fresh. |
| BR-RL-03 | A single rejection from ANY reviewer triggers the revision loop. The orchestrator does not wait for remaining reviewers. |
| BR-RL-04 | On re-entering a review phase after revision, ALL reviewers must re-review (statuses reset to `pending`), even if some had previously approved. |
| BR-RL-05 | The revision bound (3) applies per phase. A feature could have 3 revisions in REQ_REVIEW AND 3 in TSPEC_REVIEW — these are independent. |

#### Edge Cases

| Case | Behavior |
|------|----------|
| First reviewer approves, second rejects | Phase transitions to creation immediately on second reviewer's rejection. The first reviewer's approval is discarded (will need to re-review). |
| All reviewers approve but one previously rejected (in an earlier revision cycle) | Current cycle's status is what matters. If all show `approved` in the current cycle, phase advances. |
| Revision bound reached but reviewer submits "Approved" on the same cycle | The rejection from another reviewer already triggered escalation. The approval is a race condition — the escalation (ROUTE_TO_USER) takes precedence because the revision_requested status was processed first. |
| Feature is paused (ROUTE_TO_USER) due to revision bound, then developer resumes | Developer response unfreezes the feature. The orchestrator can either: (a) reset the revision count and re-enter review, or (b) force-advance the phase. This is determined by the developer's response content — left to TSPEC to define the resume protocol. |

#### Acceptance Tests

| # | Test | Format |
|---|------|--------|
| AT-RL-01 | WHO: As the orchestrator GIVEN: feature in `REQ_REVIEW` with 2 reviewers, both `approved` WHEN: last approval is recorded THEN: phase transitions to `REQ_APPROVED` |
| AT-RL-02 | WHO: As the orchestrator GIVEN: feature in `TSPEC_REVIEW` with 3 reviewers, first two `approved`, third `revision_requested` WHEN: third review is recorded THEN: phase transitions to `TSPEC_CREATION`, all statuses reset to `pending`, revision count incremented to 1 |
| AT-RL-03 | WHO: As the orchestrator GIVEN: feature in `FSPEC_REVIEW` with revision count at 3 WHEN: a reviewer submits `revision_requested` THEN: phase does NOT transition, feature pauses via ROUTE_TO_USER with escalation message |
| AT-RL-04 | WHO: As the orchestrator GIVEN: feature in `REQ_REVIEW` revision cycle 2 WHEN: all reviewers approve THEN: phase advances to `REQ_APPROVED` and revision count resets |
| AT-RL-05 | WHO: As the orchestrator GIVEN: feature in `PLAN_REVIEW`, first reviewer submits `revision_requested` WHEN: second reviewer has not yet responded THEN: phase transitions immediately to `PLAN_CREATION` without waiting for second reviewer |

#### Dependencies

- [FSPEC-RT-01] for approval detection
- [FSPEC-FC-01] for reviewer manifest computation
- [FSPEC-AI-01] for reviewer dispatch
- [FSPEC-CA-01] for revision context

---

### FSPEC-AI-01: Orchestrator-Driven Agent Dispatch

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-AI-01 |
| **Title** | Orchestrator-Driven Agent Dispatch |
| **Linked Requirements** | [REQ-AI-01], [REQ-AI-02], [REQ-AI-03], [REQ-AI-04], [REQ-AI-05] |

#### Description

The orchestrator determines which agent to invoke based on the current PDLC phase, constructs a task directive, dispatches the agent, and interprets the agent's routing signal to determine the next action.

#### Behavioral Flow

**Step 1 — Determine agent(s) from phase:**

Use the phase-to-agent mapping:

| Phase | Discipline: backend-only | Discipline: frontend-only | Discipline: fullstack |
|-------|--------------------------|---------------------------|----------------------|
| REQ_CREATION | `pm` | `pm` | `pm` |
| FSPEC_CREATION | `pm` | `pm` | `pm` |
| TSPEC_CREATION | `eng` | `fe` | `eng` + `fe` (fork) |
| PLAN_CREATION | `eng` | `fe` | `eng` + `fe` (fork) |
| PROPERTIES_CREATION | `qa` | `qa` | `qa` |
| IMPLEMENTATION | `eng` | `fe` | `eng` + `fe` (fork) |
| IMPLEMENTATION_REVIEW | `qa` | `qa` | `qa` |
| *_REVIEW phases | Reviewer manifest from [FSPEC-FC-01] | — | — |

**Step 2 — Construct task directive:**

Build a Layer 3 (user message) containing:

```
ACTION: {task_type} {document_type}

{task_type} the {document_type} for feature {feature_slug}.

{context_document_references from FSPEC-CA-01}
```

Where:
- `task_type` = "Create" (creation phases), "Review" (review phases), "Revise" (revision after rejection), "Implement" (implementation phase)
- `document_type` = "REQ", "FSPEC", "TSPEC", "PLAN", "PROPERTIES", or empty for implementation

**Step 3 — Dispatch agent:**

Invoke the agent with the constructed context (system prompt + Layer 2 documents + Layer 3 directive).

**Step 4 — Interpret routing signal:**

| Signal | Action |
|--------|--------|
| `LGTM` | Agent completed task successfully. Proceed to artifact validation (step 5), then advance phase. |
| `ROUTE_TO_USER` | Agent needs user input. Pause feature via Pattern B. Store question. Do not advance phase. |
| `TASK_COMPLETE` | Feature is done. Transition to `DONE`. |
| `ROUTE_TO_AGENT` | Ad-hoc coordination. Invoke target agent for one turn. Log warning: "Agent {source} used ROUTE_TO_AGENT to {target} — ad-hoc coordination, PDLC phase unchanged." Do NOT advance phase. After ad-hoc agent responds, re-evaluate. |

**Step 5 — Artifact validation (creation phases only):**

After `LGTM` is received for a creation phase:

1. Determine expected artifact path based on phase and feature:
   - REQ_CREATION → `docs/{NNN}-{feature}/{NNN}-REQ-{feature}.md`
   - FSPEC_CREATION → `docs/{NNN}-{feature}/{NNN}-FSPEC-{feature}.md`
   - TSPEC_CREATION → `docs/{NNN}-{feature}/{NNN}-TSPEC-{feature}.md`
   - PLAN_CREATION → `docs/{NNN}-{feature}/{NNN}-PLAN-TSPEC-{feature}.md`
   - PROPERTIES_CREATION → `docs/{NNN}-{feature}/{NNN}-PROPERTIES-{feature}.md`
   - Review phases → `docs/{NNN}-{feature}/CROSS-REVIEW-{skill}-{doc-type}.md`
2. Check if file exists on disk (in the feature branch working tree).
3. If exists → validation passes. Proceed with phase transition.
4. If missing → re-invoke agent with correction directive: "ACTION: Create {document_type}\n\nThe expected artifact was not found at {path}. Please create the artifact file using the Write tool and commit it."
5. Maximum 2 re-invocation attempts. After 2 failures → pause via ROUTE_TO_USER: "Agent {agent_id} failed to produce artifact at {path} after 3 attempts."

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-DI-01 | The orchestrator never invokes an agent without a task directive. Every invocation has an explicit ACTION line. |
| BR-DI-02 | `ROUTE_TO_AGENT` does NOT change the PDLC phase. It is treated as a side-channel. |
| BR-DI-03 | Artifact validation only applies to creation phases, not review phases (reviews produce cross-review files which are validated by FSPEC-RT-01). |
| BR-DI-04 | For fork/join dispatches, each sub-task agent receives its own task directive specific to its discipline (e.g., "Create backend TSPEC" vs. "Create frontend TSPEC"). |

#### Edge Cases

| Case | Behavior |
|------|----------|
| Agent returns no routing signal at all | Treat as an error. Re-invoke agent once with: "Your previous response did not include a routing signal. Please complete the task and include an LGTM, ROUTE_TO_USER, or TASK_COMPLETE signal." After 1 retry, pause via ROUTE_TO_USER. |
| Agent returns `TASK_COMPLETE` during a non-terminal phase | Log warning. Do NOT transition to DONE. Treat as LGTM (agent may have misinterpreted). |
| Agent returns `LGTM` with extra metadata (e.g., `{"skip_fspec": true}`) | Ignore metadata. The FSPEC skip decision is configuration-only (per REQ-SM-04 / FSPEC-SM-01 BR-SM-05). |

#### Acceptance Tests

| # | Test | Format |
|---|------|--------|
| AT-DI-01 | WHO: As the orchestrator GIVEN: feature in `TSPEC_CREATION` with discipline `backend-only` WHEN: agent dispatch is triggered THEN: agent `eng` is invoked with directive "ACTION: Create TSPEC" |
| AT-DI-02 | WHO: As the orchestrator GIVEN: feature in `TSPEC_CREATION` with discipline `fullstack` WHEN: agent dispatch is triggered THEN: both `eng` and `fe` are invoked with discipline-specific directives |
| AT-DI-03 | WHO: As the orchestrator GIVEN: agent returns `LGTM` for `REQ_CREATION` WHEN: artifact at expected path exists THEN: phase advances to `REQ_REVIEW` |
| AT-DI-04 | WHO: As the orchestrator GIVEN: agent returns `LGTM` for `REQ_CREATION` WHEN: artifact at expected path does NOT exist THEN: agent is re-invoked with correction directive |
| AT-DI-05 | WHO: As the orchestrator GIVEN: agent returns `ROUTE_TO_USER` WHEN: signal is processed THEN: feature is paused, question stored, phase unchanged |
| AT-DI-06 | WHO: As the orchestrator GIVEN: agent returns `ROUTE_TO_AGENT` targeting `qa` WHEN: signal is processed THEN: `qa` is invoked for ad-hoc coordination, warning logged, phase unchanged |

#### Dependencies

- [FSPEC-CA-01] for context construction
- [FSPEC-FC-01] for discipline-dependent dispatch

---

### FSPEC-FC-01: Reviewer Set Computation

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-FC-01 |
| **Title** | Reviewer Set Computation |
| **Linked Requirements** | [REQ-FC-01], [REQ-FC-04], [REQ-FC-05] |

#### Description

Given a review phase and a feature's discipline configuration, compute the exact set of reviewers required. This is a pure function: `(phase, discipline) → reviewerSet`.

#### Behavioral Flow

**Reviewer computation table:**

| Review Phase | backend-only | frontend-only | fullstack |
|-------------|--------------|---------------|-----------|
| REQ_REVIEW | `[eng, qa]` | `[fe, qa]` | `[eng, fe, qa]` |
| FSPEC_REVIEW | `[eng, qa]` | `[fe, qa]` | `[eng, fe, qa]` |
| TSPEC_REVIEW | `[pm, qa]` | `[pm, qa]` | `[pm, qa, fe→be_tspec, eng→fe_tspec]` * |
| PLAN_REVIEW | `[pm, qa]` | `[pm, qa]` | `[pm, qa, fe→be_plan, eng→fe_plan]` * |
| PROPERTIES_REVIEW | `[pm, eng]` | `[pm, fe]` | `[pm, eng, fe]` |
| IMPLEMENTATION_REVIEW | `[qa]` | `[qa]` | `[qa]` |

\* For fullstack TSPEC/PLAN reviews, peer review assignment:
- `fe` reviews the backend TSPEC/PLAN (document authored by `eng`)
- `eng` reviews the frontend TSPEC/PLAN (document authored by `fe`)
- `pm` and `qa` review BOTH documents

**Peer review detail for fullstack TSPEC_REVIEW/PLAN_REVIEW:**

The reviewer set for fullstack TSPEC/PLAN is actually a set of `(reviewer, document)` pairs:

| Reviewer | Reviews |
|----------|---------|
| `pm` | Backend TSPEC AND Frontend TSPEC |
| `qa` | Backend TSPEC AND Frontend TSPEC |
| `fe` | Backend TSPEC only (peer review) |
| `eng` | Frontend TSPEC only (peer review) |

Each reviewer produces one cross-review file per document reviewed. The phase advances only when ALL reviewer-document pairs have `approved` status.

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-RC-01 | The computation is deterministic: same (phase, discipline) always produces the same reviewer set. |
| BR-RC-02 | For single-discipline features (backend-only, frontend-only), the authoring agent is NEVER in its own reviewer set. `eng` does not review `eng`'s TSPEC. |
| BR-RC-03 | For fullstack TSPEC/PLAN review, the total number of cross-review files expected is: (reviewers who review both × 2) + (peer reviewers × 1). For the table above: pm(2) + qa(2) + fe(1) + eng(1) = 6 cross-review files. |
| BR-RC-04 | `IMPLEMENTATION_REVIEW` always has exactly one reviewer (`qa`) regardless of discipline. |

#### Edge Cases

| Case | Behavior |
|------|----------|
| Unknown discipline value | Return error: "Unknown discipline: {value}. Expected: backend-only, frontend-only, or fullstack." |
| Unknown review phase (e.g., `IMPLEMENTATION` which is not a review phase) | Return error: "Phase {phase} is not a review phase. Cannot compute reviewer set." |

#### Acceptance Tests

| # | Test | Format |
|---|------|--------|
| AT-RC-01 | WHO: As the orchestrator GIVEN: phase `REQ_REVIEW` and discipline `backend-only` WHEN: reviewer set is computed THEN: result is `[eng, qa]` |
| AT-RC-02 | WHO: As the orchestrator GIVEN: phase `REQ_REVIEW` and discipline `fullstack` WHEN: reviewer set is computed THEN: result is `[eng, fe, qa]` |
| AT-RC-03 | WHO: As the orchestrator GIVEN: phase `TSPEC_REVIEW` and discipline `fullstack` WHEN: reviewer set is computed THEN: result includes `pm` (reviews both), `qa` (reviews both), `fe` (reviews backend only), `eng` (reviews frontend only) |
| AT-RC-04 | WHO: As the orchestrator GIVEN: phase `PROPERTIES_REVIEW` and discipline `frontend-only` WHEN: reviewer set is computed THEN: result is `[pm, fe]` |
| AT-RC-05 | WHO: As the orchestrator GIVEN: phase `IMPLEMENTATION_REVIEW` and discipline `fullstack` WHEN: reviewer set is computed THEN: result is `[qa]` |

#### Dependencies

None — this is a pure lookup function.

---

### FSPEC-CA-01: Phase-Aware Context Assembly

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-CA-01 |
| **Title** | Phase-Aware Context Assembly |
| **Linked Requirements** | [REQ-CA-01], [REQ-CA-02], [REQ-CA-03] |

#### Description

Given the current PDLC phase and feature state, determine exactly which documents to include in the agent's context. This replaces the current approach where the context assembler reads all feature documents and token-budgets them.

#### Behavioral Flow

**Context document matrix (creation phases):**

| Phase | Documents |
|-------|-----------|
| REQ_CREATION | overview.md |
| FSPEC_CREATION | overview.md, approved REQ |
| TSPEC_CREATION | overview.md, approved REQ, approved FSPEC (if exists) |
| PLAN_CREATION | overview.md, approved TSPEC |
| PROPERTIES_CREATION | overview.md, approved REQ, approved FSPEC (if exists), approved TSPEC, approved PLAN |
| IMPLEMENTATION | approved TSPEC, approved PLAN, approved PROPERTIES |
| IMPLEMENTATION_REVIEW | approved TSPEC, approved PLAN, approved PROPERTIES |

**Context document matrix (review phases):**

| Phase | Documents |
|-------|-----------|
| REQ_REVIEW | REQ under review, overview.md |
| FSPEC_REVIEW | FSPEC under review, approved REQ |
| TSPEC_REVIEW | TSPEC under review, approved REQ, approved FSPEC (if exists) |
| PLAN_REVIEW | PLAN under review, approved TSPEC |
| PROPERTIES_REVIEW | PROPERTIES under review, approved REQ, approved TSPEC, approved PLAN |

**Revision context augmentation:**

When an agent is invoked for a revision (phase transitioned from `*_REVIEW` back to `*_CREATION` due to rejection):

1. Start with the standard creation-phase document set from the matrix above.
2. Add ALL cross-review files from the failed review round. These are the files that triggered the rejection and any other reviews from the same round.
3. The task directive (Layer 3) includes: "ACTION: Revise {document_type}\n\nAddress the revision feedback from the review round. Cross-review files are included in your context."

**Document path resolution:**

For each document in the matrix, resolve the path:
- `overview.md` → `docs/{NNN}-{feature}/overview.md`
- `approved REQ` → `docs/{NNN}-{feature}/{NNN}-REQ-{feature}.md`
- `approved FSPEC` → `docs/{NNN}-{feature}/{NNN}-FSPEC-{feature}.md`
- `approved TSPEC` → `docs/{NNN}-{feature}/{NNN}-TSPEC-{feature}.md`
- `approved PLAN` → `docs/{NNN}-{feature}/{NNN}-PLAN-TSPEC-{feature}.md`
- `approved PROPERTIES` → `docs/{NNN}-{feature}/{NNN}-PROPERTIES-{feature}.md`
- Cross-review files → `docs/{NNN}-{feature}/CROSS-REVIEW-*.md` (glob for all from the review round)

#### Business Rules

| Rule | Description |
|------|-------------|
| BR-CA-01 | The context matrix is exhaustive — exactly the listed documents are included, no more. Agents should not receive unrelated documents. |
| BR-CA-02 | "approved FSPEC (if exists)" means: include the FSPEC only if `skipFspec === false` and the FSPEC file exists. If `skipFspec === true`, do not include it. |
| BR-CA-03 | Revision context is additive — the standard creation-phase context PLUS the cross-review files. |
| BR-CA-04 | For fullstack TSPEC/PLAN creation, each engineer receives only their own discipline's prerequisite documents. The backend engineer does not receive the frontend TSPEC and vice versa. |
| BR-CA-05 | The existing token budget enforcement ([REQ-CB-05]) still applies. If the total context exceeds the budget, Layer 2 documents are omitted with preference for keeping the most recent/relevant documents (the document under review or revision is never omitted). |

#### Edge Cases

| Case | Behavior |
|------|----------|
| FSPEC is listed in context but file does not exist (skipFspec was false but FSPEC was never created — should not happen with valid state machine) | Log warning. Proceed without FSPEC in context. |
| Revision context: no cross-review files found from the failed review round | Log warning. Proceed with standard creation-phase context only. The agent won't have feedback to address, but the revision directive still instructs them to re-examine. |
| Multiple revision rounds: should context include cross-reviews from ALL previous rounds or only the latest? | Only the latest review round's cross-review files. Previous rounds' files are superseded. |

#### Acceptance Tests

| # | Test | Format |
|---|------|--------|
| AT-CA-01 | WHO: As the orchestrator GIVEN: feature in `TSPEC_CREATION` with FSPEC existing WHEN: context is assembled THEN: context includes overview.md, approved REQ, and approved FSPEC |
| AT-CA-02 | WHO: As the orchestrator GIVEN: feature in `TSPEC_CREATION` with `skipFspec: true` WHEN: context is assembled THEN: context includes overview.md and approved REQ, but NOT FSPEC |
| AT-CA-03 | WHO: As the orchestrator GIVEN: feature re-entering `REQ_CREATION` after rejection WHEN: context is assembled THEN: context includes overview.md (standard) PLUS all CROSS-REVIEW-*-REQ.md files from the failed review round |
| AT-CA-04 | WHO: As the orchestrator GIVEN: feature in `PROPERTIES_REVIEW` WHEN: context is assembled THEN: context includes PROPERTIES under review, approved REQ, approved TSPEC, and approved PLAN |
| AT-CA-05 | WHO: As the orchestrator GIVEN: feature in `IMPLEMENTATION` WHEN: context is assembled THEN: context includes approved TSPEC, approved PLAN, and approved PROPERTIES — but NOT overview.md or REQ |

#### Dependencies

None — this is a lookup function with revision context augmentation.

---

## 4. Requirements NOT Requiring FSPEC

The following requirements are straightforward and do not need behavioral specification. They will be addressed directly in the TSPEC:

| Requirement | Reason |
|-------------|--------|
| REQ-SM-02 | Data model definition — no branching logic |
| REQ-RT-08 | P1 sequential dispatch — simple iteration |
| REQ-FC-02 | Configuration setting at creation time — trivial |
| REQ-FC-03 | Default discipline value — one-line rule |
| REQ-SA-01 through REQ-SA-06 | SKILL.md text changes — documentation, not code behavior |
| REQ-SM-NF-01 | Performance constraint — testable but no behavioral flow |
| REQ-SM-NF-03 | Backward compatibility — routing logic branch, but the behavior is "do what we already do" |
| REQ-SM-NF-04 | Testability constraint — architectural, not behavioral |
| REQ-SM-NF-05 | Logging — straightforward structured logging |

---

## 5. Open Questions

None — all questions were resolved during REQ review (backend-engineer Q-01 through Q-04, test-engineer Q-01 through Q-03).

---

## 6. Quality Checklist

- [x] Every FSPEC has a unique ID following `FSPEC-{DOMAIN}-{NUMBER}`
- [x] Every FSPEC links to at least one requirement (`REQ-XX-XX`)
- [x] Behavioral flows cover all decision branches
- [x] Business rules are explicit and testable
- [x] Edge cases and error scenarios are documented
- [x] Acceptance tests are in Who/Given/When/Then format
- [x] No technical implementation details are prescribed
- [x] Open questions are flagged clearly for user review
- [x] Document status is set

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Product Manager | Initial FSPEC — 7 functional specifications covering state machine transitions, persistence/recovery, approval detection, review lifecycle, agent dispatch, reviewer computation, and context assembly. |

---

*End of Document*
