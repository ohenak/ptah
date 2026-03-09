# Requirements Document

## {Product or Feature Name}

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-{feature-code} |
| **Parent Document** | {Link to PRD or parent doc, if applicable} |
| **Version** | 1.0 |
| **Date** | {Date} |
| **Author** | Product Manager |
| **Status** | Draft / In Review / Approved |
| **Approval Date** | {Date when user approved, or "Pending"} |

---

## 1. Purpose

{Brief description of what this requirements document covers and why. Reference the product vision or business goal that drives these requirements.}

---

## 2. User Scenarios

Each user scenario describes a real-world situation that the product must support. Requirements in Section 5 trace back to these scenarios.

### US-01: {Scenario Title}

| Attribute | Detail |
|-----------|--------|
| **Description** | {Who is the user, what are they trying to do, and in what context?} |
| **Goals** | {What outcomes does the user want to achieve?} |
| **Pain points** | {What problems does the user face today without this product/feature?} |
| **Key needs** | {What capabilities must the product provide to serve this user?} |

### US-02: {Scenario Title}

| Attribute | Detail |
|-----------|--------|
| **Description** | {Description} |
| **Goals** | {Goals} |
| **Pain points** | {Pain points} |
| **Key needs** | {Key needs} |

{Add more scenarios as needed using sequential US-XX IDs.}

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | {What is being assumed?} | {What happens if this assumption is invalid?} |
| A-02 | {Assumption} | {Impact} |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | {Technical, business, or timeline constraint} | {Where does this constraint come from?} |
| C-02 | {Constraint} | {Source} |

---

## 4. Success Metrics

For each feature, define measurable metrics that indicate whether the feature achieves its goal.

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| {Feature name} | {What to measure} | {Method / tool / data source} | {Current value or "TBD"} | {Expected improvement} |
| {Feature name} | {Metric} | {Measurement method} | {Baseline} | {Target} |

---

## 5. Functional Requirements

Requirements are grouped by functional domain. Each domain uses a unique prefix for its requirement IDs.

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| {XX} | {Domain name, e.g., Conversational Planning} |
| {YY} | {Domain name, e.g., Search & Pricing} |

### 5.1 {Domain Name} ({DOMAIN-CODE})

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-{XX}-01 | {Short title} | {What the system must do} | WHO: As a [role] GIVEN: [context] WHEN: [action] THEN: [result] | P0/P1/P2 | {1/2/3} | [US-01] | — |
| REQ-{XX}-02 | {Short title} | {Description} | WHO: ... GIVEN: ... WHEN: ... THEN: ... | P0/P1/P2 | {Phase} | [US-01], [US-02] | [REQ-{XX}-01] |

### 5.2 {Domain Name} ({DOMAIN-CODE})

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-{YY}-01 | {Short title} | {Description} | WHO: ... GIVEN: ... WHEN: ... THEN: ... | P0/P1/P2 | {Phase} | [US-02] | — |

{Add more domain sections as needed.}

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | {e.g., Response latency} | {Description} | {Measurable criteria} | P0/P1/P2 | {Phase} |
| REQ-NF-02 | {e.g., Data privacy} | {Description} | {Criteria} | P0/P1/P2 | {Phase} |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | {What could go wrong?} | High/Med/Low | High/Med/Low | {How to reduce risk} | [REQ-XX-01] |
| R-02 | {Risk} | {Likelihood} | {Impact} | {Mitigation} | {Related REQs} |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | {n} | {List of REQ IDs} |
| P1 | {n} | {List of REQ IDs} |
| P2 | {n} | {List of REQ IDs} |

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 | {n} | {List of REQ IDs} |
| Phase 2 | {n} | {List of REQ IDs} |
| Phase 3 | {n} | {List of REQ IDs} |

---

## 9. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | {Name} | {Date} | Pending / Approved |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {Date} | {Author} | Initial requirements document |

---

*End of Document*
