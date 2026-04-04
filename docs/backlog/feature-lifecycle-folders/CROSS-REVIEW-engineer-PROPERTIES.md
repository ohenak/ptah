# Cross-Review: Engineer — PROPERTIES Document

| Field | Detail |
|-------|--------|
| **Reviewer** | Senior Full-Stack Engineer (eng) |
| **Document Reviewed** | PROPERTIES-feature-lifecycle-folders.md (v1.1) |
| **References** | TSPEC-FLF v1.2, PLAN-FLF v1.1 |
| **Review Date** | April 4, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — High: `resolveFeaturePath` thin activity is entirely uncovered

TSPEC §5.8 explicitly specifies that `FeatureResolver.resolve()` must be wrapped in a thin `resolveFeaturePath` activity rather than called directly in workflow code, to satisfy Temporal's determinism constraint. PLAN task E10 implements this activity. However, no property in the PROPERTIES document covers this activity's existence or contract:

- No property verifies that the workflow calls `resolveFeaturePath` as a Temporal activity (not calling `FeatureResolver.resolve()` inline in workflow code).
- No property verifies the input/output shape of `resolveFeaturePath` (it should accept `{ featureSlug, featureBranch, workflowId, runId }` and return `FeatureResolverResult`).
- No property verifies that the workflow uses the activity's returned `FeatureResolverResult` to populate `state.featurePath`.

This is a direct gap between TSPEC and PROPERTIES for a component the TSPEC explicitly calls out as architecturally required. Bypassing this pattern (calling resolve() inline) would violate Temporal non-determinism rules and could cause workflow replay failures — an invisible correctness bug that passes all existing tests.

**Required action:** Add a contract property verifying the `resolveFeaturePath` activity's input/output shape, and an integration or workflow-unit property verifying the workflow calls it as an activity (not inline).

---

### F-02 — High: `WorktreeManager.create` UUID collision retry has no property

TSPEC §5.3 (Create algorithm) documents that on UUID collision (first `git worktree add` attempt fails and the path already exists), the manager retries exactly once with a new UUID, and throws `ApplicationFailure.nonRetryable` if the second attempt also fails. PLAN tasks C2 and C3 implement these two branches. No property covers either:

- PROP-WT-06 covers the case where `git worktree add` fails (maps to C3 — throws non-retryable), but its wording — "must throw `ApplicationFailure.nonRetryable` when `git worktree add` fails" — is ambiguous about whether this applies after one failure or after two failures. The algorithm requires a retry on the first failure; throwing immediately on the first failure would be wrong.
- No property covers the retry behavior itself (C2): that `create` retries with a new UUID on the first failure, succeeds on the second attempt, and returns a valid `WorktreeHandle`.

An implementer reading only PROP-WT-06 could reasonably implement immediate non-retryable failure on the first `git worktree add` error, which would break the retry behavior silently.

**Required action:** Clarify PROP-WT-06 to specify "after two failed attempts" and add a new property covering the single-retry behavior.

---

### F-03 — Medium: PROP-PR-09 and PROP-PR-10 test level mismatch

**PROP-PR-09** ("Both promotion activities must use `git mv` for all folder moves and file renames") is labeled Unit. With a `FakeGitClient`, a unit test can only verify that `gitMvInWorktree` was called with the correct arguments — it cannot verify that `git mv` actually preserves history. The TSPEC §7.3 integration test #10 explicitly requires "verify `git log --follow`", confirming that history preservation is the behavioral invariant. The unit-level property should be rephrased as "calls `gitMvInWorktree`" (an interaction test), and a corresponding integration property should exist to verify actual git history is preserved. Without the integration property, the history guarantee (REQ-NF-01) has no automated enforcement.

**PROP-PR-10** ("must produce 2-3 git commits") is labeled Unit but cannot be verified with a FakeGitClient. Commit count is an emergent property of the real git state, not a call-count on the fake. A unit test can only verify that the commit method was called 2-3 times; it cannot verify that commits actually landed. This belongs at integration level, or the property description should be rewritten to be explicitly an interaction property ("must call the commit method 2-3 times").

**Required action:** Reclassify PROP-PR-09 as Integration (or split into one interaction-level unit property + one integration property for history), and reclassify PROP-PR-10 as Integration.

---

### F-04 — Medium: `FakeWorktreeManager` has no failure injection mechanism for destroy

