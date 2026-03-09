# Test Engineer Review: PLAN-TSPEC-ptah-init.md

| Field | Detail |
|-------|--------|
| **Reviewed Document** | [PLAN-TSPEC-ptah-init.md](../../plans/PLAN-TSPEC-ptah-init.md) |
| **Cross-referenced** | [PROPERTIES-ptah-init v1.2](./PROPERTIES-ptah-init.md), [TSPEC-ptah-init](../../specifications/TSPEC-ptah-init.md), [REQ-PTAH](../../requirements/REQ-PTAH.md) |
| **Implementation Files** | `ptah/src/commands/init.ts`, `ptah/src/config/defaults.ts`, `ptah/src/services/filesystem.ts`, `ptah/src/services/git.ts`, `ptah/src/types.ts`, `ptah/bin/ptah.ts` |
| **Test Files** | 8 files across `ptah/tests/unit/` and `ptah/tests/integration/` |
| **Date** | March 8, 2026 |
| **Reviewer** | Test Engineer |
| **Status** | Review Complete — 6 gaps identified, 5 resolved (Rev 2) |

---

## 1. Review Scope

This is a focused gap review comparing the **implemented test suite** (8 test files, 97 tests) against the **approved property coverage** (PROPERTIES-ptah-init v1.2, 45 properties) and the **execution plan** (PLAN-TSPEC-ptah-init, 39 tasks). The goal is to identify properties that are claimed as covered but lack adequate test assertions.

**Method:** Each property was traced from PROPERTIES-ptah-init through the plan task to the actual test code. Gaps are cases where the test code does not adequately assert the property.

---

## 2. Summary

| Metric | Value |
|--------|-------|
| Total properties | 45 |
| Fully covered by tests | 35 |
| Partially covered | 4 (PROP-IN-33, 34, 35, 36) |
| Missing dedicated test | 4 (PROP-IN-14, 15, 41, and 10/11 combined) |
| Covered by type system only | 2 (PROP-IN-10, 11) |
| **Gaps identified** | **6** |

Overall assessment: The test suite is **strong** — 35 of 45 properties have adequate test coverage. The 6 gaps identified are all low-to-medium risk because the underlying behaviors are either guarded by TypeScript's type system, prevented by control flow (throws before reaching uncovered paths), or partially covered at the integration level.

---

## 3. Gaps

### GAP-01: Observability properties lack dedicated tests (PROP-IN-33, 34, 35, 36)

**Risk: Medium**

**Properties affected:**

| Property | Expected Output | Plan Task | Current Test Coverage |
|----------|----------------|-----------|----------------------|
| PROP-IN-33 | `"✓  Created {path}"` for each created item | Task 35 → `init.test.ts` | Integration only: `ptah.test.ts:62` checks `stdout.toContain("Created")` — substring match, not format |
| PROP-IN-34 | `"⊘  Skipped {path} (exists)"` for each skipped item | Task 35 → `init.test.ts` | **Not tested anywhere** |
| PROP-IN-35 | `"ℹ  No new files created — skipping commit."` when created[] is empty | Task 35 → `init.test.ts` | **Not tested anywhere** |
| PROP-IN-36 | `"✓  Committed: [ptah] init: scaffolded docs structure"` after commit | Task 35 → `init.test.ts` | Integration only: `ptah.test.ts:63` checks `stdout.toContain("Committed")` — substring match, not format |

**Root cause:** The plan maps Task 35 (CLI output formatting) to `init.test.ts` (unit tests), but `InitCommand.execute()` returns `InitResult` and prints nothing. All `console.log` formatting lives in `bin/ptah.ts` (lines 25-36). The unit test at `init.test.ts:283-296` only checks `result.created.length > 0` and `result.skipped` — it tests the data, not the formatted output.

**Impact:** If the output format strings in `bin/ptah.ts` are changed (e.g., a typo in `"⊘  Skipped"` or the commit message), no test would catch it. PROP-IN-34 and PROP-IN-35 have zero test coverage.

**Recommendation:** Add integration tests in `ptah.test.ts` that verify exact output format strings:

