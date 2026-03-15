# Cross-Review: Backend Engineer Review of REQ-011

| Field | Detail |
|-------|--------|
| **Document** | [011-REQ-orchestrator-pdlc-state-machine.md](011-REQ-orchestrator-pdlc-state-machine.md) |
| **Reviewer** | Backend Engineer (`eng`) |
| **Date** | March 14, 2026 |
| **Recommendation** | Approved with minor changes |

---

## Findings

### F-01: Assumption A-02 contradicts REQ-SM-07/REQ-SM-08 (High)

Assumption A-02 states "A feature has exactly one active PDLC state at a time (no branching within the state machine for a single feature)." However, REQ-SM-07 and REQ-SM-08 explicitly require parallel (fork/join) TSPEC and PLAN creation for fullstack features. These are contradictory — fork/join IS branching within the state machine for a single feature.

**Impact:** This will cause confusion during TSPEC design. The state machine either needs sub-states (e.g., `TSPEC_CREATION` with internal tracking of `{backend: "pending", frontend: "complete"}`) or the assumption must be revised to acknowledge fork/join as a special case.

**Recommendation:** Remove or revise A-02. Replace with: "A feature has one primary PDLC phase at a time, but creation phases may internally track parallel sub-tasks for fullstack features using a fork/join pattern."

---

### F-02: REQ-SM-05 "same synchronous operation" is not feasible with atomic file writes (Medium)

REQ-SM-05 acceptance criteria says "the updated state is written to the state file within the same synchronous operation." However, REQ-SM-NF-02 requires atomic writes (write-to-temp + rename). In Node.js, `fs.renameSync` is synchronous, but `fs.writeFileSync` + `fs.renameSync` as a pair is not truly atomic from the OS perspective. More importantly, using synchronous I/O contradicts REQ-SM-NF-01 which requires "State persistence I/O must not block the main event loop."

**Impact:** These three requirements create a conflicting triangle: synchronous write (SM-05) vs. non-blocking I/O (NF-01) vs. atomic write (NF-02).

**Recommendation:** Revise REQ-SM-05 to say "the state is durably persisted before the transition result is returned to the caller" instead of "same synchronous operation." The TSPEC will resolve the async-vs-atomic tension with `writeFile` + `rename` using Node.js promises.

---

### F-03: REQ-RT-04 approval detection relies on free-text parsing (Medium)

REQ-RT-04 requires parsing cross-review files for the "Recommendation" field with exact string matching ("Approved", "Approved with minor changes", "Needs revision"). This is fragile — agents are LLMs that may produce slight variations ("approved", "APPROVED", "Approved with Minor Changes", "Approved, with minor changes", "Needs Revision").

**Impact:** Approval detection fails silently on format drift, which is called out as Risk R-01 but not mitigated in the requirements themselves.

**Recommendation:** Add acceptance criteria to REQ-RT-04 specifying case-insensitive matching and a defined fallback behavior when the recommendation field cannot be parsed (e.g., treat as `pending` and alert the user via ROUTE_TO_USER).

---

### F-04: No requirement for state file versioning or migration (Medium)

REQ-SM-05 and REQ-SM-06 define state persistence and recovery, but there is no requirement for schema versioning of the state file. As the state machine evolves (e.g., adding new phases, changing review rules), the state file format will change.

**Impact:** A state file written by v1 of the state machine may not be readable by v2, causing features in progress to lose state on upgrade.

**Recommendation:** Add a requirement (e.g., REQ-SM-10) for schema versioning: "The state file must include a schema version field. On startup, the orchestrator must validate the schema version and apply migrations if the persisted version is older than the current version."

---

### F-05: REQ-SM-04 FSPEC skip trigger mechanism is ambiguous (Medium)

REQ-SM-04 says FSPEC is skipped when "the feature configuration indicates `skipFspec: true` or the PM signals that no FSPEC is needed." These are two different mechanisms — configuration vs. runtime signal. The PM signal approach means the skip decision happens at `REQ_APPROVED` time, but the configuration approach means it's set at feature creation time.

**Impact:** If both mechanisms are supported, precedence rules are needed. If only one, the other should be removed.

**Recommendation:** Clarify whether `skipFspec` is a feature configuration property set at creation time (preferred — simpler, deterministic) or a PM runtime signal. If configuration-only, remove the "PM signals" alternative. This aligns with A-04 (configuration set once at creation time).

---

### F-06: REQ-CA-02 context matrix is missing overview.md for some phases (Low)

The context document matrix in REQ-CA-02 includes overview.md for REQ_CREATION, FSPEC_CREATION, and TSPEC_CREATION, but not for later phases. The overview.md contains the feature's high-level description and may be useful for PLAN_CREATION and PROPERTIES_CREATION as well.

**Impact:** Minor — agents in later phases may lack feature context that the overview provides.

**Recommendation:** Consider adding overview.md to PLAN_CREATION and PROPERTIES_CREATION, or explicitly note that overview.md is only needed for early phases.

---

### F-07: Parallel implementation (REQ-AI-02) complexity not addressed (Low)

