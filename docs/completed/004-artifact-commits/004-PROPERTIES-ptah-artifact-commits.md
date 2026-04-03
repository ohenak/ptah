# Test Properties Document

## Ptah Artifact Commits (Phase 4)

| Field | Detail |
|-------|--------|
| **Document ID** | PROPERTIES-ptah-artifact-commits |
| **Requirements** | [REQ-SI-05, REQ-SI-06, REQ-SI-09, REQ-SI-13, REQ-NF-03, REQ-NF-05](../requirements/004-REQ-PTAH-artifact-commits.md) |
| **Specifications** | [004-TSPEC-ptah-artifact-commits](../specifications/004-TSPEC-ptah-artifact-commits.md) |
| **Execution Plan** | [004-PLAN-TSPEC-ptah-artifact-commits](../plans/004-PLAN-TSPEC-ptah-artifact-commits.md) |
| **Version** | 1.1 |
| **Date** | March 10, 2026 |
| **Author** | Test Engineer |
| **Status** | In Review |
| **Approval Date** | Pending |

---

## 1. Overview

This properties document catalogs every testable invariant for Phase 4 of the Ptah CLI -- the artifact commit pipeline. Phase 4 replaces Phase 3's discard-on-complete worktree behavior with a full persistence pipeline: after a Skill invocation, artifact changes are committed in the worktree with agent attribution, merged to the main branch through a serialized merge lock, logged to per-agent audit files, and the worktree is cleaned up. A message deduplication layer prevents double-processing of Discord events. All properties trace to REQ-SI-05, REQ-SI-06, REQ-SI-09, REQ-SI-13, REQ-NF-03, REQ-NF-05, and 004-TSPEC-ptah-artifact-commits.

### 1.1 Scope

**In scope:**
- ArtifactCommitter: docs filter, commit message format, merge pipeline, cleanup, error handling
- AgentLogWriter: log file creation, entry formatting, pipe escaping, retry, merge lock serialization
- MergeLock (AsyncMutex): acquire/release, serialization, timeout, FIFO ordering, error-path release
- MessageDeduplicator: Set-based dedup with isDuplicate check-and-add
- Orchestrator updates: dedup guard, malformed message guard, flow reorder (worktree before context), branch-already-exists guard, full commit/merge/log pipeline, error embed posting for all failure modes
- SkillInvoker updates: receives worktreePath, no cleanup, uses diffWorktreeIncludingUntracked
- ContextAssembler updates: reads Layer 2 from worktreePath when provided
- GitClient Phase 4 methods: addInWorktree, commitInWorktree, merge, hasUnmergedCommits, diffWorktreeIncludingUntracked, branchExists, getShortSha
- FileSystem Phase 4 method: appendFile
- Integration: end-to-end artifact pipeline, concurrent log serialization
- Test doubles: FakeArtifactCommitter, FakeAgentLogWriter, FakeMergeLock, FakeMessageDeduplicator, updated FakeGitClient/FakeFileSystem/FakeSkillInvoker/FakeContextAssembler

**Out of scope:**
- Phase 1/2/3 properties (covered by 001-PROPERTIES and 002-PROPERTIES)
- Disk-persisted deduplication (deferred, FSPEC-AC-03 SS5.4)
- In-flight invocation draining on shutdown (Phase 6, REQ-SI-10)
- Set growth bounding for MessageDeduplicator (accepted for Phase 4)
- Live Discord server testing (manual)

### 1.2 Analysis Summary

| Input | Count | Source |
|-------|-------|--------|
| Requirements analyzed | 6 | [REQ-SI-05, REQ-SI-06, REQ-SI-09, REQ-SI-13, REQ-NF-03, REQ-NF-05](../requirements/004-REQ-PTAH-artifact-commits.md) |
| Specifications analyzed | 1 | [004-TSPEC-ptah-artifact-commits](../specifications/004-TSPEC-ptah-artifact-commits.md) |
| Plan tasks reviewed | 77 | [004-PLAN-TSPEC-ptah-artifact-commits](../plans/004-PLAN-TSPEC-ptah-artifact-commits.md) |
| Integration boundaries identified | 6 | ArtifactCommitter-GitClient, AgentLogWriter-FileSystem, MergeLock shared instance, MessageDeduplicator-Orchestrator, SkillInvoker worktreePath handoff, ContextAssembler worktreePath reads |
| Implementation files reviewed | 10 | types.ts, artifact-committer.ts, agent-log-writer.ts, merge-lock.ts, message-deduplicator.ts, orchestrator.ts, skill-invoker.ts, context-assembler.ts, git.ts, filesystem.ts |

