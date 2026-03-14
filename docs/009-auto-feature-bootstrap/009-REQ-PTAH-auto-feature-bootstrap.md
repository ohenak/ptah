# Requirements Document: Phase 9 — Auto Feature Bootstrap

| Field | Detail |
|-------|--------|
| **Document ID** | 009-REQ-PTAH-auto-feature-bootstrap |
| **Parent Document** | [001-REQ-PTAH](../requirements/001-REQ-PTAH.md) |
| **Version** | 1.0 |
| **Date** | March 13, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |

---

## 1. Purpose

This document defines the requirements for Phase 9 — Auto Feature Bootstrap. This phase removes the manual prerequisite of creating `docs/{NNN}-{feature-name}/overview.md` before invoking the PM skill on a new feature. The PM skill now bootstraps the folder as its own Phase 0 step, eliminating friction from the standard workflow.

---

## 2. User Story

### US-09: Developer Starts a New Feature Without Manual Folder Setup

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer creates a Discord thread named after a new feature (e.g., "009-auto-feature-bootstrap — create requirements") and @mentions the PM skill to start work. They have not manually created the `docs/009-auto-feature-bootstrap/` folder or `overview.md`. |
| **Goals** | The PM skill creates the feature folder and a brief `overview.md` automatically before proceeding with Phase 1 (Discovery), so that subsequent skills in the same thread have full Layer 1 context available. |
| **Pain points** | Creating the `docs/{NNN}-{feature-name}/` folder and writing `overview.md` before invoking an agent is pure friction — it provides no creative value, it is repetitive, and forgetting it causes a context-assembly warning on every invocation until it is fixed. |
| **Key needs** | Automatic folder and `overview.md` creation from the thread name and initial message. Idempotency — if the folder already exists, skip silently. Correct `{NNN}` prefix assignment even for threads whose names do not include an explicit number. |

---

## 3. Requirements

### Domain: AF — Auto Feature Bootstrap

#### REQ-AF-01: Feature Folder Existence Check

| Field | Detail |
|-------|--------|
| **ID** | REQ-AF-01 |
| **Title** | Feature folder existence check before Phase 1 |
| **Description** | Before beginning Phase 1 (Discovery), the PM skill must check whether a feature folder already exists at `docs/{feature-slug}/` (where `{feature-slug}` is the slugified folder name derived from the Discord thread name). If the folder exists, the PM proceeds directly to Phase 1 with no further bootstrap actions. If the folder does not exist, the PM executes the Phase 0 bootstrap sequence ([REQ-AF-02] through [REQ-AF-06]) before proceeding. |
| **Priority** | P0 |
| **Phase** | 9 |
| **Source User Stories** | [US-09] |
| **Dependencies** | None |

**Acceptance Criteria:**

```
WHO:   As the PM skill
GIVEN: I am invoked on Discord thread "009-auto-feature-bootstrap — create FSPEC"
       and docs/009-auto-feature-bootstrap/ already exists
WHEN:  I begin my workflow
THEN:  I skip the Phase 0 bootstrap entirely
       and proceed directly to Phase 1 (Discovery)
       and I do NOT create any new files or folders
```

```
WHO:   As the PM skill
GIVEN: I am invoked on Discord thread "009-auto-feature-bootstrap — create FSPEC"
       and docs/009-auto-feature-bootstrap/ does NOT exist
WHEN:  I begin my workflow
THEN:  I execute the Phase 0 bootstrap sequence before Phase 1
```

---

#### REQ-AF-02: NNN Prefix Extraction from Thread Name

| Field | Detail |
|-------|--------|
| **ID** | REQ-AF-02 |
| **Title** | Extract NNN prefix from numbered thread name |
| **Description** | If the Discord thread name begins with a zero-padded three-digit number followed by a hyphen (e.g., `009-auto-feature-bootstrap`), the PM skill must use that number as the `{NNN}` prefix for the new folder. The PM must NOT auto-increment in this case — the developer has explicitly declared the feature number in the thread name, and the folder must match it exactly so that the context assembler can locate it. |
| **Priority** | P0 |
| **Phase** | 9 |
| **Source User Stories** | [US-09] |
| **Dependencies** | [REQ-AF-01] |

