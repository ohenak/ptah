# PM Review: TSPEC-maes-init.md

| Field | Detail |
|-------|--------|
| **Reviewed Document** | [TSPEC-maes-init.md](./TSPEC-maes-init.md) |
| **Cross-referenced** | [REQ-MAES.md](../requirements/REQ-MAES.md), [ANALYSIS-maes-init.md](./ANALYSIS-maes-init.md), [Traceability Matrix](../requirements/traceability-matrix.md) |
| **Date** | March 8, 2026 |
| **Reviewer** | Product Manager |
| **Status** | All questions resolved |

---

## Summary

The TSPEC is well-structured, clearly written, and demonstrates strong traceability back to requirements. The dependency-injected architecture with protocol-based testing is sound. However, several questions and concerns need resolution before approval.

---

## Questions and Concerns

### Q1: File count discrepancy in test strategy

**Section:** 9.3 (Test Categories)

The test table states "All 15 files created with correct content," but counting the files in Section 5.2 yields **14 files**:

| # | File |
|---|------|
| 1 | `docs/overview.md` |
| 2 | `docs/initial_project/requirements.md` |
| 3 | `docs/initial_project/specifications.md` |
| 4 | `docs/initial_project/plans.md` |
| 5 | `docs/initial_project/properties.md` |
| 6 | `docs/agent-logs/pm-agent.md` |
| 7 | `docs/agent-logs/dev-agent.md` |
| 8 | `docs/agent-logs/test-agent.md` |
| 9 | `docs/open-questions/pending.md` |
| 10 | `docs/open-questions/resolved.md` |
| 11 | `maes/skills/pm-agent.md` |
| 12 | `maes/skills/dev-agent.md` |
| 13 | `maes/skills/test-agent.md` |
| 14 | `maes.config.json` |

**Question:** Is the count of 15 a typo, or is there a file I'm not seeing?

> **Resolution (Backend Engineer):** Fixed. The original count of 15 was incorrect. After adding 3 `.gitkeep` files for empty directories (see Q2), the correct total is **17 files** (14 content files + 3 `.gitkeep` files). Section 9.3 updated to reflect the correct count.

---

### Q2: Empty `maes/templates/` directory cannot be tracked by Git

**Section:** 5.1 (Directories)

The TSPEC creates `maes/templates/` as an empty directory. Git does not track empty directories — only files. After the `git add` + `git commit` step, this directory would not appear in the commit. On a fresh `git clone`, the directory would be missing.

**Question:** Should a `.gitkeep` placeholder file be added to `maes/templates/`? If so, this would bring the file count to 15 (resolving Q1 as well). Similarly, do any other empty directories in the manifest (e.g., `docs/architecture/decisions/`, `docs/architecture/diagrams/`) need `.gitkeep` files?

> **Resolution (Backend Engineer):** Fixed. Added `.gitkeep` files to all three empty directories: `docs/architecture/decisions/.gitkeep`, `docs/architecture/diagrams/.gitkeep`, and `maes/templates/.gitkeep`. Section 5.1 updated with explicit empty directory handling note. File count corrected to 17 (resolves Q1).

---

### Q3: `docs/overview.md` template adds a section not in the requirement

**Section:** 5.2 (`docs/overview.md` content)

REQ-IN-03 acceptance criteria specifies sections for "project goals, stakeholders, and scope." The TSPEC template adds a fourth section: `## Technical Context`. This was justified in the Analysis (Q5) as being useful since `overview.md` is loaded in every Context Bundle.

**Question:** This is a reasonable addition, but the requirement should be updated to match. Should REQ-IN-03 acceptance criteria be amended to include "technical context" to maintain traceability integrity? As-is, a strict tester could flag the extra section as out-of-spec.

> **Resolution (Backend Engineer):** Agreed — REQ-IN-03 acceptance criteria should be amended to include "technical context" as a fourth section. This is a PM action item. The addition was justified in Analysis Q5: `overview.md` is loaded in every Context Bundle (Layer 1), so including technical context eliminates a separate lookup for key technical decisions. **Action for PM:** Update REQ-IN-03 acceptance criteria from "sections for project goals, stakeholders, and scope" to "sections for project goals, stakeholders, scope, and technical context."

---

### Q4: `hasChanges()` method is defined but never used

**Section:** 4.2 (Protocols) vs. Section 6 (Algorithm)