---

## 2. Property Summary

| Category | Count | Requirements Covered | Test Level |
|----------|-------|----------------------|------------|
| Functional | 30 | REQ-SI-05, REQ-SI-06, REQ-SI-09, REQ-SI-13, REQ-NF-03, REQ-NF-05 | Unit |
| Contract | 6 | REQ-SI-05, REQ-SI-06, REQ-NF-03, REQ-NF-05 | Unit |
| Error Handling | 18 | REQ-SI-05, REQ-SI-06, REQ-SI-09, REQ-SI-13, REQ-NF-03, REQ-NF-05 | Unit |
| Data Integrity | 9 | REQ-SI-05, REQ-SI-06, REQ-NF-05 | Unit |
| Integration | 6 | REQ-SI-05, REQ-SI-06, REQ-SI-13, REQ-NF-03, REQ-NF-05 | Integration |
| Performance | 2 | REQ-NF-03 | Unit |
| Idempotency | 4 | REQ-SI-09, REQ-NF-03 | Unit |
| Observability | 8 | REQ-SI-05, REQ-SI-06, REQ-SI-13, REQ-NF-05 | Unit |
| **Total** | **83** | | |

**Negative properties** (Section 4): **11** additional properties defining prohibited behaviors.

**Grand total:** **94** testable properties.

---

## 3. Properties

Properties are grouped by category. Each property is a testable invariant the system must satisfy.

**ID format:** `PROP-AC-{NUMBER}` -- domain prefix `AC` matches the Artifact Commits specification domain.

**Priority:** All source requirements are P0, so all properties inherit P0 unless noted.

### 3.1 Functional Properties

