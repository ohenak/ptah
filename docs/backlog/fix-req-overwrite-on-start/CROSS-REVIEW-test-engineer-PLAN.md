# Test Engineer Cross-Review — PLAN fix-req-overwrite-on-start

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Artifact Reviewed** | [PLAN-fix-req-overwrite-on-start.md](PLAN-fix-req-overwrite-on-start.md) v1.0 (Draft) |
| **Baseline Context** | [REQ v3.0](REQ-fix-req-overwrite-on-start.md), [TSPEC v1.1](TSPEC-fix-req-overwrite-on-start.md) (both approved) |
| **Date** | 2026-04-10 |
| **Recommendation** | **Needs revision** |
| **Scope** | Test-engineering perspective only — test coverage completeness, test pyramid balance, ordering (R-01), test-double design, integration boundary coverage, and testability of each task. |

---

## Summary

The PLAN is well-structured and maps all 18 TSPEC tests and all 9 REQ-NF-02 scenarios to concrete tasks. R-01's "Red before implementation" ordering is honored at the task-phase level, and the critical path + parallelization graph is clearly articulated. TDD status tracking is in place.

However, one Medium finding blocks approval: **Phase E (NodeFileSystem.exists() change) explicitly opts out of writing a test for the new behavior branch.** The F-01 resolution in TSPEC v1.1 — catching only `ENOENT` and propagating all other errors — is the mechanism by which REQ-ER-03 (P0) is satisfied in production, but the PLAN claims "existing coverage is sufficient." Existing tests only cover happy paths (ENOENT → false, exists → true); there is no test that a non-ENOENT error (e.g., `EACCES`) now propagates instead of being swallowed. This leaves a P0 production guarantee entirely unverified in CI.

Three Low findings concern test-assertion precision (REQ-ER-03 thread target), plan ambiguity (A3 compilation strategy), and composition-root wiring coverage.

---

## Findings

### F-01 — **Medium** — Phase E has no test for the new `NodeFileSystem.exists()` propagation branch

**Where:** [PLAN §2 Phase E, task E1](PLAN-fix-req-overwrite-on-start.md).

**Quote from the PLAN:**

> "Update `NodeFileSystem.exists()` to catch only `ENOENT` and propagate all other errors per TSPEC §4.4; run `tests/integration/services/filesystem.test.ts` and confirm all three `exists()` tests (nonexistent → false, existing file → true, existing dir → true) remain GREEN; **no new tests needed (existing coverage is sufficient per TSPEC)**"

**Issue:**
The existing three tests named by E1 cover only the pre-existing happy-path behavior:
1. Nonexistent path → `false` (ENOENT path, was swallowed before and still returns `false`)
2. Existing file → `true`
3. Existing dir → `true`

**None of them exercise the new branch**: a non-ENOENT error (e.g., `EACCES`, `EIO`, `EPERM`) where the updated implementation is supposed to *throw* instead of returning `false`. Without a new test, the PLAN ships the most product-critical change in TSPEC v1.1 — the entire F-01 resolution from the PM cross-review — with zero CI verification.

**Why this matters:**
- The whole reason TSPEC v1.1 added §4.4 is to satisfy REQ-ER-03 (P0) in production. That production behavior hinges on `NodeFileSystem.exists()` correctly propagating non-ENOENT errors. If it silently reverts (e.g., someone simplifies the catch during a future refactor) nothing fails in CI. The REQ-ER-03 production coverage is invisible to the test suite.
- The plan's own §5 Definition of Done includes "REQ-ER-03 satisfied in production: `NodeFileSystem.exists()` propagates non-ENOENT errors through `DefaultPhaseDetector.detect()` to `startNewWorkflow()`'s catch block." This DoD item is unverifiable with the current test matrix.
- Test #11 in `phase-detector.test.ts` only verifies that `DefaultPhaseDetector.detect()` propagates errors from `FakeFileSystem` (via the injected `existsError`). That test does not exercise `NodeFileSystem` at all. Test #14 in `temporal-orchestrator.test.ts` similarly uses `FakePhaseDetector` with `detectError` and never touches `NodeFileSystem`.
- So the entire propagation chain from *real* production `NodeFileSystem.exists()` through `DefaultPhaseDetector` to `TemporalOrchestrator.startNewWorkflow()` is covered end-to-end with test doubles only — the *real* production code path is uncovered.

**Required resolution:**
Add a new task (suggested: E2) with a test that verifies `NodeFileSystem.exists()` propagates non-ENOENT errors. Two viable approaches:

**Option A — Unit test with `node:fs/promises` stubbed (preferred — fastest, deterministic, cross-platform):**

