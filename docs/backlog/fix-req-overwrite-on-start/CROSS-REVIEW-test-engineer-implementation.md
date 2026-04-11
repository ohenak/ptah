# Test Engineer Implementation Review — fix-req-overwrite-on-start

| Field | Detail |
|-------|--------|
| **Reviewer** | Senior Test Engineer (qa) |
| **Review Type** | Post-implementation code & test review |
| **Feature** | fix-req-overwrite-on-start |
| **Branch** | feat-fix-req-overwrite-on-start |
| **Date** | 2026-04-11 |
| **Recommendation** | **Approved** |

---

## 1. Scope

This review verifies that the implementation of `fix-req-overwrite-on-start` (Phases A–G) is fully and correctly tested against:

- All 15 active requirements in REQ v3.0 (12 × P0, 3 × P1)
- All 18 tests specified in TSPEC v1.1 §7.5
- All 9 mandatory test scenarios in REQ-NF-02
- The REQ-ER-03 thread-target AC (Discord reply to `message.threadId`, not parent channel)

Files examined:
- `src/orchestrator/phase-detector.ts`
- `src/services/filesystem.ts`
- `src/orchestrator/temporal-orchestrator.ts`
- `bin/ptah.ts`
- `tests/unit/orchestrator/phase-detector.test.ts`
- `tests/unit/orchestrator/temporal-orchestrator.test.ts`
- `tests/unit/services/filesystem.test.ts`
- `tests/unit/temporal/feature-lifecycle.test.ts`
- `tests/unit/fixtures/fake-filesystem.test.ts`
- `tests/unit/fixtures/fake-phase-detector.test.ts`
- `tests/fixtures/factories.ts`
- `tests/unit/orchestrator/architecture-constraints.test.ts`

---

## 2. Findings

No High or Medium severity findings.

---

### F-01 (Low) — Case A of the REQ-PD-03 decision table is implemented but not explicitly tested

**Location:** `src/orchestrator/phase-detector.ts:85–89`, `tests/unit/orchestrator/phase-detector.test.ts`

The decision table has four inconsistent-state cases (A, B, C, H) that require a warning log. The code correctly implements all four:

```typescript
// Case A: REQ in in-progress but overview also exists in backlog
} else if (inProgressReq && !backlogReq && backlogOverview) {
  this.logger.warn(`Phase detection: slug=${slug} inconsistent state — REQ in ${ipPath} but overview also in ${blPath}`);
```

