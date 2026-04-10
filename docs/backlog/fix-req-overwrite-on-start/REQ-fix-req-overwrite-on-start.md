# Requirements Document

## Fix REQ Overwrite On Workflow Start

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-fix-req-overwrite-on-start |
| **Parent Document** | [REQ-017 Temporal Integration Completion](../../completed/017-temporal-integration-completion/017-REQ-temporal-integration-completion.md) |
| **Version** | 1.0 |
| **Date** | 2026-04-10 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

This document specifies a **bug fix** for a data-loss defect in the Discord-triggered workflow start path introduced by REQ-017 (Temporal Integration Completion). The current orchestrator unconditionally begins new workflows at the `req-creation` phase, which causes the PM agent to overwrite any hand-authored Requirements Document that already exists in the target feature folder.

The fix makes the workflow start phase-aware so existing REQ documents are detected, preserved, and routed into the review cycle instead of regenerated from scratch.

This is intentionally scoped as a minimal, targeted bug fix. Any broader changes to the Discord command surface (new mention identities, new command verbs, backlog bootstrap) are tracked separately in `REQ-orchestrator-discord-commands`.

---

## 2. User Scenarios

### US-01: PM hand-drafts a REQ and routes it through review

| Attribute | Detail |
|-----------|--------|
| **Description** | A product manager drafts a Requirements Document by hand in their editor, commits it to `docs/backlog/<slug>/REQ-<slug>.md` or `docs/in-progress/<slug>/REQ-<slug>.md`, and then posts to the Discord thread for that feature (mentioning an agent such as `@pm`) to start the review cycle. |
| **Goals** | Get the hand-drafted REQ into the workflow with zero modification, run it through the configured reviewers (eng, qa), and continue into FSPEC/TSPEC/PLAN/implementation. |
| **Pain points** | Today, the PM agent regenerates the REQ from `overview.md`, silently destroying the hand-authored file. The PM has no warning and no way to recover their work except via git. |
| **Key needs** | The workflow must detect the existing REQ and start at `req-review`, not `req-creation`. The hand-authored file must not be modified in any way before review begins. |

### US-02: User starts a workflow for a feature that has only an overview

| Attribute | Detail |
|-----------|--------|
| **Description** | A user has created `docs/backlog/<slug>/overview.md` (either manually or via the future backlog-bootstrap flow) but has not yet written a REQ. They post to Discord to kick off the workflow. |
| **Goals** | Have the PM agent generate the REQ from the overview and continue through the full lifecycle. |
| **Pain points** | This is the current happy path and must continue to work unchanged. |
| **Key needs** | When no REQ exists but an overview does, the workflow starts at `req-creation` as today. |

### US-03: User starts a workflow for a feature that does not exist on disk

| Attribute | Detail |
|-----------|--------|
| **Description** | A user posts to Discord mentioning an agent in a thread whose name resolves to a slug for which no feature folder exists in `docs/backlog/` or `docs/in-progress/`. |
| **Goals** | Receive a clear, actionable error message explaining the feature was not found and what to do next. |
| **Pain points** | Today, the workflow starts anyway and runs against an empty context, producing low-quality output and polluting the branch with commits against a non-existent feature. |
| **Key needs** | The orchestrator detects the missing folder, does not start a workflow, and replies in the Discord thread with a specific error. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | `TemporalClient.startFeatureWorkflow` already accepts a `startAtPhase` argument and the `featureLifecycleWorkflow` correctly honors it for the `req-review` phase. | If the workflow cannot actually resume at `req-review` without first running `req-creation`, the fix requires deeper workflow changes and must be escalated. |
| A-02 | REQ files on disk always follow the naming convention `REQ-<slug>.md` in the feature folder (backlog or in-progress), with no other prefix. | If legacy features use different naming, the detection logic must be widened. |
| A-03 | Feature folder resolution (backlog vs in-progress) is already handled by the existing workflow and this fix only needs to read both locations. | If lifecycle promotion moves the REQ mid-start, detection could see a stale state. |
| A-04 | The Discord trigger flow currently routes every new mention-based workflow start through `startNewWorkflow` in `temporal-orchestrator.ts`. | If additional entry points exist, they must receive the same fix. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | The fix must not introduce any new Discord mention identity, command verb, or configuration surface. | User directive: this is a targeted bug fix, not a feature. |
| C-02 | The fix must not modify the PM agent's behavior when it is legitimately asked to create a REQ from an overview. | Preserving US-02 (the current happy path). |
| C-03 | The fix must be testable via an integration test that exercises both real filesystem layouts (overview-only and REQ-present) without requiring a live Temporal server. | Project test-pyramid standards. |
| C-04 | No existing test in the ptah test suite may regress as a result of this change. | Project quality gate. |

---

