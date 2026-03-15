# Cross-Review: Test Engineer → FSPEC

## PDLC Auto-Initialization (013)

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | `013-FSPEC-pdlc-auto-init.md` (v1.0, Draft) |
| **Date** | March 15, 2026 |
| **Recommendation** | **Approved with minor changes** |

---

## Summary

The FSPEC is well-structured and covers three distinct behavioral areas — auto-initialization decision flow (FSPEC-PI-01), age guard evaluation (FSPEC-BC-01), and keyword parsing (FSPEC-DC-01) — with clear business rules, edge case tables, and acceptance tests in proper WHO/GIVEN/WHEN/THEN format. The behavioral specifications are rich enough for an engineer to implement and for a test engineer to write comprehensive unit and integration tests without further clarification.

Two medium-severity gaps in the acceptance tests and one ambiguity around "initial message" identification should be addressed before the TSPEC is authored — they would otherwise create silent implementation ambiguity that surfaces during code review.

---

## Findings

### F-01 — **Medium** — Age Guard ATs do not verify the required debug log (REQ-BC-02)

**Location:** FSPEC-BC-01 — Acceptance Tests (AT-BC-03, AT-BC-04)

AT-BC-03 (`2 prior turns → not eligible`) and AT-BC-04 (`5 prior turns → not eligible`) verify the eligibility decision, but AT-BC-04 is the only one that checks the log message — and it does so inline in the THEN clause for the scenario with 5 turns. AT-BC-03 makes no mention of logging at all.

`REQ-BC-02` requires the debug log for **all** cases where the age guard returns not eligible. The FSPEC should explicitly include the log assertion in every "not eligible" AT, or add a dedicated AT that verifies the log format for the boundary case (2 prior turns). As-is, a test engineer writing tests against AT-BC-03 would produce a test that passes without verifying the log — leaving REQ-BC-02 uncovered at the boundary.

**Recommendation:** Add `AND: a debug-level log message is emitted matching \`[ptah] Skipping PDLC auto-init for "{featureSlug}" — thread has 2 prior turns (threshold: 1)\`` to AT-BC-03's THEN clause.

---

### F-02 — **Medium** — "Initial message" identification is undefined at the FSPEC level

**Location:** FSPEC-PI-01 (Input section) and FSPEC-DC-01 (BR-DC-06, Description)

FSPEC-DC-01 states keyword parsing applies to "the initial message — the first user message in the thread." FSPEC-PI-01 lists "Initial message text (the first message in the thread)" as an input. These two descriptions are slightly inconsistent (`first user message` vs `first message`), and neither specifies **how the orchestrator identifies the initial message** from the conversation history it already holds.

If the conversation history can contain messages with role `"system"` or `"tool"` before the first user message (common in Discord bot architectures where the thread-creation event is logged), then "first message" ≠ "first user-role message." An engineer resolving this ambiguity independently could implement it either way, producing subtly different behavior.

**Recommendation:** Add a single sentence to FSPEC-PI-01's Input section and FSPEC-DC-01's Description clarifying: *"The initial message is the first chronological message in the conversation history with role `'user'`."* This removes implementation ambiguity without requiring a behavioral change.

---

### F-03 — **Low** — AT-DC-07 only tests one direction of keyword conflict; the reverse case is unspecified

**Location:** FSPEC-DC-01 — AT-DC-07

AT-DC-07 tests `[backend-only] [fullstack]` → `discipline = "fullstack"` (last wins). The reverse ordering `[fullstack] [backend-only]` → `discipline = "backend-only"` is implied by BR-DC-02 but has no corresponding acceptance test. Without the reverse-order test, an implementation that hard-codes preference for `fullstack` over `backend-only` regardless of position would pass AT-DC-07 but violate BR-DC-02.

**Recommendation:** Add AT-DC-09: `[fullstack] [backend-only]` → `{ discipline: "backend-only", skipFspec: false }` to confirm that "last wins" is position-based, not keyword-based.

---

### F-04 — **Low** — AT-PI-01 omits the resulting `FeatureConfig` from the THEN clause

**Location:** FSPEC-PI-01 — AT-PI-01

AT-PI-01 verifies that a state record is created at `REQ_CREATION` and the LGTM is processed through the managed path. It does not assert the `FeatureConfig` embedded in the created state record. Since `initializeFeature()` is called with the parsed config, verifying that the state record was created with `{ discipline: "backend-only", skipFspec: false }` (the default — given no keywords in the trigger message) would make this test fully end-to-end across FSPEC-PI-01 and REQ-PI-02.

