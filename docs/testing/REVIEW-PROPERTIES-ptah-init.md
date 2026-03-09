# PM Review: PROPERTIES-ptah-init.md

| Field | Detail |
|-------|--------|
| **Reviewed Document** | [PROPERTIES-ptah-init.md](./PROPERTIES-ptah-init.md) |
| **Cross-referenced** | [REQ-PTAH.md](../../requirements/REQ-PTAH.md), [TSPEC-ptah-init.md](../../specifications/TSPEC-ptah-init.md), [Traceability Matrix](../../requirements/traceability-matrix.md) |
| **Date** | March 8, 2026 |
| **Reviewer** | Product Manager |
| **Status** | All questions resolved |

---

## Summary

The properties document is thorough and well-organized. All 9 Phase 1 requirements are covered, the coverage matrix is complete, and the test pyramid distribution is sensible. The document correctly reflects TSPEC Rev 3 changes (`.gitkeep` files, `hasStagedChanges`, 17-file count). However, several questions need resolution before approval.

---

## Questions and Concerns

### Q1: Property IDs are not in sequential section order

**Section:** 3.1 through 3.8

The property IDs don't follow section order. Sections 3.5-3.8 have IDs that interleave:

| Section | Section Order | ID Range |
|---------|--------------|----------|
| 3.1 Functional | 1st | PROP-IN-01 to 09 |
| 3.2 Contract | 2nd | PROP-IN-10 to 11 |
| 3.3 Error Handling | 3rd | PROP-IN-12 to 17 |
| 3.4 Data Integrity | 4th | PROP-IN-18 to 23 |
| 3.5 Integration | 5th | PROP-IN-28 to 31 |
| 3.6 Security | 6th | PROP-IN-32 |
| 3.7 Idempotency | 7th | PROP-IN-24 to 27 |
| 3.8 Observability | 8th | PROP-IN-33 to 36 |

Idempotency (24-27) is placed as section 3.7 but its IDs fall between Data Integrity (18-23) and Integration (28-31). This makes it harder to locate a property by ID — a reader looking for PROP-IN-25 would expect it after section 3.4 but it's in section 3.7.

**Question:** Can the sections be reordered to match the ID sequence (move Idempotency to section 3.5, shifting Integration, Security, and Observability), or should the IDs be renumbered? Either approach would improve readability.

> **Resolution (Test Engineer):** Fixed. Reordered sections to match ID sequence. New section order: 3.1 Functional (01-09), 3.2 Contract (10-11), 3.3 Error Handling (12-17), 3.4 Data Integrity (18-23, plus new 43-44), 3.5 Idempotency (24-27), 3.6 Integration (28, 30-31), 3.7 Performance (45), 3.8 Security (32), 3.9 Observability (33-36). IDs are now monotonically increasing within and across sections (with the exception of new properties 43-45 appended to their respective categories to preserve ID immutability).

---

### Q2: PROP-IN-32 incorrectly states `ANTHROPIC_API_KEY` appears in config

**Section:** 3.6 (Security Properties)

PROP-IN-32 states: *"`ptah.config.json` must contain only env var names (`DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY`), never actual secret values."*

This is inaccurate. Per TSPEC §5.2: *"`ANTHROPIC_API_KEY` is consumed by the Claude Agent SDK from the environment directly — it does not appear in the config file."*

Only `DISCORD_BOT_TOKEN` appears in the config (as the value of `discord.bot_token_env`). `ANTHROPIC_API_KEY` is not referenced anywhere in `ptah.config.json`.

**Question:** Should PROP-IN-32 be corrected to: *"`ptah.config.json` must reference `DISCORD_BOT_TOKEN` only as an env var name (via `bot_token_env` field), never as a literal secret value. `ANTHROPIC_API_KEY` must not appear in the config at all."*?

The companion negative property PROP-IN-39 has the same issue — it says the config must not contain `ANTHROPIC_API_KEY` as a literal value, but the stronger assertion is that `ANTHROPIC_API_KEY` must not appear in the config in any form.

> **Resolution (Test Engineer):** Fixed. Both properties corrected:
> - **PROP-IN-32** now states: `ptah.config.json` must reference `DISCORD_BOT_TOKEN` only as an env var name (via `discord.bot_token_env` field), never as a literal secret value. `ANTHROPIC_API_KEY` must not appear in the config file in any form — it is consumed by the Claude Agent SDK from the environment directly.
> - **PROP-IN-39** now states: `ptah.config.json` must not contain any literal secret values; `ANTHROPIC_API_KEY` must not appear in the config file in any form (not as a key, value, or comment).
>
> This accurately reflects TSPEC §5.2: only `bot_token_env` references `DISCORD_BOT_TOKEN` by env var name; `ANTHROPIC_API_KEY` is entirely absent from the config.

