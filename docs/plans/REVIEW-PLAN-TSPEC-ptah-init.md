# TE Review: PLAN-TSPEC-ptah-init.md

| Field | Detail |
|-------|--------|
| **Reviewed Document** | [PLAN-TSPEC-ptah-init.md](./PLAN-TSPEC-ptah-init.md) |
| **Cross-referenced** | [PROPERTIES-ptah-init.md v1.2](../testing/in_review/PROPERTIES-ptah-init.md), [TSPEC-ptah-init.md](../specifications/TSPEC-ptah-init.md), [REQ-PTAH.md](../requirements/REQ-PTAH.md) |
| **Date** | March 8, 2026 |
| **Reviewer** | Test Engineer |
| **Status** | Approved |

---

## Summary

The plan is well-structured with clean phase dependencies and a solid TDD approach. Task decomposition follows the TSPEC module architecture faithfully. The dependency graph (Phase A → B → C/E → D → F) is correct and enables parallel development of InitCommand tests (Phase D) and Node service implementations (Phase E).

However, when mapped against PROPERTIES-ptah-init.md v1.1 (44 properties), there are coverage gaps, misclassifications, and structural issues that need resolution before proceeding to implementation.

---

## Property Coverage Mapping

Before raising questions, here is the task → property mapping I derived:

| Task | Description | Properties Covered |
|------|-------------|--------------------|
| 7 | FakeFileSystem | (test infrastructure — no properties) |
| 8 | FakeGitClient | (test infrastructure — no properties) |
| 9 | DIRECTORY_MANIFEST | PROP-IN-01 (partial — manifest definition only) |
| 10 | FILE_MANIFEST | PROP-IN-02 (partial), PROP-IN-18, PROP-IN-19, PROP-IN-21, PROP-IN-22, PROP-IN-23, PROP-IN-43 |
| 11 | buildConfig() | PROP-IN-04, PROP-IN-05, PROP-IN-20 |
| 12 | No secrets in config | PROP-IN-32, PROP-IN-39 |
| 13 | Not a Git repo error | PROP-IN-12 |
| 14 | Staged changes error | PROP-IN-13, PROP-IN-41 |
| 15 | Create directories | PROP-IN-01 |
| 16 | Create files | PROP-IN-02 |
| 17 | Auto-detect project name | PROP-IN-04 (duplicate of Task 11?) |
| 18 | Skip existing files | PROP-IN-24, PROP-IN-25, PROP-IN-38 |
| 19 | Directories not in skipped | PROP-IN-26 |
| 20 | Exclude docs/threads/ | PROP-IN-03, PROP-IN-37 |
| 21 | Git commit when created | PROP-IN-06, PROP-IN-08 |
| 22 | No-op commit | PROP-IN-07, PROP-IN-40 |
| 23 | InitResult correctness | PROP-IN-09 |
| 24 | Error propagation | PROP-IN-15, PROP-IN-16, PROP-IN-17, PROP-IN-42 |
| 25 | Performance guard | PROP-IN-45 |
| 26-29 | NodeFileSystem methods | PROP-IN-10 (partial) |
| 30-31 | NodeGitClient isRepo/hasStagedChanges | PROP-IN-11 (partial), PROP-IN-30, PROP-IN-31 |
| 32 | NodeGitClient add/commit | PROP-IN-11 (partial) |
| 33 | NodeGitClient error handling | PROP-IN-14 |
| 34 | CLI entry point | PROP-IN-28 |
| 35 | CLI output formatting | PROP-IN-33, PROP-IN-34, PROP-IN-35, PROP-IN-36 |
| 36 | CLI exit codes | (no direct property — see Q4) |

### Uncovered Properties

| Property | Description | Status in Plan |
|----------|-------------|----------------|
| PROP-IN-27 | Running InitCommand twice produces identical state | **Not covered by any task** |
| PROP-IN-44 | Config agents.skills paths match scaffolded files | **Not covered by any task** |
| PROP-IN-45 | Performance guard — 30s completion | Covered by Task 25, but misclassified (see Q3) |

---

## Questions and Concerns