TSPEC §7.2 defines the `FakeWorktreeManager` with a `destroy` method that always succeeds silently. PROP-WT-07 requires testing that `WorktreeManager.destroy` logs and does not throw when `git worktree remove` fails. PLAN C5 implements this test case. However, the proposed `FakeWorktreeManager` cannot simulate a destroy failure — there is no `shouldFailOnDestroy` flag or equivalent.

This means unit tests for PROP-WT-07 must either: (a) not use `FakeWorktreeManager` (defeating the point of the fake), or (b) use a one-off hand-coded stub that is not documented. Either approach creates inconsistency between the test double specification and the actual tests that will be written.

This is a gap in the test double design that will cause friction during implementation and may result in PROP-WT-07 being tested with a less rigorous approach than intended.

**Required action:** The `FakeWorktreeManager` definition in TSPEC §7.2 should include a `destroyShouldFail: boolean` or `destroyError?: Error` field. Update any property referencing destroy failure to note which test double configuration is expected.

---

### F-05 — Medium: `resolveContextDocuments` updated behavior (TSPEC §5.5) has no properties

TSPEC §5.5 defines a substantially changed `resolveContextDocuments` function with a new interface (`ContextResolutionContext` with `featurePath` field) and a new resolution table that distinguishes backlog/in-progress paths (unnumbered) from completed paths (NNN-prefixed, including `overview.md`). PLAN tasks E1 and E2 implement and test this. However, no PROP-XX entries cover this behavior:

- No property verifies that `resolveContextDocuments` resolves `{feature}/REQ` to `{featurePath}REQ-{slug}.md` for backlog/in-progress features.
- No property verifies that `resolveContextDocuments` resolves `{feature}/REQ` to `{featurePath}{NNN}-REQ-{slug}.md` for completed features.
- No property verifies the NNN extraction from `featurePath` (e.g., extracting `015` from `docs/completed/015-my-feature/`).
- No property verifies that `overview.md` gets the NNN prefix for completed features (this is explicitly called out in TSPEC §5.5 as a design decision).

These behaviors are tested in PLAN (E1, E2) but are orphaned — they have no corresponding PROP-XX properties and no entries in the coverage matrix. An implementer or future reviewer cannot trace these tests back to a documented invariant.

**Required action:** Add properties for context resolution path construction for both lifecycle stages (backlog/in-progress and completed), including NNN extraction logic and `overview.md` prefix handling.

---

### F-06 — Medium: `PromotionResult` contract has no property

TSPEC §5.2.1 defines the `PromotionResult` type: `{ featurePath: string; promoted: boolean }`. The `promoted` field distinguishes a real move (`true`) from an idempotent skip (`false`). No property covers this return type contract:

- No property verifies that `promoteBacklogToInProgress` returns `promoted: true` and the correct `featurePath` on a successful move.
- No property verifies that `promoteBacklogToInProgress` returns `promoted: false` and the in-progress path on an idempotent skip (PROP-NF-02 covers the side-effect, but not the return value).
- No property verifies that the workflow uses `PromotionResult.featurePath` to update `state.featurePath` after promotion.

The `promoted` boolean is used by callers to decide whether to log an idempotency message (PROP-PR-20), so the contract is load-bearing, not decorative.

**Required action:** Add contract properties for `PromotionResult` shape and for how the workflow consumes the result.

---

### F-07 — Low: PROP-SK-19 test level is Unit but the behavior is only verifiable at Integration

PROP-SK-19 ("Activities must not re-invoke the feature resolver independently when the resolved path is already stored in workflow state") is labeled Unit. This is an architectural invariant about the interaction between the workflow state and multiple activities — it is not verifiable by testing a single activity in isolation. To verify this property, a test must run multiple activities in sequence and confirm the resolver is called only once. That is an integration or workflow-level test by definition. Labeling it Unit implies it can be verified with a single fake-injected call, which it cannot.

**Required action:** Reclassify PROP-SK-19 as Integration.

---

### F-08 — Low: No property covers `WorktreeManager.cleanupDangling` startup integration path

PROP-WT-12 ("Composition root must call `worktreeManager.cleanupDangling` after the Temporal client connects") is Integration level and covers the composition root wiring. PROP-WT-08 ("must log a warning and skip the cleanup sweep when the Temporal server is unreachable") is Unit level. However, no integration property covers the happy-path startup sweep: that `cleanupDangling` is actually called with live active execution data and prunes real dangling worktrees on startup. This is specifically the crash-recovery scenario described in TSPEC §5.4. The unit-level properties (PROP-WT-14, PROP-WT-18) cover the pruning logic in isolation, but the wiring from orchestrator startup → Temporal query → `cleanupDangling(Set)` is not integration-tested as a composed behavior.