---

### Q3: Missing data integrity property for `open-questions/` file content

**Section:** 3.4 (Data Integrity Properties)

There are specific data integrity properties for:
- `docs/overview.md` content (PROP-IN-18)
- `docs/initial_project/` template files (PROP-IN-19)
- `ptah.config.json` fields (PROP-IN-20)
- `.gitkeep` files (PROP-IN-21)
- Agent log files content (PROP-IN-22)
- Skill placeholder files content (PROP-IN-23)

But there is no data integrity property for `docs/open-questions/pending.md` and `docs/open-questions/resolved.md` content. These files have specific header stubs defined in TSPEC §5.2:
- `pending.md`: `"# Pending Questions\n\n_Questions from agents will be appended here by the Orchestrator._"`
- `resolved.md`: `"# Resolved Questions\n\n_Answered questions are moved here from pending.md by the Orchestrator._"`

PROP-IN-02 covers that these files are *created*, but no property verifies their *content* matches the spec — unlike agent logs (PROP-IN-22) and skills (PROP-IN-23) which have explicit content properties.

**Question:** Should a new property (e.g., PROP-IN-43) be added to verify open-questions file content? This would close the gap and bring open-questions files to the same level of coverage as agent logs and skill placeholders.

> **Resolution (Test Engineer):** Fixed. Added **PROP-IN-43** in Section 3.4 (Data Integrity): `docs/open-questions/pending.md` must contain header `"# Pending Questions"` with stub `"_Questions from agents will be appended here by the Orchestrator._"`, and `docs/open-questions/resolved.md` must contain header `"# Resolved Questions"` with stub `"_Answered questions are moved here from pending.md by the Orchestrator._"`. Coverage matrix updated: REQ-IN-08 now maps to PROP-IN-02, PROP-IN-22, PROP-IN-43.

---

### Q4: No property verifies specific `ptah.config.json` field values

**Section:** 3.4 (Data Integrity Properties)

PROP-IN-20 verifies that `ptah.config.json` contains all required top-level sections (`project`, `agents`, `discord`, `orchestrator`, `git`, `docs`). However, no property verifies specific critical field values, such as:

- `agents.model` is `"claude-sonnet-4-6"` (updated in TSPEC Rev 3 per Q7)
- `agents.active` contains exactly `["pm-agent", "dev-agent", "test-agent"]`
- `orchestrator.max_turns_per_thread` is `10`
- `orchestrator.retry_attempts` is `3`
- `git.commit_prefix` is `"[ptah]"`
- `git.auto_commit` is `true`