### Q1: No task covers idempotency end-to-end (PROP-IN-27)

**Section:** Phase D (Tasks 13-25)

PROP-IN-27 states: *"Running InitCommand twice on the same repo must produce identical filesystem state (second run creates nothing, skips all)."*

Task 18 covers *skipping* existing files on a single run, and Task 22 covers the no-op commit case. But no task verifies the full idempotency property: execute once (creates files), execute again (creates nothing, skips all, committed=false). This is the strongest test of REQ-IN-05 and validates that the first run's output is stable input for the second run.

**Question:** Should a dedicated task be added (e.g., Task 18b: "Idempotency — second execute() on same repo creates nothing, skips all, committed=false")? Alternatively, should Task 18 or Task 22 be expanded to include this double-execution scenario?

> **Resolution (Backend Engineer):** Agreed — this is a coverage gap. Added **Task 18b** as a dedicated idempotency task in Phase D: *"Idempotency — execute() twice on same repo: second run creates nothing, skips all 17 files, committed=false, no git.add/commit calls."* This is distinct from Task 18 (which tests skip logic for *some* pre-existing files on a single run) and Task 22 (which tests the no-op commit path in isolation). Task 18b exercises the full idempotency property: run 1 creates all files and commits, run 2 on the same `FakeFileSystem` state produces `created=[], skipped=[all 17], committed=false`. This directly covers PROP-IN-27 end-to-end. Plan updated.

---

### Q2: No task covers config-skills path consistency (PROP-IN-44)

**Section:** Phase C (Tasks 9-12) and Phase D (Tasks 13-25)

PROP-IN-44 states: *"`ptah.config.json` `agents.skills` paths must match the actual scaffolded skill file paths."*

No task verifies that the paths in `buildConfig()` output (`agents.skills` entries like `"./ptah/skills/pm-agent.md"`) correspond to entries in `FILE_MANIFEST`. This is a data consistency property — if someone edits the config template or the manifest independently, the paths could diverge.

**Question:** Should this be added as a test in Task 10 (FILE_MANIFEST) or Task 11 (buildConfig)? It naturally fits Task 11 since that's where the config is generated, but it requires access to the manifest to cross-reference. A separate task (e.g., Task 12b: "Config agents.skills paths match FILE_MANIFEST entries") may be cleaner.

> **Resolution (Backend Engineer):** Agreed — this is a data consistency gap. Added **Task 12b** as a dedicated cross-referencing task in Phase C: *"Config agents.skills paths match FILE_MANIFEST — every path in `buildConfig().agents.skills` values (e.g., `./ptah/skills/pm-agent.md`) must correspond to an entry in FILE_MANIFEST."* This is cleaner as a separate task because it crosses two data structures (`buildConfig()` output and `FILE_MANIFEST`). Placing it in Phase C after Task 12 keeps all manifest/config validation together. The test imports both `buildConfig` and `FILE_MANIFEST` from `config/defaults.ts` and asserts that every `agents.skills` path resolves to a FILE_MANIFEST key. This directly covers PROP-IN-44. Plan updated.

---

### Q3: Task 25 performance guard is misclassified as unit test

**Section:** Phase D, Task 25

Task 25 places the performance guard in `ptah/tests/unit/commands/init.test.ts`. PROP-IN-45 is classified as Integration level in the properties document. The rationale (from the PM review resolution) is that unit tests with in-memory fakes complete in sub-milliseconds and won't meaningfully exercise the 30-second bound — the property is meaningful only against real filesystem and Git.

**Question:** Should Task 25 be moved to Phase F (integration) or kept in Phase D with a note that it uses in-memory fakes as a sanity check? If kept as a unit test, the test is effectively asserting "does not time out" rather than "completes within 30 seconds" — which is still useful as a regression guard but should be acknowledged.

> **Resolution (Backend Engineer):** Kept Task 25 in Phase D as a unit-level regression guard, with clarified description. The unit test with in-memory fakes asserts "execute() completes within a generous timeout (e.g., 5s) using in-memory fakes — guards against accidental infinite loops or O(n²) regressions." This is a sanity check, not a meaningful 30-second performance assertion. The real PROP-IN-45 coverage (30s with real filesystem + Git) is now covered by **Task 37** in the new Phase G (Integration Tests) — see Q7 resolution. Task 25 description updated in the plan to acknowledge this distinction.

