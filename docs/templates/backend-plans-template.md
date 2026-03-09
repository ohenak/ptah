# Execution Plan: {Capability Title}

| Field | Detail |
|-------|--------|
| **Document ID** | PLAN-{SPEC-ID} |
| **Specification** | [SPEC-{XX}-{NN}](../specifications/{spec-filename}.md) |
| **Requirements** | [REQ-{XX}-{NN}](../requirements/{req-filename}.md) |
| **API Schema** | [OpenAPI Schema](../api/openapi.yaml) or "No API surface changes" |
| **Date** | {Date} |
| **Status** | Planning / In Review / In Progress / Done |

---

## 1. Summary

{What is being built, in 2-3 sentences. State the scope clearly — what changes and what does not change.}

---

## 2. API Schema

{If this plan introduces or modifies API endpoints, summarize them here and reference the OpenAPI schema. If no API surface changes, state that explicitly.}

**Schema location:** `docs/api/openapi.yaml`

**New/Updated Endpoints:**

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| {METHOD} | /api/v1/... | {Description} | ⬚ To Be Implemented |

**Key Request/Response Models:**
- `{ModelName}` — {Brief description}
- `{ErrorModel}` — {Brief description}

**API Design Decisions:**
- Error format: {RFC 7807 Problem Details / Custom format}
- Pagination: {Offset-based / Cursor-based / None}
- Versioning: {URL path / Header / None}
- Authentication: {Bearer token / API key / Session cookie}

**Note:** The API schema must be reviewed and approved by the frontend engineer and user before implementation begins.

---

## 3. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | {file path or module} | {How this integrates with existing code} | {What changes are needed — Created / Modified / Deleted} |
| 2 | ... | ... | ... |

---

## 4. Task List

Status key: ⬚ Not Started | 🔴 Test Written (Red) | 🟢 Test Passing (Green) | 🔵 Refactored | ✅ Done

### Phase A — {Phase Title} ({SPEC IDs covered})

| # | Task | Spec | Test File | Source File | Status |
|---|------|------|-----------|-------------|--------|
| 1 | {Task description} | {SPEC-XX-NN} | `tests/unit/{path}/test_{name}.py` | `app/{path}/{name}.py` | ⬚ Not Started |
| 2 | ... | ... | ... | ... | ⬚ Not Started |

### Phase B — {Phase Title} ({SPEC IDs covered})

| # | Task | Spec | Test File | Source File | Status |
|---|------|------|-----------|-------------|--------|
| 3 | {Task description} | {SPEC-XX-NN} | ... | ... | ⬚ Not Started |

{Add more phases as needed. Group tasks logically by domain, layer, or dependency order.}

---

## 5. Acceptance Test Coverage

| Acceptance Test ID | Task # | Description |
|--------------------|--------|-------------|
| T-{XX}-{NN}-{TT} | {Task #} | {What the test verifies — specific, measurable outcome} |

{Map every acceptance test from the specification to the task(s) that implement it. This ensures full traceability from spec → plan → test.}

---

## 6. Risks and Open Questions

| # | Item | Type | Resolution |
|---|------|------|------------|
| 1 | {Description of risk or question} | Risk / Question | {Pending / Resolved: explanation / Accepted: justification} |

---

## 7. Implementation Notes

{Optional section for technical details that aid implementation but don't fit in the task list. Examples:}

{- Testing patterns or framework-specific guidance}
{- Constructor signatures or wiring details}
{- Ordering constraints between tasks}
{- Minimal-change strategies for existing files}

### Commit Strategy

{Describe the logical commit grouping. Each commit should represent one coherent unit of work using conventional commit format: `type(scope): description`.}

```
{type}({scope}): {description}
{type}({scope}): {description}
...
```

---

## 8. Definition of Done

- [ ] All tasks completed and status updated to ✅
- [ ] All tests pass (`pytest` / relevant test command) — 0 failures, 0 skipped
- [ ] Every acceptance criterion from the specification is satisfied
- [ ] No behavior implemented that isn't in the specification
- [ ] Code follows existing project conventions
- [ ] External dependencies are properly injected and mockable
- [ ] All changes committed in logical units per commit strategy
- [ ] Branch pushed for review

---

*End of Document*