These values are specified exactly in the TSPEC and are important for Phase 2+ compatibility (TSPEC §11 integration point #2: "Schema must remain backward-compatible across phases").

**Question:** Should PROP-IN-20 be expanded or supplemented with a property that verifies specific default values, not just structural completeness? Or is structural validation considered sufficient, with value correctness deferred to implementation review?

> **Resolution (Test Engineer):** Fixed. Expanded **PROP-IN-20** to include specific default values inline: `agents.model` = `"claude-sonnet-4-6"`, `agents.active` = `["pm-agent", "dev-agent", "test-agent"]`, `orchestrator.max_turns_per_thread` = `10`, `orchestrator.retry_attempts` = `3`, `git.commit_prefix` = `"[ptah]"`, `git.auto_commit` = `true`. These are the values most critical for Phase 2+ backward compatibility (TSPEC §11 integration point #2). A single expanded property is cleaner than splitting structural and value verification into separate properties.

---

### Q5: PROP-IN-29 classified as Integration but testable at Unit level

**Section:** 3.5 (Integration Properties)

PROP-IN-29 states: *"`ptah.config.json` `agents.skills` paths must match the actual scaffolded skill file paths."*

This property verifies that the config's `agents.skills` entries (e.g., `"./ptah/skills/pm-agent.md"`) correspond to files that actually get created. With `FakeFileSystem`, this can be verified at the unit level — check that every path in the generated config exists in `FakeFileSystem.files` after `execute()`.

**Question:** Should PROP-IN-29 be reclassified as Unit? The current classification as Integration implies it requires real filesystem verification, but the protocol-based test doubles can assert this without OS interaction. This would shift the distribution to 39 Unit / 3 Integration.

> **Resolution (Test Engineer):** Fixed. Reclassified **PROP-IN-29** (now **PROP-IN-44**) as Unit and moved it to Section 3.4 (Data Integrity). The property verifies that every path in `agents.skills` corresponds to a file in `FakeFileSystem.files` after `execute()` — this is a pure data consistency check requiring no real filesystem. Renumbered as PROP-IN-44 to fit the Data Integrity ID range. Integration section now has 3 properties (PROP-IN-28, 30, 31).

---

### Q6: Gap #1 (performance) should be a property, not deferred

**Section:** 7 (Gaps and Recommendations)

Gap #1 acknowledges that TSPEC §9.3 defines a "Performance guard" test category for the 30-second success metric (from REQ-PTAH Section 5), but defers it because "in-memory fakes make this a sub-millisecond operation in unit tests."

The deferral rationale is sound for unit tests, but the properties document should still capture this as a property — properties define *what must be true*, not *how to test it*. The test execution plan can then decide the appropriate test implementation (e.g., a timeout guard on the integration test, or skipping it for unit tests).

**Question:** Should a performance property be added (e.g., `PROP-IN-44: InitCommand.execute() must complete within 30 seconds`) and marked as Integration test level? This captures the requirement without imposing a unit test implementation burden.

> **Resolution (Test Engineer):** Fixed. Added **PROP-IN-45** in new Section 3.7 (Performance Properties): `InitCommand.execute() must complete within 30 seconds`. Classified as Integration test level — unit tests with in-memory fakes will complete in sub-milliseconds and won't meaningfully exercise this, but an integration test against real filesystem/Git can enforce the timeout guard. Gap #1 removed from Section 7.

---

### Q7: Negative property PROP-IN-41 scope could be more precise

**Section:** 4 (Negative Properties)

PROP-IN-41 states: *"InitCommand must not perform any file operations when pre-existing staged changes are detected."*

This is correct but could be more precise. Per TSPEC §6, the staged changes check (step 2) happens *after* the Git repo check (step 1). The property should clarify that "any file operations" means "no `mkdir`, `writeFile`, `git add`, or `git commit` calls" — not just no file writes.

**Question:** Should PROP-IN-41 be refined to: *"InitCommand must not call `fs.mkdir`, `fs.writeFile`, `git.add`, or `git.commit` when `git.hasStagedChanges()` returns true"*? This makes the property more testable — a test can verify zero calls to any of these methods on the fakes.

> **Resolution (Test Engineer):** Fixed. PROP-IN-41 now states: *"InitCommand must not call `fs.mkdir`, `fs.writeFile`, `git.add`, or `git.commit` when `git.hasStagedChanges()` returns true."* This is directly testable — `FakeFileSystem` and `FakeGitClient` can track call counts, and the test asserts zero calls to all four methods.

---

## Non-blocking Observations

1. **Property Summary table (Section 2) counts 36 positive properties.** Verified: 9 + 2 + 6 + 6 + 4 + 1 + 4 + 4 = 36. Plus 6 negative = 42 total. Arithmetic checks out.

2. **Coverage matrix is complete.** Every requirement maps to at least 2 properties. No orphaned properties (every property traces to a requirement or TSPEC section). Well done.

3. **The "out of scope" section correctly excludes Phase 2+ concerns.** This aligns with the TSPEC and requirements scope boundaries.

4. **Gap #2 (CLI entry point routing) is appropriately deferred.** The `bin/ptah.ts` composition root is thin enough that it doesn't warrant a property — an integration test in the execution plan will cover it.

---

## Verdict

**Status: Conditional approval — pending resolution of Q2, Q3, and Q6.**

| Priority | Questions |
|----------|-----------|
| Must fix | Q2 (incorrect ANTHROPIC_API_KEY claim), Q3 (missing open-questions content property) |
| Should fix | Q6 (performance property should be captured) |
| Nice to have | Q1 (section reordering), Q4 (config value verification), Q5 (PROP-IN-29 reclassification), Q7 (PROP-IN-41 precision) |

Q2 is a factual error that could lead to an incorrect test. Q3 is a coverage gap where two files lack content verification that parallel files have. Q6 captures a requirement-level success metric that the properties document should record even if the unit test implementation defers it.

---

*Reviewed by Product Manager on March 8, 2026.*

---

## Engineer Responses (March 8, 2026)

All 7 questions have been resolved. Summary of changes made:

| Question | Resolution | PROPERTIES Changed? |
|----------|-----------|---------------------|
| Q1 | Sections reordered to match ID sequence | Yes (Sections 3.4-3.9 reordered) |
| Q2 | PROP-IN-32 and PROP-IN-39 corrected for ANTHROPIC_API_KEY accuracy | Yes (Sections 3.8, 4) |
| Q3 | Added PROP-IN-43 for open-questions file content | Yes (Section 3.4, coverage matrix) |
| Q4 | Expanded PROP-IN-20 with specific default values | Yes (Section 3.4) |
| Q5 | Reclassified PROP-IN-29 as Unit, renumbered to PROP-IN-44 | Yes (moved from Section 3.6 to 3.4) |
| Q6 | Added PROP-IN-45 as performance property (Integration level) | Yes (new Section 3.7, Gap #1 removed) |
| Q7 | Refined PROP-IN-41 to enumerate prohibited method calls | Yes (Section 4) |

**Property count:** 42 → 44 (+2 new: PROP-IN-43, PROP-IN-45; PROP-IN-29 renumbered to PROP-IN-44)

**Test level distribution:** 40 Unit (91%) / 4 Integration (9%) / 0 E2E

**PROPERTIES status:** v1.1 — all blocking questions (Q2, Q3, Q6) and nice-to-have questions (Q1, Q4, Q5, Q7) resolved. Ready for final approval.

---

*Responses by Test Engineer on March 8, 2026.*

---

## PM Final Review (March 8, 2026)

All 7 engineer resolutions have been verified against PROPERTIES-ptah-init.md v1.1. Results:

| Question | Resolution Verified? | Notes |
|----------|---------------------|-------|
| Q1 (Section ordering) | Yes | Sections 3.1–3.9 now follow monotonically increasing ID sequence. New sections (3.7 Performance, 3.9 Observability) fit cleanly. |
| Q2 (ANTHROPIC_API_KEY error) | Yes | PROP-IN-32 correctly states `ANTHROPIC_API_KEY` must not appear in config in any form. PROP-IN-39 strengthened to match. Aligns with TSPEC §5.2. |
| Q3 (Missing open-questions content) | Yes | PROP-IN-43 added in Section 3.4 with correct header stubs from TSPEC §5.2. Coverage matrix updated — REQ-IN-08 now maps to PROP-IN-02, PROP-IN-22, PROP-IN-43. |
| Q4 (Config value verification) | Yes | PROP-IN-20 expanded with specific default values (`agents.model`, `agents.active`, `orchestrator.max_turns_per_thread`, `orchestrator.retry_attempts`, `git.commit_prefix`, `git.auto_commit`). Matches TSPEC §5.2 config schema. |
| Q5 (PROP-IN-29 reclassification) | Yes | Renumbered to PROP-IN-44, moved to Section 3.4 (Data Integrity), reclassified as Unit. Correct — `FakeFileSystem` path consistency check requires no real filesystem. |
| Q6 (Performance property) | Yes | PROP-IN-45 added in new Section 3.7 (Performance). Classified as Integration — appropriate since unit tests with in-memory fakes won't meaningfully exercise the 30-second bound. Gap #1 removed. |
| Q7 (PROP-IN-41 precision) | Yes | Now enumerates prohibited methods: `fs.mkdir`, `fs.writeFile`, `git.add`, `git.commit`. Directly testable via call-count assertions on fakes. |

### Verification Summary

| Metric | Before (v1.0) | After (v1.1) | Status |
|--------|---------------|--------------|--------|
| Total properties | 42 | 44 | +2 (PROP-IN-43, PROP-IN-45) |
| Unit tests | 38 | 40 | +2 (PROP-IN-43 Unit, PROP-IN-44 reclassified) |
| Integration tests | 4 | 4 | Unchanged (PROP-IN-45 added, PROP-IN-29 removed) |
| Factual errors | 1 (Q2) | 0 | Fixed |
| Coverage gaps | 1 (Q3) | 0 | Closed |
| Deferred properties | 1 (Q6) | 0 | Captured |

### Cross-Reference Check

- **REQ-PTAH.md:** All 9 Phase 1 requirements (REQ-IN-01 through REQ-IN-08, REQ-NF-06) covered in the coverage matrix.
- **TSPEC-ptah-init.md (Rev 3):** Properties align with TSPEC changes — `.gitkeep` files (PROP-IN-21), `hasStagedChanges` (PROP-IN-13/41), 17-file count (PROP-IN-09), `claude-sonnet-4-6` model (PROP-IN-20).
- **Traceability matrix:** No orphaned properties — every property traces to a requirement or TSPEC section.

### Decision

**Status: Approved.**

PROPERTIES-ptah-init.md v1.1 is approved for use in test execution planning. All blocking issues (Q2 factual error, Q3 coverage gap, Q6 deferred property) and nice-to-have improvements (Q1, Q4, Q5, Q7) have been satisfactorily resolved. The document provides complete, accurate, and testable property coverage for all 9 Phase 1 `ptah init` requirements.

---

*Final review by Product Manager on March 8, 2026.*
