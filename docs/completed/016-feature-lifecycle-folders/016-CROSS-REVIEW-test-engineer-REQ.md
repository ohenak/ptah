# Cross-Review: Test Engineer — REQ

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer (`qa`) |
| **Document Reviewed** | REQ-feature-lifecycle-folders (v2.3) |
| **Date** | April 4, 2026 |
| **Recommendation** | **Needs revision** |

---

## Findings

### F-01 — Medium: REQ-NF-02 acceptance criteria is prose, not Who/Given/When/Then

Every other acceptance criterion in this document uses Who/Given/When/Then format. REQ-NF-02 (Idempotent promotion and migration) is the sole exception — its AC is written as prose: "Running promotion or migration multiple times produces the same result as running it once; a partially completed promotion resumes from where it left off without re-assigning NNN."

This matters specifically because REQ-NF-02 covers the two-phase crash-recovery scenario — the hardest behavior to test. The prose AC conflates three distinct testable cases:

1. **Backlog→in-progress is idempotent** — folder already in in-progress → skip move, return success
2. **In-progress→completed Phase 1 idempotency** — destination folder already exists → skip NNN re-assignment and folder move, proceed to Phase 2
3. **In-progress→completed Phase 2 idempotency** — some files already renamed → skip those files, rename only the remaining ones

None of these are individually testable from the current prose. A test engineer deriving tests from this AC cannot distinguish the three scenarios or construct the specific pre-conditions needed to trigger each (e.g., a filesystem state where Phase 1 succeeded but Phase 2 was interrupted).

**Request:** Rewrite REQ-NF-02 acceptance criteria as three structured Who/Given/When/Then entries — one per scenario above. The description text is accurate; only the AC format needs restructuring.

---

### F-02 — Medium: REQ-SK-02 missing acceptance criterion for not-found behavior

REQ-SK-06 explicitly guarantees "the service never throws on a missing feature." REQ-SK-02 expands on the resolver contract and mentions "returns a not-found signal (not an error)" in its description. But neither requirement's AC tests this guarantee.

The THEN clause in REQ-SK-02's acceptance criterion only covers the found case ("The skill resolves the correct full path regardless of which lifecycle folder the feature is in"). There is no AC scenario for:

```
WHO:   As any Claude skill
GIVEN: No feature folder with slug `{feature-slug}` exists in any lifecycle folder
WHEN:  The resolver is called with slug `{feature-slug}`
THEN:  A not-found signal is returned (not an exception); no error is thrown
```

The no-throw guarantee is a critical contract boundary — if violated, the orchestrator workflow fails rather than recovering gracefully. It must be captured as a testable acceptance criterion in the REQ, not just stated in prose.

**Request:** Add a second acceptance criterion to REQ-SK-02 (or REQ-SK-06, whichever is the authoritative home for the resolver contract) explicitly testing the not-found case.

---

### F-03 — Low: REQ-PR-01 trigger condition is narrower than the described behavior

The REQ-PR-01 WHEN clause reads "I start reviewing the REQ document." But REQ-SK-08 states that the orchestrator runs the promotion activity "before invoking the skill" for any engineer or tech-lead invocation — not just REQ review. The FSPEC-PR-01 confirms: "the backlog→in-progress promotion is triggered during the orchestrator's pre-invocation setup for any engineer or tech-lead skill task."

A tester deriving tests from REQ-PR-01 in isolation would write a single test (REQ review triggers promotion) and miss that TSPEC creation, PLAN creation, etc. also trigger promotion when the feature is in backlog.

**Request:** Update the REQ-PR-01 WHEN clause from "I start reviewing the REQ document" to "I start any engineer or tech-lead task on this feature" to match REQ-SK-08 and FSPEC-PR-01.

---

### F-04 — Low: REQ-PR-03 missing edge case AC for empty `completed/`

The description defines the first NNN as `001` when no numbered folders exist in `completed/`. But the acceptance criterion only tests the "multiple features have been completed over time" scenario. There is no GIVEN/WHEN/THEN for:

```
GIVEN: docs/completed/ contains no numbered folders
WHEN:  The first feature is promoted to completed
THEN:  Its NNN is 001
```

This is a straightforward boundary condition that should appear in the AC.

---

### F-05 — Low: REQ-SK-02 missing AC for multi-folder collision warning

The description specifies: "If the same slug is found in more than one lifecycle folder simultaneously... the resolver must log a warning and return the first match according to search order — it must not throw an error." This is a testable behavioral invariant (log output + return value), but the acceptance criterion only tests the single-match case.

A negative test case should be added for the collision scenario: given a slug present in both `backlog/` and `in-progress/`, a warning is logged and the `in-progress/` result is returned.

---

### F-06 — Low: REQ-SK-08 missing negative AC for single sign-off

The second acceptance criterion in REQ-SK-08 tests that the completion promotion runs when both sign-offs are received. There is no complementary negative test:

```
WHO:   As the Ptah orchestrator
GIVEN: Only one of the two required sign-off signals has been received (test-engineer OR product-manager, but not both)
WHEN:  No additional sign-off arrives
THEN:  The completion promotion activity is NOT triggered; the workflow continues waiting
```

This negative case is explicitly specified in FSPEC-PR-01 as AT-PR-06. Having it in the REQ as well closes the traceability gap.

---

## Clarification Questions

**Q-01:** REQ-PR-04 scopes internal reference updates to `[text](filename.md)` and `[text](./filename.md)` patterns. Does this scope intentionally exclude wiki-style links, reference-style links (`[text][ref]`), or HTML `<a href="">` patterns? Confirming the intended exclusions would help derive clear negative test cases (e.g., "reference-style links are NOT updated").

---

## Positive Observations

- The Who/Given/When/Then format is applied consistently across all requirements — with the one exception noted in F-01. This makes the vast majority of ACs directly translatable to test scripts.
- REQ-WT-03's acceptance criterion is exemplary: it uses concrete paths (`/tmp/ptah-wt-{uuid}/docs/in-progress/`) that immediately map to unit test assertions.
- REQ-NF-01's AC is precise and directly testable (`git log --follow docs/completed/001-init/overview.md shows commits from before the migration`).
- The Risks section (§7) is unusually strong — R-03 identifies the exact file paths and line numbers of hardcoded `docs/` references in the orchestrator source. This gives test engineers precise targets for regression tests.
- REQ-WT-04's formula (`path.join(state.worktreeRoot, state.featurePath, filename)`) is expressed in concrete, testable terms.
- REQ-NF-02's description accurately captures the two-phase idempotency check (Phase 1: folder check, Phase 2: per-file check). The only issue is format, not content.

---

## Recommendation

**Needs revision.** F-01 (Medium) and F-02 (Medium) must be addressed before a test properties document can be reliably derived from this REQ. F-01 requires restructuring the REQ-NF-02 AC into three structured Who/Given/When/Then scenarios. F-02 requires adding a not-found acceptance criterion to REQ-SK-02 or REQ-SK-06. The Low findings (F-03 through F-06) are non-blocking but should be addressed in the same revision pass.

The author must address F-01 and F-02 and route the updated REQ back for re-review.