Core business logic and behavior.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-01 | ArtifactCommitter.commitAndMerge must return `{ mergeStatus: "no-changes" }` with no git operations when artifactChanges is empty | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-02 | ArtifactCommitter.commitAndMerge must execute the full pipeline (addInWorktree, commitInWorktree, acquire lock, merge, getShortSha, cleanup) and return `{ mergeStatus: "merged" }` on success | REQ-SI-05, REQ-SI-13, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-03 | ArtifactCommitter must format commit message as `[ptah] {AgentDisplayName}: {description}` where description is extracted after the em-dash in threadName | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-04 | ArtifactCommitter must use full threadName as description when no em-dash is present | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-05 | ArtifactCommitter must filter artifactChanges to only stage files under `docs/` and log a warning for filtered non-docs files | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-06 | ArtifactCommitter must return `{ mergeStatus: "no-changes" }` when all artifactChanges are non-docs after filtering | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-07 | ArtifactCommitter must return `{ mergeStatus: "conflict" }` with conflictMessage when merge returns "conflict", retaining the worktree for manual resolution | REQ-SI-13, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-08 | ArtifactCommitter must clean up worktree (removeWorktree + deleteBranch) on successful merge | REQ-SI-13, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-09 | AgentLogWriter.append must append a correctly formatted markdown table row with timestamp, threadName, status, commitSha, and summary | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-10 | AgentLogWriter.append must create a new log file with header (using display name derived from agentId via formatAgentName) when the file does not exist | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-11 | AgentLogWriter.append must create the `docs/agent-logs/` directory (log path: `docs/agent-logs/{agent}.md`) when creating a new log file | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-12 | AgentLogWriter.append must use em-dash character for null commitSha in log entries | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-13 | AgentLogWriter.append must produce correct rows for all four LogStatus values: "completed", "completed (no changes)", "conflict", "error" | REQ-SI-06, REQ-NF-05, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-14 | AsyncMutex.acquire must succeed and return a release function when the lock is free | REQ-NF-03, TSPEC SS4.2.5 | Unit | P0 |
| PROP-AC-15 | AsyncMutex must serialize access: second acquire waits until first holder calls release | REQ-NF-03, TSPEC SS4.2.5 | Unit | P0 |
| PROP-AC-16 | AsyncMutex must serve multiple waiters in FIFO order | REQ-NF-03, TSPEC SS4.2.5 | Unit | P0 |
| PROP-AC-17 | InMemoryMessageDeduplicator.isDuplicate must return false for a first-seen messageId and add it to the internal set | REQ-SI-09, TSPEC SS4.2.6 | Unit | P0 |
| PROP-AC-18 | InMemoryMessageDeduplicator.isDuplicate must return true on the second call with the same messageId | REQ-SI-09, TSPEC SS4.2.6 | Unit | P0 |
| PROP-AC-19 | InMemoryMessageDeduplicator must treat different messageIds independently | REQ-SI-09, TSPEC SS4.2.6 | Unit | P0 |
| PROP-AC-20 | Orchestrator must skip processing and log warning when messageDeduplicator.isDuplicate returns true | REQ-SI-09, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-21 | Orchestrator must create worktree before assembling context (flow reorder) and pass worktreePath to both contextAssembler and skillInvoker | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-22 | Orchestrator must call artifactCommitter.commitAndMerge after skillInvoker.invoke and write a log entry via agentLogWriter.append | REQ-SI-05, REQ-SI-06, REQ-NF-05, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-23 | Orchestrator must post agent response and continue routing after commit/merge regardless of commit outcome | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-24 | Orchestrator must clean up worktree when commitResult.mergeStatus is "no-changes" | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-25 | SkillInvoker.invoke must use provided worktreePath for skill invocation and NOT create a worktree | REQ-SI-05, TSPEC SS4.2.7 | Unit | P0 |
| PROP-AC-26 | SkillInvoker.invoke must use diffWorktreeIncludingUntracked (not diffWorktree) to detect both tracked and untracked file changes | REQ-SI-05, TSPEC SS4.2.7 | Unit | P0 |
| PROP-AC-27 | ContextAssembler.assemble must read Layer 2 files from worktreePath when provided | REQ-SI-13, TSPEC SS4.2.8 | Unit | P0 |
| PROP-AC-28 | ContextAssembler.assemble must read Layer 2 files from main repo when worktreePath is not provided | TSPEC SS4.2.8 | Unit | P0 |
| PROP-AC-29 | Orchestrator must detect and handle branch-already-exists: regenerate invocationId when branch has unmerged commits, or delete leftover branch when it has no unmerged commits | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-30 | Orchestrator.deriveLogStatus must map commitResult.mergeStatus to correct LogStatus: "merged" to "completed", "no-changes" to "completed (no changes)", "conflict" to "conflict", "merge-error" to "conflict", "commit-error"/"lock-timeout" to "error" | REQ-NF-05, TSPEC SS5.3 | Unit | P0 |

### 3.2 Contract Properties

Protocol compliance and type conformance.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-31 | ArtifactCommitter protocol must expose `commitAndMerge(params: CommitParams): Promise<CommitResult>` | REQ-SI-05, TSPEC SS4.2.3 | Unit | P0 |
| PROP-AC-32 | AgentLogWriter protocol must expose `append(entry: LogEntry): Promise<void>` | REQ-SI-06, TSPEC SS4.2.4 | Unit | P0 |
| PROP-AC-33 | MergeLock protocol must expose `acquire(timeoutMs?: number): Promise<MergeLockRelease>` where MergeLockRelease is `() => void` | REQ-NF-03, TSPEC SS4.2.5 | Unit | P0 |
| PROP-AC-34 | MessageDeduplicator protocol must expose `isDuplicate(messageId: string): boolean` with synchronous check-and-add semantics | REQ-SI-09, TSPEC SS4.2.6 | Unit | P0 |
| PROP-AC-35 | SkillInvoker.invoke signature must accept `(bundle, config, worktreePath)` and InvocationResult must not contain worktreePath or branch fields | REQ-SI-05, TSPEC SS4.2.7 | Unit | P0 |
| PROP-AC-36 | FileSystem protocol must expose `appendFile(path: string, content: string): Promise<void>` | REQ-NF-05, TSPEC SS4.2.2 | Unit | P0 |

### 3.3 Error Handling Properties

