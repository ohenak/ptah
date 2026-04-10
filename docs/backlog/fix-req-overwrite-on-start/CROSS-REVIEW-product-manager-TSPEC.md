# Product Manager Cross-Review — TSPEC fix-req-overwrite-on-start

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager (`pm`) |
| **Artifact Reviewed** | [TSPEC-fix-req-overwrite-on-start.md](TSPEC-fix-req-overwrite-on-start.md) v1.0 |
| **Baseline** | [REQ-fix-req-overwrite-on-start.md](REQ-fix-req-overwrite-on-start.md) v3.0 |
| **Date** | 2026-04-10 |
| **Recommendation** | **Needs revision** |
| **Scope** | Product perspective only — alignment with approved requirements, scope adherence, AC preservation, edge-case coverage from the user-experience point of view. Technical implementation choices are outside this review's scope. |

---

## Summary

The TSPEC faithfully captures the structural intent of REQ v3.0 and respects its hard constraints (no `FileSystem` extension, no `FeatureResolver` modification, single new dep on `TemporalOrchestratorDeps`). The decision table, warning format, structured log format, Discord reply contract, and 9-scenario test matrix are all implemented accurately.

However, one High-severity product issue blocks approval: the TSPEC explicitly acknowledges that **REQ-ER-03 (P0) will not be satisfied in production** because `NodeFileSystem.exists()` silently swallows I/O errors and returns `false`. This is a product-level trade-off — a P0 acceptance criterion will silently not hold under production conditions — and it is being introduced inside the TSPEC without a corresponding update to the REQ. Product decisions belong in the REQ, not in the TSPEC's "accepted trade-offs" section. This must be resolved before implementation.

One Medium finding concerns untested P0 REQ-WS-04. One Low finding concerns a small nuance in scenario 4 of REQ-NF-02.

---

## Findings

### F-01 — **High** — REQ-ER-03 (P0) AC is waived in production without REQ-level authorization

**Where:** TSPEC §4.2 "Design rationale" bullet 2; TSPEC §6 Error Handling table row 3.

**Issue:**
The TSPEC states (emphasis added):

> "`NodeFileSystem.exists()` internally catches all errors and returns `false`, so **in production I/O failures will silently behave as 'file not found' and fall back to `req-creation`**. This is an accepted trade-off documented in REQ-PD-01/02 Out of Scope (pathological edge cases excluded)..."

and in §6:

> "`FileSystem.exists()` throws (NodeFileSystem in production) | N/A | `NodeFileSystem.exists()` internally swallows all errors and returns `false`. I/O errors are NOT surfaced in production."

This directly contradicts REQ-ER-03, which is **P0** and carries the explicit acceptance criterion:

> "WHO: As a user GIVEN: phase detection cannot read the feature folder due to an I/O error WHEN: I trigger a workflow start THEN: I receive a Discord reply in the invoking thread … AND the workflow is NOT started"

The TSPEC's justification ("pathological edge cases excluded per REQ-PD-01/02 Out of Scope") conflates two distinct REQ concerns:

1. **REQ-PD-01/02 pathological file-level edge cases** — a directory named `REQ-<slug>.md`, a zero-byte file. These ARE out of scope per REQ v3.0 F-01.
2. **REQ-ER-03 infrastructure I/O errors** — permission denied, read error, network filesystem failure. These are **NOT** deprecated, **NOT** marked out of scope, and are explicitly called out as P0 with a behavioral AC.

The practical consequence: In production, a user on a corrupted or permission-locked checkout will see the workflow silently start at `req-creation` and the PM agent will overwrite whatever is there (or fail further downstream), which is exactly the user-experience failure that REQ-ER-03 was written to prevent. The testable coverage via `FakeFileSystem.existsError` only proves that the orchestrator *would* handle a throw correctly; it does not deliver the REQ-ER-03 promise to real users.

**This is a product-level decision**, not a technical one. The TSPEC is unilaterally narrowing a P0 AC. That decision must either:

- (a) Be made explicit in the REQ by **deprecating or weakening REQ-ER-03** (e.g., marking it "verifiable only via test double; production behavior is best-effort silent fallback"), with the user-experience trade-off acknowledged in the Risks section; **or**
- (b) Be resolved by finding a production-viable implementation path that does NOT require extending `FileSystem`. Options worth exploring: have `DefaultPhaseDetector` perform a single `NodeFileSystem` probe that does not go through `exists()` (e.g., a dedicated private helper in `node-filesystem.ts` that surfaces errors), or add a narrow diagnostic-only method that is not part of the general `FileSystem` contract. Neither extends `FileSystem` in the REQ sense; both preserve REQ-ER-03 in production; **or**
- (c) Be explicitly authorized by the Product Owner as an accepted defect, with a deprecation note in REQ-ER-03.

**Action required:** Choose one of (a), (b), or (c) and update both the REQ and the TSPEC accordingly. The current state — TSPEC silently narrows a P0 REQ — is not acceptable regardless of the technical rationale.

---

### F-02 — **Medium** — REQ-WS-04 (P0) has no dedicated test in the TSPEC test matrix

**Where:** TSPEC §7.5 and §8 "Requirement → Technical Component Mapping" row for REQ-WS-04.

**Issue:**
REQ-WS-04 is a **P0** requirement with a concrete activity-sequence acceptance criterion:

> "WHEN: the review phase completes successfully THEN: the workflow invokes the `req-review` activity first and then the same sequence of activities as a workflow that started at `req-creation` and reached `req-review`, with `req-creation` absent from the sequence"

The TSPEC §8 mapping for REQ-WS-04 reads only:

> "Existing `featureLifecycleWorkflow` behavior (no change) | `buildInitialWorkflowState` sets `currentPhaseId = 'req-review'` when `startAtPhase = 'req-review'`; subsequent phase progression is unchanged"

No test in §7.5 exercises the activity-sequence AC. No existing test file is cited by name as already covering it. REQ-NF-02's 9-scenario test matrix also does not include REQ-WS-04 explicitly (scenarios 1–2 cover `startAtPhase` selection but not the downstream activity sequence).

This leaves the P0 AC of REQ-WS-04 uncovered in this deliverable. The TSPEC has taken a product shortcut ("existing behavior") on a P0 contract without citing evidence that existing behavior verifiably meets the AC.

**Action required:** Either (a) add a test in §7.5 that asserts the activity sequence when `startAtPhase = "req-review"` (can be a pure unit test of `resolveNextPhase()` walked forward from `req-review`), or (b) cite the exact existing test file and test name(s) that already verify REQ-WS-04's AC, and add that citation to the §8 mapping row.

---

### F-03 — **Low** — Scenario 4 of REQ-NF-02 ("PM Phase 0 bootstrap not disrupted") is only implicitly covered

**Where:** TSPEC §7.5, test row #5 ("Neither REQ nor overview anywhere → returns `req-creation`").

**Issue:**
REQ-NF-02 scenario 4 reads:

> "Neither REQ nor overview → starts at `req-creation`, **PM Phase 0 bootstrap not disrupted** [REQ-WS-02]"

The TSPEC test #5 covers the first half (return value) and test #9 covers read-only invariants. Together they are adequate, but no single test asserts the product-level "Phase 0 bootstrap is not disrupted" property directly. A reader of the test file cannot trivially map test #5 to REQ-NF-02 scenario 4's second clause.

**Action required (non-blocking):** Either add a one-line comment in test #5 citing REQ-NF-02 scenario 4 and REQ-PD-04, or add an explicit assertion in test #5 that `fakeFs.writeOperations.length === 0` (or equivalent) so the "not disrupted" intent is visible at the test level.

---

## Clarification Questions

**Q-01** — On F-01: Is there a production-viable alternative path that does NOT require extending the `FileSystem` interface? Specifically, could `DefaultPhaseDetector` consume a narrow diagnostic capability (e.g., a private helper or a second injected collaborator) that surfaces I/O errors without adding methods to `FileSystem`? If yes, that resolves F-01 without touching the REQ. If no, F-01 must be resolved by updating the REQ per option (a) or (c). Which path do you recommend?

**Q-02** — On F-02: Are there existing tests in `ptah/tests/` that already verify the activity sequence from `req-review` onward is unchanged by this fix? If so, please cite them in the §8 mapping. If not, is it acceptable to add a short `resolveNextPhase`-based test that walks forward from `req-review` and records the phase order?

---

## Positive Observations

1. **Constraint C-05 faithfully honored.** `FeatureResolver` interface and `DefaultFeatureResolver` are untouched. New `PhaseDetector` component is created as directed. `FileSystem` interface is not extended. This is exactly what REQ v3.0 F-02 asked for.
2. **REQ-PD-03 decision table implementation is correct and exhaustive.** All eight cases (A–H) are handled; Cases A, B, C, H emit warnings with the slug and both lifecycle paths as literal substrings, matching the REQ AC verbatim.
3. **REQ-ER-02 structured log format matches the REQ's canonical example character-for-character:** `Phase detection: slug=<slug> lifecycle=<lifecycle> reqPresent=<bool> overviewPresent=<bool> startAtPhase=<phase>`.
4. **REQ-ER-03 Discord reply content and routing are correct** (at the test-double level): uses `message.threadId` (invoking thread, not parent channel); message contains the slug and the literal substring `"transient error during phase detection"`. The only problem is production reachability — see F-01.
5. **REQ-NF-02's 9-scenario test matrix is comprehensively mapped.** All nine scenarios have named test rows in §7.5 with REQ traceability. This is a substantial improvement over typical TSPEC coverage and directly satisfies REQ v3.0's TE-F-05 expansion.
6. **REQ-WS-06 is split into two tests** (algorithm unit test + YAML config integrity test) per REQ v3.0 F-03. The engineer correctly understood and preserved the two-facet testing contract.
7. **`TemporalOrchestratorDeps` extension is pre-authorized** in REQ §9 Scope Boundaries, and the TSPEC explicitly cites this. Good traceability.
8. **Read-only invariant (REQ-PD-04) is enforced by construction** — the only `FileSystem` method called is `exists()`; there is no path through the code to `writeFile`, `rename`, `copyFile`, `mkdir`, or `appendFile`.
9. **Ad-hoc directive routing (REQ-WS-05) is correctly preserved** — test #15 verifies `phaseDetector.detect()` is NOT called on Branch A.
10. **Warning message format verification** — the TSPEC §5 explicitly calls out the substring contract for REQ-PD-03 warnings and matches it in the §4.3 implementation.

---

## Recommendation

**Needs revision.**

Per decision rules: **any** High or Medium finding triggers Needs revision. F-01 (High) alone blocks approval; F-02 (Medium) adds an additional gap.

**Resolution path:**

1. **Address F-01 first** — this requires either a REQ update (options a/c) or a TSPEC revision (option b). Because this touches product scope, the PM should decide the direction before the engineer revises the TSPEC. Route back to PM if REQ changes are needed; otherwise route to engineer with guidance.
2. **Address F-02** — either cite existing tests or add a new test row for REQ-WS-04.
3. **Address F-03** — optional but recommended (Low severity, non-blocking on its own).
4. **Route the updated TSPEC back** to product-manager and other review skills for re-review.

---

*End of Cross-Review*
