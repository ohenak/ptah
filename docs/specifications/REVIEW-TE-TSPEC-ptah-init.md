# Test Engineer Review: TSPEC-ptah-init.md

| Field | Detail |
|-------|--------|
| **Reviewed Document** | [TSPEC-ptah-init.md](./TSPEC-ptah-init.md) |
| **Requirements** | [REQ-IN-01 through REQ-IN-08, REQ-NF-06](../requirements/REQ-PTAH.md) |
| **Analysis** | [ANALYSIS-ptah-init.md](./ANALYSIS-ptah-init.md) |
| **PM Review** | [REVIEW-TSPEC-ptah-init.md](./REVIEW-TSPEC-ptah-init.md) |
| **Reviewer** | Test Engineer |
| **Date** | March 8, 2026 |
| **Status** | All questions resolved |

---

## 1. Documents Analyzed

| Document | Location | Findings |
|----------|----------|----------|
| Requirements | `docs/requirements/REQ-PTAH.md` | 9 requirements in scope (REQ-IN-01–08, REQ-NF-06), all P0 |
| Technical Specification | `docs/specifications/TSPEC-ptah-init.md` | 12 sections covering architecture, manifest, algorithm, services, error handling, tests |
| Analysis | `docs/specifications/ANALYSIS-ptah-init.md` | 10 questions resolved — all fed into TSPEC |
| PM Review | `docs/specifications/REVIEW-TSPEC-ptah-init.md` | 10 questions raised (Q1–Q10), conditional approval pending resolution |
| Execution Plan | — | None exists yet |

---

## 2. Integration Boundaries Identified

| # | Boundary | Components | Notes |
|---|----------|------------|-------|
| 1 | FileSystem protocol | `InitCommand` ↔ `NodeFileSystem` | Abstracts all disk I/O; test doubles replace in tests |
| 2 | GitClient protocol | `InitCommand` ↔ `NodeGitClient` | Abstracts all Git CLI calls; test doubles replace in tests |
| 3 | InitCommand composition | `bin/ptah.ts` wires `NodeFileSystem` + `NodeGitClient` → `InitCommand` | Composition root — no tests specified for wiring |
| 4 | `ptah.config.json` schema | Phase 1 (init) → Phase 2+ (Orchestrator) | Schema must remain backward-compatible |

---

## 3. Questions & Issues

### Q1: File count mismatch — 14 or 15?

| Field | Detail |
|-------|--------|
| **Severity** | Blocking |
| **TSPEC Section** | 9.3 (Test Categories) |
| **Also raised by** | PM Review Q1 |

TSPEC Section 9.3 states "All **15 files** created with correct content," but the Section 5.2 manifest lists only **14 files**:

| # | File |
|---|------|
| 1 | `docs/overview.md` |
| 2 | `docs/initial_project/requirements.md` |
| 3 | `docs/initial_project/specifications.md` |
| 4 | `docs/initial_project/plans.md` |
| 5 | `docs/initial_project/properties.md` |
| 6 | `docs/agent-logs/pm-agent.md` |
| 7 | `docs/agent-logs/dev-agent.md` |
| 8 | `docs/agent-logs/test-agent.md` |
| 9 | `docs/open-questions/pending.md` |
| 10 | `docs/open-questions/resolved.md` |
| 11 | `ptah/skills/pm-agent.md` |
| 12 | `ptah/skills/dev-agent.md` |
| 13 | `ptah/skills/test-agent.md` |
| 14 | `ptah.config.json` |

**Question:** Which file is the 15th, or should Section 9.3 say "14 files"?

**Test impact:** The exact file count determines the assertion in "All files created with correct content" tests. An incorrect count will cause false positives or negatives.

> **Resolution (Backend Engineer):** Fixed in TSPEC Rev 2 (PM review). The correct count is **17 files**: 14 content files + 3 `.gitkeep` files for empty directories (`docs/architecture/decisions/.gitkeep`, `docs/architecture/diagrams/.gitkeep`, `ptah/templates/.gitkeep`). Section 9.3 updated. Tests should assert `created.length === 17` for a clean init on an empty repo (excluding directories, which are not counted in `created[]` for files — see Q4 resolution).

---

### Q2: `hasChanges()` is unused in the algorithm

| Field | Detail |
|-------|--------|
| **Severity** | Clarification |
| **TSPEC Section** | 4.2 (GitClient interface, line 107) and 6 (Algorithm) |
| **Also raised by** | PM Review Q4 |

