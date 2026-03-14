# Requirements Document: Phase 10 — Parallel Feature Development

| Field | Detail |
|-------|--------|
| **Document ID** | 010-REQ-ptah-parallel-feature-development |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.0 |
| **Date** | March 14, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This document defines the requirements for Phase 10 — Parallel Feature Development. This phase addresses two critical problems in Ptah's current architecture:

1. **No code review gate.** The artifact committer merges agent work directly to `main`, bypassing pull request review entirely. All agent-produced artifacts (docs and code) must go through PR review before reaching `main`.
2. **No parallel agent execution on a feature.** Agent worktrees are ephemeral and per-invocation, making it impossible to run multiple agents concurrently on the same feature (e.g., three backend-engineer agents implementing different PLAN steps, or backend-engineer and test-engineer working simultaneously).

The solution introduces a two-tier branch strategy where agents work on short-lived sub-branches off a persistent `feat-{feature-name}` branch, which is reviewed via PR before merging to `main`.

---

## 2. User Scenarios

### US-10: Developer Reviews Agent Work Before It Reaches Main

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer has Ptah running, orchestrating agents that produce documentation and code. The developer expects all agent output to land on a feature branch that can be reviewed as a pull request before merging to `main`. Currently, agent work is merged directly to `main` with no review gate. |
| **Goals** | Agent-produced artifacts accumulate on a reviewable `feat-{feature-name}` branch. The developer reviews and merges via PR at their discretion. The developer's local `main` checkout is never modified by Ptah agents. |
| **Pain points** | Direct merge to `main` means untested or incorrect agent output immediately contaminates the mainline. There is no opportunity to review, reject, or request changes before merge. The developer's local working directory can be disrupted. |
| **Key needs** | Feature branch as the merge target for all agent work. PR-based review before reaching `main`. Developer's local checkout remains untouched. |

### US-11: Developer Runs Multiple Agents in Parallel on the Same Feature

| Attribute | Detail |
|-----------|--------|
| **Description** | After TSPEC and PLAN documents are approved, the developer wants to spin up 3 backend-engineer agents to implement PLAN steps 1, 2, and 3 simultaneously. Each agent needs its own isolated workspace, but all work must accumulate on the same feature branch so it can be reviewed as a single PR. |
| **Goals** | Multiple agents work concurrently on different parts of the same feature without conflicting with each other. Completed work from each agent is merged onto the shared feature branch incrementally. |
| **Pain points** | Currently, each agent invocation creates an ephemeral worktree with a random branch name (`ptah/{agentId}/{threadId}/{invocationId}`). These branches are not related to the feature and are destroyed after merge to `main`. There is no way to accumulate parallel agent work on a shared feature branch. |
| **Key needs** | Persistent per-feature branch (`feat-{feature-name}`). Per-agent sub-branches that isolate concurrent work. Serialized merge from sub-branches to the feature branch. |

### US-12: Developer Runs Different Agent Types in Parallel on the Same Feature

| Attribute | Detail |
|-----------|--------|
| **Description** | While backend-engineer agents are implementing code from the PLAN, the developer wants a test-engineer agent to work on creating the PROPERTIES document simultaneously. These agents produce different artifact types (code vs. docs) in different directories, so conflicts are unlikely. |
| **Goals** | Backend-engineer and test-engineer agents run concurrently on the same feature. Each has its own worktree branched from the feature branch. Their work merges to the feature branch independently. |
| **Pain points** | The current architecture technically supports concurrent invocations (merge-lock serializes merges), but the merge target is `main` instead of the feature branch. Agents cannot see each other's recently committed work on the feature. |
| **Key needs** | All agent types branch from and merge to the same `feat-{feature-name}` branch. Merge-lock serializes merges to the feature branch to prevent conflicts. Agents working on non-overlapping files merge cleanly. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-10-01 | PLAN steps are designed to touch non-overlapping files, so parallel BE agents will rarely produce merge conflicts | If PLAN steps overlap significantly, merge conflicts will be frequent and require manual resolution. The PLAN authoring guidelines may need to enforce file-level isolation. |
| A-10-02 | The existing merge-lock mechanism can be retargeted from `main` to the feature branch without architectural change | If the merge-lock is tightly coupled to `main`, a new locking mechanism may be needed. |
| A-10-03 | The developer creates the `feat-{feature-name}` branch before starting agent work, or the orchestrator creates it on first invocation | If neither creates it, agents have no merge target. The orchestrator must handle branch creation. |
| A-10-04 | The feature branch name can be derived from the Discord thread name using the same slug convention as Phase 9 (feature folder naming) | If thread names don't map cleanly to branch names, a separate naming convention is needed. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-10-01 | Git worktrees share the same `.git` directory, so all worktrees in the same repo share refs, config, and hooks | Git design — not changeable. Means branch names must be unique across all concurrent worktrees. |
| C-10-02 | Only one worktree can checkout a given branch at a time (git limitation) | Git design — agents cannot share a branch; each needs its own sub-branch. |
| C-10-03 | The existing SKILL.md files instruct agents to `git checkout` and `git push` feature branches directly. These instructions conflict with the orchestrator-managed worktree model. | SKILL.md files must be updated to remove git workflow instructions that conflict with the orchestrator's branch management. |