```typescript
// tests/unit/services/node-filesystem.test.ts (new file, or extend existing)
import { vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import { NodeFileSystem } from "../../../src/services/filesystem.js";

vi.mock("node:fs/promises");

describe("NodeFileSystem.exists() error propagation (REQ-ER-03)", () => {
  it("returns false when fs.access throws ENOENT", async () => {
    const err = Object.assign(new Error("not found"), { code: "ENOENT" });
    vi.mocked(fsPromises.access).mockRejectedValueOnce(err);
    const fs = new NodeFileSystem(process.cwd());
    await expect(fs.exists("missing")).resolves.toBe(false);
  });

  it("throws when fs.access throws EACCES", async () => {
    const err = Object.assign(new Error("permission denied"), { code: "EACCES" });
    vi.mocked(fsPromises.access).mockRejectedValueOnce(err);
    const fs = new NodeFileSystem(process.cwd());
    await expect(fs.exists("restricted")).rejects.toMatchObject({ code: "EACCES" });
  });

  it("throws when fs.access throws EIO", async () => {
    const err = Object.assign(new Error("i/o error"), { code: "EIO" });
    vi.mocked(fsPromises.access).mockRejectedValueOnce(err);
    const fs = new NodeFileSystem(process.cwd());
    await expect(fs.exists("corrupt")).rejects.toMatchObject({ code: "EIO" });
  });
});
```

**Option B — Integration test using real filesystem (works on POSIX, skip on Windows):**

Create a temp directory, `chmod 000` it, then probe a child path. Skip on `process.platform === "win32"` since Windows permission semantics differ. This is slower but exercises real `fs.access` behavior.

**Recommended:** Option A. Runs in milliseconds, deterministic, cross-platform (tests run on Windows per project env), and directly exercises the branch that was added.

**Action required:** Add the new test task before G1. Update the DoD checklist to reference the new test.

---

### F-02 — **Low** — Test #14 (REQ-ER-03) does not explicitly verify the Discord reply thread target

**Where:** [PLAN §2 Phase D, task D1](PLAN-fix-req-overwrite-on-start.md); cross-reference TSPEC §7.5 test #14.

**Issue:**
REQ-ER-03's AC says:

> "THEN: I receive a Discord reply **in the invoking thread (not the parent channel)** that contains, as literal substrings, the slug and the string `transient error during phase detection`, AND the workflow is NOT started"

PLAN D1 describes test #14 as:

> "(14) `detect()` throws → Discord reply with slug + 'transient error during phase detection', no workflow started"

This omits the thread-target assertion. Without it, a refactor that posts to `parentChannelId` instead of `message.threadId` would leak past CI. The assertion is cheap: verify the `FakeDiscordClient.postPlainMessage` call received `message.threadId` (or equivalent mock target) as its first argument, not the parent channel ID.

**Action required:** Update the task D1 description to include "…and verify the reply target is `message.threadId` (the invoking thread), not the parent channel". Add this assertion to test #14.

---

### F-03 — **Low** — A3 compilation strategy is ambiguous (pick one)

**Where:** [PLAN §2 Phase A, A3 sequencing note](PLAN-fix-req-overwrite-on-start.md).

**Quote from the PLAN:**

> "A3 will cause a TypeScript compile error in `temporal-orchestrator.ts` until `PhaseDetector` is imported — create the type import from `./phase-detector.js` (file created in Phase C, but the `import type` statement is added here to allow compilation). **Alternatively**, create a minimal stub `phase-detector.ts` (interface only, no implementation) as part of A3 to unblock compilation."

**Issue:**
Offering two alternatives leaves the engineer to decide during execution. From a test-engineering standpoint, ambiguity in setup tasks causes drift between the plan and implementation, complicating re-review and DoD verification. The two paths also differ in their impact on C1:
- Path A (bare `import type`): C1 creates `phase-detector.ts` from scratch.
- Path B (minimal stub): C1 replaces the stub with the full interface + JSDoc.

**Recommendation:** Pick Path B (minimal stub in A3). It avoids a dangling import to a nonexistent module (which can upset some TS tooling and IDE integrations) and gives C1 an unambiguous "replace stub" action. Update the A3 note to state "A3 creates a stub `phase-detector.ts` containing only the `PhaseDetector` interface and `PhaseDetectionResult` type; C1 fills in the full JSDoc."

**Action required:** Remove the "Alternatively" sentence and commit to one path.

---

### F-04 — **Low** — G1 (composition-root wiring) has no automated test

**Where:** [PLAN §2 Phase G, task G1](PLAN-fix-req-overwrite-on-start.md).

**Issue:**
G1 wires `new DefaultPhaseDetector(fs, logger)` into `bin/ptah.ts` and adds `phaseDetector` to the `TemporalOrchestrator` constructor call, then relies on "tested by integration test suite" with no specific test named. If no integration test exercises the `start` command path (likely — this is a common pragmatic gap), then:
- A typo like `phaseDectector` will pass CI (TypeScript should catch this, but key-order mistakes, wrong dependency passed, etc. may not).
- A missing `phaseDetector` line in deps will throw at runtime only when the binary is invoked — invisible to `npm test`.

