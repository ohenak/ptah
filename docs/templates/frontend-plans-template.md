# Execution Plan: {Capability Title}

| Field | Detail |
|-------|--------|
| **Document ID** | PLAN-{SPEC-ID} |
| **Specification** | [SPEC-{XX}-{NN}](../specifications/SPEC-{feature-name}.md) |
| **Requirements** | [REQ-{XX}-{NN}](../requirements/REQ-{feature-name}.md), ... |
| **API Schema** | [OpenAPI Schema](../api-contracts/openapi.yaml) |
| **Date** | {Date} |
| **Author** | Frontend Engineer |
| **Status** | Planning / In Review / In Progress / Complete |

---

## 1. Summary

{What is being built, in 2-3 sentences. Reference the user-facing capability and the specification it implements.}

---

## 2. API Integration

**Schema location:** `docs/api-contracts/openapi.yaml`

### Endpoints Used

| Method | Path | Description | Request Model | Response Model |
|--------|------|-------------|---------------|----------------|
| {METHOD} | /api/v1/{resource} | {Description} | {ModelName} | {ModelName} |
| ... | ... | ... | ... | ... |

### Data Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `{RequestModel}` | {How it maps to component state/props} | {field1, field2, ...} |
| `{ResponseModel}` | {How it maps to UI display} | {field1, field2, ...} |
| `{ErrorModel}` | {Error handling approach} | {code, message, ...} |

### API Feedback

{Any concerns, questions, or missing fields to raise with the backend engineer. Write "None" if the schema is complete and clear.}

---

## 3. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | {file path or component} | {How the new code integrates with existing code} | {New file / Modify existing / Read-only reference} |
| 2 | ... | ... | ... |

---

## 4. Component Hierarchy

```
{TopLevelComponent}
├── {SubComponent1}
│   ├── {NestedComponent}
│   └── ...
├── {SubComponent2}
│   └── ...
└── ...
```

### File Structure

```
src/
├── components/
│   ├── {ComponentName}/
│   │   ├── {ComponentName}.tsx
│   │   ├── {ComponentName}.test.tsx
│   │   └── index.ts
│   └── ...
├── hooks/
│   ├── {useHookName}.ts
│   ├── {useHookName}.test.ts
│   └── ...
├── types/
│   └── {domain}.ts
└── ...
```

---

## 5. Task List

Tasks are ordered by dependency. Each task follows strict TDD: write the failing test first, then implement, then refactor.

### Layer 1: {Layer Name, e.g., Types and Interfaces}

