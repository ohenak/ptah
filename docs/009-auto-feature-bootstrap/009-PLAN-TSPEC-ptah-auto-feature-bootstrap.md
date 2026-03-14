# Execution Plan: Phase 9 — Auto Feature Bootstrap

| Field | Detail |
|-------|--------|
| **Technical Specification** | [009-TSPEC-ptah-auto-feature-bootstrap](./009-TSPEC-ptah-auto-feature-bootstrap.md) |
| **Requirements** | [009-REQ-PTAH-auto-feature-bootstrap](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| **Functional Specification** | [009-FSPEC-ptah-auto-feature-bootstrap](./009-FSPEC-ptah-auto-feature-bootstrap.md) |
| **Date** | March 14, 2026 |
| **Status** | Complete |

---

## 1. Summary

Phase 9 adds automatic feature folder bootstrapping to the PM skill. The implementation has two artifacts: (1) a new "Phase 0" section inserted into `.claude/skills/product-manager/SKILL.md` and (2) a new `describe` block in `ptah/tests/unit/orchestrator/context-assembler.test.ts` that locks down the `extractFeatureName()` contract the PM's Phase 0 depends on. No new TypeScript source files are created.

---

## 2. Task List

### Phase A: Contract Test — AF-R1 Alignment Lock

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| A-1 | Add `extractFeatureName — Phase 9 AF-R1 contract` describe block to `context-assembler.test.ts` covering the 4 cases in TSPEC §7.2 | `ptah/tests/unit/orchestrator/context-assembler.test.ts` | None (tests existing function, no new source) | ✅ Done |

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

### Phase B: PM SKILL.md — Phase 0 Insertion

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| B-1 | Insert Phase 0: Feature Folder Bootstrap section into PM SKILL.md immediately before "Task Selection — MANDATORY FIRST STEP" heading | None (natural language — no Vitest tests) | `.claude/skills/product-manager/SKILL.md` | ✅ Done |

---

## 3. Task Dependency Notes

```
A-1 (contract test) → independent of B-1
B-1 (SKILL.md update) → independent of A-1
```

Both phases are independent and can be executed in either order. Phase A is done first because it establishes the test baseline before the SKILL.md change; this keeps the TDD discipline even though the "implementation" being tested (SKILL.md Phase 0) is natural language, not TypeScript.

**Note on TDD for A-1:** The `extractFeatureName()` function already exists and already passes the behavior being tested. A-1 is a **contract test** — it will be green immediately upon being written (not red-first) because we are locking down existing behavior, not driving new behavior. This is the correct approach per TSPEC §7.1: "No Vitest unit tests for Phase 0 agent behavior — Claude agents executing SKILL.md instructions are not unit-testable in isolation via Vitest."

---

## 4. Integration Points

### A-1 — `context-assembler.test.ts`

- The test file already has a suite covering `extractFeatureName()`. The new describe block is appended at the end of that file.
- The new describe block calls `assembler.extractFeatureName(...)` — this access pattern is confirmed at 7 existing call sites in the test file. No inspection needed.
- No changes to `context-assembler.ts` source.

### B-1 — PM SKILL.md

- TSPEC §11 provides the **exact verbatim text** to insert. No drafting is needed — copy the §11 code block verbatim.
- Insertion point: immediately before the `## Task Selection — MANDATORY FIRST STEP` heading.
- The inserted Phase 0 section must end with `---` to create the correct Markdown section separator before Task Selection.

---

## 5. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] A-1 contract test covers all 4 scenarios from TSPEC §7.2
- [ ] B-1 SKILL.md insertion matches TSPEC §11 verbatim
- [ ] `grep -n "Phase 0: Feature Folder Bootstrap" .claude/skills/product-manager/SKILL.md` confirms the heading is present
- [ ] Phase 0 section in SKILL.md sits immediately before "Task Selection — MANDATORY FIRST STEP"
- [ ] Existing tests remain green (no regressions in context-assembler suite)
- [ ] Core acceptance tests AT-AF-01 (numbered thread, first invocation), AT-AF-02 (unnumbered thread), AT-AF-03 (repeat invocation, existing folder) verified against live PM agent
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to `feat-auto-feature-bootstrap` for review
