# Traceability Matrix

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Date** | March 10, 2026 |
| **Version** | 1.5 |
| **Status** | Draft |

---

## 1. Purpose

This matrix provides full traceability from user scenarios through requirements to specifications. It ensures:

- Every user scenario has at least one requirement addressing it
- Every requirement traces back to a user scenario (no orphaned requirements)
- Every requirement has at least one specification defining how it will be built (pending Phase 3 — Specification Definition)
- No gaps exist in the chain from user need to implementation specification

---

## 2. Full Traceability: User Scenario → Requirement → Specification

| User Scenario | Requirement | Specification | Priority | Phase | Status |
|---------------|-------------|---------------|----------|-------|--------|
| [US-01] | [REQ-IN-01] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-02] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-03] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-04] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-05] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-06] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-07] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-08] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-02], [US-04] | [REQ-DI-01] | Pending Spec | P0 | 2 | Pending Spec |
| [US-02], [US-05] | [REQ-DI-02] | Pending Spec | P0 | 2 | Pending Spec |
| [US-02], [US-04] | [REQ-DI-03] | Pending Spec | P0 | 2 | Pending Spec |
| [US-02], [US-05] | [REQ-DI-04] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02] | [REQ-DI-05] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02] | [REQ-DI-06] | Pending Spec | P1 | 7 | Pending Spec |
| [US-03] | [REQ-DI-07] | Pending Spec | P0 | 5 | Pending Spec |
| [US-02], [US-07] | [REQ-DI-08] | Pending Spec | P0 | 6 | Pending Spec |
| [US-02], [US-04] | [REQ-DI-09] | [FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-01] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-02] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-03] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-04] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-05] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-06] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P1 | 3 | FSPEC Complete |
| [US-02], [US-04] | [REQ-RP-01] | [FSPEC-RP-02](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-03], [US-04] | [REQ-RP-02] | Pending Spec | P0 | 5 | Pending Spec |
| [US-02], [US-04] | [REQ-RP-03] | [FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02] | [REQ-RP-04] | [FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02], [US-07] | [REQ-RP-05] | Pending Spec | P0 | 6 | Pending Spec |
| [US-03] | [REQ-PQ-01] | Pending Spec | P0 | 5 | Pending Spec |
| [US-03] | [REQ-PQ-02] | Pending Spec | P0 | 5 | Pending Spec |
| [US-03] | [REQ-PQ-03] | Pending Spec | P0 | 5 | Pending Spec |
| [US-03] | [REQ-PQ-04] | Pending Spec | P0 | 5 | Pending Spec |
| [US-03] | [REQ-PQ-05] | Pending Spec | P0 | 5 | Pending Spec |
| [US-04], [US-06] | [REQ-SI-01] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-06] | [REQ-SI-02] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02] | [REQ-SI-03] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02], [US-03] | [REQ-SI-04] | [FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-06] | [REQ-SI-05] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-06] | [REQ-SI-06] | [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-07] | [REQ-SI-07] | Pending Spec | P0 | 6 | Pending Spec |
| [US-07] | [REQ-SI-08] | Pending Spec | P0 | 6 | Pending Spec |
| [US-06], [US-07] | [REQ-SI-09] | [FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-05], [US-07] | [REQ-SI-10] | Pending Spec | P0 | 6 | Pending Spec |
| [US-02], [US-04], [US-06] | [REQ-SI-11] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04], [US-06] | [REQ-SI-12] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-06] | [REQ-SI-13] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-04] | [REQ-NF-01] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-07] | [REQ-NF-02] | Pending Spec | P0 | 6 | Pending Spec |
| [US-06] | [REQ-NF-03] | [FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-04] | [REQ-NF-04] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-06] | [REQ-NF-05] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md), [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-01], [US-05] | [REQ-NF-06] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-04], [US-06] | [REQ-NF-07] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-08] | [REQ-NF-08] | Pending Spec | P1 | 7 | Pending Spec |

---

## 3. Coverage Analysis

### 3.1 User Scenario Coverage