Failure modes, error propagation, and graceful degradation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-37 | ArtifactCommitter must return `{ mergeStatus: "commit-error" }` with conflictMessage when addInWorktree throws, and clean up worktree without acquiring merge lock | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-38 | ArtifactCommitter must return `{ mergeStatus: "commit-error" }` with conflictMessage when commitInWorktree throws, and clean up worktree without acquiring merge lock | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-39 | ArtifactCommitter must return `{ mergeStatus: "merge-error" }` when merge returns "merge-error", retaining worktree and releasing lock | REQ-SI-13, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-40 | ArtifactCommitter must return `{ mergeStatus: "lock-timeout" }` with preserved commitSha when MergeLockTimeoutError is thrown, retaining worktree | REQ-NF-03, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-41 | ArtifactCommitter.cleanupWorktree must log warnings (not throw) when removeWorktree or deleteBranch fails | REQ-SI-13, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-42 | AgentLogWriter.append must log warning and not throw when appendFile fails after retry | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-43 | AgentLogWriter.append must retry once after 100ms delay when first appendFile call fails | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-44 | AgentLogWriter.append must log warning and return without writing when MergeLockTimeoutError is thrown during lock acquisition | REQ-SI-06, REQ-NF-03, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-45 | AgentLogWriter.append must follow the normal append path (same markdown table row format) and log a warning via logger.warn when existing file is malformed (missing table header), rather than skipping or recreating the file | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-46 | Orchestrator must post error embed for merge conflict with agent name, branch, and worktree path details, and call logger.error | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-47 | Orchestrator must post error embed and clean up worktree on commit-error | REQ-SI-05, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-48 | Orchestrator must post error embed and retain worktree on merge-error | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-49 | Orchestrator must post error embed and retain worktree on lock-timeout | REQ-NF-03, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-50 | Orchestrator must clean up worktree, write error log entry, and post error embed on skill timeout (InvocationTimeoutError) | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-51 | Orchestrator must post error embed when worktree creation fails, with no cleanup needed, and write error log entry | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-52 | Orchestrator must catch agentLogWriter.append failures and log warning without disrupting the pipeline | REQ-SI-06, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-91 | Orchestrator must clean up worktree, write error log entry (status "error"), and post error embed on generic skill error (non-timeout, non-RoutingParseError), including RoutingParseError which follows the same cleanup + error log path | REQ-SI-13, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-92 | AgentLogWriter.append must write a log entry with status "error" and null commitSha when a skill invocation fails with a generic (non-timeout) error | REQ-SI-06, REQ-NF-05, TSPEC SS5.2 | Unit | P0 |

### 3.4 Data Integrity Properties

Data transformations, mapping correctness, and data preservation.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-53 | formatAgentName must convert hyphenated agentId to capitalized display name (e.g., "dev-agent" to "Dev Agent", "pm-lead-agent" to "Pm Lead Agent") | REQ-SI-05, REQ-SI-06, TSPEC SS5.1, SS5.2 | Unit | P0 |
| PROP-AC-54 | AgentLogWriter must escape pipe characters in threadName and summary as `\|` to prevent markdown table corruption | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-55 | NodeGitClient.addInWorktree must run `git add` with file paths using worktreePath as cwd | REQ-SI-05, TSPEC SS4.2.1 | Unit | P0 |
| PROP-AC-56 | NodeGitClient.commitInWorktree must run `git commit -m` in worktree cwd and return the full commit SHA | REQ-SI-05, TSPEC SS4.2.1 | Unit | P0 |
| PROP-AC-57 | NodeGitClient.merge must return "merged" on success, "conflict" on exit code 1 (with merge --abort), and "merge-error" on other failures | REQ-SI-13, TSPEC SS4.2.1 | Unit | P0 |
| PROP-AC-58 | NodeGitClient.diffWorktreeIncludingUntracked must return the deduplicated union of tracked changes (`git diff --name-only HEAD`) and untracked files (`git ls-files --others --exclude-standard`) | REQ-SI-05, TSPEC SS4.2.1 | Unit | P0 |
| PROP-AC-59 | NodeGitClient.branchExists must return true when branch exists and false otherwise, using `git rev-parse --verify` | REQ-SI-13, TSPEC SS4.2.1 | Unit | P0 |
| PROP-AC-60 | NodeFileSystem.appendFile must append content to existing files and create the file if it does not exist | REQ-NF-05, TSPEC SS4.2.2 | Unit | P0 |
| PROP-AC-93 | CommitResult.branch must always be populated (non-empty string) on every exit path of commitAndMerge, including no-changes, merged, conflict, merge-error, commit-error, and lock-timeout | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |

### 3.5 Integration Properties

Cross-module interactions, dependency wiring, and composition.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-61 | Artifact pipeline integration: DefaultArtifactCommitter with real AsyncMutex must execute the full commit, merge, cleanup sequence using FakeGitClient and verify worktree is cleaned up | REQ-SI-05, REQ-SI-13, TSPEC Plan Task 76 | Integration | P0 |
| PROP-AC-62 | Artifact pipeline integration: DefaultAgentLogWriter with real AsyncMutex must write log entry after commit/merge, with correct header, status, and commitSha | REQ-SI-06, REQ-NF-05, TSPEC Plan Task 76 | Integration | P0 |
| PROP-AC-63 | Artifact pipeline integration: ArtifactCommitter must correctly handle no-changes path, conflict path, and docs-filter path end-to-end with real AsyncMutex | REQ-SI-05, REQ-SI-13, TSPEC Plan Task 76 | Integration | P0 |
| PROP-AC-64 | Concurrent log serialization: two concurrent AgentLogWriter.append calls through the same real AsyncMutex must produce two complete, non-interleaved table rows without data loss | REQ-NF-03, TSPEC Plan Task 77 | Integration | P0 |
| PROP-AC-65 | Concurrent log serialization: three concurrent append calls targeting different agents must produce entries in all respective agent log files without data loss | REQ-NF-03, REQ-SI-06, TSPEC Plan Task 77 | Integration | P0 |
| PROP-AC-66 | Composition root (bin/ptah.ts) must wire AsyncMutex, DefaultArtifactCommitter, DefaultAgentLogWriter, and InMemoryMessageDeduplicator into OrchestratorDeps | REQ-SI-05, REQ-SI-06, REQ-SI-09, TSPEC Plan Task 75 | Integration | P0 |

### 3.6 Performance Properties

Timeout behavior and resource limits.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-67 | AsyncMutex.acquire must throw MergeLockTimeoutError after the configured timeout elapses when a prior holder does not release | REQ-NF-03, TSPEC SS4.2.5 | Unit | P0 |
| PROP-AC-68 | ArtifactCommitter must pass 10000ms as the default lock timeout to MergeLock.acquire | REQ-NF-03, TSPEC SS5.1 | Unit | P0 |

### 3.7 Idempotency Properties

Repeated operations produce the same result.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-69 | Orchestrator must skip processing on the second encounter of the same messageId with no routing or invocation | REQ-SI-09, REQ-NF-03, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-70 | MessageDeduplicator.isDuplicate must be atomic: check-and-add in a single synchronous call, preventing TOCTOU races | REQ-SI-09, TSPEC SS4.2.6 | Unit | P0 |
| PROP-AC-71 | AsyncMutex release function must be safe to call, freeing the lock so subsequent acquirers can proceed | REQ-NF-03, TSPEC SS4.2.5 | Unit | P0 |
| PROP-AC-72 | AsyncMutex must remain usable after a holder errors in the critical section and releases via try/finally | REQ-NF-03, TSPEC SS4.2.5 | Unit | P0 |

### 3.8 Observability Properties

Logging and operational visibility.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-73 | ArtifactCommitter must log warning via logger.warn when non-docs changes are filtered from artifactChanges | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-74 | ArtifactCommitter must log warning via logger.warn when removeWorktree or deleteBranch cleanup fails | REQ-SI-13, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-75 | AgentLogWriter must log warning when creating a new log file for an agent | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-76 | AgentLogWriter must log warning when encountering a malformed log file | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-77 | AgentLogWriter must log warning when appendFile fails after retry | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-78 | AgentLogWriter must log warning on lock timeout without throwing | REQ-NF-03, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-79 | Orchestrator must log warning when messageDeduplicator detects a duplicate message | REQ-SI-09, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-80 | Orchestrator must call logger.error for merge conflict, commit-error, merge-error, and lock-timeout outcomes. Note: logger.error output is routed to the `#agent-debug` channel, so this property implicitly covers conflict logging visibility in that channel. | REQ-SI-13, REQ-NF-05, TSPEC SS5.3 | Unit | P0 |

