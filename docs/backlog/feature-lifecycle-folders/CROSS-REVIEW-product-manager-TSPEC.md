# Cross-Review: Product Manager — TSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager (`pm`) |
| **Document Reviewed** | TSPEC-feature-lifecycle-folders |
| **Date** | April 4, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — High: §9.2 SKILL.md update scope is insufficient to satisfy REQ-SK-01

**TSPEC §8** maps REQ-SK-01 to "PM skill SKILL.md update — Creates folders under `docs/backlog/`." However, **TSPEC §9.2** describes the scope of all SKILL.md updates as limited to the "File Organization or Working with Project Documentation section."

The PM SKILL.md contains a Phase 0 bootstrap algorithm (Steps 3, 4, 6, 7, 8) that hardcodes `docs/{full-folder-name}` as the target directory for `mkdir`, the idempotency existence check, and the `overview.md` write. An engineer following §9.2 as written would update only the File Organization documentation section and leave Phase 0 untouched. New features would continue to be created flat under `docs/` even after the migration, making the backlog/in-progress lifecycle meaningless for all future features.

The TSPEC must explicitly specify the Phase 0 changes required in the PM SKILL.md:
- Step 3 idempotency check: change path from `docs/{feature-slug}` to `docs/backlog/{feature-slug}`
- Step 4B NNN calculation: scan `docs/backlog/` (or clarify that NNN is no longer needed for unnumbered slugs)
- Step 6 mkdir: change target from `docs/{full-folder-name}` to `docs/backlog/{feature-slug}`
- Steps 7–8 overview.md write: change path accordingly

**Impact:** Without this, REQ-SK-01 is unimplemented at runtime even after all code changes ship.

---

### F-02 — Medium: §5.5 context document resolution is ambiguous for `overview.md` in completed features

The resolution table in §5.5 maps `{feature}/overview → {featurePath}overview.md` without any NNN-prefix qualification.

Per FSPEC-PR-01 Phase 2, **all** files in a completed folder that do not already carry the `{NNN}-` prefix are renamed — this explicitly includes `overview.md`. After promotion, the file lives at `{featurePath}{NNN}-overview.md`, not `{featurePath}overview.md`.

The NNN-prefix logic described below the table uses REQ as its only example. This creates ambiguity: does the NNN rule apply only to REQ, or to all document types? The table itself suggests `overview.md` is exempt, which contradicts the FSPEC.

The TSPEC must either:
- Extend the NNN-prefix rule explicitly to all document types in the table (overview, REQ, FSPEC, TSPEC, PLAN, PROPERTIES), or
- Clarify that overview.md is intentionally excluded from Phase 2 renaming (which would require a corresponding change to FSPEC-PR-01 Phase 2's "all files" scope)

**Impact:** If left ambiguous, the context assembler will silently fail to read documents from completed features, since it will look for `overview.md` where `{NNN}-overview.md` exists.

---

### F-03 — Low: Dead code branch in §5.9 migration algorithm Step 4

Step 3 of the migration algorithm moves all `docs/` folders matching `/^[0-9]{3}-/` to `docs/completed/`. After Step 3 completes, no NNN-prefixed folders remain in `docs/`. Step 4 then scans "remaining directories" and includes the sub-branch "If has NNN prefix" — but this branch can never be reached because all NNN-prefixed folders were already moved in Step 3.

The "If has NNN prefix" path in Step 4 (with its strip-prefix and git mv logic) is dead code that cannot execute. This is misleading to an engineer implementing the migration and raises a question about whether the algorithm is handling some edge case that was later removed without cleaning up the conditional.

**Recommendation:** Remove the dead branch from Step 4, or add a comment explaining why it is unreachable if it is intentionally left as a guard.

---

## Clarification Questions

**Q-01:** For the PM SKILL.md Phase 0 update: once features are created in `docs/backlog/{feature-slug}/` (unnumbered), the Phase 0 NNN calculation logic (Step 4B) that scans `docs/` for existing `^[0-9]{3}-` folders becomes irrelevant — new features in backlog are never numbered. Should Phase 0 entirely remove the NNN assignment logic, or is the numbered format still needed for some other path (e.g., when creating a feature that is bootstrapped directly into in-progress or completed)?

**Q-02:** Related to F-02 — is the intent that `overview.md` retains its unnumbered name even in `completed/` folders (i.e., it is intentionally exempt from Phase 2 renaming)? If so, this is a product decision that should be documented in the FSPEC as an exception to Phase 2's "all files" rule.

---

## Positive Observations

- The TSPEC faithfully implements FSPEC-PR-01's three-phase promotion flow (folder move, file rename, internal reference update) including the per-phase idempotency checks from BR-05.
- Sign-off detection in §5.7 correctly requires both `test-engineer` and `product-manager` and carries `signOffs` through `continue-as-new` boundaries per BR-07.
- The two open questions resolved in §10 (OQ-01 wrapping resolver in a Temporal activity, OQ-03 nulling `worktreeRoot` on CAN) are correctly aligned with FSPEC-SK-01 and FSPEC-WT-01 intent.
- The requirement-to-component mapping in §8 is thorough and correctly traces all REQ-* items.
- Error handling table in §6 is consistent with FSPEC error scenarios (non-retryable for structural failures, retryable for push conflicts, log-and-continue for reference update parse errors).

---

## Recommendation

**Needs revision.** F-01 (High) is a gap that leaves REQ-SK-01 unimplemented at runtime. F-02 (Medium) creates an ambiguity between the TSPEC and FSPEC that will cause silent runtime failures in context document reading for completed features. Both must be addressed before implementation begins. F-03 is non-blocking but should be cleaned up.

The author must address F-01 and F-02 and route the updated TSPEC back for re-review.
