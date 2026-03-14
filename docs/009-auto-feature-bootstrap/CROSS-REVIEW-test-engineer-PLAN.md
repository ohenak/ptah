# Cross-Review: Test Engineer — PLAN

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (qa) |
| **Document Reviewed** | `docs/009-auto-feature-bootstrap/009-PLAN-TSPEC-ptah-auto-feature-bootstrap.md` |
| **Review Date** | March 14, 2026 |
| **Status Reviewed** | Draft (In Review) |

---

## Summary

The PLAN is minimal and appropriate for its scope. Phase 9 delivers exactly two artifacts — one contract test block appended to an existing test file (A-1) and one natural-language SKILL.md insertion (B-1). Both tasks are correctly identified; dependencies are properly noted as independent; and the TDD rationale for A-1 (green-by-design contract test) is explicitly and correctly documented.

**Recommendation: Approved with minor changes.** Three low-severity findings. No must-fix items. The engineer may proceed after noting the observations below.

---

## Findings

### F-01 (Low) — Two of four AF-R1 contract test cases have substantial overlap with existing `extractFeatureName` tests

**Location:** PLAN §2 Task A-1 / TSPEC §7.2 cases 2 and 3

**Observation:**
The existing `context-assembler.test.ts` already covers the two core behaviors being tested by cases 2 and 3 of the proposed AF-R1 describe block:

| Proposed case | Existing coverage |
|---|---|
| Case 2: `"auth redesign \u2014 define scope"` → `"auth redesign"` | Line 76–78: `extractFeatureName("my-feature \u2014 review")` → `"my-feature"` (same strip behavior, different input) |
| Case 3: `"create requirements for auth"` (no em-dash) → full name | Lines 80–82 and 981–984: `extractFeatureName("my-feature-review")` and `extractFeatureName("authentication-feature")` → full names (same behavior) |

Cases 1 and 4, by contrast, add genuinely **new coverage**:
- Case 1 tests a numbered NNN-prefixed thread name pattern not present in any existing test
- Case 4 tests the first-occurrence-only rule for multiple em-dashes, which no existing test exercises

**Impact:** Cases 2 and 3 function primarily as documentation tests — they illustrate the known AF-R8 mismatch rather than asserting new behavior. This is not harmful (the comments in TSPEC §7.2 make this explicit), but the engineer should be aware that these two tests will not provide regression protection beyond what already exists.

**Action:** No code change required. Engineer should be aware that the real regression value is in cases 1 and 4.

---

### F-02 (Low) — PLAN §4 integration note about inspecting `extractFeatureName` access is unnecessary

**Location:** PLAN §4, Phase A-1 integration point:
> "Inspect the existing test file to determine whether `extractFeatureName` is exported from the module or accessed via the assembler instance."

**Observation:**
The existing test file already uses `assembler.extractFeatureName(...)` at seven call sites (lines 77, 80, 977, 978, 982). The access pattern is confirmed — no inspection needed. The note creates a false impression of uncertainty.

**Action:** No code change required, but this note can be skipped during implementation.

---

### F-03 (Low) — Acceptance tests AT-AF-01 through AT-AF-12 are absent from the PLAN's Definition of Done

**Location:** PLAN §5 Definition of Done

**Observation:**
TSPEC §7.3 lists 12 acceptance tests covering all major Phase 0 behavioral scenarios (first invocation, repeat invocation, unnumbered thread, slugification edge cases, error conditions). These are manual tests run against the live PM agent. The PLAN's DoD has no entry referencing acceptance test execution.

If acceptance tests are expected to be run before marking the feature complete (e.g., AT-AF-01 as the smoke test for the full happy-path), this is an omission. If acceptance tests are deferred to a QA/staging phase after merge, the omission is intentional and acceptable.

**Action:** If AT execution is expected before the feature branch is merged, add a DoD item: `- [ ] Core acceptance tests AT-AF-01, AT-AF-02, AT-AF-03 verified against live PM agent`. Otherwise, no action needed.

---

## Clarification Questions

### Q-01 — Is B-1 SKILL.md verbatim insertion verified only by manual code review?

**Context:** The DoD includes "B-1 SKILL.md insertion matches TSPEC §11 verbatim" and "Phase 0 section in SKILL.md sits immediately before 'Task Selection — MANDATORY FIRST STEP'". Both of these are manual verification items — there is no automated check (grep, diff, or shell assertion) in the PLAN to verify the insertion point.

**Question:** Is manual code review sufficient for verifying the insertion? Or should the engineer add a shell check (e.g., `grep -n "Phase 0: Feature Folder Bootstrap" .claude/skills/product-manager/SKILL.md`) as an explicit DoD step?

**This does not block implementation.** Manual review is acceptable; the question is whether the team wants an automated gate.

---

## Positive Observations

- **Task scope is correctly minimized.** Phase 9 changes only two artifacts (one test block, one SKILL.md section). The PLAN correctly avoids gold-plating — no new source files, no new modules, no new infrastructure.

- **TDD rationale for A-1 is explicit and correct.** The PLAN correctly explains that A-1 is a contract test that will be green immediately, and why this is the right approach for locking down existing behavior rather than driving new behavior. This prevents the engineer from wasting time on a red phase that isn't needed.

- **Independence of A-1 and B-1 is correctly noted.** The dependency graph is accurate — both tasks can execute in either order. The chosen order (A first) has sound reasoning: establish the test baseline before the SKILL.md change.

- **Integration points are accurate.** PLAN §4's observation that the new describe block appends to the existing file, and that no source changes are needed, is correct and matches the existing test infrastructure.

- **Definition of Done is concrete and verifiable.** Each DoD item is binary and checkable (`npx vitest run`, verbatim match check, insertion point check). No vague quality targets.

---

## Recommendation

**Approved with minor changes.**

- F-01, F-02, F-03 are all low severity — informational observations, no code changes required
- Q-01 is a process question for the team, not a blocker
- The engineer may proceed to implementation
- No re-review needed after addressing these findings