The `GitClient` interface defines `hasChanges(): Promise<boolean>` but the init algorithm never calls it. The commit-skip logic relies on `created[].length === 0` instead.

**Question:** Is `hasChanges()` dead API surface for Phase 1? Should it be removed from the interface to avoid untested code, or is there an intended use (e.g., a safety check before committing)?

**Test impact:** If kept, this method needs tests in `git.test.ts` even though no production code calls it in Phase 1. If removed, the `FakeGitClient` test double simplifies. Either way, dead interface methods create property-to-code mapping confusion.

> **Resolution (Backend Engineer):** Fixed in TSPEC Rev 2 (PM review). `hasChanges()` was repurposed as `hasStagedChanges()` and is now actively used in Algorithm step 2 as a pre-flight check. It is no longer dead code. The `FakeGitClient` test double includes `hasStagedReturn = false` (default) to control this behavior in tests. Tests should verify: (1) init exits with error when `hasStagedReturn = true`, (2) init proceeds normally when `hasStagedReturn = false`.

---

### Q3: Empty directories are not tracked by Git

| Field | Detail |
|-------|--------|
| **Severity** | Blocking |
| **TSPEC Section** | 5.1 (Directory manifest) and 6 (Algorithm) |
| **Also raised by** | PM Review Q2 |

Git does not track empty directories. The TSPEC creates directories that may contain no files after init:

| Directory | Has files? |
|-----------|------------|
| `docs/architecture/decisions/` | No |
| `docs/architecture/diagrams/` | No |
| `ptah/templates/` | No |

REQ-IN-07 acceptance criteria explicitly states "`ptah/templates/` exists as an empty directory."

**Impact:** `git add` will silently skip empty directories. They will not appear in the commit. After cloning the repo, these directories will not exist — violating REQ-IN-01 and REQ-IN-07.

**Question:** Should the spec add `.gitkeep` files to empty directories? If so, this changes the file manifest count (potentially resolving Q1) and the test expectations.

**Test impact:** Without resolution, any test asserting "all 9 directories exist after clone" will fail for these 3 directories. Tests running against in-memory `FakeFileSystem` will pass (since the fake tracks dirs independently of Git), creating a false sense of correctness — the integration boundary with real Git is where this breaks.

> **Resolution (Backend Engineer):** Fixed in TSPEC Rev 2 (PM review). Added `.gitkeep` files (empty, zero bytes) to all 3 empty directories: `docs/architecture/decisions/.gitkeep`, `docs/architecture/diagrams/.gitkeep`, `ptah/templates/.gitkeep`. These are included in the file manifest (Section 5.2) and counted in the 17-file total. The `FakeFileSystem` masking concern is valid — unit tests verify that `.gitkeep` files are written to the correct paths; the real Git behavior is implicitly covered because any file in a directory causes Git to track it. No separate integration test is needed for Phase 1.

---

### Q4: Directory skip/create reporting is ambiguous

| Field | Detail |
|-------|--------|
| **Severity** | Clarification |
| **TSPEC Section** | 6 (Algorithm, step 3a) |

The algorithm says: "If directory: check exists → if not, mkdir → add to `created[]`." But if a directory **already exists**, it is neither added to `created[]` nor `skipped[]`. Existing directories are silently dropped from the result.

REQ-IN-05 states: "Existing files are reported as skipped and their contents are preserved unchanged."

**Question:** Does REQ-IN-05's "existing files" extend to directories? Should already-existing directories be reported in `skipped[]`, or is silent omission intentional?

**Test impact:** This affects assertions for the second-run idempotency scenario. If directories should be in `skipped[]`, the expected `skipped` count changes significantly (9 dirs + 14 files = 23 vs. just 14 files).

> **Resolution (Backend Engineer):** Directories are NOT added to `skipped[]`. Silent omission is intentional. REQ-IN-05 says "existing **files**" — directories are structurally different. `mkdir({ recursive: true })` is inherently idempotent (succeeds silently if the directory already exists), so there is no meaningful "skip" event. Reporting directories as skipped would clutter the output without adding value. For idempotency tests: a second run with all files pre-existing should produce `created.length === 0`, `skipped.length === 17` (files only), `committed === false`. Algorithm step 4a updated with explicit clarification.

