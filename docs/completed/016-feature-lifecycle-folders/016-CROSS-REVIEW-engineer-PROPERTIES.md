# Cross-Review: Engineer — PROPERTIES Document

| Field | Detail |
|-------|--------|
| **Reviewer** | Senior Full-Stack Engineer (eng) |
| **Document Reviewed** | PROPERTIES-feature-lifecycle-folders.md (v1.2) |
| **References** | TSPEC-FLF v1.2, PLAN-FLF v1.1 |
| **Review Date** | April 4, 2026 |
| **Review Version** | v2 (re-review) |
| **Recommendation** | **Needs revision** |

---

## Prior Finding Resolution Summary

| Finding | Severity | Status |
|---------|----------|--------|
| F-01 — `resolveFeaturePath` activity entirely uncovered | High | **Resolved** — PROP-SK-21 (contract) and PROP-SK-22 (workflow enforces activity dispatch) added |
| F-02 — PROP-WT-06 ambiguous about retry-once before throwing | High | **Resolved** — PROP-WT-06 now requires both attempts to fail; PROP-WT-20 covers the retry-succeeds path |
| F-03 — PROP-PR-09 and PROP-PR-10 test level mismatch | Medium | **Resolved** — PROP-PR-09 rephrased as interaction invariant; PROP-PR-27 added at Integration level; PROP-PR-10 reclassified to Integration |
| F-04 — `FakeWorktreeManager` has no destroy failure injection | Medium | **Partially addressed** — documented as Gap #6 in §7, but TSPEC §7.2 is unchanged; PROP-WT-07 remains untestable with the canonical fake (see F-04 below) |
| F-05 — `resolveContextDocuments` updated behavior has no properties | Medium | **Resolved** — PROP-SK-23, PROP-SK-24, PROP-SK-25 added |
| F-06 — `PromotionResult` contract has no property | Medium | **Resolved** — PROP-PR-25, PROP-PR-26 added for `promoteBacklogToInProgress`; PROP-SK-26 added for workflow state update |
| F-07 — PROP-SK-19 labeled Unit but verifiable only at Integration | Low | **Resolved** — PROP-SK-19 reclassified to Integration |
| F-08 — No integration property for startup crash-recovery happy path | Low | **Resolved** — PROP-WT-21 added at Integration level |

---

## Findings

### F-04 — Medium: `FakeWorktreeManager` destroy failure injection still unaddressed in TSPEC

The v1.2 change log acknowledges this as Gap #6 in PROPERTIES §7, recommending that TSPEC §7.2 add a `destroyShouldFail: boolean` (or `destroyError?: Error`) field to `FakeWorktreeManager`. However, the TSPEC §7.2 definition itself has not been updated. The `FakeWorktreeManager.destroy()` method still always succeeds silently.

Until TSPEC §7.2 is updated, PROP-WT-07 ("must log the error and not throw when `git worktree remove` fails") has no canonical test double capable of simulating the failure path. Implementers will either write a one-off stub not covered by this specification, or leave PROP-WT-07 untested. The gap acknowledgement in PROPERTIES does not substitute for the TSPEC fix.

**Required action:** Update TSPEC §7.2 `FakeWorktreeManager` to add `destroyShouldFail: boolean` (defaulting to `false`) and a corresponding `destroyError?: Error` field; update `destroy()` to conditionally throw or reject when `destroyShouldFail` is true. Until TSPEC is updated, this finding remains open.

---

### F-09 — Low: `PromotionResult` contract not covered for `promoteInProgressToCompleted`

F-06 from the prior review noted the absence of `PromotionResult` contract properties for both promotion activities. The v1.2 response added PROP-PR-25 and PROP-PR-26 for `promoteBacklogToInProgress` only. The `promoteInProgressToCompleted` activity also returns a `PromotionResult` (TSPEC §5.2.2 step 2.i: `{ featurePath: "docs/completed/{NNN}-{slug}/", promoted: true }`), but no corresponding contract property exists for it.

This means the return contract for the completion promotion activity is unspecified. An implementer could return the wrong `featurePath` format or omit the `promoted` field without any property failing. Given that PROP-SK-26 reads `PromotionResult.featurePath` from this activity to update workflow state, the correctness of the returned value is load-bearing.

**Required action:** Add a contract property for `promoteInProgressToCompleted` return value specifying `{ featurePath: "docs/completed/{NNN}-{slug}/", promoted: true }`.

---

