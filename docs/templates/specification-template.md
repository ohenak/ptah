# Technical Specification: {Feature Title}

| Field | Detail |
|-------|--------|
| **Requirements** | [REQ-{XX}-{NN}](../requirements/{NNN}-REQ-{product}.md) |
| **Analysis** | [ANALYSIS-{feature-name}](./ANALYSIS-{feature-name}.md) |
| **Date** | {Date} |
| **Status** | Draft / Approved (Rev N) |

---

## 1. Summary

{What is being built technically, in 2-3 sentences. State the scope and how it relates to previous/future phases.}

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | {e.g., Node.js 20 LTS} | {Why this choice} |
| Language | {e.g., TypeScript 5.x} | {Why this choice} |
| Libraries | {e.g., discord.js v14} | {Why this choice} |
| Test framework | {e.g., Vitest} | {Why this choice} |
| CLI entry point | {e.g., bin/ptah.ts via tsx} | {Why this choice} |

{Note any new dependencies being added.}

---

## 3. Project Structure

```
project/
├── src/
│   ├── commands/
│   │   └── {command}.ts              ← NEW / UPDATED
│   ├── services/
│   │   └── {service}.ts              ← NEW / UPDATED
│   ├── config/
│   │   └── {config}.ts               ← NEW / UPDATED
│   └── types.ts                       ← UPDATED
├── bin/
│   └── {entry}.ts                     ← UPDATED
└── tests/
    ├── unit/
    │   └── ...                        ← NEW
    ├── integration/
    │   └── ...                        ← NEW / UPDATED
    └── fixtures/
        └── factories.ts               ← UPDATED
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

```
bin/{entry}.ts
  └── src/commands/{command}.ts
        ├── src/config/{loader}.ts (Protocol)
        │     └── src/services/{filesystem}.ts (Protocol)
        ├── src/services/{service}.ts (Protocol)
        └── src/services/{logger}.ts (Protocol)
```

### 4.2 Protocols (Interfaces)

#### {Protocol Name}

```typescript
// src/{path}/{file}.ts

interface {ProtocolName} {
  {method}({params}): {ReturnType};
}
```

| Method | Behavior |
|--------|----------|
| `{method}({params})` | {What it does, returns, throws} |

{Repeat for each protocol.}

### 4.3 Types

```typescript
// src/types.ts

interface {TypeName} {
  {field}: {type};   // {description}
}
```

{Design rationale for type decisions.}

### 4.4 Concrete Implementations

- `{ClassName}` — {what it wraps/implements, constructor dependencies}

### 4.5 Composition Root

```typescript
// bin/{entry}.ts — wiring

const {dep1} = new {Concrete1}();
const {dep2} = new {Concrete2}({dep1});
const command = new {Command}({dep1}, {dep2});
await command.execute();
```

---

## 5. {Core Algorithm / Command Algorithm}

```
1. {Step description}
   a. {Sub-step}
   b. {Sub-step}

2. {Step description}
   a. {Sub-step}
   b. On failure: {error behavior}

3. ...
```

{Design rationale for algorithm choices, referencing TE Review items or Analysis resolutions.}

---

## 6. {Validation / Business Rules}

{If the feature has validation logic, error handling tables, or business rules, document them here.}

| Check | Rule | Error Message |
|-------|------|---------------|
| {What is checked} | {Validation rule} | `{exact error message}` |

---

## 7. Error Handling

| Scenario | Behavior | Exit Code |
|----------|----------|-----------|
| {Error scenario} | `logger.error("{message}")` | 1 |
| {Normal shutdown} | {Graceful behavior} | 0 |

---

## 8. Test Strategy

### 8.1 Approach

{Overall testing approach. Reference project conventions (protocol-based DI, fakes, etc.)}

### 8.2 Test Doubles

```typescript
// tests/fixtures/factories.ts

class {FakeName} implements {Protocol} {
  // ... fake implementation with error injection support
}
```

{Design rationale for each test double. Note which fakes get dedicated test files vs implicit validation.}

### 8.3 Test Categories

| Category | What is tested | Test file |
|----------|---------------|-----------|
| {Category name} | {Description} | `tests/{path}/{file}.test.ts` |

---

## 9. Requirement → Technical Component Mapping

| Requirement | Technical Component(s) | Description |
|-------------|----------------------|-------------|
| REQ-{XX}-{NN} | {Protocol, implementation, types} | {How this requirement is technically realized} |

---

## 10. Integration Points

| # | Location | Description | Impact |
|---|----------|-------------|--------|
| 1 | {file path} | {How this integrates} | {What changes are needed} |

---

## 11. Open Questions

| # | Item | Type | Resolution |
|---|------|------|------------|
| — | None | — | All questions resolved in Analysis phase |

{Or list open questions with options for resolution.}

---

*Gate: User reviews and approves this technical specification before proceeding to Planning.*