The `GitClient` interface defines `hasChanges(): Promise<boolean>` but the init algorithm in Section 6 never calls it. The commit-skip logic relies on `created[].length === 0` instead.

**Question:** Is `hasChanges()` intended for future use, or should the algorithm use it as a guard before committing (e.g., to handle edge cases where files are created but `git add` fails silently)? If it's purely forward-looking, consider removing it to avoid dead code in Phase 1 — it can be added when needed.

> **Resolution (Backend Engineer):** Fixed. Repurposed `hasChanges()` as `hasStagedChanges()` and integrated it into the algorithm. It now serves as a pre-flight check (Algorithm step 2) to detect pre-existing staged changes before scaffolding begins. This also resolves Q5. The method is no longer dead code — it's essential to preventing dirty commits.

---

### Q5: Staged changes in dirty working tree

**Section:** 6 (Init Command Algorithm)

The algorithm checks `git.isRepo()` but does not check for pre-existing staged changes. If the user has already staged files before running `maes init`, the `git.add(created)` + `git.commit(...)` step would commit the MAES scaffolding **plus** the user's unrelated staged changes under the `[MAES] init` commit message.

**Question:** Should the algorithm check for pre-existing staged changes and either (a) warn the user, (b) stash them, or (c) document this as a known limitation? This seems like it could cause confusion and pollute the init commit.

> **Resolution (Backend Engineer):** Fixed. Added Algorithm step 2: check `git.hasStagedChanges()` before any file operations. If staged changes are detected, the command exits with error: "Staged changes detected. Please commit or stash them before running 'maes init'." This is option (a) — warn and exit. We chose hard exit over stash because stashing is a destructive side effect that users may not expect from an init command.

---

### Q6: Traceability matrix not updated

**Section:** N/A (cross-document concern)

The [traceability matrix](../requirements/traceability-matrix.md) still shows "Pending Spec" for all REQ-IN-* and REQ-NF-06 entries. Now that TSPEC-maes-init.md exists, the matrix should be updated to reference it.

**Action required:** Update the Specification column for REQ-IN-01 through REQ-IN-08 and REQ-NF-06 to reference `TSPEC-maes-init`.

> **Resolution (Backend Engineer):** Done. Updated [traceability-matrix.md](../requirements/traceability-matrix.md) v1.3: all 9 Phase 1 requirements (REQ-IN-01 through REQ-IN-08, REQ-NF-06) now reference TSPEC-maes-init. Coverage counts updated: US-01 fully specified (9/9), 45 of 54 requirements remain pending (Phases 2-7).

---

### Q7: Config model version may be outdated

**Section:** 5.2 (`maes.config.json` content)

The config defaults to `"model": "claude-sonnet-4-20250514"`. The latest Claude Sonnet model is `claude-sonnet-4-6` (4.6). While the model field is user-editable, shipping a default that references an older model could confuse users or result in suboptimal performance out of the box.

**Question:** Should the default model be updated to the latest available (`claude-sonnet-4-6`), or is the pinned version intentional for stability?

> **Resolution (Backend Engineer):** Fixed. Updated default model from `claude-sonnet-4-20250514` to `claude-sonnet-4-6` in the TSPEC config template. Users should get the best available model out of the box. The field remains user-editable for those who prefer to pin a specific version.

---

### Q8: Naming collision acknowledged but not resolved

**Section:** 3 (Project Structure)

The TSPEC acknowledges that the MAES source code package (`maes/` at repo root) and the scaffolded `maes/` runtime directory (created by `maes init` inside target repos) share the same name. It states "this is acceptable" because the scaffolded files don't conflict with source code.

**Concern:** When a developer runs `maes init` inside the MAES source repo itself (e.g., for local testing), the scaffolded `maes/skills/` and `maes/templates/` directories would be created alongside `maes/src/`, `maes/bin/`, etc. This is technically non-conflicting but could be confusing. More importantly:

- Will the MAES repo's own `.gitignore` need to exclude the scaffolded files?
- Could a contributor accidentally commit scaffolded test artifacts into the MAES source repo?

**Question:** Is this worth addressing now (e.g., by using a different directory name for the scaffolded runtime like `.maes/` or `_maes/`), or is the documented acknowledgment sufficient?