### F-10 — Low: PROP-WT-20 retry condition is underspecified relative to TSPEC §5.3

TSPEC §5.3 (Create algorithm) specifies the retry fires only on a path-collision failure: "if fails and worktreePath already exists (UUID collision, negligible probability)." PROP-WT-20 mirrors this correctly. However, PROP-WT-06 covers the double-failure case ("both the first and second attempts fail") without constraining whether the second attempt is still triggered when the first failure was not a collision (e.g., branch not found, git not installed). As written, an implementer reading PROP-WT-06 and PROP-WT-20 together could produce code that always retries on any first failure, then throws after the second — which would be incorrect for non-collision errors that should be non-retryable immediately (or retryable by Temporal, not by the UUID loop).

There is no property covering "must throw `ApplicationFailure.nonRetryable` immediately (without retry) when the first `git worktree add` failure is not a path-collision error."

**Required action:** Add a property or clarifying note to PROP-WT-06 specifying that the internal UUID-retry loop applies only to path-already-exists collisions; other first-attempt failures should propagate immediately as non-retryable.

---

### Q-01 (Carried over — unanswered)

Q-02 from the v1 review was not addressed in v1.2 and is not mentioned in the change log. Restating:

PROP-PR-19 ("Phase 3 internal ref update regex must match `[text](filename.md)` and `[text](./filename.md)` patterns only...") is a behavioral property that can be verified by string transformation tests. The regex itself is published in TSPEC §5.2.2. Should the property additionally enumerate negative-match cases (confirming the regex does NOT match wiki-style links, `[text][ref]` reference links, HTML anchors, etc.) as part of the property specification, or is the existing wording considered sufficient given PROP-PR-23 already specifies what must NOT be matched?

This is a property completeness question, not a blocking gap — the pair of PROP-PR-19 (positive match) and PROP-PR-23 (negative match) together cover the regex behavior. No action required unless the author considers PROP-PR-23 insufficient.

---

## Positive Observations

- **F-01 and F-02 resolutions are precise and correct.** PROP-SK-22 correctly targets the integration boundary between workflow code and Temporal activity dispatch — the wording "must invoke `resolveFeaturePath` via `executeActivity` ... and must not call `FeatureResolver.resolve()` directly in workflow code" is exactly the invariant needed to prevent Temporal determinism violations. PROP-WT-06's updated wording is unambiguous: "it must not throw after a single failure (one retry is required)."

- **PROP-WT-20 is a strong addition.** Specifying both the triggering condition (UUID collision) and the expected outcome (succeeds on second attempt) makes the retry behavior fully testable as a unit property with a `FakeGitClient` configured to fail-then-succeed.

- **The three new context-resolution properties (PROP-SK-23, SK-24, SK-25) are well-scoped.** Splitting backlog/in-progress vs. completed into separate properties, and isolating NNN extraction as its own invariant (PROP-SK-25), matches the three distinct branches in the TSPEC §5.5 algorithm. Each property is independently testable.

- **PROP-SK-26 closes the data-flow loop.** The addition of "Workflow must update `state.featurePath` from the `featurePath` field of the `PromotionResult`" directly ties the promotion activity contract to the workflow state contract, which is the integration seam most likely to be broken during refactoring.

- **Gap documentation in §7 is appropriately candid.** Gap #5 (crash-recovery worktree-to-execution matching design gap) is a genuine TSPEC deficiency accurately identified. Naming it explicitly in the PROPERTIES gap table is the right call — it prevents an implementer from discovering this ambiguity during a TDD red phase with no guidance.

- **The total property count (105, 89 Unit / 16 Integration) reflects substantive improvements.** The new additions are well-distributed across categories and not padded.

---

## Recommendation

**Needs revision.** One Medium finding remains open: F-04 (FakeWorktreeManager destroy failure injection) was documented as a gap in PROPERTIES but the TSPEC §7.2 fix has not been applied, leaving PROP-WT-07 still untestable with the canonical test double. Two Low findings are new: F-09 (missing `PromotionResult` contract for `promoteInProgressToCompleted`) and F-10 (PROP-WT-06 and PROP-WT-20 together are underspecified for non-collision first-attempt failures).

F-09 and F-10 can be addressed in a targeted patch to PROPERTIES without a full revision cycle. F-04 requires a coordinated update to TSPEC §7.2. Once those three issues are resolved, the document is otherwise approvable — the two High findings and four of the five Medium findings from v1 have been cleanly addressed.
