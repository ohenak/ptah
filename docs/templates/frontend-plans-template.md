# Execution Plan: {Capability Title}

| Field | Detail |
|-------|--------|
| **Technical Specification** | [{NNN}-TSPEC-{feature-name}](../specifications/{NNN}-TSPEC-{feature-name}.md) |
| **Requirements** | [REQ-{XX}-{NN}](../requirements/{NNN}-REQ-{product}.md) |
| **API Schema** | [OpenAPI Schema](../api/openapi.yaml) or "No API surface" |
| **Date** | {Date} |
| **Status** | Planning / In Progress / Complete |

---

## 1. Summary

{What is being built, in 2-3 sentences. Reference the user-facing capability and the specification it implements.}

---

## 2. API Integration

{If this plan consumes backend APIs, summarize them here. If no API integration, state "No API integration for this feature."}

### Endpoints Used

| Method | Path | Description | Request Model | Response Model |
|--------|------|-------------|---------------|----------------|
| {METHOD} | /api/v1/{resource} | {Description} | {ModelName} | {ModelName} |

### API Feedback

{Any concerns or questions for the backend engineer. Write "None" if schema is complete.}

---

## 3. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | {file path or component} | {How the new code integrates} | {New file / Modify existing} |

---

## 4. Component Hierarchy

```
{TopLevelComponent}
├── {SubComponent1}
│   └── ...
├── {SubComponent2}
└── ...
```

---

## 5. Task List

### Phase A: {Phase Title}

{Brief description of what this phase covers.}

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| 1 | {Task description} | `src/{path}/{file}.test.tsx` | `src/{path}/{file}.tsx` | ⬚ Not Started |

### Phase B: {Phase Title}

| # | Task | Test File | Source File | Status |
|---|------|-----------|-------------|--------|
| N | {Task description} | `src/{path}/{file}.test.tsx` | `src/{path}/{file}.tsx` | ⬚ Not Started |

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

---

## 6. Dependency Injection Plan

### Service Interfaces

| Interface | Purpose | Consumed By |
|-----------|---------|-------------|
| `{ServiceInterface}` | {What it abstracts} | {Components/hooks that use it} |

### Testing Strategy

{How mocks/stubs will be injected in tests — via ServicesProvider wrapper, prop injection, or hook parameters.}

---

## 7. Responsive Design Plan

| Component | Mobile (375px) | Tablet (768px) | Desktop (1024px+) |
|-----------|---------------|----------------|-------------------|
| `{ComponentName}` | {Layout behavior} | {Layout behavior} | {Layout behavior} |

---

## 8. Accessibility Plan

| Element | Requirement | Implementation |
|---------|-------------|----------------|
| {Interactive element} | {a11y requirement} | {ARIA attributes, focus management} |

---

## 9. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`npm test`) — 0 failures
- [ ] No skipped or pending tests
- [ ] Components render correctly at 375px, 768px, 1024px+ breakpoints
- [ ] All interactive elements are keyboard accessible
- [ ] ARIA attributes are present where needed
- [ ] Code reviewed against requirement acceptance criteria
- [ ] Implementation matches TSPEC (component hierarchy, state management)
- [ ] Existing tests remain green (no regressions)
- [ ] Changes committed in logical units with `type(scope): description` format
- [ ] Pushed to remote for review

---

*End of Document*
