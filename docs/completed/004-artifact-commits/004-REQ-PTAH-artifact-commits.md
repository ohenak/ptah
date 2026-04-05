# Requirements Document — Phase 4: Artifact Commits

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-PTAH-P4 |
| **Parent Document** | [001-REQ-PTAH](001-REQ-PTAH.md) (Master Requirements) |
| **Version** | 1.0 |
| **Date** | March 10, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Phase** | Phase 4 — Artifact Commits |

---

## 1. Purpose

This document contains the Phase 4 requirements for Ptah v4.0 — the artifact commit pipeline. Phase 4 delivers automatic Git commits for agent-produced artifacts, append-only agent logs, idempotent message processing, and worktree merge/cleanup. This phase ensures every artifact change is version-controlled, attributed, and auditable.

**Phase 4 deliverables:** After a Skill invocation produces or updates `/docs` files, the Orchestrator commits changes with agent attribution, logs the invocation, merges worktree changes, and ensures no message is processed twice.

---

## 2. Related User Stories

Full user story details are in the [master requirements document](001-REQ-PTAH.md).

| User Story | Title | Relevance to Phase 4 |
|------------|-------|-----------------------|
| [US-06] | Agent Produces and Commits Artifacts | Primary user story — artifact commit flow, agent logs, worktree merge |
| [US-07] | System Handles Failures Gracefully | REQ-SI-09 (idempotency) prevents duplicate processing on retries |

---

## 3. Functional Requirements

### 3.1 Skill Invocation (SI) — Artifact Pipeline

#### REQ-SI-05: Commit Artifact Changes

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-05 |
| **Title** | Commit /docs changes with agent attribution |
| **Description** | The Orchestrator shall commit any `/docs` file changes produced by a Skill with the format: `[ptah] {Agent}: {description}`. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill has updated a `/docs` artifact file WHEN: I process the Skill output THEN: I commit the changes with a message following the `[ptah] {Agent}: {description}` format |
| **Priority** | P0 |
| **Phase** | Phase 4 |
| **Source User Stories** | [US-06] |
| **Dependencies** | [REQ-SI-02] |

#### REQ-SI-06: Append Agent Logs

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-06 |
| **Title** | Write timestamped agent log entries |
| **Description** | The Orchestrator shall append a timestamped entry to `agent-logs/{agent}.md` after every Skill invocation. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation has completed WHEN: I finalize the invocation THEN: A timestamped log entry is appended to the appropriate `agent-logs/{agent}.md` file |
| **Priority** | P0 |
| **Phase** | Phase 4 |
| **Source User Stories** | [US-06] |
| **Dependencies** | [REQ-SI-01] |

#### REQ-SI-09: Idempotent Message Processing

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-09 |
| **Title** | Do not re-process already-handled messages |
| **Description** | The Orchestrator shall not re-invoke a Skill for a Discord message it has already processed, tracked by message ID. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: I have already processed a Discord message WHEN: I encounter the same message ID again THEN: I skip processing and do not invoke a Skill |
| **Priority** | P0 |
| **Phase** | Phase 4 |
| **Source User Stories** | [US-06], [US-07] |
| **Dependencies** | [REQ-DI-02] |

#### REQ-SI-13: Worktree Merge and Cleanup

| Field | Detail |
|-------|--------|
| **ID** | REQ-SI-13 |
| **Title** | Merge worktree changes back to main branch and clean up |
| **Description** | After a Skill invocation completes in a worktree, the Orchestrator shall merge the worktree's changes back to the main branch. If the merge succeeds, the worktree is removed. If a merge conflict occurs, the Orchestrator shall post an error embed to the thread, log the conflict to `#agent-debug`, and retain the worktree for manual resolution. Merges are serialized (one at a time) to prevent race conditions. |
| **Acceptance Criteria** | WHO: As the Orchestrator GIVEN: A Skill invocation has completed in a worktree and produced artifact changes WHEN: I merge the changes back THEN: Changes are committed on the worktree branch and merged to main; on success the worktree is removed; on conflict an error embed is posted and the worktree is retained for manual resolution |
| **Priority** | P0 |
| **Phase** | Phase 4 |
| **Source User Stories** | [US-06] |
| **Dependencies** | [REQ-SI-05], [REQ-SI-12] |

---

## 4. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-03 | Idempotency | The Orchestrator shall not re-invoke a Skill for a Discord message it has already processed (tracked by message ID) | Duplicate message IDs produce zero additional Skill invocations | P0 | Phase 4 |
| REQ-NF-05 | Auditability | Every artifact change produces a Git commit; agent-logs record every Skill invocation | Zero artifact changes without a corresponding commit; agent-logs contain entry for every invocation | P0 | Phase 4 |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-06 | Concurrent Orchestrator instances processing the same messages | Low | High | Lock file or process mutex on startup; message-ID deduplication | [REQ-SI-09] |
| R-08 | Merge conflicts when concurrent worktrees modify overlapping `/docs` files | Med | Med | Agents typically work on different feature folders; serialize merges; retain conflicted worktrees for manual resolution | [REQ-SI-13] |

---

## 6. Requirements Summary

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 6 | REQ-SI-05, REQ-SI-06, REQ-SI-09, REQ-SI-13, REQ-NF-03, REQ-NF-05 |
| P1 | 0 | — |

**Specification status:** All 6 requirements have FSPECs in [FSPEC-ptah-artifact-commits](../specifications/004-FSPEC-ptah-artifact-commits.md). TSPECs pending.

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Product Manager | Split from master requirements document (001-REQ-PTAH.md v1.4) |

---

*End of Document*