This is a low-severity gap because REQ-PI-02 has its own AC, but combining the assertions in AT-PI-01 would catch the integration failure where config is parsed incorrectly before being passed to `initializeFeature()`.

**Recommendation (optional):** Append to AT-PI-01's THEN clause: `AND: the created state record has config \`{ discipline: "backend-only", skipFspec: false }\``.

---

### F-05 — **Low** — Edge case for `initializeFeature()` race condition result is underspecified for the second caller

**Location:** FSPEC-PI-01 — Edge Cases (race condition row)

The edge case says: *"The second call detects the record and returns without modifying it. The current signal is still processed through the managed path."* This is correct for the behavior, but it doesn't specify what `initializeFeature()` **returns** in this case — does it return void, return a status indicator, or throw a specific error that the orchestrator must catch and treat as non-fatal?

The TSPEC will need to make this decision, but since FSPEC-PI-01 defines the behavioral contract, the FSPEC could specify the observable outcome more precisely: *"The second call resolves without error (it does not throw). The orchestrator treats this as a successful no-op and proceeds to the managed path."*

**Recommendation:** Add one sentence to the race condition edge case row clarifying that the second `initializeFeature()` call resolves without error (i.e., it does not throw; the orchestrator need not handle an exception for this case).

---

## Clarification Questions

### Q-01 — Does the orchestrator ever post messages to the **feature thread** itself (not the debug channel)?

**Location:** FSPEC-BC-01 — Definition of "Agent Turn"

The age guard counts assistant-role messages in the conversation history. `REQ-PI-04` posts a notification to the **debug channel** (a different channel), so orchestrator notifications don't appear in the feature thread. But if the orchestrator ever posts any message directly to the feature thread (e.g., an error notification, an "initializing…" indicator), that message would be counted as an agent turn.

If the answer is "the orchestrator never posts to the feature thread — only agents do," then the age guard definition is clean and this question is resolved. If the orchestrator does post to the feature thread in some scenarios, BR-BC-01 should explicitly exclude orchestrator-generated messages from the turn count.

---

### Q-02 — What is the scope of `[skip-fspec]` interaction with Feature 011's phase transitions?

**Location:** FSPEC-PI-01 — BR-PI-04; REQ-DC-02

`REQ-DC-02` and FSPEC-DC-01 define how `skipFspec: true` is set in `FeatureConfig`. Feature 011 defined how the PDLC state machine uses `skipFspec` during phase transitions. However, this FSPEC doesn't confirm that the Feature 011 implementation already handles `skipFspec` at runtime — it only defines how the flag gets into the config.

Is the FSPEC explicitly **out of scope** for verifying that the phase-skip behavior works end-to-end? If so, confirming this in the scope boundaries would prevent test engineers from expecting coverage of the phase-skip behavior in Feature 013's test suite.

---

## Positive Observations

- **"Why 1" section in FSPEC-BC-01 is excellent.** Explaining the threshold rationale (0 turns = clear new, 1 turn = first interaction, 2+ turns = established) makes the business rule defensible and testable. Engineers can write property-based tests against this reasoning without guessing at intent.

- **Fail-open design for malformed history** is explicit and well-justified. The FSPEC states the conscious tradeoff ("better to auto-initialize incorrectly … than to block a new feature"), which removes ambiguity about whether this is a bug or a feature.

- **BR-DC-01 through BR-DC-06 are comprehensive and implementation-ready.** Case-sensitivity, last-keyword-wins, orthogonality of `skip-fspec`, empty message handling, and single-message scope are all precisely specified. A test engineer can derive a complete property set directly from these rules.

- **Error scenarios distinguish non-fatal from fatal failures.** FSPEC-PI-01 correctly classifies `initializeFeature()` filesystem failures as fatal (halt the loop) while debug channel notification failures are non-fatal (log and continue). This prevents over-testing of error propagation paths.

- **Acceptance test coverage is extensive.** 17 acceptance tests across 3 FSPECs, all in correct WHO/GIVEN/WHEN/THEN format. Each AT maps to at least one business rule or requirement.

---

## Recommendation

**Approved with minor changes.**

The FSPEC is sound and testable. Address F-01 (add log assertion to AT-BC-03) and F-02 (clarify "initial message" definition) before the TSPEC is authored — these are the two items that could cause silent implementation divergence. F-03 through F-05 can be addressed at the PM's discretion; they improve test completeness but are not blocking.

Q-01 can be resolved with a one-sentence clarification. Q-02 is a scoping confirmation that does not require a behavioral change.

The PM may proceed to TSPEC authoring after addressing F-01 and F-02.

---

*Reviewed by Test Engineer (`qa`) · March 15, 2026*
