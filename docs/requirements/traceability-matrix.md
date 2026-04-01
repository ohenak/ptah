# Traceability Matrix

## Ptah v4.0

| Field | Detail |
|-------|--------|
| **Date** | March 19, 2026 |
| **Version** | 2.9 |
| **Status** | Draft |

---

## 1. Purpose

This matrix provides full traceability from user scenarios through requirements to specifications. It ensures:

- Every user scenario has at least one requirement addressing it
- Every requirement traces back to a user scenario (no orphaned requirements)
- Every requirement has at least one specification defining how it will be built (pending Phase 3 — Specification Definition)
- No gaps exist in the chain from user need to implementation specification

---

## 2. Full Traceability: User Scenario → Requirement → Specification

| User Scenario | Requirement | Specification | Priority | Phase | Status |
|---------------|-------------|---------------|----------|-------|--------|
| [US-01] | [REQ-IN-01] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-02] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-03] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-04] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-05] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-06] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-07] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-01] | [REQ-IN-08] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-02], [US-04] | [REQ-DI-01] | Pending Spec | P0 | 2 | Pending Spec |
| [US-02], [US-05] | [REQ-DI-02] | Pending Spec | P0 | 2 | Pending Spec |
| [US-02], [US-04] | [REQ-DI-03] | Pending Spec | P0 | 2 | Pending Spec |
| [US-02], [US-05] | [REQ-DI-04] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02] | [REQ-DI-05] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02] | [REQ-DI-06] | [FSPEC-DI-02](../007-polish/007-FSPEC-polish.md) | P1 | 7 | FSPEC Complete |
| [US-02], [US-07] | [REQ-DI-10] | Pending FSPEC | P1 | 7 | Pending FSPEC |
| [US-03], [US-07] | [REQ-RP-06] | Pending FSPEC | P1 | 7 | Pending FSPEC |
| [US-03] | [REQ-DI-07] | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) | P0 | 5 | Specified |
| [US-02], [US-07] | [REQ-DI-08] | [FSPEC-GR-02](../006-guardrails/006-FSPEC-ptah-guardrails.md) | P0 | 6 | FSPEC Complete |
| [US-02], [US-04] | [REQ-DI-09] | [FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-01] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-02] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-03] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-04] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-05] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04] | [REQ-CB-06] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P1 | 3 | FSPEC Complete |
| [US-02], [US-04] | [REQ-RP-01] | [FSPEC-RP-02](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-03], [US-04] | [REQ-RP-02] | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) | P0 | 5 | Specified |
| [US-02], [US-04] | [REQ-RP-03] | [FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02] | [REQ-RP-04] | [FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02], [US-07] | [REQ-RP-05] | [FSPEC-GR-02](../006-guardrails/006-FSPEC-ptah-guardrails.md) | P0 | 6 | FSPEC Complete |
| [US-03] | [REQ-PQ-01] | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) | P0 | 5 | Specified |
| [US-03] | [REQ-PQ-02] | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) | P0 | 5 | Specified |
| [US-03] | [REQ-PQ-03] | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) | P0 | 5 | Specified |
| [US-03] | [REQ-PQ-04] | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) | P0 | 5 | Specified |
| [US-03] | [REQ-PQ-05] | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) | P0 | 5 | Specified |
| [US-04], [US-06] | [REQ-SI-01] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-06] | [REQ-SI-02] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02] | [REQ-SI-03] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-02], [US-03] | [REQ-SI-04] | [FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-06] | [REQ-SI-05] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-06] | [REQ-SI-06] | [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-07] | [REQ-SI-07] | [FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md) | P0 | 6 | FSPEC Complete |
| [US-07] | [REQ-SI-08] | [FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md) | P0 | 6 | FSPEC Complete |
| [US-06], [US-07] | [REQ-SI-09] | [FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-05], [US-07] | [REQ-SI-10] | [FSPEC-GR-03](../006-guardrails/006-FSPEC-ptah-guardrails.md) | P0 | 6 | FSPEC Complete |
| [US-02], [US-04], [US-06] | [REQ-SI-11] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-04], [US-06] | [REQ-SI-12] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-06] | [REQ-SI-13] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-04] | [REQ-NF-01] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-07] | [REQ-NF-02] | [FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md) | P0 | 6 | FSPEC Complete |
| [US-06] | [REQ-NF-03] | [FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-04] | [REQ-NF-04] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-06] | [REQ-NF-05] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md), [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md) | P0 | 4 | FSPEC Complete |
| [US-01], [US-05] | [REQ-NF-06] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | 1 | Specified |
| [US-04], [US-06] | [REQ-NF-07] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | P0 | 3 | FSPEC Complete |
| [US-08] | [REQ-NF-08] | [FSPEC-EX-01](../007-polish/007-FSPEC-polish.md) | P1 | 7 | FSPEC Complete |
| [US-05] | [REQ-NF-09] | Pending FSPEC | P1 | 7 | Pending FSPEC |
| [US-05], [US-07] | [REQ-NF-10] | Pending FSPEC | P1 | 7 | Pending FSPEC |
| [US-09] | [REQ-AF-01] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | P0 | 9 | FSPEC Complete |
| [US-09] | [REQ-AF-02] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | P0 | 9 | FSPEC Complete |
| [US-09] | [REQ-AF-03] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | P0 | 9 | FSPEC Complete |
| [US-09] | [REQ-AF-04] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | P0 | 9 | FSPEC Complete |
| [US-09] | [REQ-AF-05] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | P0 | 9 | FSPEC Complete |
| [US-09] | [REQ-AF-06] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | P0 | 9 | FSPEC Complete |
| [US-09] | [REQ-AF-07] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | P0 | 9 | FSPEC Complete |
| [US-09] | [REQ-AF-NF-01] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | P0 | 9 | FSPEC Complete |
| [US-10], [US-11] | [REQ-FB-01] | Pending Spec | P0 | 10 | Pending Spec |
| [US-10], [US-11], [US-12] | [REQ-FB-02] | Pending Spec | P0 | 10 | Pending Spec |
| [US-10] | [REQ-FB-03] | Pending Spec | P0 | 10 | Pending Spec |
| [US-10] | [REQ-FB-04] | Pending Spec | P0 | 10 | Pending Spec |
| [US-11], [US-12] | [REQ-AB-01] | Pending Spec | P0 | 10 | Pending Spec |
| [US-11], [US-12] | [REQ-AB-02] | Pending Spec | P0 | 10 | Pending Spec |
| [US-11], [US-12] | [REQ-AB-03] | Pending Spec | P0 | 10 | Pending Spec |
| [US-11], [US-12] | [REQ-AB-04] | Pending Spec | P0 | 10 | Pending Spec |
| [US-11], [US-12] | [REQ-MG-01] | Pending Spec | P0 | 10 | Pending Spec |
| [US-11] | [REQ-MG-02] | Pending Spec | P0 | 10 | Pending Spec |
| [US-10], [US-11] | [REQ-MG-03] | Pending Spec | P1 | 10 | Pending Spec |
| [US-10] | [REQ-SK-01] | Pending Spec | P0 | 10 | Pending Spec |
| [US-10], [US-11] | [REQ-SK-02] | Pending Spec | P1 | 10 | Pending Spec |
| [US-10], [US-11] | [REQ-PF-NF-01] | Pending Spec | P1 | 10 | Pending Spec |
| [US-10], [US-11] | [REQ-PF-NF-02] | Pending Spec | P1 | 10 | Pending Spec |
| [US-10], [US-11] | [REQ-PF-NF-03] | Pending Spec | P0 | 10 | Pending Spec |
| [US-13] | [REQ-SM-01] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13], [US-17] | [REQ-SM-02] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13] | [REQ-SM-03] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13] | [REQ-SM-04] | Pending Spec | P1 | 11 | Pending Spec |
| [US-17] | [REQ-SM-05] | Pending Spec | P0 | 11 | Pending Spec |
| [US-17] | [REQ-SM-06] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13], [US-15] | [REQ-SM-07] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13], [US-15] | [REQ-SM-08] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13] | [REQ-SM-09] | Pending Spec | P0 | 11 | Pending Spec |
| [US-17] | [REQ-SM-10] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13], [US-15] | [REQ-SM-11] | Pending Spec | P0 | 11 | Pending Spec |
| [US-14], [US-15] | [REQ-RT-01] | Pending Spec | P0 | 11 | Pending Spec |
| [US-14] | [REQ-RT-02] | Pending Spec | P0 | 11 | Pending Spec |
| [US-14] | [REQ-RT-03] | Pending Spec | P0 | 11 | Pending Spec |
| [US-14], [US-16] | [REQ-RT-04] | Pending Spec | P0 | 11 | Pending Spec |
| [US-14] | [REQ-RT-05] | Pending Spec | P0 | 11 | Pending Spec |
| [US-16] | [REQ-RT-06] | Pending Spec | P0 | 11 | Pending Spec |
| [US-16] | [REQ-RT-07] | Pending Spec | P0 | 11 | Pending Spec |
| [US-14] | [REQ-RT-08] | Pending Spec | P1 | 11 | Pending Spec |
| [US-16] | [REQ-RT-09] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13], [US-18] | [REQ-AI-01] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13] | [REQ-AI-02] | Pending Spec | P0 | 11 | Pending Spec |
| [US-18] | [REQ-AI-03] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13] | [REQ-AI-04] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13] | [REQ-AI-05] | Pending Spec | P1 | 11 | Pending Spec |
| [US-15] | [REQ-FC-01] | Pending Spec | P0 | 11 | Pending Spec |
| [US-15] | [REQ-FC-02] | Pending Spec | P0 | 11 | Pending Spec |
| [US-15] | [REQ-FC-03] | Pending Spec | P1 | 11 | Pending Spec |
| [US-14], [US-15] | [REQ-FC-04] | Pending Spec | P0 | 11 | Pending Spec |
| [US-14], [US-15] | [REQ-FC-05] | Pending Spec | P0 | 11 | Pending Spec |
| [US-18] | [REQ-SA-01] | Pending Spec | P0 | 11 | Pending Spec |
| [US-18] | [REQ-SA-02] | Pending Spec | P0 | 11 | Pending Spec |
| [US-18] | [REQ-SA-03] | Pending Spec | P0 | 11 | Pending Spec |
| [US-18] | [REQ-SA-04] | Pending Spec | P0 | 11 | Pending Spec |
| [US-18] | [REQ-SA-05] | Pending Spec | P0 | 11 | Pending Spec |
| [US-14], [US-18] | [REQ-SA-06] | Pending Spec | P0 | 11 | Pending Spec |
| [US-18] | [REQ-CA-01] | Pending Spec | P0 | 11 | Pending Spec |
| [US-18] | [REQ-CA-02] | Pending Spec | P0 | 11 | Pending Spec |
| [US-16] | [REQ-CA-03] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13], [US-17] | [REQ-SM-NF-01] | Pending Spec | P1 | 11 | Pending Spec |
| [US-17] | [REQ-SM-NF-02] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13] | [REQ-SM-NF-03] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13] | [REQ-SM-NF-04] | Pending Spec | P0 | 11 | Pending Spec |
| [US-13], [US-17] | [REQ-SM-NF-05] | Pending Spec | P1 | 11 | Pending Spec |

