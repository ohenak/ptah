# Cross-Review: Test Engineer — FSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | test-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 1 (initial TE review of v1.1) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

One new Medium finding and one new Low finding from the test-engineer perspective, plus three concurring Medium/Low assessments on findings already raised by the backend-engineer review of v1.1. The FSPEC is structurally sound — flows are complete, most acceptance tests are well-specified, and the key invariants (no-partial-merge, ordered-merge, test-gate-once-per-topological-batch) are all testable from the current text. The revisions needed are narrow.

---

## New Findings (TE-specific)

### F-01 — MEDIUM: FSPEC-PD-03 does not specify behavior for unrecognized Source File prefixes

**Location:** §2.3.1 path prefix → skill mapping table; §2.3.2 skill assignment precedence rules

**Issue:** The mapping table enumerates 10 prefix categories (`src/`, `config/`, `tests/`, `bin/`, `app/`, `components/`, `pages/`, `styles/`, `hooks/`, `docs/`) plus a `—`/empty fallback. However, no rule is given for a Source File entry that matches none of these prefixes — for example `lib/foo.ts`, `utils/bar.ts`, `scripts/baz.sh`, or any other directory structure that real-world plans might use.

The precedence rules in §2.3.2 are four-exhaustive *only* for the defined prefixes:
1. All backend-only prefixes → backend-engineer
2. All frontend-only prefixes → frontend-engineer
3. Mixed → backend-engineer + warning
4. All `docs/` or empty → backend-engineer (silent)

A file with prefix `lib/` falls through all four rules. A test author cannot write a deterministic test for a phase whose task table has `lib/foo.ts` as a Source File — the expected outcome is genuinely undefined. An implementer is equally stuck and will silently invent a fallback rule (likely treating it as "empty" → silent backend default), which may or may not match the product intent.

This is more common than it might appear: documentation phases sometimes list `docs/` files alongside `README.md` (no directory prefix), and automation scripts reference `scripts/` paths.

**Required fix:** Add a rule to §2.3.2 (and a row to the §2.3.1 mapping table) for Source File entries whose prefix is not in any recognized list. One of the following resolutions:
  - Option A: "Any unrecognized prefix is treated as a backend path (silent default, no warning)."
  - Option B: "Any unrecognized prefix triggers a warning identical to the mixed-layer warning, and defaults to backend-engineer."

Either option produces testable behavior. The PM should choose; the fix is one sentence.

---

### F-02 — LOW: No acceptance test for the confirmation timeout exit condition (FSPEC-TL-01 §2.4.3)

**Location:** §2.4.3 Modification Loop Termination Rules, fourth bullet

**Issue:** §2.4.3 defines four distinct termination conditions with named output messages:
1. User types **approve** → execution begins (AT-TL-01-01 ✅)
2. User types **cancel** → "Execution cancelled by user." (AT-TL-01-04 ✅)
3. Modification loop cycles 5 times → max iterations message, re-present plan (AT-TL-01-05 ✅)
4. No user response within 10 minutes → "Confirmation timeout — execution cancelled." ❌ **No AT**

The timeout condition is fully specified (trigger: 10-minute no-response; output message: "Confirmation timeout — execution cancelled"; result: no agents dispatched), making it directly testable. However, no AT documents it. Three of four conditions have ATs; the fourth was likely overlooked.

The no-automatic-approval constraint is P0 — the tech lead must never begin execution without explicit user approval. The timeout path is one of only two cases where execution halts without user explicitly typing "cancel". An AT documenting the expected message and no-dispatch outcome helps test authors write the timeout test case without ambiguity.

**Required fix:** Add AT-TL-01-06 covering the 10-minute no-response timeout:
```
WHO:   As the developer
GIVEN: A batch plan has been presented; the developer does not respond for 10 minutes
WHEN:  The tech lead's confirmation timeout fires
THEN:  "Confirmation timeout — execution cancelled." is posted in the coordination thread
       No agents are dispatched; no worktrees are created
```

---

## Concurring Findings (Previously Raised by Backend Engineer)

