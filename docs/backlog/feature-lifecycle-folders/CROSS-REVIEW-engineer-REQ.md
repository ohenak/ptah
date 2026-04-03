# Cross-Review: Engineer — REQ-FLF (Feature Lifecycle Folders)

| Field | Detail |
|-------|--------|
| **Reviewer** | engineer |
| **Document Reviewed** | `docs/backlog/feature-lifecycle-folders/REQ-feature-lifecycle-folders.md` v2.0 |
| **Date** | 2026-04-03 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — `ContextResolutionContext` redesign not specified (High)

`feature-lifecycle.ts:42-46` defines:

```typescript
export interface ContextResolutionContext {
  featureSlug: string;
  featurePrefix: string;   // ← becomes meaningless for backlog/in-progress
  docsRoot?: string;
}
```

`resolveContextDocuments` (line 80) uses this to construct:

```
docs/{featurePrefix}-{featureSlug}
```

With lifecycle folders, the correct path depends on which folder the feature is in:
- Backlog: `docs/backlog/{featureSlug}/`
- In-progress: `docs/in-progress/{featureSlug}/`
- Completed: `docs/completed/{NNN}-{featureSlug}/`

The `featurePrefix` field no longer serves this purpose. REQ-SK-02 requires all skills to resolve feature paths across lifecycle folders, but doesn't specify how `ContextResolutionContext` changes, which module owns the lifecycle-aware resolution, or what the new interface shape is. Without this, the TSPEC cannot design the type system.

**Required addition:** Define a replacement for `ContextResolutionContext` (or a `FeatureResolver` protocol) that takes a slug and returns the resolved path by searching lifecycle folders. Specify where in the orchestrator this resolver lives.

---

### F-02 — Hard-coded path at line 1076 uses undefined pattern (High)

`feature-lifecycle.ts:1076` already diverges from the `{prefix}-{slug}` pattern:

```typescript
.map((id) => `docs/${state.featureSlug}/CROSS-REVIEW-${id}-${creationPhase.id}.md`)
```

This path (`docs/{featureSlug}/CROSS-REVIEW-...`) matches neither the old convention (`docs/{NNN}-{featureSlug}/`) nor the new lifecycle convention (`docs/{lifecycle}/{featureSlug}/`). It is already incorrect today. Under lifecycle folders, it must become something like `docs/in-progress/{featureSlug}/CROSS-REVIEW-...` (for in-progress features) — but only if lifecycle-aware resolution is applied.

REQ C-02 lists this line as needing an update but does not define the replacement expression. This gap means the implementation cannot proceed without a decision on how the resolver is invoked in this context.

**Required addition:** Specify what `docs/${state.featureSlug}/CROSS-REVIEW-...` should become. Does the orchestrator call the lifecycle resolver here, or does it receive the resolved feature path as part of workflow state?

---

### F-03 — Promotion execution responsibility is ambiguous (Medium)

REQ-SK-03 states: "the engineer or tech-lead skill must promote the feature to `docs/in-progress/` before proceeding."

In the Ptah architecture, skills are Claude agents invoked by the Temporal orchestrator. They write files via the Write tool but do not execute shell commands (`git mv`). The `git mv` + commit for promotion is a shell/FS operation that must happen in an orchestrator activity or a pre-skill hook — not inside the agent itself.

The REQ conflates two distinct concerns:
1. **Detection** — the skill recognises the feature is in `backlog/` (agent-level, feasible)
2. **Execution** — `git mv` moves the folder (orchestrator-level, requires a shell activity)

Without clarifying which layer owns execution, implementation risks placing `git mv` logic in the wrong component, which would either not work (if in the agent) or require a new Temporal activity (if in the orchestrator, which is the correct place but needs explicit specification).

**Required addition:** Specify that promotion execution (the `git mv` + commit) is performed by the Ptah orchestrator (via a new activity or existing `ExecService`), triggered by a signal from the skill or detected automatically before skill invocation.

---

### F-04 — In-document reference update scope is underspecified (Medium)