---

### Q4: Task 36 (CLI exit codes) has no corresponding property

**Section:** Phase F, Task 36

Task 36 tests CLI exit codes (exit 0 on success, exit 1 on error). No property in PROPERTIES-ptah-init.md v1.1 covers exit codes. The properties document's Gap #1 acknowledges the CLI entry point is not covered, but exit code behavior is specified in TSPEC §8 (every error scenario has "Exit Code: 1").

This is a two-way gap:
- The plan has a task without a property (test without a traceable requirement)
- TSPEC §8 specifies exit codes but no property captures them

**Question:** Should the plan defer to the properties document (remove Task 36 until a property exists), or should this review recommend adding an exit code property to PROPERTIES-ptah-init.md? My recommendation is the latter — exit codes are a testable contract. Suggested property: *"PROP-IN-46: CLI must exit with code 0 on success and code 1 on any error (not a git repo, staged changes, permission denied, git failure)."*

> **Resolution (Backend Engineer):** Agreed — exit codes are a testable contract specified in TSPEC §8 and should have a corresponding property. Recommending to the Test Engineer: add **PROP-IN-46** to PROPERTIES-ptah-init.md as suggested: *"CLI must exit with code 0 on success and code 1 on any error (not a git repo, staged changes, permission denied, git failure)."* Source: TSPEC §8. Test Level: Integration. This closes the two-way traceability gap — Task 36 now maps to PROP-IN-46, and TSPEC §8 exit code behavior is captured in a property. Properties document updated with PROP-IN-46.

---

### Q5: Task 17 duplicates Task 11

**Section:** Phase C (Task 11) vs. Phase D (Task 17)

Task 11 (Phase C): *"Implement `buildConfig(projectName)` — generates `ptah.config.json` content with auto-detected project name; empty basename falls back to `"my-app"`"*

Task 17 (Phase D): *"`ptah.config.json` uses auto-detected project name from `fs.cwd()` basename"*

Both test the same behavior (PROP-IN-04). Task 11 tests `buildConfig()` in isolation. Task 17 tests it via `InitCommand.execute()`. The distinction is valid (unit vs. integration-style), but the plan doesn't make this clear — both point to the same property and the descriptions overlap.

**Question:** Should Task 17 be clarified to focus on the *integration* aspect — that `InitCommand` correctly passes `fs.basename(fs.cwd())` to `buildConfig()`? As written, it reads like a duplicate. Suggested clarification: *"InitCommand passes `fs.basename(fs.cwd())` to `buildConfig()` — verify generated config in fake fs uses the cwd-derived project name."*

> **Resolution (Backend Engineer):** Agreed — Task 17 description was ambiguous. Updated to: *"InitCommand passes `fs.basename(fs.cwd())` to `buildConfig()` — verify the `ptah.config.json` written to fake fs contains the cwd-derived project name (not hardcoded)."* This clarifies that Task 11 tests `buildConfig()` in isolation (given a project name string, returns correct JSON), while Task 17 tests the wiring inside `InitCommand.execute()` (that it reads the cwd, extracts the basename, passes it to `buildConfig()`, and writes the result). The distinction is unit-of-buildConfig vs. unit-of-InitCommand. Plan updated.

---

### Q6: Phase E tasks (26-33) are classified as unit tests but test real Node.js wrappers

**Section:** Phase E (Tasks 26-33)

All Phase E tasks are filed under `ptah/tests/unit/services/`. However, `NodeFileSystem` wraps `node:fs/promises` and `NodeGitClient` wraps `child_process.execFile`. Testing these correctly requires either:

(a) **Mocking the Node.js built-ins** (`vi.mock('node:fs/promises')`) — makes them true unit tests but adds mock complexity.

(b) **Using real filesystem/subprocess** in a temp directory — makes them integration tests but provides stronger guarantees.

The plan doesn't specify which approach. PROP-IN-30 and PROP-IN-31 (Integration level) expect real `git` invocations, which contradicts the `unit/` test file location.