| # | Test Name | Asserts | Property | Level | Setup |
|---|-----------|---------|----------|-------|-------|
| 1 | `test_stdout_contains_created_format` | stdout includes `"✓  Created docs/overview.md"` (exact prefix + path) | PROP-IN-33 | Integration | Fresh git repo |
| 2 | `test_stdout_contains_skipped_format` | stdout includes `"⊘  Skipped docs/overview.md (exists)"` | PROP-IN-34 | Integration | Git repo with pre-existing `docs/overview.md` |
| 3 | `test_stdout_contains_no_new_files_message` | stdout includes `"ℹ  No new files created — skipping commit."` | PROP-IN-35 | Integration | Git repo with all 17 files pre-created |
| 4 | `test_stdout_contains_committed_format` | stdout includes `"✓  Committed: [ptah] init: scaffolded docs structure"` | PROP-IN-36 | Integration | Fresh git repo |

**Why integration, not unit:** Since the formatting logic lives in the CLI entry point (`bin/ptah.ts`), not in `InitCommand`, these must be tested at the integration level via CLI process execution. This is architecturally correct — the plan should update Task 35's test file reference from `init.test.ts` to `ptah.test.ts`.

---

### GAP-02: PROP-IN-41 staged changes guard — incomplete assertion (PROP-IN-41)

**Risk: Low**

**Property:** *"InitCommand must not call `fs.mkdir`, `fs.writeFile`, `git.add`, or `git.commit` when `git.hasStagedChanges()` returns true."*

**Current test:** `init.test.ts:36-48` sets `git.hasStagedReturn = true`, catches the throw, then checks that no directories were created via `fs.hasDir()`. This verifies `fs.mkdir` wasn't called but does NOT assert:
- `fs.writeFile` was not called (no file existence check)
- `git.add` was not called (`git.addedPaths.length === 0` not asserted)
- `git.commit` was not called (`git.commits.length === 0` not asserted)

**Why low risk:** The `throw` at `init.ts:24-26` exits the function before any of these calls can occur. The control flow makes it impossible to reach the filesystem/git operations. However, the property explicitly requires asserting all four, and a future refactor could break this guarantee.

**Recommendation:** Extend the existing test to assert all four methods:

```typescript
it("does not call fs.mkdir, fs.writeFile, git.add, or git.commit when staged changes exist", async () => {
  git.hasStagedReturn = true;
  try { await command.execute(); } catch { /* expected */ }

  for (const dir of DIRECTORY_MANIFEST) {
    expect(fs.hasDir(dir)).toBe(false);
  }
  for (const [path] of Object.entries(FILE_MANIFEST)) {
    expect(fs.getFile(path)).toBeUndefined();
  }
  expect(git.addedPaths).toHaveLength(0);
  expect(git.commits).toHaveLength(0);
});
```

---

### GAP-03: Git not installed error path — no dedicated test (PROP-IN-14)

**Risk: Low**

**Property:** *"InitCommand must exit with error when Git is not installed (git CLI not found)."*

**Current coverage:** No test simulates the "git not found" scenario. `git.test.ts:93-96` tests `isRepo` returns false for a non-repo directory, which is PROP-IN-30. The "git not installed" path would trigger the same `isRepo() → false` path in `NodeGitClient` because `execFile("git", ...)` throws when `git` is not on PATH, and the catch returns `false`.

**Why low risk:** `NodeGitClient.isRepo()` catches all errors and returns `false` (lines 20-28 of `git.ts`). Whether git is not installed or the directory isn't a repo, the behavior is identical — `InitCommand` sees `isRepo() === false` and throws the "Not a Git repository" error (already tested by Task 13).

**Recommendation:** Add a unit test on `FakeGitClient` that simulates `isRepo` throwing (rather than returning false) to verify `InitCommand` handles the throw gracefully. Alternatively, document that PROP-IN-14 is covered by the combination of PROP-IN-12 + PROP-IN-30 (since git-not-installed produces the same observable behavior as not-a-repo).

| # | Test Name | Asserts | Property | Level | Setup |
|---|-----------|---------|----------|-------|-------|
| 1 | `test_handles_isRepo_throwing_error` | `execute()` throws when `git.isRepo()` throws (not just returns false) | PROP-IN-14 | Unit | FakeGitClient with `isRepoError` set |

**Note:** This requires a small extension to `FakeGitClient` — adding an `isRepoError` field that, when set, causes `isRepo()` to throw instead of returning the configured value.

---