---

## 4. Negative Properties

Properties that define what the system must NOT do. Derived from specification constraints and the inverse of positive properties.

| ID | Property | Source | Test Level | Priority |
|----|----------|--------|------------|----------|
| PROP-AC-81 | ArtifactCommitter must not acquire merge lock when commit fails (addInWorktree or commitInWorktree throws) | REQ-NF-03, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-82 | ArtifactCommitter must not clean up worktree on merge conflict or merge-error -- worktree must be retained for manual resolution | REQ-SI-13, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-83 | ArtifactCommitter must not clean up worktree on lock-timeout | REQ-NF-03, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-84 | SkillInvoker must not create or remove worktrees -- lifecycle ownership belongs to Orchestrator/ArtifactCommitter | REQ-SI-13, TSPEC SS4.2.7 | Unit | P0 |
| PROP-AC-85 | SkillInvoker must not delete branches on success, timeout, or error | TSPEC SS4.2.7 | Unit | P0 |
| PROP-AC-86 | AgentLogWriter.append must not throw on any failure path -- all errors are logged as warnings and swallowed | REQ-SI-06, TSPEC SS5.2 | Unit | P0 |
| PROP-AC-87 | Orchestrator must not invoke routing or skill for duplicate messages | REQ-SI-09, TSPEC SS5.3 | Unit | P0 |
| PROP-AC-88 | Orchestrator must not invoke routing or skill for messages with empty/missing ID | TSPEC SS5.3 | Unit | P0 |
| PROP-AC-89 | ArtifactCommitter must not stage non-docs files -- only files under `docs/` are passed to addInWorktree | REQ-SI-05, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-90 | ArtifactCommitter.commitAndMerge must not leave the merge lock held on any exit path (merged, conflict, merge-error) -- release must be called in finally block | REQ-NF-03, TSPEC SS5.1 | Unit | P0 |
| PROP-AC-94 | ArtifactCommitter must not silently discard docs changes without a commit attempt -- if artifactChanges contains docs/ files, addInWorktree and commitInWorktree must be called | REQ-SI-05, REQ-NF-05, TSPEC SS5.1 | Unit | P0 |

---

## 5. Coverage Matrix

### 5.1 Requirement Coverage

| Requirement | Properties | Coverage |
|-------------|------------|----------|
| REQ-SI-05 -- Commit /docs changes with agent attribution | PROP-AC-01 through PROP-AC-08, PROP-AC-22, PROP-AC-25, PROP-AC-26, PROP-AC-31, PROP-AC-35, PROP-AC-37, PROP-AC-38, PROP-AC-47, PROP-AC-53, PROP-AC-55, PROP-AC-56, PROP-AC-58, PROP-AC-61, PROP-AC-63, PROP-AC-66, PROP-AC-73, PROP-AC-81, PROP-AC-89, PROP-AC-93, PROP-AC-94 | Full |
| REQ-SI-06 -- Write timestamped agent log entries | PROP-AC-09 through PROP-AC-13, PROP-AC-22, PROP-AC-32, PROP-AC-42 through PROP-AC-45, PROP-AC-52, PROP-AC-54, PROP-AC-62, PROP-AC-65, PROP-AC-66, PROP-AC-75 through PROP-AC-78, PROP-AC-86, PROP-AC-92 | Full |
| REQ-SI-09 -- Idempotent message processing | PROP-AC-17 through PROP-AC-20, PROP-AC-34, PROP-AC-66, PROP-AC-69, PROP-AC-70, PROP-AC-79, PROP-AC-87, PROP-AC-88 | Full |
| REQ-SI-13 -- Worktree merge and cleanup | PROP-AC-02, PROP-AC-07, PROP-AC-08, PROP-AC-21, PROP-AC-23, PROP-AC-24, PROP-AC-29, PROP-AC-39, PROP-AC-41, PROP-AC-46, PROP-AC-48, PROP-AC-50, PROP-AC-51, PROP-AC-57, PROP-AC-59, PROP-AC-61, PROP-AC-63, PROP-AC-74, PROP-AC-80, PROP-AC-82, PROP-AC-84, PROP-AC-91 | Full |
| REQ-NF-03 -- Idempotency | PROP-AC-14 through PROP-AC-16, PROP-AC-33, PROP-AC-40, PROP-AC-44, PROP-AC-49, PROP-AC-64, PROP-AC-65, PROP-AC-67, PROP-AC-68, PROP-AC-71, PROP-AC-72, PROP-AC-78, PROP-AC-81, PROP-AC-83, PROP-AC-90 | Full |
| REQ-NF-05 -- Auditability | PROP-AC-13, PROP-AC-22, PROP-AC-30, PROP-AC-36, PROP-AC-60, PROP-AC-62, PROP-AC-80, PROP-AC-92, PROP-AC-94 | Full |