| User Scenario | Title | Requirement Count | Fully Specified? |
|---------------|-------|-------------------|------------------|
| [US-01] | Developer Bootstraps Ptah in an Existing Repository | 9 | Yes (9 of 9 specified) |
| [US-02] | Orchestrator Coordinates Agent-to-Agent Review | 14 | Partial (8 of 14 FSPEC'd — Phase 3 requirements) |
| [US-03] | Agent Asks User a Blocking Question | 8 | Partial (1 of 8 FSPEC'd — REQ-SI-04) |
| [US-04] | Orchestrator Assembles Context for Stateless Skill Invocation | 17 | Partial (15 of 17 FSPEC'd — Phase 3 requirements) |
| [US-05] | Developer Launches and Monitors the Orchestrator | 5 | Partial (1 of 5 FSPEC'd — REQ-DI-04) |
| [US-06] | Agent Produces and Commits Artifacts | 11 | Partial (10 of 11 FSPEC'd — Phase 3 + Phase 4 requirements) |
| [US-07] | System Handles Failures Gracefully | 7 | Partial (1 of 7 FSPEC'd — REQ-SI-09 in Phase 4) |
| [US-08] | New Agent is Added to the System | 1 | No (0 of 1 specified) |

### 3.2 Requirement Coverage

| Requirement | Title | Specification Count | Status |
|-------------|-------|---------------------|--------|
| [REQ-IN-01] | Create /docs folder structure | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-02] | Seed markdown templates | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-03] | Create docs/overview.md | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-04] | Generate configuration file with defaults | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-05] | Detect and skip existing files | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-06] | Commit scaffolded structure | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-07] | Create ptah/ runtime directory with placeholder Skills | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-08] | Pre-create agent log files and open-questions files | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-DI-01] | Orchestrator owns all Discord I/O | 0 | Pending |
| [REQ-DI-02] | Watch #agent-updates threads | 0 | Pending |
| [REQ-DI-03] | Read full thread history | 0 | Pending |
| [REQ-DI-04] | Post colour-coded embeds | 1 | FSPEC'd ([FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-DI-05] | Create one thread per coordination task | 1 | FSPEC'd ([FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-DI-06] | Archive threads on resolution signal | 0 | Pending |
| [REQ-DI-07] | @mention user in #open-questions | 0 | Pending |
| [REQ-DI-08] | Post system message at max-turns limit | 0 | Pending |
| [REQ-DI-09] | Route by routing signal only | 1 | FSPEC'd ([FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-01] | Three-layer context model | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-02] | Layer 1 and Layer 3 never truncated | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-03] | Fresh artifact reads | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-04] | Scope Layer 2 to current feature | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-05] | Token budget enforcement | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-06] | Task splitting on budget overflow | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-RP-01] | Pattern A — Agent-to-agent answer | 1 | FSPEC'd ([FSPEC-RP-02](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-RP-02] | Pattern B — User answer resume | 0 | Pending |
| [REQ-RP-03] | Pattern C — Review loop | 1 | FSPEC'd ([FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-RP-04] | Final review instruction at Turn 3 | 1 | FSPEC'd ([FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-RP-05] | Block fifth turn in review threads | 0 | Pending |
| [REQ-PQ-01] | Write to pending.md | 0 | Pending |
| [REQ-PQ-02] | Poll pending.md | 0 | Pending |
| [REQ-PQ-03] | Resume on user answer | 0 | Pending |
| [REQ-PQ-04] | Archive to resolved.md | 0 | Pending |
| [REQ-PQ-05] | Discord reply writeback to pending.md | 0 | Pending |
| [REQ-SI-01] | Stateless Skill invocation | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-02] | Skill output format | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-03] | Two-iteration rule in Skill prompts | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-04] | Structured routing signal | 1 | FSPEC'd ([FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-05] | Commit artifact changes | 1 | FSPEC'd ([FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-SI-06] | Append agent logs | 1 | FSPEC'd ([FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-SI-07] | Retry with exponential backoff | 0 | Pending |
| [REQ-SI-08] | Graceful failure handling | 0 | Pending |
| [REQ-SI-09] | Idempotent message processing | 1 | FSPEC'd ([FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-SI-10] | Graceful shutdown | 0 | Pending |
| [REQ-SI-11] | Concurrent Skill invocations | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-12] | Per-agent worktree isolation | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-13] | Worktree merge and cleanup | 1 | FSPEC'd ([FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-NF-01] | Response latency | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-NF-02] | Reliability | 0 | Pending |
| [REQ-NF-03] | Idempotency | 1 | FSPEC'd ([FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-NF-04] | Token efficiency | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-NF-05] | Auditability | 2 | FSPEC'd ([FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md), [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-NF-06] | Security | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-NF-07] | Portability | 1 | FSPEC'd ([FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-NF-08] | Extensibility | 0 | Pending |

