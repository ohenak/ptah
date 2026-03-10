# Execution Plan: {Capability Title}

| Field | Detail |
|-------|--------|
| **Technical Specification** | [{NNN}-TSPEC-{feature-name}](../specifications/{NNN}-TSPEC-{feature-name}.md) |
| **Requirements** | [REQ-{XX}-{NN}](../requirements/{NNN}-REQ-{product}.md) |
| **Date** | {Date} |
| **Status** | Planning / In Progress / Complete |

---

## 1. Summary

{What is being built, in 2-3 sentences. State the scope clearly — what changes and what does not change.}

---

## 2. TE Review Items Incorporated

{If the Test Engineer reviewed the TSPEC, list residual items addressed in this plan. If no TE review, omit this section.}

| Residual | Description | Plan Task |
|----------|-------------|-----------|
| R1 | {Description of residual item} | Task {N} |

---

## 3. Task List

### Phase A: {Phase Title}

{Brief description of what this phase covers and why it comes first.}

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | {Task description} | {test file path or —} | {source file path} | ⬚ Not Started |
| 2 | ... | ... | ... | ⬚ Not Started |

### Phase B: {Phase Title}

{Brief description.}

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 3 | {Task description} | {test file path} | {source file path} | ⬚ Not Started |

{Add more phases as needed. Group tasks logically by domain, layer, or dependency order.}

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

## 4. Task Dependency Notes

{Ordering constraints between tasks/phases, expressed as a dependency graph.}

```
Phase A (1-N) → Phase B (N+1-M) → Phase C (M+1-P) → ...
```

---

## 5. Integration Points with Previous Phases

| # | Location | Change | Impact on Existing Code |
|---|----------|--------|------------------------|
| 1 | {file path} | {What changes} | {Additive / Modified / Existing tests unaffected} |
| 2 | ... | ... | ... |

---

## 6. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npx vitest run`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Code reviewed against requirement acceptance criteria
- [ ] Implementation matches TSPEC (protocols, algorithm, error handling, test doubles)
- [ ] TE Review residual items addressed (if applicable)
- [ ] Existing tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review

---

*End of Document*
