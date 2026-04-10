# Cross-Review: Test Engineer — REQ-016 Agent Coordination

| Field | Detail |
|-------|--------|
| **Reviewer** | Test Engineer |
| **Document Reviewed** | REQ-agent-coordination.md (REQ-016 v1.2) |
| **Supporting Document** | CROSS-REVIEW-engineer-REQ.md (Engineer cross-review) |
| **Review Date** | 2026-04-07 |
| **Recommendation** | Needs revision |

---

## Findings

### F-01 — REQ-WB-01 acceptance criterion does not cover the case where the upstream agent's push fails before the downstream agent starts (High)

**Affects:** REQ-WB-01

The acceptance criterion for REQ-WB-01 assumes the "happy path": the PM has committed and pushed artifacts and the downstream agent reads them. There is no acceptance criterion covering the failure mode where the prior agent's push to `feat-{featureSlug}` fails silently (e.g., network error, push rejected due to a race with another push). In that case, the downstream agent's worktree would be created from a stale HEAD that does not include the expected artifacts. From the downstream agent's perspective, the files simply do not exist — but no error is surfaced at the orchestration layer.

Without a testable AC for the upstream-push-failure scenario, there is no test obligation to verify that the system detects and reports this condition. A test suite built from the current REQ would only cover the happy path and leave this critical integration failure entirely undetected.

**Required action:** Add an acceptance criterion specifying the expected system behavior when a prior agent's push fails before the downstream worktree is created — e.g., the invokeSkill activity must fail (not silently succeed) so Temporal can retry or escalate.

---

### F-02 — REQ-MR-01 acceptance criterion only covers one positive parse case; no negative test cases are specified (High)

**Affects:** REQ-MR-01

The acceptance criterion for REQ-MR-01 gives one example: a message beginning with `@product-manager`. No AC covers:

1. A message where `@pm` appears mid-sentence — the description states this must NOT trigger an ad-hoc request, but the AC does not test the boundary.
2. A message where the first token is `@pm` but the agent ID `pm` is not in the workflow — the description states the parser must still classify it as an ad-hoc request (with the downstream rejection handled by REQ-MR-03), but there is no AC confirming this two-phase split.
3. A message with only whitespace before `@pm` — the description says "leading whitespace is stripped," but no AC verifies this boundary.
4. A message where the `@{agent-id}` token uses mixed case (e.g., `@PM`) — the description says the parser is case-insensitive, but there is no AC verifying case normalisation.

Without negative ACs for at least cases 1 and 4, a parser implementation that uses a simple prefix check on the raw string would pass all stated ACs while failing the product intent.

**Required action:** Add at least two negative ACs: (a) a mid-sentence `@pm` mention must NOT classify the message as an ad-hoc request; (b) `@PM` (uppercase) must classify identically to `@pm`. Add a positive AC confirming leading whitespace does not prevent classification.

---

### F-03 — REQ-MR-04 acknowledgement criterion uses "within a few seconds" — not a testable bound (Medium)

**Affects:** REQ-MR-04

The acceptance criterion for REQ-MR-04 states the acknowledgement reply must arrive "within a few seconds of the user's message." "A few seconds" is not a defined duration and cannot be used as a deterministic pass/fail gate. There is no definition of the measurement start point (from user message send? from message receipt in the bot?), no maximum value, and no specification of whether this is a manual or automated assertion.

This is a non-functional constraint embedded in a functional AC. Its vagueness prevents automated test writing and makes the requirement untestable in CI.

**Required action:** Replace "within a few seconds" with a precise upper bound (e.g., "within 3 seconds of the Temporal signal being sent"). Reference any relevant non-functional requirement, or create one. Define whether this is a manual exploratory test or an automated assertion.

---

### F-04 — REQ-MR-06 AC does not cover the cascade-blocking rule specified in the description (Medium)

**Affects:** REQ-MR-06, REQ-MR-07

The description of REQ-MR-06 includes a critical cascade-blocking rule: "A queued `adHocRevision` signal must not be dequeued until both (a) the current ad-hoc agent activity and (b) all downstream cascade phases triggered by that activity have fully completed." This is a correctness invariant. Violation would cause two agent activities to run simultaneously, breaching REQ-NF-01.

The acceptance criterion, however, only tests the simpler case where the second signal arrives and waits for the first ad-hoc activity to complete — it does not test cascade-blocking. The AC scenario shows: pm activity completes, then eng activity runs. It does not verify that the eng adHocRevision is still queued while the cascade phases triggered by pm's revision (e.g., eng-review, qa-cross-review) are executing.

Without an AC that specifically covers cascade-blocking, there is no test obligation to verify this invariant. An implementation that dequeues after the ad-hoc activity completes (but before the cascade finishes) would pass all stated ACs while violating the stated business rule.

