# Cross-Review: Backend Engineer — FSPEC-PTAH-PHASE9 (v1.3)

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | [009-FSPEC-ptah-auto-feature-bootstrap.md](./009-FSPEC-ptah-auto-feature-bootstrap.md) |
| **Requirements Cross-Referenced** | [009-REQ-PTAH-auto-feature-bootstrap.md](./009-REQ-PTAH-auto-feature-bootstrap.md) |
| **Date** | March 14, 2026 |
| **FSPEC Version** | 1.3 |
| **Recommendation** | Approved |

---

## Summary

This is a re-review of the FSPEC following the v1.2 and v1.3 revisions that addressed my prior findings (F-01, F-02) and the QA findings (F-TE-01 through F-TE-07). All six new acceptance tests (AT-AF-08 through AT-AF-12, AT-AF-04 precision fix) have been verified against the behavioral flow and business rules. The FSPEC is now comprehensive and internally consistent.

One low-severity observation is raised about AT-AF-12 — it correctly describes PM behavior but does not acknowledge the context-assembler mismatch that would result (a known limitation already covered by AF-R8 for special-character threads). This is for awareness only and does not block approval.

---

## Prior Finding Resolution

### F-01 (High, previously raised) — Em dash description ✅ Fixed

**Location:** FSPEC §3.4 Step 1b

The parenthetical now correctly reads "(space–em-dash–space, Unicode U+2014 `—`)". This matches the `\u2014` used in `extractFeatureName()` in `context-assembler.ts`. The fix is correct and complete.

### F-02 (Medium, previously raised) — Edge case §3.6 row 1 folder name ✅ Fixed

**Location:** FSPEC §3.6 edge cases, first row

The edge case now correctly states the folder would be `docs/008-009/` (via Step 4b auto-assign) and documents the resulting context-assembler mismatch as a known limitation. Developers are advised against naming threads with only a bare number. The fix is correct and complete.

### Q-01 (previously raised) — `extractFeatureName()` vs PM slugification alignment ✅ Addressed

The FSPEC extended AF-R8 to explicitly document the known limitation: when thread names contain special characters requiring slugification, the folder the PM creates may not match the path `extractFeatureName()` resolves. Full slugification support in `context-assembler.ts` is documented as out of scope for Phase 9. This is an acceptable product decision. The TSPEC will need to document this as a known gap for future phases.

---

## New Findings (v1.3)

### F-BE-01 (Low): AT-AF-12 does not acknowledge the context-assembler mismatch for no-separator threads

**Location:** FSPEC §3.7, AT-AF-12

**Finding:**
AT-AF-12 describes the correct PM behavior when a thread has no `" — "` separator (e.g., `"create requirements for auth"`): the PM uses the full thread name, slugifies it to `"create-requirements-for-auth"`, auto-assigns NNN=008, and creates `docs/008-create-requirements-for-auth/`.

However, the acceptance test does not note that subsequent context assembly will fail to find this folder. `extractFeatureName()` in `context-assembler.ts` returns the raw thread name `"create requirements for auth"` (spaces preserved, no NNN prefix), so the context assembler would look for `docs/create requirements for auth/` — a double mismatch with the PM-created folder on both slugification and NNN prefix.

This is a broader instance of the known limitation in AF-R8 (which focuses on special-character slugification). The no-separator case with an unnumbered thread name creates the same kind of mismatch.

**Risk:** Low — AF-R8 already covers this class of issue. AT-AF-12 is correctly scoped to PM behavior only. However, a developer reading AT-AF-12 in isolation might not realize the folder will be invisible to the context assembler.

**Recommendation:** Add a brief note to AT-AF-12 (similar to the note in edge case §3.6 row 1) stating this is a known limitation per AF-R8. No structural change needed — documentation only. Does not block TSPEC creation.

---

## New Acceptance Tests Verification

### AT-AF-08 (empty-slug fallback) ✅

Trace verified:
- Strip after `" — "`: `"!!!"`
- Slugify: `"!!!"` → replace non-[a-z0-9-] → `"---"` → collapse → `"-"` → strip → `""`
- Fallback slug: `"feature"` with warning logged ✓
- NNN auto-assign: `"feature"` does not match `^[0-9]{3}-` → scan → highest=007 → NNN=008 ✓
- Folder: `docs/008-feature/` ✓
- Overview title: `"# 008 Feature"` ✓

### AT-AF-09 (race-condition overview.md skip) ✅

The Step 8a/8b split in the behavioral flow correctly handles this. The acceptance test verifies the right behavior: skip write, log message, preserve existing content. Consistent with AF-R4. ✓

### AT-AF-10 (NNN=001 base case) ✅

The edge of `scan docs/ → no numbered folders → NNN="001"` is correctly specified in Step 4b and verified in AT-AF-10. ✓

### AT-AF-11 (overview.md write failure — halt) ✅

Consistent with AF-R7. The accepted state (empty folder remaining on disk) is correctly documented. ✓

### AT-AF-04 (precision fix — deterministic title) ✅

Title `"# 008 Oauth 2 0 Google"` is now stated deterministically. Verified: folder name `"008-oauth-2-0-google"` → replace hyphens with spaces → `"008 oauth 2 0 google"` → title-case each word → `"008 Oauth 2 0 Google"`. ✓

### AT-AF-12 (no separator thread name) ✅ (with note — see F-BE-01)

PM behavior is correctly specified. Folder `docs/008-create-requirements-for-auth/`, title `"# 008 Create Requirements For Auth"`. Verified against slugification rules. ✓ Context-assembler mismatch is a known limitation per F-BE-01.

---

## Positive Observations

1. **v1.3 raised acceptance test count from 7 to 12** — all previously untested paths (empty slug, race conditions, write failure, no-separator names) are now covered. This substantially improves testability.

2. **Step 8a/8b split** (explicit pre-write existence check) is the right design for the concurrent write race condition. It makes idempotency logic explicit at each decision point rather than relying on implicit OS semantics.

3. **AF-R8 scope limitation** is correctly documented. By explicitly naming what Phase 9 does NOT change in `context-assembler.ts`, the spec prevents scope creep and sets clear expectations for the TSPEC.

4. **Business rules section** (§3.5) remains the strongest part of this spec. AF-R1 (identical slugification requirement) is the single most important correctness constraint and is unambiguously stated.

5. **Codebase cross-check passes.** `extractFeatureName()` in `context-assembler.ts` uses `\u2014` (em dash), matching FSPEC Step 1b. Path resolution for `docs/` uses `config.docs.root` and `worktreePath` correctly — the TSPEC will need to confirm the PM skill's CWD during tool execution (F-03 from prior review, appropriately deferred to TSPEC).

---

## Recommendation

**Approved.**

F-BE-01 is documentation-only and does not block TSPEC creation. The TSPEC author should:
1. Note the context-assembler mismatch for no-separator thread names as a known limitation (extends AF-R8).
2. Specify the CWD / path resolution strategy for `docs/` in the PM skill's tool execution context (F-03, still deferred to TSPEC).

The FSPEC is ready for engineering handoff.