---

### Q5: `writeFile` parent directory creation is redundant with explicit `mkdir`

| Field | Detail |
|-------|--------|
| **Severity** | Clarification |
| **TSPEC Section** | 6 (Algorithm) and 7.1 (FileSystem Service) |

Section 7.1 specifies that `writeFile` "creates parent dirs if needed." The algorithm (Section 6, step 3a) also explicitly creates all directories before writing any files (step 3b). This creates two paths to directory creation.

**Question:** Which is the source of truth for directory creation?

| If... | Then tests should verify... |
|-------|-----------------------------|
| `mkdir` is authoritative | `mkdir` is called for every directory in the manifest |
| `writeFile` handles parents | Explicit `mkdir` calls may be unnecessary for directories that only exist as parents of files |

**Test impact:** This determines whether `FakeFileSystem` tests should assert on `mkdir` calls, `writeFile` calls, or both for directory creation behavior.

> **Resolution (Backend Engineer):** `mkdir` is the authoritative directory creation path. The algorithm (step 4a) explicitly creates all directories before writing files (step 4b). `writeFile`'s parent directory creation is a defensive safety net in the `NodeFileSystem` implementation, not a relied-upon behavior. Updated Section 7.1 to state this explicitly. Tests should assert: (1) `mkdir` is called for every directory in the manifest, (2) `writeFile` is called for every file in the manifest. Tests should NOT rely on `writeFile` creating parent dirs — the `FakeFileSystem` can treat `writeFile` as requiring pre-existing parents to validate the algorithm ordering.

---

### Q6: Commit message hardcoded vs. config `git.commit_prefix`

| Field | Detail |
|-------|--------|
| **Severity** | Clarification |
| **TSPEC Section** | 6 (Algorithm, step 6b) and 5.2 (`ptah.config.json`) |

The algorithm hardcodes the commit message as `"[ptah] init: scaffolded docs structure"`. The generated config contains `git.commit_prefix: "[ptah]"`. These are currently aligned but independently defined.

**Question:** Should the init command derive the prefix from the config, or is hardcoding intentional? Since the config file is being *created* during init (chicken-and-egg scenario), hardcoding seems reasonable — but the spec should state this explicitly.

**Test impact:** Tests need to assert the exact commit message. If the prefix is config-derived, the test must inject a config; if hardcoded, the test simply asserts the literal string. Clear spec prevents brittle tests.

> **Resolution (Backend Engineer):** Hardcoded is intentional — chicken-and-egg. The config file `ptah.config.json` is being **created** during init, so it cannot be read from yet. The commit message `"[ptah] init: scaffolded docs structure"` is a compile-time constant. Updated Algorithm step 7b with explicit note. Tests should assert the exact literal string: `expect(git.commits[0]).toBe("[ptah] init: scaffolded docs structure")`.

---

### Q7: `git add` failure not specified as a separate error scenario

| Field | Detail |
|-------|--------|
| **Severity** | Clarification |
| **TSPEC Section** | 8 (Error Handling) |

Section 8 covers four error scenarios: not a Git repo, Git not installed, permission denied on file write, and Git commit fails. `git add` failure is not listed separately.

**Question:** If `git add` fails (e.g., file locked by another process, `index.lock` exists), what is the expected behavior? Same as "Git commit fails" (exit code 1, files remain on disk), or a distinct handling path?

**Test impact:** Without clarity, the error-handling property set is incomplete. The `FakeGitClient` needs to know whether `add()` can throw and how `InitCommand` should respond.

> **Resolution (Backend Engineer):** `git add` failure is now a distinct error scenario in Section 8. Behavior: print error, exit code 1, files remain on disk (same as commit failure — no rollback). The `FakeGitClient` should support an `addShouldThrow` flag to simulate `add()` failures. Added "Git add/commit failure" as a test category in Section 9.3. Tests should verify: (1) when `add()` throws, files are already on disk, (2) the error is propagated, (3) `commit()` is never called after `add()` failure.

---

### Q8: No performance test for the < 30 second requirement

| Field | Detail |
|-------|--------|
| **Severity** | Coverage gap |
| **TSPEC Section** | 9.3 (Test Categories) |
| **Requirement** | Success Metrics (REQ-PTAH Section 5): `ptah init` must complete in < 30 seconds |

The Analysis document (Section 2) and Success Metrics both state `ptah init` must complete in **< 30 seconds**. No test category in Section 9.3 covers performance.

