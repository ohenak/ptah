# Cross-Review: Backend Engineer — PLAN Review

## Phase 7 — Polish Execution Plan

| Field | Detail |
|-------|--------|
| **Reviewer** | Backend Engineer (`eng`) |
| **Document Reviewed** | [007-PLAN-polish.md](./007-PLAN-polish.md) |
| **Review Date** | 2026-03-17 |
| **References** | [007-TSPEC-polish.md](./007-TSPEC-polish.md) v1.5, [007-REQ-polish.md](./007-REQ-polish.md), [CROSS-REVIEW-product-manager-PLAN.md](./CROSS-REVIEW-product-manager-PLAN.md), [CROSS-REVIEW-test-engineer-PLAN.md](./CROSS-REVIEW-test-engineer-PLAN.md) |

---

## Recommendation

**❌ Needs Revision**

Three Medium findings (F-01, F-02, F-03) require resolution before this PLAN can serve as a reliable implementation guide. The engineer must address all Medium findings and route the updated PLAN back for re-review.

---

## Findings

### F-01 — MEDIUM: Hot-reload path has no file-watcher mechanism in TSPEC or PLAN

**Affected requirement:** REQ-NF-08, FSPEC-EX-01 §4.8, AT-EX-01-08

This finding is raised from an architectural angle, as a complement to PM F-01 and TE F-03.

Both PM and TE correctly identified that no task implements the hot-reload → registry rebuild → routing invalidation path. From an implementation standpoint the problem is deeper: **implementing `FSPEC-EX-01 §4.8` requires an active file-system watcher** (e.g., Node.js `fs.watch()` or a library like `chokidar`). Neither the TSPEC technology stack (§2) nor the PLAN contains any mention of a watcher mechanism. The `FileSystem` interface in TSPEC §4.2.3 exposes `exists()` and `readFile()` — no `watch()` method.

An engineer tasked with implementing hot-reload today would have no design guidance from the approved TSPEC. They would either: (a) make an independent architectural choice on the watcher mechanism (which should have been approved in TSPEC), or (b) discover the gap mid-sprint and block.

**Required action — choose one:**

1. **Defer hot-reload (recommended).** Raise a scope-reduction request to the PM. Remove `"(or on config hot-reload)"` from REQ-NF-08 acceptance criteria and update FSPEC-EX-01 §4.8 to mark hot-reload as out of scope for Phase 7. The config-on-startup path (which is fully specified in TSPEC §5.4 and tested via B1+B3) satisfies the core REQ-NF-08 intent of zero-code-change agent extensibility. Hot-reload can be a Phase 8 item once the watcher architecture is designed.

2. **Add the watcher mechanism to TSPEC and PLAN.** This requires a TSPEC revision to §2 (technology stack — is `chokidar` appropriate?), §4.2.3 (`FileSystem` interface gains a `watch()` method), and §9 (test strategy for async watcher events). The PLAN then gains at minimum two new tasks: one to implement config watching in `src/config/loader.ts` and one to wire registry rebuild into the watcher callback. This expands Phase 7 scope materially.

Leaving hot-reload unaddressed — with an approved acceptance criterion and a fully specified FSPEC behavioral flow — is not an acceptable outcome.

---

### F-02 — MEDIUM: EVT-OB-05 unassigned; its fix requires a constructor-dep change to ResponsePoster

**Affected tasks:** D3 (`DefaultResponsePoster` refactor), Phase E (component loggers)

Both PM (F-02) and TE (F-02) identified that EVT-OB-05 from `DefaultResponsePoster` has no owning task. I am raising this as Medium from a technical implementation angle because the fix is non-trivial.

`DefaultResponsePoster` in the live codebase does **not** have a `Logger` constructor dependency. Adding EVT-OB-05 (`[ptah:response-poster] INFO: agent response posted`) requires:

1. Adding `logger: Logger` to the `ResponsePoster` interface's constructor dependencies (or to `DefaultResponsePoster`'s constructor signature — depending on whether the interface exposes construction, which it does not per TSPEC §4.2.4).
2. Updating `DefaultResponsePoster`'s constructor to accept `logger: Logger` and call `logger.forComponent('response-poster')` to produce a component-scoped logger.
3. Adding `FakeLogger` injection to every existing `DefaultResponsePoster` unit test.
4. Updating `FakeResponsePoster` in factories.ts to add a `logs` accessor (or use a shared `FakeLogStore`) if EVT-OB-05 must be verifiable in integration tests.
5. Updating G1 (composition root) to pass the logger into `DefaultResponsePoster` at the wiring site.

This is 3–5 coordinated changes across `response-poster.ts`, `factories.ts`, `ptah.ts`, and test files. Simply noting "add a log call in D3" undersells the scope. The Phase E pattern (E1–E4) exists precisely for this: each task wires a component logger, updates the fake, and threads it through the composition root. **A task E5 mirroring the E1–E4 pattern for ResponsePoster is the correct resolution**, not a one-line addition to D3.

**Required action:** Add task E5 to Phase E:

> **E5** — Add component-scoped logger to `DefaultResponsePoster` constructor; emit EVT-OB-05 after each `postAgentResponse()` call with `thread_id`, `agent_id`, and chunk count; update `FakeResponsePoster` in factories.ts to include `FakeLogStore` for EVT-OB-05 assertions.
>
> Test file: `tests/unit/orchestrator/response-poster.test.ts` | Source file: `src/orchestrator/response-poster.ts`

G1 must be updated to pass the logger into `DefaultResponsePoster`. Annotate this explicitly in G1's task description.

---

### F-03 — MEDIUM: `FileSystem` interface has no owning source task

**Affected tasks:** A4 (`FakeFileSystem` in factories.ts), B1 (`buildAgentRegistry()` which depends on `FileSystem`)