These findings were identified in the backend-engineer's v1.1 review. I concur and add TE-specific context on why each independently blocks test authoring.

---

### F-03 — MEDIUM (Concurring with BE F-01): "Any recognizable form" in FSPEC-PD-01 §2.1.2 step 4 prevents bounding the test set

**Location:** §2.1.2 step 4; AT-PD-01-01

**TE-specific concern:** From a testing perspective, "any recognizable form stating phase relationships is acceptable" produces an unbounded test domain. Test authors cannot enumerate:
- Which specific input strings the parser must accept (positive test cases)
- Which malformed strings must be rejected or fall through to sequential fallback (negative test cases)

The FSPEC's example `X → A, B` (comma-separated without brackets) is not in the REQ's enumerated forms (linear chain `A → B → C` and fan-out `A → [B, C]`). If a test is written for `X → A, B` based on the FSPEC example, and the implementation only handles the REQ forms, the test fails — but neither document is technically wrong.

AT-PD-01-01's "Task Dependency Notes" entry uses `B→A, C→A, D→B,D→C, E→D, F→D` — neither linear chain nor fan-out as specified in the REQ. This test example cannot be used as a template without knowing which syntax form it represents.

**Required resolution:** Enumerate the two supported syntax forms from REQ-PD-01 explicitly in FSPEC-PD-01 §2.1.2 step 4, and update AT-PD-01-01 to use one of those canonical forms. (Mirrors BE F-01 required fix.)

---

### F-04 — LOW (Concurring with BE F-02): Same-batch dependency move lacks an AT

**Location:** §2.4.2 step 2b; AT-TL-01-03

**TE-specific concern:** After the required fix (reject phase moves to the same batch as any dependency), an AT must be added for this case. AT-TL-01-03 currently tests only the "placed before dependency" rejection — the new "placed in same batch as dependency" rejection is a distinct behavior requiring its own test. Without an AT, test authors have no template for the same-batch rejection path.

---

### F-05 — LOW (Concurring with BE F-03): Sub-batch failure cascade behavior lacks an AT

**Location:** §2.6.1 sub-batch note + step 6; FSPEC-BD-02

**TE-specific concern:** After the required fix (explicit statement that failure in N.M cancels N.M+1 and beyond), an AT must be added covering the cascade. Existing ATs (AT-BD-02-01 through AT-BD-02-03) cover failure within a single regular batch but none covers:
- Sub-batch N.1 fails → sub-batch N.2 does not start
- The feature branch state when N.2 is cancelled (identical to pre-N.1 state, since no merges occurred)

This AT is important because the sub-batch model is the most complex control flow in the FSPEC and the most likely source of implementation bugs.

---

## Additional Low Observations

### F-06 — LOW: §2.1.4 edge cases lack formal ATs (dangling reference; plan with no task tables)

**Location:** §2.1.4 edge case table, rows 3 ("Plan has phases but no task tables") and 4 ("Dependency section references a phase letter not in the phase list")

Both behaviors are specified in the edge case table but have no corresponding ATs. AT-PD-01-01 through AT-PD-01-04 cover the four canonical cases (valid plan, missing dependency section, cycle, missing file), but the dangling-reference warning and no-task-table warning are testable behaviors with distinct output signatures ("Log warning identifying unknown phase; ignore that dependency line") that a test author needs templates for.

**Suggested resolution:** Add AT-PD-01-05 for dangling reference (unknown phase name in dependency declaration → warning logged, dependency line ignored, parse continues) and AT-PD-01-06 for no task tables (warning logged, continue with empty task tables, batch computed from phase headers only). These are Low severity since the behavior is fully described in the edge case table — the ATs are documentation aids, not blockers.

---

### F-07 — LOW (Concurring with BE F-04 and F-05): Traceability table missing REQ-PD-06; Check 2 behavioral pass condition unspecified

