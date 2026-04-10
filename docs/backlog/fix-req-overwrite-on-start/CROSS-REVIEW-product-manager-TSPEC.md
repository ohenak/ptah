# Product Manager Cross-Review — TSPEC fix-req-overwrite-on-start

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager (`pm`) |
| **Artifact Reviewed** | [TSPEC-fix-req-overwrite-on-start.md](TSPEC-fix-req-overwrite-on-start.md) v1.1 |
| **Previous Revision Reviewed** | v1.0 (archived below under "v1.0 Review History") |
| **Baseline** | [REQ-fix-req-overwrite-on-start.md](REQ-fix-req-overwrite-on-start.md) v3.0 |
| **Date** | 2026-04-10 |
| **Recommendation** | **Approved** |
| **Scope** | Product perspective only — alignment with approved requirements, scope adherence, AC preservation, edge-case coverage from the user-experience point of view. |

---

## Summary (v1.1 Review)

TSPEC v1.1 addresses all three findings from the v1.0 review. The engineer chose option (b) from F-01 — tightening `NodeFileSystem.exists()` to catch only `ENOENT` and propagate all other errors — which preserves REQ-ER-03 in production without touching the `FileSystem` interface signature. F-02 is resolved via a new targeted test (#18) that covers REQ-WS-04's activity-sequence AC. F-03 is resolved by annotating test #5 to explicitly cite REQ-NF-02 scenario 4 and cross-link to test #9.

No new findings. REQ v3.0 is fully and faithfully realized by this TSPEC. **Approved.**

---

## Findings (v1.1)

None.

---

## v1.0 Findings — Resolution Verification

### F-01 (was High) — RESOLVED ✅

**Original concern:** TSPEC v1.0 explicitly waived REQ-ER-03 (P0) in production because `NodeFileSystem.exists()` silently swallowed all errors.

**v1.1 resolution:** §4.4 updates `NodeFileSystem.exists()` to:

```typescript
async exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(path.resolve(this._cwd, filePath));
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return false;  // file/dir genuinely absent
    throw err;                            // propagate real I/O errors (EACCES, EIO, etc.)
  }
}
```

**Verification:**
- The `FileSystem` interface signature is unchanged — `exists(filePath: string): Promise<boolean>`. The REQ v3.0 Out of Scope item ("`FileSystem` interface extension") is respected: no methods added, no signatures changed.
- §6 Error Handling row 3 now correctly describes production behavior: EACCES/EIO propagate out of `detect()`, are caught by `startNewWorkflow()`'s try/catch, which logs the error and posts the Discord reply. This satisfies REQ-ER-03's AC in production, not just in test doubles.
- §10 Open Questions confirms "No REQ update is required" — the resolution is purely at the TSPEC layer.
- §9 Integration Points row 1 correctly flags this as a behavior change to `src/services/filesystem.ts:36-43`, which is appropriate disclosure.

**Residual consideration (not a finding):** This change tightens the semantics of a shared utility method. Any existing caller of `NodeFileSystem.exists()` that happened to rely on "swallow everything and return false" for non-ENOENT errors will now surface errors instead. The TSPEC asserts existing `exists()` integration tests continue to pass, which is plausible (the happy-path cases tested are ENOENT / exists scenarios). From a product standpoint this is acceptable: it is a behavioral correction that brings `exists()` in line with conventional filesystem API semantics, and the REQ-ER-03 user-experience benefit outweighs the small theoretical regression risk. The engineer should keep an eye on this during implementation and regression testing, but it does not warrant a blocking finding.

---

### F-02 (was Medium) — RESOLVED ✅

**Original concern:** REQ-WS-04 (P0, activity-sequence AC) had no dedicated test in the TSPEC's test matrix.

**v1.1 resolution:** §7.5 adds test #18 in `feature-lifecycle.test.ts`:

> "`resolveNextPhase()` walked forward from `req-review` in a sequential config that includes `req-creation` before `req-review`: `req-creation` never appears in the resulting phase sequence; and the sequence from `req-review` onward is identical to the suffix of the full sequence starting from `req-creation` with `req-creation` omitted (REQ-WS-04 activity-sequence AC)"

§8 REQ-WS-04 mapping updated to cite test #18 alongside the existing `buildInitialWorkflowState` test at `feature-lifecycle.test.ts:342` (which verifies `currentPhaseId` is set to the requested start phase).

**Verification:** The test description directly matches REQ-WS-04's AC:
> "THEN: the workflow invokes the `req-review` activity first and then the same sequence of activities as a workflow that started at `req-creation` and reached `req-review`, with `req-creation` absent from the sequence"

The two-part assertion (`req-creation` never appears + sequence equals the suffix of the full sequence) is a direct operationalization of the AC. ✅

---

### F-03 (was Low) — RESOLVED ✅

**Original concern:** REQ-NF-02 scenario 4 ("Neither REQ nor overview → starts at `req-creation`, PM Phase 0 bootstrap not disrupted") was only implicitly covered by the combination of test #5 (return value) and test #9 (read-only invariant), with no explicit cross-reference.

**v1.1 resolution:** Test #5 description now reads:

> "Neither REQ nor overview anywhere → returns `req-creation`, `in-progress` (covers REQ-NF-02 scenario 4 'PM Phase 0 bootstrap not disrupted' [REQ-WS-02, REQ-PD-04]; the read-only invariant — zero write/delete/rename operations — is additionally asserted in test #9)"

And its REQ column now traces to `REQ-WS-02, REQ-NF-02, REQ-PD-04`.

**Verification:** Intent is now explicit at the test level; a reader of the test file can directly map test #5 to REQ-NF-02 scenario 4. ✅

---

## Positive Observations (v1.1)

1. **Engineer chose the right resolution path for F-01.** Option (b) from the v1.0 review — tightening `NodeFileSystem.exists()` semantics without touching the interface — preserves REQ v3.0's hard constraint while delivering REQ-ER-03's user-experience promise in production. This is the least disruptive solution that actually works.
2. **§6 Error Handling table row 3 is now honest and complete.** It describes production behavior accurately, cites §4.4 as the implementation hook, and confirms REQ-ER-03 is satisfied in production.
3. **§10 Open Questions' Q-01 resolution statement is updated** to reflect the new approach ("`NodeFileSystem.exists()` is updated to catch only `ENOENT`..."). Good traceability from the review to the doc.
4. **Test #18 is properly specified as a pure unit test** (walks `resolveNextPhase()` forward against a sequential config). No Temporal server required, deterministic, fast. Aligns with the TSPEC's general testing philosophy.
5. **REQ-WS-04 §8 mapping now cites both the new test #18 and the pre-existing `buildInitialWorkflowState` test by line number**, giving a complete picture of how the P0 AC is covered.
6. **Status updated to "In Review"** — appropriate for a document that has addressed one review cycle and is awaiting re-review.
7. **Change Log entry for v1.1 explicitly names each v1.0 finding** and describes how it was resolved. This is a model change log — makes re-review trivial.
8. **No scope creep.** The engineer fixed exactly what was requested and did not take the opportunity to expand scope elsewhere. The §3 project structure addition (`src/services/filesystem.ts` UPDATED) and the new §4.4 section are the minimal footprint change.
9. **All v1.0 positive observations carry over unchanged** — C-05 honored, decision table correct, warning format correct, log format correct, Discord reply contract correct, `TemporalOrchestratorDeps` extension pre-authorized, read-only invariant enforced, REQ-NF-02's 9-scenario test matrix comprehensive, REQ-WS-06 correctly split into algorithm + config tests.

---

## Recommendation

**Approved.**

No High, Medium, or Low findings remain. Per decision rules, the TSPEC is approved and ready for implementation.

The engineer may proceed to the PLAN phase (or directly to implementation per the feature's workflow). The R-01 mitigation in REQ §7 still applies: "test-first" is mandatory as the first PLAN task — write the failing integration test that reproduces the REQ-overwrite bug, confirm it fails, implement the fix, confirm it passes.

---

## v1.0 Review History

The v1.0 review raised:
- **F-01 (High)** — REQ-ER-03 P0 AC waived in production due to `NodeFileSystem.exists()` swallowing all errors.
- **F-02 (Medium)** — REQ-WS-04 P0 AC had no dedicated test.
- **F-03 (Low)** — REQ-NF-02 scenario 4 only implicitly covered.

All three are resolved in v1.1 as verified above.

---

*End of Cross-Review*