### 5.2 Specification Coverage

| Specification Section | Properties | Coverage |
|-----------------------|------------|----------|
| TSPEC SS4.2.1 (GitClient Phase 4 methods) | PROP-AC-55 through PROP-AC-59 | Full |
| TSPEC SS4.2.2 (FileSystem appendFile) | PROP-AC-36, PROP-AC-60 | Full |
| TSPEC SS4.2.3 (ArtifactCommitter protocol) | PROP-AC-01 through PROP-AC-08, PROP-AC-31, PROP-AC-37 through PROP-AC-41, PROP-AC-68, PROP-AC-73, PROP-AC-74, PROP-AC-81 through PROP-AC-83, PROP-AC-89, PROP-AC-90 | Full |
| TSPEC SS4.2.4 (AgentLogWriter protocol) | PROP-AC-09 through PROP-AC-13, PROP-AC-32, PROP-AC-42 through PROP-AC-45, PROP-AC-52, PROP-AC-54, PROP-AC-75 through PROP-AC-78, PROP-AC-86 | Full |
| TSPEC SS4.2.5 (MergeLock / AsyncMutex) | PROP-AC-14 through PROP-AC-16, PROP-AC-33, PROP-AC-67, PROP-AC-71, PROP-AC-72, PROP-AC-90 | Full |
| TSPEC SS4.2.6 (MessageDeduplicator) | PROP-AC-17 through PROP-AC-19, PROP-AC-34, PROP-AC-70 | Full |
| TSPEC SS4.2.7 (SkillInvoker updated) | PROP-AC-25, PROP-AC-26, PROP-AC-35, PROP-AC-84, PROP-AC-85 | Full |
| TSPEC SS4.2.8 (ContextAssembler updated) | PROP-AC-27, PROP-AC-28 | Full |
| TSPEC SS5.1 (ArtifactCommitter algorithm) | PROP-AC-01 through PROP-AC-08, PROP-AC-37 through PROP-AC-41, PROP-AC-53, PROP-AC-68, PROP-AC-73, PROP-AC-74, PROP-AC-81 through PROP-AC-83, PROP-AC-89, PROP-AC-90, PROP-AC-93, PROP-AC-94 | Full |
| TSPEC SS5.2 (AgentLogWriter algorithm) | PROP-AC-09 through PROP-AC-13, PROP-AC-42 through PROP-AC-45, PROP-AC-54, PROP-AC-75 through PROP-AC-78, PROP-AC-86, PROP-AC-92 | Full |
| TSPEC SS5.3 (Orchestrator updates) | PROP-AC-20 through PROP-AC-24, PROP-AC-29, PROP-AC-30, PROP-AC-46 through PROP-AC-52, PROP-AC-69, PROP-AC-79, PROP-AC-80, PROP-AC-87, PROP-AC-88, PROP-AC-91 | Full |
| TSPEC Plan Tasks 75-77 (Integration) | PROP-AC-61 through PROP-AC-66 | Full |

### 5.3 Coverage by Priority

| Priority | Total Requirements | Fully Covered | Partially Covered | No Coverage |
|----------|--------------------|---------------|-------------------|-------------|
| P0 | 6 | 6 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 |

---

## 6. Test Level Distribution

```
        /  E2E  \          0 -- not needed for Phase 4
       /----------\
      / Integration \      6 -- artifact pipeline, concurrent serialization, composition root
     /----------------\
    /    Unit Tests     \  88 -- all functional, contract, error, data, performance, idempotency, observability
   /____________________\
```

