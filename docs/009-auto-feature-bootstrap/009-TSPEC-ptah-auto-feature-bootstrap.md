# Technical Specification: Phase 9 — Auto Feature Bootstrap

| Field | Detail |
|-------|--------|
| **Document ID** | 009-TSPEC-ptah-auto-feature-bootstrap |
| **Requirements** | [009-REQ-PTAH-auto-feature-bootstrap](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| **Functional Specification** | [009-FSPEC-ptah-auto-feature-bootstrap](./009-FSPEC-ptah-auto-feature-bootstrap.md) |
| **Date** | March 14, 2026 |
| **Status** | Approved |

---

## 1. Summary

Phase 9 adds a **Phase 0: Feature Folder Bootstrap** step to the PM skill's SKILL.md. Before the PM begins any task, it checks whether the feature folder (`docs/{NNN}-{feature-slug}/`) exists in the worktree. If the folder is missing, the PM creates it and writes a synthesized `overview.md` from the user's initial message. If the folder exists, the PM skips Phase 0 entirely and proceeds to task selection.

The implementation is a **natural language instruction change only** — a new "Phase 0" section is inserted into `.claude/skills/product-manager/SKILL.md` before the Task Selection section. No TypeScript source changes are required. The only TypeScript artifact is one new integration test (AF-R1 contract) added to the existing `context-assembler.test.ts` to lock down the `extractFeatureName()` contract that the PM's Phase 0 depends on.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Implementation language | Natural language (Markdown) | The PM is a Claude agent; its behavior is defined by SKILL.md instructions, not TypeScript |
| Filesystem operations | `Bash` and `Write` tools (available to the PM agent) | Already granted to the PM agent; `Bash` provides `ls`, `mkdir`; `Write` provides file creation |
| New npm dependencies | None | No changes to the TypeScript runtime |
| Test framework | Vitest (existing) | Integration test added to existing test suite |

### PM Agent Tool Access

The PM agent is invoked by the orchestrator with `cwd = worktreePath` (confirmed in `ptah/src/services/claude-code.ts`, line 36: `cwd: request.worktreePath`). All relative filesystem paths resolve from the **worktree root** (the repo root). Thus:

- `docs/` is at `<worktree-root>/docs/` — accessible as `docs/` in Bash commands
- `docs/009-auto-feature-bootstrap/` resolves correctly relative to the agent's CWD
- No path prefix gymnastics are required; the PM uses `docs/` directly

---

## 3. Project Structure

```
(repo root)
├── .claude/
│   └── skills/
│       └── product-manager/
│           └── SKILL.md                  ← UPDATED: Phase 0 section inserted before Task Selection
├── docs/
│   └── 009-auto-feature-bootstrap/
│       └── 009-TSPEC-ptah-auto-feature-bootstrap.md  ← NEW (this file)
└── ptah/
    └── tests/
        └── unit/
            └── orchestrator/
                └── context-assembler.test.ts   ← UPDATED: AF-R1 contract describe block added
```

No new source files are created. No new modules, services, or commands.

---

## 4. Module Architecture

### 4.1 Overview

There are no new TypeScript modules. The feature is entirely contained in:

1. **SKILL.md instruction change** — the PM agent reads Phase 0 instructions and follows them
2. **Contract test** — verifies the `extractFeatureName()` ↔ PM Phase 0 strip logic alignment

### 4.2 Dependency on Existing Components

| Component | Role | Change |
|-----------|------|--------|
| `context-assembler.ts` `extractFeatureName()` | Strips ` — ` to derive folder path for context assembly | None — no code change; contract test added |
| PM SKILL.md | Instructions governing all PM agent behavior | Updated: Phase 0 task inserted before Task Selection |
| `ClaudeCodeClient` (`services/claude-code.ts`) | Invokes PM with `cwd = worktreePath` | None — already passes correct CWD |
| Artifact commit pipeline (FSPEC-AC-01) | Commits new folder + `overview.md` after PM invocation | None — new files are auto-staged and committed |

### 4.3 SKILL.md Insertion Point

The Phase 0 section is inserted **before** the "Task Selection — MANDATORY FIRST STEP" section in `SKILL.md`. This ensures Phase 0 runs on every PM invocation, regardless of which task is being performed. On repeat invocations (Task 2, 3, 4), the folder already exists and Phase 0 exits immediately at Step 3.

---

## 5. Phase 0 Algorithm

### 5.1 Inputs

| Input | How PM obtains it | Type |
|-------|-------------------|------|
| Discord thread name | Provided in context bundle Layer 3 trigger message preamble | String |
| User's initial message | Provided in context bundle Layer 3 | String |
| `docs/` filesystem | Via `Bash` tool (`ls docs/` or `test -d docs/`) with CWD = worktree root | Directory listing |

### 5.2 Step-by-Step Algorithm

```
PHASE 0: FEATURE FOLDER BOOTSTRAP
(Runs before Task Selection on every PM invocation)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — EXTRACT CANDIDATE SLUG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Input:  full Discord thread name
Action: find the first occurrence of " — " (U+2020 em dash with surrounding spaces)
        if found → take substring before it
        if not found → use full thread name as-is
Output: candidate (stripped thread name, may contain uppercase/special chars)

Note: This mirrors extractFeatureName() in context-assembler.ts exactly.
      The PM MUST use this identical strip logic so that the folder it creates
      matches the path the context assembler resolves on subsequent invocations
      (AF-R1). If extractFeatureName() is ever updated, this step must change too.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — SLUGIFY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Input:  candidate from Step 1
Action (in order):
  a. Lowercase all characters
  b. Replace any character NOT in [a-z0-9-] with a hyphen
  c. Collapse two or more consecutive hyphens into one hyphen
  d. Strip leading and trailing hyphens
  e. If result is empty string → use fallback "feature" and log:
     "[ptah:pm] Warning: thread name could not be slugified into a meaningful name.
      Using fallback slug 'feature'. Please rename the Discord thread."
Output: feature-slug (e.g. "009-auto-feature-bootstrap", "my-new-feature-v2")

Examples:
  "009-auto-feature-bootstrap"  → "009-auto-feature-bootstrap"  (no change)
  "My New Feature (v2)!"        → "my-new-feature-v2"
  "Auth -- Redesign"            → "auth-redesign"
  "OAuth 2.0 (Google)"          → "oauth-2-0-google"
  "!!!"                         → "" → fallback "feature"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — CHECK FOR EXISTING FOLDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action: check if docs/{feature-slug}/ exists in the worktree
        (Bash: test -d docs/{feature-slug} && echo EXISTS || echo NOT_FOUND)
  if EXISTS   → skip to STEP 9 (idempotent — no file operations)
  if NOT_FOUND → continue to STEP 3.5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3.5 — CHECK DOCS/ EXISTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action: verify docs/ exists (Bash: test -d docs)
  if docs/ EXISTS   → continue to STEP 4
  if docs/ NOT_FOUND →
      Report error: "docs/ directory not found. Please run 'ptah init' to
      scaffold the project structure before invoking the PM skill."
      → HALT (do NOT create docs/, do NOT proceed to task selection)
      → Post error text in response so it surfaces to Discord thread

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — DETERMINE NNN PREFIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Condition A: feature-slug starts with exactly 3 digits followed by a hyphen
             (pattern ^[0-9]{3}-)
  → NUMBERED THREAD: NNN is already embedded in the feature-slug.
    full-folder-name = feature-slug (no change)
    Example: "009-auto-feature-bootstrap" → full-folder-name = "009-auto-feature-bootstrap"

Condition B: feature-slug does NOT match ^[0-9]{3}-
  → UNNUMBERED THREAD: auto-assign NNN
    i.  Run: ls docs/ | grep -E '^[0-9]{3}-' | sort | tail -1
        to find the highest existing NNN folder
    ii. If result is non-empty:
          highest = first 3 chars of the result (e.g. "007")
          NNN = zero-padded (highest + 1), e.g. "008"
        If result is empty (no numbered folders exist):
          NNN = "001"
    iii. full-folder-name = "{NNN}-{feature-slug}"
    Example: "my-new-feature", highest = "007-polish"
             → NNN = "008" → full-folder-name = "008-my-new-feature"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — LOG AND CONFIRM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Log: "[ptah:pm] Bootstrapping feature folder: docs/{full-folder-name}/"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — CREATE FEATURE FOLDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action: mkdir -p docs/{full-folder-name}
  if mkdir succeeds (or folder already exists — race condition)
    → continue to STEP 7
  if mkdir fails (e.g., permission denied):
    → Report error: "Failed to create feature folder docs/{full-folder-name}/: {error}.
      Please check filesystem permissions."
    → HALT (do NOT attempt overview.md write)
    → Post error text in response so it surfaces to Discord thread

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7 — SYNTHESIZE OVERVIEW CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Construct the overview.md content:
  a. TITLE: Replace all hyphens in full-folder-name with spaces,
            then title-case each word.
     Example: "009-auto-feature-bootstrap" → "# 009 Auto Feature Bootstrap"
     This is deterministic — no inference required for the heading.
  b. BODY: Write 1–3 sentences summarizing the feature using:
           - The full-folder-name (feature identity)
           - The user's initial message in the thread (from Layer 3 context)
           Keep it factual and concise — this is Layer 1 reference context.
           If the initial message is very brief, one sentence is sufficient.
  c. FORMAT: Valid Markdown, H1 heading first, no front-matter.
  d. EXAMPLE:
     ---
     # 009 Auto Feature Bootstrap

     Automatic feature folder creation when the PM skill starts work on a new
     feature. Removes the manual prerequisite of creating
     `docs/{NNN}-{feature-name}/overview.md` before invoking the PM skill.
     ---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 8 — WRITE OVERVIEW.MD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pre-write check:
  test -f docs/{full-folder-name}/overview.md
  if overview.md EXISTS (race condition):
    Log: "[ptah:pm] overview.md already exists — skipping write."
    → skip to STEP 9

  if overview.md NOT_FOUND → write synthesized content to
    docs/{full-folder-name}/overview.md using Write tool.
    This write MUST complete before any Phase 1 task work begins (REQ-AF-NF-01).

  if write fails (e.g., permission denied):
    → Report error: "Failed to write overview.md at docs/{full-folder-name}/overview.md: {error}.
      The folder was created but overview.md is missing. Subsequent context assembly
      will warn on every invocation until this is resolved."
    → HALT (do NOT proceed to task selection)
    → Post error text in response so it surfaces to Discord thread

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 9 — PROCEED TO TASK SELECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 0 is complete. The PM resumes normal SKILL.md flow at Task Selection.
```

### 5.3 Error Surfacing to Discord (PM F-PM-02)

Errors that cause Phase 0 to halt are reported **in the PM's text response**. Since the orchestrator embeds the PM's full text response in the Discord thread, all halt messages naturally surface to the user without any additional mechanism. The PM should write a clear, human-readable error message as part of its response text at the end of the invocation.

This is consistent with how all other skill errors surface — the Claude agent's response text becomes the Discord embed description via the `postAgentResponse` pipeline.

---

## 6. Error Handling

| Scenario | Trigger | PM Behavior | Proceeds to Phase 1? |
|----------|---------|-------------|----------------------|
| `docs/` directory missing | `test -d docs` fails | Reports clear error with `ptah init` instruction. Halts. | No |
| `mkdir` fails (permission denied or other OS error) | `mkdir -p docs/{folder}` exits non-zero | Reports error with folder path and OS error. Halts. Does not attempt `overview.md` write. | No |
| `overview.md` write fails (permission denied or other OS error) | Write tool returns error | Reports error with path and OS error. Halts. Empty folder remains on disk (acceptable per AF-R7). | No |
| `overview.md` exists at write time (race condition) | `test -f` check before write | Logs skip notice. Preserves existing content (AF-R4). Continues normally. | Yes |
| Feature folder exists at Step 3 | `test -d docs/{slug}` succeeds | Skips all bootstrap steps. No file operations. | Yes (immediate) |
| Thread name slugifies to empty string | All chars are non-alphanumeric | Uses fallback slug `"feature"`. Logs warning. Continues with NNN assignment. | Yes |

---

## 7. Test Strategy

### 7.1 Approach

The PM skill's Phase 0 is implemented in **natural language (SKILL.md)**. This means:

- **No Vitest unit tests for Phase 0 agent behavior** — Claude agents executing SKILL.md instructions are not unit-testable in isolation via Vitest
- **One new integration test** — added to `context-assembler.test.ts` to lock down the `extractFeatureName()` contract that Phase 0 depends on (AF-R1)
- **Acceptance tests (AT-AF-01 through AT-AF-12)** — manual verification against the live PM agent in the Discord thread

### 7.2 AF-R1 Contract Integration Test

AF-R1 requires that the PM's strip-after-em-dash logic (Phase 0 Step 1) be identical to `extractFeatureName()`. The test locks down the function's behavior for the thread name patterns used by Phase 0.

**Test file:** `ptah/tests/unit/orchestrator/context-assembler.test.ts`

**New describe block to add:**

```typescript
describe("extractFeatureName — Phase 9 AF-R1 contract", () => {
  // Standard numbered thread name — PM folder matches context-assembler path
  it("strips after em-dash for standard numbered thread name (AT-AF-01 path)", () => {
    expect(assembler.extractFeatureName("009-auto-feature-bootstrap \u2014 create FSPEC"))
      .toBe("009-auto-feature-bootstrap");
    // PM slugification of "009-auto-feature-bootstrap" is a no-op (already lowercase alnum+hyphen)
    // Therefore PM creates docs/009-auto-feature-bootstrap/ which context-assembler can find ✓
  });

  it("strips after em-dash for unnumbered thread name (AT-AF-03 path)", () => {
    expect(assembler.extractFeatureName("auth redesign \u2014 define scope"))
      .toBe("auth redesign");
    // PM slugifies "auth redesign" → "auth-redesign"
    // PM auto-assigns NNN → "008-auth-redesign"
    // context-assembler looks for "auth redesign" (spaces, no NNN) — MISMATCH
    // This is the known limitation documented in AF-R8 / AT-AF-03
  });

  it("returns full thread name when no em-dash separator present (known limitation AF-R8)", () => {
    expect(assembler.extractFeatureName("create requirements for auth"))
      .toBe("create requirements for auth");
    // PM slugifies → "create-requirements-for-auth", prepends NNN
    // context-assembler returns "create requirements for auth" with spaces — MISMATCH
    // Known limitation per AF-R8: developers should use NNN-slug — task naming convention
  });

  it("strips correctly for thread names with multiple em-dashes (first occurrence only)", () => {
    expect(assembler.extractFeatureName("my-feature \u2014 create spec \u2014 v2"))
      .toBe("my-feature");
    // Only strips at first " — " occurrence
  });
});
```

### 7.3 Acceptance Test Coverage

All 12 acceptance tests from FSPEC §3.7 are manual verification tests run against the live PM agent:

| AT | Scenario | Verified by |
|----|----------|-------------|
| AT-AF-01 | First invocation numbered thread — folder created | Live PM invocation with empty docs/ |
| AT-AF-02 | Repeat invocation — folder exists, skip | Second PM invocation on same thread |
| AT-AF-03 | Unnumbered thread — NNN auto-assigned | PM invocation on thread without NNN prefix |
| AT-AF-04 | Special characters — deterministic slug and title | PM invocation with "OAuth 2.0 (Google)" thread |
| AT-AF-05 | `docs/` missing — halt with error | PM invocation in repo without `ptah init` |
| AT-AF-06 | `mkdir` fails — halt, no overview.md | PM invocation with `docs/` unwritable |
| AT-AF-07 | Different feature at same NNN — no conflict | PM invocation with "001-custom-feature" when 001-init exists |
| AT-AF-08 | Empty slug fallback — "feature" used, warning logged | PM invocation with "!!! — do stuff" thread |
| AT-AF-09 | Race condition — overview.md exists at write time | Simulated via pre-creating overview.md |
| AT-AF-10 | No numbered folders — NNN="001" | PM invocation on fresh docs/ with no numbered folders |
| AT-AF-11 | overview.md write fails — halt, empty folder persists | PM invocation with overview.md path unwritable |
| AT-AF-12 | No " — " separator — full name used, known limitation noted | PM invocation with "create requirements for auth" |

---

## 8. Requirement → Technical Component Mapping

| Requirement | Technical Component | Description |
|-------------|-------------------|-------------|
| REQ-AF-01 | SKILL.md Phase 0 Step 3 | Folder existence check using `test -d docs/{slug}` before any file ops |
| REQ-AF-02 | SKILL.md Phase 0 Step 4 Condition A | `^[0-9]{3}-` pattern check; use embedded NNN if present |
| REQ-AF-03 | SKILL.md Phase 0 Step 4 Condition B | Scan `docs/` with `ls \| grep -E '^[0-9]{3}-' \| sort \| tail -1`; auto-increment |
| REQ-AF-04 | SKILL.md Phase 0 Step 2 | Slugification rules (lowercase → replace non-alnum → collapse hyphens → strip) |
| REQ-AF-05 | SKILL.md Phase 0 Step 6 | `mkdir -p docs/{full-folder-name}` via Bash tool |
| REQ-AF-06 | SKILL.md Phase 0 Steps 7–8 | Synthesize title (deterministic) + body (from user message), Write tool |
| REQ-AF-07 | SKILL.md Phase 0 Step 3 (EXISTS branch) | If folder found → skip all steps, proceed to task selection |
| REQ-AF-NF-01 | SKILL.md Phase 0 ordering | Steps 1–8 ordered before task selection; Write call blocks before proceeding |
| AF-R1 | Integration test in context-assembler.test.ts | Locks down extractFeatureName() contract for Phase 0 strip logic |

---

## 9. Integration Points

### 9.1 context-assembler.ts — `extractFeatureName()`

**Dependency direction:** PM Phase 0 depends on `extractFeatureName()` behavior. The folder name PM creates must match the path `extractFeatureName()` resolves.

**Contract (AF-R1):**
- `extractFeatureName()` strips everything after the first ` — ` (U+2014) occurrence
- For standard thread names (e.g., `"009-auto-feature-bootstrap — create FSPEC"`), the stripped result is already a valid folder name with no slugification needed
- PM Phase 0 Step 1 implements this same strip logic → same output for standard names

**Lock-down mechanism:** The AF-R1 contract test in `context-assembler.test.ts` will fail if `extractFeatureName()` changes behavior, signaling that SKILL.md must be updated.

### 9.2 Artifact Commit Pipeline (FSPEC-AC-01)

The new folder and `overview.md` created by Phase 0 are **untracked files** in the worktree. The `diffWorktreeIncludingUntracked()` method in `DefaultSkillInvoker` detects them as artifact changes. The `ArtifactCommitter` then stages and commits them to the feature branch after the PM's invocation completes. No changes needed in the commit pipeline.

### 9.3 ClaudeCodeClient — `cwd` Parameter

The PM agent runs with `cwd = worktreePath` (line 36 of `services/claude-code.ts`). All relative paths in the PM's Bash/Write/Read tool calls resolve from the worktree root. `docs/` is accessible as a direct relative path.

### 9.4 PM SKILL.md — Phase 0 Insertion

Phase 0 is inserted as a new section **immediately before** the existing "Task Selection — MANDATORY FIRST STEP" heading. This placement ensures Phase 0 runs on every PM invocation regardless of which task follows.

---

## 10. Known Limitations

### 10.1 Context-Assembler Mismatch for Non-Standard Thread Names (AF-R8)

For thread names that contain special characters (e.g., spaces, punctuation) OR have no ` — ` separator AND are not numbered, the PM's Phase 0 may create a folder whose name does not match what `extractFeatureName()` returns.

| Thread Name | `extractFeatureName()` result | PM Phase 0 folder name | Match? |
|-------------|-------------------------------|------------------------|--------|
| `"009-auto-feature-bootstrap — create FSPEC"` | `"009-auto-feature-bootstrap"` | `"009-auto-feature-bootstrap"` | ✅ |
| `"auth redesign — define scope"` | `"auth redesign"` (spaces) | `"008-auth-redesign"` | ❌ |
| `"create requirements for auth"` (no separator) | `"create requirements for auth"` | `"008-create-requirements-for-auth"` | ❌ |
| `"OAuth 2.0 (Google) — implement"` | `"OAuth 2.0 (Google)"` | `"008-oauth-2-0-google"` | ❌ |

**Mitigation:** Developers should follow the `{NNN}-{feature-slug} — {task description}` naming convention for Discord threads. This convention ensures the folder name always matches what the context assembler resolves.

**Not in scope:** Updating `extractFeatureName()` in `context-assembler.ts` to apply slugification — this would require changes to `context-assembler.ts` and its tests, and was explicitly deferred per AF-R8 and the Option A decision.

### 10.2 Same-Thread Concurrent PM Invocations

If two PM agents are invoked concurrently on the same thread, both may attempt to write `overview.md`. The pre-write existence check (Phase 0 Step 8) makes this safe — the second write is skipped. The result is the first writer's content is preserved. Given that worktree isolation prevents concurrent invocations on the same branch, this is extremely unlikely in practice.

---

## 11. SKILL.md Change — Exact Insertion

The following text is inserted into `.claude/skills/product-manager/SKILL.md` **immediately before** the `## Task Selection — MANDATORY FIRST STEP` heading (current line 70 in the existing file):

```markdown
---

## Phase 0: Feature Folder Bootstrap (MANDATORY — Runs Before Task Selection)

> **⚠ This step runs on EVERY PM invocation, before any task selection.** It is idempotent — if the feature folder already exists, it exits immediately. On the first invocation for a new feature, it creates the folder and writes `overview.md`.

### Step 1 — Extract candidate slug from thread name

Take the full Discord thread name from your context. Find the first occurrence of ` — ` (space, em dash U+2014, space). If found, take everything **before** it. If not found, use the full thread name. This is your **candidate**.

Example: `"009-auto-feature-bootstrap — create FSPEC"` → candidate = `"009-auto-feature-bootstrap"`

> **Note:** This strip logic must remain identical to `extractFeatureName()` in `context-assembler.ts` (AF-R1). If that function changes, this step must change too.

### Step 2 — Slugify the candidate

Apply in order:
1. Lowercase all characters
2. Replace any character NOT in `[a-z0-9-]` with a hyphen
3. Collapse consecutive hyphens (`--`, `---`, etc.) into a single hyphen
4. Strip leading and trailing hyphens
5. If the result is an **empty string**, use the fallback slug `"feature"` and log:
   `[ptah:pm] Warning: thread name could not be slugified into a meaningful name. Using fallback slug 'feature'. Please rename the Discord thread.`

The result is your **feature-slug**.

### Step 3 — Check for existing folder

```bash
test -d docs/{feature-slug} && echo "EXISTS" || echo "NOT_FOUND"
```

- **EXISTS** → Skip to Step 9. Do NOT create any files or folders.
- **NOT_FOUND** → Continue to Step 3.5.

### Step 3.5 — Verify docs/ exists

```bash
test -d docs && echo "OK" || echo "MISSING"
```

- **OK** → Continue to Step 4.
- **MISSING** → Report the following error in your response and **halt** (do not proceed to task selection):

  > `docs/ directory not found. Please run 'ptah init' to scaffold the project structure before invoking the PM skill.`

### Step 4 — Determine NNN prefix

**Condition A — Numbered thread** (feature-slug starts with `^[0-9]{3}-`):
- The NNN is already embedded. Your `full-folder-name` = `feature-slug`.
- Example: `"009-auto-feature-bootstrap"` → `full-folder-name = "009-auto-feature-bootstrap"`

**Condition B — Unnumbered thread** (feature-slug does NOT start with `^[0-9]{3}-`):
1. Run: `ls docs/ | grep -E '^[0-9]{3}-' | sort | tail -1`
2. If output is non-empty: `NNN = (first 3 chars of output, cast to int) + 1`, zero-padded to 3 digits
3. If output is empty (no numbered folders): `NNN = "001"`
4. `full-folder-name = "{NNN}-{feature-slug}"`

### Step 5 — Log

```
[ptah:pm] Bootstrapping feature folder: docs/{full-folder-name}/
```

### Step 6 — Create feature folder

```bash
mkdir -p docs/{full-folder-name}
```

- If `mkdir` **succeeds** (or folder already exists due to a race condition) → continue to Step 7.
- If `mkdir` **fails** → Report error in your response and **halt**:

  > `Failed to create feature folder docs/{full-folder-name}/: {error details}. Please check filesystem permissions.`

### Step 7 — Synthesize overview.md content

Construct the file content:

**Title line (deterministic):**
Replace all hyphens in `full-folder-name` with spaces, then title-case each word.
`"009-auto-feature-bootstrap"` → `# 009 Auto Feature Bootstrap`

**Body (1–3 sentences):**
Summarize the feature using the thread name and the user's initial message. Keep it factual and concise — this is Layer 1 reference context for all subsequent skills.

**Format:** Valid Markdown, H1 heading first, no front-matter.

### Step 8 — Write overview.md

First, check if the file already exists (race condition protection):

```bash
test -f docs/{full-folder-name}/overview.md && echo "EXISTS" || echo "NOT_FOUND"
```

- **EXISTS** → Log `[ptah:pm] overview.md already exists — skipping write.` Skip to Step 9.
- **NOT_FOUND** → Write synthesized content to `docs/{full-folder-name}/overview.md` using the **Write tool**. This write must complete before any task work begins (REQ-AF-NF-01).
  - If the write **fails** → Report error in your response and **halt**:
    > `Failed to write docs/{full-folder-name}/overview.md: {error details}. The folder was created but overview.md is missing.`

### Step 9 — Proceed to Task Selection

Phase 0 is complete. Continue to the Task Selection section below.

---
```

---

## 12. Open Questions

| # | Question | Status |
|---|----------|--------|
| OQ-TSPEC-01 | Should the `ls docs/ \| grep -E` NNN scan be made more robust against non-folder entries (e.g., files matching the `NNN-` pattern in docs/)? | Low risk — `docs/` currently contains only directories. No action needed for Phase 9. |
| OQ-TSPEC-02 | Should Phase 0 emit a structured log event (DEBUG level) that the orchestrator could surface as a progress embed? | Out of scope for Phase 9 — AF-R5 explicitly states no Discord embed for Phase 0. Normal text response is sufficient. |

---

## 13. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 14, 2026 | Backend Engineer | Initial TSPEC for Phase 9 — Auto Feature Bootstrap |
