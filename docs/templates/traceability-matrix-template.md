# Traceability Matrix

## {Product or Feature Name}

| Field | Detail |
|-------|--------|
| **Date** | {Date} |
| **Version** | 1.0 |
| **Status** | Draft / In Review / Approved |

---

## 1. Purpose

This matrix provides full traceability from user scenarios through requirements to specifications. It ensures:

- Every user scenario has at least one requirement addressing it
- Every requirement traces back to a user scenario (no orphaned requirements)
- Every requirement has at least one specification defining how it will be built
- No gaps exist in the chain from user need to implementation specification

---

## 2. Full Traceability: User Scenario → Requirement → Specification

| User Scenario | Requirement | Specification | Priority | Phase | Status |
|---------------|-------------|---------------|----------|-------|--------|
| [US-01] | [REQ-{XX}-01] | [SPEC-{XX}-01] | P0 | 1 | {Specified / Pending Spec / Approved} |
| [US-01] | [REQ-{XX}-02] | [SPEC-{XX}-01], [SPEC-{XX}-02] | P1 | 2 | {Status} |
| [US-02] | [REQ-{YY}-01] | [SPEC-{YY}-01] | P0 | 1 | {Status} |
| [US-01], [US-02] | [REQ-NF-01] | [SPEC-NF-01] | P0 | 1 | {Status} |

---

## 3. Coverage Analysis

### 3.1 User Scenario Coverage

| User Scenario | Title | Requirement Count | Fully Specified? |
|---------------|-------|-------------------|------------------|
| [US-01] | {Title} | {n} | Yes / No ({n} of {m} specified) |
| [US-02] | {Title} | {n} | Yes / No |

### 3.2 Requirement Coverage

| Requirement | Title | Specification Count | Status |
|-------------|-------|---------------------|--------|
| [REQ-{XX}-01] | {Title} | {n} | Specified / Pending |
| [REQ-{XX}-02] | {Title} | {n} | Specified / Pending |

### 3.3 Orphan Check

**Orphaned user scenarios** (no requirements):
- {List any US-XX IDs with no linked requirements, or "None"}

**Orphaned requirements** (no user scenario):
- {List any REQ-XX-XX IDs with no linked scenarios, or "None"}

**Unspecified requirements** (no specification):
- {List any REQ-XX-XX IDs with no linked specifications, or "None"}

---

## 4. Phase View

### Phase 1

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-{XX}-01] | [SPEC-{XX}-01] | P0 | [US-01] |
| [REQ-{YY}-01] | [SPEC-{YY}-01] | P0 | [US-02] |

### Phase 2

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-{XX}-02] | [SPEC-{XX}-02] | P1 | [US-01], [US-02] |

### Phase 3

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| {Phase 3 items} | | | |

---

## 5. Document References

| Document | Location | Description |
|----------|----------|-------------|
| Requirements | [REQ-{feature-name}](../requirements/REQ-{feature-name}.md) | Functional and non-functional requirements |
| Specifications | [SPEC-{feature-name}](../specifications/SPEC-{feature-name}.md) | Detailed specifications for implementation |
| PRD | {Link to PRD if applicable} | Product requirements document |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {Date} | {Author} | Initial traceability matrix |

---

*End of Document*