The test suite covers Cases B (test #6), C (test #7), and H (test #8) with explicit warning-log assertions. Case A has no dedicated test. This is consistent with the TSPEC §7.5 plan, which only listed Cases B, C, H as required test cases — Case A was deliberately not planned.

**Risk:** Very Low. Case A resolves identically to the normal Case G (in-progress, req-review) from the user's perspective. The warning is a log-level concern, not a functional one. The code's warning condition for Case A is structurally symmetrical to Case B's, which is tested.

**Suggested action:** Add a Case A test to `phase-detector.test.ts` to fully pin the decision table warning coverage. Not blocking.

---

## 3. TSPEC §7.5 Test Compliance

All 18 planned tests are present and correctly implemented.

### `tests/unit/orchestrator/phase-detector.test.ts` — Tests #1–11

| # | TSPEC Description | Implemented? | Notes |
|---|------------------|-------------|-------|
| 1 | REQ in in-progress → req-review, in-progress | ✅ | Correct |
| 2 | REQ in backlog only → req-review, backlog | ✅ | Correct |
| 3 | Overview only in in-progress → req-creation, in-progress | ✅ | Correct |
| 4 | Overview only in backlog → req-creation, backlog | ✅ | Correct |
| 5 | Neither REQ nor overview → req-creation, in-progress | ✅ | Correct; asserts `reqPresent=false`, `overviewPresent=false` |
| 6 | Case B → backlog, req-review, warning with slug + both paths | ✅ | Correct |
| 7 | Case C → in-progress, req-review, warning with slug + both paths | ✅ | Correct |
| 8 | Case H → in-progress, req-creation, warning with slug + both paths | ✅ | Correct |
| 9 | Read-only invariant: no write/rename/copyFile/mkdir/appendFile calls | ✅ | Uses `vi.spyOn` correctly |
| 10 | Structured log entry with 5 key-value fields | ✅ | Asserts all 5: slug, lifecycle, reqPresent, overviewPresent, startAtPhase |
| 11 | `existsError` causes `detect()` to throw (propagated) | ✅ | Correct |

### `tests/unit/orchestrator/temporal-orchestrator.test.ts` — Tests #12–15

| # | TSPEC Description | Implemented? | Notes |
|---|------------------|-------------|-------|
| 12 | REQ detected → `startWorkflowForFeature` called with `startAtPhase: "req-review"` | ✅ | B1 regression test; confirmed RED before D2 |
| 13 | No REQ → `startWorkflowForFeature` called with `startAtPhase: "req-creation"` | ✅ | Correct |
| 14 | `detect()` throws → Discord reply to `threadId` with slug + error phrase; no workflow started | ✅ | `reply.threadId === "thread-99"` verified; REQ-ER-03 thread-target AC confirmed |
| 15 | Branch A (running workflow + ad-hoc) → `detect()` NOT called | ✅ | `phaseDetector.detectedSlugs.toHaveLength(0)` verified |

### `tests/unit/temporal/feature-lifecycle.test.ts` — Tests #16–18

| # | TSPEC Description | Implemented? | Notes |
|---|------------------|-------------|-------|
| 16 | `resolveNextPhase()` with sequential config never goes backward (REQ-WS-06a) | ✅ | 5-phase sequential config; all forward steps verified |
| 17 | Production `ptah.workflow.yaml`: no phase at index ≥ req-review has transition to req-creation (REQ-WS-06b) | ✅ | Loads YAML at runtime; asserts `phase.transition !== "req-creation"` |
| 18 | Walking from req-review never yields req-creation; sequence equals suffix without req-creation (REQ-WS-04) | ✅ | Correct |

---

## 4. REQ-NF-02 Mandatory Scenario Coverage

All 9 mandatory scenarios from REQ-NF-02 are covered.

| # | Scenario | Covered By | Status |
|---|---------|-----------|--------|
| 1 | REQ in in-progress → req-review | Test #1 (phase-detector.test.ts) | ✅ |
| 2 | REQ in backlog only → req-review | Test #2 | ✅ |
| 3 | Overview-only (no REQ) → req-creation | Tests #3, #4 | ✅ |
| 4 | Neither → req-creation; PM Phase 0 not disrupted | Test #5 | ✅ |
| 5 | Inconsistent: REQ in backlog + overview in in-progress → warning, backlog | Test #6 (Case B) | ✅ |
| 6 | Inconsistent: REQ in both → warning, in-progress | Test #7 (Case C) | ✅ |
| 7 | I/O error → Discord reply in invoking thread; no workflow started | Test #14 (temporal-orchestrator.test.ts) | ✅ |
| 8 | Read-only guarantee: zero write/delete/rename during detection | Test #9 | ✅ |
| 9 | Ad-hoc directive → existing ad-hoc path; detect() NOT called | Test #15 | ✅ |

---

## 5. Per-Requirement Verification

| Requirement | Verified By | Status |
|------------|------------|--------|
| REQ-PD-01 | Tests #1, #2 (both lifecycle folders checked in order) | ✅ |
| REQ-PD-02 | Tests #3, #4 | ✅ |
| REQ-PD-03 | Tests #6, #7, #8 (warning cases B, C, H); code logic for A, D, E, F, G | ✅ (Case A: Low — see F-01) |
| REQ-PD-04 | Test #9 (read-only spies) | ✅ |
| REQ-WS-01 | Tests #1, #2, #12 | ✅ |
| REQ-WS-02 | Tests #3, #4, #5, #13 | ✅ |
| REQ-WS-03 | Test #9 (no write calls during detect); test #12 (req-review passed to startWorkflowForFeature) | ✅ |
| REQ-WS-04 | Test #18 | ✅ |
| REQ-WS-05 | Test #15 | ✅ |
| REQ-WS-06 | Tests #16 (a) + #17 (b) | ✅ |
| REQ-ER-02 | Test #10 (structured log with 5 key-value fields) | ✅ |
| REQ-ER-03 | Tests #11, #14 (propagation + Discord threadId reply, no workflow started) | ✅ |
| REQ-NF-02 | All 9 scenarios (see Section 4) | ✅ |
| REQ-NF-03 | No API surface changes; existing tests pass | ✅ |
| REQ-NF-04 | `logger.info()` / `logger.warn()` used throughout; no `console.log` in phase-detector.ts | ✅ |

---

## 6. Test Double Quality

**FakePhaseDetector** (`factories.ts`, `tests/unit/fixtures/fake-phase-detector.test.ts`):
- Default result (`startAtPhase: "req-creation"`) protects existing Branch B tests ✅
- `detectError` injection triggers throw ✅
- `detectedSlugs` records all calls including error cases ✅ (test #5 in fake-phase-detector.test.ts verifies slug is recorded even when throw occurs)
- 5 dedicated tests in fake-phase-detector.test.ts ✅

**FakeFileSystem.existsError** (`factories.ts`, `tests/unit/fixtures/fake-filesystem.test.ts`):
- `existsError` throws on every call when set ✅
- Null behavior is verified (2 tests in `describe("existsError injection")`) ✅

**NodeFileSystem.exists() error propagation** (`tests/unit/services/filesystem.test.ts`):
- ENOENT → returns false ✅
- EACCES → rejects with same error (`.code === "EACCES"`) ✅
- EIO → rejects with same error (`.code === "EIO"`) ✅
- Partial `vi.mock` pattern with `importOriginal` is correct: spreads all original methods, only replaces `access` with a spy. Existing integration-style tests (mkdtemp, writeFile) continue to use real I/O ✅

---

## 7. Code Correctness Observations

**`NodeFileSystem.exists()` fix (E2):**
```typescript
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return false;
  throw err;
}
```
Correct. Catches only ENOENT; propagates all other errors. The code comment `// file/dir genuinely absent` adds useful clarity.

**`DefaultPhaseDetector.detect()` decision table:**
The code correctly implements the general resolution rule: "first folder (in-progress → backlog) that contains a REQ; if no REQ, first folder that contains an overview." The warning conditions for Cases B, C, H are structurally correct and match the REQ-PD-03 acceptance criteria.

**Note on Case A code condition:** The implemented condition is `inProgressReq && !backlogReq && backlogOverview`, which does not check `inProgressOverview`. This fires for both "REQ + overview in in-progress, overview in backlog" and "REQ only in in-progress, overview in backlog". Both are reasonable inconsistency warnings since a backlog overview without a corresponding backlog REQ (alongside an in-progress REQ) is unexpected. The resolution (in-progress, req-review) is correct for both sub-cases.

**`TemporalOrchestrator.startNewWorkflow()` — REQ-ER-03 thread-target:**
```typescript
await this.discord.postPlainMessage(
  message.threadId,
  `${slug}: transient error during phase detection. Please try again.`,
);
```
Posts to `message.threadId` (the invoking thread), not the parent channel. Test #14 asserts `reply.threadId === "thread-99"`. ✅

**`bin/ptah.ts` composition root:**
```typescript
const phaseDetector = new DefaultPhaseDetector(fs, logger);
// ...
const orchestrator = new TemporalOrchestrator({
  // ...
  phaseDetector,
});
```
Correctly placed after `featureResolver`. Receives `fs` and `logger` (the `start` case's `ConsoleLogger` and `NodeFileSystem` instances). TypeScript strict mode catches missing/misnamed fields at compile time. ✅

**Architecture constraint PROP-SK-16:**
`phase-detector.ts` was correctly added to the `ALLOWED_FILES` set in `architecture-constraints.test.ts` with a comment explaining the exception: "read-only lifecycle detection; constructs paths to check REQ/overview presence." ✅

---

## 8. Positive Observations

1. **Strict TDD adherence**: R-01 mandate (B1 confirmed RED before C1 began) and E1 RED confirmation before E2 both documented in commit messages. TDD ordering constraints were honored.

2. **Error propagation chain is complete**: Non-ENOENT errors propagate from `NodeFileSystem.exists()` → `DefaultPhaseDetector.detect()` → `TemporalOrchestrator.startNewWorkflow()` catch block → Discord reply. All three links are tested independently.

3. **Test doubles follow project conventions**: `FakePhaseDetector` uses the same `error: Error | null` injection pattern established by other fakes. Non-trivial fakes have dedicated test files.

4. **The `vi.mock` partial mock pattern is well-executed**: Using `importOriginal` to spread all real methods and only replacing `access` with a spy avoids breaking the existing filesystem unit tests that use real temp directories.

5. **Workflow continuation invariants are strongly pinned**: Tests #16, #17, #18 provide layered assurance — algorithm-level, production-config-level, and walk-level coverage of REQ-WS-06 and REQ-WS-04.

6. **Clean composition root**: Phase G adds exactly one instantiation and one wiring line with no structural changes to existing dependencies.

---

## 9. Recommendation

**Approved.**

All 18 TSPEC §7.5 tests are present and correct. All 9 REQ-NF-02 mandatory test scenarios are covered. All 15 active requirements (12 P0 + 3 P1) are verified. The sole Low-severity finding (Case A not having a dedicated test) is consistent with the TSPEC test plan and does not block approval. The implementation is complete.

Optional follow-up (not blocking): Add a Case A test to `phase-detector.test.ts` to fully pin all four warning branches of the REQ-PD-03 decision table.