**Why this is Low:** Composition-root wiring typos are usually caught by TypeScript's strict mode (which I assume is enabled). The `TemporalOrchestratorDeps` interface requires `phaseDetector`, so omitting it is a compile error. Wiring the wrong dependency instance type is also a compile error. So the failure modes are narrow.

**Recommendation (non-blocking):** Either (a) add a one-line smoke test in an existing `bin/ptah.test.ts` or similar that imports the `start` case factory and asserts a `DefaultPhaseDetector` instance is present in the orchestrator deps; or (b) add an explicit line to §5 Definition of Done: "Composition-root wiring verified by running `npm run build` + `npm run dev` (or equivalent smoke) and observing no runtime TypeErrors at startup."

**Action required (non-blocking):** Add an explicit DoD checklist line acknowledging this is not CI-covered.

---

## Clarification Questions

**Q-01** — On F-01: Does the project's vitest setup support `vi.mock("node:fs/promises")` cleanly? If not, is there an existing `fs.access` abstraction we can stub, or is Option B (POSIX chmod integration test) preferred? Please confirm the preferred approach before implementation.

**Q-02** — On F-04: Does any existing test (e.g., `tests/integration/bin/` or similar) already instantiate the `start` command deps and could be extended with a 2-line assertion checking `phaseDetector instanceof DefaultPhaseDetector`? If so, cite the file and amend G1 to include the assertion instead of adding a new test file.

---

## Positive Observations

1. **All 18 TSPEC tests mapped to tasks.** Tests #1–11 under C2/C3 (phase-detector.test.ts), #12 under B1 (R-01 anchor), #13–15 under D1 (temporal-orchestrator.test.ts), #16–18 under F2/F3/F1 (feature-lifecycle.test.ts). Verified by direct cross-reference.
2. **All 9 REQ-NF-02 scenarios covered** across Phase C tests #1-9 and Phase D tests #14-15. Scenario-to-test mapping is unambiguous.
3. **R-01 ordering is honored as a hard constraint.** B1 is explicitly called out as "must be confirmed RED before C1 begins" in §3 Task Dependency Notes. The PLAN §1 summary also re-states the R-01 mandate.
4. **Phase A (test-double infrastructure) is correctly sequenced first.** `FakeFileSystem.existsError` and `FakePhaseDetector` exist before any test that depends on them is written. A1/A2 parallelization is correctly identified. A3 serialization is correct (A3 needs A2).
5. **Phase A adds its own test-double tests.** A1 adds a test for `existsError` behavior in `fake-filesystem.test.ts`; A2 adds a three-part test for `FakePhaseDetector`. This follows the project convention of "non-trivial fakes are themselves tested" — excellent discipline.
6. **Phase F correctly identifies "already-satisfied invariants"** — F1/F2/F3 are expected GREEN immediately, and the plan notes that a RED result indicates a pre-existing regression. This is the right framing for retroactive invariant tests.
7. **Critical path and parallelizable tasks explicitly documented** in §3, including the dependency DAG. Enables the tech-lead skill to dispatch parallel engineers if desired.
8. **TDD status taxonomy (⬚/🔴/🟢/🔵/✅) matches the Red-Green-Refactor cycle** and gives the reviewer a clear way to audit implementation progress.
9. **§5 Definition of Done is concrete and verifiable** — each checklist item maps to a measurable outcome (except F-01's REQ-ER-03 item, which is the subject of F-01 above).
10. **Phase B is isolated as its own phase** rather than buried in Phase C. This makes the R-01 regression anchor a first-class citizen in the plan — easy to cite in commit messages and review.
11. **Integration Points table in §4** cross-references every file touched against the task that touches it. Good auditability.
12. **Worktree requirement in §1** keeps the branch clean during parallel implementation — aligns with project conventions.

---

## Recommendation

**Needs revision.**

Per decision rules, any Medium or High finding triggers Needs revision. F-01 (Medium) alone blocks approval.

**Resolution checklist for the engineer / tech-lead:**

1. **F-01 (Medium, required):** Add a new task (suggested E2) that introduces a unit test for `NodeFileSystem.exists()` error propagation, covering ENOENT → false, EACCES → throws, EIO → throws. Use Option A (stubbed `node:fs/promises`) unless project tooling rules it out. Update the §5 DoD checklist to reference this new task.
2. **F-02 (Low, recommended):** Update D1's description of test #14 to explicitly include the `message.threadId` thread-target assertion.
3. **F-03 (Low, recommended):** Pick one A3 compilation strategy (recommend the minimal stub approach) and remove the "Alternatively" ambiguity.
4. **F-04 (Low, non-blocking):** Add a DoD line acknowledging composition-root wiring is verified by TypeScript + manual smoke, or wire up a cheap integration check.

Route the updated PLAN back for re-review once F-01 is resolved. F-02/F-03/F-04 are low enough to accept in the same revision cycle without further round-tripping.

---

*End of Cross-Review*
