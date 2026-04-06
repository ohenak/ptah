# Cross-Review: Engineer — REQ-016 Agent Coordination (v1.2 Re-review)

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer |
| **Document** | [REQ-agent-coordination.md](REQ-agent-coordination.md) |
| **Version Reviewed** | 1.2 |
| **Date** | April 6, 2026 |
| **Prior Review** | [CROSS-REVIEW-engineer-REQ.md](CROSS-REVIEW-engineer-REQ.md) (v1.1, April 3) |
| **Recommendation** | **Approved** |

---

## Prior Findings — All Resolved

All 4 High, 3 Medium, and 2 Low findings from the v1.1 review have been addressed:

| Finding | Severity | Resolution |
|---------|----------|------------|
| F-01: Idempotency break on shared branch | High | REQ-WB-04 rewritten — path-only matching, phase-specific commit marker |
| F-02: No branch creation owner | High | New REQ-WB-05 — `startWorkflowForFeature` creates the branch |
| F-03: commitAndMerge self-merge | High | REQ-WB-03 rewritten — commit-in-worktree → push, merge step eliminated |
| F-04: No workflow ID resolution | High | New REQ-MR-08 — deterministic `ptah-{featureSlug}` IDs |
| F-05: "cross-review" phase type | Medium | REQ-MR-07 now uses `type: "review"` from WorkflowConfig PhaseType enum |
| F-06: Parser position ambiguity | Medium | REQ-MR-01 — first-token rule only, "or contains" removed |
| F-07: Cascade + queue interaction | Medium | REQ-MR-06 — cascade-blocking rule added with explicit business rule |
| F-08: Queue depth unbounded | Low | REQ-MR-06 — acknowledged as conscious decision with Temporal limit note |
| F-09: First-agent branch case | Low | REQ-WB-02 cross-references REQ-WB-05 as precondition |

Both clarification questions (Q-01, Q-02) are answered and closed as OQ-04 and OQ-05 respectively.

---

## New Assessment — v1.2

### Codebase Cross-Reference

Verified the following integration points against current source code:

| Requirement | Codebase Reference | Assessment |
|-------------|-------------------|------------|
| REQ-WB-01 | `skill-activity.ts:113` — `worktreeBranch = ptah/${featureSlug}/${agentId}/${phaseId}` | Correctly identified as the line to change. Shared branch replaces per-agent branch. |
| REQ-WB-02 | `skill-activity.ts:160-167` — WorktreeManager.create() | Path convention `/tmp/ptah-worktrees/{agentId}/{featureSlug}/{phaseId}` aligns with existing WorktreeManager patterns. Sequential execution (REQ-NF-01) prevents git's "branch already checked out in another worktree" error. |
| REQ-WB-03 | `artifact-committer.ts:69-177` — commitAndMerge() | Correctly identifies the two-step commit→merge flow that must become commit→push. The ArtifactCommitter interface change is accurately scoped. |
| REQ-WB-04 | `skill-activity.ts:120-121` — `wt.branch === worktreeBranch \|\| wt.path === worktreeBasePath` | Path-only rewrite is technically correct. The branch check would indeed match any worktree on the shared branch. |
| REQ-WB-05 | No existing implementation — new capability | `startWorkflowForFeature` is the right insertion point. Synchronous git operation before Temporal workflow submission avoids determinism constraints. |
| REQ-MR-01 | No existing parser — new capability | First-token rule is unambiguous. Agent ID matching against `AgentEntry.id` from config is straightforward. |
| REQ-MR-02 | `feature-lifecycle.ts:554-556` — existing signal definitions | Adding `adHocRevision` signal alongside `userAnswerSignal` follows established patterns. Temporal signal buffering handles concurrent delivery. |
| REQ-MR-07 | `workflow-config.ts:14` — `PhaseType = "creation" \| "review" \| "approved" \| "implementation"` | Cascade filter on `type: "review"` uses the actual enum. Revision loop is bounded by `revision_bound` in PhaseDefinition. |
| REQ-MR-08 | No existing implementation — new convention | Deterministic ID `ptah-{featureSlug}` naturally prevents duplicate workflows (Temporal rejects duplicate running workflow IDs), which enforces Assumption #1. |

### Sequential Execution Safety

Verified that all ad-hoc revision paths maintain sequential agent execution:

1. **Normal flow:** Phases run sequentially via `resolveNextPhase()` — only one agent active at a time.
2. **ROUTE_TO_USER:** Worktree persists during wait; same agent reuses it on re-invocation. No second agent starts until this agent completes.
3. **Ad-hoc revision:** Queued via Temporal signal; dequeued only after current activity + cascade completes (REQ-MR-06 cascade-blocking rule). No concurrent worktree conflict.

---

## Findings

### F-01 — Low: User story IDs collide with global traceability matrix IDs

**Requirement:** Section 3 (User Stories)

The REQ uses US-01 through US-08 which overlap with the global user story IDs in the master traceability matrix (`docs/requirements/traceability-matrix.md`). Other feature REQs (015, 020, messaging-abstraction) use globally unique IDs (US-26 through US-35). This is a documentation housekeeping issue — the traceability matrix will need a mapping, or the REQ IDs should be renumbered to the next available global range (US-36+).

No impact on technical implementation.

### F-02 — Low: Deterministic workflow ID implicitly enforces single-workflow-per-feature

**Requirement:** REQ-MR-08

The deterministic ID `ptah-{featureSlug}` means Temporal will reject a second `startWorkflow` call for the same feature slug while the first is running (duplicate workflow ID error). This is desirable and aligns with Assumption #1 ("Each feature has exactly one active Temporal workflow at a time"), but the REQ doesn't explicitly call out that the deterministic ID *is the enforcement mechanism* for this assumption. Worth noting in the TSPEC as a design benefit.

---

## Positive Observations

- The cascade-blocking rule in REQ-MR-06 is well-defined and prevents the concurrent-activity violation I flagged in Q-01/F-07.
- REQ-MR-07's "standard revision loop within cascade" approach is architecturally clean — it reuses the existing revision flow rather than inventing a new one, which minimizes implementation risk.
- The separation between REQ-WB-05 (branch creation) and REQ-WB-02 (worktree creation) establishes clear ownership boundaries that map well to the existing code structure (orchestrator layer vs. activity layer).
- REQ-MR-08's deterministic ID approach is the lowest-risk option and avoids introducing new Temporal infrastructure requirements (no search attributes, no in-memory maps).
- The open questions are all closed with clear rationale documented in-line.

---

## Recommendation

**Approved.** All prior High and Medium findings have been addressed. Two new Low-severity observations are noted above — both are documentation/clarity improvements, not blockers. The REQ is ready for TSPEC authoring.
