# Cross-Review: Backend Engineer — FSPEC (Round 4)

| Field | Detail |
|-------|--------|
| **Reviewer** | backend-engineer |
| **Document Reviewed** | [014-FSPEC-tech-lead-orchestration v1.4](014-FSPEC-tech-lead-orchestration.md) |
| **Review Round** | 4 (re-review of v1.4) |
| **Date** | 2026-03-19 |
| **Recommendation** | **Needs revision** |

---

## Summary

All findings from backend-engineer Round 3 (BE F-01 Medium, BE F-02 Low, Cosmetic) and test-engineer Round 3 (TE F-01 Medium, TE F-02 Low, TE F-03 Low) are cleanly resolved in v1.4. The iteration counter rules, batch split rejection logic, expanded AT-TL-02-03, and revised §2.4.1 item 2 pre-flight status qualifier are all well-executed. The modification loop is now complete and consistently specified.

One new Medium finding was discovered: the worktree branch naming format prescribed in §2.6.1 is technically infeasible due to a git namespace collision with the existing feature branch. Two Low findings cover a missing acceptance test for the natural language dependency form and a guidance gap in the test gate failure resume scenario.

---

## Previous Findings — Status Check

| Finding | Description | Status |
|---------|-------------|--------|
| BE F-01 (Round 3) — MEDIUM | Recognized-but-rejected modifications not specified whether they count toward the 5-iteration limit | ✅ Resolved — §2.4.3 now explicitly states recognized-but-rejected modifications (dependency-violating move, same-batch move, dependency-violating split) do NOT advance the cycle counter; the rationale (no plan update, approve/modify/cancel prompt never reached) is unambiguous |
| BE F-02 (Round 3) — LOW | §2.4.1 item 2 "only shown when parallel mode" inconsistent with §2.5.3 pre-flight-fail display | ✅ Resolved — §2.4.1 item 2 now reads "shown when pre-flight ran and completed (regardless of whether it passed or failed)" with explicit NOT-shown condition for parse-time sequential fallback |
| BE Cosmetic (Round 3) — COSMETIC | Missing closing code fence in §2.4.2 | ✅ Resolved — code block is properly closed |
| TE F-01 (Round 3) — MEDIUM | §2.4.2(c) batch split has no dependency-violation rejection rule and no acceptance tests | ✅ Resolved — §2.4.2(c) now includes a rejection rule with specific error message; AT-TL-01-08 (valid split) and AT-TL-01-09 (dependency-violating split rejected) added |
| TE F-02 (Round 3) — LOW | AT-TL-02-03 THEN clause underspecified relative to AT-TL-02-02 | ✅ Resolved — AT-TL-02-03 now matches AT-TL-02-02 level of detail: failure message content, pre-flight status line text, and sequential execution outcome all specified |
| TE F-03 (Round 3) — LOW | §2.4.1 item 2 "parallel mode active" ambiguous for pre-flight-failure case | ✅ Resolved — addressed together with BE F-02 (Round 3) |

---

## New Findings

### F-01 — MEDIUM: Worktree branch naming format in §2.6.1 is technically infeasible in git

**Location:** FSPEC-BD-01 §2.6.1 step 2b

**Issue:** §2.6.1 step 2b prescribes:

> "The worktree branch is named: `feat-{feature-name}/phase-{X}-{timestamp}` (where {X} is the phase letter and {timestamp} is a short unique suffix)."

This naming format is incompatible with the feature branch `feat-{feature-name}` that must already exist on the remote at the time any worktree is created (validated by pre-flight Check 1 in FSPEC-TL-02).

In git, branch refs are stored as files under `.git/refs/heads/`. The branch `feat-{feature-name}` is stored as the file `.git/refs/heads/feat-{feature-name}`. Creating a second branch named `feat-{feature-name}/phase-{X}-{timestamp}` would require the filesystem path `.git/refs/heads/feat-{feature-name}/phase-{X}-{timestamp}`, which in turn requires `.git/refs/heads/feat-{feature-name}` to be a **directory**. It is already a **file**. The OS will not allow a path component to be simultaneously a file and a directory — git will reject the branch creation with an error such as:

```
error: cannot lock ref 'refs/heads/feat-{feature-name}/phase-A-123456':
'refs/heads/feat-{feature-name}' exists; cannot create 'refs/heads/feat-{feature-name}/phase-A-123456'
```

**Concrete example:** Feature branch `feat-014-tech-lead-orchestration` exists. Attempting to create `feat-014-tech-lead-orchestration/phase-A-1681234` fails because the ref `refs/heads/feat-014-tech-lead-orchestration` is already a file, not a directory.

**Impact:** Any implementation that follows §2.6.1 step 2b literally will fail at worktree provisioning time for every phase in every batch. Parallel execution is entirely broken by this naming conflict. No worktrees can be created.

**Required fix (two options):**

1. **Remove the naming format from the FSPEC** — the FSPEC Purpose section (§1) explicitly excludes "technical implementation choices" as out of scope. The specific branch naming format is a TSPEC concern. Remove step 2b's naming prescription and add a note: "The TSPEC must define a worktree branch naming convention that avoids conflicts with the persistent feature branch."

2. **Correct the naming format in the FSPEC** (if the FSPEC author intends to prescribe it) — replace the `/` separator with a `-`: `wt-{feature-name}-phase-{X}-{timestamp}` or simply `phase-{X}-{timestamp}` (no feature name prefix required since worktrees are local and short-lived).

Option 1 is preferred given the FSPEC's stated scope.

---

### F-02 — LOW: Natural language dependency Form 3 has no acceptance test

**Location:** FSPEC-PD-01 §2.1.2 step 4; §2.4.4 (acceptance tests section)

**Issue:** §2.1.2 step 4 specifies three canonical dependency syntax forms:

- Form 1 — Linear chain: `A → B → C`
- Form 2 — Fan-out: `A → [B, C]`
- Form 3 — Natural language: `Phase X depends on: Phase A, Phase B`

AT-PD-01-01 uses fan-out syntax (Form 2). AT-PD-01-02 through AT-PD-01-06 test missing sections, cycles, missing files, dangling references, and empty task tables — none of which specifically exercise Form 3 parsing.

Form 3 is the only syntax form with no dedicated acceptance test. A test author covering FSPEC-PD-01 cannot write a property test for Form 3 parsing behavior — specifically:

- Does "Phase X depends on: Phase A" (singular dependency, no comma) parse correctly?
- Does "Phase X depends on: Phase A, Phase B" (multiple dependencies) correctly produce two edges (A→X and B→X)?
- Is "Phase X depends on:" with no following phases treated as a parseable Form 3 line (but with no edges) or as a non-matching line?

These are implementation questions that require an acceptance test to resolve.

**Suggested fix (Low — non-blocking):** Add AT-PD-01-07 for Form 3 (natural language) dependency parsing:

```
AT-PD-01-07: Natural language dependency form
WHO:   As the Ptah orchestrator
GIVEN: A plan with phases A, B, C, D and a "Task Dependency Notes" section:
         "Phase C depends on: Phase A, Phase B"
         "Phase D depends on: Phase C"
WHEN:  The tech lead parses the plan
THEN:  The DAG contains edges: A→C, B→C, C→D
       No warnings are emitted
       Topological batching produces: Batch 1 = [A, B], Batch 2 = [C], Batch 3 = [D]
```

---

### F-03 — LOW: Test gate failure resume lacks developer guidance analogous to §2.6.2 merge conflict guidance

**Location:** FSPEC-BD-01 §2.6.1 step 8; AT-BD-01-02; §2.6.2

**Issue:** §2.6.2 provides explicit developer guidance for the partial-merge resume scenario after a merge conflict:

> "Before re-invoking the tech lead, the developer should assess whether re-implementing already-merged phases is safe for their project. If re-running a previously-merged phase would produce duplicate or conflicting changes, the developer should manually mark those phases as Done in the plan document before re-invoking."