> **Resolution (Backend Engineer):** The documented acknowledgment is sufficient for Phase 1. Rationale: (1) The naming collision only affects MAES developers running `maes init` inside the MAES source repo — not end users. (2) The scaffolded files (`maes/skills/*.md`, `maes/templates/.gitkeep`) do not conflict with source files (`maes/src/`, `maes/bin/`). (3) Renaming to `.maes/` or `_maes/` would break the convention established in the PRD config paths and require cascading changes. (4) For MAES repo development, the test suite uses in-memory fakes — `maes init` is never actually run inside the source repo. If this becomes a practical issue during development, the MAES repo's `.gitignore` can exclude `maes/skills/` and `maes/templates/` — but this is a dev workflow concern, not a product design issue.

---

### Q9: No `.gitignore` scaffolding for Phase 2+ concerns

**Section:** 5 (File Manifest)

The init command scaffolds project structure but does not create a `.gitignore` file. When Phase 2+ adds `node_modules/`, `.env` files, and other build artifacts to the target repo, there will be no `.gitignore` to protect against accidental commits.

**Question:** Should `maes init` scaffold a basic `.gitignore` (covering `node_modules/`, `.env`, `dist/`, etc.)? Or is this considered the user's responsibility since `maes init` targets existing repos that may already have their own `.gitignore`?

> **Resolution (Backend Engineer):** No `.gitignore` scaffolding in Phase 1. Rationale: (1) `maes init` targets **existing repos** that typically already have their own `.gitignore`. Adding one could conflict with or duplicate the user's existing file. (2) The skip-existing-files logic (REQ-IN-05) would prevent overwriting an existing `.gitignore`, but appending to it is out of scope. (3) Phase 1 creates only markdown files and JSON — no `node_modules/`, `.env`, or build artifacts. The `.gitignore` need arises in Phase 2 when the MAES Orchestrator is installed as an npm dependency in the target repo. (4) Phase 2 planning should address this — likely as part of the `maes start` setup or documented in a getting-started guide.

---

### Q10: FSPEC phase skipped — confirm this is acceptable

**Section:** Analysis Q1 resolution

The Analysis document resolved that Phase 1 (`maes init`) can skip the Functional Specification (FSPEC) phase and go directly from requirements to technical specification. The rationale is sound — `maes init` is a straightforward CLI scaffolding command with well-defined acceptance criteria.

**Confirmation needed:** I agree with this decision for Phase 1 scope. However, I want to confirm that Phase 2+ features (Orchestrator, Discord coordination, context assembly) **will** go through the full PDLC including FSPEC. These features involve complex user workflows and agent interactions that require functional specification before technical design.

> **Resolution (Backend Engineer):** Confirmed. Phase 2+ features will follow the full PDLC: Requirements → Functional Specification (FSPEC) → Technical Specification (TSPEC) → Planning → TDD Implementation → Verification. The FSPEC skip was explicitly scoped to Phase 1 only, as noted in Analysis Q1 resolution: "Phase 2+ features with more complex user workflows will require FSPECs." Features like the Orchestrator, Discord coordination, context assembly, and review loops involve complex agent interactions, state management, and user workflows that absolutely require functional specification before technical design.

---

## Non-blocking Observations

These are not blockers but worth noting:

1. **Test strategy is unit-only.** No integration or end-to-end tests are specified. For Phase 1 this is fine given the protocol-based architecture, but Phase 2+ will need integration tests for Discord and Git interactions.

2. **No CI/CD specification.** The TSPEC doesn't mention CI pipeline setup (e.g., running `vitest` on PR). This is likely out of scope for Phase 1 but should be considered early in Phase 2.

3. **`tsx` for dev, `tsc` for production.** The dev/prod split is standard but the TSPEC doesn't specify how users will install and run `maes` — `npx`, global install, or something else. This may belong in Phase 2 planning.

---

## Verdict

**Status: Conditional approval — pending resolution of Q1-Q5.**

- Q1 and Q2 are likely related (file count + .gitkeep) and should be easy to resolve
- Q3 is a minor traceability fix
- Q4 is a design hygiene question
- Q5 (dirty working tree) is the most significant concern from a user-experience perspective
- Q6 is a required housekeeping update
- Q7-Q10 can be deferred or documented as known limitations

---

*Reviewed by Product Manager on March 8, 2026.*

---

## Engineer Responses (March 8, 2026)

All 10 questions have been resolved. Summary of changes made:

| Question | Resolution | TSPEC Changed? | Other Documents Changed? |
|----------|-----------|----------------|--------------------------|
| Q1 | File count corrected to 17 (14 content + 3 `.gitkeep`) | Yes (Section 9.3) | — |
| Q2 | Added `.gitkeep` to 3 empty directories | Yes (Section 5.1, 5.2) | — |
| Q3 | Recommend PM update REQ-IN-03 to include "technical context" | No (TSPEC already includes it) | **PM action needed:** REQ-MAES.md |
| Q4 | `hasChanges()` → `hasStagedChanges()`, integrated into algorithm | Yes (Section 4.2, 6, 7.2) | — |
| Q5 | Added staged changes pre-flight check (exit with error) | Yes (Section 6, step 2) | — |
| Q6 | Traceability matrix updated with TSPEC-maes-init references | No | traceability-matrix.md v1.3 |
| Q7 | Default model updated to `claude-sonnet-4-6` | Yes (Section 5.2) | — |
| Q8 | Documented acknowledgment sufficient; no rename needed | No | — |
| Q9 | No `.gitignore` in Phase 1; deferred to Phase 2 | No | — |
| Q10 | Confirmed: Phase 2+ will use full PDLC with FSPEC | No | — |

**Remaining PM action item:** ~~Update REQ-IN-03 acceptance criteria to include "technical context" (Q3).~~ **Done** — REQ-IN-03 updated in REQ-MAES.md v1.4.

**TSPEC status:** Rev 3 — all blocking questions (Q1-Q5) resolved. Ready for final approval pending Q3 requirement update.

---

*Responses by Backend Engineer on March 8, 2026.*

---

## PM Final Review (March 8, 2026)

### Verification of Engineer Resolutions

| Question | Resolution Verified? | Notes |
|----------|---------------------|-------|
| Q1 | Yes | File count in TSPEC Section 9.3 now correctly states 17 (14 content + 3 `.gitkeep`) |
| Q2 | Yes | `.gitkeep` files added to Section 5.2 for all 3 empty directories. Empty directory handling note added to Section 5.1 |
| Q3 | Yes | REQ-IN-03 acceptance criteria updated by PM to include "technical context." TSPEC and requirement are now aligned |
| Q4 | Yes | `hasChanges()` renamed to `hasStagedChanges()` in Sections 4.2, 6, 7.2, and 9.2. No dead code remains |
| Q5 | Yes | Algorithm step 2 adds staged changes pre-flight check. Error handling table (Section 8) includes the new scenario. Test categories (Section 9.3) include "Staged changes guard" |
| Q6 | Yes | Traceability matrix v1.3 updated — all 9 Phase 1 requirements reference TSPEC-maes-init. Coverage counts correct (US-01: 9/9 specified, 45/54 remaining) |
| Q7 | Yes | Default model updated to `claude-sonnet-4-6` in Section 5.2 config template |
| Q8 | Yes | Accepted — documented acknowledgment is sufficient. No product design issue for end users |
| Q9 | Yes | Accepted — deferred to Phase 2. Correct that `maes init` targets existing repos |
| Q10 | Yes | Confirmed — Phase 2+ will follow full PDLC including FSPEC |

### Internal Consistency Check

- Section 5.2 lists 17 files (14 content + 3 `.gitkeep`). Section 9.3 says 17. **Consistent.**
- Algorithm has 7 steps (1: isRepo, 2: hasStagedChanges, 3: build manifest, 4: create files, 5: print, 6: no-op exit, 7: commit). **Consistent with protocol interfaces.**
- `GitClient` interface has 4 methods (isRepo, hasStagedChanges, add, commit). All 4 are used in the algorithm. **No dead code.**
- Error handling table covers 6 scenarios including the new "Pre-existing staged changes." **Complete.**
- Requirement mapping (Section 10) covers all 9 requirements. **Complete.**
- Traceability matrix references match TSPEC document. **Consistent.**

### Verdict

**Approved.** The TSPEC-maes-init.md (Rev 3) is approved for engineering handoff.

All 10 review questions have been resolved. The TSPEC is internally consistent, fully traceable to requirements, and addresses the key UX concern (Q5: dirty working tree). The remaining PM action item (Q3: REQ-IN-03 update) has been completed.

The TSPEC may proceed to Planning (Phase 3) and TDD implementation.

---

*Final approval by Product Manager on March 8, 2026.*