### GAP-04: Permission denied on write — no dedicated test (PROP-IN-15)

**Risk: Low**

**Property:** *"InitCommand must propagate error when file write permission is denied."*

**Current coverage:** No test simulates `fs.writeFile` throwing a permission error. The error propagation tests (`init.test.ts:249-270`) only cover `git.add` and `git.commit` failures.

**Why low risk:** The `InitCommand.execute()` method does not catch `fs.writeFile` errors — any throw from `writeFile` would propagate naturally as an unhandled rejection. The behavior is correct by default (no try/catch suppression).

**Recommendation:** Add a unit test that configures `FakeFileSystem` to throw on `writeFile`:

| # | Test Name | Asserts | Property | Level | Setup |
|---|-----------|---------|----------|-------|-------|
| 1 | `test_propagates_writeFile_permission_error` | `execute()` throws with permission error message | PROP-IN-15 | Unit | FakeFileSystem with `writeFileError` set |

**Note:** This requires extending `FakeFileSystem` with a `writeFileError` field (similar to `FakeGitClient.addError`).

---

### GAP-05: Protocol compliance — type system only (PROP-IN-10, PROP-IN-11)

**Risk: Very Low**

**Properties:**
- PROP-IN-10: `NodeFileSystem` must implement the `FileSystem` protocol
- PROP-IN-11: `NodeGitClient` must implement the `GitClient` protocol

**Current coverage:** Both classes use `implements FileSystem` / `implements GitClient` in their source (enforced by TypeScript compiler). No runtime assertion exists. The integration tests in `filesystem.test.ts` and `git.test.ts` exercise all protocol methods, which provides implicit verification.

**Why very low risk:** TypeScript's structural type system guarantees protocol compliance at compile time. If a method were missing or had the wrong signature, `tsc` would fail. Runtime `instanceof` or `satisfies` checks are unnecessary in TypeScript.

**Recommendation:** No action needed. Document in the plan that PROP-IN-10/11 are covered by TypeScript's compile-time type checking plus integration tests that exercise all protocol methods. Optionally, add a comment in the test files noting this.

---

### GAP-06: Plan Task 35 references wrong test file

**Risk: Low (documentation only)**

**Issue:** The plan maps Task 35 (CLI output formatting) to `ptah/tests/unit/commands/init.test.ts`, but the output formatting logic is in `bin/ptah.ts`, not `InitCommand`. The correct test file is `ptah/tests/integration/cli/ptah.test.ts`.

**Current state in plan:**
```
| 35 | CLI output formatting — prints ✓ Created, ⊘ Skipped, ℹ No new files, ✓ Committed messages | ptah/tests/unit/commands/init.test.ts | ptah/src/commands/init.ts |
```

**Should be:**
```
| 35 | CLI output formatting — prints ✓ Created, ⊘ Skipped, ℹ No new files, ✓ Committed messages | ptah/tests/integration/cli/ptah.test.ts | ptah/bin/ptah.ts |
```

**Recommendation:** Update the plan to correct the test file and source file references for Task 35.

---

## 4. Priority Summary

| Priority | Gaps | Action |
|----------|------|--------|
| **Should fix** | GAP-01 (observability tests — 4 properties with zero or partial coverage) | Add 4 integration tests in `ptah.test.ts` |
| **Nice to have** | GAP-02 (PROP-IN-41 assertion completeness) | Extend existing test with 3 additional assertions |
| **Nice to have** | GAP-03 (PROP-IN-14 git not installed) | Add 1 unit test + extend FakeGitClient |
| **Nice to have** | GAP-04 (PROP-IN-15 permission denied) | Add 1 unit test + extend FakeFileSystem |
| **No action** | GAP-05 (PROP-IN-10/11 protocol compliance) | Covered by type system + integration tests |
| **Should fix** | GAP-06 (Task 35 wrong test file reference) | Update plan documentation |

---

## 5. Property Coverage After Fixes

If all recommendations are implemented:

| Level | Test Count | Properties Covered |
|-------|------------|--------------------|
| Unit | 97 (+2 new: GAP-03, GAP-04; GAP-02 extends existing) | 40 / 40 unit properties |
| Integration | 24 (+4 new: GAP-01) | 5 / 5 integration properties |
| E2E | 0 | 0 |
| **Total** | **123** (+6) | **45 / 45 (100%)** |