**Traceability (BE F-04):** REQ-PD-06 (cycle detection) is covered in FSPEC-PD-01 §2.1.2 step 6a and §2.1.5 but is absent from the §4 traceability table. This incorrectly implies REQ-PD-06 has no FSPEC coverage. From a test planning standpoint, the traceability table is used to map requirements → properties → tests. A missing entry means REQ-PD-06's test coverage appears unjustified in the PROPERTIES document.

**Check 2 mechanism (BE F-05):** The unspecified verification mechanism for ArtifactCommitter (§2.5.2 Check 2) also prevents writing a meaningful test for the pass/fail boundary. At minimum, a behavioral description of what constitutes a pass (e.g., "module exports `mergeBranchIntoFeature`" or "a capability flag exists in config") is needed so that a test double can be constructed.

---

## Positive Observations

- **The no-partial-merge invariant (FSPEC-BD-02 §2.7.3) is precisely specified and directly testable.** The reasoning is clear ("only complete batches are merged"), and the observable assertion is concrete: `git diff feat-branch-before-batch feat-branch-after-failed-batch` must be empty. This is the highest-value property in the FSPEC.

- **FSPEC-BD-03 resume logic via algorithm reuse is elegant and robust.** Auto-detection by re-running the completed-phase exclusion algorithm eliminates the resume-state synchronization problem entirely. This design produces exactly one testable entry point for both fresh-start and resume scenarios — the batch computation output — which minimizes test surface area.

- **The four termination conditions for the modification loop (§2.4.3) are each fully specified with distinct output messages.** Three of four have ATs (only the timeout lacks one, flagged above). The completeness here makes it straightforward to write all four test cases without implementation-level guessing.

- **The worktree cleanup timing rules (FSPEC-BD-02 §2.7.4) are precise and cover all four cases** (success cleanup, failure cleanup default, failure retention via flag, mixed-outcome batch). Each maps to an observable post-condition that tests can assert against.

- **AT-PD-02-01 and AT-PD-02-02 together provide a complete topological layering smoke test.** The before-resume / after-resume pair verifies both the layering algorithm and the completed-phase exclusion in a single pair of related test cases — efficient test design.

---

## Recommendation

**Needs revision.**

One new Medium finding (F-01: unrecognized Source File prefixes) and one concurring Medium (F-03: "any recognizable form") must be addressed before TSPEC authoring can begin. The new Low finding (F-02: missing timeout AT) and concurring Low findings (F-04, F-05, F-06, F-07) are recommended fixes that materially improve test completeness but do not block TSPEC authoring.

After the BE's Medium findings (F-01, F-02, F-03 in the BE cross-review) are resolved alongside these TE findings, the FSPEC will be ready for TSPEC authoring.

| Finding | Severity | Type | Status | Blocking? |
|---------|----------|------|--------|-----------|
| F-01 — Unrecognized Source File prefix behavior undefined (FSPEC-PD-03) | MEDIUM | New | ⬚ Open | Yes |
| F-02 — Missing AT for confirmation timeout (FSPEC-TL-01 §2.4.3) | LOW | New | ⬚ Open | No |
| F-03 — "Any recognizable form" prevents bounded test set (concurring BE F-01) | MEDIUM | Concurrence | ⬚ Open | Yes (already blocking) |
| F-04 — Same-batch dependency rejection missing AT (concurring BE F-02) | LOW | Concurrence | ⬚ Open | No |
| F-05 — Sub-batch failure cascade missing AT (concurring BE F-03) | LOW | Concurrence | ⬚ Open | No |
| F-06 — §2.1.4 dangling reference and no-task-table cases lack ATs | LOW | New | ⬚ Open | No |
| F-07 — REQ-PD-06 missing from traceability; Check 2 pass condition unspecified (concurring BE F-04, F-05) | LOW | Concurrence | ⬚ Open | No |

**Required before TSPEC authoring:** F-01 must be resolved (new TE Medium). F-03 (BE F-01) must also be resolved, as concurred. All Low findings are recommended but non-blocking.

Please address F-01 and coordinate with the backend-engineer review findings (BE F-01 through F-03) for a consolidated revision pass, then route back for re-review.