**Acceptance Criteria:**

```
WHO:   As the PM skill
GIVEN: The Discord thread name is "009-auto-feature-bootstrap — create FSPEC"
       and no docs/009-auto-feature-bootstrap/ folder exists
WHEN:  I determine the feature folder name
THEN:  I use "009" as the NNN prefix
       and the folder name is docs/009-auto-feature-bootstrap/
```

```
WHO:   As the PM skill
GIVEN: The Discord thread name is "009-auto-feature-bootstrap — create FSPEC"
       and docs/007-polish/ is the highest-numbered existing folder
WHEN:  I determine the feature folder name
THEN:  I still use "009" (from the thread name), NOT "008" (auto-increment)
```

---

#### REQ-AF-03: NNN Auto-Assignment for Unnumbered Thread Names

| Field | Detail |
|-------|--------|
| **ID** | REQ-AF-03 |
| **Title** | Auto-assign next sequential NNN for thread names without a number prefix |
| **Description** | If the Discord thread name does NOT begin with a three-digit number followed by a hyphen, the PM skill must auto-assign the next sequential `{NNN}` prefix. It does this by scanning `docs/` for existing numbered folders (matching the pattern `NNN-*`), finding the highest existing number, and incrementing it by 1. The result is zero-padded to three digits. If no numbered folders exist, the starting number is `001`. |
| **Priority** | P0 |
| **Phase** | 9 |
| **Source User Stories** | [US-09] |
| **Dependencies** | [REQ-AF-01] |

**Acceptance Criteria:**

```
WHO:   As the PM skill
GIVEN: The Discord thread name is "my-new-feature — describe requirements"
       (no NNN prefix)
       and the highest-numbered folder in docs/ is docs/007-polish/
WHEN:  I determine the feature folder name
THEN:  I assign NNN = "008"
       and the folder name is docs/008-my-new-feature/
```

```
WHO:   As the PM skill
GIVEN: The Discord thread name is "my-new-feature — describe requirements"
       and there are no numbered folders in docs/
WHEN:  I determine the feature folder name
THEN:  I assign NNN = "001"
       and the folder name is docs/001-my-new-feature/
```

---

#### REQ-AF-04: Feature Slug Derivation from Thread Name

| Field | Detail |
|-------|--------|
| **ID** | REQ-AF-04 |
| **Title** | Slugify thread name to derive feature folder name |
| **Description** | The PM skill must derive the feature slug from the Discord thread name using the same convention used by `context-assembler.ts`: strip everything after ` — ` (space–em-dash–space, Unicode U+2014 `—`), then apply the following normalization: lowercase all characters; replace any character that is not alphanumeric or a hyphen with a hyphen; collapse consecutive hyphens to a single hyphen; strip any leading or trailing hyphens. If the thread name was already numbered (REQ-AF-02), the NNN prefix is already part of the slug and is preserved. |
| **Priority** | P0 |
| **Phase** | 9 |
| **Source User Stories** | [US-09] |
| **Dependencies** | [REQ-AF-01] |

**Acceptance Criteria:**

```
WHO:   As the PM skill
GIVEN: The Discord thread name is "009-auto-feature-bootstrap — create FSPEC"
WHEN:  I derive the feature slug
THEN:  The slug is "009-auto-feature-bootstrap"
       (text after " — " is stripped; result is already lowercase alphanumeric-hyphen)
```

```
WHO:   As the PM skill
GIVEN: The Discord thread name is "My New Feature (v2)! — design doc"
WHEN:  I derive the feature slug (without a NNN prefix — unnumbered)
THEN:  The raw slug (before NNN assignment) is "my-new-feature-v2"
       (spaces → hyphens, parentheses/exclamation stripped, lowercased,
        consecutive hyphens collapsed)
```

---

#### REQ-AF-05: Feature Folder Creation

| Field | Detail |
|-------|--------|
| **ID** | REQ-AF-05 |
| **Title** | Create feature folder in docs/ |
| **Description** | The PM skill must create the directory `docs/{NNN}-{feature-slug}/` if it does not already exist. This is the container for all feature artifacts (REQ documents, FSPECs, TSPECs, plans, and cross-review files) generated by all skills working on this feature. |
| **Priority** | P0 |
| **Phase** | 9 |
| **Source User Stories** | [US-09] |
| **Dependencies** | [REQ-AF-01], [REQ-AF-02], [REQ-AF-03], [REQ-AF-04] |

