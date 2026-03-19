# Cross-Review: Backend Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-REQ-tech-lead-orchestration](014-REQ-tech-lead-orchestration.md) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs Revision** |

---

## Findings

### F-01 — HIGH: Plan dependency format is insufficient for true DAG expression

**Affected requirements:** REQ-PD-01, REQ-PD-02, A-01

The plan template (`docs/templates/backend-plans-template.md`, Section 4 "Task Dependency Notes") defines the dependency format as:

```
Phase A (1-N) → Phase B (N+1-M) → Phase C (M+1-P) → ...
```

This is a **linear chain format**, not a DAG. It has no syntax for expressing fan-out dependencies like "Phase A unlocks both Phase B and Phase C independently." Without fan-out expression, the only graphs that can be represented are straight chains — which always produce batches of size 1 (no parallelism).

REQ-PD-01 states the tech lead "must parse the Task Dependency Notes section and construct a DAG," and REQ-PD-02 requires maximum parallelism within each batch. But if every existing plan encodes only linear chains, the batch algorithm will always produce single-phase batches, delivering no parallelism benefit.

**Resolution needed:** Either (a) specify an extended dependency syntax in the plan template that supports fan-out (e.g., `A → [B, C, D]` or structured YAML), or (b) acknowledge that the current template must be updated as part of this feature and add a requirement for template evolution. The plan template compatibility constraint in REQ-NF-14-04 says "no changes to the plan template are required," which directly conflicts with enabling true DAG expression.

---

### F-02 — HIGH: Partial batch failure merge semantics are undefined

**Affected requirements:** REQ-BD-07, REQ-BD-04

REQ-BD-07 specifies that when a phase fails, "other agents in the same batch that are still running should be allowed to complete." This is correct for not wasting in-flight work. However, the REQ does not specify what happens to the **successful phases** in a failed batch:

- Are the successful phases' worktree branches merged into the feature branch?
- Or are they left un-merged, and the entire batch must be re-run after the failure is fixed?

These are materially different behaviors. If successful phases are merged, the feature branch is in a partially-implemented state (some phases done, one failed). The developer then has to figure out which tasks are done and which aren't to resume. If they are NOT merged, the successful agents' work is discarded, causing wasted re-execution.

Neither path is specified. This undefined state will produce a design gap in the TSPEC.

**Resolution needed:** Add an explicit behavior clause to REQ-BD-07 specifying whether successful sibling phases are merged after a batch failure, and under what conditions re-execution of those phases would be required.

---

### F-03 — HIGH: Worktree creation mechanism is unspecified for a SKILL.md agent

**Affected requirements:** REQ-BD-03, REQ-BD-02, REQ-BD-04

REQ-BD-03 states each dispatched agent must operate in its own isolated git worktree. The existing worktree infrastructure (from Phase 10) is implemented in TypeScript: `worktree-registry.ts`, `feature-branch.ts`, and `orchestrator.ts` call `createWorktreeFromBranch` as part of the agent invocation lifecycle managed by the orchestrator.

The tech-lead is currently defined as a **SKILL.md prompt agent** (`.claude/skills/tech-lead/SKILL.md`). Prompt-level agents cannot directly call TypeScript methods to create worktrees. The worktree lifecycle (`create → run agent → merge → cleanup`) requires coordination at the TypeScript orchestration layer, not inside the agent prompt.

Two architecturally distinct implementation paths are possible:
1. **Promote tech-lead to a TypeScript module** — a new `TechLeadOrchestrator` class that the `pdlc-dispatcher.ts` delegates to, which uses the existing `worktree-registry.ts` and `skill-invoker.ts` directly.
2. **Keep tech-lead as a SKILL.md** — but rely on the existing orchestrator to create worktrees on its behalf, requiring new orchestrator-level primitives for "launch N agents with isolated worktrees and await all."

The REQ does not specify which architecture is intended. Without this clarity, the TSPEC cannot be written. This is the most impactful gap in the document.

**Resolution needed:** Specify whether tech-lead is a TypeScript sub-orchestrator module or a SKILL.md prompt agent. If SKILL.md, specify what new orchestrator primitives (if any) are required to give it worktree management capabilities.

---

### F-04 — MEDIUM: Integration path into `pdlc-dispatcher.ts` is unspecified

**Affected requirements:** REQ-TL-01, REQ-NF-14-03

The existing `pdlc-dispatcher.ts` routes `IMPLEMENTATION` phase to `eng` (backend-engineer) and conditionally `fe` (frontend-engineer) in a fork/join pattern — `FORK_JOIN_PHASES` includes `Phase.IMPLEMENTATION`. REQ-TL-01 says the orchestrator "must invoke the tech-lead skill instead of directly invoking backend-engineer or frontend-engineer."

