# Cross-Review: Test Engineer — TSPEC

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document** | 014-TSPEC-tech-lead-orchestration |
| **Review Date** | 2026-03-20 |
| **Round** | 1 |
| **Recommendation** | **Needs revision** |

---

## 1. Summary

The TSPEC is well-structured and clearly specifies the TypeScript changes (dispatcher routing, `mergeBranchIntoFeature`, type definitions). The requirement-to-component mapping (§8) is thorough. However, there are two High-severity and four Medium-severity findings that block approval. The primary issues are: (1) the TSPEC's primary deliverable (SKILL.md) has no executable acceptance test definitions — they are referenced but not specified; and (2) OQ-01 is marked as a blocking concern in the TSPEC itself, but the test strategy has no coverage for the config loader change required to resolve it.

---

## 2. Findings

### F-01 — HIGH: Acceptance tests for SKILL.md are referenced but not defined

**Section:** §7.1, §7.3 (Test Categories table, last row)

**Issue:** The TSPEC states: _"SKILL.md logic: Validated manually via acceptance tests AT-PD-01-* through AT-BD-03-*"_. These acceptance test IDs are referenced but never defined in either the TSPEC or the FSPEC (the FSPEC defines behavioral flows and decision rules but does not enumerate acceptance test cases with those IDs). As a result:

- An engineer implementing SKILL.md has no executable acceptance criteria to validate against.
- The phrase "AT-PD-01-* through AT-BD-03-*" suggests a large range of tests, but none are enumerated anywhere in the doc set.
- Without defined acceptance tests, SKILL.md correctness is effectively unverifiable at code-review time.

**Required action:** Either (a) define the acceptance test scenarios inline in §7.3 (scenario name, preconditions, steps, expected output), or (b) add a dedicated acceptance test plan appendix to this TSPEC. At minimum, the following behavioral areas must have test scenarios defined: dependency parsing (all 3 syntax forms + cycle detection + fallback), topological batching (including sub-batch splitting), skill assignment (backend/frontend/mixed/docs), pre-flight checks (both pass, each fail individually), confirmation loop modifications (change skill, move phase, re-run, cancel, timeout), batch execution lifecycle (success path, phase failure → no-partial-merge, merge conflict, test gate failure — both failure modes), resume auto-detection, and plan status update.

---

### F-02 — HIGH: OQ-01 is a blocking concern with no corresponding test coverage

**Section:** §13 (Open Questions), §11 (ptah.config.json Changes), §7.3 (Test Categories)

**Issue:** OQ-01 is explicitly marked as a **blocking concern** in the TSPEC: _"This is a blocking concern — without a valid mention_id or a validation bypass, adding 'tl' to ptah.config.json crashes the config loader."_ The proposed resolution is to add `mentionable?: boolean` to `AgentEntry` and update `loader.ts` validation to skip the snowflake regex when `mentionable === false`. However:

1. The test strategy (§7.3) has no test category for `config/loader.ts` changes.
2. No test cases are specified for the new `mentionable` field or the updated validation logic.
3. §11 shows `mention_id: ""` in the config snippet, which — per OQ-01 — will crash the current loader. The TSPEC is internally inconsistent on this point.

This blocking concern must be resolved before the PLAN is authored, and the test strategy must include loader validation tests.

**Required action:**
- Resolve OQ-01 in the TSPEC (choose option (a) or (b) and document the decision).
- Add a test category to §7.3 for `config/loader.ts`: test that an agent entry with `mentionable: false` passes validation despite an empty `mention_id`; test that an agent entry with `mentionable: true` still requires a valid snowflake.
- Add specific test cases to §7.4 for the loader.
- Update §11 config snippet to be consistent with the resolution.

---

### F-03 — MEDIUM: `FakeGitClient` interface and test helper functions are not defined

**Section:** §7.4 (artifact-committer.test.ts additions)

**Issue:** The test cases reference `FakeGitClient`, `FakeMergeLockWithTimeout`, `makeCommitter(git)`, `makeCommitterWithLock(git, lock)`, and `makeMergeBranchParams()` — but none of these are defined or specified. An engineer implementing these tests must infer the full `GitClient` interface (including `mergeInWorktree`, `getShortSha`, `getConflictedFiles`, `abortMergeInWorktree`) from the fake's field names alone. If the existing `GitClient` interface or `FakeGitClient` already exists in `tests/fixtures/factories.ts`, the TSPEC should reference it. If it needs to be created, the interface must be specified here.

**Required action:** Define (or reference) the `GitClient` interface that `FakeGitClient` must implement, including all method signatures used in the tests. Specify the `makeCommitter`, `makeCommitterWithLock`, and `makeMergeBranchParams` helper signatures so tests are fully implementable without further clarification.

---

### F-04 — MEDIUM: No integration test for `useTechLead` → "tl" agent wiring through config

**Section:** §7.3 (Test Categories)

**Issue:** The TSPEC specifies unit tests for `phaseToAgentId` and `isForkJoinPhase` in isolation, but there is no integration test that validates the end-to-end wiring:

- The "tl" agent entry exists in `ptah.config.json`
- The `skill_path` resolves to an actual file (`../.claude/skills/tech-lead/SKILL.md`)
- When the orchestrator dispatches with `useTechLead: true`, the config loader resolves to the correct agent entry

This is a cross-module boundary (dispatcher → config → agent registry) where integration test coverage is warranted. The unit tests verify the routing function returns `"tl"`, but they don't verify the "tl" agent is actually loadable.

**Required action:** Add an integration test category to §7.3 for the agent registry wiring. At minimum: a test that loads `ptah.config.json`, resolves the "tl" agent, and asserts that its `skill_path` resolves to an existing file. This prevents "passes unit tests but fails at runtime" failures when the config entry is misconfigured.