**Acceptance Criteria:**

```
WHO:   As the PM skill
GIVEN: I have determined the feature folder name is docs/009-auto-feature-bootstrap/
       and that folder does not exist
WHEN:  I execute the Phase 0 bootstrap
THEN:  The directory docs/009-auto-feature-bootstrap/ is created
       and subsequent file operations targeting that folder succeed
```

---

#### REQ-AF-06: Overview.md Synthesis and Creation

| Field | Detail |
|-------|--------|
| **ID** | REQ-AF-06 |
| **Title** | Synthesize and write overview.md from the user's initial message |
| **Description** | The PM skill must write `docs/{NNN}-{feature-slug}/overview.md` containing a 1–3 sentence summary of the feature, derived from the user's initial Discord message in the thread. The overview serves as Layer 1 context for all subsequent skill invocations on this feature (as consumed by `context-assembler.ts`). The file must be written before the PM proceeds to Phase 1 so that Phase 1's context assembly can include it. |
| **Priority** | P0 |
| **Phase** | 9 |
| **Source User Stories** | [US-09] |
| **Dependencies** | [REQ-AF-05] |

**Acceptance Criteria:**

```
WHO:   As the PM skill
GIVEN: The user's initial message in the thread is
       "Create the FSPEC for Phase 9 — auto feature bootstrap"
       and the feature folder docs/009-auto-feature-bootstrap/ was just created
WHEN:  I write overview.md
THEN:  docs/009-auto-feature-bootstrap/overview.md exists
       and it contains a 1–3 sentence description of the feature
       synthesized from the user's message
       and it is formatted as valid Markdown with a top-level heading
```

```
WHO:   As the context assembler
GIVEN: docs/009-auto-feature-bootstrap/overview.md exists
       and was written by the PM skill's Phase 0 bootstrap
WHEN:  I assemble the context bundle for any subsequent skill invocation
       on this thread
THEN:  The overview.md content is included as Layer 1 context
       (no "missing overview.md" warning is logged)
```

---

#### REQ-AF-07: Idempotency — Skip Bootstrap on Repeat Invocations

| Field | Detail |
|-------|--------|
| **ID** | REQ-AF-07 |
| **Title** | Idempotent bootstrap — skip if folder already exists |
| **Description** | If the PM skill is invoked a second or subsequent time on the same thread (e.g., for Phase 2 after Phase 1 is complete), and the feature folder already exists, the PM must not re-create the folder or overwrite `overview.md`. The bootstrap check must be idempotent: "folder exists → proceed to Phase 1, no file operations." |
| **Priority** | P0 |
| **Phase** | 9 |
| **Source User Stories** | [US-09] |
| **Dependencies** | [REQ-AF-01] |

**Acceptance Criteria:**

```
WHO:   As the PM skill
GIVEN: I am invoked for the second time on thread "009-auto-feature-bootstrap"
       and docs/009-auto-feature-bootstrap/overview.md already exists
       with content "Auto Feature Bootstrap removes manual folder setup..."
WHEN:  I begin my workflow
THEN:  I do NOT modify or overwrite overview.md
       I do NOT create any new files or folders
       I proceed directly to Phase 1
```

---

### Non-Functional Requirements

#### REQ-AF-NF-01: Bootstrap Completes Before Phase 1 Context Assembly

| Field | Detail |
|-------|--------|
| **ID** | REQ-AF-NF-01 |
| **Title** | Bootstrap is synchronous and precedes Phase 1 |
| **Description** | The Phase 0 bootstrap sequence (folder creation + overview.md write) must complete fully before the PM skill begins any Phase 1 activity. There must be no race condition where context assembly runs before the overview.md file is flushed to disk. |
| **Priority** | P0 |
| **Phase** | 9 |
| **Source User Stories** | [US-09] |
| **Dependencies** | [REQ-AF-05], [REQ-AF-06] |