REQ-PR-04 and R-05 require that internal markdown references remain valid after file renames on completion (e.g., `REQ-feature.md` → `{NNN}-REQ-feature.md`). The REQ acknowledges this in R-05 but defers the "how":

> "Completion promotion must scan document content for internal file references and update them."

Not specified:
- Which reference formats are in scope: `[title](REQ-feature.md)`, `[title](./REQ-feature.md)`, bare filename mentions, or all of these?
- Are cross-feature references (e.g., a link in feature B pointing to a file in feature A) in scope or out of scope?
- Does this scanning happen as a promotion activity in the orchestrator, or as a separate script?

Without this, the TSPEC cannot correctly scope the parser implementation.

**Required addition:** Define the exact reference patterns to match and update, and clarify whether cross-feature references are in or out of scope for the rename step.

---

### F-05 — Idempotency of NNN assignment is unspecified (Medium)

REQ-NF-02 requires the migration to be idempotent. REQ-PR-03 assigns NNN as `max(NNN across completed/) + 1`. If a promotion run is interrupted after the folder is moved but before all files are renamed (or before the git commit completes), the next run would find a folder without proper NNN-prefixed files and potentially re-assign or skip it.

The REQ does not describe the idempotency mechanism for this partial-completion case. Options include:
- A lock/sentinel file written atomically before promotion begins
- A two-phase check (detect partially-promoted state, resume rename without re-assigning NNN)
- Relying on Temporal's workflow idempotency (if promotion is a workflow activity)

Without this, the migration and promotion logic may produce inconsistent state on failure/retry.

**Required addition:** Define the idempotency strategy for the promotion-to-completed step, specifically for the partial-completion failure case.

---

## Clarification Questions

### Q-01 — Slug collision across lifecycle folders

REQ-SK-02 defines search order as `in-progress/ → backlog/ → completed/`. What is the expected behavior if the same slug exists in two folders simultaneously (e.g., folder present in both `backlog/` and `in-progress/` due to a bug or concurrent operation)? Should the resolver return the first match silently, log a warning, or throw an error?

### Q-02 — Who triggers completion promotion (REQ-SK-04)?

REQ-SK-04 says "the responsible skill (or orchestrator)" triggers promotion. Which is the authoritative answer? If the orchestrator, what event/signal triggers it (e.g., detecting both sign-off routing tags in a single workflow run)? If a skill, how does it invoke shell operations?

### Q-03 — Stale file reference in C-02

Constraint C-02 references `ptah/src/orchestrator/cross-review-parser.ts:159` as a file containing `docs/` path references. That file does not exist at that path in the current codebase (confirmed by search). Is this reference stale (the file was moved or renamed), or is the path incorrect? The actual cross-review path logic appears to be in `feature-lifecycle.ts:1076`.

---

## Positive Observations

- The unnumbered-until-completion design is sound. It eliminates NNN coordination overhead for speculative features without losing ordering semantics for completed work.
- Risk R-03 correctly identifies the highest-impact integration point (`feature-lifecycle.ts` and the path resolution logic) — this is the right place to focus the TSPEC.
- REQ-PR-05 (`git mv` for history preservation) is the correct engineering choice; specifying this explicitly avoids the common mistake of using `cp` + `rm`.
- The search order `in-progress/ → backlog/ → completed/` is a reasonable access pattern that prioritises active work.
- Scope boundaries (section 9) are well-defined and prevent scope creep into unrelated concerns.

---

## Recommendation

**Needs revision.** Three High-severity findings (F-01, F-02, F-03) and two Medium-severity findings (F-04, F-05) must be addressed before this REQ can be approved for TSPEC creation.

The core gap is that the REQ describes the desired *behavior* of the lifecycle resolver but does not specify the *interface contract* or *execution model* for the orchestrator integration. Without these, the TSPEC cannot design the replacement for `ContextResolutionContext` or the promotion activity architecture.

**The author must address F-01 through F-05 and answer Q-01 through Q-03, then route the updated REQ back for re-review.**