---

### F-05 — MEDIUM: Lock release not asserted in any happy-path test case

**Section:** §7.4 (mergeBranchIntoFeature tests)

**Issue:** The `mergeBranchIntoFeature` implementation uses a merge lock (`this.mergeLock.acquire(...)`) to serialize concurrent merges. The `releaseLock?.()` call is in the `finally` block. None of the happy-path test cases ("merged", "conflict", "already-up-to-date", "git error") assert that the lock was actually released after the operation. If the `finally` block is accidentally broken or the lock reference is lost, these tests would still pass while allowing lock starvation in production.

**Required action:** Add a `FakeMergeLock` test double (distinct from `FakeMergeLockWithTimeout`) that records whether `release()` was called. Assert in each test case (merged, conflict, already-up-to-date, git error) that the lock was released exactly once.

---

### F-06 — MEDIUM: Sub-batch test gate semantics have no specified test coverage

**Section:** §5.5 (Sub-batch note), §5.2 step 4 (concurrency cap), REQ-NF-14-01

**Issue:** The sub-batch behavior is semantically critical: when a topological batch is split into N.1, N.2, … sub-batches, the test gate must fire **only after the final sub-batch**, not between sub-batches. This is the key invariant that distinguishes sub-batches from topological batches. If SKILL.md accidentally runs the test gate between N.1 and N.2 (treating them like separate topological batches), it violates REQ-NF-14-01 and doubles test overhead.

Since this behavior lives in SKILL.md, it requires an acceptance test scenario. The current acceptance test references (AT-PD-01-* etc.) do not specifically enumerate a sub-batch scenario (this connects to F-01). Even once F-01 is resolved, this scenario must be explicitly included.

**Required action:** When defining the acceptance test scenarios per F-01, include a specific scenario for sub-batch splitting: a topological batch with 7 phases should produce 2 sub-batches (5 + 2); the test gate fires once after both sub-batches are merged, not after the first 5.

---

## 3. Clarification Questions

### Q-01 — OQ-02: AskUserQuestion timeout return value

**Section:** §5.10 (Confirmation Loop), §13 OQ-02

OQ-02 asks about the `AskUserQuestion` tool's timeout behavior. Given that the entire confirmation loop logic (10-minute timeout, cancellation path) depends on what the tool returns when the user doesn't respond, this is a behavioral assumption that affects the SKILL.md implementation. Can this be verified before the PLAN is authored? If the return value is unknown, the SKILL.md must defensively handle both a `null` return and a sentinel timeout signal — the TSPEC should specify how the skill handles each case rather than leaving it to the implementer.

### Q-02 — OQ-03: Agent tool result shape for failed agents

**Section:** §5.7 (Phase Failure Handling), §13 OQ-03

OQ-03 asks whether the Agent tool returns the worktree branch name for failed agents. Step 5 of §5.7 says "Clean up ALL worktrees for this batch" — but if the failed agent's branch name is not in the result, the tech-lead cannot clean up the failed worktree (or log its path when `retain_failed_worktrees: true`). This is a behavioral gap in the failure handling algorithm. Has this been verified? If not, §5.7 needs a fallback description for when the branch name is unavailable.

### Q-03 — `DEFAULT_LOCK_TIMEOUT_MS` not defined

**Section:** §4.4 (mergeBranchIntoFeature implementation)

The implementation references `DEFAULT_LOCK_TIMEOUT_MS` but this constant is never defined in the TSPEC. What is the intended value? This affects both the runtime behavior and the lock timeout test (F-05 follow-up): the fake lock timeout test needs to know what value to use to trigger the timeout path.

---

## 4. Positive Observations

- **Requirement-to-component mapping (§8) is excellent.** Every requirement has a named technical component, making traceability straightforward for PROPERTIES creation.
- **Error handling table (§6) is comprehensive** — distinguishes between 17 distinct failure scenarios, each with detection method, behavior, and exit signal. This is exactly the level of specificity needed for error handling property derivation.
- **Backward compatibility design is sound.** The optional `useTechLead?: boolean` field with absent=false semantics is the right approach, and both affected functions (`phaseToAgentId`, `isForkJoinPhase`) correctly fall through to existing behavior. The unit tests for backward compatibility (§7.4, "preserves existing routing when useTechLead is absent") explicitly cover this.
- **`mergeBranchIntoFeature` implementation (§4.4) is well-specified.** The lock-acquire → merge → result-dispatch → lock-release pattern is clear, the 4 result states are enumerated, and the conflict abort path is explicitly shown. The test cases in §7.4 map cleanly to these states.
- **Phase skill assignment algorithm (§5.3) is deterministic and testable.** The prefix-to-skill mapping, the mixed-layer warning text, and the docs-default-to-backend rule are all precisely defined.
- **No new dependencies** — the constraint that SKILL.md uses only existing tool capabilities is clearly stated and correct.

---

## 5. Recommendation

**Needs revision.**

Two High-severity findings (F-01, F-02) must be addressed before this TSPEC can be approved:

1. **F-01:** Define acceptance test scenarios for SKILL.md — these are the only test coverage for the primary deliverable. Without them, the implementation cannot be validated.
2. **F-02:** Resolve OQ-01 (blocking concern) and add test coverage for the `config/loader.ts` changes required.

Four Medium-severity findings (F-03–F-06) should also be addressed in the same revision.

Once all High and Medium findings are resolved, please route the updated TSPEC back for re-review.

---

*Reviewed by: Test Engineer (qa) | 2026-03-20*