**Question:** Should the plan clarify the testing strategy for Phase E? If approach (b) is used, the test files should be at `ptah/tests/integration/services/` to match the properties document's classification. If approach (a), the tests should mock `fs` and `child_process` and verify the correct Node.js APIs are called with expected arguments — but this makes PROP-IN-30/31 unit tests, contradicting their Integration classification.

My recommendation: Use approach (b) — real filesystem in a temp directory and real `git` in a temp repo — and move the test files to `ptah/tests/integration/services/`. This aligns with the properties document and provides stronger coverage.

> **Resolution (Backend Engineer):** Agreed with approach (b). Phase E tasks (26-33) are reclassified as integration tests using real filesystem in a temp directory and real `git` in a temp repo. Test files moved from `ptah/tests/unit/services/` to `ptah/tests/integration/services/`. Rationale: (1) `NodeFileSystem` wraps `node:fs/promises` — mocking the thing you're wrapping defeats the purpose of testing the wrapper. (2) `NodeGitClient` wraps `child_process.execFile` for `git` — PROP-IN-30 and PROP-IN-31 explicitly expect real `git` invocations at Integration level. (3) Using real filesystem + git in temp directories provides stronger guarantees and aligns with the properties document classification. Each test will use `fs.mkdtemp()` for an isolated temp directory and `git init` for a fresh repo, cleaned up in `afterEach`. Plan updated with new file paths. Project structure in TSPEC §3 should be updated in a follow-up to add `tests/integration/services/` to the directory tree.

---

### Q7: No integration test section in the plan

**Section:** Overall plan structure

The properties document defines 4 Integration properties (PROP-IN-28, PROP-IN-30, PROP-IN-31, PROP-IN-45). The plan has no dedicated "Integration Tests" section or `tests/integration/` directory structure. Integration-level properties are scattered across Phase E (unit test files) and Phase F (no test file).

Phase 3 of the test engineer workflow (Plan Augmentation) adds an explicit Integration Tests section to the plan. While this review precedes Phase 3, the absence of integration test structure is a gap the plan should acknowledge.

**Question:** Should the plan add an Integration Tests section after Phase F, or should this be deferred to Phase 3 (Plan Augmentation)? If deferred, should the plan at minimum acknowledge that Tasks 30-31 and 34 will be revisited during plan augmentation to add integration-level test scripts?

> **Resolution (Backend Engineer):** Added **Phase G: Integration Tests** to the plan after Phase F. This phase contains two tasks: **Task 37** (performance guard with real filesystem + Git, covering PROP-IN-45) and **Task 38** (CLI entry point integration test verifying composition root wiring, covering PROP-IN-28). Phase E (Tasks 26-33) already covers PROP-IN-30 and PROP-IN-31 as integration tests per Q6 resolution. Task 36 (CLI exit codes) is also moved to Phase G as **Task 39** since exit codes are an integration concern (real process exit). The plan now has a clear integration test structure that aligns with the properties document's 4 Integration properties + new PROP-IN-46. Plan updated.

---

## Non-blocking Observations

1. **Task dependency diagram is clean.** The parallel tracks (C and E) are correctly identified and the convergence at Phase F is sound.

2. **Test double tests (Tasks 7-8) are a good practice.** Testing the fakes themselves prevents false positives/negatives in the InitCommand tests that depend on them.

3. **Task 20 (docs/threads/ exclusion) is well-placed.** Testing the negative case (directory NOT created) alongside the positive cases (directories created) is correct.

4. **No `"basename returns empty string"` test in Phase D.** Task 11 covers the fallback in `buildConfig()`, but no Phase D task verifies that `InitCommand` handles the edge case where `fs.basename(fs.cwd())` returns `""`. This is covered by PROP-IN-05 but may warrant a dedicated InitCommand-level test (or clarification that Task 17 covers it).

5. **Plan doesn't reference the properties document.** The metadata table links to TSPEC and REQ-PTAH but not to PROPERTIES-ptah-init.md. Adding this cross-reference would close the traceability loop.

---

## Verdict