The dispatcher currently reads the feature's `discipline` field (`"backend-only"`, `"frontend-only"`, or `"fullstack"`) to decide fork/join. The REQ does not specify:
- What config field or condition in the feature state causes the dispatcher to route to tech-lead instead of directly to eng/fe.
- Whether tech-lead is a new `discipline` value, a new `agentId` alongside `eng`/`fe`, or a conditional override.
- How `FORK_JOIN_PHASES` classification interacts with tech-lead routing.

REQ-NF-14-03 says fallback to sequential dispatch when tech-lead is not configured, but "configured" is not defined in terms of the existing `FeatureConfig` or `PdlcStateFile` types.

**Resolution needed:** Define the exact config field/value that triggers tech-lead routing, and describe how `pdlc-dispatcher.ts`'s existing fork/join dispatch logic is modified or extended.

---

### F-05 — LOW: R-05 risk severity appears stale

**Affected section:** Section 7 Risks, R-05

R-05 rates "Phase 10 branch infrastructure not yet implemented" as **High likelihood / High impact**. However, the Phase 10 implementation is committed to the repository: `worktree-registry.ts`, `feature-branch.ts`, `artifact-committer.ts` (two-tier merge), and the Phase 10 TSPEC is marked "Approved." The infrastructure appears to be in place.

If Phase 10 is implemented, R-05 should be updated to "Low likelihood" (since it's done) or removed, to avoid misleading the TSPEC author into designing unnecessary fallbacks for a risk that has been mitigated.

**Resolution needed:** Verify Phase 10 implementation status and update R-05 likelihood accordingly.

---

### F-06 — LOW: REQ-BD-08 plan status update is susceptible to concurrent write conflicts

**Affected requirements:** REQ-BD-08

REQ-BD-08 requires the tech-lead to update task statuses in the plan document after each phase completes. Within a batch, multiple agents may complete near-simultaneously. If the tech-lead processes completions concurrently and writes to the same markdown file without serialization, the file can be silently corrupted (one write overwrites the other's changes).

The requirement is silent on whether plan status updates are serialized. Given the existing `AsyncMutex` / merge-lock pattern in the codebase, this is solvable, but it should be called out explicitly.

**Resolution needed:** Add a note that plan status updates must be serialized (one at a time), even when phases complete concurrently.

---

## Clarification Questions

### Q-01: Is tech-lead a TypeScript module or a SKILL.md agent?

Directly tied to F-03. The answer determines the entire TSPEC architecture. If it's a TypeScript sub-orchestrator, it can use existing services directly. If it's a SKILL.md agent, new orchestrator primitives are needed to give it worktree control. Which is intended?

### Q-02: What is the exact config field that enables tech-lead routing?

For REQ-TL-01 and REQ-NF-14-03: what field in `FeatureConfig` or `PdlcStateFile` signals that the tech-lead should be used? Is it a new `discipline` value (`"parallel"`), a new `agentId` (`"tech-lead"`) listed in registered agents, or something else?

### Q-03: Is the plan template expected to evolve to support fan-out dependencies?

For F-01: REQ-NF-14-04 says "no changes to the plan template are required," but the current template format can only express linear chains. If we accept that current plans only produce Batch-of-1 serialized execution (no real parallelism until plans adopt a richer format), that's a valid MVP scope constraint — but it should be explicitly stated, not implied. Should REQ-NF-14-04 be relaxed to allow template evolution, or is Batch-of-1 acceptable as the initial behavior?

---

## Positive Observations

- The requirements are well-structured across four domains (PD, BD, TL, PR) with clear traceability to user scenarios and dependencies between requirements.
- The scope boundaries (Section 9) are precise and well-reasoned — explicitly excluding automatic conflict resolution and intra-phase task parallelism avoids scope creep.
- REQ-PD-05 (graceful fallback for unparseable graphs) is a good defensive requirement and directly mitigates the template format risk in F-01.
- The separation of concerns in REQ-TL-03 (tech lead must not write code) is architecturally clean and testable.
- Success metrics in Section 4 are quantitative and measurable against a specific baseline (12-phase plan).
- REQ-NF-14-01 (5-agent concurrency cap) is a pragmatic constraint that prevents runaway parallelism; good to have in the REQ rather than leaving it to the engineer.
- REQ-BD-06 (resume from specific batch) cleanly maps to REQ-PD-04 (completed phase detection) — the dependency is correct.

---

## Recommendation

**Needs revision.** Three High-severity findings (F-01, F-02, F-03) must be resolved before this REQ can be approved for TSPEC authoring:

- **F-01** leaves the core value proposition (parallel batching) technically unachievable with the current plan template format.
- **F-02** leaves the failure recovery state machine in an undefined condition that will produce a design gap in the TSPEC.
- **F-03** makes the TSPEC impossible to write without knowing whether tech-lead is a TypeScript module or a SKILL.md agent.

Please address F-01 through F-04 and clarify Q-01 through Q-03, then route the updated REQ back for re-review.
