# Cross-Review: Engineer — FSPEC-FLF v1.0 (Feature Lifecycle Folders)

| Field | Detail |
|-------|--------|
| **Reviewer** | engineer |
| **Document Reviewed** | `docs/backlog/feature-lifecycle-folders/FSPEC-feature-lifecycle-folders.md` v1.0 |
| **Date** | 2026-04-03 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — FSPEC-PR-01: Backlog→in-progress flow has an unresolvable sequencing contradiction (Medium)

**Location:** FSPEC-PR-01 — Behavioral Flow: Backlog→In-Progress Promotion, steps 1–4.

Steps 1–3 name the **skill** as the acting entity: the skill calls the feature resolver, inspects the path prefix, and emits a promotion-intent signal. Step 4 then says the orchestrator runs the promotion activity **"before the skill invocation proceeds."**

These two halves are mutually exclusive in a Temporal activity model. If the skill is already executing (it just called the resolver in step 1), it cannot be "not yet invoked" in step 4. In Temporal, an activity is a single atomic function call — there is no mechanism to pause mid-execution, signal the workflow, wait for a side-effecting activity to complete, and resume.

Two architecturally coherent alternatives exist, and the FSPEC does not specify which is intended:

**Alternative A (orchestrator-first):** The orchestrator resolves the feature path and detects the backlog condition *before* invoking the skill. If the path is in `docs/backlog/`, the orchestrator runs the promotion activity, updates workflow state, and *then* invokes the skill. Steps 1–3 would be re-attributed to the orchestrator's pre-skill setup logic, not to the skill itself. The skill is never aware of the promotion — it just receives an already-promoted path from workflow state.

**Alternative B (skill-signals-pause):** The skill itself detects the backlog condition and emits a special signal partway through its execution, causing the activity to return early with a "needs-promotion" sentinel value. The workflow then runs the promotion, and re-invokes the skill. This requires the activity's return type to carry a promotion-needed sentinel, and the workflow to handle re-invocation — none of which is specified.

Alternative A is simpler and more consistent with BR-01 ("promotion execution is always performed by the orchestrator, never by a Claude skill agent"). If that is the intended design, the flow section's attribution of the resolver call to the "skill" is incorrect and will mislead the TSPEC author. The FSPEC should describe steps 1–3 as orchestrator pre-skill setup logic.

**Required fix:** Rewrite the Behavioral Flow section to clearly attribute each step to either the orchestrator's pre-skill setup or the skill's execution. If Alternative A is intended, steps 1–3 should be labeled "Orchestrator — pre-invocation" and the skill should not appear until step 5 onwards.

---

### F-02 — FSPEC-PR-01: `PROMOTE_BACKLOG_TO_IN_PROGRESS` signal type is incompatible with the existing router (Medium)

**Location:** FSPEC-PR-01 — Behavioral Flow step 3. Codebase reference: `ptah/src/orchestrator/router.ts:76`.

Step 3 says the skill emits `{ type: "PROMOTE_BACKLOG_TO_IN_PROGRESS", featureSlug }` as a routing signal. The current router enforces a closed enum of valid types:

```typescript
// ptah/src/orchestrator/router.ts:76
const validTypes = ["ROUTE_TO_AGENT", "ROUTE_TO_USER", "LGTM", "TASK_COMPLETE"];
if (!validTypes.includes(type)) {
  throw new RoutingParseError(`unknown routing signal type: ${type}`);
}
```

If the skill emits `PROMOTE_BACKLOG_TO_IN_PROGRESS`, the router throws a `RoutingParseError` — the signal never reaches the orchestrator for promotion. The skill activity would fail with a parse error instead of triggering the intended flow.

This is a hard runtime breakage, not a theoretical concern. The FSPEC must specify one of:

1. **Extend the router:** Add `PROMOTE_BACKLOG_TO_IN_PROGRESS` to `validTypes`. Specify its required fields (e.g., `featureSlug`), the router's `RoutingSignal` type union, and the workflow handler that processes it. The FSPEC must define the full interface contract — field names, types, and routing decision logic — since the TSPEC author needs this to extend the router correctly.