---

## 4. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| PR review gate | Agent commits that reach `main` without PR review | Git log audit — commits on `main` with `[ptah]` prefix that have no associated merged PR | 100% (all bypass review) | 0% |
| Parallel execution | Number of concurrent agent invocations on the same feature | Orchestrator logs — count overlapping invocation windows per feature | 1 (serial) | 3+ |
| Merge success rate | Agent sub-branch merges to feature branch that succeed without conflict | Orchestrator merge logs — conflict vs. success count | N/A (new flow) | > 95% |

---

## 5. Functional Requirements

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| FB | Feature Branching — persistent per-feature branch lifecycle |
| AB | Agent Branching — per-agent sub-branch isolation |
| MG | Merge Strategy — sub-branch to feature branch merge |
| SK | Skill Alignment — SKILL.md git workflow corrections |

### 5.1 Feature Branching (FB)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-FB-01 | Feature branch creation | The orchestrator must create a `feat-{feature-name}` branch from `main` on the first agent invocation for a feature, if the branch does not already exist. The feature name is derived from the Discord thread name using the same slug convention as Phase 9 ([REQ-AF-04]). | WHO: As the orchestrator GIVEN: A new Discord thread "010-parallel-feature-development — create TSPEC" triggers an agent invocation AND no `feat-parallel-feature-development` branch exists WHEN: The orchestrator prepares the invocation THEN: A `feat-parallel-feature-development` branch is created from `main` AND the agent's sub-branch is created from this feature branch | P0 | 10 | [US-10], [US-11] | [REQ-AF-04] |
| REQ-FB-02 | Feature branch reuse | On subsequent agent invocations for the same feature, the orchestrator must reuse the existing `feat-{feature-name}` branch as the base for new agent sub-branches. It must NOT create a new feature branch or reset the existing one. | WHO: As the orchestrator GIVEN: `feat-parallel-feature-development` already exists with 3 prior agent commits AND a new agent invocation is triggered for this feature WHEN: The orchestrator prepares the invocation THEN: The agent's sub-branch is created from the current HEAD of `feat-parallel-feature-development` AND no existing commits on the feature branch are lost | P0 | 10 | [US-11], [US-12] | [REQ-FB-01] |
| REQ-FB-03 | Feature branch push to remote | After merging an agent's sub-branch into the feature branch, the orchestrator must push the feature branch to the remote (`origin`). This ensures the feature branch is available for PR creation and review. | WHO: As the orchestrator GIVEN: An agent's sub-branch has been successfully merged into `feat-parallel-feature-development` WHEN: The merge completes THEN: `feat-parallel-feature-development` is pushed to `origin` AND the remote branch reflects the merged commit | P0 | 10 | [US-10] | [REQ-MG-01] |
| REQ-FB-04 | No direct merge to main | The orchestrator must NOT merge any agent work directly to `main`. The only path to `main` is via PR merge of the feature branch. The existing `merge()` call targeting `main` in the artifact committer must be replaced. | WHO: As a developer GIVEN: Ptah agents are running and producing artifacts WHEN: Any agent invocation completes THEN: No commits appear on `main` that were not there before the invocation AND all new commits appear on `feat-{feature-name}` | P0 | 10 | [US-10] | — |

