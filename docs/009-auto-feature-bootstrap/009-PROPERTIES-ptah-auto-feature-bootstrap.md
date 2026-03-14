# Test Properties Document

## Phase 9 — Auto Feature Bootstrap

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-009-auto-feature-bootstrap |
| **Requirements** | [009-REQ-PTAH-auto-feature-bootstrap](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| **Functional Specification** | [009-FSPEC-ptah-auto-feature-bootstrap](./009-FSPEC-ptah-auto-feature-bootstrap.md) |
| **Technical Specification** | [009-TSPEC-ptah-auto-feature-bootstrap](./009-TSPEC-ptah-auto-feature-bootstrap.md) |
| **Execution Plan** | [009-PLAN-TSPEC-ptah-auto-feature-bootstrap](./009-PLAN-TSPEC-ptah-auto-feature-bootstrap.md) |
| **Version** | 1.0 |
| **Date** | March 14, 2026 |
| **Author** | Test Engineer |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Overview

Phase 9 adds a **Phase 0: Feature Folder Bootstrap** step to the PM skill's `SKILL.md`. When the PM skill is invoked on a thread with no pre-existing feature folder, it automatically creates `docs/{NNN}-{feature-slug}/` and writes a synthesized `overview.md` — before proceeding to task selection. Subsequent invocations skip Phase 0 entirely (idempotent). One TypeScript contract test is added to `context-assembler.test.ts` to lock down the `extractFeatureName()` behavior that Phase 0 depends on.

This properties document covers all testable invariants of the Phase 0 algorithm, the slugification rules, NNN assignment logic, file-write correctness, error handling, idempotency guarantees, and the `extractFeatureName()` contract alignment.

### 1.1 Scope

**In scope:**
- PM skill Phase 0 bootstrap behavior (all 9 steps in FSPEC-AF-01 §3.4)
- Slugification algorithm correctness (5 normalization rules)
- NNN prefix determination (numbered vs. unnumbered thread paths)
- Feature folder creation and `overview.md` synthesis
- Error handling for filesystem failures and missing `docs/` directory
- Idempotency on repeat invocations and race conditions
- `extractFeatureName()` contract alignment (AF-R1 Vitest test)
- Artifact commit pipeline integration for Phase 0 output files

**Out of scope:**
- PM skill Phase 1–4 behavior (not part of Phase 9)
- Changes to `context-assembler.ts` source (explicitly deferred per AF-R8)
- Full slugification support in the context assembler (known limitation)
- `ptah init` scaffolding (separate phase)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 8 (REQ-AF-01 through REQ-AF-07, REQ-AF-NF-01) | [009-REQ-PTAH-auto-feature-bootstrap](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| Specifications analyzed | 1 (FSPEC-AF-01 with 8 business rules, 12 ATs) | [009-FSPEC-ptah-auto-feature-bootstrap](./009-FSPEC-ptah-auto-feature-bootstrap.md) |
| Plan tasks reviewed | 2 (A-1 contract test, B-1 SKILL.md insertion) | [009-PLAN-TSPEC-ptah-auto-feature-bootstrap](./009-PLAN-TSPEC-ptah-auto-feature-bootstrap.md) |
| Integration boundaries identified | 3 (context-assembler, artifact commit pipeline, ClaudeCodeClient CWD) | TSPEC §9 |
| Implementation files reviewed | 2 (`.claude/skills/product-manager/SKILL.md`, `ptah/tests/unit/orchestrator/context-assembler.test.ts`) | N/A — implementation complete per PLAN status |

> **Note on test levels:** Phase 0 is implemented entirely in natural language (`SKILL.md`). Claude agent behavior cannot be Vitest unit-tested in isolation (TSPEC §7.1). Consequently, most properties are verified via **E2E acceptance tests** (manual verification against the live PM agent) as documented in FSPEC §3.7. The only automated Vitest tests are the `extractFeatureName()` contract tests (Task A-1). This is the intended and documented test strategy — the unusual distribution reflects the architecture, not a testing gap.

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 14 | REQ-AF-01, REQ-AF-02, REQ-AF-03, REQ-AF-04, REQ-AF-05, REQ-AF-06, REQ-AF-NF-01 | E2E (Acceptance) |
| Contract | 5 | REQ-AF-02, REQ-AF-04, AF-R1, AF-R2 | Unit / E2E |
| Error Handling | 6 | REQ-AF-05, REQ-AF-06, REQ-AF-NF-01, AF-R6, AF-R7 | E2E (Acceptance) |
| Data Integrity | 4 | REQ-AF-04, REQ-AF-06 | E2E (Acceptance) |
| Integration | 4 | REQ-AF-06, REQ-AF-NF-01, AF-R1 | Unit / Integration |
| Idempotency | 4 | REQ-AF-01, REQ-AF-07, AF-R4 | E2E (Acceptance) |
| Observability | 4 | AF-R5, FSPEC-AF-01 Steps 2e, 5, 8a | E2E (Acceptance) |
| Security | 1 | REQ-AF-05 | E2E (Acceptance) |
| **Total** | **42** | | |

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-AF-{NUMBER}` — AF domain matches the requirement domain.

**Priority:** Inherited from the highest-priority linked requirement (P0 / P1 / P2).

**Test levels for this feature:**
- **Unit** — Vitest tests against `extractFeatureName()` (contract tests in `context-assembler.test.ts`)
- **Integration** — Automated tests verifying cross-component behavior (context assembler + PM output, artifact commit pipeline)
- **E2E (Acceptance)** — Manual verification against the live PM agent (AT-AF-01 through AT-AF-12 from FSPEC §3.7)

---

### 3.1 Functional Properties

Core behavioral logic of the Phase 0 bootstrap algorithm.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-01 | PM skill must check whether `docs/{feature-slug}/` exists as the first file-system action of Phase 0, before any folder creation or file writes | [REQ-AF-01], [FSPEC-AF-01 Step 3] | E2E (Acceptance) | P0 |
| PROP-AF-02 | PM skill must skip all Phase 0 bootstrap file operations (mkdir, write) and proceed directly to task selection when the feature folder already exists | [REQ-AF-01], [REQ-AF-07] | E2E (Acceptance) | P0 |
| PROP-AF-03 | PM skill must execute Phase 0 bootstrap (Steps 4–8) when the feature folder does not exist | [REQ-AF-01] | E2E (Acceptance) | P0 |
| PROP-AF-04 | PM skill must use the NNN prefix embedded in the thread name (no auto-increment) when the feature-slug starts with exactly 3 digits followed by a hyphen (`^[0-9]{3}-`) | [REQ-AF-02], [FSPEC-AF-01 Step 4a] | E2E (Acceptance) | P0 |
| PROP-AF-05 | PM skill must auto-assign NNN by scanning `docs/` for the highest `^[0-9]{3}-` prefixed folder and incrementing by 1 (zero-padded to 3 digits) when the feature-slug does not start with `^[0-9]{3}-` | [REQ-AF-03], [FSPEC-AF-01 Step 4b] | E2E (Acceptance) | P0 |
| PROP-AF-06 | PM skill must assign NNN = `"001"` when no numbered folders exist in `docs/` | [REQ-AF-03], [FSPEC-AF-01 Step 4b.ii] | E2E (Acceptance) | P0 |
| PROP-AF-07 | PM skill must strip everything after the first occurrence of ` — ` (space + U+2014 em dash + space) from the Discord thread name to produce the candidate slug | [REQ-AF-04], [FSPEC-AF-01 Step 1] | E2E (Acceptance) | P0 |
| PROP-AF-08 | PM skill must use the full thread name as the candidate when no ` — ` separator is present | [REQ-AF-04], [FSPEC-AF-01 Step 1] | E2E (Acceptance) | P0 |
| PROP-AF-09 | PM skill slugification must produce `"009-auto-feature-bootstrap"` unchanged from input `"009-auto-feature-bootstrap"` (already valid slug) | [REQ-AF-04], [FSPEC-AF-01 Step 2, AT-AF-01] | E2E (Acceptance) | P0 |
| PROP-AF-10 | PM skill slugification must produce `"my-new-feature-v2"` from input `"My New Feature (v2)!"` (lowercase, non-alnum replaced, consecutive hyphens collapsed, trailing stripped) | [REQ-AF-04], [FSPEC-AF-01 Step 2, AT-AF-04] | E2E (Acceptance) | P0 |
| PROP-AF-11 | PM skill must use fallback slug `"feature"` when the slugified candidate is an empty string | [REQ-AF-04], [FSPEC-AF-01 Step 2e, AT-AF-08] | E2E (Acceptance) | P0 |
| PROP-AF-12 | PM skill must create directory `docs/{full-folder-name}/` during Phase 0 bootstrap (equivalent to `mkdir -p`) | [REQ-AF-05], [FSPEC-AF-01 Step 6] | E2E (Acceptance) | P0 |
| PROP-AF-13 | PM skill must write `docs/{full-folder-name}/overview.md` with synthesized content before proceeding to task selection | [REQ-AF-06], [FSPEC-AF-01 Steps 7–8] | E2E (Acceptance) | P0 |
| PROP-AF-14 | PM skill Phase 0 bootstrap (mkdir + overview.md write) must complete and all file writes must be flushed to disk before the PM begins any Phase 1 task work | [REQ-AF-NF-01], [FSPEC-AF-01 Step 8b] | E2E (Acceptance) | P0 |

---

### 3.2 Contract Properties

Protocol compliance, interface shape, and alignment between PM Phase 0 and `extractFeatureName()`.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-15 | `extractFeatureName()` must return the text before the first ` — ` (U+2014 with surrounding spaces) for a standard numbered thread name such as `"009-auto-feature-bootstrap — create FSPEC"` | [TSPEC §7.2, AF-R1], [AT-AF-01] | Unit | P0 |
| PROP-AF-16 | `extractFeatureName()` must return the full thread name unchanged when no ` — ` separator is present | [TSPEC §7.2], [AT-AF-12] | Unit | P0 |
| PROP-AF-17 | `extractFeatureName()` must strip only at the first ` — ` occurrence and preserve text after a second ` — ` | [TSPEC §7.2] | Unit | P0 |
| PROP-AF-18 | PM Phase 0 Step 1 strip logic must produce identical output to `extractFeatureName()` for standard numbered thread names (those following `{NNN}-{slug} — {task}`) | [FSPEC-AF-01 AF-R1], [TSPEC §9.1] | E2E (Acceptance) | P0 |
| PROP-AF-19 | NNN numbered-thread detection must match exactly 3 digits followed by a hyphen at slug start (`^[0-9]{3}-`) — slugs starting with 1, 2, or 4 digits must take the auto-assign path | [FSPEC-AF-01 AF-R2], [TSPEC §5.2 Step 4] | E2E (Acceptance) | P0 |

---

### 3.3 Error Handling Properties

Failure modes, error propagation, and correct halt behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-20 | PM skill must detect when `docs/` directory does not exist, report a clear error instructing the user to run `ptah init`, and halt — without creating `docs/` | [FSPEC-AF-01 Step 3.5, AF-R6], [AT-AF-05] | E2E (Acceptance) | P0 |
| PROP-AF-21 | PM skill must report a clear error including filesystem error details and halt when `mkdir` fails (e.g., permission denied) | [FSPEC-AF-01 Step 6, AF-R6], [AT-AF-06] | E2E (Acceptance) | P0 |
| PROP-AF-22 | PM skill must NOT attempt to write `overview.md` when `mkdir` fails — halting at Step 6 | [FSPEC-AF-01 Step 6, AF-R6] | E2E (Acceptance) | P0 |
| PROP-AF-23 | PM skill must report a clear error including filesystem error details and halt when `overview.md` write fails, while leaving the (empty) created folder on disk | [FSPEC-AF-01 Step 8, AF-R7], [AT-AF-11] | E2E (Acceptance) | P0 |
| PROP-AF-24 | PM skill must NOT proceed to Phase 1 task selection whenever any Phase 0 halt condition is triggered (`docs/` missing, `mkdir` fail, write fail) | [REQ-AF-NF-01], [FSPEC-AF-01 Steps 3.5, 6, 8] | E2E (Acceptance) | P0 |
| PROP-AF-25 | All Phase 0 halt error messages must appear in the PM's text response so they surface to the Discord thread via the orchestrator's `postAgentResponse` pipeline | [TSPEC §5.3] | E2E (Acceptance) | P0 |

---

### 3.4 Data Integrity Properties

Content correctness of generated files and mapping accuracy.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-26 | `overview.md` must begin with a Markdown H1 heading as its first line (no front-matter, no blank lines before the heading) | [REQ-AF-06], [FSPEC-AF-01 Step 7c] | E2E (Acceptance) | P0 |
| PROP-AF-27 | The `overview.md` H1 title must be derived deterministically from `full-folder-name`: hyphens replaced with spaces, each word title-cased (e.g., `"009-auto-feature-bootstrap"` → `"# 009 Auto Feature Bootstrap"`) | [FSPEC-AF-01 Step 7a, AT-AF-01] | E2E (Acceptance) | P0 |
| PROP-AF-28 | The `overview.md` body must contain 1–3 sentences summarizing the feature, derived from the user's initial message in the Discord thread | [REQ-AF-06], [FSPEC-AF-01 Step 7b] | E2E (Acceptance) | P0 |
| PROP-AF-29 | The full folder name for a numbered thread must exactly match the feature-slug (NNN already embedded), with no additional prefix added | [REQ-AF-02], [FSPEC-AF-01 Step 4a] | E2E (Acceptance) | P0 |

---

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-30 | `overview.md` created by PM Phase 0 must be included in context-assembler Layer 1 context on the next invocation of any skill on the same thread, with no "missing overview.md" warning logged | [REQ-AF-06], [FSPEC §3.1] | Integration | P0 |
| PROP-AF-31 | Phase 0 folder and `overview.md` (untracked files in the worktree) must be detected by `diffWorktreeIncludingUntracked()` and committed by the artifact commit pipeline after the PM's invocation completes | [TSPEC §9.2], [FSPEC §3.8] | Integration | P1 |
| PROP-AF-32 | PM agent must resolve `docs/` paths correctly relative to the worktree root (CWD = `worktreePath` as configured in `services/claude-code.ts`) | [TSPEC §9.3] | Integration | P0 |
| PROP-AF-33 | The AF-R1 contract test in `context-assembler.test.ts` must fail (go red) if `extractFeatureName()` is modified to strip on a different separator or return a different value for standard numbered thread names | [TSPEC §7.2, §9.1, AF-R1] | Unit | P0 |

---

### 3.6 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-34 | PM skill must not create any files or folders when the feature folder already exists at Step 3 — the feature folder check is the sole gate | [REQ-AF-07], [FSPEC-AF-01 Step 3, AT-AF-02] | E2E (Acceptance) | P0 |
| PROP-AF-35 | PM skill must not overwrite an existing `overview.md` under any circumstance — not on repeat invocations and not on race-condition detection at write time | [FSPEC-AF-01 AF-R4], [AT-AF-02, AT-AF-09] | E2E (Acceptance) | P0 |
| PROP-AF-36 | PM skill must treat `mkdir` success-when-folder-already-exists (race condition between Step 3 and Step 6) as a successful no-op and continue to Step 7 | [FSPEC-AF-01 Step 6] | E2E (Acceptance) | P1 |
| PROP-AF-37 | PM skill must log a skip notice and preserve existing `overview.md` content when the file already exists at write time (race condition between Step 6 and Step 8) | [FSPEC-AF-01 Step 8a, AF-R4], [AT-AF-09] | E2E (Acceptance) | P1 |

---

### 3.7 Observability Properties

Logging and user-visible signals from Phase 0.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-38 | PM skill must emit the log line `[ptah:pm] Bootstrapping feature folder: docs/{full-folder-name}/` at Step 5 (before `mkdir`) on every new bootstrap execution | [FSPEC-AF-01 Step 5, AF-R5] | E2E (Acceptance) | P2 |
| PROP-AF-39 | PM skill must emit the warning `[ptah:pm] Warning: thread name could not be slugified into a meaningful name. Using fallback slug 'feature'. Please rename the Discord thread.` when the fallback slug is used | [FSPEC-AF-01 Step 2e], [AT-AF-08] | E2E (Acceptance) | P2 |
| PROP-AF-40 | PM skill must emit the log line `[ptah:pm] overview.md already exists — skipping write.` when a race-condition write is skipped | [FSPEC-AF-01 Step 8a], [AT-AF-09] | E2E (Acceptance) | P2 |
| PROP-AF-41 | PM skill must NOT post a Discord embed, structured message, or any user-visible Discord output for Phase 0 bootstrap activity beyond the normal response text | [FSPEC-AF-01 AF-R5] | E2E (Acceptance) | P2 |

---

### 3.8 Security Properties

Input handling and path safety.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-42 | PM skill must create feature folders exclusively within `docs/` — thread name content must not cause path traversal outside the worktree root (all paths take the form `docs/{slug}/`) | [REQ-AF-05], [FSPEC-AF-01 Steps 5–6] | E2E (Acceptance) | P1 |

---

## 4. Negative Properties

Properties that define what the system must NOT do.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AF-43 | PM skill must NOT create `docs/` when it is missing — `docs/` creation is `ptah init`'s responsibility; PM must halt and report an error instead | [FSPEC-AF-01 Step 3.5, AF-R6], [AT-AF-05] | E2E (Acceptance) | P0 |
| PROP-AF-44 | PM skill must NOT auto-increment NNN when the thread name already contains an explicit 3-digit prefix — the developer's declared NNN must be used exactly | [REQ-AF-02], [FSPEC-AF-01 AF-R2] | E2E (Acceptance) | P0 |
| PROP-AF-45 | PM skill must NOT match 1-digit, 2-digit, or 4-digit numeric prefixes as "numbered threads" — only exactly 3 digits followed by a hyphen (`^[0-9]{3}-`) qualifies | [FSPEC-AF-01 AF-R2] | E2E (Acceptance) | P0 |
| PROP-AF-46 | PM skill must NOT scan remote Git history or fetch from remote to determine NNN — NNN assignment uses only the local `docs/` directory at invocation time | [FSPEC-AF-01 AF-R3] | E2E (Acceptance) | P1 |
| PROP-AF-47 | PM skill must NOT proceed to Phase 1 task selection when any Phase 0 halt condition fires — task work with missing infrastructure is forbidden | [REQ-AF-NF-01], [FSPEC-AF-01 Steps 3.5, 6, 8] | E2E (Acceptance) | P0 |
| PROP-AF-48 | PM skill must NOT overwrite or modify `overview.md` on second or subsequent invocations when the feature folder already exists — `overview.md` is immutable after first write | [REQ-AF-07], [FSPEC-AF-01 AF-R4], [AT-AF-02] | E2E (Acceptance) | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| [REQ-AF-01] Feature folder existence check | PROP-AF-01, PROP-AF-02, PROP-AF-03, PROP-AF-34 | Full |
| [REQ-AF-02] NNN prefix extraction from numbered thread | PROP-AF-04, PROP-AF-19, PROP-AF-29, PROP-AF-44, PROP-AF-45 | Full |
| [REQ-AF-03] NNN auto-assignment for unnumbered threads | PROP-AF-05, PROP-AF-06 | Full |
| [REQ-AF-04] Feature slug derivation (slugification) | PROP-AF-07, PROP-AF-08, PROP-AF-09, PROP-AF-10, PROP-AF-11 | Full |
| [REQ-AF-05] Feature folder creation | PROP-AF-12, PROP-AF-21, PROP-AF-22, PROP-AF-42, PROP-AF-43 | Full |
| [REQ-AF-06] overview.md synthesis and creation | PROP-AF-13, PROP-AF-26, PROP-AF-27, PROP-AF-28, PROP-AF-30 | Full |
| [REQ-AF-07] Idempotency — skip if folder exists | PROP-AF-34, PROP-AF-35, PROP-AF-48 | Full |
| [REQ-AF-NF-01] Bootstrap completes before Phase 1 | PROP-AF-14, PROP-AF-24, PROP-AF-47 | Full |

### 5.2 Specification Coverage

| Specification | Properties | Coverage |
|---------------|------------|----------|
| [FSPEC-AF-01 Step 1] Strip em-dash | PROP-AF-07, PROP-AF-08, PROP-AF-15, PROP-AF-16, PROP-AF-17, PROP-AF-18 | Full |
| [FSPEC-AF-01 Step 2] Slugification rules | PROP-AF-09, PROP-AF-10, PROP-AF-11 | Full |
| [FSPEC-AF-01 Step 2e] Empty-slug fallback | PROP-AF-11, PROP-AF-39 | Full |
| [FSPEC-AF-01 Step 3] Folder existence check | PROP-AF-01, PROP-AF-02, PROP-AF-34 | Full |
| [FSPEC-AF-01 Step 3.5] docs/ missing check | PROP-AF-20, PROP-AF-25, PROP-AF-43 | Full |
| [FSPEC-AF-01 Step 4a] Numbered thread NNN | PROP-AF-04, PROP-AF-19, PROP-AF-29, PROP-AF-44, PROP-AF-45 | Full |
| [FSPEC-AF-01 Step 4b] Auto-assign NNN | PROP-AF-05, PROP-AF-06, PROP-AF-46 | Full |
| [FSPEC-AF-01 Step 5] Log bootstrap start | PROP-AF-38 | Full |
| [FSPEC-AF-01 Step 6] mkdir | PROP-AF-12, PROP-AF-21, PROP-AF-22, PROP-AF-36 | Full |
| [FSPEC-AF-01 Step 7] Synthesize content | PROP-AF-26, PROP-AF-27, PROP-AF-28 | Full |
| [FSPEC-AF-01 Step 8] Write overview.md | PROP-AF-13, PROP-AF-14, PROP-AF-23, PROP-AF-35, PROP-AF-37, PROP-AF-40 | Full |
| [FSPEC-AF-01 AF-R1] extractFeatureName alignment | PROP-AF-15, PROP-AF-16, PROP-AF-17, PROP-AF-18, PROP-AF-33 | Full |
| [FSPEC-AF-01 AF-R4] No overwrite of overview.md | PROP-AF-35, PROP-AF-37, PROP-AF-48 | Full |
| [FSPEC-AF-01 AF-R5] No Discord embed | PROP-AF-41 | Full |
| [FSPEC-AF-01 AF-R6] mkdir fail → halt | PROP-AF-21, PROP-AF-22, PROP-AF-24 | Full |
| [FSPEC-AF-01 AF-R7] write fail → halt, keep folder | PROP-AF-23, PROP-AF-24 | Full |
| [FSPEC-AF-01 AF-R8] Context-assembler mismatch (known limitation) | — | N/A — documented limitation, no property needed |
| [TSPEC §7.2] AF-R1 contract test cases | PROP-AF-15, PROP-AF-16, PROP-AF-17, PROP-AF-33 | Full |
| [TSPEC §9.2] Artifact commit pipeline | PROP-AF-31 | Full |
| [TSPEC §9.3] CWD = worktree root | PROP-AF-32 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 8 | 8 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 |

All requirements are P0. Full coverage achieved.

---

## 6. Test Level Distribution

```
        /  E2E  \          Many — entire Phase 0 is agent behavior
       /----------\
      / Integration \      Small — context-assembler + commit pipeline
     /----------------\
    /    Unit Tests     \  Few — extractFeatureName() contract only
   /____________________\
```

> **Note:** The inverted pyramid (many E2E, few unit) reflects a deliberate architectural constraint: Phase 0 is implemented in natural language (`SKILL.md`) and executed by a Claude agent. There is no TypeScript to unit-test. The correct test strategy for this feature is acceptance testing against the live agent, supplemented by a contract test to protect the one TypeScript integration point (`extractFeatureName()`). See TSPEC §7.1 for the rationale.

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 5 (PROP-AF-15, -16, -17, -33 + AF-R1 contract test) | 10% |
| Integration | 3 (PROP-AF-30, -31, -32) | 6% |
| E2E (Acceptance) | 40 (all PM agent behavior) | 84% |
| **Total** | **48** | **100%** |

*42 positive properties + 6 negative properties = 48 total. Test level counts include negatives.*

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | **Context-assembler mismatch for non-standard thread names (AF-R8 limitation):** For unnumbered or special-character thread names, PM creates a folder the context assembler cannot locate (e.g., PM creates `docs/008-auth-redesign/`, assembler looks for `docs/auth redesign/`). No property covers this because it is an explicitly documented known limitation. | All subsequent context assemblies for non-standard threads will miss Layer 1 context | Med | Document clearly in TSPEC §10.1 (already done). In a future phase, update `extractFeatureName()` to apply the same slugification as PM Phase 0 and add contract tests confirming alignment. |
| 2 | **No automated tests for Phase 0 slugification correctness:** The five slugification rules (PROP-AF-09 through -11) are verified only via manual acceptance tests against the live PM agent. A slugification utility function is not exposed for unit testing. | A regression in how the PM agent interprets slugification rules would not be caught until a live invocation | Low | Acceptable given the natural-language implementation. If Phase 0 is ever refactored into a TypeScript helper, add unit tests for all 5 rules. Flag for future phase. |
| 3 | **PROP-AF-46 (no remote fetch for NNN) is hard to verify in acceptance testing:** It is difficult to observe *absence* of a network call in a live PM agent run. | A future implementation change might silently add remote fetching, breaking the offline guarantee (AF-R3) | Low | Add an explicit assertion in the TSPEC's integration test section for this constraint. Consider making this an observable: if the PM logs any fetch/network operation during Phase 0, it is a violation. Current risk is low (PM uses Bash `ls` which is local-only). |
| 4 | **NNN scan robustness with non-folder entries in docs/:** The `ls docs/ \| grep -E '^[0-9]{3}-'` command in Step 4b would match both folders and files whose names start with `NNN-`. If a file (not a folder) happens to match the pattern, NNN could be over-incremented. | Incorrect NNN assignment (off-by-one) on unnumbered thread bootstrap | Low | Currently no files in `docs/` match `^[0-9]{3}-`. Risk is acceptable for Phase 9. Future: filter to directories only with `ls -d docs/[0-9][0-9][0-9]-*/` or equivalent. |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |
| Technical Lead | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Test Engineer | Initial properties document for Phase 9 — Auto Feature Bootstrap. 42 positive properties + 6 negative = 48 total. Covers all 8 requirements and all FSPEC-AF-01 business rules. |

---

*End of Document*
