# Cross-Review: Engineer — REQ-016 Agent Coordination

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer |
| **Document** | [REQ-agent-coordination.md](REQ-agent-coordination.md) |
| **Version Reviewed** | 1.1 |
| **Date** | April 3, 2026 |
| **Recommendation** | **Needs revision** |

---

## Positive Observations

- Identifying per-agent branches as the root cause is correct — the git evidence (`ptah/016/.../pm/req-creation` etc.) maps exactly to line 97 of `skill-activity.ts` (`ptah/${featureSlug}/${agentId}/${phaseId}`). The proposed fix is the right direction.
- Modeling `adHocRevision` as a distinct Temporal signal type (separate from `userAnswer`) is architecturally sound; Temporal naturally buffers signals, so REQ-MR-06 aligns with built-in platform behavior at no extra cost.
- REQ-NF-02's forward-compatibility constraint (parallel-safe design) is valuable — it prevents the shared-branch design from creating a dead-end.
- REQ-WB-04's idempotency requirement is already partially handled by the existing code; this is good alignment.

---

## Findings

### F-01 — High: Idempotency check breaks under the shared branch model

**Requirement:** REQ-WB-02, REQ-WB-04

The current idempotency check in `skill-activity.ts:103–120` finds an existing worktree by:
```
wt.branch === worktreeBranch  OR  wt.path === worktreeBasePath
```

With the shared branch design, `worktreeBranch` becomes `feat-{featureSlug}` — the same value for **every agent and phase** of a feature. If Agent A (pm) is in a `ROUTE_TO_USER` wait state and has an active worktree on `feat-016-messaging-abstraction`, and Agent B (eng) starts its activity, the branch check `wt.branch === "feat-016-messaging-abstraction"` will match Agent A's worktree. The idempotency logic will then call `hasUnmergedCommits(existingWorktree.branch)` on Agent A's branch, find committed work, and return `LGTM` immediately — **skipping Agent B's actual work entirely**.

The path check (`wt.path === worktreeBasePath`) is safe (paths are agent/phase-unique), but the branch check is not. The branch check must be removed or replaced with a path-only check when operating on a shared branch.

**Required fix:** REQ-WB-04 must specify that idempotency for the shared branch model is determined by worktree **path** alone, not by branch name. The `hasUnmergedCommits` call must also be keyed to the specific phase's committed work, not the shared branch's general commit history.

---

### F-02 — High: Shared branch creation has no owner

**Requirement:** REQ-WB-01, Assumptions section

The Assumptions state: _"The shared feature branch (`feat-{feature-slug}`) is created before the first agent runs."_

No requirement specifies who creates it or when. Looking at the code:

- `startWorkflowForFeature` in `temporal-orchestrator.ts` starts the Temporal workflow but does not create a git branch.
- The workflow itself is deterministic (no I/O — Temporal constraint) and cannot call `git`.
- `invokeSkill` currently uses `createWorktree(-b, branch, path)` to create both the branch and worktree in one step.

With the new design, the first agent would call `git worktree add <path> feat-{featureSlug}` (no `-b`), which fails if the branch does not yet exist. The assumption is therefore a precondition with no implementation owner.

**Required fix:** Add a requirement in domain WB that specifies: the shared feature branch is created (if it does not already exist) either (a) by the `startWorkflowForFeature` step immediately before workflow execution begins, or (b) by the first agent's `invokeSkill` activity as a conditional first step. Option (a) is recommended — it makes the branch creation a single synchronous step outside Temporal determinism constraints.

---

### F-03 — High: commitAndMerge mechanism is incompatible with shared branch

**Requirement:** REQ-WB-03

The current `invokeSkill` activity calls `artifactCommitter.commitAndMerge` with:
```typescript
{
  worktreePath,
  branch: worktreeBranch,         // ptah/016/.../pm/req-creation (per-agent)
  featureBranch: `feat-${featureSlug}`, // feat-016-messaging-abstraction
  ...
}
```

This is a two-step operation: commit to the per-agent branch, then merge that branch into `featureBranch`. With the shared branch design, `worktreeBranch === featureBranch`, making this a self-merge — which is either a no-op or an error depending on git state.

The new commit mechanism for REQ-WB-03 must be: **commit directly in the worktree (which is already on `feat-{featureSlug}`) and push**. There is no intermediate branch; the merge step is eliminated. This changes the `commitAndMerge` call site and possibly the `ArtifactCommitter` interface.

**Required fix:** REQ-WB-03 must specify that the commit mechanism changes from "commit to per-agent branch → merge to feature branch" to "commit directly in shared-branch worktree → push to remote". The requirement as written says "push to the shared feature branch" but does not describe the changed commit pathway, which will cause the engineer to make an undocumented design decision.

---

### F-04 — High: No requirement specifies how the orchestrator resolves a Discord thread to a workflow ID for ad-hoc routing

**Requirement:** REQ-MR-02, REQ-MR-05

For ad-hoc routing to work, when `handleMessage` receives a message from a Discord thread, it must know the Temporal workflow ID to signal. Currently `routeUserAnswer` takes an explicit `workflowId` parameter — the caller is responsible for supplying it. There is no stored mapping from `featureSlug → workflowId` anywhere in `TemporalOrchestrator`.

REQ-MR-05 requires detecting "no active workflow" — this also requires the ability to look up a workflow by feature slug.

