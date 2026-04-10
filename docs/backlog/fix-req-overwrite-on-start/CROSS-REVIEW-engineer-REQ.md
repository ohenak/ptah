# Engineer Cross-Review: REQ-fix-req-overwrite-on-start (v3.0)

| Field | Detail |
|-------|--------|
| **Reviewer** | Engineer (eng) |
| **Document Reviewed** | [REQ-fix-req-overwrite-on-start.md](REQ-fix-req-overwrite-on-start.md) v3.0 |
| **Date** | 2026-04-10 |
| **Recommendation** | **Approved** |

---

## Summary

Version 3.0 resolves all four findings raised against v2.0. Both Medium-severity findings (F-01: `FileSystem` interface extension ambiguity; F-02: `FeatureResolver` conflict with REQ-PD-03 resolution logic) are fully addressed. Both Low-severity findings (F-03: REQ-WS-06 testability; F-04: `TemporalOrchestratorDeps` wiring gap) are fully addressed. No new findings at Medium or High severity were identified.

---

## Resolution Verification

### F-01 — `FileSystem.exists()` sufficiency (was Medium)

**Status: Resolved.**

REQ-PD-01 and REQ-PD-02 now read: _"A REQ is considered to exist when `REQ-<slug>.md` is present as a non-empty file at the expected path. The TSPEC author may implement this using `FileSystem.exists()` for the practical case; extending the `FileSystem` interface is not required by this REQ. (Edge cases such as a directory named `REQ-<slug>.md` or a zero-byte file at that path are pathological and out of scope.)"_

Section 9 (Out of Scope) now explicitly lists "`FileSystem` interface extension."

The TSPEC author has unambiguous authority to use `NodeFileSystem.exists()` (backed by `fs.access()`) without writing a `statFile` method or modifying the `FileSystem` interface.

---

### F-02 — `FeatureResolver` conflict with REQ-PD-03 (was Medium)

**Status: Resolved.**

C-05 now reads: _"REQ-file-presence checks must be made independently on each lifecycle folder path (e.g., `FileSystem.exists("docs/in-progress/<slug>/REQ-<slug>.md")`). The `FeatureResolver` interface (`FeatureResolver`) and its concrete implementation (`DefaultFeatureResolver`) must not be modified as part of this fix — `FeatureResolver.resolve()` may optionally be used for directory-existence checks but is not required."_

A-03 now reads: _"The fix introduces a new detection component (e.g., `PhaseDetector`) that checks for REQ and overview file presence independently using `FileSystem`. `FeatureResolver`'s interface and implementation are not modified."_

Section 9 (Out of Scope) now lists "`FeatureResolver` interface or `DefaultFeatureResolver` implementation modification."

The TSPEC author can correctly implement Case B (overview in `in-progress`, REQ in `backlog`) by calling `FileSystem.exists()` on each path independently, without relying on `FeatureResolver.resolve()` for REQ-presence logic. The conflict between C-05 and REQ-PD-03 is eliminated.

---

### F-03 — REQ-WS-06 testability (was Low)

**Status: Resolved.**

REQ-WS-06 now specifies two distinct acceptance tests:

> _(a) **Algorithm test** — a unit test of `resolveNextPhase()` with a sequential test `WorkflowConfig` confirms the phase-advancement algorithm never returns a phase earlier in the array than the current phase; (b) **Config integrity test** — a test loading the production `ptah.workflow.yaml` confirms no phase at array index ≥ the index of `req-review` has a `transition` field pointing back to `req-creation`._

This correctly separates the code-verifiable invariant (`resolveNextPhase()` with a test config) from the production-config integrity check (loading `ptah.workflow.yaml`). Both are independently implementable.

---

### F-04 — `TemporalOrchestratorDeps` wiring (was Low)

**Status: Resolved.**

Section 9 (In Scope) now reads: _"Adding one new dependency to `TemporalOrchestratorDeps` to wire in the new detection component (e.g., a `PhaseDetector`). This is expected and is not scope creep — `TemporalOrchestrator` currently has no filesystem access and requires it to perform phase detection."_

The TSPEC author will add the new dependency without treating it as an unanticipated scope increase or resorting to a module singleton.

---

## New Findings

No new High or Medium findings.

### F-05 — Decision table gap: `in-progress` REQ-only (no overview) cases are handled by general rule only (Low / Informational)

**Severity:** Low (informational only — no revision required)

Cases G (in-progress REQ+overview, backlog nothing) and D (in-progress nothing, backlog REQ) are explicitly enumerated. However, the combination "in-progress has REQ but no overview, backlog has nothing" (and similar REQ-without-overview sub-cases) is not assigned a named case letter. It is correctly handled by the **General resolution rule** ("The resolved folder is the first folder (in-progress → backlog order) that contains a REQ"), but there is no named row for it.

This is informational: the general rule is a complete and correct algorithmic statement of the table, and the `(any)` notation in Case C ("REQ (any) | REQ (any)") correctly signals that overview presence is irrelevant when REQ exists in both folders. The TSPEC author should implement the general rule as the canonical algorithm and treat the lettered cases as examples, not as an exhaustive enumeration of all 16 input combinations.

**No revision needed.** This observation was also implicitly present in the v2.0 review positive observations ("REQ-PD-03 decision table is exhaustive and correct") — the prior reviewer accepted the level of enumeration as sufficient.

---

## Positive Observations

- **All prior Medium findings resolved cleanly.** The PM chose Interpretation A for both F-01 and F-02 (accept `FileSystem.exists()` as sufficient; new `PhaseDetector` makes independent checks), which keeps scope minimal and `FeatureResolver` closed for modification. This is the correct call.
- **C-05 is now precise and implementation-ready.** The constraint names the new component, specifies constructor injection, and gives a concrete path example. The TSPEC author can proceed without resolving ambiguity.
- **REQ-WS-06 split is correctly specified.** Test (a) is a pure unit test; test (b) is a config-integrity test against the real YAML. Both are independently implementable and independently fail-able.
- **`TemporalOrchestratorDeps` extension is pre-authorized.** The TSPEC author will not need to make a scope decision at implementation time.
- **REQ-NF-02 9-scenario matrix is complete and directly maps to acceptance criteria.** Scenario 7 (I/O error → Discord reply with substring contract) and scenario 8 (read-only guarantee via fake `FileSystem` write audit) are particularly well-specified.
- **REQ-ER-03 substring contract is pinned.** "transient error during phase detection" + slug as required literal substrings gives the test engineer a deterministic assertion target.
- **REQ-PD-03 warning log substring contract is pinned.** Both `docs/in-progress/<slug>/` and `docs/backlog/<slug>/` paths required as literal substrings gives an equally deterministic assertion.
- **Scope boundary between this fix and `REQ-orchestrator-discord-commands` is crisp.** REQ-ER-01 deprecation rationale is clear and does not leave the TSPEC author uncertain about what to do when neither REQ nor overview exists.

---

## Recommendation

**Approved.**

All previously identified High and Medium findings have been resolved. The remaining Low observation (F-05) is informational and requires no document change. The REQ is ready for TSPEC authoring.
