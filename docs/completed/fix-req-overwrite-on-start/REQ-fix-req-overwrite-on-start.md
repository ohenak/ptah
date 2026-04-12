# Requirements Document

## Fix REQ Overwrite On Workflow Start

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-fix-req-overwrite-on-start |
| **Parent Document** | [REQ-017 Temporal Integration Completion](../../completed/017-temporal-integration-completion/017-REQ-temporal-integration-completion.md) |
| **Version** | 3.0 |
| **Date** | 2026-04-10 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

This document specifies a **bug fix** for a data-loss defect in the Discord-triggered workflow start path introduced by REQ-017 (Temporal Integration Completion). The current orchestrator unconditionally begins new workflows at the `req-creation` phase, which causes the PM agent to overwrite any hand-authored Requirements Document that already exists in the target feature folder.

The fix makes the workflow start phase-aware so existing REQ documents are detected, preserved, and routed into the review cycle instead of regenerated from scratch.

This is intentionally scoped as a minimal, targeted bug fix. The scope is restricted to two user scenarios:

1. A REQ already exists → start at `req-review` instead of `req-creation`.
2. Only an overview exists → start at `req-creation` as today (unchanged).

Any broader changes to the Discord command surface (new mention identities, new command verbs, backlog bootstrap, or missing-folder error handling) are tracked separately in `REQ-orchestrator-discord-commands`. In particular, the "feature folder missing" error path (former US-03 / REQ-ER-01) is **out of scope** for this fix to avoid breaking the existing PM skill Phase 0 bootstrap flow, which creates the feature folder during `req-creation` execution.