**Status: Conditional approval — pending resolution of Q1, Q2, Q4, and Q6.**

| Priority | Questions |
|----------|-----------|
| Must fix | Q1 (missing idempotency task for PROP-IN-27), Q2 (missing config-skills consistency for PROP-IN-44) |
| Should fix | Q4 (exit code property gap), Q6 (Phase E test classification) |
| Nice to have | Q3 (Task 25 classification), Q5 (Task 17 clarification), Q7 (integration test section) |

Q1 and Q2 are property coverage gaps — the plan has no task that exercises these two properties, meaning they would go untested. Q4 is a two-way traceability gap (plan has a task without a property). Q6 affects test reliability — testing `NodeGitClient` methods as unit tests with mocked `child_process` is weaker than integration tests with real `git`.

---

*Reviewed by Test Engineer on March 8, 2026.*

---

## Engineer Responses (March 8, 2026)

All 7 questions have been resolved. Summary of changes made:

| Question | Priority | Resolution | Plan Changed? | Properties Changed? |
|----------|----------|-----------|---------------|---------------------|
| Q1 | Must fix | Added Task 18b: idempotency end-to-end (PROP-IN-27) | Yes — new task in Phase D | No |
| Q2 | Must fix | Added Task 12b: config-skills path consistency (PROP-IN-44) | Yes — new task in Phase C | No |
| Q3 | Nice to have | Task 25 kept as unit regression guard; real perf test moved to Phase G Task 37 | Yes — Task 25 description clarified, Task 37 added | No |
| Q4 | Should fix | Added PROP-IN-46 for exit codes; Task 36 → Task 39 in Phase G | Yes — Task 36 moved to Phase G as Task 39 | Yes — PROP-IN-46 added |
| Q5 | Nice to have | Task 17 description clarified to focus on InitCommand→buildConfig wiring | Yes — Task 17 description updated | No |
| Q6 | Should fix | Phase E reclassified as integration tests; test files moved to `tests/integration/services/` | Yes — Phase E file paths updated | No |
| Q7 | Nice to have | Added Phase G: Integration Tests (Tasks 37-39) | Yes — new phase added | No |

**Plan changes summary:**
- Phase C: Added Task 12b (config-skills path consistency)
- Phase D: Added Task 18b (idempotency), clarified Task 17 and Task 25 descriptions
- Phase E: Reclassified as integration tests, test files moved to `tests/integration/services/`
- Phase F: Task 36 (exit codes) moved to Phase G
- Phase G (new): Integration Tests — Tasks 37 (performance guard), 38 (composition root wiring), 39 (CLI exit codes)
- Total tasks: 36 → 39
- Properties document: Added PROP-IN-46 (CLI exit codes), total properties: 44 → 45
- Cross-reference to PROPERTIES-ptah-init.md added to plan metadata

---

*Responses by Backend Engineer on March 8, 2026.*

---

## TE Final Review (March 8, 2026)

### Verification of Engineer Resolutions

All 7 resolutions verified against PLAN-TSPEC-ptah-init.md (Rev 2) and PROPERTIES-ptah-init.md (v1.2).

| Q# | Resolution | Verified in Plan? | Verified in Properties? |
|----|-----------|-------------------|------------------------|
| Q1 | Task 18b added (PROP-IN-27 idempotency) | Yes — Phase D, Task 18b present with correct description | N/A — property pre-existed |
| Q2 | Task 12b added (PROP-IN-44 config-skills paths) | Yes — Phase C, Task 12b present with correct description | N/A — property pre-existed |
| Q3 | Task 25 kept as unit sanity (5s); Task 37 for real perf (30s) | Yes — Task 25 description clarified, Task 37 in Phase G | N/A — no property change |
| Q4 | PROP-IN-46 added; Task 39 in Phase G | Yes — Task 39 covers exit codes | Yes — PROP-IN-46 in v1.2 (Integration level) |
| Q5 | Task 17 description clarified (wiring focus) | Yes — "InitCommand passes `fs.basename(fs.cwd())` to `buildConfig()`" | N/A — no property change |
| Q6 | Phase E reclassified as integration; paths at `tests/integration/services/` | Yes — all Phase E test files updated | N/A — no property change |
| Q7 | Phase G added (Tasks 37-39) | Yes — Phase G present with 3 tasks | N/A — no property change |