### 3.3 Orphan Check

**Orphaned user scenarios** (no requirements):
- None

**Orphaned requirements** (no user scenario):
- None

**Unspecified requirements** (no specification):
- 18 of 54 requirements are pending specification (Phase 1: 9 TSPEC'd; Phase 3: 21 FSPEC'd; Phase 4: 6 FSPEC'd; Phases 2, 5-7: 18 pending)

---

## 4. Phase View

### Phase 1 — Init

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-IN-01] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-02] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-03] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-04] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-05] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-06] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-07] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-08] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-NF-06] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01], [US-05] |

### Phase 2 — Discord Bot

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-DI-01] | Pending | P0 | [US-02], [US-04] |
| [REQ-DI-02] | Pending | P0 | [US-02], [US-05] |
| [REQ-DI-03] | Pending | P0 | [US-02], [US-04] |

### Phase 3 — Skill Routing

| Requirement | FSPEC | Specification | Priority | User Scenarios |
|-------------|-------|---------------|----------|----------------|
| [REQ-DI-04] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-05] |
| [REQ-DI-05] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02] |
| [REQ-DI-09] | [FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-04] |
| [REQ-CB-01] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-02] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-03] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-04] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-05] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-06] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P1 | [US-04] |
| [REQ-RP-01] | [FSPEC-RP-02](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-04] |
| [REQ-RP-03] | [FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-04] |
| [REQ-RP-04] | [FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02] |
| [REQ-SI-01] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04], [US-06] |
| [REQ-SI-02] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-SI-03] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02] |
| [REQ-SI-04] | [FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-03] |
| [REQ-SI-11] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-04], [US-06] |
| [REQ-SI-12] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04], [US-06] |
| [REQ-NF-01] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-NF-04] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-NF-07] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04], [US-06] |

### Phase 4 — Artifact Commits

| Requirement | FSPEC | Specification | Priority | User Scenarios |
|-------------|-------|---------------|----------|----------------|
| [REQ-SI-05] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-SI-06] | [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-SI-09] | [FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06], [US-07] |
| [REQ-SI-13] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-NF-03] | [FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-NF-05] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md), [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |

### Phase 5 — User Questions

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-DI-07] | Pending | P0 | [US-03] |
| [REQ-RP-02] | Pending | P0 | [US-03], [US-04] |
| [REQ-PQ-01] | Pending | P0 | [US-03] |
| [REQ-PQ-02] | Pending | P0 | [US-03] |
| [REQ-PQ-03] | Pending | P0 | [US-03] |
| [REQ-PQ-04] | Pending | P0 | [US-03] |
| [REQ-PQ-05] | Pending | P0 | [US-03] |

### Phase 6 — Guardrails

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-DI-08] | Pending | P0 | [US-02], [US-07] |
| [REQ-RP-05] | Pending | P0 | [US-02], [US-07] |
| [REQ-SI-07] | Pending | P0 | [US-07] |
| [REQ-SI-08] | Pending | P0 | [US-07] |
| [REQ-SI-10] | Pending | P0 | [US-05], [US-07] |
| [REQ-NF-02] | Pending | P0 | [US-07] |

### Phase 7 — Polish

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-DI-06] | Pending | P1 | [US-02] |
| [REQ-NF-08] | Pending | P1 | [US-08] |

---

## 5. Document References

