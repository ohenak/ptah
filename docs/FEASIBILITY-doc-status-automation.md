# Follow-Up Gap: Document Status Automation

| Field | Detail |
|-------|--------|
| **Date** | March 15, 2026 |
| **Source** | Features 011 (PDLC state machine) + 012 (skill simplification) |
| **Severity** | Medium |
| **Status** | Open |

## Gap Description

Feature 012 (REQ-DS-01/DS-02) removed document status management instructions from all four SKILL.md files, stating "the orchestrator handles this." However, the orchestrator has no code to update markdown document `Status` fields on disk. It only tracks PDLC phases internally in `pdlc-state.json`.

When a feature's REQ or FSPEC is approved via cross-reviews and the PDLC phase transitions (e.g., `REQ_REVIEW` → `REQ_APPROVED`), nobody updates the `| **Status** | Draft |` field to `| **Status** | Approved |` in the document file.

## Impact

- Document metadata is permanently stale (`Draft`) even after approval
- Developers reading documents see incorrect status
- Requires manual intervention to update status fields

## Proposed Fix

Add orchestrator logic to update the `Status` field in markdown document metadata when PDLC phase transitions indicate approval. For example:

- `REQ_REVIEW` → `REQ_APPROVED`: update `Status: Draft` → `Status: Approved` in the REQ file
- `FSPEC_REVIEW` → `FSPEC_APPROVED`: update `Status: Draft` → `Status: Approved` in the FSPEC file
- Same for TSPEC, PLAN, PROPERTIES

This should be captured as a requirement in a future feature (014 or later).
