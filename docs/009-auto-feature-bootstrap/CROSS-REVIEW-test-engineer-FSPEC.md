# Cross-Review: Test Engineer — FSPEC-PTAH-PHASE9

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | [009-FSPEC-ptah-auto-feature-bootstrap.md](./009-FSPEC-ptah-auto-feature-bootstrap.md) |
| **Requirements Cross-Referenced** | [009-REQ-PTAH-auto-feature-bootstrap.md](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| **Prior Review** | [CROSS-REVIEW-backend-engineer-FSPEC.md](./CROSS-REVIEW-backend-engineer-FSPEC.md) — Approved with minor changes; v1.2 addressed F-01, F-02, Q-01 |
| **Date** | March 13, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Summary

The FSPEC is well-structured, precise, and covers the happy paths and most error halting scenarios thoroughly. The v1.2 revisions correctly addressed the backend engineer's high-priority findings. From a testing perspective, the primary concerns are: (1) three missing acceptance tests for specified code paths (empty-slug fallback, no-numbered-folders base case, and overview.md write failure), (2) a behavioral flow gap in the race-condition path that conflicts with business rule AF-R4, and (3) a non-automatable qualifier in AT-AF-04 that should be clarified. None of these block handoff to engineering — they can be addressed in the TSPEC and test plan — but two findings are worth fixing in this FSPEC before properties derivation.

---

## Findings

### F-TE-01 (High): No acceptance test for the empty-slug fallback (Step 2f)

**Location:** FSPEC §3.4 Step 2f; §3.6 edge case row 2

**Finding:**
Step 2f specifies a distinct code branch: when slugification produces an empty string, the PM uses the fallback slug `"feature"` and logs a warning. This is a separately reachable code path (triggered by thread names like `"!!! — do stuff"`). However, the acceptance tests in §3.7 contain no AT for this scenario. The edge case in §3.6 describes the behavior but acceptance tests are the authoritative test gate.

Without an acceptance test, there is no verifiable pass/fail criterion for this path. An implementation could omit the fallback entirely and no AT would catch it.

**Fix:** Add an acceptance test AT-AF-0X covering the empty-slug scenario:

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "!!! — do stuff"
       and docs/ exists with highest numbered folder docs/007-polish/
WHEN:  I run Phase 0 bootstrap
THEN:  1. I strip after " — ": "!!!"
       2. I slugify: non-alphanumeric → "---" → collapse → "-" → strip → ""
       3. Empty slug detected → fallback slug = "feature", warning logged:
          "[ptah:pm] Warning: thread name could not be slugified into a
           meaningful name. Using fallback slug 'feature'. Please rename the
           Discord thread."
       4. NNN auto-assigned: highest = 007 → NNN = "008"
       5. Folder created: docs/008-feature/
       6. overview.md written and begins "# 008 Feature"
       7. I proceed to Phase 1
```

---

### F-TE-02 (High): Behavioral flow gap — race-condition path (Step 6) does not protect overview.md before writing

**Location:** FSPEC §3.4 Steps 6–8; Business Rule AF-R4

**Finding:**
The behavioral flow has two paths that diverge at Step 3:
- **EXISTS path (Step 3b):** Folder exists → skip to Step 9. No file operations. AF-R4 is satisfied.
- **NOT EXISTS path (Step 3c):** Folder not found → continue to Step 4–8.

Within the NOT EXISTS path, Step 6 handles a race condition: if `mkdir` finds the directory already exists (another process created it between Step 3 and Step 6), the spec says "treat as success and continue." Continuing means Steps 7–8 execute: synthesize content and **write overview.md**. But if another process already created the folder, it may have already written `overview.md`.

AF-R4 states: "If the folder does not exist but somehow `overview.md` is present after `mkdir` (extremely unlikely), it must not overwrite it." However, AF-R4 is described as a footnote to an "extremely unlikely" scenario — it is not reflected in the behavioral flow as an explicit check before Step 8.

This is a real gap: the behavioral flow does not include a step to check `overview.md` existence before writing, leaving the race-condition protection as an implicit requirement that an engineer may not notice.

**Fix:** Add an explicit pre-write check in Step 8:

```
8. WRITE OVERVIEW.MD
   Before writing, check if docs/{full-folder-name}/overview.md already exists.
   If it EXISTS (race condition from Step 6 or other process) → skip the write,
   log a note: "[ptah:pm] overview.md already exists — skipping write."
   Proceed to Step 9.
   If it DOES NOT EXIST → write the synthesized content and flush to disk.
   This operation must complete before any Phase 1 activity begins (REQ-AF-NF-01).
```

Also add a corresponding acceptance test:

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "010-race-test — plan"
       and docs/010-race-test/ does NOT exist at Step 3
       and by the time mkdir runs (Step 6), another process has created
       docs/010-race-test/overview.md with content "Existing content"
WHEN:  I attempt to write overview.md
THEN:  I detect overview.md already exists
       I skip the write
       I log: "[ptah:pm] overview.md already exists — skipping write."
       The existing "Existing content" is preserved (not overwritten)
       I proceed to Phase 1
```

---

### F-TE-03 (Medium): No acceptance test for NNN auto-assignment starting from zero (REQ-AF-03 second criterion)

**Location:** FSPEC §3.4 Step 4b (iii); REQ-AF-03 second acceptance criterion

**Finding:**
REQ-AF-03 defines two acceptance criteria: one for auto-incrementing from an existing numbered folder (`007 → 008`), and one for the base case where **no numbered folders exist** (`→ 001`). The FSPEC behavioral flow (Step 4b(iii)) correctly specifies both sub-cases. However, the acceptance tests in §3.7 only cover AT-AF-03 (auto-increment from existing numbered folders). The base-case branch ("no numbered folders → NNN = 001") has no AT.

This is a distinct code path (the `max` calculation over an empty set must return 0 to produce "001"). An off-by-one or empty-collection error would not be caught.

**Fix:** Add an acceptance test AT-AF-0X covering the no-numbered-folders case:

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "my-first-feature — create requirements"
       and docs/ exists but contains NO entries matching the ^[0-9]{3}- pattern
       (e.g., docs/ is empty or contains only non-numbered folders)
WHEN:  I run Phase 0 bootstrap
THEN:  1. I strip: "my-first-feature"
       2. I slugify: "my-first-feature" (no change)
       3. Folder check: docs/my-first-feature/ — NOT FOUND
       4. NNN auto-assign: no numbered folders found → NNN = "001"
       5. Folder created: docs/001-my-first-feature/
       6. overview.md written
       7. I proceed to Phase 1
```

---

### F-TE-04 (Medium): No acceptance test for overview.md write failure (AF-R7)

**Location:** Business Rule AF-R7; FSPEC §3.4 Step 8

**Finding:**
AF-R7 specifies that if `overview.md` write fails due to a filesystem error, the PM must report a clear error and halt. AT-AF-06 tests folder creation failure (Step 6 permission denied). But there is no corresponding acceptance test for write failure at Step 8 — a separate code path with different failure semantics (AF-R7 notes the empty folder remains, unlike a full rollback).

**Fix:** Add an acceptance test AT-AF-0X:

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "010-new-feature — plan"
       and docs/010-new-feature/ does NOT exist
       and mkdir succeeds (folder created)
       and the filesystem returns a permission denied error on the overview.md write
WHEN:  I attempt to write overview.md
THEN:  I report a clear error with the filesystem error details
       I halt — I do NOT proceed to Phase 1
       docs/010-new-feature/ remains on disk (empty folder is acceptable)
```

---

### F-TE-05 (Low): AT-AF-04 step 6 uses "or similar" — renders title format non-automatable

**Location:** FSPEC §3.7 AT-AF-04, step 6

**Finding:**
AT-AF-04 step 6 states the overview.md title would be:
> `"# 008 Oauth 2 0 Google"` **(or similar — the exact title format is up to engineering provided it is valid Markdown)**

Giving engineering discretion on the title format is reasonable for an LLM-based skill, but the parenthetical contradicts Step 7a of the behavioral flow which prescribes a specific title algorithm: "replace hyphens with spaces and title-case each word." Applied to `"008-oauth-2-0-google"`, the deterministic result is `"# 008 Oauth 2 0 Google"`.

The "or similar" escape hatch means a test engineer cannot write an automated assertion for the title, even though the algorithm is fully deterministic for a given input.

**Options:**
- **Option A (recommended):** Remove "or similar" from AT-AF-04 step 6. The title algorithm in Step 7a is deterministic — use its exact output as the expected value. If the title format is truly flexible, remove Step 7a's title algorithm from the behavioral flow and explicitly make it LLM-discretion only (but this weakens testability significantly).
- **Option B:** Keep "or similar" but explicitly label AT-AF-04 as requiring human evaluation, not automation — consistent with backend engineer's F-04 observation about AT-AF-01 content quality.

---

### F-TE-06 (Low): AF-R1 (PM logic must match extractFeatureName) has no acceptance test

**Location:** Business Rule AF-R1; §3.4 Step 2 NOTE

**Finding:**
AF-R1 is identified as the most critical business rule in the spec: the PM's slugification must produce an identical result to `extractFeatureName()` in `context-assembler.ts`, or the created folder will never be found. This is the highest-impact correctness property in the entire feature.

Despite its importance, no acceptance test validates this alignment property. All ATs verify the PM's output in isolation — none verifies that the output matches `extractFeatureName()`'s expected output for the same input.

This is acknowledged as a design-level constraint (the PM reads and implements the same algorithm), but an acceptance test phrased from the context assembler's perspective would make the invariant explicit and testable:

```
WHO:   As the context assembler
GIVEN: The PM skill has just completed Phase 0 bootstrap for thread
       "009-auto-feature-bootstrap — create FSPEC"
       and the PM created docs/009-auto-feature-bootstrap/
WHEN:  I run extractFeatureName("009-auto-feature-bootstrap — create FSPEC")
THEN:  The returned path resolves to docs/009-auto-feature-bootstrap/
       (the exact folder the PM created — no mismatch)
```

This is more of a cross-system integration test than a unit test, so it belongs in the TSPEC's integration test strategy. Flagging for the TSPEC author's awareness.

---

### F-TE-07 (Low): Thread with no " — " separator has no acceptance test

**Location:** FSPEC §3.6 edge case row 3

**Finding:**
§3.6 row 3 specifies behavior for thread names with no ` — ` separator: "Strip the entire thread name (no separator found → use full name)." This is a valid code branch (the `indexOf` returns -1), but no acceptance test covers it.

**Fix (optional):** Add a low-priority acceptance test:

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "create requirements for auth"
       (no " — " separator)
       and the highest NNN in docs/ is 007
WHEN:  I run Phase 0 bootstrap
THEN:  1. No " — " separator found → use full thread name: "create requirements for auth"
       2. Slugify: "create-requirements-for-auth"
       3. NNN auto-assign: 007 → 008
       4. Folder: docs/008-create-requirements-for-auth/
       5. overview.md written, proceed to Phase 1
```

---

## Clarification Questions

### Q-TE-01: Is the NNN scan in Step 4b case-sensitive?

**Location:** FSPEC §3.4 Step 4b(i)

Step 4b(i) says: "Scan `docs/` for all entries matching the pattern `NNN-*` where NNN is exactly 3 digits." Filesystem directory listings are case-sensitive on Linux/macOS. The existing docs folders are all lowercase (`001-init`, `007-polish`, etc.).

However, if a developer manually creates a folder like `008-Init/` (with capital I), would it be detected by the NNN scan? The regex `^[0-9]{3}-` is case-insensitive for the digit portion (digits have no case), but the key question is: does the PM match `008-Init` as a numbered folder?

The answer should be yes — the leading `NNN-` pattern is purely numeric, so the folder `008-Init` would match `^[0-9]{3}-` and its NNN value (008) would factor into the max calculation. This seems correct and intended. No spec change needed — just confirming the TSPEC should codify this behavior explicitly.

### Q-TE-02: What content is used for overview.md when the user's initial message is very long?

**Location:** FSPEC §3.4 Step 7b

Step 7b says "1–3 sentences summarizing the feature, derived from the user's initial message." It also says "if the initial message is itself very brief, one sentence is sufficient." But it does not specify behavior when the initial message is extremely long (e.g., a developer pastes a full PRD into their first message).

This is likely fine for an LLM-based skill (it will naturally summarize), but the TSPEC should confirm whether there is a character limit or truncation policy for the synthesized overview.

---

## Positive Observations

1. **Seven acceptance tests (AT-AF-01 through AT-AF-07)** cover the primary happy paths and the most critical error scenarios comprehensively. The Who/Given/When/Then format is correct and the step-level assertions in AT-AF-01 are exactly what an automation framework needs.

2. **AF-R4 (no overwrite)** is correctly specified and aligns with idempotency principles. The observation in F-TE-02 is a flow gap, not a requirements gap — the intent is right.

3. **AT-AF-07** (exact slug check, not NNN prefix check) is the most important test in the suite for preventing false-positive folder detection. Correctly specified.

4. **The separation of numbered vs. unnumbered thread handling** (Steps 4a/4b) is clean and testable. The regex `^[0-9]{3}-` is precise and unambiguous.

5. **Error halting for both failure modes** (Step 6 mkdir failure in AF-R6, Step 8 write failure in AF-R7) is the correct design. Silent failures would degrade UX on every subsequent invocation.

6. **The known limitation in AF-R8** (slugification mismatch for non-standard thread names, i.e., `context-assembler.ts` not updated in scope) is honestly documented. From a testing perspective, this means the TSPEC should include an integration test verifying that for **standard** thread names (the primary use case), the PM and context assembler produce matching paths.

---

## Recommendation

**Approved with minor changes.**

- **Must fix before TSPEC (High priority):**
  - **F-TE-01:** Add acceptance test for empty-slug fallback (Step 2f). This code path has a specified log message and behavior but no AT to verify it.
  - **F-TE-02:** Add explicit file-existence check before overview.md write (Step 8) and corresponding acceptance test. The race-condition + AF-R4 protection is incomplete in the behavioral flow as written.

- **Should address before PROPERTIES derivation (Medium priority):**
  - **F-TE-03:** Add acceptance test for NNN = "001" base case (no numbered folders). REQ-AF-03 has this criterion but the FSPEC's ATs don't cover it.
  - **F-TE-04:** Add acceptance test for overview.md write failure (AF-R7 halt path). Mirrors AT-AF-06 for the subsequent write step.

- **Address in TSPEC (Low priority — no FSPEC change needed):**
  - **F-TE-05:** Decide: fix "or similar" in AT-AF-04 to use the deterministic title output, or mark explicitly as human-evaluation test. The TSPEC test strategy should document which ATs require human evaluation.
  - **F-TE-06:** TSPEC integration test strategy should include an AF-R1 alignment test verifying PM output matches `extractFeatureName()` output for standard thread names.
  - **F-TE-07:** Optional: add acceptance test for no-separator thread names.