AT-BD-01-02 (test gate failure) describes a state where "the feature branch has the Batch 2 implementation changes (merges succeeded) but the plan document still shows those tasks as not done." This is functionally identical to the partial-merge situation described in §2.6.2: implementation code is present on the feature branch, but the plan shows phases as Not Done. On resume, those phases are re-implemented over already-present code.

There is no developer guidance for this scenario. A developer who resumes after a test gate failure will find that the test gate failure phases are re-implemented over their previously-merged code without any advisory that this is happening. The merge conflict guidance (§2.6.2) tells developers how to avoid redundant re-implementation; the test gate failure path does not.

**Impact:** Developers may be surprised when phases are re-implemented over already-merged code after a test gate failure. In the worst case, re-implementation produces conflicting changes that cause a new merge conflict on the second run.

**Suggested fix (Low — non-blocking):** Add a note to §2.6.1 step 8 (or a new §2.6.3 analogous to the merge conflict handling note in §2.6.2) advising developers that after a test gate failure, phases are re-implemented over code already merged from this batch. Recommend the same developer action: manually mark those phases as Done in the plan document before re-invoking if re-implementation would be unsafe.

---

## Positive Observations

- **The iteration counter rules in §2.4.3 are precisely specified.** The "A cycle is counted each time the user successfully makes a recognized modification that reaches step 3 and step 4" definition is mechanically testable — a test author can trace exactly which requests increment the counter and which do not. The "recognized-but-rejected modifications" exemption is listed with specific examples (dependency-violating move, same-batch move, dependency-violating split), matching the §2.4.2(b)(c) content exactly.
- **AT-TL-01-08 and AT-TL-01-09 are the strongest new acceptance tests.** AT-TL-01-08 is the first AT to verify a successful modification beyond skill assignment — it covers a non-trivial three-phase split with a cross-batch dependency (D depends on C; C stays in Batch 2 before the new Batch 3). AT-TL-01-09 tests the rejection case with precise THEN content including the specific error message, retained plan state, and counter non-increment.
- **§2.4.3 "No automatic approval" statement is a valuable addition.** Explicitly stating "the tech lead never begins execution without an explicit approve response from the user" closes a potential ambiguity after the 5-iteration limit is reached — an implementer cannot misread the 5-iteration rule as an implicit approval trigger.
- **The §2.4.2(c) split rejection message format is well-structured.** Using `{X}` (the moved dependency) and `{Y}` (the dependent that stays) with specific batch numbers gives test authors a directly assertable template. AT-TL-01-09's THEN clause matches this template precisely.
- **Pre-flight status display qualifier in §2.4.1 item 2 is now implementation-safe.** "Shown when pre-flight ran and completed (regardless of whether it passed or failed)" with an explicit NOT-shown exception for parse-time sequential fallback eliminates the ambiguity that generated two rounds of Low findings.

---

## Recommendation

**Needs revision.**

One new Medium finding must be resolved before TSPEC authoring proceeds:

- **F-01** is a technical infeasibility that directly blocks implementation of the batch execution lifecycle. The prescribed worktree branch naming format (`feat-{feature-name}/phase-{X}-{timestamp}`) conflicts with the existing feature branch in git's ref namespace, causing every worktree creation to fail. No worktrees can be created under the current naming format. The fix — either removing the naming format from the FSPEC (deferring to TSPEC) or correcting it to use hyphens — is straightforward. The TSPEC will need to define a technically feasible convention.

The two Low findings (F-02, F-03) are non-blocking and may be addressed in the same pass or deferred to a documentation update alongside TSPEC authoring.

| Finding | Severity | Status | Blocks TSPEC? |
|---------|----------|--------|---------------|
| F-01 — Worktree branch naming `feat-{X}/phase-{Y}` infeasible in git; conflicts with `feat-{X}` branch | MEDIUM | ⬚ Open | Yes |
| F-02 — Natural language Form 3 dependency syntax has no acceptance test | LOW | ⬚ Open | No |
| F-03 — Test gate failure resume lacks developer guidance (analogous to §2.6.2 merge conflict guidance) | LOW | ⬚ Open | No |

Please address F-01 (Medium) and route back for re-review. F-02 and F-03 may be addressed in the same pass or deferred — they do not block TSPEC.
