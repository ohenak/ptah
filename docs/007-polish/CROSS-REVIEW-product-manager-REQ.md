# Cross-Review: Product Manager — REQ (007-REQ-polish.md)

| Field | Detail |
|-------|--------|
| **Reviewer** | Product Manager (self-review on REQ is prohibited — this is a structured gap/quality analysis, not a self-approval) |
| **Document Reviewed** | `docs/007-polish/007-REQ-polish.md` |
| **Review Date** | March 16, 2026 |
| **Recommendation** | **Needs revision** |

---

## Summary

The REQ document covers two requirements (REQ-DI-06, REQ-NF-08) but the `overview.md` for this feature describes five distinct areas of work: *logging, observability, Discord embed formatting, error message UX, and documentation cleanup*. None of those five areas have requirements in this document. Additionally, acceptance criteria formatting is non-compliant with the project standard in both requirements.

---

## Findings

### F-01 — [HIGH] Scope mismatch between overview.md and REQ document

**Affected:** Entire document (§1 Purpose, §3, §4)

The `overview.md` defines Phase 7 as:
> "Final refinements including **logging**, **observability**, **Discord embed formatting**, **error message UX**, and **documentation cleanup** before production readiness."

The REQ document's Purpose section redefines Phase 7 scope as:
> "Phase 7 delivers quality-of-life improvements: **automatic thread archiving on resolution** and **zero-code-change agent extensibility**."

These are five different work areas vs. two completely different ones. The REQ document does not contain a single requirement for logging, observability, Discord embed formatting, error message UX, or documentation cleanup.

**Required action:** Either (a) update the REQ document to cover the five areas described in `overview.md`, or (b) update `overview.md` to reflect that scope was intentionally narrowed to thread archiving + extensibility, with a clear explanation of why the other five areas were deferred or dropped.

---

### F-02 — [HIGH] Acceptance criteria for REQ-DI-06 is non-compliant with format standard

**Affected:** §3.1 REQ-DI-06

The acceptance criteria is collapsed onto a single line:
> "WHO: As the Orchestrator GIVEN: A Skill response contains a resolution signal WHEN: I process the response THEN: The originating thread is archived"

Two issues:
1. **Format:** Must use the structured multi-line WHO / GIVEN / WHEN / THEN format as defined in the PM skill Quality Checklist.
2. **WHO persona:** "As the Orchestrator" is the system, not a user role or persona. The WHO must describe a human user or developer who derives value from this behavior (e.g., "As a developer using Ptah"). The observable benefit should be stated from the user's perspective (e.g., resolved threads are archived and no longer clutter active channels).

**Required action:** Rewrite acceptance criteria in the correct multi-line format with a human WHO persona.

---

### F-03 — [MEDIUM] Acceptance criteria for REQ-NF-08 is non-compliant with format standard

**Affected:** §4 Non-Functional Requirements

The acceptance criteria field contains a single sentence:
> "A fourth agent can be added with zero code changes to the Orchestrator"

This is a verification statement, not a structured acceptance criterion. It is missing WHO, GIVEN, WHEN, and THEN.

**Required action:** Rewrite in the standard WHO / GIVEN / WHEN / THEN format. Example:
```
WHO:   As a developer extending Ptah
GIVEN: A new Skill definition and a new agent-logs/*.md file exist
WHEN:  I add a config entry to ptah.config.json and run ptah start
THEN:  The new agent is registered and receives invocations with no changes to Orchestrator source code
```

---

### F-04 — [MEDIUM] Missing requirements for five scope areas listed in overview.md

**Affected:** §3 Functional Requirements, §4 Non-Functional Requirements

If the overview scope is correct, the following areas have no requirements at all:
- **Logging** — no requirement for improved log verbosity, structured logging, or log-level configuration
- **Observability** — no requirement for metrics, health checks, or activity visibility (partially overlaps [US-05])
- **Discord embed formatting** — no requirement for standardized embed structure, color coding, or field layout
- **Error message UX** — no requirement for user-facing error copy, embed formatting on failures, or debug channel messages (partially overlaps [US-07])
- **Documentation cleanup** — no requirement for doc accuracy, template updates, or README corrections

**Required action:** If these areas are in scope for Phase 7, add requirements for each. If they were deliberately deferred, document them as out-of-scope with a brief rationale, and update `overview.md` to reflect the actual scope.

---

### F-05 — [LOW] US-05 and US-07 not referenced despite relevance

**Affected:** §2 Related User Stories

If logging, observability, and error message UX requirements are added per F-04:
- **[US-05]** (Developer Launches and Monitors the Orchestrator) is directly relevant to logging/observability improvements
- **[US-07]** (System Handles Failures Gracefully) is directly relevant to error message UX

The current related user stories table only references US-02 and US-08.

**Required action:** Add US-05 and/or US-07 if corresponding requirements are introduced.

---

## Clarification Questions

### Q-01 — Was Phase 7 scope intentionally narrowed?

The overview and REQ document describe completely different work. Was Phase 7 scope deliberately changed from the five areas in `overview.md` to thread archiving + extensibility? If so, who made this decision and when?

### Q-02 — Where do logging and observability improvements live if not here?

If the five areas from `overview.md` (logging, observability, embed formatting, error UX, docs cleanup) were deferred, which phase or feature owns them? Are they tracked anywhere in the backlog?

---

## Positive Observations

- The document structure follows the phase-REQ template correctly with a clean summary table and change log.
- REQ-DI-06 correctly identifies the dependency chain ([REQ-DI-01], [REQ-SI-05]).
- REQ-NF-08 correctly cross-references [REQ-IN-04] from Phase 1, showing architectural consistency.
- Both requirements are correctly scoped as P1 (nice-to-have quality improvements, not blocking core functionality).
- The risks section is appropriately brief for a polish phase.

---

## Recommendation

**Needs revision.**

The primary issue is the scope mismatch (F-01 / F-04) — the REQ document and `overview.md` are describing different things. This needs to be resolved before moving to FSPEC or TSPEC. The acceptance criteria formatting issues (F-02, F-03) are straightforward to fix once scope is confirmed.