### 5.2 Agent Branching (AB)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-AB-01 | Agent sub-branch naming | Each agent invocation must create a worktree on a sub-branch named `feat-{feature-name}/{agentId}/{invocationId}`. This replaces the current `ptah/{agentId}/{threadId}/{invocationId}` naming. The sub-branch must be unique across all concurrent worktrees. | WHO: As the orchestrator GIVEN: A backend-engineer agent is invoked on feature "parallel-feature-development" with invocation ID "a1b2c3d4" WHEN: The worktree is created THEN: The branch name is `feat-parallel-feature-development/eng/a1b2c3d4` AND the worktree is checked out to this branch | P0 | 10 | [US-11], [US-12] | [REQ-FB-01] |
| REQ-AB-02 | Agent sub-branch base | Agent sub-branches must be created from the current HEAD of `feat-{feature-name}`, not from `main`. This ensures agents see the latest accumulated work on the feature branch, including commits from prior agent invocations. | WHO: As the orchestrator GIVEN: `feat-parallel-feature-development` has commits from 2 prior agent invocations AND a third agent is being invoked WHEN: The agent's sub-branch is created THEN: The sub-branch's base commit is the HEAD of `feat-parallel-feature-development` AND the agent's worktree contains all files from prior invocations | P0 | 10 | [US-11], [US-12] | [REQ-FB-02] |
| REQ-AB-03 | Concurrent agent isolation | Multiple agent invocations on the same feature must each have their own worktree and sub-branch. Changes made by one agent must not be visible to another agent's worktree until they are merged to the feature branch. | WHO: As the orchestrator GIVEN: Agent A (backend-engineer) and Agent B (test-engineer) are both invoked on feature "parallel-feature-development" WHEN: Both agents are running concurrently THEN: Agent A's file changes are not visible in Agent B's worktree AND Agent B's file changes are not visible in Agent A's worktree AND each agent has its own sub-branch | P0 | 10 | [US-11], [US-12] | [REQ-AB-01] |
| REQ-AB-04 | Sub-branch cleanup | After an agent's sub-branch is merged to the feature branch (or if the merge fails), the sub-branch and its worktree must be cleaned up. Sub-branches must not accumulate indefinitely. | WHO: As the orchestrator GIVEN: Agent A's sub-branch `feat-parallel-feature-development/eng/a1b2c3d4` has been merged to `feat-parallel-feature-development` WHEN: The merge and push complete THEN: The worktree for the sub-branch is removed AND the sub-branch is deleted AND `git worktree list` no longer shows the worktree | P0 | 10 | [US-11], [US-12] | [REQ-MG-01] |

### 5.3 Merge Strategy (MG)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-MG-01 | Serialized merge to feature branch | Agent sub-branch merges to the feature branch must be serialized using the existing merge-lock mechanism. The merge target is `feat-{feature-name}` instead of `main`. Only one merge may execute at a time per feature branch. | WHO: As the orchestrator GIVEN: Agent A and Agent B both complete work at approximately the same time WHEN: Both attempt to merge their sub-branches to `feat-parallel-feature-development` THEN: One merge executes first, the other waits for the lock AND both merges succeed sequentially AND no race condition corrupts the feature branch | P0 | 10 | [US-11], [US-12] | [REQ-AB-01], [REQ-FB-01] |
| REQ-MG-02 | Merge conflict handling | If a merge from a sub-branch to the feature branch results in a conflict, the orchestrator must abort the merge, retain the worktree for manual resolution, and post a notification to Discord with the conflict details and worktree path. | WHO: As a developer GIVEN: Agent A's sub-branch modifies `ptah/src/services/git.ts` AND Agent B's sub-branch also modifies `ptah/src/services/git.ts` AND Agent A's merge succeeds first WHEN: Agent B's merge is attempted THEN: The merge is aborted AND the worktree is retained at its path AND a Discord message is posted with the conflict details and worktree path for manual resolution | P0 | 10 | [US-11] | [REQ-MG-01] |
| REQ-MG-03 | Feature branch update before merge | Before merging an agent's sub-branch, the orchestrator must ensure the feature branch is up to date with the remote (pull latest). This handles the case where another Ptah instance or a human has pushed commits to the feature branch. | WHO: As the orchestrator GIVEN: The remote `feat-parallel-feature-development` has commits not present locally (e.g., from another Ptah instance or manual push) WHEN: An agent's sub-branch merge is attempted THEN: The local feature branch is updated from remote before the merge AND the merge is attempted against the updated feature branch | P1 | 10 | [US-10], [US-11] | [REQ-MG-01] |

