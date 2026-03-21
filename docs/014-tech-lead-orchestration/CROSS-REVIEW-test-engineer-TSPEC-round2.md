# Cross-Review: Test Engineer — TSPEC (Round 2)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document** | 014-TSPEC-tech-lead-orchestration |
| **Review Date** | 2026-03-21 |
| **Round** | 2 |
| **Recommendation** | **Approved with minor changes** |

---

## 1. Summary

The updated TSPEC addresses all 6 findings and 3 clarification questions from Round 1. The revisions are thorough and well-integrated:

- **F-01 (HIGH) — Resolved.** §7.5 now defines 22 acceptance test scenarios (AT-PD-01 through AT-BD-03-08) covering all behavioral areas requested: dependency parsing (3 syntax forms + cycle + fallback), topological batching (including sub-batch splitting), skill assignment (4 scenarios), pre-flight checks, confirmation loop modifications, batch execution lifecycle (success, failure, merge conflict, test gate failures), resume auto-detection, and plan status update.
- **F-02 (HIGH) — Resolved.** OQ-01 is marked resolved (option a: `mentionable?: boolean`). §7.3 includes a config loader test category. §7.4 specifies 4 loader test cases covering `mentionable: false` + empty `mention_id`, `mentionable: true` + empty (rejects), absent + valid snowflake, absent + empty (rejects). §9 lists the config validation integration point. The PLAN scheduling constraint is explicitly noted.
- **F-03 (MEDIUM) — Resolved.** §7.2 now fully defines `GitClient` interface (4 methods), `FakeGitClient`, `MergeLock` interface, `FakeMergeLock` (with `acquireCalled`, `releaseCalled`, `releaseCallCount`), `FakeMergeLockWithTimeout`, `makeCommitter()`, `makeCommitterWithLock()`, and `makeMergeBranchParams()`. All signatures are complete.
- **F-04 (MEDIUM) — Resolved.** §7.3 includes an "Agent registry wiring (integration)" category. §7.4 defines `integration/agent-registry.test.ts` that loads real `ptah.config.json`, resolves the "tl" agent, and asserts `skill_path` resolves to an existing file.
- **F-05 (MEDIUM) — Resolved.** `FakeMergeLock` now tracks `releaseCalled` and `releaseCallCount`. All 5 test cases in §7.4 (`merged`, `conflict`, `already-up-to-date`, `lock timeout`, `git error`) explicitly assert `lock.releaseCalled === true` and `lock.releaseCallCount === 1` (except lock timeout, which correctly asserts no release since the lock was never acquired).
- **F-06 (MEDIUM) — Resolved.** AT-PD-06 covers sub-batch splitting (8 phases → 5 + 3 sub-batches). AT-BD-03-08 explicitly validates the test gate fires only after the final sub-batch — the key invariant from REQ-NF-14-01.

**Clarification questions resolved:**
- **Q-01 (OQ-02):** §5.10 now specifies defensive handling for `AskUserQuestion` timeout — both `null` and sentinel timeout signals are treated as timeout events.
- **Q-02 (OQ-03):** §5.7 step 5 includes a fallback for when the Agent tool result does not include the worktree branch name — log warning and skip cleanup.
- **Q-03 (`DEFAULT_LOCK_TIMEOUT_MS`):** Now defined at §4.4: `const DEFAULT_LOCK_TIMEOUT_MS = 30_000` (30 seconds).

**PM cross-review F-01 (exit signals) also resolved:** §6 now correctly shows `ROUTE_TO_USER` for phase agent failure, merge conflict, and both test gate failure modes. This is consistent with §12's response contract.

---

## 2. Findings

### F-01 — LOW: Three edge-case acceptance test scenarios missing

**Section:** §7.5 (Acceptance Test Scenarios)

**Issue:** The acceptance test suite is comprehensive but three edge cases documented elsewhere in the TSPEC lack explicit AT entries:

1. **"All phases already Done" (REQ-PD-04 second clause, §6 row 8):** AT-BD-03-06 covers resume with partial completion but not the terminal case where every phase is already ✅. Expected behavior: "All phases are already marked as complete — nothing to do" + exit LGTM. This is a distinct path from resume (no confirmation loop, no batch execution).

2. **"Plan file not found" (REQ-PD-01 precondition, §6 row 1):** The error handling table specifies detection (ENOENT) and behavior (report with path, halt, LGTM exit), but no AT validates this. This is the simplest error path but a P0 requirement clause.

3. **"Split Batch" modification (§5.10):** The confirmation loop lists 4 modification types (change skill, move phase, split batch, re-run). AT-BD-02-01 through AT-BD-02-04 cover the first, second, and fourth — but not "split Batch". While this is a lower-frequency operation, it has validation rules (dependency ordering) that should be tested.

**Severity: Low.** All three behaviors are well-specified in the TSPEC body (§5.10, §6, algorithm descriptions). The missing ATs are completeness gaps, not specification gaps.

**Suggested action:** Add AT-PD-11 (all phases Done), AT-PD-12 (plan file not found), and AT-BD-02-08 (split batch modification) to §7.5. These can be added in the PLAN phase if preferred.

---

## 3. Positive Observations

- **Acceptance test coverage is excellent.** 22 scenarios across dependency parsing, skill assignment, pre-flight, confirmation loop, and batch execution lifecycle. Each scenario has clear preconditions, actions, and expected outcomes — sufficient for an engineer to validate without further clarification.
- **Test doubles are now fully specified.** The `FakeMergeLock` with `releaseCallCount` is the right design — it catches both "never released" and "released more than once" bugs.
- **Integration test for agent registry wiring** closes the "passes unit tests, fails at runtime" gap identified in Round 1.
- **Config loader test cases** properly cover the `mentionable` field matrix (4 combinations of present/absent × valid/empty).
- **OQ-01 resolution is clean.** The `mentionable?: boolean` approach correctly models internal-only agents without breaking existing agents.
- **Exit signal consistency.** §6 and §12 are now aligned — `ROUTE_TO_USER` for blocking failures, `LGTM` for clean exits. This matches REQ-BD-05, REQ-BD-07, and REQ-TL-04.
- **`DEFAULT_LOCK_TIMEOUT_MS` is now defined** with a clear rationale (30s for serializing sequential merge operations).
- **Defensive handling for OQ-02 and OQ-03** is pragmatic — the mitigations handle unknown tool behaviors without blocking implementation, while flagging integration verification as a follow-up.

---

## 4. Recommendation

**Approved with minor changes.**

All High and Medium findings from Round 1 have been resolved. The single Low-severity finding (F-01: three missing edge-case acceptance tests) is non-blocking — the behaviors are already well-specified in the TSPEC body, and the AT gaps can be filled during PLAN authoring. The TSPEC is ready for PROPERTIES creation and PLAN authoring.

---

*Reviewed by: Test Engineer (qa) | 2026-03-21*