{Brief description of what this layer covers and why it comes first.}

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | [{Task title}](#{task-anchor}) | `src/{path}/{file}.test.tsx` | `src/{path}/{file}.tsx` | ⬚ Not Started |
| 2 | ... | ... | ... | ⬚ Not Started |

### Layer 2: {Layer Name, e.g., Hooks and Services}

{Brief description.}

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 3 | [{Task title}](#{task-anchor}) | `src/{path}/{file}.test.ts` | `src/{path}/{file}.ts` | ⬚ Not Started |
| ... | ... | ... | ... | ⬚ Not Started |

### Layer 3: {Layer Name, e.g., Presentational Components}

{Brief description.}

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| N | [{Task title}](#{task-anchor}) | `src/{path}/{file}.test.tsx` | `src/{path}/{file}.tsx` | ⬚ Not Started |
| ... | ... | ... | ... | ⬚ Not Started |

### Layer 4: {Layer Name, e.g., Container Components and Integration}

{Brief description.}

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| N | [{Task title}](#{task-anchor}) | `src/{path}/{file}.test.tsx` | `src/{path}/{file}.tsx` | ⬚ Not Started |
| ... | ... | ... | ... | ⬚ Not Started |

**Status key:** ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

## 6. Task Details

### Task 1: {Task Title}

**Spec:** {SPEC-XX-NN}
**Files:** `src/{path}/{file}.tsx`

{What this task implements and why.}

**Tests:**
1. `{test_name}` — {what the test verifies}
2. `{test_name}` — {what the test verifies}
3. ...

**Dependencies:** {Other tasks that must be complete first, or "None"}

---

### Task 2: {Task Title}

**Spec:** {SPEC-XX-NN}
**Files:** `src/{path}/{file}.tsx`

{Description.}

**Tests:**
1. `{test_name}` — {what the test verifies}
2. ...

**Dependencies:** {Task 1, or "None"}

---

{Continue for each task...}

---

## 7. Dependency Injection Plan

{Describe how external dependencies (API clients, services) will be injected into components and hooks. Reference existing context providers or describe new ones needed.}

### Service Interfaces

| Interface | Purpose | Consumed By |
|-----------|---------|-------------|
| `{ServiceInterface}` | {What it abstracts} | {Components/hooks that use it} |
| ... | ... | ... |

### Context Providers

| Provider | Services Provided | Scope |
|----------|-------------------|-------|
| `{ProviderName}` | {What services it supplies} | {App-wide / Feature-scoped} |
| ... | ... | ... |

### Testing Strategy

{How mocks/stubs will be injected in tests — via ServicesProvider wrapper, prop injection, or hook parameters.}

---

## 8. Responsive Design Plan

| Component | Mobile (375px) | Tablet (768px) | Desktop (1024px+) |
|-----------|---------------|----------------|-------------------|
| `{ComponentName}` | {Layout behavior} | {Layout behavior} | {Layout behavior} |
| ... | ... | ... | ... |

---

## 9. Accessibility Plan

| Element | Requirement | Implementation |
|---------|-------------|----------------|
| {Interactive element} | {a11y requirement, e.g., keyboard navigable} | {ARIA attributes, focus management approach} |
| ... | ... | ... |

---

## 10. Risks and Open Questions

| # | Item | Type | Resolution |
|---|------|------|------------|
| 1 | {Description} | Risk / Question | {Pending / Resolved: explanation} |
| 2 | ... | ... | ... |

---

## 11. Definition of Done

### Code Quality
- [ ] All new code has corresponding tests written before the implementation (TDD compliance)
- [ ] All tests pass (`npm test`)
- [ ] No skipped or pending tests
- [ ] TypeScript types are correct — no `any` types unless justified
- [ ] Code follows existing project conventions (naming, structure, component patterns)
- [ ] No hardcoded API URLs, secrets, or credentials in source code
- [ ] Dependency injection used — no direct imports of API clients or services in components

### UI/UX Quality
- [ ] Components render correctly at 375px, 768px, and 1024px+ breakpoints
- [ ] All interactive elements are keyboard accessible (Tab, Enter, Arrow keys, Escape)
- [ ] Focus indicators are visible and logical
- [ ] ARIA attributes are present where needed (roles, labels, live regions)
- [ ] Loading states and error states are handled gracefully
- [ ] Empty states are handled (e.g., "No results found")
- [ ] Text overflow is handled (truncation, wrapping)

### Specification Compliance
- [ ] Every acceptance criterion from the specification is satisfied
- [ ] Every acceptance test from the specification has a corresponding automated test
- [ ] Edge cases documented in the specification are handled and tested
- [ ] No behavior was implemented that isn't in the specification

### Plan Accuracy
- [ ] All tasks in the plan are marked ✅
- [ ] Any tasks added during implementation are documented with justification
- [ ] Any deviations from the plan are documented with justification
- [ ] Plan status is set to `Complete`

### Git Hygiene
- [ ] Commits are logical and atomic — each represents one coherent change
- [ ] Commit messages follow the `type(scope): description` convention
- [ ] No unrelated changes bundled into commits
- [ ] Branch is pushed to remote for review

---

## Acceptance Criteria Verification

{Completed during Phase 3 — Verification and Delivery.}

| Acceptance Criterion (from Spec) | Status | Evidence |
|----------------------------------|--------|----------|
| {Criterion text} | ⬚ Pending | {Test name or manual verification notes} |
| ... | ... | ... |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {Date} | Frontend Engineer | Initial execution plan |

---

*End of Document*