### 5.4 Skill Alignment (SK)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-SK-01 | Remove agent git checkout instructions | SKILL.md files for all agents (PM, BE, FE, QA) currently instruct agents to run `git checkout -b feat-{feature-name}` and `git push origin feat-{feature-name}`. These instructions must be removed or replaced, because the orchestrator manages branch creation and push via worktrees. Agents must not perform their own branch management. | WHO: As a skill agent (PM, BE, FE, or QA) GIVEN: I am invoked in a worktree that is already checked out to my sub-branch WHEN: I read my SKILL.md instructions THEN: There are no instructions telling me to run `git checkout`, `git branch`, or `git push` AND I understand that branch management is handled by the orchestrator | P0 | 10 | [US-10] | — |
| REQ-SK-02 | Agent awareness of worktree context | SKILL.md files must inform agents that they are running in an isolated worktree, that their working directory is the worktree root, and that all file operations are relative to the worktree. Agents must not assume they are in the main repository checkout. | WHO: As a skill agent GIVEN: I am invoked in worktree `/tmp/ptah-worktrees/a1b2c3d4` WHEN: I perform file operations THEN: I use relative paths from my working directory AND I do not attempt to navigate to or modify the main repository checkout | P1 | 10 | [US-10], [US-11] | [REQ-SK-01] |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-PF-NF-01 | Merge latency | The time added by the two-tier merge (sub-branch → feature branch → push) must not exceed 10 seconds per agent completion, excluding network latency for `git push`. | Merge + push completes in < 10 seconds on local operations (measured from merge-lock acquire to push complete, excluding network) | P1 | 10 |
| REQ-PF-NF-02 | Worktree disk usage | Each agent worktree is a full git checkout. The orchestrator must clean up worktrees promptly after merge to avoid unbounded disk usage. At any given time, no more worktrees should exist than there are active agent invocations, plus any retained for conflict resolution. | `git worktree list` count equals active invocation count plus conflict-retained worktrees | P1 | 10 |
| REQ-PF-NF-03 | Backward compatibility | Existing single-agent workflows (one agent at a time per feature) must continue to work without configuration changes. The two-tier branch strategy must be the default behavior, not an opt-in feature. | A single-agent invocation produces the same end result (commits on feature branch, pushed to remote) as it would under the new architecture, with no additional configuration | P0 | 10 |

---

## 7. Scope Boundaries

### 7.1 In Scope

- Replace direct-to-main merge with push-to-feature-branch in artifact committer
- Two-tier branch strategy: `feat-{feature-name}` (persistent) → `feat-{feature-name}/{agentId}/{invocationId}` (ephemeral per-agent)
- Agent sub-branches created from feature branch HEAD (not `main`)
- Merge-lock retargeted to serialize merges to feature branch
- Feature branch pushed to remote after each successful merge
- Sub-branch and worktree cleanup after merge
- SKILL.md updates to remove conflicting git workflow instructions
- Merge conflict detection and developer notification

### 7.2 Out of Scope

- Automatic PR creation (developer creates PR manually or via `gh pr create`)
- PR merge automation (developer merges PR manually)
- Feature branch deletion after PR merge
- Cross-feature dependency management (feature A depends on feature B)
- Orchestrator-level parallelism controls (e.g., max concurrent agents per feature) — this is configuration, not core architecture
- Human developer worktree management (e.g., `ptah feature open` CLI commands) — deferred to a future phase

### 7.3 Assumptions

See Section 3.1.

---

## 8. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-10-01 | Parallel agents modifying the same files produce frequent merge conflicts | Medium | High | PLAN authoring guidelines should enforce file-level isolation between steps. Conflict notification gives developer immediate visibility. | [REQ-MG-02] |
| R-10-02 | Feature branch diverges significantly from `main`, making final PR merge difficult | Medium | Medium | Developer should periodically rebase or merge `main` into the feature branch. This is standard git workflow and not automated by Ptah. | [REQ-FB-03] |
| R-10-03 | SKILL.md changes cause agent behavior regression | Low | High | Test each skill's invocation after SKILL.md changes. The git workflow section is well-isolated in each SKILL.md. | [REQ-SK-01] |
| R-10-04 | Merge-lock contention under high parallelism (5+ concurrent agents) | Low | Medium | Merge-lock already handles timeouts. Monitor lock wait times in orchestrator logs. Consider per-feature locks if contention is observed. | [REQ-MG-01] |
| R-10-05 | Agent sub-branch created from stale feature branch HEAD (another agent merged between branch creation and this agent's completion) | Medium | Low | The serialized merge handles this naturally — if the feature branch advanced, the merge incorporates both changes. Conflicts are caught and reported. | [REQ-MG-01], [REQ-AB-02] |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 10 | REQ-FB-01, REQ-FB-02, REQ-FB-03, REQ-FB-04, REQ-AB-01, REQ-AB-02, REQ-AB-03, REQ-AB-04, REQ-MG-01, REQ-MG-02, REQ-SK-01, REQ-PF-NF-03 |
| P1 | 4 | REQ-MG-03, REQ-SK-02, REQ-PF-NF-01, REQ-PF-NF-02 |
| P2 | 0 | — |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 10 | 14 | All requirements in this document |

---

## 9. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Product Manager | Initial requirements document for Phase 10 — Parallel Feature Development. 14 requirements across 4 domains (FB, AB, MG, SK) plus 3 non-functional. 3 user stories (US-10, US-11, US-12). |

---

*Gate: User reviews and approves these requirements before proceeding to Functional Specification.*
