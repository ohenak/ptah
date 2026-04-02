# Cross-Review: Product Manager Review of TSPEC-015

| Field | Detail |
|-------|--------|
| **Document** | 015-TSPEC-temporal-foundation.md (v1.0) |
| **Reviewer** | pm (Product Manager) |
| **Date** | April 2, 2026 |
| **Review Scope** | Product alignment — requirements coverage, acceptance criteria fidelity, FSPEC business rule adherence |

---

## Findings

### F-01: Fork/Join Retry Does Not Specify Full Re-Dispatch (Medium)

TSPEC Section 5.6 (Failure Flow) step 5a says:

> "retry" → re-dispatch Activity from scratch (clean slate)

This is the generic failure recovery and refers to re-dispatching a single Activity. However, FSPEC-TF-04 BR-14 requires:

> On retry after failure, ALL agents are re-dispatched, even ones that succeeded. This avoids stale worktree state.

When a fork/join phase enters the failure flow, the current TSPEC would only re-dispatch the failed agent. The successful agent's worktree was discarded (per the no-partial-merge invariant) but its work is lost — re-dispatching only the failed agent would produce results without the successful agent's contributions.

**Impact:** If implemented as written, a fork/join retry after one agent's failure would produce an incomplete result (only the re-dispatched agent's output, not both).

**Recommendation:** Add a fork/join-specific note to Section 5.6: "For fork/join phases, 'retry' re-dispatches ALL agents in the fork/join group (per BR-14), not just the failed agent. The workflow re-enters Section 5.3 from step 1."

---

### F-02: REQ-TF-01 Acceptance Criteria Has Stale Workflow ID Format (Low)

REQ-TF-01 description (v1.2) specifies the workflow ID as `ptah-feature-{slug}-{sequence}`, but the acceptance criteria still says `ptah-feature-{slug}` without the sequence number. The TSPEC correctly implements the `-{sequence}` format (Section 4.2, `TemporalClientWrapper.startFeatureWorkflow`).

This is a minor inconsistency in the REQ, not the TSPEC. The TSPEC is correct. Noting it here so the PM can fix the REQ AC in the next revision.

**Impact:** None on the TSPEC — the implementation is correct.

---

## Clarification Questions

None.

---

## Positive Observations

1. **Complete requirement coverage.** Section 14 maps all 20 requirements to specific technical components. No requirement is missing a corresponding technical design.

2. **FSPEC business rules faithfully implemented.** All 26 business rules (BR-01 through BR-26) from FSPEC v1.1 are reflected in the TSPEC:
   - BR-04a (fork/join Activities don't self-merge) → Section 6 step 8b
   - BR-12 (no partial merges) → Section 7 (merge Activity called by Workflow)
   - BR-14 (full re-dispatch) → Section 11.2 step 7c (migration) — but missing from failure flow (F-01)
   - BR-17 ("Approved with minor changes" = approved) → Section 5.5 step 4b
   - BR-26 (429 internal retry) → Section 6 step 9

3. **Clean separation of Workflow vs Activity responsibilities.** The TSPEC correctly places all I/O (skill invocation, git, notifications) in Activities and keeps the Workflow deterministic. This is critical for Temporal's replay model.

4. **The "Removed Files" table is excellent.** Section 3 explicitly lists every file being deleted and its replacement. This prevents ambiguity during implementation about what code to remove.

5. **Test strategy is comprehensive.** Three-level testing (unit → workflow logic → integration with TestWorkflowEnvironment) covers all behavioral flows. The test doubles (FakeTemporalClient, FakeSkillActivity) are well-designed for isolation.

6. **Config schema is well-designed.** `PhaseDefinition` captures all FSPEC requirements: agent/agents for single/fork-join, reviewers with discipline variants, skip_if, failure_policy, context_documents, revision_bound, and per-phase retry. The YAML format (Section 8.1) is readable and matches the REQ's intent for "any workflow in configuration."

7. **Migration tool correctly implements all FSPEC-MG-01 decisions.** Built-in mapping, custom --phase-map, fork/join reset, idempotent skip, review state transfer, and dry-run are all present.

---

## Recommendation

**Approved with minor changes.**

Only one finding of substance:
- **F-01 (Medium):** Fork/join retry in the failure flow should specify that ALL agents are re-dispatched. This is a clarification — the Workflow logic sections (5.3) already describe correct fork/join behavior, but the generic failure flow (5.6) doesn't explicitly reference it.
- **F-02 (Low):** REQ AC inconsistency is a PM task, not a TSPEC issue.

The TSPEC is implementable as-is with the F-01 clarification. The engineer should add the fork/join note to Section 5.6 before implementation begins.