**Required action:** Add an AC to REQ-MR-06 that explicitly tests cascade-blocking: given a second adHocRevision signal queued while a cascade is in progress from a first signal, the second signal must not begin until all cascade phases from the first signal have completed.

---

### F-05 — REQ-MR-07 acceptance criterion does not test the cascade-triggers-revision-loop scenario (Medium)

**Affects:** REQ-MR-07

The description of REQ-MR-07 specifies: "If a cascaded review phase completes with a 'Needs revision' outcome, the standard revision loop runs within the cascade." This is a compound behavior — cascade triggers review phase, review phase triggers revision loop — but the acceptance criterion only tests the basic cascade path (pm ad-hoc finishes → downstream phases re-run). There is no AC for the nested revision-loop case.

Without an AC for the cascade-plus-revision-loop scenario, a test suite cannot verify this behavior and an engineer could reasonably implement a cascade that terminates rather than entering the revision loop when a cascaded review returns "Needs revision."

**Required action:** Add an AC to REQ-MR-07 covering the nested case: given a cascaded review phase that returns "Needs revision," verify that the standard revision loop runs (creation agent is invoked, addresses feedback, review phase re-runs), and that the cascade does not short-circuit.

---

### F-06 — REQ-NF-01 acceptance criterion does not define what "consistent with a clean sequential run" means or how it is verified (Medium)

**Affects:** REQ-NF-01

The acceptance criterion for REQ-NF-01 states the final workflow state must be "consistent with a clean sequential run." This phrase is not defined. There is no specification of:

- What data structure represents "phase log" or "execution history."
- What "executed exactly once per cycle" means when a phase is re-run due to an ad-hoc revision (it would appear twice in history: once in the original run and once in the cascade).
- How "consistent with a clean sequential run" is determined — by inspecting Temporal event history? by querying a phase log?

Without a concrete, inspectable artifact to assert against, this criterion cannot be turned into an automated test. As written, the only test possible is manual inspection of Temporal history, which is not repeatable or traceable.

**Required action:** Define "phase log" as a concrete artifact (e.g., a list of phase execution records with timestamps and outcomes). Clarify whether a phase re-run due to ad-hoc revision counts as one execution or two in the phase log. Define the exact assertion: which fields are checked and what values are expected after a cascade completes.

---

### F-07 — REQ-MR-03 error reply format is partially specified; the "known agents" list order and formatting are not defined (Low)

**Affects:** REQ-MR-03

The acceptance criterion for REQ-MR-03 specifies the error reply format:
```
"Agent @designer is not part of the messaging-abstraction workflow. Known agents: pm, eng, qa."
```

This hard-codes the example. The following are unspecified:
- Order of the agents in the "Known agents:" list (alphabetical? config order?).
- Capitalisation of agent IDs in the reply (as typed by user, or as canonical IDs?).
- Behaviour when the workflow has only one agent (grammatical: "Known agents: pm." is awkward).
- Behaviour when the workflow has no agents defined (edge case, but possible in a misconfigured state).

These gaps are low severity because an incorrect implementation would still produce a visible user-facing error message. However, test engineers would need to choose an order to assert against, and different engineers might choose differently, producing brittle tests.

**Required action:** Define whether the "Known agents:" list uses config order or alphabetical order. Add a note that the format is illustrative and specifies the required structural components (agent identifier, workflow name, known-agents list) rather than verbatim text.

---

### F-08 — REQ-NF-02 acceptance criterion is satisfied by documentation only — no runtime assertion is possible (Low)

**Affects:** REQ-NF-02

The acceptance criterion for REQ-NF-02 states: "The TSPEC explicitly addresses how concurrent writes to feat-{featureSlug} would be handled." This means the requirement is verified by reading a document (the TSPEC), not by executing the system. It is a documentation completeness check, not a testable runtime assertion.

This is acceptable for a forward-compatibility constraint, but the AC should be labelled as a document review criterion rather than a functional test criterion, so test planning does not allocate automated test effort to it.

**Required action:** Mark the verification method for REQ-NF-02 as "document review" explicitly in the acceptance criterion, so test planning correctly categorises this as a design review item rather than an automated test.

---

## Clarification Questions

### Q-01 — What is the expected system behavior if two agents attempt to push to `feat-{featureSlug}` at the same time?

REQ-WB-03 specifies that agents push directly to `feat-{featureSlug}` after committing in their worktree. If two agents are active simultaneously (e.g., during a cascade where an ad-hoc activity and a regular phase overlap), both may attempt to push concurrently. Which push wins? Does the second push fail (non-fast-forward)? Does the system retry? Is this prevented by the sequential constraint in REQ-NF-01, and if so, how is that enforced at the git layer? This scenario is architecturally important for test environment setup and must be described in the TSPEC.

---

### Q-02 — Is REQ-MR-04 (acknowledgement) independent of the message-acknowledgement feature (REQ-017)?