| Document | Location | Description |
|----------|----------|-------------|
| Requirements (Master) | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) | Master requirements index — user stories, scope, assumptions, risks |
| Requirements — Phase 1 | [001-REQ-PTAH-init](../requirements/001-REQ-PTAH-init.md) | Phase 1 (Init) requirements — 9 requirements |
| Requirements — Phase 2 | [002-REQ-PTAH-discord-bot](../requirements/002-REQ-PTAH-discord-bot.md) | Phase 2 (Discord Bot) requirements — 3 requirements |
| Requirements — Phase 3 | [003-REQ-PTAH-skill-routing](../requirements/003-REQ-PTAH-skill-routing.md) | Phase 3 (Skill Routing) requirements — 21 requirements |
| Requirements — Phase 4 | [004-REQ-PTAH-artifact-commits](../requirements/004-REQ-PTAH-artifact-commits.md) | Phase 4 (Artifact Commits) requirements — 6 requirements |
| Requirements — Phase 5 | [005-REQ-PTAH-user-questions](../requirements/005-REQ-PTAH-user-questions.md) | Phase 5 (User Questions) requirements — 7 requirements |
| Requirements — Phase 6 | [006-REQ-PTAH-guardrails](../requirements/006-REQ-PTAH-guardrails.md) | Phase 6 (Guardrails) requirements — 6 requirements |
| Requirements — Phase 7 | [007-REQ-PTAH-polish](../requirements/007-REQ-PTAH-polish.md) | Phase 7 (Polish) requirements — 2 requirements |
| TSPEC — ptah init | [001-TSPEC-ptah-init](../specifications/001-TSPEC-ptah-init.md) | Technical specification for Phase 1 (`ptah init`) |
| TSPEC — ptah discord bot | [002-TSPEC-ptah-discord-bot](../specifications/002-TSPEC-ptah-discord-bot.md) | Technical specification for Phase 2 (`ptah start` — Discord Bot) |
| FSPEC — ptah skill routing | [FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) | Functional specification for Phase 3 (Skill Routing) — 6 FSPECs |
| FSPEC — ptah artifact commits | [FSPEC-ptah-artifact-commits](../specifications/004-FSPEC-ptah-artifact-commits.md) | Functional specification for Phase 4 (Artifact Commits) — 3 FSPECs |
| Specifications (Phases 5-7) | Pending | Detailed specifications for remaining phases |
| PRD | [Ptah PRD v4.0](../PTAH_PRD_v4.0.docx) | Product requirements document |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 8, 2026 | Product Manager | Initial traceability matrix — US → REQ mapping complete; SPEC column pending Phase 3 |
| 1.1 | March 8, 2026 | Product Manager | Added 5 new requirements from OQ resolutions: REQ-DI-09, REQ-PQ-05, REQ-SI-11, REQ-SI-12, REQ-SI-13. Updated coverage counts. |
| 1.2 | March 8, 2026 | Product Manager | Added REQ-IN-07 and REQ-IN-08 from ANALYSIS-ptah-init.md question resolutions. US-01 coverage updated from 7 to 9. Total requirements updated from 52 to 54. |
| 1.3 | March 8, 2026 | Backend Engineer | Updated Phase 1 requirements (REQ-IN-01 through REQ-IN-08, REQ-NF-06) to reference TSPEC-ptah-init. 9 of 54 requirements now specified. |
| 1.4 | March 9, 2026 | Product Manager | Added FSPEC mappings for all 21 Phase 3 requirements. 6 FSPECs created: FSPEC-CB-01, FSPEC-RP-01, FSPEC-RP-02, FSPEC-RP-03, FSPEC-SI-01, FSPEC-DI-01. Phase 3 view updated with FSPEC column. Coverage: 9 TSPEC'd + 21 FSPEC'd = 30 of 54 requirements specified. |
| 1.5 | March 10, 2026 | Product Manager | Added FSPEC mappings for all 6 Phase 4 requirements. 3 FSPECs created: FSPEC-AC-01, FSPEC-AC-02, FSPEC-AC-03. Phase 4 view updated with FSPEC column. Coverage: 9 TSPEC'd + 21 Phase 3 FSPEC'd + 6 Phase 4 FSPEC'd = 36 of 54 requirements specified (18 pending). |

---

*End of Document*