## 4. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| REQ preservation | Rate of hand-authored REQ files overwritten by workflow start | Manual audit of git history for `REQ-<slug>.md` changes authored by the `pm` agent within the first commit of a workflow run | 100% (current bug) | 0% |
| Phase accuracy | Percentage of Discord-triggered workflow starts that begin at the correct phase given on-disk state | Integration test coverage of both fixtures (overview-only, REQ-present) | 50% (always `req-creation`) | 100% |
| Error clarity | Percentage of "feature not found" starts that produce an actionable Discord reply instead of a failed workflow | Integration test | 0% | 100% |

---

## 5. Functional Requirements

Requirements are grouped by functional domain.

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| PD | Phase Detection |
| WS | Workflow Start |
| ER | Error Reporting |

### 5.1 Phase Detection (PD)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-PD-01 | Detect existing REQ in feature folder | Before starting any new workflow for a slug, the orchestrator must inspect the filesystem to determine whether a Requirements Document already exists. Detection must check both `docs/in-progress/<slug>/REQ-<slug>.md` and `docs/backlog/<slug>/REQ-<slug>.md`, in that order. | WHO: As the orchestrator GIVEN: a Discord trigger resolves to slug `<slug>` WHEN: I prepare to start a new workflow THEN: I check `docs/in-progress/<slug>/REQ-<slug>.md` first and `docs/backlog/<slug>/REQ-<slug>.md` second, and record whether a REQ exists on disk | P0 | 1 | [US-01] | — |
| REQ-PD-02 | Detect existing overview in feature folder | The orchestrator must also determine whether `overview.md` exists in the resolved feature folder. Detection must check both lifecycle locations in the same order as REQ-PD-01. | WHO: As the orchestrator GIVEN: a Discord trigger resolves to slug `<slug>` WHEN: I prepare to start a new workflow THEN: I check `docs/in-progress/<slug>/overview.md` first and `docs/backlog/<slug>/overview.md` second, and record whether an overview exists on disk | P0 | 1 | [US-02], [US-03] | — |
| REQ-PD-03 | Feature folder resolution is deterministic | When a REQ is present in one lifecycle folder and only an overview is present in the other (an inconsistent state), the orchestrator must prefer the `in-progress` location and log a warning. | WHO: As the orchestrator GIVEN: `docs/in-progress/<slug>/REQ-<slug>.md` exists AND `docs/backlog/<slug>/overview.md` also exists WHEN: I resolve the feature folder THEN: I choose `in-progress`, log a warning naming both paths, and proceed using the `in-progress` artifacts | P1 | 1 | [US-01] | [REQ-PD-01], [REQ-PD-02] |
| REQ-PD-04 | No destructive side effects during detection | Phase detection must be read-only. No file may be created, moved, deleted, or modified during detection. | WHO: As the orchestrator GIVEN: a Discord trigger WHEN: I run phase detection THEN: the filesystem is byte-for-byte identical before and after detection | P0 | 1 | [US-01], [US-02], [US-03] | [REQ-PD-01], [REQ-PD-02] |

### 5.2 Workflow Start (WS)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-WS-01 | Start at req-review when REQ exists | When phase detection finds an existing REQ on disk, the orchestrator must start the feature lifecycle workflow at phase `req-review`, passing `startAtPhase: "req-review"` to `TemporalClient.startFeatureWorkflow`. | WHO: As the orchestrator GIVEN: `REQ-<slug>.md` exists on disk for slug `<slug>` WHEN: a Discord trigger requests a new workflow THEN: I call `startFeatureWorkflow` with `startAtPhase: "req-review"` and the workflow begins at that phase | P0 | 1 | [US-01] | [REQ-PD-01] |
| REQ-WS-02 | Start at req-creation when only overview exists | When phase detection finds an overview but no REQ, the orchestrator must start the workflow at phase `req-creation`, matching the current behavior. | WHO: As the orchestrator GIVEN: `overview.md` exists on disk for slug `<slug>` AND no `REQ-<slug>.md` exists WHEN: a Discord trigger requests a new workflow THEN: I call `startFeatureWorkflow` with `startAtPhase: "req-creation"` (or equivalent default) | P0 | 1 | [US-02] | [REQ-PD-01], [REQ-PD-02] |
| REQ-WS-03 | Never invoke req-creation when REQ exists | When the workflow is started at `req-review`, the `req-creation` phase activity must not run under any circumstance. This invariant must be preserved across retries, recovery, and any failure of the review cycle. | WHO: As the orchestrator GIVEN: the workflow was started at `req-review` because a REQ existed WHEN: the workflow executes THEN: the `req-creation` activity is never called and `REQ-<slug>.md` is not written, modified, moved, or deleted by the PM agent | P0 | 1 | [US-01] | [REQ-WS-01] |
| REQ-WS-04 | Preserve workflow continuation semantics | Starting at `req-review` must still route through all subsequent phases (`req-approved`, `fspec-creation`, ..., `done`) using the same configuration as a workflow started at `req-creation`. The only observable difference is the skipped creation activity. | WHO: As the orchestrator GIVEN: a workflow started at `req-review` WHEN: the review phase completes successfully THEN: the workflow transitions to `req-approved` and continues through the remaining phases identically to a workflow that started at `req-creation` | P0 | 1 | [US-01] | [REQ-WS-01] |
| REQ-WS-05 | Preserve existing agent-mention routing | The fix must not alter the existing semantics of agent mentions (`@pm`, `@eng`, `@qa`) for ad-hoc directives against already-running workflows. Only the `startNewWorkflow` path is modified. | WHO: As a user GIVEN: a workflow is already running for slug `<slug>` WHEN: I post `@pm please clarify REQ-DI-01` in the thread THEN: the existing ad-hoc directive routing behaves identically to today | P0 | 1 | [US-01] | — |