2. **Use the orchestrator-first model (Alternative A from F-01):** If the orchestrator detects the backlog condition before invoking the skill, no new routing signal type is needed. The skill emits LGTM normally; the orchestrator handles promotion as a pre-invocation step. This eliminates the router extension entirely and is the simpler path.

Given that F-01 and F-02 are related — both stem from ambiguity about who detects the backlog condition — addressing F-01 with Alternative A would resolve F-02 as a consequence.

**Required fix:** If the skill must signal promotion intent, specify the full router extension (new type, fields, routing decision). If the orchestrator-first model is adopted for F-01, explicitly note that no new routing signal type is needed and remove step 3 from the FSPEC-PR-01 flow.

---

### F-03 — FSPEC-MG-01: "Manual overrides" referenced in BR-02 but not defined anywhere (Low)

**Location:** FSPEC-MG-01 — Business Rules, BR-02.

BR-02 says: *"the developer can re-run with manual overrides if the heuristic is wrong."* No override mechanism is described in the Behavioral Flow, the Input/Output table, or the Acceptance Tests. There is no `--in-progress` flag, config file, or other mechanism specified.

The TSPEC author cannot implement an override mechanism without a spec. Either:
- Define the override mechanism (e.g., a `--in-progress=<folder>` CLI flag, an override config file, or a documented manual workaround such as running `git mv` after the script).
- Remove the override claim and replace it with an explicit statement that misclassifications require manual `git mv` intervention after the script completes.

**Severity:** Low — the migration script runs once and the heuristic covers the known case (all numbered = completed). But the BR creates an implementer expectation that is not fulfillable from the spec.

---

## Clarification Questions

### Q-01 — FSPEC-PR-01: What is the exact scope of "current workflow run" for sign-off detection?

**Location:** FSPEC-PR-01 — Business Rules, BR-07; FSPEC-PR-01 Acceptance Test AT-PR-06.

BR-07 says completion promotion requires both sign-offs "in the current workflow run." In Temporal's data model, a workflow execution is identified by `(workflowId, runId)`. A workflow can spawn a new run via `continue-as-new`, producing a new `runId` while keeping the same `workflowId`.

For the TSPEC author to implement sign-off state persistence and detection, they need to know: does "workflow run" mean a single `(workflowId, runId)` pair, or does it encompass all runs sharing a `workflowId`? If sign-off state is stored in workflow history (the typical pattern), a `continue-as-new` boundary would reset it unless explicitly carried forward.

---

## Positive Observations

- The two-phase idempotency design for in-progress→completed is precise and correct. The per-file check in Phase 2 (skip files already prefixed) gives crash recovery exactly the granularity it needs.
- The resolver's `{ found: false }` return (not throw) for missing features is the right contract. The PM skill's Phase 0 example in BR-05 correctly illustrates why this matters.
- Business rule separation between skills (detect+signal) and orchestrator (execute) in BR-01 is architecturally sound and consistently enforced across FSPEC-PR-01, FSPEC-SK-01, and FSPEC-WT-01.
- The crash-recovery startup sweep specification in FSPEC-WT-01 (git worktree list + Temporal active execution query) correctly identifies the two authoritative sources of truth and explains why the in-memory registry is not used for recovery (BR-05).
- FSPEC-MG-01 correctly identifies that document file renames for in-progress features in migration are scoped to direct children only — not subdirectories (edge case section).
- The Open Questions section's acknowledgment of the two Low findings from the REQ cross-review is clean and prevents re-opening resolved editorial issues at TSPEC time.

---

## Summary

Two Medium findings must be addressed before TSPEC creation can proceed. Both stem from the same root cause: the backlog→in-progress flow ambiguously attributes detection logic to the skill when BR-01 places execution authority with the orchestrator. Resolving F-01 (clarify orchestrator-first vs. skill-signals-pause) will likely resolve F-02 (router extension) as a consequence. F-03 is Low and non-blocking. Q-01 is a clarification needed for TSPEC implementation.

The author must address all Medium findings and route the updated FSPEC back for re-review.