| [US-20] | [REQ-PI-01] | [FSPEC-PI-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P0 | 13 | FSPEC Complete |
| [US-20], [US-22] | [REQ-PI-02] | [FSPEC-PI-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P0 | 13 | FSPEC Complete |
| [US-20] | [REQ-PI-03] | [FSPEC-PI-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P0 | 13 | FSPEC Complete |
| [US-20] | [REQ-PI-04] | [FSPEC-PI-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P1 | 13 | FSPEC Complete |
| [US-20] | [REQ-PI-05] | [FSPEC-PI-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P0 | 13 | FSPEC Complete |
| [US-21] | [REQ-BC-01] | [FSPEC-BC-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P0 | 13 | FSPEC Complete |
| [US-21] | [REQ-BC-02] | [FSPEC-BC-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P1 | 13 | FSPEC Complete |
| [US-22] | [REQ-DC-01] | [FSPEC-DC-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P1 | 13 | FSPEC Complete |
| [US-22] | [REQ-DC-02] | [FSPEC-DC-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P1 | 13 | FSPEC Complete |
| [US-22] | [REQ-DC-03] | [FSPEC-DC-01](../013-pdlc-auto-init/013-FSPEC-pdlc-auto-init.md) | P1 | 13 | FSPEC Complete |
| [US-20], [US-21], [US-22] | [REQ-NF-01] | Pending TSPEC | P1 | 13 | Pending Spec |
| [US-20], [US-21], [US-22] | [REQ-NF-02] | Pending TSPEC | P0 | 13 | Pending Spec |
| [US-20], [US-21], [US-22] | [REQ-NF-03] | Pending TSPEC | P0 | 13 | Pending Spec |
| [US-23] | [REQ-PD-01] | [FSPEC-PD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-PD-02] | [FSPEC-PD-02](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-PD-03] | [FSPEC-PD-03](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-24] | [REQ-PD-04] | [FSPEC-PD-02](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-PD-05] | [FSPEC-PD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-23] | [REQ-PD-06] | [FSPEC-PD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-BD-01] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-BD-02] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-BD-03] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-BD-04] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-BD-05] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-24] | [REQ-BD-06] | [FSPEC-BD-03](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-23], [US-25] | [REQ-BD-07] | [FSPEC-BD-02](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-24], [US-25] | [REQ-BD-08] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-23] | [REQ-TL-01] | Pending TSPEC | P0 | 14 | Pending Spec |
| [US-23] | [REQ-TL-02] | [FSPEC-TL-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-23] | [REQ-TL-03] | Pending TSPEC | P0 | 14 | Pending Spec |
| [US-23] | [REQ-TL-04] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-23] | [REQ-TL-05] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P0 | 14 | FSPEC Complete |
| [US-25] | [REQ-PR-01] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-25] | [REQ-PR-02] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-25] | [REQ-PR-03] | [FSPEC-BD-01](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-25] | [REQ-PR-04] | Pending TSPEC | P2 | 14 | Pending Spec |
| [US-23], [US-24], [US-25] | [REQ-NF-14-01] | [FSPEC-PD-02](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-23], [US-24], [US-25] | [REQ-NF-14-02] | [FSPEC-BD-02](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |
| [US-23], [US-24], [US-25] | [REQ-NF-14-03] | Pending TSPEC | P0 | 14 | Pending Spec |
| [US-23], [US-24], [US-25] | [REQ-NF-14-04] | Pending TSPEC | P0 | 14 | Pending Spec |
| [US-23] | [REQ-NF-14-05] | [FSPEC-TL-02](../014-tech-lead-orchestration/014-FSPEC-tech-lead-orchestration.md) | P1 | 14 | FSPEC Complete |

---

## 3. Coverage Analysis

### 3.1 User Scenario Coverage

| User Scenario | Title | Requirement Count | Fully Specified? |
|---------------|-------|-------------------|------------------|
| [US-01] | Developer Bootstraps Ptah in an Existing Repository | 9 | Yes (9 of 9 specified) |
| [US-02] | Orchestrator Coordinates Agent-to-Agent Review | 14 | Partial (8 of 14 FSPEC'd — Phase 3 requirements) |
| [US-03] | Agent Asks User a Blocking Question | 8 | Partial (8 of 8 FSPEC'd — REQ-SI-04 Phase 3 + 7 Phase 5) |
| [US-04] | Orchestrator Assembles Context for Stateless Skill Invocation | 17 | Partial (15 of 17 FSPEC'd — Phase 3 requirements) |
| [US-05] | Developer Launches and Monitors the Orchestrator | 5 | Partial (1 of 5 FSPEC'd — REQ-DI-04) |
| [US-06] | Agent Produces and Commits Artifacts | 11 | Partial (10 of 11 FSPEC'd — Phase 3 + Phase 4 requirements) |
| [US-07] | System Handles Failures Gracefully | 7 | Partial (6 of 7 FSPEC'd — REQ-SI-09 in Phase 4; REQ-SI-07, REQ-SI-08, REQ-SI-10, REQ-NF-02 in Phase 6) |
| [US-08] | New Agent is Added to the System | 1 | No (0 of 1 specified) |
| [US-09] | Developer Starts a New Feature Without Manual Folder Setup | 8 | Yes (8 of 8 FSPEC'd) |
| [US-10] | Developer Reviews Agent Work Before It Reaches Main | 10 | No (0 of 10 specified) |
| [US-11] | Developer Runs Multiple Agents in Parallel on the Same Feature | 13 | No (0 of 13 specified) |
| [US-12] | Developer Runs Different Agent Types in Parallel on the Same Feature | 8 | No (0 of 8 specified) |
| [US-13] | Orchestrator Enforces PDLC Phase Ordering | 17 | No (0 of 17 specified) |
| [US-14] | Orchestrator Tracks Review Approvals Deterministically | 14 | No (0 of 14 specified) |
| [US-15] | Feature Configuration Determines Reviewer Set | 11 | No (0 of 11 specified) |
| [US-16] | Rejected Reviews Trigger Revision Loops | 5 | No (0 of 5 specified) |
| [US-17] | PDLC State Survives Orchestrator Restarts | 7 | No (0 of 7 specified) |
| [US-18] | Simplified Agent Skills Focus on Domain Tasks | 15 | No (0 of 15 specified) |
| [US-20] | New Feature Auto-Registers in PDLC | 5 | Yes (5 of 5 FSPEC'd) |
| [US-21] | Existing Unmanaged Features Are Not Disrupted | 2 | Yes (2 of 2 FSPEC'd) |
| [US-22] | Developer Specifies Feature Discipline | 3 | Yes (3 of 3 FSPEC'd) |
| [US-23] | Developer Wants Faster Implementation of Large Plans | 17 | Partial (14 of 17 FSPEC'd; 3 pending TSPEC) |
| [US-24] | Developer Wants to Resume Implementation from a Specific Batch | 5 | Partial (4 of 5 FSPEC'd; 1 pending TSPEC) |
| [US-25] | Developer Wants Visibility into Parallel Execution Progress | 10 | Partial (7 of 10 FSPEC'd; 3 pending TSPEC) |

### 3.2 Requirement Coverage

| Requirement | Title | Specification Count | Status |
|-------------|-------|---------------------|--------|
| [REQ-IN-01] | Create /docs folder structure | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-02] | Seed markdown templates | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-03] | Create docs/overview.md | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-04] | Generate configuration file with defaults | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-05] | Detect and skip existing files | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-06] | Commit scaffolded structure | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-07] | Create ptah/ runtime directory with placeholder Skills | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-IN-08] | Pre-create agent log files and open-questions files | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-DI-01] | Orchestrator owns all Discord I/O | 0 | Pending |
| [REQ-DI-02] | Watch #agent-updates threads | 0 | Pending |
| [REQ-DI-03] | Read full thread history | 0 | Pending |
| [REQ-DI-04] | Post colour-coded embeds | 1 | FSPEC'd ([FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-DI-05] | Create one thread per coordination task | 1 | FSPEC'd ([FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-DI-06] | Archive threads on resolution signal | 0 | Pending |
| [REQ-DI-07] | @mention user in #open-questions | 1 | Specified ([005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md)) |
| [REQ-DI-08] | Post system message at max-turns limit | 1 | FSPEC'd ([FSPEC-GR-02](../006-guardrails/006-FSPEC-ptah-guardrails.md)) |
| [REQ-DI-09] | Route by routing signal only | 1 | FSPEC'd ([FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-01] | Three-layer context model | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-02] | Layer 1 and Layer 3 never truncated | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-03] | Fresh artifact reads | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-04] | Scope Layer 2 to current feature | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-05] | Token budget enforcement | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-CB-06] | Task splitting on budget overflow | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-RP-01] | Pattern A — Agent-to-agent answer | 1 | FSPEC'd ([FSPEC-RP-02](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-RP-02] | Pattern B — User answer resume | 1 | Specified ([005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md)) |
| [REQ-RP-03] | Pattern C — Review loop | 1 | FSPEC'd ([FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-RP-04] | Final review instruction at Turn 3 | 1 | FSPEC'd ([FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-RP-05] | Block fifth turn in review threads | 1 | FSPEC'd ([FSPEC-GR-02](../006-guardrails/006-FSPEC-ptah-guardrails.md)) |
| [REQ-PQ-01] | Write to pending.md | 1 | Specified ([005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md)) |
| [REQ-PQ-02] | Poll pending.md | 1 | Specified ([005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md)) |
| [REQ-PQ-03] | Resume on user answer | 1 | Specified ([005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md)) |
| [REQ-PQ-04] | Archive to resolved.md | 1 | Specified ([005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md)) |
| [REQ-PQ-05] | Discord reply writeback to pending.md | 1 | Specified ([005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md)) |
| [REQ-SI-01] | Stateless Skill invocation | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-02] | Skill output format | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-03] | Two-iteration rule in Skill prompts | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-04] | Structured routing signal | 1 | FSPEC'd ([FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-05] | Commit artifact changes | 1 | FSPEC'd ([FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-SI-06] | Append agent logs | 1 | FSPEC'd ([FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-SI-07] | Retry with exponential backoff | 1 | FSPEC'd ([FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md)) |
| [REQ-SI-08] | Graceful failure handling | 1 | FSPEC'd ([FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md)) |
| [REQ-SI-09] | Idempotent message processing | 1 | FSPEC'd ([FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-SI-10] | Graceful shutdown | 1 | FSPEC'd ([FSPEC-GR-03](../006-guardrails/006-FSPEC-ptah-guardrails.md)) |
| [REQ-SI-11] | Concurrent Skill invocations | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-12] | Per-agent worktree isolation | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-SI-13] | Worktree merge and cleanup | 1 | FSPEC'd ([FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-NF-01] | Response latency | 1 | FSPEC'd ([FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-NF-02] | Reliability | 1 | FSPEC'd ([FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md)) |
| [REQ-NF-03] | Idempotency | 1 | FSPEC'd ([FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-NF-04] | Token efficiency | 1 | FSPEC'd ([FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-NF-05] | Auditability | 2 | FSPEC'd ([FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md), [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md)) |
| [REQ-NF-06] | Security | 1 | Specified ([TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md)) |
| [REQ-NF-07] | Portability | 1 | FSPEC'd ([FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md)) |
| [REQ-NF-08] | Extensibility | 0 | Pending |
| [REQ-AF-01] | Feature folder existence check | 1 | FSPEC'd ([FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md)) |
| [REQ-AF-02] | NNN prefix extraction from thread name | 1 | FSPEC'd ([FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md)) |
| [REQ-AF-03] | NNN auto-assignment for unnumbered threads | 1 | FSPEC'd ([FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md)) |
| [REQ-AF-04] | Feature slug derivation from thread name | 1 | FSPEC'd ([FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md)) |
| [REQ-AF-05] | Feature folder creation | 1 | FSPEC'd ([FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md)) |
| [REQ-AF-06] | overview.md synthesis and creation | 1 | FSPEC'd ([FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md)) |
| [REQ-AF-07] | Idempotency — skip if folder exists | 1 | FSPEC'd ([FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md)) |
| [REQ-AF-NF-01] | Bootstrap is synchronous and precedes Phase 1 | 1 | FSPEC'd ([FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md)) |
| [REQ-FB-01] | Feature branch creation | 0 | Pending |
| [REQ-FB-02] | Feature branch reuse | 0 | Pending |
| [REQ-FB-03] | Feature branch push to remote | 0 | Pending |
| [REQ-FB-04] | No direct merge to main | 0 | Pending |
| [REQ-AB-01] | Agent sub-branch naming | 0 | Pending |
| [REQ-AB-02] | Agent sub-branch base | 0 | Pending |
| [REQ-AB-03] | Concurrent agent isolation | 0 | Pending |
| [REQ-AB-04] | Sub-branch cleanup | 0 | Pending |
| [REQ-MG-01] | Serialized merge to feature branch | 0 | Pending |
| [REQ-MG-02] | Merge conflict handling | 0 | Pending |
| [REQ-MG-03] | Feature branch update before merge | 0 | Pending |
| [REQ-SK-01] | Remove agent git checkout instructions | 0 | Pending |
| [REQ-SK-02] | Agent awareness of worktree context | 0 | Pending |
| [REQ-PF-NF-01] | Merge latency | 0 | Pending |
| [REQ-PF-NF-02] | Worktree disk usage | 0 | Pending |
| [REQ-PF-NF-03] | Backward compatibility | 0 | Pending |
| [REQ-SM-01] | PDLC phase enumeration | 0 | Pending |
| [REQ-SM-02] | Per-feature state tracking | 0 | Pending |
| [REQ-SM-03] | Valid transition enforcement | 0 | Pending |
| [REQ-SM-04] | FSPEC skip transition | 0 | Pending |
| [REQ-SM-05] | State persistence to disk | 0 | Pending |
| [REQ-SM-06] | State recovery on startup | 0 | Pending |
| [REQ-SM-07] | Parallel TSPEC creation (fork) | 0 | Pending |
| [REQ-SM-08] | Parallel PLAN creation (fork) | 0 | Pending |
| [REQ-SM-09] | Terminal state | 0 | Pending |
| [REQ-SM-10] | State file schema versioning | 0 | Pending |
| [REQ-SM-11] | Parallel implementation (fork) | 0 | Pending |
| [REQ-RT-01] | Reviewer manifest per phase | 0 | Pending |
| [REQ-RT-02] | Review rules definition | 0 | Pending |
| [REQ-RT-03] | Per-reviewer status tracking | 0 | Pending |
| [REQ-RT-04] | Approval detection from cross-review files | 0 | Pending |
| [REQ-RT-05] | Phase advance on all-approved | 0 | Pending |
| [REQ-RT-06] | Revision loop on rejection | 0 | Pending |
| [REQ-RT-07] | Revision feedback context | 0 | Pending |
| [REQ-RT-08] | Concurrent review dispatch | 0 | Pending |
| [REQ-RT-09] | Revision loop bound | 0 | Pending |
| [REQ-AI-01] | Orchestrator-driven agent selection | 0 | Pending |
| [REQ-AI-02] | Phase-to-agent mapping | 0 | Pending |
| [REQ-AI-03] | Task directive in context | 0 | Pending |
| [REQ-AI-04] | Agent signal interpretation | 0 | Pending |
| [REQ-AI-05] | Agent output validation | 0 | Pending |
| [REQ-FC-01] | Discipline configuration | 0 | Pending |
| [REQ-FC-02] | Configuration at feature creation | 0 | Pending |
| [REQ-FC-03] | Default discipline | 0 | Pending |
| [REQ-FC-04] | Reviewer set computation | 0 | Pending |
| [REQ-FC-05] | Peer review assignment | 0 | Pending |
| [REQ-SA-01] | Remove task selection from SKILL.md | 0 | Pending |
| [REQ-SA-02] | Remove routing logic from SKILL.md | 0 | Pending |
| [REQ-SA-03] | Remove document status management from SKILL.md | 0 | Pending |
| [REQ-SA-04] | Retain domain task instructions | 0 | Pending |
| [REQ-SA-05] | Agent response contract | 0 | Pending |
| [REQ-SA-06] | Cross-review file convention retained | 0 | Pending |
| [REQ-CA-01] | Phase-aware context assembly | 0 | Pending |
| [REQ-CA-02] | Context document matrix | 0 | Pending |
| [REQ-CA-03] | Revision context includes feedback | 0 | Pending |
| [REQ-SM-NF-01] | State transition latency | 0 | Pending |
| [REQ-SM-NF-02] | State file integrity | 0 | Pending |
| [REQ-SM-NF-03] | Backward compatibility | 0 | Pending |
| [REQ-SM-NF-04] | Testability | 0 | Pending |
| [REQ-SM-NF-05] | Observability | 0 | Pending |

### 3.3 Orphan Check

**Orphaned user scenarios** (no requirements):
- None

**Orphaned requirements** (no user scenario):
- None

**Unspecified requirements** (no specification):
- 67 of 124 requirements are pending specification (Phase 1: 9 TSPEC'd; Phase 3: 21 FSPEC'd; Phase 4: 6 FSPEC'd; Phase 5: 7 FSPEC'd; Phase 6: 6 FSPEC'd; Phase 9: 8 FSPEC'd; Phase 10: 17 pending; Phase 11: 31 FSPEC'd + 14 direct-to-TSPEC; Phases 2, 7: 5 pending)

---

## 4. Phase View

### Phase 1 — Init

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-IN-01] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-02] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-03] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-04] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-05] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-06] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-07] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-IN-08] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01] |
| [REQ-NF-06] | [TSPEC-ptah-init](../specifications/TSPEC-ptah-init.md) | P0 | [US-01], [US-05] |