### 5.3 Error Reporting (ER)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-ER-01 | Reply when feature folder is missing | When phase detection finds neither an overview nor a REQ for the resolved slug in either lifecycle folder, the orchestrator must not start a workflow and must reply in the invoking Discord thread with an error that names the slug and the expected paths. | WHO: As a user GIVEN: neither `docs/backlog/<slug>/` nor `docs/in-progress/<slug>/` exists WHEN: I post a mention that resolves to slug `<slug>` THEN: the orchestrator posts a reply naming `<slug>` and listing the two expected paths, and does NOT call `startFeatureWorkflow` | P0 | 1 | [US-03] | [REQ-PD-01], [REQ-PD-02] |
| REQ-ER-02 | Log phase detection decision | Every successful phase-detection decision must be logged with the slug, the resolved lifecycle folder, the detected artifacts, and the chosen `startAtPhase`. | WHO: As an operator GIVEN: the orchestrator starts a new workflow WHEN: phase detection completes THEN: a structured log entry contains `slug`, `lifecycle`, `reqPresent`, `overviewPresent`, and `startAtPhase` | P1 | 1 | [US-01], [US-02], [US-03] | [REQ-PD-01], [REQ-PD-02] |
| REQ-ER-03 | Surface infrastructure failures distinctly | If filesystem access fails during phase detection (permissions, I/O error), the orchestrator must not silently fall back to `req-creation`. It must log the error and reply in Discord with a transient error notice so the user knows to retry. | WHO: As a user GIVEN: phase detection cannot read the feature folder due to an I/O error WHEN: I trigger a workflow start THEN: I see a Discord reply indicating a transient error and the workflow is NOT started | P0 | 1 | [US-01] | [REQ-PD-01] |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | Phase detection latency | Phase detection (two filesystem stat calls) must add no more than 50 ms to the workflow-start path on a warm cache. | Integration test asserts detection completes under 50 ms on local disk | P1 | 1 |
| REQ-NF-02 | Test coverage | The fix must be covered by at least one integration test per acceptance scenario: REQ-present → starts at `req-review`; overview-only → starts at `req-creation`; neither → Discord error. | Coverage report shows the three scenarios exercised | P0 | 1 |
| REQ-NF-03 | Backwards compatibility | No public API (Discord message shape, workflow argument shape outside `startAtPhase`, or config file schema) may change as part of this fix. | Existing tests remain green; schema files unchanged | P0 | 1 |
| REQ-NF-04 | Observability | The structured log entry from REQ-ER-02 must be emitted via the existing logger interface, not via `console.log` directly. | Code review check | P1 | 1 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | `featureLifecycleWorkflow` does not actually honor `startAtPhase: "req-review"` correctly and re-runs `req-creation` anyway. | Medium | High | Validate the assumption as the first step of implementation: write the REQ-present integration test before any code changes, confirm it reproduces the bug, and only then implement the fix. | [REQ-WS-01], [REQ-WS-03] |
| R-02 | Inconsistent lifecycle state (REQ in `backlog/`, overview in `in-progress/`) is more common than expected, and the deterministic preference in REQ-PD-03 silently masks migration bugs. | Low | Medium | The warning log in REQ-PD-03 makes the inconsistency discoverable. If support volume indicates the warning is insufficient, escalate to a hard error in a follow-up. | [REQ-PD-03] |
| R-03 | Phase detection races with an in-progress file write from another agent on the same branch. | Low | Low | Discord-triggered workflow starts are serialized per thread by Temporal's workflow-id uniqueness; there is no concurrent writer at start time. | [REQ-PD-04] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 10 | REQ-PD-01, REQ-PD-02, REQ-PD-04, REQ-WS-01, REQ-WS-02, REQ-WS-03, REQ-WS-04, REQ-WS-05, REQ-ER-01, REQ-ER-03, REQ-NF-02, REQ-NF-03 |
| P1 | 4 | REQ-PD-03, REQ-ER-02, REQ-NF-01, REQ-NF-04 |
| P2 | 0 | — |

Note: P0 count of 10 covers the functional requirements; non-functional P0s are counted separately.

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 | 15 | All requirements |

---

## 9. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | TBD | TBD | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-10 | Product Manager | Initial requirements document (split from the combined orchestrator-discord-commands draft, scoped down to the urgent REQ-overwrite bug fix). |

---

*End of Document*
