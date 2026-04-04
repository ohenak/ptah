# Cross-Review: Product Manager — PROPERTIES Document

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager |
| **Document Reviewed** | PROPERTIES-feature-lifecycle-folders.md (v1.0) |
| **Review Date** | April 4, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — Medium: Skill invocation worktree cleanup after normal completion has no property

REQ-WT-02 contains two distinct obligations:

1. Crash recovery: "On orchestrator startup, a cleanup sweep must identify and remove any dangling worktrees..."
2. Normal lifecycle: "A worktree is created immediately before the skill runs. **It is removed after the skill completes (success or failure).**"

The seven properties mapped to REQ-WT-02 (PROP-WT-03, PROP-WT-04, PROP-WT-07, PROP-WT-08, PROP-WT-12, PROP-WT-14, PROP-WT-18) cover the startup cleanup path and infrastructure contracts — but none verify the primary normal-lifecycle cleanup obligation: that the orchestrator destroys a skill invocation's worktree after the skill finishes.

PROP-WT-10 covers the analogous case for promotion activities ("destroy it in a finally block") but no matching property exists for skill invocations. This means the most common cleanup path (the one exercised on every skill run) is untested by any property.

Risk R-06 in REQ-FLF explicitly identifies worktree accumulation as medium risk, noting "aggressive cleanup is preferable to accumulation." Without this property, a regression in normal-path cleanup would pass all existing tests.

**Required action:** Add a functional (or integration) property — for example: "The orchestrator must destroy the skill invocation worktree in a finally block after the skill activity completes, regardless of whether the skill succeeded or failed" — and add it to the REQ-WT-02 row in the coverage matrix.

---

### F-02 — Low: Section numbering gap (3.6, 3.7 skipped)

The document jumps from Section 3.5 (Integration Properties) directly to Section 3.8 (Idempotency Properties), with no sections 3.6 or 3.7. This is a formatting error. Future readers or reviewers who see `§3.6` cited somewhere will not be able to resolve it.

**Required action:** Renumber sections 3.8 → 3.6 and 3.9 → 3.7, or add placeholder headings explaining the gap.

---

## Clarification Questions

### Q-01

The coverage matrix Section 5.2 uses range notation (e.g., `PROP-SK-02..SK-20`) to express FSPEC coverage. These ranges cross category boundaries (Functional, Contract, Integration, Negative). Is this shorthand intentional, or should the table enumerate the specific property IDs to prevent ambiguity when properties are later added to or removed from the middle of a range?

This is not a blocker but worth resolving before the document reaches Approved status.

---

## Positive Observations

- **Comprehensive coverage.** All 29 requirements are mapped; the single deliberate gap (REQ-SK-05, docs-only) is explicitly documented with rationale. This is exactly the right approach.
- **Gaps section is honest and actionable.** Section 7 proactively identifies the concurrent NNN assignment race and missing E2E lifecycle property — both align with risks R-04 and the product's emphasis on idempotency. The recommendations are sensible.
- **Idempotency properties are well-specified.** PROP-NF-02 through PROP-NF-07 map directly to the two-phase check in REQ-NF-02 and cover partial-failure retry scenarios that are easy to miss.
- **Negative properties protect key product invariants.** PROP-SK-16, PROP-SK-19, PROP-SK-20, and PROP-WT-15 encode the architectural guardrails (single resolver, path-from-state, orchestrator-only promotions, worktree isolation) that the product design depends on.
- **Priority inheritance is correctly applied** throughout; no properties are under-prioritized relative to their source requirements.

---

## Recommendation

**Needs revision.** F-01 (Medium) leaves a core product requirement (REQ-WT-02 normal-lifecycle cleanup) without any automated property, which means the worktree accumulation risk identified in R-06 could silently regress. F-02 (Low) is a formatting fix.

Please address F-01 by adding the missing property and updating the coverage matrix, fix F-02's section numbering, then route back for re-review.