### Phase 2 — Discord Bot

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-DI-01] | Pending | P0 | [US-02], [US-04] |
| [REQ-DI-02] | Pending | P0 | [US-02], [US-05] |
| [REQ-DI-03] | Pending | P0 | [US-02], [US-04] |

### Phase 3 — Skill Routing

| Requirement | FSPEC | Specification | Priority | User Scenarios |
|-------------|-------|---------------|----------|----------------|
| [REQ-DI-04] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-05] |
| [REQ-DI-05] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02] |
| [REQ-DI-09] | [FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-04] |
| [REQ-CB-01] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-02] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-03] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-04] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-05] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-CB-06] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P1 | [US-04] |
| [REQ-RP-01] | [FSPEC-RP-02](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-04] |
| [REQ-RP-03] | [FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-04] |
| [REQ-RP-04] | [FSPEC-RP-03](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02] |
| [REQ-SI-01] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04], [US-06] |
| [REQ-SI-02] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-SI-03] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02] |
| [REQ-SI-04] | [FSPEC-RP-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-03] |
| [REQ-SI-11] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-02], [US-04], [US-06] |
| [REQ-SI-12] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04], [US-06] |
| [REQ-NF-01] | [FSPEC-SI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-NF-04] | [FSPEC-CB-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04] |
| [REQ-NF-07] | [FSPEC-DI-01](../specifications/FSPEC-ptah-skill-routing.md) | Pending TSPEC | P0 | [US-04], [US-06] |

