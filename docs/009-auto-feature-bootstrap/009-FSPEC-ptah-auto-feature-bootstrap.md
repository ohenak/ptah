# Functional Specification: Phase 9 — Auto Feature Bootstrap

| Field | Detail |
|-------|--------|
| **Document ID** | FSPEC-PTAH-PHASE9 |
| **Parent Document** | [009-REQ-PTAH-auto-feature-bootstrap](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| **Version** | 1.0 |
| **Date** | March 13, 2026 |
| **Author** | Product Manager |
| **Status** | Approved |

---

## 1. Purpose

This functional specification defines the behavioral logic for Phase 9 — Auto Feature Bootstrap. Phase 9 adds a "Phase 0" step to the PM skill's workflow: before beginning Phase 1 (Discovery), the PM checks whether a feature folder exists and creates it if not.

Phase 9 contains 8 requirements in the AF domain organized into a single behavioral unit: **folder bootstrap**. The logic is concise but has several decision branches (numbered vs. unnumbered thread names, folder exists vs. missing, special-character slugification) that warrant explicit specification rather than leaving them to engineering discretion.

**What Phase 9 delivers:** When the PM skill is invoked on a thread with no existing feature folder, it automatically creates `docs/{NNN}-{feature-slug}/` and writes a synthesized `overview.md` from the user's initial message — before proceeding with Phase 1. Subsequent invocations on the same thread skip this step entirely (idempotent). The created files are committed to Git by the existing Phase 4 artifact commit pipeline.

**Relationship to context-assembler.ts:** The context assembler already calls `extractFeatureName()` to derive the folder path from the Discord thread name, and already handles missing folders gracefully (warning + empty context). Phase 9 does not change the context assembler — it ensures the folder is present by the time the assembler runs on the *next* invocation. The PM skill's own invocation does not benefit from Layer 1 context on the very first invocation (the folder is created *during* that invocation), but all subsequent invocations on the same thread will have the overview available.

**Relationship to Phase 4 (Artifact Commits):** The PM skill runs inside a Git worktree (FSPEC-SI-01, FSPEC-AC-01). The created folder and `overview.md` are normal file writes — they will be staged and committed by the Phase 4 artifact commit pipeline after the PM's invocation completes. No special commit logic is needed in Phase 9.

---

## 2. Scope

### 2.1 Requirements Covered by This FSPEC

| Requirement | Title | FSPEC |
|-------------|-------|-------|
| [REQ-AF-01] | Feature folder existence check | [FSPEC-AF-01] |
| [REQ-AF-02] | NNN prefix extraction from numbered thread name | [FSPEC-AF-01] |
| [REQ-AF-03] | NNN auto-assignment for unnumbered thread names | [FSPEC-AF-01] |
| [REQ-AF-04] | Feature slug derivation from thread name | [FSPEC-AF-01] |
| [REQ-AF-05] | Feature folder creation | [FSPEC-AF-01] |
| [REQ-AF-06] | overview.md synthesis and creation | [FSPEC-AF-01] |
| [REQ-AF-07] | Idempotency — skip if folder already exists | [FSPEC-AF-01] |
| [REQ-AF-NF-01] | Bootstrap is synchronous and precedes Phase 1 | [FSPEC-AF-01] |

### 2.2 Requirements NOT Requiring FSPECs

None — all 8 Phase 9 requirements are covered by FSPEC-AF-01.

---

## 3. FSPEC-AF-01: Feature Folder Bootstrap

| Field | Detail |
|-------|--------|
| **ID** | FSPEC-AF-01 |
| **Title** | Feature Folder Bootstrap |
| **Linked Requirements** | [REQ-AF-01], [REQ-AF-02], [REQ-AF-03], [REQ-AF-04], [REQ-AF-05], [REQ-AF-06], [REQ-AF-07], [REQ-AF-NF-01] |

### 3.1 Description

When the PM skill is invoked on a Discord thread, it runs a Phase 0 bootstrap check as its very first action — before any Phase 1 discovery activity. The check determines whether a feature folder matching the thread's name already exists in `docs/`. If the folder is present, the PM skips Phase 0 and proceeds to Phase 1 immediately. If the folder is absent, the PM creates it and writes `overview.md` before proceeding.

The bootstrap is invisible to the user when the folder already exists, and minimally visible (a brief log note) when it runs for the first time.

### 3.2 Inputs

| Input | Source | Description |
|-------|--------|-------------|
| Discord thread name | Orchestrator context bundle (Layer 3 trigger) | The full name of the Discord thread, e.g. `"009-auto-feature-bootstrap — create FSPEC"` |
| User's initial message | Orchestrator context bundle (Layer 3 trigger) | The first human message in the thread that triggered this invocation |
| `docs/` directory listing | Filesystem (worktree) | Used to determine existing NNN prefixes and detect folder existence |

### 3.3 Outputs

| Output | Description |
|--------|-------------|
| `docs/{NNN}-{feature-slug}/` | Created directory (new invocations only) |
| `docs/{NNN}-{feature-slug}/overview.md` | Created file with synthesized description (new invocations only) |
| None | On repeat invocations — no file system changes |

### 3.4 Behavioral Flow

```
PHASE 0: FEATURE FOLDER BOOTSTRAP
(runs before any Phase 1 activity)

1. EXTRACT FEATURE NAME FROM THREAD NAME
   a. Take the full Discord thread name
   b. Strip everything after the first occurrence of " — " (space–em-dash–space, Unicode U+2014 `—`)
      e.g. "009-auto-feature-bootstrap — create FSPEC"
           → "009-auto-feature-bootstrap"
   c. Apply slugification (Step 2) to the stripped result
   d. This produces the candidate folder name (without the docs/ prefix)
   NOTE: This mirrors extractFeatureName() in context-assembler.ts exactly.
         The PM must use identical logic so the folder name it creates matches
         the path the context assembler will look for on subsequent invocations.

2. SLUGIFY THE CANDIDATE FOLDER NAME
   Slugification rules (applied to the stripped thread name from Step 1):
   a. Lowercase all characters
   b. Replace any character that is not [a-z], [0-9], or [-] with a hyphen
   c. Collapse two or more consecutive hyphens into a single hyphen
   d. Strip any leading or trailing hyphens
   e. If the result is an empty string, use the fallback slug "feature" and log a warning:
      "[ptah:pm] Warning: thread name could not be slugified into a meaningful name.
       Using fallback slug 'feature'. Please rename the Discord thread."
   f. Result is the feature-slug (may include a NNN prefix if thread was numbered)

   Examples:
   "009-auto-feature-bootstrap"  → "009-auto-feature-bootstrap"  (no change)
   "My New Feature (v2)!"        → "my-new-feature-v2"           (spaces, parens, ! removed)
   "Auth -- Redesign"            → "auth-redesign"               (doubled hyphen collapsed)
   "!!! "                        → "" → fallback "feature"       (all special chars, warning logged)

3. CHECK FOR EXISTING FEATURE FOLDER
   a. Check if docs/{feature-slug}/ exists in the worktree filesystem
   b. If EXISTS → skip to Step 9 (no bootstrap needed)
   c. If NOT EXISTS → continue to Step 4

4. DETERMINE NNN PREFIX
   Decide whether the thread already specifies a number or one must be assigned:

   4a. NUMBERED THREAD (preferred path)
       Condition: The feature-slug (from Step 2) begins with exactly 3 digits
                  followed by a hyphen (regex: ^[0-9]{3}-)
       Action:    The NNN prefix is already embedded in the feature-slug.
                  No further action — the feature-slug IS the full folder name.
       Example:   "009-auto-feature-bootstrap" → folder = "009-auto-feature-bootstrap"

   4b. UNNUMBERED THREAD (auto-assignment path)
       Condition: The feature-slug does NOT begin with a 3-digit-hyphen pattern
       Action:
         i.  Scan docs/ for all entries matching the pattern NNN-* where NNN is
             exactly 3 digits (e.g. 001-init, 002-discord-bot, 009-auto-feature-bootstrap)
         ii. Find the highest NNN value among those entries
         iii. NNN = highest_value + 1, zero-padded to 3 digits
              If no numbered folders exist → NNN = "001"
         iv. Prepend NNN to the feature-slug:
             full-folder-name = "{NNN}-{feature-slug}"
       Example:   "my-new-feature", highest existing = 007-polish
                  → NNN = "008" → folder = "008-my-new-feature"

5. CONFIRM FINAL FOLDER NAME
   Final folder path = docs/{full-folder-name}/
   Log a note:
   "[ptah:pm] Bootstrapping feature folder: docs/{full-folder-name}/"

6. CREATE FEATURE FOLDER
   Create the directory docs/{full-folder-name}/ (equivalent to mkdir -p).
   If the directory already exists (race condition — another process created it
   between Step 3 and Step 6) → treat as success and continue.

7. SYNTHESIZE OVERVIEW CONTENT
   Generate the content for overview.md:
   a. Title: A Markdown H1 heading using the full-folder-name, with hyphens
      replaced by spaces and each word title-cased.
      e.g. "009-auto-feature-bootstrap" → "# 009 Auto Feature Bootstrap"
   b. Body: 1–3 sentences summarizing the feature, derived from:
      - The thread name (after stripping the task description after " — ")
      - The user's initial message content
      Keep it factual and concise — this is Layer 1 reference context, not a
      marketing description. If the initial message is itself very brief, one
      sentence is sufficient.
   c. The file must be valid Markdown with no front-matter.

   Example output for thread "009-auto-feature-bootstrap — create FSPEC"
   with user message "Create the FSPEC for Phase 9 — auto feature bootstrap":

   ---
   # 009 Auto Feature Bootstrap

   Automatic feature folder creation when the PM skill starts work on a new
   feature. Removes the manual prerequisite of creating `docs/{NNN}-{feature-name}/overview.md`
   before invoking the PM skill, by bootstrapping the folder as Phase 0.
   ---

8. WRITE OVERVIEW.MD
   Write the synthesized content to docs/{full-folder-name}/overview.md.
   This operation must complete (file flushed to disk) before any Phase 1
   activity begins (REQ-AF-NF-01).

9. PROCEED TO PHASE 1 (DISCOVERY)
   The PM skill resumes its normal PDLC workflow from Phase 1.
   On the first invocation (bootstrap ran in Steps 5–8): the overview.md
   is now available for subsequent context assembly. The PM's own Phase 1
   context bundle does NOT include this overview (it was created during
   this same invocation), but all future invocations on this thread will.
   On repeat invocations (Step 3 took the EXISTS branch): the overview.md
   was already present and Phase 1 has full Layer 1 context.
```

### 3.5 Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| AF-R1 | The slugification logic in Step 2 must be identical to the logic used by `context-assembler.ts`'s `extractFeatureName()`. If `extractFeatureName()` is ever updated, this FSPEC's Step 2 must be updated to match. | The folder name the PM creates must match exactly the path the context assembler will resolve on subsequent invocations. A mismatch means the folder exists but the context assembler cannot find it. |
| AF-R2 | The NNN prefix check (Step 4a) matches exactly 3 digits followed by a hyphen at the start of the feature-slug. It does NOT match 1-digit, 2-digit, or 4-digit prefixes. | The existing folder naming convention uses 3-digit prefixes throughout (001-init, 002-discord-bot, …). Accepting other lengths would create inconsistency. |
| AF-R3 | When auto-assigning NNN (Step 4b), the PM scans only the worktree's local `docs/` directory at the time of invocation. It does not fetch from remote or query Git history. | The worktree is already a recent clone of the main branch. Remote fetching adds latency and a network dependency that is unnecessary for a naming decision. Concurrent NNN conflicts are rare and recoverable (see R-09-01 in REQ document). |
| AF-R4 | The PM must not overwrite an existing `overview.md`. If the folder exists (Step 3 EXISTS branch), it proceeds to Phase 1 without touching any files. If the folder does not exist but somehow `overview.md` is present after `mkdir` (extremely unlikely), it must not overwrite it. | The overview.md may have been manually edited by a developer to provide richer context. Overwriting it on every invocation would lose that work. |
| AF-R5 | The bootstrap log note (Step 5) is the only visible signal that Phase 0 ran. The PM does not post a Discord embed, send a message, or otherwise surface the bootstrap action to the user. | Phase 0 is a housekeeping detail, not a product event. The user's experience is unchanged — they invoke the PM, and the PM starts Phase 1. |
| AF-R6 | If folder creation fails (Step 6) due to a filesystem error (e.g., permission denied), the PM must report the error clearly and halt. It must not proceed to Phase 1 with a broken state. | Proceeding without the folder would mean `overview.md` cannot be written, and the context assembler will continue warning on every subsequent invocation. |
| AF-R7 | If `overview.md` write fails (Step 8) due to a filesystem error, the PM must report the error clearly and halt. The folder will remain on disk (empty), which is acceptable — the context assembler handles empty folders gracefully. | An empty folder is preferable to no folder. Subsequent invocations will try again. The PM can recover by re-attempting the write in its next invocation. |
| AF-R8 | The Phase 0 bootstrap runs entirely within the PM skill's own SKILL.md instructions — it is not a feature of the orchestrator or context assembler. No changes to `orchestrator.ts` or `context-assembler.ts` are required **for standard thread names** (those following the `NNN-slug` convention with only lowercase alphanumeric characters and hyphens). If a thread name contains special characters requiring slugification, the folder the PM creates may not match the path `extractFeatureName()` resolves — this is a known limitation documented in assumption [A-09-03]. Full slugification support in `context-assembler.ts` is out of scope for Phase 9. | Option A was chosen over Option B to avoid orchestrator changes. The primary use case (standard thread naming) requires no `context-assembler.ts` update. |

### 3.6 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Thread name contains only a number prefix with no feature name (e.g., "009 — create FSPEC") | After slugification, the feature-slug is "009". Because "009" does NOT match the `^[0-9]{3}-` pattern (no trailing hyphen), Step 4b applies: NNN is auto-assigned (e.g., "008" if the highest existing numbered folder is "007"), producing a folder like `docs/008-009/`. **Known limitation:** `extractFeatureName()` in `context-assembler.ts` derives the path `docs/009/` from the thread name, which will not match the created folder. Developers should avoid naming threads with only a bare number. No error is raised; the PM proceeds normally. |
| Thread name has special characters that slugify to an empty string (e.g., "!!! — do stuff") | After stripping the task portion and slugifying, the result is "". Step 2f applies: the PM uses the fallback slug "feature" and logs a warning. Assign NNN prefix normally. The folder would be `docs/009-feature/` (numbered thread) or `docs/008-feature/` (unnumbered). The developer is expected to rename the thread; the warning message instructs them to do so. |
| Thread name has no " — " separator (e.g., "create requirements for auth") | Strip the entire thread name (no separator found → use full name). Apply slugification → "create-requirements-for-auth". Assign NNN normally. This is unusual but valid. |
| Two PM invocations run concurrently for different threads; both auto-assign NNN = "008" | Each runs in its own worktree. Both create `docs/008-{their-feature}/`. Both are committed via the Phase 4 pipeline. The first merge succeeds. The second merge succeeds (different folder names). No conflict. |
| Two PM invocations run concurrently for the SAME thread (e.g., user accidentally double-invokes PM) | Both try to create the same folder. The second mkdir succeeds because the folder already exists (Step 6: race condition → treat as success). Both write `overview.md`. The artifact commit pipeline may produce a duplicate commit or a merge conflict on the same file. Engineering should note this in the TSPEC — idempotent mkdir prevents crashes, but concurrent writes to `overview.md` should be handled gracefully. |
| The `docs/` folder does not exist at all (brand new repo, ptah init not yet run) | `ptah init` (Phase 1) creates `docs/` as part of scaffolding. This edge case implies `ptah init` was not run. The PM should detect that `docs/` is missing and log a clear error instructing the user to run `ptah init` first. It must NOT create `docs/` itself — that is `ptah init`'s responsibility. |
| Thread name begins with a 3-digit number but the folder with that number already exists for a *different* feature (e.g., thread "001-my-thing" but `docs/001-init/` already exists) | The PM checks for `docs/001-my-thing/` specifically (the slugified thread name), NOT `docs/001-init/`. The check is for the exact folder name, not just the NNN prefix. `docs/001-my-thing/` does not exist → PM creates it normally. Two features can share a NNN prefix if their slugs are different (though this is unusual and developers should avoid it). |

### 3.7 Acceptance Tests

**AT-AF-01: First invocation on numbered thread — folder created**

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "009-auto-feature-bootstrap — create FSPEC"
       and docs/009-auto-feature-bootstrap/ does NOT exist
       and the user's initial message is "Create the FSPEC for Phase 9 — auto feature bootstrap"
WHEN:  I run Phase 0 bootstrap
THEN:  1. I extract feature name: "009-auto-feature-bootstrap" (stripped after " — ")
       2. I slugify: "009-auto-feature-bootstrap" (no change)
       3. Folder check: docs/009-auto-feature-bootstrap/ — NOT FOUND
       4. NNN check: slug starts with "009-" → numbered thread → no auto-assignment needed
       5. I log: "[ptah:pm] Bootstrapping feature folder: docs/009-auto-feature-bootstrap/"
       6. I create: docs/009-auto-feature-bootstrap/
       7. I write: docs/009-auto-feature-bootstrap/overview.md with a 1–3 sentence
          summary of the auto feature bootstrap feature
       8. overview.md begins with "# 009 Auto Feature Bootstrap"
       9. I proceed to Phase 1
```

**AT-AF-02: Repeat invocation — folder exists, no file operations**

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "009-auto-feature-bootstrap — create requirements"
       (second invocation — Phase 2 work)
       and docs/009-auto-feature-bootstrap/overview.md already exists
       with content "# 009 Auto Feature Bootstrap\n\nAutomatic feature folder creation..."
WHEN:  I run Phase 0 bootstrap
THEN:  1. I extract feature name: "009-auto-feature-bootstrap"
       2. Folder check: docs/009-auto-feature-bootstrap/ — FOUND
       3. I skip all bootstrap steps (no mkdir, no file writes)
       4. I proceed directly to Phase 1
       5. overview.md is unchanged (still contains the original content)
```

**AT-AF-03: Unnumbered thread — NNN auto-assigned**

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "auth redesign — define scope"
       (thread name has no NNN prefix)
       and docs/ contains: 001-init/, 002-discord-bot/, 007-polish/
       and docs/auth-redesign/ does NOT exist
WHEN:  I run Phase 0 bootstrap
THEN:  1. I extract feature name: "auth redesign"
       2. I slugify: "auth-redesign"
       3. Folder check: docs/auth-redesign/ — NOT FOUND
       4. NNN check: "auth-redesign" does NOT start with 3-digit-hyphen
          → auto-assign: scan docs/, highest NNN = 007 → assign 008
       5. Full folder name: "008-auth-redesign"
       6. I create: docs/008-auth-redesign/
       7. I write: docs/008-auth-redesign/overview.md with a 1–3 sentence summary
       8. I proceed to Phase 1
```

**AT-AF-04: Thread name with special characters — slugified correctly**

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "OAuth 2.0 (Google) — implement flow"
       and the highest NNN in docs/ is 007
WHEN:  I run Phase 0 bootstrap
THEN:  1. I strip after " — ": "OAuth 2.0 (Google)"
       2. I slugify: lowercase → "oauth 2.0 (google)"
                    non-alphanumeric → "oauth-2-0--google-"
                    collapse hyphens → "oauth-2-0-google"
                    strip trailing → "oauth-2-0-google"
       3. Folder check: docs/oauth-2-0-google/ — NOT FOUND
       4. NNN auto-assign: highest = 007 → assign 008
       5. Folder created: docs/008-oauth-2-0-google/
       6. overview.md written with title "# 008 Oauth 2 0 Google" (or similar —
          the exact title format is up to engineering provided it is valid Markdown)
```

**AT-AF-05: docs/ folder missing — error reported, halt**

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "010-new-feature — plan"
       and the docs/ directory does NOT exist in the worktree
       (ptah init was not run)
WHEN:  I run Phase 0 bootstrap
THEN:  I detect that docs/ is missing
       I report a clear error: "docs/ directory not found.
       Please run 'ptah init' to scaffold the project structure before
       invoking the PM skill."
       I halt — I do NOT create docs/, do NOT proceed to Phase 1
```

**AT-AF-06: Filesystem error on folder creation — error reported, halt**

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "010-new-feature — plan"
       and docs/010-new-feature/ does NOT exist
       and the filesystem returns a permission denied error on mkdir
WHEN:  I attempt to create docs/010-new-feature/
THEN:  I report a clear error with the filesystem error details
       I halt — I do NOT attempt to write overview.md
       I do NOT proceed to Phase 1
```

**AT-AF-07: Thread with NNN matching an existing folder for a different feature — no conflict**

```
WHO:   As the PM skill
GIVEN: I am invoked on thread "001-custom-feature — design"
       and docs/001-init/ already exists (different feature)
       and docs/001-custom-feature/ does NOT exist
WHEN:  I run Phase 0 bootstrap
THEN:  1. I extract: "001-custom-feature"
       2. Folder check: docs/001-custom-feature/ — NOT FOUND
          (I check for the exact slug, not just the NNN prefix)
       3. I create: docs/001-custom-feature/ — success
       4. I write: docs/001-custom-feature/overview.md
       5. I proceed to Phase 1
       (docs/001-init/ is untouched)
```

### 3.8 Dependencies

- Depends on: [FSPEC-AC-01] (artifact commit pipeline commits the created folder and overview.md after the PM's invocation)
- Depends on: [FSPEC-SI-01] (worktree isolation — the PM runs in a worktree with a clean copy of docs/)
- Implementation target: `.claude/skills/product-manager/SKILL.md` — Phase 0 instructions added before Phase 1

---

## 4. Traceability Summary

| FSPEC | Requirements | Domain |
|-------|-------------|--------|
| FSPEC-AF-01 | REQ-AF-01, REQ-AF-02, REQ-AF-03, REQ-AF-04, REQ-AF-05, REQ-AF-06, REQ-AF-07, REQ-AF-NF-01 | Auto Feature Bootstrap |

**Coverage:** All 8 Phase 9 requirements are covered by 1 FSPEC. No requirements are left unspecified.

---

## 5. Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| — | None | — | All product decisions resolved during requirements definition. |

---

## 6. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 13, 2026 | Product Manager | Initial functional specification for Phase 9 — 1 FSPEC covering all 8 requirements |
| 1.1 | March 13, 2026 | Product Manager | Added Step 2f (empty-slug fallback to "feature") to behavioral flow; aligned edge case §3.6 row 2 with behavioral flow; updated status to Ready for Engineering Review |
| 1.2 | March 13, 2026 | Product Manager | F-01: corrected em-dash description in Step 1b (was "hyphen-hyphen", now "em-dash U+2014"); F-02: corrected edge case §3.6 row 1 — bare-number thread slugs go through auto-NNN path, not `docs/009/`; Q-01: extended AF-R8 to document known slugification scope limitation for non-standard thread names; status updated to Approved |

---

*Gate: User reviews and approves this functional specification before handoff to engineering.*