REQ-AI-02 maps IMPLEMENTATION to `eng` (and `fe` for fullstack), implying parallel implementation for fullstack features. However, unlike TSPEC/PLAN which have explicit fork/join requirements (REQ-SM-07/08), there is no equivalent REQ-SM requirement for parallel implementation tracking.

**Impact:** Fullstack implementation would need the same fork/join pattern, but this is implicit rather than explicit.

**Recommendation:** Either add a REQ-SM-10 for parallel implementation fork/join (matching SM-07/SM-08 pattern), or explicitly state in REQ-AI-02 that fullstack implementation is sequential (backend first, then frontend).

---

### F-08: Priority count mismatch in Section 8 (Low)

The P0 count says "27" but lists 35 IDs (including 5 NF requirements). The P1 count says "8" but lists 6 IDs. The total should be 35 per Section 8 "By Phase."

**Impact:** Cosmetic — causes confusion during prioritization.

**Recommendation:** Recount and correct the numbers.

---

## Clarification Questions

### Q-01: State file location — inside or outside git?

REQ-SM-05 says state file at `ptah/state/pdlc-state.json`. Risk R-04 mentions "optionally committed" to git. Should the state file be:
- (a) In the git working tree but `.gitignore`-d (local state only)
- (b) Committed to the repo (shared state, but merge conflicts likely)
- (c) Outside the repo entirely (e.g., `~/.ptah/state/`)

Option (a) seems most practical for a single-process CLI tool. This needs explicit decision.

### Q-02: What happens when ROUTE_TO_AGENT signals are received under the new model?

REQ-AI-04 says ROUTE_TO_AGENT "is no longer used for PDLC workflow routing" but "may still be used for ad-hoc coordination." What does the orchestrator do when it receives ROUTE_TO_AGENT from an agent in the new model? Does it:
- (a) Ignore the agent_id and still use the state machine to determine next agent?
- (b) Honor the ROUTE_TO_AGENT for ad-hoc cases but log a warning?
- (c) Treat it as an error?

This needs a clear decision because the existing routing loop in `orchestrator.ts` is built around ROUTE_TO_AGENT as the primary continuation signal.

### Q-03: How does the orchestrator know a feature has started?

REQ-SM-02 says a state record is initialized "when the PM creates the feature folder." But how does the orchestrator detect that a feature folder was created? Currently, the orchestrator reacts to Discord messages, not file system events. Does the developer send a message like "start feature X" that triggers initialization?

### Q-04: Backward compatibility boundary — how are "unmanaged" features identified?

REQ-SM-NF-03 says features without a state record are treated as "unmanaged." But the orchestrator processes messages from Discord threads. How does the orchestrator know whether a thread belongs to a managed or unmanaged feature? Is the mapping thread → feature → state record, or is there a different identification mechanism?

---

## Positive Observations

- **P-01:** REQ-SM-NF-04 (pure-function state machine with `(currentState, event) → newState`) is an excellent architectural constraint. This maps cleanly to a reducer pattern that is trivially testable without any I/O mocking.

- **P-02:** The domain separation (SM, RT, AI, FC, SA, CA) is well-structured and maps naturally to separate TypeScript modules. Each domain can be implemented and tested independently.

- **P-03:** The review tracking model (REQ-RT-01 through RT-08) is comprehensive and addresses the real failure modes we've seen with LLM-driven review routing. Centralizing approval detection in code eliminates the non-determinism problem.

- **P-04:** REQ-SA-04 explicitly preserving domain task instructions while removing workflow logic is the right boundary. This keeps agents good at their specialty without burdening them with orchestration concerns.

- **P-05:** The context document matrix (REQ-CA-02) provides exactly the information agents need for each phase — no more, no fewer. This reduces token waste and agent confusion from irrelevant context.

- **P-06:** Risk analysis (Section 7) correctly identifies the highest-risk items (R-01 format drift, R-03 migration inconsistency) and the mitigations are practical.

---

## Summary

This is a well-structured requirements document that correctly identifies the core problem (non-deterministic PDLC state transitions from LLM-driven workflow logic) and proposes a sound solution (code-level state machine in the orchestrator). The requirements are detailed, traceable to user scenarios, and include acceptance criteria in Who/Given/When/Then format.

The main issues to address are:
1. **A-02 vs SM-07/SM-08 contradiction** (F-01) — the assumption about no branching conflicts with fork/join requirements
2. **Synchronous vs. non-blocking I/O tension** (F-02) — three requirements conflict with each other
3. **Approval detection fragility** (F-03) — case sensitivity and fallback behavior need specifying
4. **State file schema versioning** (F-04) — missing requirement for forward compatibility
5. **FSPEC skip mechanism ambiguity** (F-05) — configuration vs. runtime signal needs resolution

The 4 clarification questions (Q-01 through Q-04) should be resolved before TSPEC creation, as they directly affect architectural decisions.

**Recommendation: Approved with minor changes** — address F-01 through F-05 and resolve Q-01 through Q-04, then proceed to TSPEC.