**Question:** Should there be a performance property and test? Given init does no network I/O and creates ~14 files, this is likely met implicitly — but an explicit timeout-based assertion would prevent regressions as the manifest grows.

**Test impact:** If included, this would be a unit-level property tested with a timeout wrapper around `InitCommand.execute()` using the in-memory `FakeFileSystem` (measuring logic time, not I/O time). Alternatively, it could be an integration-level property tested against real filesystem.

> **Resolution (Backend Engineer):** Added "Performance guard" as a test category in Section 9.3. This is a unit-level guard using a timeout wrapper around `InitCommand.execute()` with the in-memory `FakeFileSystem`. It measures logic time, not I/O — but since the algorithm is O(n) over ~17 files with no network calls, exceeding 30 seconds would indicate a serious regression (infinite loop, etc.). The test should use Vitest's `timeout` option: `it('completes within 30 seconds', async () => { ... }, { timeout: 30_000 })`. A real-filesystem integration test is deferred to Phase 2.

---

### Q9: No negative test for `docs/threads/` exclusion

| Field | Detail |
|-------|--------|
| **Severity** | Coverage gap |
| **TSPEC Section** | 5.1 and 9.3 |
| **Requirement** | REQ-IN-01 acceptance criteria: "no `docs/threads/` directory exists" |

The TSPEC notes the exclusion (Section 5.1: "Excluded: `docs/threads/` (C-07)") but Section 9.3 test categories don't include a negative test verifying `docs/threads/` is NOT created.

**Question:** Should there be an explicit test assertion that `docs/threads/` does not exist after `ptah init` runs? REQ-IN-01 AC explicitly calls this out, making it a testable acceptance criterion.

**Test impact:** A single assertion (`expect(fs.hasDir('docs/threads/')).toBe(false)`) in the directory creation test suite would cover this. Low cost, high traceability value.

> **Resolution (Backend Engineer):** Agreed. Added "Exclusion: docs/threads/" as a test category in Section 9.3. A single negative assertion (`expect(fs.hasDir('docs/threads/')).toBe(false)`) in the init test suite covers this. Low cost, direct traceability to REQ-IN-01 AC and constraint C-07.

---

### Q10: `project.name` fallback trigger condition is unspecified

| Field | Detail |
|-------|--------|
| **Severity** | Clarification |
| **TSPEC Section** | 5.2 (`ptah.config.json`) |

The TSPEC says `project.name` is "auto-detected from the current directory name via `path.basename(process.cwd())`, with fallback to `"my-app"`." However, `path.basename()` always returns a string — even for `/` it returns `""`.

**Question:** What triggers the fallback to `"my-app"`? Possible interpretations:

| Interpretation | Fallback triggers when... |
|----------------|---------------------------|
| A | `basename()` returns empty string (e.g., running from filesystem root) |
| B | `basename()` returns non-alphanumeric string |
| C | Schema default only — no runtime fallback branch exists |

**Test impact:** This determines the edge-case test suite for config generation. Without a clear condition, we cannot write precise boundary tests for `buildConfig()`.

> **Resolution (Backend Engineer):** Interpretation A — fallback triggers when `basename()` returns an empty string. Updated Section 5.2 with the exact condition: `basename === "" ? "my-app" : basename`. This covers the edge case of running from filesystem root (`/`). No validation of non-alphanumeric characters — any non-empty string from `basename()` is accepted as-is. Updated the "Config defaults" test category description in Section 9.3 to include the empty-basename fallback test. Tests should verify: (1) `buildConfig()` in `/Users/foo/my-project` → `project.name === "my-project"`, (2) `buildConfig()` with `cwd() === "/"` → `project.name === "my-app"`.

---

## 4. Overlap with PM Review

Several questions overlap with the [PM Review](./REVIEW-TSPEC-ptah-init.md). The following maps test engineer questions to PM questions and notes where the test perspective adds new concerns:

| TE Question | PM Question | Additional test concern |
|-------------|-------------|------------------------|
| Q1 (file count) | PM Q1 | Same issue — test assertion count depends on resolution |
| Q2 (hasChanges) | PM Q4 | TE adds: dead interface methods create property mapping confusion |
| Q3 (empty dirs) | PM Q2 | TE adds: `FakeFileSystem` will mask this bug — only real Git integration reveals it |
| Q4 (dir reporting) | — | New — affects idempotency test assertions |
| Q5 (writeFile redundancy) | — | New — affects mock/assertion strategy |
| Q6 (commit prefix) | — | New — affects test brittleness |
| Q7 (git add failure) | — | New — affects error-handling property coverage |
| Q8 (performance) | — | New — missing testable property from success metrics |
| Q9 (threads exclusion) | — | New — missing negative test for explicit AC |
| Q10 (name fallback) | — | New — affects edge-case test design |
| — | PM Q3 (overview.md extra section) | No test concern — traceability fix only |
| — | PM Q5 (dirty working tree) | Agree this is significant — would add as error-handling property |
| — | PM Q8 (naming collision) | No test concern for Phase 1 |
| — | PM Q9 (.gitignore) | No test concern for Phase 1 |

---

## 5. Summary

| Severity | Count | Question IDs |
|----------|-------|--------------|
| **Blocking** (affects correctness) | 2 | Q1, Q3 |
| **Clarification** (ambiguous spec) | 6 | Q2, Q4, Q5, Q6, Q7, Q10 |
| **Coverage gap** (missing tests) | 2 | Q8, Q9 |
| **Total** | 10 | |

### Top Priority Items

1. **Q3 — Empty directories + Git** is the highest-risk item. It will cause a silent behavioral bug where `ptah/templates/` and the `docs/architecture/` subdirectories don't survive a `git clone`, violating REQ-IN-01 and REQ-IN-07 acceptance criteria. Critically, the in-memory `FakeFileSystem` test doubles will **not** catch this — they track directories independently of Git. Only real Git integration testing would reveal the failure. A design decision (`.gitkeep` or equivalent) is needed before proceeding.

2. **Q1 — File count** is a documentation error that should be corrected to prevent incorrect test assertions.

---

## 6. Next Steps

Once the questions above are resolved, the Test Engineer will proceed to:

1. **Phase 2: Property Documentation** — Catalog all testable properties derived from requirements and this specification, saved to `docs/testing/in_review/PROPERTIES-ptah-init.md`.
2. **Phase 3: Plan Augmentation** — Enrich the execution plan (once created) with concrete test scripts per task.

---

*Reviewed by Test Engineer on March 8, 2026. Pending resolution of questions before proceeding to Phase 2.*

---

## Engineer Responses (March 8, 2026)

All 10 questions have been resolved. Summary of changes made:

| Question | Severity | Resolution | TSPEC Changed? |
|----------|----------|-----------|----------------|
| Q1 (file count) | Blocking | Corrected to 17 files (14 content + 3 `.gitkeep`) | Yes (Section 9.3) — fixed in Rev 2 |
| Q2 (hasChanges) | Clarification | Repurposed as `hasStagedChanges()`, now used in Algorithm step 2 | Yes (Section 4.2, 6) — fixed in Rev 2 |
| Q3 (empty dirs) | Blocking | Added `.gitkeep` files to 3 empty directories | Yes (Section 5.1, 5.2) — fixed in Rev 2 |
| Q4 (dir reporting) | Clarification | Directories NOT in `skipped[]` — only files. Clarified in algorithm. | Yes (Section 6, step 4a) — Rev 3 |
| Q5 (writeFile redundancy) | Clarification | `mkdir` is authoritative; `writeFile` parent creation is safety net only | Yes (Section 7.1) — Rev 3 |
| Q6 (commit prefix) | Clarification | Hardcoded intentionally (chicken-and-egg: config doesn't exist yet) | Yes (Section 6, step 7b) — Rev 3 |
| Q7 (git add failure) | Clarification | Added as distinct error scenario; same behavior as commit failure | Yes (Section 8, 9.3) — Rev 3 |
| Q8 (performance) | Coverage gap | Added "Performance guard" test category with timeout wrapper | Yes (Section 9.3) — Rev 3 |
| Q9 (threads exclusion) | Coverage gap | Added "Exclusion: docs/threads/" negative test category | Yes (Section 9.3) — Rev 3 |
| Q10 (name fallback) | Clarification | Fallback triggers on empty string from `basename()` only | Yes (Section 5.2, 9.3) — Rev 3 |

**TSPEC status:** Rev 3 — all PM and TE review questions resolved. Ready for final approval.

---

*Responses by Backend Engineer on March 8, 2026.*