**Required fix:** Add a requirement (or expand REQ-MR-02) specifying the mechanism for resolving a Discord thread to an active workflow ID. Options:
- **In-memory map**: `TemporalOrchestrator` keeps a `Map<featureSlug, workflowId>` populated when workflows start and cleared when they complete.
- **Temporal list/query API**: Query Temporal's workflow list API filtered by a custom search attribute (requires search attributes configured on the namespace).
- **Deterministic ID**: Workflow IDs are deterministic from feature slug (e.g., `ptah-{featureSlug}`), so the orchestrator constructs the ID directly and handles "workflow not found" as the inactive case.

The third option is lowest-effort and safest — but it needs to be specified as a requirement so the TSPEC can commit to it.

---

### F-05 — Medium: "Cross-review" phase type does not exist in WorkflowConfig

**Requirement:** REQ-MR-07

REQ-MR-07 uses the term "cross-review" to describe downstream phases that must be re-run (e.g., "engineer's cross-review phase"). However, `WorkflowConfig.PhaseType` has only four values: `"creation" | "review" | "approved" | "implementation"`. There is no `"cross-review"` type.

The cascade logic must determine which phases to re-run using the actual phase type taxonomy. The REQ's description — "any phase whose role is a review (cross-review or review) of a prior artifact" — is ambiguous: does this mean all `type: "review"` phases after the revised agent's phase, or only those whose `creationPhase` corresponds to the revised agent? The example implies ALL subsequent review phases re-run after a PM revision.

**Required fix:** REQ-MR-07 must define "downstream review phase" using the actual `PhaseType` enum values. Confirm whether the cascade re-runs **all** `type: "review"` phases after the revised agent's phase index, or only the ones whose associated creation phase is the revised agent's phase.

---

### F-06 — Medium: REQ-MR-01 parser position is ambiguous ("begins with or contains")

**Requirement:** REQ-MR-01

The description says _"begins with (or contains) an `@{agent-id}` directive"_ but the acceptance criteria only tests the case where `@pm` is at the start. "Contains" would match `@pm` anywhere in the message body — including inside quoted text, file paths, or incidental mentions. For example, `"The issue is that @pm wrote conflicting docs"` would incorrectly classify a discussion message as an ad-hoc revision request.

**Required fix:** Define the exact parse rule: does the `@{agent-id}` directive only qualify when it appears as the **first token** of the message (ignoring leading whitespace)? The acceptance criteria suggests "first token" — remove "or contains" from the description, or add a rule about position.

---

### F-07 — Medium: Cascade + queue interaction during concurrent processing is unspecified

**Requirement:** REQ-MR-07, REQ-MR-06

If an `adHocRevision` signal for Agent A triggers a downstream cascade (REQ-MR-07), and a second `adHocRevision` signal for Agent B arrives while the cascade is in progress, the queue behavior is unspecified:

- Does the second signal wait until the cascade fully completes before processing?
- Does the cascade itself count as "in-flight", blocking dequeue?

Given REQ-NF-01 prohibits phase disruption, the cascade must complete before the next queued signal is processed. But this is not stated. If the queue dequeues eagerly (while the cascade is running), Agent B's activity and a cascade phase could execute simultaneously, violating the sequential constraint.

**Required fix:** Add a business rule: a queued `adHocRevision` signal is not dequeued until all cascade phases triggered by the previous ad-hoc revision have completed. The queue blocks on cascade completion.

---

### F-08 — Low: No bound on queue depth should be acknowledged as an explicit product decision

**Requirement:** REQ-MR-06

REQ-MR-06 states _"There is no maximum queue depth — signals accumulate until the workflow terminates."_ Temporal's event history is bounded (default 50k events, ~10MB). Each signal adds events to the history. An unbounded queue is technically correct for normal usage, but under adversarial or accidental conditions (e.g., a user sending 100 `@pm` messages) could exhaust Temporal's history limit and terminate the workflow with a non-user-friendly error.

**Required fix:** Acknowledge this as a conscious product decision with a note to consider a practical soft cap (e.g., 50 pending signals) in the TSPEC, even if not enforced in the product layer.

---

### F-09 — Low: REQ-WB-02 doesn't address first-agent case (branch doesn't exist yet)

**Requirement:** REQ-WB-02

REQ-WB-02 says the worktree checks out `feat-{featureSlug}` directly. This assumes the branch exists. Without F-02's fix, the first agent has no branch to check out and `git worktree add <path> feat-{featureSlug}` will fail with "pathspec not found". This is partially covered by F-02 but should be cross-referenced explicitly in REQ-WB-02.

---

## Clarification Questions

**Q-01:** For REQ-MR-07 cascade — does a cascade triggered by an `adHocRevision` for agent X re-run **all** `review` phases after X's position in the config, or only those whose `creationPhase` directly corresponds to X? The current example (PM revision → eng-review + qa-cross-review) suggests "all subsequent review phases," but consider: if `eng` is revised, should a `qa-cross-review` that reviews PM's REQ (not the eng TSPEC) also re-run?

**Q-02:** For REQ-MR-07 cascade — if one of the cascaded review phases requests a revision (returns `Needs revision`), does the standard revision loop run, or is the revision short-circuited back to the original ad-hoc revision agent?

---

## Recommendation

**Needs revision.** Four High-severity findings must be addressed before TSPEC authoring can begin:

- **F-01**: Rewrite REQ-WB-04 idempotency to use path-only matching
- **F-02**: Add a requirement for shared branch creation ownership
- **F-03**: Specify the new commit mechanism in REQ-WB-03
- **F-04**: Add a requirement for feature-slug → workflow-ID resolution

Medium findings (F-05, F-06, F-07) should also be addressed as they will produce ambiguous TSPEC decisions if left open.

Once High and Medium findings are resolved, route the updated REQ back for re-review.