### Phase 4 — Artifact Commits

| Requirement | FSPEC | Specification | Priority | User Scenarios |
|-------------|-------|---------------|----------|----------------|
| [REQ-SI-05] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-SI-06] | [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-SI-09] | [FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06], [US-07] |
| [REQ-SI-13] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-NF-03] | [FSPEC-AC-03](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |
| [REQ-NF-05] | [FSPEC-AC-01](../specifications/004-FSPEC-ptah-artifact-commits.md), [FSPEC-AC-02](../specifications/004-FSPEC-ptah-artifact-commits.md) | Pending TSPEC | P0 | [US-06] |

### Phase 5 — User Questions

| Requirement | FSPEC | Specification | Plan | Priority | User Scenarios |
|-------------|-------|---------------|------|----------|----------------|
| [REQ-DI-07] | [FSPEC-PQ-01](../specifications/005-FSPEC-ptah-user-questions.md) | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) v1.1 | [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) | P0 | [US-03] |
| [REQ-RP-02] | [FSPEC-RPB-01](../specifications/005-FSPEC-ptah-user-questions.md) | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) v1.1 | [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) | P0 | [US-03], [US-04] |
| [REQ-PQ-01] | [FSPEC-PQ-01](../specifications/005-FSPEC-ptah-user-questions.md) | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) v1.1 | [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) | P0 | [US-03] |
| [REQ-PQ-02] | [FSPEC-PQ-01](../specifications/005-FSPEC-ptah-user-questions.md) | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) v1.1 | [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) | P0 | [US-03] |
| [REQ-PQ-03] | [FSPEC-PQ-01](../specifications/005-FSPEC-ptah-user-questions.md) | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) v1.1 | [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) | P0 | [US-03] |
| [REQ-PQ-04] | [FSPEC-PQ-01](../specifications/005-FSPEC-ptah-user-questions.md) | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) v1.1 | [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) | P0 | [US-03] |
| [REQ-PQ-05] | [FSPEC-PQ-02](../specifications/005-FSPEC-ptah-user-questions.md) | [005-TSPEC-ptah-user-questions](../specifications/005-TSPEC-ptah-user-questions.md) v1.1 | [005-PLAN-TSPEC-ptah-user-questions](../plans/005-PLAN-TSPEC-ptah-user-questions.md) | P0 | [US-03] |