**Acceptance Criteria:**

```
WHO:   As the PM skill
GIVEN: Phase 0 bootstrap was triggered (folder did not exist)
WHEN:  I begin Phase 1 activities
THEN:  docs/{NNN}-{feature-slug}/overview.md is fully written and flushed to disk
       before any Phase 1 context assembly or tool use occurs
```

---

## 4. Scope Boundaries

### 4.1 In Scope

- PM skill creates feature folder and `overview.md` as a Phase 0 step
- NNN prefix derivation from thread name (if numbered) or auto-scan (if unnumbered)
- Slugification of thread name for folder naming
- Idempotency — skip if folder exists
- overview.md synthesized from initial user message in the thread

### 4.2 Out of Scope

- Orchestrator-level folder creation (Option B from overview) — the PM skill owns this
- Creating any files other than `overview.md` in the bootstrap step (REQ documents, FSPECs, etc. are created during the appropriate PDLC phase)
- Modifying or regenerating `overview.md` on subsequent invocations — once written, it is immutable
- Thread renaming or Discord operations — the PM reads the thread name, it does not modify Discord
- Validation that the Discord channel is `#agent-updates` or that the thread follows naming conventions — the PM bootstraps regardless of thread channel

### 4.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-09-01 | The PM skill's worktree is a clone of the main repo with a clean `docs/` directory at invocation time | The NNN scan could produce an incorrect number if `docs/` is not up to date; the PM should pull or use the worktree's current state |
| A-09-02 | The worktree-based artifact commit pipeline (FSPEC-AC-01) will commit the created folder and `overview.md` automatically after the PM's invocation completes | If the commit pipeline is not running, the folder exists only in the worktree and will be lost; no special handling is needed in Phase 0 |
| A-09-03 | Thread names follow the convention `{optional NNN}-{feature-slug} — {task description}` | If thread names are completely free-form, slugification may produce unpredictable folder names; the PM should log a warning for unusual names |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-09-01 | Two PM skill instances running concurrently on different threads choose the same NNN via auto-scan | Low | Med | Worktree isolation prevents file conflicts; the first merge wins; the second PM sees the folder already exists when its worktree is merged and can adjust. NNN conflicts can be resolved manually and are non-blocking. |
| R-09-02 | Developer uses the same NNN in two different thread names (e.g., "009-feature-a" and "009-feature-b") | Very Low | Med | Both threads would target the same folder. The PM detects folder existence and does not overwrite. The developer must resolve the naming conflict. |
| R-09-03 | Thread name slugification produces a folder name that collides with an existing folder for a different feature | Very Low | Med | The existence check (REQ-AF-01) catches this and skips bootstrap — no data loss. The PM should log a note that the folder was found but the name may refer to a different feature. |

---

## 6. Success Metrics

| Metric | How to Measure | Target |
|--------|----------------|--------|
| Bootstrap frequency | Count of new features that required manual folder creation after Phase 9 ships | 0 per month |
| Bootstrap correctness | `overview.md` files written by PM skill that are rated "accurate" or "very accurate" by developer survey | > 90% |
| Bootstrap duration | Time added to PM skill's first invocation by Phase 0 | < 5 seconds |

---

## 7. Open Questions

All open questions from the overview are resolved as follows:

| # | Question | Resolution |
|---|----------|------------|
| OQ-09-01 | Should the orchestrator validate that the feature folder was created after PM's first invocation? | No — trust the PM to do it. The orchestrator already handles missing folders gracefully (warning + empty context). Validation adds complexity with little benefit. |
| OQ-09-02 | Should `{NNN}` be derived from the thread name if it contains a number, or always auto-increment? | Derive from thread name if present (REQ-AF-02). This preserves the existing convention where the thread name IS the folder name, and avoids NNN mismatches that would cause context-assembler to miss the folder. |

---

## 8. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 13, 2026 | Product Manager | Initial requirements document for Phase 9 — Auto Feature Bootstrap. 7 requirements (REQ-AF-01 through REQ-AF-07, REQ-AF-NF-01). Resolved 2 open questions from overview.md. |

---

*Gate: User reviews and approves these requirements before proceeding to Phase 3 (Functional Specification).*