| Test Level | Property Count | Percentage |
|------------|---------------|------------|
| Unit | 88 | 94% |
| Integration | 6 | 6% |
| E2E (candidates) | 0 | 0% |
| **Total** | **94** | **100%** |

**E2E justification:** No E2E tests are needed. The protocol-based architecture with dependency injection means all ArtifactCommitter, AgentLogWriter, AsyncMutex, MessageDeduplicator, and Orchestrator behavior can be verified at the unit level using FakeGitClient, FakeFileSystem, FakeMergeLock, FakeArtifactCommitter, FakeAgentLogWriter, and FakeMessageDeduplicator. The 6 integration properties verify real AsyncMutex behavior with DefaultArtifactCommitter and DefaultAgentLogWriter, including concurrent serialization -- they do not require a full-stack E2E test.

---

## 7. Gaps and Recommendations

| # | Gap | Impact | Risk | Recommendation |
|---|-----|--------|------|----------------|
| 1 | No property for MessageDeduplicator Set growth bounding | If the bot runs for extended periods, the Set grows unboundedly. In a long-running production deployment, this could lead to memory pressure. | Low | Accepted for Phase 4 per FSPEC-AC-03 SS5.4. Defer to Phase 7 (REQ-NF-07 Polish) if production monitoring indicates memory concern. No action needed for Phase 4. |
| 2 | No property for disk-persisted deduplication across restarts | After a process restart, previously seen message IDs are lost. Discord may re-deliver recent messages on reconnect. | Low | Accepted for Phase 4. The in-memory approach is sufficient because Discord rarely re-delivers the same message ID. Defer persistence to a later phase if needed. |
| 3 | No property for Orchestrator pruneOrphanedWorktrees distinguishing committed vs uncommitted worktrees at startup | Plan Task 74 mentions "committed worktrees flagged, uncommitted pruned" but the implementation prunes all `ptah/`-prefixed worktrees. The branch-already-exists guard (Task 64) handles the runtime case. | Low | The startup prune is best-effort. The ensureUniqueBranch guard at runtime covers the correctness requirement. No additional property needed. |
| 4 | No explicit property for Orchestrator.extractDescription (threadName parsing in log summary) | The Orchestrator uses the same em-dash extraction logic as ArtifactCommitter for log entry summaries. This is tested indirectly via PROP-AC-03/04 and PROP-AC-30. | Low | Covered implicitly by existing properties. If the extraction logic is refactored to a shared utility, a dedicated property should be added. |
| 5 | Double cleanup on commit-error path | On commit-error, ArtifactCommitter cleans up the worktree internally, but the Orchestrator's error handling may also attempt cleanup. Both paths use try/catch with warning logs (PROP-AC-41, PROP-AC-47), so the second cleanup is a no-op that logs a warning. This is safe but results in redundant log output. | Low | No property change needed. The existing properties (PROP-AC-41 for ArtifactCommitter cleanup warnings, PROP-AC-47 for Orchestrator commit-error handling) already ensure both paths are safe. The double cleanup is idempotent by design. |

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | -- | -- | Pending |
| Technical Lead | -- | -- | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Test Engineer | Initial properties document -- 90 properties (80 positive + 10 negative) across 8 categories derived from 6 requirements, 004-TSPEC-ptah-artifact-commits, and 004-PLAN-TSPEC-ptah-artifact-commits (77 tasks). Full requirement and specification coverage. |
| 1.1 | March 10, 2026 | Test Engineer | Address cross-skill review feedback (PM + BE). Added 5 properties: PROP-AC-91 (general error path cleanup + error log), PROP-AC-92 (generic skill error log entry), PROP-AC-93 (CommitResult.branch always populated), PROP-AC-94 (docs changes never silently discarded). Clarified PROP-AC-45 (malformed file append behavior), PROP-AC-80 (#agent-debug channel coverage note), PROP-AC-11 (log path confirmation). Fixed REQ-NF-03 label from "Concurrent merge safety" to "Idempotency". Added Gap #5 (double cleanup safety note). Grand total: 94 properties (83 positive + 11 negative). |

---

*End of Document*
