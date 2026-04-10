# Engineer Cross-Review: REQ-fix-req-overwrite-on-start

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer (eng) |
| **Document Reviewed** | [REQ-fix-req-overwrite-on-start.md](REQ-fix-req-overwrite-on-start.md) v1.0 |
| **Date** | 2026-04-10 |
| **Recommendation** | **Needs revision** |

---

## Summary

The REQ correctly identifies a real data-loss defect and the happy-path fix (detect existing REQ, start at `req-review`) is technically sound — `TemporalClient.startFeatureWorkflow` already accepts `startAtPhase`, and `startWorkflowForFeature` already threads it through ([temporal-orchestrator.ts:208-223](../../../ptah/src/orchestrator/temporal-orchestrator.ts#L208-L223)). However, two design decisions in the REQ create behavior conflicts and implementation ambiguity that must be resolved before engineering picks this up. In addition, the REQ is silent on an existing abstraction (`FeatureResolver`) that the fix should almost certainly reuse rather than duplicate.

---

## Findings

### F-01 — REQ-ER-01 breaks the current "bootstrap new feature from Discord" flow (High)

**Severity:** High

The overview and Section 1 both frame this change as "a minimal, targeted bug fix" that "must not alter the semantics" of existing flows. REQ-ER-01, however, introduces a significant behavior change:

> "When phase detection finds neither an overview nor a REQ for the resolved slug in either lifecycle folder, the orchestrator must not start a workflow and must reply in the invoking Discord thread with an error..."

The current **supported and documented** bootstrap flow is:

1. A user creates a Discord thread named after a new feature (e.g., "my-new-feature — discuss ideas").
2. They post a message mentioning an agent (`@pm`).
3. `handleMessage` at [temporal-orchestrator.ts:265](../../../ptah/src/orchestrator/temporal-orchestrator.ts#L265) derives the slug, sees no running workflow, calls `startNewWorkflow`, and begins at `req-creation`.
4. The PM agent's **Phase 0 bootstrap** (mandated by the product-manager skill) runs `mkdir -p docs/backlog/{slug}` and writes `overview.md` from the thread context, then produces the REQ.

REQ-ER-01 terminates this flow before step 3 completes, returning an error. Users would then have no way to bootstrap a new feature from Discord until the separate `orchestrator-discord-commands` feature (which adds `@ptah create backlog`) ships. This creates an implicit, undeclared dependency between the two features and breaks a path that is currently working.

**Options to resolve:**

- **Option A (recommended, aligns with "minimal fix" framing):** Drop REQ-ER-01 entirely. When neither REQ nor overview exists, continue to start at `req-creation` as today — the PM skill's Phase 0 bootstrap will create the folder and overview. The bug fix then reduces to: "If REQ exists → start at `req-review`; otherwise start at `req-creation` (unchanged)."
- **Option B:** Keep REQ-ER-01 but mark this feature as blocked on `orchestrator-discord-commands`, and document the breaking change + migration path for users who previously bootstrapped from Discord.

Either option is defensible, but Option A keeps the fix small and matches the REQ's own stated scope.

---

### F-02 — Completed-lifecycle features are not addressed (Medium)

**Severity:** Medium

[`FeatureResolver`](../../../ptah/src/orchestrator/feature-resolver.ts) — the existing abstraction that maps a slug to a lifecycle folder — searches `in-progress → backlog → completed` in that order and returns the lifecycle tag. The REQ only covers `backlog` and `in-progress`. It does not say what happens when the resolved folder is `docs/completed/<NNN>-<slug>/` and contains a REQ.

Possible interpretations, all consistent with the REQ as written:

1. Start the workflow at `req-review` (REQ-WS-01 applies because a REQ exists). The workflow then tries to push commits against a completed feature branch.
2. Treat as "not found" and trigger REQ-ER-01. This contradicts REQ-PD-01 which checks `in-progress` and `backlog` but not `completed`, so detection would correctly return false.
3. Reject with a distinct "feature already completed" error.

Implementation needs a definitive answer. Interpretation (2) is probably the right default (completed features should not be re-driven through the lifecycle from a Discord mention), but this should be explicit in the REQ.

---

### F-03 — REQ-PD-03 "inconsistent state" handling is incomplete (Medium)

**Severity:** Medium

REQ-PD-03 handles exactly one inconsistent state:

> "When a REQ is present in `in-progress` and only an overview is present in `backlog`, the orchestrator must prefer the `in-progress` location and log a warning."

But at least three other inconsistent states can occur:

| Case | `in-progress/<slug>/` | `backlog/<slug>/` | REQ says? |
|---|---|---|---|
| A (covered) | REQ + overview | overview only | prefer in-progress |
| B (not covered) | overview only | REQ + overview | ??? |
| C (not covered) | REQ | REQ | ??? |
| D (not covered) | nothing | REQ (no overview) | ??? |

Case D in particular is plausible: a PM hand-drafts a REQ in `backlog` without first writing an overview. This should be legal. REQ-PD-02's ordering "check `in-progress` first and `backlog` second" resolves Case D for overview detection, but it does not say that the chosen *folder* for subsequent operations is the one where the REQ lives.

Recommend either: (a) making REQ-PD-03 exhaustive with a full decision table, or (b) stating "the lifecycle folder chosen for workflow start is the first one (in the in-progress → backlog search order) that contains a REQ; if no REQ is found, the first one that contains an overview."

---

### F-04 — Silent on `FeatureResolver` reuse (Medium)

**Severity:** Medium

The codebase already has `FeatureResolver` at [ptah/src/orchestrator/feature-resolver.ts](../../../ptah/src/orchestrator/feature-resolver.ts) which:

- Accepts a `FileSystem` dependency via constructor injection
- Resolves a slug to `{ found, path, lifecycle }` across all three lifecycle folders
- Strips `NNN-` prefixes on completed entries

The REQ is silent on whether the fix must reuse this resolver or build a parallel detection path. Given the C-05 constraint in the sibling REQ ("reuse existing abstractions"), and the Definition-of-Done-grade principle of not duplicating infrastructure, this REQ should explicitly state the fix must extend or reuse `FeatureResolver`. Without that guidance, the TSPEC author may introduce a second detection path that drifts from the first.

Recommended addition as either an assumption (A-05) or a constraint (C-05): *"The fix must reuse the existing `FeatureResolver` abstraction for slug-to-folder resolution. Any new filesystem checks (e.g., 'does `REQ-<slug>.md` exist inside the resolved folder?') must accept a `FileSystem` dependency through constructor injection and must not instantiate a filesystem client directly."*

This also answers an implicit architectural question: `TemporalOrchestrator` does not currently hold a `FileSystem` — the fix requires either (a) adding `FileSystem` to `TemporalOrchestratorDeps`, or (b) injecting an already-wired `FeatureResolver` (or a thin new `ReqDetector` that wraps it). Stating the preference in the REQ avoids drift.

---

### F-05 — REQ-PD-02 wording is internally inconsistent (Low)

**Severity:** Low

REQ-PD-02 description: *"The orchestrator must also determine whether `overview.md` exists in the resolved feature folder."* (singular "resolved folder")

But the acceptance criteria then say: *"I check `docs/in-progress/<slug>/overview.md` first and `docs/backlog/<slug>/overview.md` second"* — i.e., it checks both folders.

The description and AC are at odds. Either the detection happens in both folders (matching AC), or it happens only in a pre-resolved single folder (matching description). Reword the description to match the AC.

---

### F-06 — Requirements Summary counts are off (Low)

**Severity:** Low

Section 8 "By Priority" says:

| Priority | Count | IDs |
|---|---|---|
| P0 | 10 | REQ-PD-01, REQ-PD-02, REQ-PD-04, REQ-WS-01, REQ-WS-02, REQ-WS-03, REQ-WS-04, REQ-WS-05, REQ-ER-01, REQ-ER-03, REQ-NF-02, REQ-NF-03 |

The list has 12 entries, not 10. The note beneath attempts to reconcile ("P0 count of 10 covers the functional requirements; non-functional P0s are counted separately") but no separate row is shown for NF-P0. Fix the count to 12 (or split into two rows).

---

### F-07 — REQ-ER-02 "structured log entry" lacks a specified interface (Low)

**Severity:** Low

REQ-ER-02 requires a structured log with specific fields (`slug`, `lifecycle`, `reqPresent`, `overviewPresent`, `startAtPhase`). REQ-NF-04 requires emission "via the existing logger interface, not `console.log` directly."

The existing [`Logger`](../../../ptah/src/services/logger.ts) interface in this project accepts string messages only (e.g., `this.logger.info("message")`). There is no structured-fields overload. Engineering can satisfy REQ-ER-02 by serializing the fields into the message string (e.g., `logger.info(\`phase-detection slug=${slug} lifecycle=${lifecycle} reqPresent=${reqPresent} ...\`)`), but calling this a "structured log" may create a false expectation of machine-parseable output.

Clarify either: (a) "structured" here means "key-value pairs embedded in the message string," or (b) the Logger interface is expected to be extended as part of this fix (in which case it is no longer a minimal bug fix).

---

## Clarification Questions

### Q-01 — Is REQ-ER-01 intentionally a breaking change to the Discord bootstrap flow?

See F-01. If yes, this REQ should be blocked on `orchestrator-discord-commands` delivering the `@ptah create backlog` path. If no, REQ-ER-01 should be dropped.

### Q-02 — What happens when the resolved folder is in `docs/completed/`?

See F-02. Three plausible interpretations exist; pick one.

### Q-03 — Is `REQ-017` the correct parent?

The document cites REQ-017 (Temporal Integration Completion) as the parent. However, `startNewWorkflow` and the unconditional `req-creation` start predate 017 — it was introduced with REQ-015 (Temporal Foundation) when `TemporalOrchestrator` replaced the legacy dispatcher. If the intent is "this fixes a bug in the Discord routing layer that REQ-017 formalized," the current parent is fine. If the intent is "this fixes the component that first introduced the behavior," REQ-015 is more accurate. Confirm.

### Q-04 — Is the fix expected to verify `startAtPhase: "req-review"` works end-to-end before landing, or is that verification deferred to the TSPEC/PLAN phase?

Risk R-01 identifies this as the most load-bearing assumption of the whole feature. The REQ should state explicitly whether a spike/proof-of-concept is required before the TSPEC is approved, or whether it is acceptable to defer verification into the first implementation task (which would make R-01's mitigation a PLAN responsibility, not a REQ-time responsibility).

---

## Positive Observations

- **Data-loss framing is compelling.** The overview makes the urgency crystal clear and correctly identifies this as a defect rather than a feature.
- **The core fix is verified feasible.** `TemporalClient.startFeatureWorkflow` already accepts `startAtPhase` ([client.ts passed through at temporal-orchestrator.ts:217](../../../ptah/src/orchestrator/temporal-orchestrator.ts#L217)). The only missing piece is phase detection before the call.
- **REQ-PD-04 (read-only detection)** is exactly the right invariant for a bug fix — no side effects during inspection.
- **REQ-WS-05 (preserve ad-hoc directive routing)** correctly scopes the blast radius to `startNewWorkflow` only, leaving the dominant agent-mention-against-running-workflow path untouched.
- **REQ-WS-03 (never invoke `req-creation` when REQ exists)** is stated as an invariant across retries and recovery, which is the right framing for a Temporal workflow.
- **Acceptance criteria are in Who/Given/When/Then format** and are specific enough to drive unit tests.
- **Risk R-01 correctly identifies the most important verification step** (confirming `req-review` startup actually skips `req-creation`) and proposes a reasonable mitigation (write the failing integration test first).

---

## Recommendation

**Needs revision.**

F-01 is High severity and must be resolved by either dropping REQ-ER-01 or explicitly blocking this feature on the sibling feature. F-02, F-03, and F-04 are Medium severity and introduce ambiguities that would block TSPEC authoring. F-05/F-06/F-07 are Low severity cleanups.

Per the mandatory decision rules: with one High and three Medium findings, the recommendation cannot be "Approved" or "Approved with minor changes." The author must address all High and Medium findings and route the updated REQ back for re-review.

**Suggested minimal revision scope (to keep this fix truly minimal):**

1. Drop REQ-ER-01 (resolving F-01). When neither REQ nor overview exists, preserve today's behavior: start at `req-creation`, let the PM skill's Phase 0 bootstrap handle folder creation.
2. Add explicit behavior for `docs/completed/` features (resolving F-02). Recommended: detection returns "no REQ found" for completed features, preserving today's behavior (which may be "workflow already started" from Temporal's side).
3. Broaden REQ-PD-03 into an exhaustive decision table (resolving F-03).
4. Add constraint C-05 requiring reuse of `FeatureResolver` (resolving F-04).
5. Fix the wording (F-05), counts (F-06), and logger interface clarification (F-07).

With those changes, the REQ becomes a ~8-requirement minimal bug fix that is ready for TSPEC.