**Required action:** Add an integration property (or note this as a known gap with rationale) for the startup crash-recovery cleanup flow.

---

## Clarification Questions

### Q-01

PROP-SK-16 ("No module other than `FeatureResolver` must independently construct lifecycle-based feature paths") is labeled Unit and listed as a negative property. How is this verified in a unit test? This is an architectural constraint — verifying it requires either static analysis, a linter rule, or an architectural fitness function. A standard Vitest unit test cannot assert the absence of path construction in other modules. What is the intended test mechanism for PROP-SK-16?

### Q-02

PROP-PR-05 ("Phase 3 must update markdown links matching `[text](filename.md)` and `[text](./filename.md)`") is listed at Unit level. The implementation uses a regex on raw file content (TSPEC §5.2.2). Should the property specify the regex match pattern, or is verifying the output transformation (before/after string comparison) considered sufficient? Asking because the regex itself is published in TSPEC §5.2.2 and is a testable invariant that could have its own property.

### Q-03

TSPEC §5.4 (crash-recovery algorithm) states: "Since the registry doesn't survive a crash, check by querying Temporal: for each execution in activeExecutions, check if any activity metadata references this worktreePath." This implies the matching is done by interrogating Temporal's activity metadata — but `cleanupDangling` accepts only `activeExecutions: Set<string>` (formatted as `"workflowId:runId"`). How does the implementation cross-reference `worktreePath` against this Set when the registry is empty after a crash? Is there a secondary lookup mechanism not yet specified? This affects whether PROP-WT-18 can actually be implemented as described.

---

## Positive Observations

- **Test double design is production-quality.** The `FakeFeatureResolver` and `FakeWorktreeManager` in TSPEC §7.2 are thoughtfully designed with call recording (`resolveCalls`, `createCalls`, `destroyCalls`) that supports both behavior verification and interaction testing without over-engineering. The `setResult` pattern on `FakeFeatureResolver` avoids hard-coded responses while keeping fakes simple.

- **Protocol-based DI is consistently applied.** Every new module (`FeatureResolver`, `WorktreeManager`, `MigrateLifecycleCommand`) is defined as an interface before its implementation, and all properties correctly target the interface (not the concrete class). This means unit tests exercise the contract, not the implementation detail — which is exactly right for a TDD-first approach.

- **Idempotency properties are exceptional.** PROP-NF-02 through PROP-NF-07 cover partial-failure scenarios at a granularity that is usually omitted in property documents. The Phase-1-complete + Phase-2-partial retry scenario (PROP-NF-05) is particularly rigorous and directly maps to a Temporal retry condition.

- **Error handling properties correctly distinguish retryable vs non-retryable.** PROP-PR-12 (non-retryable on `git mv` failure), PROP-PR-13 (retryable on `git push` failure), and PROP-WT-06 (non-retryable on `git worktree add` failure) align precisely with the TSPEC §6 error table. This specificity is exactly what an implementer needs to correctly configure `ApplicationFailure`.

- **Negative properties encode architectural guardrails.** PROP-SK-20 (only orchestrator runs promotions), PROP-WT-15 (skill agents never touch main working tree), and PROP-WT-16 (no shared worktrees) are the kind of invariants that catch design drift during refactoring. They are well-placed as negative properties rather than buried in prose.

- **The acknowledged gap for concurrent NNN assignment (§7 Gap #2) is technically accurate.** The Temporal scheduling model means concurrent promotions are unlikely in practice, but the fact the document flags this explicitly and recommends an integration test for it demonstrates awareness of the distributed systems edge case.

---

## Recommendation

**Needs revision.** F-01 (High) — the `resolveFeaturePath` activity is entirely uncovered despite being architecturally required for Temporal determinism. F-02 (High) — PROP-WT-06's ambiguity could cause an implementer to skip the collision retry, breaking the specified algorithm. F-03 through F-06 (Medium) — test level mismatches, an incomplete test double, missing context-resolution properties, and a missing return-type contract collectively leave several integration points without automated enforcement.

Address F-01 and F-02 as blockers. F-03 through F-06 should also be resolved before implementation begins to avoid rework. Q-03 requires a design answer before PROP-WT-18 can be reliably implemented.
