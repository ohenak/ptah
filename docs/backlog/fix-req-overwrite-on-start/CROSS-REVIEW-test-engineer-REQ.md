# Test Engineer Cross-Review: REQ-fix-req-overwrite-on-start

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document Reviewed** | [REQ-fix-req-overwrite-on-start.md](REQ-fix-req-overwrite-on-start.md) v1.0 |
| **Date** | 2026-04-10 |
| **Recommendation** | **Needs revision** |

---

## Summary

From a testability perspective the REQ is in good shape overall — most acceptance criteria are in Who/Given/When/Then form, REQ-PD-04 states a strong read-only invariant, and REQ-WS-03 is framed as a negative invariant that is easy to encode as a property. There are, however, several issues that will directly harm test authoring: REQ-NF-01's latency assertion is structurally flaky, REQ-WS-04 uses "identically" without a verifiable contract, REQ-NF-02's scenario list under-specifies the test matrix, and the document never defines what "REQ exists on disk" actually means (empty file? stat vs. readFile? symlink?). These gaps must be closed before a TSPEC can encode them into test doubles and fakes.

This review is intentionally scoped to testability and does not duplicate the structural, scoping, or architectural findings already raised in [CROSS-REVIEW-engineer-REQ.md](CROSS-REVIEW-engineer-REQ.md) (F-01…F-07, Q-01…Q-04). Where those findings also have test implications, I reference them rather than re-litigate the substance.

---

## Findings

### F-01 — REQ-NF-01 latency assertion is structurally flaky (High)

**Severity:** High

REQ-NF-01 requires phase detection to complete "under 50 ms on a warm cache" and names an integration test as the measurement mechanism. Wall-clock assertions at this resolution are a known source of flakiness in CI, particularly on shared runners, on Windows (where filesystem stat is materially slower than on Linux), and under parallel test execution. A single noisy run would fail the suite for reasons unrelated to the code under test, violating C-04 (no existing test may regress).

Additionally, "warm cache" is not defined. Is the cache the OS page cache, Node's `fs` cache, or a specified in-process cache? Without that definition the test is not reproducible.

**Options to resolve:**
- **Option A (recommended):** Drop REQ-NF-01 entirely. Two `fs.stat` calls cannot plausibly exceed 50 ms on any supported environment, so the NFR has no defensive value, only flakiness risk.
- **Option B:** Replace the wall-clock assertion with a structural assertion — e.g., "phase detection performs at most N filesystem operations and no network calls." This is deterministic and can be verified by spying on the injected `FileSystem` fake.
- **Option C:** Downgrade from P1 to a micro-benchmark reported separately from the test suite, so the CI gate is not coupled to wall-clock timing.

---

### F-02 — REQ-WS-04 "identically to a workflow that started at req-creation" is not testable as written (Medium)

**Severity:** Medium

REQ-WS-04 states that a workflow started at `req-review` must "continue through the remaining phases **identically** to a workflow that started at `req-creation`." "Identically" implies a full-workflow comparison, which conflicts with C-03 (must be testable without a live Temporal server) and with the test pyramid — a true identity check requires exercising every downstream phase through a fake or real Temporal worker, which is either an E2E test or a very heavy integration test.

The testable observable is narrower: starting at `req-review` must cause the workflow to invoke the `req-review` activity first, and must not invoke the `req-creation` activity. The rest is a Temporal workflow contract and is the domain of the existing `featureLifecycleWorkflow` tests.

**Recommendation:** Rephrase as: "A workflow started at `req-review` must invoke the same sequence of activities from `req-review` onward as a workflow that started at `req-creation` and reached `req-review`. The only observable difference is that the `req-creation` activity is not invoked." This narrows the property to something a test can verify by spying on activity invocations on a fake Temporal client.

---

### F-03 — "REQ exists" is not defined — multiple non-equivalent detection semantics (Medium)

**Severity:** Medium

REQ-PD-01 says the orchestrator must "record whether a REQ exists on disk" but never defines what "exists" means. At least four non-equivalent interpretations are consistent with the current wording:

| Interpretation | Behavior for empty file | Behavior for symlink to a file | Behavior for symlink to a directory | Behavior on Windows with case-insensitive filesystem |
|---|---|---|---|---|
| `fs.stat` returns | exists | exists | exists (dir) | case-insensitive match wins |
| `fs.stat` + `isFile()` | exists | exists | does NOT exist | same |
| `fs.readFile` succeeds | exists | exists | throws (EISDIR) | same |
| `fs.readFile` non-empty | does NOT exist | depends | throws | same |

Each interpretation produces a different test matrix. The most defensive choice — `fs.stat` + `isFile()` + non-empty content check — is also the most conservative against the data-loss risk this REQ exists to fix. Whatever is chosen, it must be explicit so the TSPEC author can specify the `FileSystem` protocol method signature and the test fakes can inject matching fixtures.

**Recommendation:** Add an explicit definition to REQ-PD-01: *"A REQ is considered to exist when `REQ-<slug>.md` is a regular file (not a directory or symlink to a non-file) and its size is greater than zero bytes."* Same for REQ-PD-02 / overview.

---

