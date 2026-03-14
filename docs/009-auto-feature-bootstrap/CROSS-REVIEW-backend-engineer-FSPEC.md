# Cross-Review: Backend Engineer — FSPEC-PTAH-PHASE9

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | [009-FSPEC-ptah-auto-feature-bootstrap.md](./009-FSPEC-ptah-auto-feature-bootstrap.md) |
| **Requirements Cross-Referenced** | [009-REQ-PTAH-auto-feature-bootstrap.md](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| **Date** | March 13, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Summary

The FSPEC is exceptionally well-structured for a skills-based (natural language instruction) implementation. The behavioral flow is clear, business rules are comprehensive, and the acceptance tests follow the correct Who/Given/When/Then format. Two issues need correction before handoff to engineering — one of which (F-01) is high severity because it describes the wrong separator character, which could cause an engineer implementing from the spec text alone to introduce a bug that is hard to debug at runtime.

---

## Findings

### F-01 (High): Em dash character is misdescribed in FSPEC §3.4 Step 1b

**Location:** FSPEC §3.4 behavioral flow, Step 1b; also REQ-AF-04 description

**Finding:**
The FSPEC Step 1b says:
> Strip everything after the first occurrence of `" — "` (space–**hyphen-hyphen**–space)

REQ-AF-04 says:
> strip everything after ` — ` (space–**en-dash**–space)

The actual `extractFeatureName()` implementation in `context-assembler.ts` line 142 uses:
```typescript
const emDashIndex = threadName.indexOf(" \u2014 ");
```

`\u2014` is the **em dash** (`—`, U+2014). Neither "hyphen-hyphen" (`--`) nor "en-dash" (`–`, U+2013) is correct. The visual character in the FSPEC and REQ documents _is_ an em dash — the mistake is only in the parenthetical description.

**Risk:** An engineer implementing from the spec description (rather than from the source file) could choose to split on `" -- "` or `" – "` instead of `" — "`. Discord users may compose thread names with any of these characters. Using the wrong separator means `extractFeatureName()` and the PM's Phase 0 logic would produce different feature slugs for certain thread names, violating business rule AF-R1 (identical logic requirement).

**Fix:** Update FSPEC §3.4 Step 1b parenthetical to read "(space–**em-dash**–space, Unicode U+2014 `—`)". Update REQ-AF-04 description to match. The visual `—` in the spec is correct; only the parenthetical description needs to change.

---

### F-02 (Medium): Edge case §3.6 row 1 describes the wrong resulting folder name

**Location:** FSPEC §3.6 edge cases, first row ("Thread name contains only a number prefix with no feature name")

**Finding:**
The edge case describes thread name `"009 — create FSPEC"`. After stripping the ` — create FSPEC` portion, the result is `"009"`. After slugification, the result is also `"009"` (digits are allowed as-is).

The FSPEC then says:
> The folder would be `docs/009/`.

But Step 4a's condition is:
> The feature-slug begins with exactly 3 digits **followed by a hyphen** (regex: `^[0-9]{3}-`)

The string `"009"` does **not** match `^[0-9]{3}-` — there is no trailing hyphen. Therefore Step 4b (unnumbered, auto-assign) applies. The resulting folder would be something like `docs/008-009/` (if 007 is the highest existing numbered folder), not `docs/009/`.

**Risk:** A developer reading the edge case would expect the folder to be named `docs/009/`, but the actual logic produces a name like `docs/008-009/`. This would also cause the context assembler to look for `docs/009/` (derived from the thread name via `extractFeatureName()`) but find nothing — violating business rule AF-R1.

**Options:**
- **Option A (recommended):** Accept that this is a degenerate thread name and correct the edge case description to say the resulting folder is `docs/{NNN}-009/` where NNN is auto-assigned. Note that this would cause a mismatch with `extractFeatureName()` (which would resolve to `docs/009/`) and therefore should be documented as a known limitation rather than a supported use case. Advise developers against naming threads with only a number.
- **Option B:** Extend Step 4a's regex to `^[0-9]{3}(-|$)` to also match bare 3-digit slugs like "009", then special-case the folder name as `docs/009/`. This preserves the edge case behavior described in the spec but adds complexity.

Option A is simpler — the edge case is genuinely degenerate and developers should be steered away from it via the log warning (AF-R5 already fires for empty slugs; a similar advisory note for digit-only slugs would help).

---

### F-03 (Low): FSPEC does not specify which filesystem path is `docs/` relative to

**Location:** FSPEC §3.4 Step 3 (folder check), Step 4b (NNN scan), Step 6 (folder creation), Step 8 (overview write)

**Finding:**
The FSPEC consistently says "check if `docs/{feature-slug}/` exists" and "scan `docs/`" without specifying what `docs/` is relative to. In the ptah codebase, `docs/` is at the repository root, but `ptah/` (the Node.js source) is a subdirectory. The context assembler resolves docs via `config.docs.root` (typically `"../docs"` relative to `ptah/`).

The PM skill runs inside a Git worktree. The worktree root is the repository root (where `docs/` lives), but the PM skill's CWD during tool execution may or may not be the worktree root. The FSPEC depends on `FSPEC-SI-01` (worktree isolation) — engineering needs to confirm what CWD the PM's tool calls use inside the worktree so that `docs/` resolves correctly.

**Risk:** Low — this is an implementation detail that the TSPEC should resolve by specifying the exact path strategy (e.g., "use `git rev-parse --show-toplevel` to find the repo root, then append `docs/`"). The FSPEC is appropriately leaving implementation details to engineering. Flagging for awareness.

**Recommendation:** No FSPEC change needed. TSPEC should specify path resolution explicitly.

---

### F-04 (Low): AT-AF-01 — overview.md content is under-specified in the acceptance test

**Location:** FSPEC §3.7, AT-AF-01, step 7

**Finding:**
AT-AF-01 step 7 says:
> I write: `docs/009-auto-feature-bootstrap/overview.md` with a 1–3 sentence summary of the auto feature bootstrap feature

The acceptance test does not specify anything about the content quality or source — it just says "1–3 sentence summary." Step 7a in §3.4 specifies that the H1 heading must use the folder name with hyphens replaced by spaces and title-cased, which AT-AF-01 step 8 does verify. But the body content has no verifiable criteria in the acceptance test.

This is intentionally flexible (the synthesis is an LLM output), but it means the test is not fully automatable — a human must judge whether the summary is "accurate." This is acceptable given the nature of the feature, but the QA team should be aware that AT-AF-01 step 7 requires human evaluation, not automated assertion.

**Risk:** Very low — the spec is correct, it's just worth noting for the test engineer. No FSPEC change needed.

---

## Clarification Questions

### Q-01: Should `extractFeatureName()` in `context-assembler.ts` be the canonical implementation reference?

The FSPEC requires the PM skill's slugification to be "identical" to `extractFeatureName()` (business rule AF-R1). But `extractFeatureName()` only strips the em dash suffix — it does **not** apply the full slugification rules in Steps 2a–2f (lowercase, replace non-alphanumeric, collapse hyphens, etc.). The current `extractFeatureName()` returns the raw stripped name without further normalization.

This means if `context-assembler.ts` uses the raw stripped thread name as the folder path key (e.g. `"My New Feature (v2)"`), but the PM skill slugifies it to `"my-new-feature-v2"`, the context assembler would look for `docs/My New Feature (v2)/` and miss the `docs/my-new-feature-v2/` folder the PM created.

**Observation from codebase:** Looking at existing `docs/` folders — all are lowercase-hyphenated, suggesting thread names already follow the slug convention or are manually created that way. There are no existing folders with spaces or special characters.

**Question for PM:** Can thread names be assumed to always follow the `NNN-slug — task` convention (all lowercase, hyphens, no special characters), or must the implementation handle the full slugification path described in Steps 2a–2f?

If special characters are possible in thread names, then `extractFeatureName()` in `context-assembler.ts` must also be updated to apply the same slugification — otherwise the folder the PM creates will not be found by the context assembler. This would be a required change to `context-assembler.ts`, contradicting business rule AF-R8 ("No changes to `context-assembler.ts` are required").

---

## Positive Observations

1. **AF-R1 (identical logic requirement)** is the most important business rule in the spec and it is correctly identified. The PM creating a folder that the context assembler cannot find would be a silent failure — hard to debug. Calling this out explicitly is the right call.

2. **Exact-slug folder check** (§3.6 edge case row 7) is an important correctness detail. Checking for `docs/001-custom-feature/` rather than any `docs/001-*/` prevents false matches when multiple features share an NNN prefix. Well-specified.

3. **Idempotency design** (REQ-AF-07 / Step 3) is the right architecture for a distributed, concurrent agent environment. The existence check is simple and reliable.

4. **Error halting rules** (AF-R6, AF-R7, AT-AF-05, AT-AF-06) are comprehensive. Specifying that the PM halts on filesystem errors and does NOT proceed to Phase 1 is exactly right — silent failures in the bootstrap would produce confusing context-assembly warnings on every subsequent invocation.

5. **The dependency structure** correctly identifies FSPEC-AC-01 (artifact commits) and FSPEC-SI-01 (worktree isolation) as the underpinnings of this feature. The PM does not need to implement any git operations itself — the existing pipeline handles it.

6. **Acceptance test AT-AF-07** correctly tests that the existence check is against the exact slug, not just the NNN prefix. This is easy to get wrong in implementation.

---

## Recommendation

**Approved with minor changes.**

- **Must fix before TSPEC:** F-01 (em dash character description) — correct the parenthetical in §3.4 Step 1b and REQ-AF-04 to say "(space–em-dash–space, Unicode U+2014)".
- **Should clarify before TSPEC:** F-02 (edge case §3.6 row 1 folder name) — correct the expected folder name or explicitly document the behavior as unsupported/degenerate.
- **Q-01 needs PM answer before TSPEC:** The relationship between `extractFeatureName()` (no slugification) and the PM's slugification logic is the critical correctness concern for this feature. If thread names can contain special characters, `context-assembler.ts` must also be updated — which contradicts AF-R8. This needs to be resolved so engineering knows the scope of the `context-assembler.ts` changes (if any).
- F-03 and F-04 can be addressed entirely in the TSPEC.