### Phase 6 — Guardrails

| Requirement | FSPEC | Specification | Priority | User Scenarios |
|-------------|-------|---------------|----------|----------------|
| [REQ-DI-08] | [FSPEC-GR-02](../006-guardrails/006-FSPEC-ptah-guardrails.md) | Pending TSPEC | P0 | [US-02], [US-07] |
| [REQ-RP-05] | [FSPEC-GR-02](../006-guardrails/006-FSPEC-ptah-guardrails.md) | Pending TSPEC | P0 | [US-02], [US-07] |
| [REQ-SI-07] | [FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md) | Pending TSPEC | P0 | [US-07] |
| [REQ-SI-08] | [FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md) | Pending TSPEC | P0 | [US-07] |
| [REQ-SI-10] | [FSPEC-GR-03](../006-guardrails/006-FSPEC-ptah-guardrails.md) | Pending TSPEC | P0 | [US-05], [US-07] |
| [REQ-NF-02] | [FSPEC-GR-01](../006-guardrails/006-FSPEC-ptah-guardrails.md) | Pending TSPEC | P0 | [US-07] |

### Phase 7 — Polish

| Requirement | FSPEC | Specification | Priority | User Scenarios |
|-------------|-------|---------------|----------|----------------|
| [REQ-DI-06] | [FSPEC-DI-02](../007-polish/007-FSPEC-polish.md) | Pending TSPEC | P1 | [US-02] |
| [REQ-NF-08] | [FSPEC-EX-01](../007-polish/007-FSPEC-polish.md) | Pending TSPEC | P1 | [US-08] |