### F-04 — REQ-WS-03 "across retries, recovery, and any failure of the review cycle" cannot be verified without Temporal (Medium)

**Severity:** Medium

REQ-WS-03 states the invariant "the `req-creation` activity is never called" must be preserved "across retries, recovery, and any failure of the review cycle." Temporal workflow replay semantics (retries, continuation, signal handling, worker crash recovery) are not exercisable through the in-memory fakes allowed by C-03. That leaves two bad choices: either (a) the invariant is only verified for the "happy path" single workflow run, which does not actually prove the invariant holds under retries; or (b) a live Temporal test environment is required, which violates C-03.

**Recommendation:** Split REQ-WS-03 into two tightly-scoped requirements:
- **REQ-WS-03a (unit/integration):** When `startNewWorkflow` detects an existing REQ, the `startAtPhase` argument passed to `startFeatureWorkflow` is exactly `"req-review"` and `REQ-<slug>.md` is not opened for write during the call. Verifiable by fake `TemporalClient` + fake `FileSystem`.
- **REQ-WS-03b (workflow-level, deferred):** The `featureLifecycleWorkflow` definition must not include a transition from `req-review` (or later phases) back to `req-creation`. Verifiable by static inspection or by a targeted unit test of the workflow state machine.

This makes the invariant actually checkable and matches the existing test infrastructure.

---

### F-05 — REQ-NF-02 test scenario list is incomplete (Medium)

**Severity:** Medium

REQ-NF-02 mandates "at least one integration test per acceptance scenario" and enumerates three: REQ-present → `req-review`; overview-only → `req-creation`; neither → Discord error. That list omits at least the following scenarios that other requirements explicitly create:

1. **Inconsistent state** (REQ-PD-03) — REQ in `in-progress`, overview in `backlog`; must prefer `in-progress` and emit a warning log. Without a test, the warning is cosmetic and could silently regress.
2. **I/O error during detection** (REQ-ER-03) — `FileSystem.stat` throws non-ENOENT error; must emit transient-error Discord reply and must NOT call `startFeatureWorkflow`. This is the load-bearing test for the "never silently fall back" invariant.
3. **Read-only guarantee** (REQ-PD-04) — filesystem snapshot before/after is byte-identical. Can be verified at the unit level with a spying `FileSystem` fake that records all write attempts.
4. **Ad-hoc directive untouched** (REQ-WS-05) — a mention against a running workflow must still route through `handleMessage`'s existing ad-hoc path, not through `startNewWorkflow`. This is a regression test for the primary blast-radius concern of the fix.
5. **Completed lifecycle** (dependent on resolution of engineer F-02) — once the behavior is defined, a test must pin it.

**Recommendation:** Expand REQ-NF-02 to enumerate every acceptance scenario from Sections 5.1–5.3, not only the three happy paths. The test matrix should be derived from the requirement IDs, not from a hand-picked subset.

---

### F-06 — REQ-ER-01 Discord reply content is not pinned, so the test cannot assert on it (Medium)

**Severity:** Medium

REQ-ER-01 requires the orchestrator to "reply in the invoking Discord thread with an error that names the slug and the expected paths." "Names" is loose — can a test assert the slug appears as a substring? Must it appear verbatim? Must both expected paths appear? Without a pinned contract, the test either over-constrains (asserting exact strings that become brittle) or under-constrains (asserting nothing meaningful).

Same concern applies to REQ-ER-03 ("a Discord reply indicating a transient error"): "indicating" is not a contract.

**Recommendation:** Add an explicit message-shape contract for both error replies. For example:
- REQ-ER-01: "The reply must contain, as literal substrings: the slug, the string `docs/in-progress/<slug>/`, and the string `docs/backlog/<slug>/`."
- REQ-ER-03: "The reply must contain a fixed sentinel string (e.g., `transient error during phase detection`) and the slug."

This gives the test a concrete assertion target without freezing full message copy.

---

### F-07 — Negative properties are under-specified (Low)

**Severity:** Low

The REQ does a good job with REQ-PD-04 and REQ-WS-03 on the negative side, but several other "must not" properties that are implied by the user scenarios are not explicit:

- **Orchestrator must not invoke `startFeatureWorkflow` more than once per trigger**, even if the same Discord event is delivered twice (Temporal workflow-id uniqueness already covers this per R-03, but the REQ should pin the invariant so there is an explicit property to test).
- **Orchestrator must not leak absolute filesystem paths** into the Discord reply when the repository root is sensitive (e.g., a home directory on Windows). Could be tested by asserting the reply does not contain the OS-specific path separator prefix.
- **Overview file must not be read or hashed during REQ detection** if detection short-circuits on finding a REQ (supports REQ-NF-01's latency intent without the flaky timer).
- **Error reply must be posted in the invoking thread, not the parent channel** (implicit in "in the invoking Discord thread" but worth asserting).

None of these are blocking, but calling them out now means the PROPERTIES document and the TSPEC will include them explicitly instead of rediscovering them during review.

---

### F-08 — REQ-ER-02 logging requirement lacks a testable observable (Low)

**Severity:** Low

REQ-ER-02 requires a structured log entry with five specific fields, but the current `Logger` interface accepts strings only (flagged by engineer F-07). From a testing angle, the issue is that a test currently has no deterministic way to assert "the log contains `slug=foo lifecycle=backlog reqPresent=true overviewPresent=false startAtPhase=req-review`" unless:

1. The log format is frozen (stable field ordering, stable separator), OR
2. The Logger interface is extended to accept key/value pairs and the test can spy on them.

Option (2) is cleaner but expands scope beyond a minimal bug fix. Option (1) is acceptable if the REQ pins the exact format.

**Recommendation:** Pick one and state it in the REQ. Without this the TSPEC author has to guess and the test fake may not match reality.

---

### F-09 — Acceptance criteria for REQ-PD-03 warning log has no assertable field (Low)

**Severity:** Low

REQ-PD-03 says the orchestrator must "log a warning naming both paths." "Naming" has the same loose-contract problem as F-06. A test cannot assert on a warning message without a contract. Given the warning is the entire mitigation for R-02, the contract matters.

**Recommendation:** Specify: "The warning log entry must contain, as literal substrings: the slug and both the `in-progress` and `backlog` absolute-relative paths."

---

## Clarification Questions

### Q-01 — How should timing-sensitive NFRs be tested in this project?

See F-01. If the project has a preferred pattern for latency testing (benchmark harness separate from the test suite, statistical thresholds, etc.), documenting it in the REQ or referencing project testing conventions would resolve this cleanly. Otherwise I recommend dropping REQ-NF-01.

### Q-02 — Are "retries/recovery" in REQ-WS-03 activity-level or workflow-level?

See F-04. Temporal has both. Activity-level retries are invisible to the workflow definition; workflow-level recovery (replay after worker crash) is. The test strategy depends on which one is meant. If both, the REQ should split the invariant accordingly.

### Q-03 — Is REQ-PD-04's "byte-for-byte identical" asserted on the whole feature folder, or just the candidate REQ and overview paths?

A full-tree hash is straightforward to assert in a unit test with a `MemoryFileSystem`, but expensive on real disk. A narrow assertion on `REQ-<slug>.md` and `overview.md` is sufficient to catch the data-loss bug this REQ exists to fix. Please confirm the narrow scope is acceptable; if so, tighten the AC wording.

### Q-04 — Should the PROPERTIES document and TSPEC extend or replace REQ-NF-02's test matrix?

If this fix proceeds, the PROPERTIES document will derive a full property matrix from the requirements. Should REQ-NF-02 be treated as a minimum floor (must test at least these scenarios) or as the complete test plan (only test these scenarios)? The wording "at least one per acceptance scenario" implies the former, which is correct, but the enumerated list of three scenarios suggests the latter.

---

## Positive Observations

- **AC in Who/Given/When/Then format.** Most requirements are specific enough to drive unit tests without clarification.
- **REQ-PD-04 read-only invariant** is exactly the kind of strong negative property that is easy to test and high-value — it prevents the whole class of data-loss regressions this REQ exists to fix.
- **REQ-WS-03 is framed as an invariant across states**, which is the right shape for a Temporal workflow even though the testable scope needs to be narrowed (F-04).
- **REQ-WS-05** explicitly preserves the ad-hoc directive path. This is a high-value regression test target that is trivially testable with a fake `WorkflowHandle`.
- **C-03 (integration tests without live Temporal)** correctly aligns the test strategy with the test pyramid and existing project conventions.
- **Section 4 success metrics tie directly to integration-test-measurable outcomes** (0% overwrite rate, 100% phase accuracy across both fixtures). This is the right instrumentation for a bug fix.
- **Risk R-01 mitigation mandates writing the failing test first**, which is the correct TDD posture for a bug fix.

---

## Recommendation

**Needs revision.**

One High severity finding (F-01, REQ-NF-01 flakiness) and four Medium findings (F-02 testable contract for REQ-WS-04; F-03 definition of "exists"; F-04 scope of REQ-WS-03 invariant; F-05 incomplete test matrix; F-06 unpinned error reply contract). Per the mandatory decision rules, the presence of High or Medium findings precludes "Approved" or "Approved with minor changes." The author must address all High and Medium findings and route the updated REQ back for re-review.

**Testing-perspective minimal revision scope:**

1. Drop REQ-NF-01 or restate it structurally (F-01).
2. Narrow REQ-WS-04's "identically" clause to a specific activity-invocation contract (F-02).
3. Define what "REQ exists" means (F-03) — stat + isFile + non-empty is recommended.
4. Split REQ-WS-03 into a directly-testable unit/integration invariant and a workflow-definition invariant (F-04).
5. Expand REQ-NF-02 to enumerate every acceptance scenario from Sections 5.1–5.3, not only three happy paths (F-05).
6. Pin the Discord error reply contract as a substring contract, not a prose description (F-06, F-09).
7. Optionally lift the F-07 negative properties into explicit requirements so they flow into the PROPERTIES document without rediscovery.
8. Resolve F-08 by either pinning the log format or scoping the Logger extension.

With those changes, the REQ is ready for PROPERTIES derivation and TSPEC authoring without ambiguity in the test matrix.

---

*End of review*
