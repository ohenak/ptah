# Test Properties Document

## {Feature Name}

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-{feature-code} |
| **Requirements** | [REQ-{XX}](../requirements/REQ-{feature-name}.md) |
| **Specifications** | [SPEC-{XX}](../specifications/SPEC-{feature-name}.md) |
| **Execution Plan** | [PLAN-{XX}](../plans/PLAN-SPEC-{feature-name}.md) |
| **Version** | 1.0 |
| **Date** | {Date} |
| **Author** | Test Engineer |
| **Status** | Draft / In Review / Approved |
| **Approval Date** | {Date when user approved, or "Pending"} |

---

## 1. Overview

{Brief description of the feature under test and the scope of this properties document. Summarize the requirements and specifications analyzed, and the overall testing approach.}

### 1.1 Scope

**In scope:**
- {What this properties document covers}

**Out of scope:**
- {What is explicitly excluded and why}

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | {n} | [REQ-{XX}](link) |
| Specifications analyzed | {n} | [SPEC-{XX}](link) |
| Plan tasks reviewed | {n} | [PLAN-{XX}](link) |
| Integration boundaries identified | {n} | {list key boundaries} |
| Implementation files reviewed | {n} | {list key files or "N/A — not yet implemented"} |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | {n} | {REQ IDs} | Unit |
| Contract | {n} | {REQ IDs} | Unit / Integration |
| Error Handling | {n} | {REQ IDs} | Unit |
| Data Integrity | {n} | {REQ IDs} | Unit |
| Integration | {n} | {REQ IDs} | Integration |
| Performance | {n} | {REQ IDs} | Integration |
| Security | {n} | {REQ IDs} | Unit / Integration |
| Idempotency | {n} | {REQ IDs} | Unit / Integration |
| Observability | {n} | {REQ IDs} | Unit |
| **Total** | **{n}** | | |

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-{DOMAIN}-{NUMBER}` — domain prefix matches the source specification.

**Priority:** Inherited from the highest-priority linked requirement (P0 / P1 / P2).

### 3.1 Functional Properties

Core business logic and behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-01 | {Component} must {observable behavior} when {condition} | [SPEC-{XX}-01] | Unit | P0 |
| PROP-{DOM}-02 | {Component} must {observable behavior} when {condition} | [SPEC-{XX}-02] | Unit | P1 |

### 3.2 Contract Properties

API request/response shape, protocol compliance, and type conformance.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must {contract behavior} when {condition} | [SPEC-{XX}-{NN}] | Unit / Integration | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must {error behavior} when {failure condition} | [SPEC-{XX}-{NN}] | Unit | P0 |

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must {data behavior} when {condition} | [SPEC-{XX}-{NN}] | Unit | P1 |

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must {integration behavior} when {condition} | [SPEC-{XX}-{NN}] | Integration | P1 |

### 3.6 Performance Properties

Response times, resource limits, and timeout behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must {performance behavior} when {condition} | [SPEC-{XX}-{NN}] | Integration | P1 |

### 3.7 Security Properties

Authentication, authorization, input validation, and secrets handling.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must not {security violation} when {condition} | [SPEC-{XX}-{NN}] | Unit / Integration | P0 |

### 3.8 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must {idempotent behavior} when {condition} | [SPEC-{XX}-{NN}] | Unit / Integration | P1 |

### 3.9 Observability Properties

Logging, metrics, and error reporting.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must {observability behavior} when {condition} | [SPEC-{XX}-{NN}] | Unit | P2 |

{Include only categories that have properties. Remove empty categories.}

---

## 4. Negative Properties

Properties that define what the system must NOT do. These are derived from the inverse of positive properties and from explicit specification constraints.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-{DOM}-{NN} | {Component} must not {prohibited behavior} when {condition} | [SPEC-{XX}-{NN}] | Unit | P0 |
| PROP-{DOM}-{NN} | {Component} must not {prohibited behavior} when {condition} | [SPEC-{XX}-{NN}] | Unit | P1 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

Every requirement must map to at least one property. Gaps are flagged with reason and recommendation.

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| [REQ-{XX}-01] | PROP-{DOM}-01, PROP-{DOM}-02 | Full |
| [REQ-{XX}-02] | PROP-{DOM}-03 | Partial -- {what is missing} |
| [REQ-{XX}-03] | -- | No coverage -- {reason and recommendation} |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| [SPEC-{XX}-01] | PROP-{DOM}-01, PROP-{DOM}-02 | Full |
| [SPEC-{XX}-02] | PROP-{DOM}-03 | Partial -- {what is missing} |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | {n} | {n} | {n} | {n} |
| P1 | {n} | {n} | {n} | {n} |
| P2 | {n} | {n} | {n} | {n} |

---

## 6. Test Level Distribution

Summary of how properties are distributed across the test pyramid.

```
        /  E2E  \          Few -- critical journeys only
       /----------\
      / Integration \      Moderate -- cross-module boundaries
     /----------------\
    /    Unit Tests     \  Many -- fast, isolated, comprehensive
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | {n} | {%} |
| Integration | {n} | {%} |
| E2E (candidates) | {n} | {%} |
| **Total** | **{n}** | **100%** |

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | {Description of coverage gap} | {What is at risk if untested} | High / Med / Low | {Suggested action} |
| 2 | {Gap} | {Impact} | {Risk} | {Recommendation} |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | {Name} | {Date} | Pending / Approved |
| Technical Lead | {Name} | {Date} | Pending / Approved |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {Date} | {Author} | Initial properties document |

---

*End of Document*