### Phase 9 — Auto Feature Bootstrap

| Requirement | FSPEC | Specification | Priority | User Scenarios |
|-------------|-------|---------------|----------|----------------|
| [REQ-AF-01] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Pending TSPEC | P0 | [US-09] |
| [REQ-AF-02] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Pending TSPEC | P0 | [US-09] |
| [REQ-AF-03] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Pending TSPEC | P0 | [US-09] |
| [REQ-AF-04] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Pending TSPEC | P0 | [US-09] |
| [REQ-AF-05] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Pending TSPEC | P0 | [US-09] |
| [REQ-AF-06] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Pending TSPEC | P0 | [US-09] |
| [REQ-AF-07] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Pending TSPEC | P0 | [US-09] |
| [REQ-AF-NF-01] | [FSPEC-AF-01](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Pending TSPEC | P0 | [US-09] |

### Phase 10 — Parallel Feature Development

| Requirement | Specification | Priority | User Scenarios |
|-------------|---------------|----------|----------------|
| [REQ-FB-01] | Pending | P0 | [US-10], [US-11] |
| [REQ-FB-02] | Pending | P0 | [US-10], [US-11], [US-12] |
| [REQ-FB-03] | Pending | P0 | [US-10] |
| [REQ-FB-04] | Pending | P0 | [US-10] |
| [REQ-AB-01] | Pending | P0 | [US-11], [US-12] |
| [REQ-AB-02] | Pending | P0 | [US-11], [US-12] |
| [REQ-AB-03] | Pending | P0 | [US-11], [US-12] |
| [REQ-AB-04] | Pending | P0 | [US-11], [US-12] |
| [REQ-MG-01] | Pending | P0 | [US-11], [US-12] |
| [REQ-MG-02] | Pending | P0 | [US-11] |
| [REQ-MG-03] | Pending | P1 | [US-10], [US-11] |
| [REQ-SK-01] | Pending | P0 | [US-10] |
| [REQ-SK-02] | Pending | P1 | [US-10], [US-11] |
| [REQ-PF-NF-01] | Pending | P1 | [US-10], [US-11] |
| [REQ-PF-NF-02] | Pending | P1 | [US-10], [US-11] |
| [REQ-PF-NF-03] | Pending | P0 | [US-10], [US-11] |

### Phase 11 — Orchestrator PDLC State Machine

| Requirement | FSPEC | Specification | Priority | User Scenarios |
|-------------|-------|---------------|----------|----------------|
| [REQ-SM-01] | [FSPEC-SM-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13] |
| [REQ-SM-02] | — (data model) | Pending TSPEC | P0 | [US-13], [US-17] |
| [REQ-SM-03] | [FSPEC-SM-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13] |
| [REQ-SM-04] | [FSPEC-SM-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P1 | [US-13] |
| [REQ-SM-05] | [FSPEC-SM-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-17] |
| [REQ-SM-06] | [FSPEC-SM-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-17] |
| [REQ-SM-07] | [FSPEC-SM-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13], [US-15] |
| [REQ-SM-08] | [FSPEC-SM-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13], [US-15] |
| [REQ-SM-09] | [FSPEC-SM-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13] |
| [REQ-SM-10] | [FSPEC-SM-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-17] |
| [REQ-SM-11] | [FSPEC-SM-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13], [US-15] |
| [REQ-RT-01] | [FSPEC-RT-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-14], [US-15] |
| [REQ-RT-02] | [FSPEC-RT-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-14] |
| [REQ-RT-03] | [FSPEC-RT-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-14] |
| [REQ-RT-04] | [FSPEC-RT-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-14], [US-16] |
| [REQ-RT-05] | [FSPEC-RT-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-14] |
| [REQ-RT-06] | [FSPEC-RT-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-16] |
| [REQ-RT-07] | [FSPEC-RT-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-16] |
| [REQ-RT-08] | — (P1, simple) | Pending TSPEC | P1 | [US-14] |
| [REQ-RT-09] | [FSPEC-RT-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-16] |
| [REQ-AI-01] | [FSPEC-AI-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13], [US-18] |
| [REQ-AI-02] | [FSPEC-AI-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13] |
| [REQ-AI-03] | [FSPEC-AI-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-18] |
| [REQ-AI-04] | [FSPEC-AI-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-13] |
| [REQ-AI-05] | [FSPEC-AI-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P1 | [US-13] |
| [REQ-FC-01] | [FSPEC-FC-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-15] |
| [REQ-FC-02] | — (config setting) | Pending TSPEC | P0 | [US-15] |
| [REQ-FC-03] | — (default value) | Pending TSPEC | P1 | [US-15] |
| [REQ-FC-04] | [FSPEC-FC-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-14], [US-15] |
| [REQ-FC-05] | [FSPEC-FC-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-14], [US-15] |
| [REQ-SA-01] | — (SKILL.md change) | Pending TSPEC | P0 | [US-18] |
| [REQ-SA-02] | — (SKILL.md change) | Pending TSPEC | P0 | [US-18] |
| [REQ-SA-03] | — (SKILL.md change) | Pending TSPEC | P0 | [US-18] |
| [REQ-SA-04] | — (SKILL.md change) | Pending TSPEC | P0 | [US-18] |
| [REQ-SA-05] | — (SKILL.md change) | Pending TSPEC | P0 | [US-18] |
| [REQ-SA-06] | — (SKILL.md change) | Pending TSPEC | P0 | [US-14], [US-18] |
| [REQ-CA-01] | [FSPEC-CA-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-18] |
| [REQ-CA-02] | [FSPEC-CA-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-18] |
| [REQ-CA-03] | [FSPEC-CA-01](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-16] |
| [REQ-SM-NF-01] | — (NF constraint) | Pending TSPEC | P1 | [US-13], [US-17] |
| [REQ-SM-NF-02] | [FSPEC-SM-02](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Pending TSPEC | P0 | [US-17] |
| [REQ-SM-NF-03] | — (NF constraint) | Pending TSPEC | P0 | [US-13] |
| [REQ-SM-NF-04] | — (NF constraint) | Pending TSPEC | P0 | [US-13] |
| [REQ-SM-NF-05] | — (NF constraint) | Pending TSPEC | P1 | [US-13], [US-17] |

---

## 5. Document References

| Document | Location | Description |
|----------|----------|-------------|
| Requirements (Master) | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) | Master requirements index — user stories, scope, assumptions, risks |
| Requirements — Phase 1 | [001-REQ-PTAH-init](../requirements/001-REQ-PTAH-init.md) | Phase 1 (Init) requirements — 9 requirements |
| Requirements — Phase 2 | [002-REQ-PTAH-discord-bot](../requirements/002-REQ-PTAH-discord-bot.md) | Phase 2 (Discord Bot) requirements — 3 requirements |
| Requirements — Phase 3 | [003-REQ-PTAH-skill-routing](../requirements/003-REQ-PTAH-skill-routing.md) | Phase 3 (Skill Routing) requirements — 21 requirements |
| Requirements — Phase 4 | [004-REQ-PTAH-artifact-commits](../requirements/004-REQ-PTAH-artifact-commits.md) | Phase 4 (Artifact Commits) requirements — 6 requirements |
| Requirements — Phase 5 | [005-REQ-PTAH-user-questions](../requirements/005-REQ-PTAH-user-questions.md) | Phase 5 (User Questions) requirements — 7 requirements |
| Requirements — Phase 6 | [006-REQ-PTAH-guardrails](../requirements/006-REQ-PTAH-guardrails.md) | Phase 6 (Guardrails) requirements — 6 requirements |
| Requirements — Phase 7 | [007-REQ-polish](../007-polish/007-REQ-polish.md) | Phase 7 (Polish) requirements — 2 requirements |
| TSPEC — ptah init | [001-TSPEC-ptah-init](../specifications/001-TSPEC-ptah-init.md) | Technical specification for Phase 1 (`ptah init`) |
| TSPEC — ptah discord bot | [002-TSPEC-ptah-discord-bot](../specifications/002-TSPEC-ptah-discord-bot.md) | Technical specification for Phase 2 (`ptah start` — Discord Bot) |
| FSPEC — ptah skill routing | [FSPEC-ptah-skill-routing](../specifications/003-FSPEC-ptah-skill-routing.md) | Functional specification for Phase 3 (Skill Routing) — 6 FSPECs |
| FSPEC — ptah artifact commits | [FSPEC-ptah-artifact-commits](../specifications/004-FSPEC-ptah-artifact-commits.md) | Functional specification for Phase 4 (Artifact Commits) — 3 FSPECs |
| FSPEC — ptah user questions | [FSPEC-ptah-user-questions](../specifications/005-FSPEC-ptah-user-questions.md) | Functional specification for Phase 5 (User Questions) — 3 FSPECs |
| Specifications (Phases 6-7) | Pending | Detailed specifications for remaining phases |
| Requirements — Phase 9 | [009-REQ-PTAH-auto-feature-bootstrap](../009-auto-feature-bootstrap/009-REQ-PTAH-auto-feature-bootstrap.md) | Phase 9 (Auto Feature Bootstrap) requirements — 8 requirements |
| FSPEC — auto feature bootstrap | [009-FSPEC-ptah-auto-feature-bootstrap](../009-auto-feature-bootstrap/009-FSPEC-ptah-auto-feature-bootstrap.md) | Functional specification for Phase 9 — 1 FSPEC (FSPEC-AF-01) |
| Requirements — Phase 10 | [010-REQ-ptah-parallel-feature-development](../010-parallel-feature-development/010-REQ-ptah-parallel-feature-development.md) | Phase 10 (Parallel Feature Development) requirements — 17 requirements |
| Requirements — Phase 11 | [011-REQ-orchestrator-pdlc-state-machine](../011-orchestrator-pdlc-state-machine/011-REQ-orchestrator-pdlc-state-machine.md) | Phase 11 (Orchestrator PDLC State Machine) requirements — 45 requirements (v1.2 approved by eng + qa) |
| FSPEC — Phase 11 | [011-FSPEC-orchestrator-pdlc-state-machine](../011-orchestrator-pdlc-state-machine/011-FSPEC-orchestrator-pdlc-state-machine.md) | Functional specification for Phase 11 — 7 FSPECs (SM-01, SM-02, RT-01, RT-02, AI-01, FC-01, CA-01) |
| PRD | [Ptah PRD v4.0](../PTAH_PRD_v4.0.docx) | Product requirements document |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 8, 2026 | Product Manager | Initial traceability matrix — US → REQ mapping complete; SPEC column pending Phase 3 |
| 1.1 | March 8, 2026 | Product Manager | Added 5 new requirements from OQ resolutions: REQ-DI-09, REQ-PQ-05, REQ-SI-11, REQ-SI-12, REQ-SI-13. Updated coverage counts. |
| 1.2 | March 8, 2026 | Product Manager | Added REQ-IN-07 and REQ-IN-08 from ANALYSIS-ptah-init.md question resolutions. US-01 coverage updated from 7 to 9. Total requirements updated from 52 to 54. |
| 1.3 | March 8, 2026 | Backend Engineer | Updated Phase 1 requirements (REQ-IN-01 through REQ-IN-08, REQ-NF-06) to reference TSPEC-ptah-init. 9 of 54 requirements now specified. |
| 1.4 | March 9, 2026 | Product Manager | Added FSPEC mappings for all 21 Phase 3 requirements. 6 FSPECs created: FSPEC-CB-01, FSPEC-RP-01, FSPEC-RP-02, FSPEC-RP-03, FSPEC-SI-01, FSPEC-DI-01. Phase 3 view updated with FSPEC column. Coverage: 9 TSPEC'd + 21 FSPEC'd = 30 of 54 requirements specified. |
| 1.5 | March 10, 2026 | Product Manager | Added FSPEC mappings for all 6 Phase 4 requirements. 3 FSPECs created: FSPEC-AC-01, FSPEC-AC-02, FSPEC-AC-03. Phase 4 view updated with FSPEC column. Coverage: 9 TSPEC'd + 21 Phase 3 FSPEC'd + 6 Phase 4 FSPEC'd = 36 of 54 requirements specified (18 pending). |
| 1.6 | March 11, 2026 | Product Manager | Added FSPEC mappings for all 7 Phase 5 requirements. 3 FSPECs created: FSPEC-PQ-01, FSPEC-PQ-02, FSPEC-RPB-01. Phase 5 view updated with FSPEC column. Coverage: 9 TSPEC'd + 21 Phase 3 FSPEC'd + 6 Phase 4 FSPEC'd + 7 Phase 5 FSPEC'd = 43 of 54 requirements specified (11 pending). |
| 1.7 | March 11, 2026 | Product Manager | 005-FSPEC-ptah-user-questions v1.1 approved for engineering handoff. Phase 5 FSPECs revised to address backend-engineer review (9 findings). TSPEC authoring may begin. |
| 1.8 | March 11, 2026 | Backend Engineer | Phase 5 TSPEC (005-TSPEC-ptah-user-questions v1.1) approved after PM + TE reviews (F-01/F-02 addressed). Execution plan (005-PLAN-TSPEC-ptah-user-questions, 65 tasks) approved after TE review. Phase 5 requirements updated to "Specified"; Phase 5 view updated with TSPEC + Plan columns. Coverage: 9 TSPEC'd (Phase 1) + 21 FSPEC'd (Phase 3) + 6 FSPEC'd (Phase 4) + 7 Specified (Phase 5) = 43 of 54 specified (11 pending). |
| 1.9 | March 13, 2026 | Product Manager | Added FSPEC mappings for all 6 Phase 6 requirements. 3 FSPECs created: FSPEC-GR-01 (retry/failure), FSPEC-GR-02 (turn limits), FSPEC-GR-03 (graceful shutdown). Phase 6 view updated with FSPEC column. Coverage: 9 TSPEC'd (Phase 1) + 21 FSPEC'd (Phase 3) + 6 FSPEC'd (Phase 4) + 7 Specified (Phase 5) + 6 FSPEC'd (Phase 6) = 49 of 54 specified (5 pending — Phases 2 and 7). |
| 2.0 | March 13, 2026 | Product Manager | Added Phase 9 (Auto Feature Bootstrap). New user story US-09. 8 requirements added (REQ-AF-01 through REQ-AF-07, REQ-AF-NF-01). 1 FSPEC created: FSPEC-AF-01 (Feature Folder Bootstrap). Phase 9 view added. Total requirements: 62. Coverage: 49 of 54 original + 8 of 8 Phase 9 FSPEC'd = 57 of 62 specified (5 pending — Phases 2 and 7). |
| 2.1 | March 14, 2026 | Product Manager | Added Phase 10 (Parallel Feature Development). 3 new user stories (US-10, US-11, US-12). 17 requirements added across 4 domains: FB (Feature Branching, 4 reqs), AB (Agent Branching, 4 reqs), MG (Merge Strategy, 3 reqs), SK (Skill Alignment, 2 reqs), plus 3 non-functional (PF-NF). Phase 10 view added. Total requirements: 79. Coverage: 57 of 62 prior + 0 of 17 Phase 10 = 57 of 79 specified (22 pending). |
| 2.2 | March 14, 2026 | Product Manager | Added Phase 11 (Orchestrator PDLC State Machine). 6 new user stories (US-13 through US-18). 42 requirements added across 6 domains: SM (State Machine, 9 reqs), RT (Review Tracking, 8 reqs), AI (Agent Invocation, 5 reqs), FC (Feature Configuration, 5 reqs), SA (Skill Alignment, 6 reqs), CA (Context Assembly, 3 reqs), plus 5 non-functional (SM-NF). Phase 11 view added. Total requirements: 121. Coverage: 57 of 79 prior + 0 of 42 Phase 11 = 57 of 121 specified (64 pending). |
| 2.3 | March 14, 2026 | Product Manager | Phase 11 REQ v1.1 approved after backend-engineer review. Added REQ-SM-10 (state file schema versioning) and REQ-SM-11 (parallel implementation fork/join). Total Phase 11 requirements: 44. Total requirements: 123. Coverage: 57 of 79 prior + 0 of 44 Phase 11 = 57 of 123 specified (66 pending). |
| 2.4 | March 14, 2026 | Product Manager | Phase 11 REQ v1.2 approved after test-engineer review. Added REQ-RT-09 (revision loop bound). Total Phase 11 requirements: 45. Total requirements: 124. Coverage: 57 of 79 prior + 0 of 45 Phase 11 = 57 of 124 specified (67 pending). |
| 2.5 | March 14, 2026 | Product Manager | Added FSPEC mappings for Phase 11. 7 FSPECs created: FSPEC-SM-01 (transition logic), FSPEC-SM-02 (persistence/recovery), FSPEC-RT-01 (approval detection), FSPEC-RT-02 (review lifecycle), FSPEC-AI-01 (agent dispatch), FSPEC-FC-01 (reviewer computation), FSPEC-CA-01 (context assembly). 31 of 45 Phase 11 requirements FSPEC'd; 14 direct-to-TSPEC. Phase 11 view updated with FSPEC column. |
| 2.6 | March 15, 2026 | Product Manager | Added Phase 13 (PDLC Auto-Initialization). 3 new user stories (US-20, US-21, US-22). 13 requirements added across 3 domains: PI (PDLC Initialization, 5 reqs), BC (Backward Compatibility, 2 reqs), DC (Discipline Configuration, 3 reqs), plus 3 non-functional (NF). 3 FSPECs created: FSPEC-PI-01 (auto-init decision flow), FSPEC-BC-01 (age guard), FSPEC-DC-01 (keyword parsing). 10 of 13 requirements FSPEC'd; 3 NFRs pending TSPEC. Total requirements: 137. |
| 2.7 | March 15, 2026 | Product Manager | Added FSPEC mappings for Phase 7 (Polish). 2 FSPECs created: FSPEC-DI-02 (thread archiving on resolution), FSPEC-EX-01 (configuration-driven agent extensibility). Phase 7 view updated with FSPEC column. Both Phase 7 requirements now FSPEC'd; pending TSPEC. |
| 2.9 | March 19, 2026 | Product Manager | Phase 14 FSPEC complete. Added REQ-NF-14-05 (pre-flight infrastructure check) to REQ v1.4 (28 requirements total for Phase 14). Added REQ-PD-06 (cycle detection) row — previously missing from matrix. Updated all Phase 14 requirement rows: 22 of 29 requirements FSPEC'd (FSPEC-PD-01/02/03, FSPEC-TL-01/02, FSPEC-BD-01/02/03 in 014-FSPEC-tech-lead-orchestration.md); 7 pending TSPEC (REQ-TL-01, REQ-TL-03, REQ-PR-04, REQ-NF-14-03, REQ-NF-14-04 and supporting). Total requirements: 164. |
| 2.8 | March 18, 2026 | Product Manager | Added Phase 14 (Tech Lead Orchestration). 3 new user stories (US-23, US-24, US-25). 26 requirements added across 4 domains: PD (Plan Dependency Analysis, 5 reqs), BD (Batch Dispatch, 8 reqs), TL (Tech Lead Orchestration, 5 reqs), PR (Progress Reporting, 4 reqs), plus 4 non-functional (NF-14). Phase 14 view added. Total requirements: 163. |

---

*End of Document*