Task A4 adds `FakeFileSystem` to `tests/fixtures/factories.ts`. `FakeFileSystem` implements the `FileSystem` interface. But there is no task in the PLAN that creates the `FileSystem` **interface itself** in source code.

Looking at task A1: it lists `Component`, `LogLevel`, `LogEntry`, `UserFacingErrorType`, `UserFacingErrorContext`, `AgentValidationError`, `AgentEntry`, `RegisteredAgent`, `LlmConfig` — `FileSystem` is absent. Looking at B1: it creates `src/orchestrator/agent-registry.ts`, but the `FileSystem` interface used in `buildAgentRegistry(entries, fs: FileSystem, logger)` must be imported from somewhere. TSPEC §4.2.3 shows `FileSystem` defined in the code block but does not explicitly assign it to a source file.

**The current state of the live codebase does not contain a `FileSystem` interface.** (Confirmed during TSPEC review — the filesystem interface was flagged as new in Phase 7, per TE F-13 resolution in TSPEC v1.5.) An engineer writing A4 today would have no source interface to implement against. An engineer writing B1 would need to know which file to import `FileSystem` from.

**Required action:** Either:

1. Add `FileSystem` to A1's type list (e.g., `"…; add FileSystem interface to src/services/filesystem.ts or src/types.ts"`), making it explicit that A4 depends on A1 completing this.
2. Add a separate task A0 or extend A1's source file to include the `FileSystem` interface definition with its `exists(path: string): Promise<boolean>` and `readFile(path: string): Promise<string>` methods (per TSPEC §4.2.3).

The PLAN's A→A4 ordering must reflect this dependency.

---

### F-04 — LOW: Task A1 test file attribution is misleading

**Affected task:** A1 (`src/types.ts` — add types; remove `AgentConfig`)

Task A1 lists `tests/unit/services/logger.test.ts` as its test file. This echoes TE F-04. From an implementation standpoint: TypeScript types (`AgentEntry`, `LlmConfig`, etc.) are compile-time constructs verified transitively through the tests that consume them. Logger behavior tests are not the right home for type-shape validation.

An engineer implementing A1 who looks at the test file column will either: write nothing in `logger.test.ts` (correct but confusing), or write `AgentEntry` shape assertions in a logger test file (wrong home). The most accurate attribution for A1 is `(compile-time — verified transitively in B1, B3, C1 consumers)`.

**Required action:** Change A1's Test File column to `(compile-time — validated through B1: agent-registry.test.ts, B3: config/loader.test.ts, C1: error-messages.test.ts)`.

---

### F-05 — LOW: Task B3 test file path inconsistency

**Affected task:** B3 (config loader migration)

Task B3 lists `tests/unit/config/loader.test.ts`. TSPEC §3 project structure shows `tests/unit/config-loader.test.ts` (flat path, no `config/` subdirectory). TE F-06 caught this discrepancy. The fix is to align both documents to the actual path.

**Required action:** Verify the correct path against the live repo's `tests/unit/` directory structure. Update either B3 or TSPEC §3 to match.

---

## Positive Observations

- **Phase dependency graph (§3) is architecturally correct.** The A→B/C/D→E→F→G chain correctly models the factory-layering constraint: types must be stable before registries can be built, fake factories must be complete before consuming unit tests are written, and Orchestrator-level changes (F) correctly defer until embed methods (D) and component loggers (E) are in place. The parallel opportunities (B1∥B3, C1∥B, E1–E4 in parallel after D) are all valid — no hidden sequencing constraints were missed.

- **Integration points table (§4) risk ratings are appropriate.** Flagging `factories.ts` as High is correct — it is the most-touched file in the implementation and changes to `FakeLogger`, `FakeDiscordClient`, and `FakeResponsePoster` all cascade into test suites. The High risk on `src/types.ts` (AgentConfig removal) is also accurate; it is a broad structural change.

- **G3 (migration guide) and G2 (ptah.config.json update) are both explicitly tasked.** The REQ §5 risk note on migration scope is correctly handled — the guide is in scope, no automated migration script, operators update manually. These tasks need no changes.

- **`archive_on_resolution?: boolean` flag in F3 matches the REQ scope boundary.** REQ §6 specifies "deployment-wide opt-out via config is sufficient" — the optional boolean in `OrchestratorConfig` is the exact right implementation of this decision. No per-thread opt-out complexity introduced.

- **G5 (full test suite gate) is correctly positioned as the final task.** Running `npx vitest run` with 0 failures/0 skips as the last gate prevents the high-churn factories.ts changes from leaving silent regressions. This is good practice.

- **FakeDiscordClient and FakeResponsePoster test tasks (D2, D4) are correctly identified as first-class tasks.** Explicitly testing fake behavior — not just using fakes — is the correct approach per TSPEC §9.2 patterns.

---

## Summary of Findings

| ID | Severity | Description |
|----|----------|-------------|
| F-01 | **Medium** | Hot-reload has no file-watcher mechanism in TSPEC or PLAN; architectural gap requires explicit PM scoping decision |
| F-02 | **Medium** | EVT-OB-05 unassigned; fix requires Logger constructor dep change to ResponsePoster + new E5 task |
| F-03 | **Medium** | `FileSystem` interface has no owning source task; A4 and B1 cannot be written without it |
| F-04 | Low | A1 test file attribution (logger.test.ts) is misleading for a types-only task |
| F-05 | Low | B3 test file path inconsistency between TSPEC §3 and PLAN task |

**Required before approval:** F-01, F-02, and F-03 must be resolved. The engineer must re-route the updated PLAN back to the Backend Engineer, Test Engineer, and Product Manager for re-review.

---

*End of Review*