> **Parent confirmation (Q-03):** REQ-017 (Temporal Integration Completion) is the correct parent. This fix targets the Discord routing layer that REQ-017 formalized via `startNewWorkflow`. REQ-015 introduced the Temporal foundation, but the specific `startNewWorkflow` path with unconditional `req-creation` was formalized in REQ-017.

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
| **Description** | A user has created `docs/backlog/<slug>/overview.md` (either manually or via the PM skill's Phase 0 bootstrap) but has not yet written a REQ. They post to Discord to kick off the workflow. |
| **Goals** | Have the PM agent generate the REQ from the overview and continue through the full lifecycle. |
| **Pain points** | This is the current happy path and must continue to work unchanged. |
| **Key needs** | When no REQ exists but an overview does, the workflow starts at `req-creation` as today. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | `TemporalClient.startFeatureWorkflow` already accepts a `startAtPhase` argument and the `featureLifecycleWorkflow` correctly honors it for the `req-review` phase. | If the workflow cannot actually resume at `req-review` without first running `req-creation`, the fix requires deeper workflow changes and must be escalated. |
| A-02 | REQ files on disk always follow the naming convention `REQ-<slug>.md` in the feature folder (backlog or in-progress), with no other prefix. | If legacy features use different naming, the detection logic must be widened. |
| A-03 | The existing `FeatureResolver` abstraction handles slug-to-folder resolution. The fix introduces a new detection component (e.g., `PhaseDetector`) that checks for REQ and overview file presence independently using `FileSystem`. `FeatureResolver`'s interface and implementation are not modified. | If `FileSystem` cannot be injected into the new component, a new abstraction is needed. |
| A-04 | The Discord trigger flow currently routes every new mention-based workflow start through `startNewWorkflow` in `temporal-orchestrator.ts`. | If additional entry points exist, they must receive the same fix. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | The fix must not introduce any new Discord mention identity, command verb, or configuration surface. | User directive: this is a targeted bug fix, not a feature. |
| C-02 | The fix must not modify the PM agent's behavior when it is legitimately asked to create a REQ from an overview. | Preserving US-02 (the current happy path). |
| C-03 | The fix must be testable via an integration test that exercises both real filesystem layouts (overview-only and REQ-present) without requiring a live Temporal server. | Project test-pyramid standards. |
| C-04 | No existing test in the ptah test suite may regress as a result of this change. | Project quality gate. |
| C-05 | The fix must introduce a new detection component (e.g., `PhaseDetector`) that accepts a `FileSystem` dependency via constructor injection and must not instantiate a filesystem client directly. REQ-file-presence checks must be made independently on each lifecycle folder path (e.g., `FileSystem.exists("docs/in-progress/<slug>/REQ-<slug>.md")`). The `FeatureResolver` interface (`FeatureResolver`) and its concrete implementation (`DefaultFeatureResolver`) must not be modified as part of this fix — `FeatureResolver.resolve()` may optionally be used for directory-existence checks but is not required. | Keeps `FeatureResolver` closed for modification; consistent with the project's dependency injection pattern; prevents unintended interface churn. |

---

## 4. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| REQ preservation | Rate of hand-authored REQ files overwritten by workflow start | Manual audit of git history for `REQ-<slug>.md` changes authored by the `pm` agent within the first commit of a workflow run | 100% (current bug) | 0% |
| Phase accuracy | Percentage of Discord-triggered workflow starts that begin at the correct phase given on-disk state | Integration test coverage of both fixtures (overview-only, REQ-present) | 50% (always `req-creation`) | 100% |

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

**Scope note:** Phase detection is restricted to the **active lifecycle folders** (`docs/in-progress/` and `docs/backlog/`). If a slug resolves only to `docs/completed/<NNN>-<slug>/`, the orchestrator treats it as having no active-lifecycle folder: `reqPresent=false`, `overviewPresent=false`. The existing Temporal workflow-id uniqueness constraint then prevents a duplicate workflow from starting for an already-completed feature. This behavior is intentional and consistent with the "minimal fix" scope.

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-PD-01 | Detect existing REQ in feature folder | Before starting any new workflow for a slug, the orchestrator must inspect the active lifecycle filesystem to determine whether a Requirements Document already exists. Detection must check both `docs/in-progress/<slug>/REQ-<slug>.md` and `docs/backlog/<slug>/REQ-<slug>.md`, in that order. Completed features (`docs/completed/`) are outside this detection scope. A REQ is considered to exist when `REQ-<slug>.md` is present as a non-empty file at the expected path. The TSPEC author may implement this using `FileSystem.exists()` for the practical case; extending the `FileSystem` interface is not required by this REQ. (Edge cases such as a directory named `REQ-<slug>.md` or a zero-byte file at that path are pathological and out of scope.) | WHO: As the orchestrator GIVEN: a Discord trigger resolves to slug `<slug>` WHEN: I prepare to start a new workflow THEN: I check `docs/in-progress/<slug>/REQ-<slug>.md` first and `docs/backlog/<slug>/REQ-<slug>.md` second, record whether a REQ exists at either path, and treat any slug that resolves only to `docs/completed/` as having no REQ | P0 | 1 | [US-01] | — |
| REQ-PD-02 | Detect existing overview in feature folder | The orchestrator must determine whether `overview.md` exists by checking both active lifecycle folders in the same order as REQ-PD-01: `docs/in-progress/<slug>/overview.md` first, then `docs/backlog/<slug>/overview.md`. Completed features are outside this detection scope. An overview is considered to exist when `overview.md` is present as a non-empty file at the expected path. The TSPEC author may implement this using `FileSystem.exists()`; extending the `FileSystem` interface is not required by this REQ. | WHO: As the orchestrator GIVEN: a Discord trigger resolves to slug `<slug>` WHEN: I prepare to start a new workflow THEN: I check `docs/in-progress/<slug>/overview.md` first and `docs/backlog/<slug>/overview.md` second, and record whether an overview exists at either path | P0 | 1 | [US-02] | — |
| REQ-PD-03 | Feature folder resolution is deterministic | When detection finds artifacts in more than one lifecycle folder, or finds a REQ without an accompanying overview, the orchestrator must apply the following exhaustive decision table to choose one resolved folder. A warning is logged for all inconsistent-state cases (A, B, C, H). | See decision table and acceptance criteria below. | P1 | 1 | [US-01] | [REQ-PD-01], [REQ-PD-02] |
| REQ-PD-04 | No destructive side effects during detection | Phase detection must be read-only. No file may be created, moved, deleted, or modified during detection. | WHO: As the orchestrator GIVEN: a Discord trigger WHEN: I run phase detection THEN: the filesystem is byte-for-byte identical before and after detection | P0 | 1 | [US-01], [US-02] | [REQ-PD-01], [REQ-PD-02] |

#### REQ-PD-03: Decision Table

The resolved folder is chosen by scanning in-progress first, then backlog. "REQ" means `REQ-<slug>.md` is present; "overview" means `overview.md` is present; "—" means absent.

| Case | `docs/in-progress/<slug>/` | `docs/backlog/<slug>/` | Resolved Folder | Start Phase | State |
|------|---------------------------|----------------------|-----------------|-------------|-------|
| A | REQ + overview | overview only | `in-progress` | `req-review` | Inconsistent — log warning naming both paths |
| B | overview only | REQ + overview | `backlog` | `req-review` | Inconsistent — log warning naming both paths |
| C | REQ (any) | REQ (any) | `in-progress` | `req-review` | Inconsistent — log warning naming both paths |
| D | — (nothing or empty) | REQ (no overview required) | `backlog` | `req-review` | Normal (PM can hand-draft a REQ without first writing overview) |
| E | overview only | — (nothing) | `in-progress` | `req-creation` | Normal |
| F | — (nothing) | overview only | `backlog` | `req-creation` | Normal |
| G | REQ + overview | — (nothing) | `in-progress` | `req-review` | Normal |
| H | overview only | overview only | `in-progress` | `req-creation` | Mildly inconsistent (duplicate overview) — log warning |

**General resolution rule (covers all cases):** The resolved folder is the first folder (in-progress → backlog order) that contains a REQ. If no REQ is found, the resolved folder is the first folder (in-progress → backlog order) that contains an overview.

**Acceptance criteria for REQ-PD-03:**

WHO: As the orchestrator GIVEN: artifacts exist in more than one lifecycle folder or a REQ exists without an overview WHEN: I resolve the feature folder THEN: I apply the decision table above to choose exactly one resolved folder, for all inconsistent-state cases (A, B, C, H) emit a warning log entry that contains as literal substrings the slug and both the `docs/in-progress/<slug>/` path and the `docs/backlog/<slug>/` path, and proceed using only the artifacts from the resolved folder.

### 5.2 Workflow Start (WS)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-WS-01 | Start at req-review when REQ exists | When phase detection finds an existing REQ on disk, the orchestrator must start the feature lifecycle workflow at phase `req-review`, passing `startAtPhase: "req-review"` to `TemporalClient.startFeatureWorkflow`. | WHO: As the orchestrator GIVEN: `REQ-<slug>.md` exists on disk for slug `<slug>` WHEN: a Discord trigger requests a new workflow THEN: I call `startFeatureWorkflow` with `startAtPhase: "req-review"` and the workflow begins at that phase | P0 | 1 | [US-01] | [REQ-PD-01] |
| REQ-WS-02 | Start at req-creation when only overview exists | When phase detection finds an overview but no REQ, the orchestrator must start the workflow at phase `req-creation`, matching the current behavior. | WHO: As the orchestrator GIVEN: `overview.md` exists on disk for slug `<slug>` AND no `REQ-<slug>.md` exists WHEN: a Discord trigger requests a new workflow THEN: I call `startFeatureWorkflow` with `startAtPhase: "req-creation"` (or equivalent default) | P0 | 1 | [US-02] | [REQ-PD-01], [REQ-PD-02] |
| REQ-WS-03 | Never pass req-creation when REQ exists (orchestrator invariant) | When `startNewWorkflow` detects an existing REQ, the `startAtPhase` argument passed to `TemporalClient.startFeatureWorkflow` must be exactly `"req-review"` and no write operation may be issued against `REQ-<slug>.md` during that call. This invariant is verifiable via a fake `TemporalClient` and fake `FileSystem` in a unit or integration test. | WHO: As the orchestrator GIVEN: `REQ-<slug>.md` exists on disk WHEN: `startNewWorkflow` is called THEN: `startFeatureWorkflow` receives `startAtPhase: "req-review"` AND the fake `FileSystem` records zero write, delete, or rename operations on `REQ-<slug>.md` | P0 | 1 | [US-01] | [REQ-WS-01] |
| REQ-WS-04 | Preserve workflow continuation semantics | Starting at `req-review` must still route through all subsequent phases (`req-approved`, `fspec-creation`, ..., `done`) in the same sequence as a workflow that completed `req-creation`. The only observable difference is that the `req-creation` activity does not appear in the activity sequence. | WHO: As the orchestrator GIVEN: a workflow started at `req-review` WHEN: the review phase completes successfully THEN: the workflow invokes the `req-review` activity first and then the same sequence of activities as a workflow that started at `req-creation` and reached `req-review`, with `req-creation` absent from the sequence | P0 | 1 | [US-01] | [REQ-WS-01] |
| REQ-WS-05 | Preserve existing agent-mention routing | The fix must not alter the existing semantics of agent mentions (`@pm`, `@eng`, `@qa`) for ad-hoc directives against already-running workflows. Only the `startNewWorkflow` path is modified. | WHO: As a user GIVEN: a workflow is already running for slug `<slug>` WHEN: I post `@pm please clarify REQ-DI-01` in the thread THEN: the existing ad-hoc directive routing behaves identically to today | P0 | 1 | [US-01] | — |
| REQ-WS-06 | Workflow definition must not loop back to req-creation (workflow-level invariant) | The workflow execution after starting at `req-review` must never invoke the `req-creation` activity, regardless of retries or failures. This invariant has two distinct testable facets: (a) **Algorithm test** — a unit test of `resolveNextPhase()` with a sequential test `WorkflowConfig` confirms the phase-advancement algorithm never returns a phase earlier in the array than the current phase; (b) **Config integrity test** — a test loading the production `ptah.workflow.yaml` confirms no phase at array index ≥ the index of `req-review` has a `transition` field pointing back to `req-creation`. Both tests must pass. | WHO: As the system GIVEN: a workflow started at `req-review` WHEN: any activity in the workflow completes, fails, or retries THEN: (a) `resolveNextPhase()` given a sequential config never returns a phase index lower than its input phase index; AND (b) the production workflow config contains no `transition` from `req-review` or any later phase to `req-creation` | P0 | 1 | [US-01] | [REQ-WS-03] |

### 5.3 Error Reporting (ER)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-ER-01 | [DEPRECATED] Reply when feature folder is missing | **Deprecated in v1.1.** Removed from scope to avoid breaking the PM skill's Phase 0 bootstrap flow, which creates the feature folder during `req-creation` execution. The missing-folder error path is deferred to `REQ-orchestrator-discord-commands`. When neither REQ nor overview exists for a slug, the orchestrator preserves today's behavior (starts at `req-creation`; the PM skill Phase 0 bootstrap creates the folder and overview). | N/A | — | — | — | — |
| REQ-ER-02 | Log phase detection decision | Every successful phase-detection decision must be logged with the slug, the resolved lifecycle folder, the detected artifacts, and the chosen `startAtPhase`. "Structured" here means key-value pairs embedded in the message string (e.g., `slug=<slug> lifecycle=<lifecycle> reqPresent=<bool> overviewPresent=<bool> startAtPhase=<phase>`). The existing `Logger` interface (string messages only) is sufficient; no interface extension is required. | WHO: As an operator GIVEN: the orchestrator starts a new workflow WHEN: phase detection completes THEN: a log entry is emitted via the existing `Logger` interface (not `console.log`) containing the key-value fields `slug`, `lifecycle`, `reqPresent`, `overviewPresent`, and `startAtPhase` embedded in the message string | P1 | 1 | [US-01], [US-02] | [REQ-PD-01], [REQ-PD-02] |
| REQ-ER-03 | Surface infrastructure failures distinctly | If filesystem access fails during phase detection (permissions, I/O error), the orchestrator must not silently fall back to `req-creation`. It must log the error and reply in the invoking Discord thread (not the parent channel) with a transient error notice so the user knows to retry. | WHO: As a user GIVEN: phase detection cannot read the feature folder due to an I/O error WHEN: I trigger a workflow start THEN: I receive a Discord reply in the invoking thread (not the parent channel) that contains, as literal substrings, the slug and the string `transient error during phase detection`, AND the workflow is NOT started | P0 | 1 | [US-01] | [REQ-PD-01] |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | [DEPRECATED] Phase detection latency | **Deprecated in v2.0.** Wall-clock assertions at 50 ms resolution are structurally flaky in CI, especially on Windows, on shared runners, and under parallel test execution. Two `fs.stat` calls cannot plausibly approach 50 ms on any supported environment, so this NFR has no defensive value and only flakiness risk. Removed. | N/A | — | — |
| REQ-NF-02 | Test coverage | The fix must be covered by at least one test per acceptance scenario. The minimum required test matrix is: (1) REQ present in `in-progress` → starts at `req-review` [REQ-WS-01]; (2) REQ present in `backlog` only → starts at `req-review` [REQ-WS-01]; (3) Overview-only (no REQ) → starts at `req-creation` [REQ-WS-02]; (4) Neither REQ nor overview → starts at `req-creation`, PM Phase 0 bootstrap not disrupted [REQ-WS-02]; (5) Inconsistent state (REQ in backlog, overview in in-progress) → resolves to backlog, warning log contains slug and both paths, starts at `req-review` [REQ-PD-03]; (6) Inconsistent state (REQ in both folders) → resolves to in-progress, warning log contains slug and both paths, starts at `req-review` [REQ-PD-03]; (7) I/O error during detection → Discord reply in invoking thread contains slug and `transient error during phase detection`, workflow NOT started [REQ-ER-03]; (8) Read-only guarantee: zero write/delete/rename operations issued against any file during detection [REQ-PD-04]; (9) Ad-hoc directive against running workflow routes through existing ad-hoc path, not through `startNewWorkflow` [REQ-WS-05]. | Coverage report shows all nine scenarios exercised | P0 | 1 |
| REQ-NF-03 | Backwards compatibility | No public API (Discord message shape, workflow argument shape outside `startAtPhase`, or config file schema) may change as part of this fix. | Existing tests remain green; schema files unchanged | P0 | 1 |
| REQ-NF-04 | Observability | The log entry from REQ-ER-02 must be emitted via the existing `Logger` interface, not via `console.log` directly. | Code review check | P1 | 1 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | `featureLifecycleWorkflow` does not actually honor `startAtPhase: "req-review"` correctly and re-runs `req-creation` anyway. | Medium | High | Verification is deferred to the PLAN phase but must be the **first task** in the PLAN: write the failing integration test that reproduces the bug (REQ-present → confirm req-creation still runs), confirm the test fails, then implement the fix and confirm the test passes. This "test-first" ordering is a PLAN-phase hard requirement, not optional. | [REQ-WS-01], [REQ-WS-03] |
| R-02 | Inconsistent lifecycle state (REQ in `backlog/`, overview in `in-progress/`) is more common than expected, and the deterministic preference in REQ-PD-03 silently masks migration bugs. | Low | Medium | The warning log in REQ-PD-03 makes the inconsistency discoverable. If support volume indicates the warning is insufficient, escalate to a hard error in a follow-up. | [REQ-PD-03] |
| R-03 | Phase detection races with an in-progress file write from another agent on the same branch. | Low | Low | Discord-triggered workflow starts are serialized per thread by Temporal's workflow-id uniqueness; there is no concurrent writer at start time. | [REQ-PD-04] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 12 | REQ-PD-01, REQ-PD-02, REQ-PD-04, REQ-WS-01, REQ-WS-02, REQ-WS-03, REQ-WS-04, REQ-WS-05, REQ-WS-06, REQ-ER-03, REQ-NF-02, REQ-NF-03 |
| P1 | 3 | REQ-PD-03, REQ-ER-02, REQ-NF-04 |
| P2 | 0 | — |
| DEPRECATED | 2 | REQ-ER-01, REQ-NF-01 |

**Total active requirements: 15 (12 P0 + 3 P1). REQ-ER-01 and REQ-NF-01 are deprecated and carry no implementation obligation.**

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 | 15 | All active requirements (REQ-PD-01–04, REQ-WS-01–06, REQ-ER-02–03, REQ-NF-02–04) |

---

## 9. Scope Boundaries

### In Scope

- Phase detection for `docs/in-progress/` and `docs/backlog/` lifecycle folders
- Routing `startNewWorkflow` to `req-review` when a REQ exists on disk
- Exhaustive decision table for cross-lifecycle inconsistency
- Structured (key-value) log entry for each phase-detection decision
- Infrastructure error surfacing to Discord
- Adding one new dependency to `TemporalOrchestratorDeps` to wire in the new detection component (e.g., a `PhaseDetector`). This is expected and is not scope creep — `TemporalOrchestrator` currently has no filesystem access and requires it to perform phase detection.

### Out of Scope

- Missing-folder Discord error (deferred to `REQ-orchestrator-discord-commands`)
- Completed-feature re-start prevention beyond Temporal's built-in workflow-id deduplication
- New Discord command verbs or mention identities
- Any change to the PM agent's `req-creation` behavior
- Logger interface extension (existing string-message interface is sufficient)
- `FileSystem` interface extension (existing `FileSystem.exists()` is sufficient for the practical detection case)
- `FeatureResolver` interface or `DefaultFeatureResolver` implementation modification

### Assumptions

See Section 3.1.

---

## 10. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | TBD | TBD | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-10 | Product Manager | Initial requirements document (split from the combined orchestrator-discord-commands draft, scoped down to the urgent REQ-overwrite bug fix). |
| 1.1 | 2026-04-10 | Product Manager | Addressed engineer cross-review findings. F-01: deprecated REQ-ER-01 and dropped US-03 (missing-folder error deferred to orchestrator-discord-commands). F-02: restricted phase detection scope to active lifecycle folders; completed features fall through to Temporal deduplication. F-03: expanded REQ-PD-03 into exhaustive decision table (Cases A–H). F-04: added constraint C-05 requiring FeatureResolver reuse. F-05: fixed REQ-PD-02 description wording. F-06: corrected P0 count to 11. F-07: clarified REQ-ER-02 "structured" logging. Q-03: confirmed REQ-017 parent. Q-04: updated R-01 mitigation to mandate test-first as first PLAN task. Added explicit scope boundaries (Section 9). |
| 2.0 | 2026-04-10 | Product Manager | Addressed test engineer cross-review findings. TE-F-01: deprecated REQ-NF-01 (latency assertion structurally flaky; wall-clock tests at 50 ms resolution not suitable for CI). TE-F-02: narrowed REQ-WS-04 "identically" to a specific activity-sequence contract; removed the untestable global comparison. TE-F-03: added explicit "exists" definition to REQ-PD-01 and REQ-PD-02 (regular file, size > 0). TE-F-04: split REQ-WS-03 into unit-testable orchestrator invariant (REQ-WS-03) and workflow-definition invariant (new REQ-WS-06). TE-F-05: expanded REQ-NF-02 from 2 scenarios to the full 9-scenario test matrix covering all functional requirements. TE-F-06: pinned REQ-ER-03 Discord reply content as substring contract (slug + `transient error during phase detection`; must be in invoking thread, not parent channel). TE-F-09: pinned REQ-PD-03 warning log content as substring contract (slug + both paths). Updated Section 8 counts to P0=12, P1=3, deprecated=2. |
| 3.0 | 2026-04-10 | Product Manager | Addressed second engineer cross-review findings (v2.0 review). F-01: clarified REQ-PD-01/02 "exists" definition — behavioral intent only; TSPEC may use `FileSystem.exists()`, no interface extension required; pathological edge cases (directory/zero-byte at REQ path) are out of scope. F-02: tightened C-05 — `FeatureResolver` interface and `DefaultFeatureResolver` must not be modified; new detection component must check REQ/overview paths independently via injected `FileSystem`; corrected A-03 to reflect that the fix creates a new component rather than extending `FeatureResolver`. F-03: split REQ-WS-06 AC into two distinct tests: (a) `resolveNextPhase()` algorithm unit test with sequential config; (b) production config integrity test verifying no backward transition to `req-creation`. F-04: added acknowledgment in Scope Boundaries (In Scope) that adding one new dependency to `TemporalOrchestratorDeps` is expected; added `FileSystem` interface extension and `FeatureResolver` modification to Out of Scope. |

---

*End of Document*