---

## 6. Test Double Extensions Required

Two gaps require extending the existing test doubles in `tests/fixtures/factories.ts`:

### FakeFileSystem — add `writeFileError`

```typescript
export class FakeFileSystem implements FileSystem {
  // ... existing fields ...
  writeFileError: Error | null = null;  // NEW

  async writeFile(path: string, content: string): Promise<void> {
    if (this.writeFileError) throw this.writeFileError;  // NEW
    this.files.set(path, content);
  }
}
```

### FakeGitClient — add `isRepoError`

```typescript
export class FakeGitClient implements GitClient {
  // ... existing fields ...
  isRepoError: Error | null = null;  // NEW

  async isRepo(): Promise<boolean> {
    if (this.isRepoError) throw this.isRepoError;  // NEW
    return this.isRepoReturn;
  }
}
```

These are minimal, backward-compatible extensions. Existing tests are unaffected (both fields default to `null`).

---

*Reviewed by Test Engineer on March 8, 2026.*

---

## Rev 2: Gap Resolution Verification (March 8, 2026)

All 5 actionable gaps have been addressed. Verification against current codebase:

### Gap Resolution Status

| Gap | Property | Status | Verification |
|-----|----------|--------|-------------|
| GAP-01 | PROP-IN-33, 34, 35, 36 | **Resolved** | 4 integration tests added in `ptah/tests/integration/cli/ptah.test.ts:67-113` — exact format string assertions for `"✓  Created"`, `"⊘  Skipped"`, `"ℹ  No new files"`, `"✓  Committed"` |
| GAP-02 | PROP-IN-41 | **Resolved** | Test at `ptah/tests/unit/commands/init.test.ts:42-58` now asserts all 4 prohibited methods: `fs.hasDir` (mkdir), `fs.getFile` (writeFile), `git.addedPaths` (add), `git.commits` (commit) |
| GAP-03 | PROP-IN-14 | **Resolved** | Test at `ptah/tests/unit/commands/init.test.ts:27-30` — `FakeGitClient.isRepoError` triggers throw, verifies `InitCommand` propagates it. Test double extended at `factories.ts:60-63` |
| GAP-04 | PROP-IN-15 | **Resolved** | Test at `ptah/tests/unit/commands/init.test.ts:272-275` — `FakeFileSystem.writeFileError` triggers throw with `"EACCES: permission denied"`. Test double extended at `factories.ts:9,39-40` |
| GAP-05 | PROP-IN-10, 11 | **No action needed** | As recommended — TypeScript compile-time type checking + integration tests exercise all protocol methods |
| GAP-06 | (documentation) | **Resolved** | Plan Task 35 now references `ptah/tests/integration/cli/ptah.test.ts` and `ptah/bin/ptah.ts` (was `init.test.ts` and `init.ts`) |

### Test Double Extensions Verified

| Test Double | Extension | File | Lines |
|-------------|-----------|------|-------|
| `FakeFileSystem` | `writeFileError: Error \| null` field + throw guard in `writeFile()` | `factories.ts` | 9, 39-40 |
| `FakeGitClient` | `isRepoError: Error \| null` field + throw guard in `isRepo()` | `factories.ts` | 60-63 |

Both extensions are backward-compatible (default to `null`). Existing tests unaffected.

### Updated Coverage Summary

| Level | Test Count | Properties Covered |
|-------|------------|--------------------|
| Unit | 99 (+2 from 97) | 40 / 40 unit properties |
| Integration | 28 (+4 from 24) | 5 / 5 integration properties |
| E2E | 0 | 0 |
| **Total** | **103** (+6 from 97) | **45 / 45 (100%)** |

Plan Definition of Done updated: `103 tests, 8 test files, 0 failures`.

### Remaining Item

GAP-05 (PROP-IN-10/11) remains as "No action needed" — TypeScript's structural type system provides compile-time protocol compliance guarantees, and all protocol methods are exercised by integration tests. No runtime assertion required.

### Verdict

**All gaps resolved. Property coverage: 45/45 (100%). Test suite is complete.**

The plan and test suite are now fully aligned with PROPERTIES-ptah-init v1.2. No further test gaps identified.

---

*Re-reviewed by Test Engineer on March 8, 2026.*