### Full Property Coverage Verification

All 45 properties in PROPERTIES-ptah-init.md v1.2 now map to at least one task in the plan. Updated task → property mapping including new tasks:

| Task | Properties Covered |
|------|--------------------|
| 9 | PROP-IN-01 (partial — manifest definition) |
| 10 | PROP-IN-02 (partial), PROP-IN-18, PROP-IN-19, PROP-IN-21, PROP-IN-22, PROP-IN-23, PROP-IN-43 |
| 11 | PROP-IN-04, PROP-IN-05, PROP-IN-20 |
| 12 | PROP-IN-32, PROP-IN-39 |
| **12b** | **PROP-IN-44** |
| 13 | PROP-IN-12 |
| 14 | PROP-IN-13, PROP-IN-41 |
| 15 | PROP-IN-01 |
| 16 | PROP-IN-02 |
| 17 | PROP-IN-04 (InitCommand→buildConfig wiring) |
| 18 | PROP-IN-24, PROP-IN-25, PROP-IN-38 |
| **18b** | **PROP-IN-27** |
| 19 | PROP-IN-26 |
| 20 | PROP-IN-03, PROP-IN-37 |
| 21 | PROP-IN-06, PROP-IN-08 |
| 22 | PROP-IN-07, PROP-IN-40 |
| 23 | PROP-IN-09 |
| 24 | PROP-IN-15, PROP-IN-16, PROP-IN-17, PROP-IN-42 |
| 25 | PROP-IN-45 (unit sanity check only) |
| 26-29 | PROP-IN-10 |
| 30-31 | PROP-IN-11 (partial), PROP-IN-30, PROP-IN-31 |
| 32 | PROP-IN-11 (partial) |
| 33 | PROP-IN-14 |
| 35 | PROP-IN-33, PROP-IN-34, PROP-IN-35, PROP-IN-36 |
| **37** | **PROP-IN-45** (real filesystem + Git, 30s bound) |
| **38** | **PROP-IN-28** |
| **39** | **PROP-IN-46** |

**Coverage: 45/45 properties (100%)** — no uncovered properties remain.

### Structural Verification

- **Plan metadata:** Now cross-references PROPERTIES-ptah-init.md v1.2. Traceability loop closed.
- **Phase dependencies:** Updated dependency graph (`Phase A → B → C/E → D → F → G`) is correct. Phase G correctly depends on all prior phases.
- **Task count:** 39 tasks across 7 phases (A: 4, B: 4, C: 5, D: 13, E: 8, F: 2, G: 3).
- **Test level alignment:** Unit tests in `tests/unit/`, integration tests in `tests/integration/`. Phase E correctly at `tests/integration/services/`. Phase G integration tests at `tests/integration/commands/` and `tests/integration/cli/`.
- **Non-blocking observation #4** (basename empty string in Phase D): Task 17's updated scope implicitly covers this — if `FakeFileSystem.cwd()` returns `"/"` and `basename("/")` returns `""`, the test verifies `buildConfig` receives `""` and falls back to `"my-app"`. Acceptable as-is; the engineer can add an explicit edge case test during implementation.
- **Non-blocking observation #5** (properties cross-reference): Resolved — plan metadata now includes the link.

### Verdict

**Approved.** The PLAN-TSPEC-ptah-init.md (Rev 2) is approved for TDD implementation.

All 7 review questions have been resolved with appropriate plan and properties document changes. The plan achieves:

- **100% property coverage** (45/45 properties mapped to tasks)
- **Full two-way traceability** (requirement → property → task, and task → property → requirement)
- **Correct test level classification** (unit tests use in-memory fakes, integration tests use real filesystem/Git)
- **Clean phase structure** with explicit integration test phase (Phase G)
- **No remaining coverage gaps, misclassifications, or structural issues**

The plan may proceed to TDD implementation.

---

*Final approval by Test Engineer on March 8, 2026.*