REQ-MR-04 requires a Discord acknowledgement when an ad-hoc revision is dispatched. REQ-017 (message acknowledgement) provides a general acknowledgement mechanism for `handleMessage()` outcomes. Are these the same mechanism, or are they separate implementations? If REQ-MR-04 uses the REQ-017 infrastructure, there should be a dependency listed. If they are separate, the risk of inconsistent acknowledgement behaviour across features should be noted.

---

### Q-03 — For REQ-WB-04, what constitutes the "expected artifact file" for a given phase?

The description of REQ-WB-04 states the `hasUnmergedCommits` check must be keyed to "the presence of the expected artifact file or a phase-specific commit marker." What is the artifact file naming convention that determines whether a phase's work has already been committed? Is it the TSPEC, REQ, or FSPEC file for a given feature slug? How does the system know which file to look for, given that different phases produce different artifacts?

---

### Q-04 — For REQ-MR-07 cascade, does "automatically re-run" mean the cascade triggers immediately after the ad-hoc activity pushes, or after the Temporal signal handler completes?

The timing of cascade triggering affects whether the acknowledgement (REQ-MR-04) is sent before or after the cascade begins. If the cascade triggers immediately on push, the user sees the acknowledgement and then immediately sees cascade notifications. If the cascade triggers after the full signal handler completes, the user may see a delay. Which is intended, and should REQ-MR-07 specify the trigger point?

---

### Q-05 — What is the retry behavior for REQ-MR-05 when the Temporal "workflow not found" response is transient vs. definitive?

REQ-MR-08 specifies that "workflow not found" from Temporal is treated as the inactive case. However, Temporal can return "not found" transiently during cluster recovery or namespace synchronization. If the system immediately posts "No active workflow found" to Discord on the first "not found" response, it may produce false negatives during Temporal restarts. Should the orchestrator retry the signal a defined number of times before concluding the workflow is inactive?

---

## Positive Observations

1. **Problem statement is precise and traceable.** The two-gap framing (artifact isolation + ad-hoc routing) maps directly to distinct requirement domains (WB and MR). Each user story traces to a specific requirement, and the requirement table in §5 is complete and accurately reflects the body of the document.

2. **Idempotency edge cases are explicitly specified.** REQ-WB-04's description of the path-only matching logic and the `hasUnmergedCommits` keying problem is unusually thorough for a REQ. This level of specificity makes the edge case directly testable without requiring the test engineer to infer it from the FSPEC or TSPEC.

3. **Failure modes for ad-hoc routing are covered with user-visible feedback.** REQ-MR-03 (unknown agent) and REQ-MR-05 (no active workflow) both specify precise Discord reply formats. User-facing error messages that are specified verbatim in the REQ can be directly assertion-tested without interpretation.

4. **FIFO queue semantics are explicit.** REQ-MR-06 states "FIFO" unambiguously and provides a concrete example with agent ordering. This eliminates ambiguity in ordering assertions in queue tests.

5. **The cascade design decision is documented with rationale.** REQ-MR-07's choice of "all subsequent review phases re-run regardless of which creation phase they reviewed" is explicit and includes the reasoning ("conservative approach ensures full downstream consistency"). This prevents the test engineer from needing to reverse-engineer the intended scope of cascade tests from the FSPEC.

6. **Deterministic workflow ID derivation (REQ-MR-08) eliminates test environment state dependencies.** Because the workflow ID is `ptah-{featureSlug}`, tests do not need to maintain a lookup table or mock a Temporal query API to resolve workflow IDs. This significantly simplifies test setup for integration tests targeting the routing layer.

7. **Open questions are fully resolved.** All five open questions in §6 are marked Closed with resolution rationale and cross-references to requirements. This completeness means the test engineer has no ambiguous scope boundaries to resolve during test planning.

---

## Recommendation

**Needs revision.**

Findings F-01 and F-02 are High severity. Findings F-03, F-04, F-05, and F-06 are Medium severity. The author must address all High and Medium findings before this document can be approved for test specification authoring. Specifically:

- **F-01 (High):** Add an AC for upstream push-failure detection in REQ-WB-01.
- **F-02 (High):** Add negative ACs for mid-sentence @mentions and case-insensitive matching in REQ-MR-01.
- **F-03 (Medium):** Replace "within a few seconds" with a precise, testable latency bound in REQ-MR-04.
- **F-04 (Medium):** Add a cascade-blocking AC to REQ-MR-06.
- **F-05 (Medium):** Add a nested revision-loop AC to REQ-MR-07.
- **F-06 (Medium):** Define "phase log" as a concrete inspectable artifact in REQ-NF-01.

Low-severity findings (F-07, F-08) and clarification questions (Q-01 through Q-05) should be addressed at the same time but are not individually blocking.

After all High and Medium findings are resolved, route the updated REQ back for re-review.

---

*End of Cross-Review*
