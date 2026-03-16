# Technical Specification

## PDLC Auto-Initialization

| Field | Detail |
|-------|--------|
| **Document ID** | TSPEC-013 |
| **Requirements** | [013-REQ-pdlc-auto-init](013-REQ-pdlc-auto-init.md) (v1.2, Approved) |
| **Functional Specification** | [013-FSPEC-pdlc-auto-init](013-FSPEC-pdlc-auto-init.md) (v1.2, Approved) |
| **Date** | 2026-03-15 |
| **Version** | 1.0 |
| **Status** | Draft |

---

## 1. Summary

This TSPEC defines the implementation of PDLC auto-initialization — wiring `initializeFeature()` into the orchestrator's routing loop so that new features are automatically registered in the PDLC state machine on first encounter.

Feature 011 implemented the full PDLC state machine infrastructure and the managed/unmanaged routing branch in `executeRoutingLoop()`. It also implemented `initializeFeature()` on `PdlcDispatcher`. However, `initializeFeature()` is never called in production code: the routing loop checks `isManaged(featureSlug)` and, when no state record exists, falls through to the legacy path. This feature closes that gap.

The implementation touches exactly two files:

1. **`ptah/src/orchestrator/orchestrator.ts`** — adds the auto-init eligibility check (age guard + keyword parsing + `initializeFeature()` call) in `executeRoutingLoop()`, immediately after the `isManaged()` check returns false.
2. **`ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts`** — adds a check-before-write idempotency guard to `initializeFeature()` so a second concurrent call for the same slug returns the existing record without overwriting it.

No other Feature 011 modules (`state-machine.ts`, `state-store.ts`, `review-tracker.ts`, `phases.ts`, `context-matrix.ts`, `cross-review-parser.ts`, `migrations.ts`) are modified.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js 20 LTS | Existing project runtime |
| Language | TypeScript 5.x (ESM) | Existing project language |
| Test framework | Vitest | Existing project test framework |
| State persistence | Existing `StateStore` + `FileStateStore` from Feature 011 | No change — feature reuses existing infrastructure |
| New dependencies | None | All functionality is pure TypeScript operating on existing types |

---

## 3. Project Structure

Files marked `[NEW]` are created by this feature. Files marked `[UPDATED]` are modified. All other files are unchanged.

```
ptah/
├── src/
│   └── orchestrator/
│       ├── orchestrator.ts                    [UPDATED] Add auto-init flow in executeRoutingLoop()
│       └── pdlc/
│           └── pdlc-dispatcher.ts             [UPDATED] Add idempotency guard to initializeFeature()
├── tests/
│   ├── unit/
│   │   └── orchestrator/
│   │       ├── orchestrator.test.ts           [UPDATED] Add auto-init, age guard, keyword tests
│   │       └── pdlc/
│   │           └── auto-init.test.ts          [NEW] Unit tests for parseKeywords() and countPriorAgentTurns()
│   ├── integration/
│   │   └── orchestrator/
│   │       └── pdlc-auto-init.test.ts         [NEW] End-to-end auto-init routing loop tests
│   └── fixtures/
│       └── factories.ts                       [UPDATED] Extend FakePdlcDispatcher + FakeLogger for spy assertions
└── docs/
    └── 013-pdlc-auto-init/
        └── 013-TSPEC-pdlc-auto-init.md        [NEW] This document
```

---

## 4. Module Architecture

### 4.1 Dependency Graph

No new modules or service boundaries are introduced. Feature 013 is a targeted enhancement to existing modules.

```
orchestrator.ts  (executeRoutingLoop — modified)
  │
  ├── pdlcDispatcher: PdlcDispatcher          [EXISTING — isManaged() + initializeFeature()]
  ├── routingEngine: RoutingEngine             [EXISTING — unmanaged legacy path unchanged]
  ├── discord: DiscordClient                   [EXISTING — postChannelMessage() for debug notify]
  └── logger: Logger                           [EXISTING — info/warn/debug for auto-init events]

pdlc-dispatcher.ts  (initializeFeature — modified)
  │
  └── stateStore: StateStore                   [EXISTING — read-before-write idempotency guard]

New pure helper functions (no external deps, defined in orchestrator.ts):
  ├── countPriorAgentTurns(history: ThreadMessage[]): number
  └── parseKeywords(text: string): FeatureConfig
```

### 4.2 Types and Data Models

No new types are introduced. All types used are from Feature 011.

#### Types reused from `ptah/src/orchestrator/pdlc/phases.ts`

```typescript
export type Discipline = "backend-only" | "frontend-only" | "fullstack";

export interface FeatureConfig {
  discipline: Discipline;
  skipFspec: boolean;
}

export interface FeatureState {
  slug: string;
  phase: PdlcPhase;
  config: FeatureConfig;
  reviewPhases: Partial<Record<PdlcPhase, ReviewPhaseState>>;
  forkJoin: ForkJoinState | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
```

#### Types reused from `ptah/src/types.ts`

```typescript
export interface ThreadMessage {
  id: string;
  threadId: string;
  threadName: string;
  parentChannelId: string;
  authorId: string;
  authorName: string;
  isBot: boolean;
  content: string;
  timestamp: Date;
}
```

#### Age guard result type (internal, defined inline in orchestrator.ts)

```typescript
type AgeGuardResult =
  | { eligible: true }
  | { eligible: false; turnCount: number };
```

### 4.3 Protocols (Interfaces)

No new protocols are introduced. Feature 013 calls existing protocol methods already declared in Feature 011.

The two protocol methods used are:

```typescript
// Already declared in PdlcDispatcher (pdlc-dispatcher.ts):
isManaged(featureSlug: string): Promise<boolean>;
initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState>;
```

The `Logger` interface already supports `info`, `warn`, and `error`. No `debug` method exists in the current `Logger` interface. Per [REQ-BC-02], the "skipped auto-init" log uses `debug` level. Since the `Logger` interface only declares `info`, `warn`, and `error`, the implementation uses `logger.info()` for both the [REQ-PI-03] info-level log and the [REQ-BC-02] skipped-init log, but passes a log entry that the test spy can distinguish by message prefix. See Section 4.4.3 for the `debug`-level log resolution.

> **Resolution for REQ-BC-02 log level:** The existing `Logger` interface (`ptah/src/services/logger.ts`) exposes only `info`, `warn`, and `error`. Adding a `debug` method to the interface is the architecturally correct fix; however, it is out of scope for this feature per [C-01]. The skipped-init log is emitted at `info` level with the exact prefix `[ptah] Skipping PDLC auto-init` so test assertions can filter by message content. This is called out as an open question (OQ-01) at the end of this document.

### 4.4 Concrete Implementations

#### 4.4.1 `countPriorAgentTurns(history: ThreadMessage[]): number`

**Location:** `ptah/src/orchestrator/orchestrator.ts` (module-level private helper)

**Signature:**
```typescript
function countPriorAgentTurns(history: ThreadMessage[]): number
```

**Algorithm:**
1. Filter `history` to messages where `isBot === true` AND `content` includes the literal string `<routing>`.
2. Return the count of filtered messages.

**Invariants:**
- The current incoming message is never in `history` at the point this function is called (the history is read from Discord before the current agent invocation, not after).
- Orchestrator-generated messages (progress embeds, completion embeds, debug notifications) have `isBot === true` but contain no `<routing>` tag; they are therefore excluded by the filter.

**Edge cases:**
- Empty array → returns `0`.
- Array contains only user messages → returns `0`.
- Array contains `isBot === true` messages with no `<routing>` tag → returns `0`.

#### 4.4.2 `parseKeywords(text: string): FeatureConfig`

**Location:** `ptah/src/orchestrator/orchestrator.ts` (module-level private helper)

**Signature:**
```typescript
function parseKeywords(text: string | null | undefined): FeatureConfig
```

**Algorithm:**
1. If `text` is `null`, `undefined`, or the empty string, return `{ discipline: "backend-only", skipFspec: false }`.
2. Extract all square-bracketed tokens: match all occurrences of `\[([^\s\[\]]+)\]` using a global regex. Each captured group is one token.
3. Initialize: `let discipline: Discipline = "backend-only"`, `let skipFspec = false`.
4. For each token (in order, left to right):
   - `"backend-only"` → `discipline = "backend-only"`
   - `"frontend-only"` → `discipline = "frontend-only"`
   - `"fullstack"` → `discipline = "fullstack"`
   - `"skip-fspec"` → `skipFspec = true`
   - anything else → ignore (no error, no log)
5. Return `{ discipline, skipFspec }`.

**Regex:** `/\[([^\s\[\]]+)\]/g` — matches `[token]` where token is one or more non-whitespace, non-bracket characters. This intentionally rejects `[ fullstack ]` (space inside brackets) and matches only tight tokens.

**Business rule — last discipline wins (BR-DC-02):** Because tokens are processed left to right and each discipline keyword overwrites the previous `discipline` variable, the last discipline keyword in the message wins automatically. No special handling is needed.

**Edge cases:**
- `null` or `undefined` input → return default config (no throw).
- `"[FULLSTACK]"` → token `"FULLSTACK"` does not match `"fullstack"` (case-sensitive) → ignored → default `"backend-only"`.
- `"[ fullstack ]"` → regex requires no interior spaces → not captured → ignored → default.
- `"[skip-fspec]"` only → `{ discipline: "backend-only", skipFspec: true }`.
- `"[backend-only] [fullstack]"` → last wins → `{ discipline: "fullstack", skipFspec: false }`.

#### 4.4.3 Auto-init block in `executeRoutingLoop()`

**Location:** `ptah/src/orchestrator/orchestrator.ts` — within the `while (true)` loop, in the section currently labeled `// Phase 11: Check if this is a PDLC-managed feature`.

The existing code block:

```typescript
// Phase 11: Check if this is a PDLC-managed feature
const featureSlug = featureNameToSlug(extractFeatureName(triggerMessage.threadName));
const isManaged = await this.pdlcDispatcher.isManaged(featureSlug);

if (isManaged) {
  // ... managed path ...
}

// Unmanaged feature: use existing RoutingEngine.decide() path (backward compatibility)
const decision = this.routingEngine.decide(signal, this.config);
```

is replaced by:

```typescript
// Phase 11: Check if this is a PDLC-managed feature
// Phase 13: Auto-initialize new features
let featureSlug: string;
try {
  featureSlug = featureNameToSlug(extractFeatureName(triggerMessage.threadName));
} catch {
  // Slug resolution threw — fall through to unmanaged path (REQ-PI-01, A-06)
  featureSlug = "";
}

if (!featureSlug) {
  // Unresolvable slug — use legacy path (REQ-PI-01, A-06)
  const decision = this.routingEngine.decide(signal, this.config);
  // ... handle decision ...
  continue; // or return
}

const isManaged = await this.pdlcDispatcher.isManaged(featureSlug);

if (!isManaged) {
  // Auto-init eligibility check (FSPEC-BC-01)
  const guardResult = evaluateAgeGuard(threadHistory);
  if (!guardResult.eligible) {
    this.logger.info(
      `[ptah] Skipping PDLC auto-init for "${featureSlug}" — thread has ${guardResult.turnCount} prior turns (threshold: 1)`
    );
    // Fall through to unmanaged legacy path below
  } else {
    // Eligible — parse config keywords and initialize
    const initialMessage = threadHistory.find(m => !m.isBot) ?? null;
    const config = parseKeywords(initialMessage?.content ?? null);

    try {
      await this.pdlcDispatcher.initializeFeature(featureSlug, config);
    } catch (initError) {
      this.logger.error(
        `[ptah] Failed to auto-initialize PDLC state for "${featureSlug}": ${
          initError instanceof Error ? initError.message : String(initError)
        }`
      );
      // Do NOT proceed to managed or legacy path (BR-PI-03)
      return;
    }

    // Emit info log (REQ-PI-03) — swallow logger errors
    try {
      this.logger.info(
        `[ptah] Auto-initialized PDLC state for feature "${featureSlug}" with discipline "${config.discipline}"`
      );
    } catch {
      // logger threw — swallow and continue (REQ-PI-03)
    }

    // Post debug channel notification (REQ-PI-04) — non-fatal
    await this.postToDebugChannel(
      `[ptah] PDLC auto-init: feature "${featureSlug}" registered with discipline "${config.discipline}", starting at REQ_CREATION`
    );

    // Fall through to managed PDLC path — isManaged is now true
    // (re-enter managed branch below via goto-style label is not idiomatic;
    //  use a boolean flag instead)
  }
}

// Re-check managed status (accounts for just-initialized feature)
const isManagedNow = isManaged || (featureSlug && await this.pdlcDispatcher.isManaged(featureSlug));

if (isManagedNow) {
  // PDLC-managed feature path (unchanged from Feature 011)
  // ...
}

// Unmanaged feature: use existing RoutingEngine.decide() path
const decision = this.routingEngine.decide(signal, this.config);
// ...
```

**Implementation note — avoiding double `isManaged()` call:** The double `isManaged()` re-check above is illustrative. The cleaner production implementation uses a `let effectivelyManaged = isManaged` flag set to `true` after a successful `initializeFeature()` call, then a single `if (effectivelyManaged)` branch:

```typescript
const isManaged = await this.pdlcDispatcher.isManaged(featureSlug);
let effectivelyManaged = isManaged;

if (!isManaged) {
  const guardResult = evaluateAgeGuard(threadHistory);
  if (guardResult.eligible) {
    const initialMessage = threadHistory.find(m => !m.isBot) ?? null;
    const config = parseKeywords(initialMessage?.content ?? null);
    try {
      await this.pdlcDispatcher.initializeFeature(featureSlug, config);
      effectivelyManaged = true;
    } catch (initError) {
      this.logger.error(`[ptah] Failed to auto-initialize ...`);
      return;
    }
    try {
      this.logger.info(`[ptah] Auto-initialized PDLC state for feature "${featureSlug}" ...`);
    } catch { /* swallow */ }
    await this.postToDebugChannel(`[ptah] PDLC auto-init: ...`);
  } else {
    this.logger.info(
      `[ptah] Skipping PDLC auto-init for "${featureSlug}" — thread has ${guardResult.turnCount} prior turns (threshold: 1)`
    );
  }
}

if (effectivelyManaged) {
  // PDLC-managed path (unchanged)
  // ...
  return;
}

// Unmanaged legacy path (unchanged)
const decision = this.routingEngine.decide(signal, this.config);
```

**`threadHistory` availability:** The variable `threadHistory` is already declared earlier in the same loop iteration (line: `const threadHistory = await this.discord.readThreadHistory(...)`). The auto-init block reuses it directly. No second `readThreadHistory()` call is issued (per FSPEC-PI-01 Input note and BE cross-review F-03).

#### 4.4.4 `evaluateAgeGuard(history: ThreadMessage[]): AgeGuardResult`

**Location:** `ptah/src/orchestrator/orchestrator.ts` (module-level private helper)

**Signature:**
```typescript
function evaluateAgeGuard(history: ThreadMessage[]): AgeGuardResult
```

**Algorithm:**
1. Call `countPriorAgentTurns(history)`.
2. If count ≤ 1, return `{ eligible: true }`.
3. If count > 1, return `{ eligible: false, turnCount: count }`.

**Threshold constant:** `const AGE_GUARD_THRESHOLD = 1;` defined as a module-level constant. Changing the threshold requires a code change (BR-BC-02).

**Error handling:** If `history` is malformed or an exception is thrown during counting, the guard returns `{ eligible: true }` (fail-open, per FSPEC-BC-01 error scenario). A warning is logged.

#### 4.4.5 Idempotency guard in `DefaultPdlcDispatcher.initializeFeature()`

**Location:** `ptah/src/orchestrator/pdlc/pdlc-dispatcher.ts`

**Current implementation (no guard):**
```typescript
async initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState> {
  this.ensureLoaded();
  const now = new Date().toISOString();
  const featureState = createFeatureState(slug, config, now);
  this.state!.features[slug] = featureState;
  await this.stateStore.save(this.state!);
  return featureState;
}
```

**Updated implementation (with idempotency guard):**
```typescript
async initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState> {
  this.ensureLoaded();
  // Idempotency guard: if a state record already exists, return it without modification (REQ-PI-05)
  const existing = this.state!.features[slug];
  if (existing) {
    this.logger.debug
      ? this.logger.debug(`[ptah] PDLC auto-init skipped: "${slug}" already initialized (concurrent request)`)
      : this.logger.info(`[ptah] PDLC auto-init skipped: "${slug}" already initialized (concurrent request)`);
    return existing;
  }
  const now = new Date().toISOString();
  const featureState = createFeatureState(slug, config, now);
  this.state!.features[slug] = featureState;
  await this.stateStore.save(this.state!);
  return featureState;
}
```

**Implementation note:** Since `Logger` has no `debug` method, the idempotency log is emitted via `logger.info()`. The message prefix `[ptah] PDLC auto-init skipped:` is the observable artifact test assertions can match (per AT-PI-04 in the FSPEC). This is the same resolution as Section 4.3.

### 4.5 Composition Root

No composition root changes are needed. `DefaultPdlcDispatcher` already receives `logger` via constructor injection (Feature 011). No new dependencies are added to `OrchestratorDeps` or `DefaultOrchestrator` constructor.

---

## 5. Algorithm / Behavioral Description

### 5.1 Full Auto-Init Decision Flow

```
executeRoutingLoop()
│
├─ [existing] Invoke agent skill, parse routing signal
│
├─ [PHASE 13] Resolve featureSlug from triggerMessage.threadName
│   ├─ featureNameToSlug(extractFeatureName(threadName))
│   ├─ If resolution throws OR result is falsy → slug = ""
│   └─ If slug is "" → skip age guard, fall through to legacy path
│
├─ [existing] isManaged = await pdlcDispatcher.isManaged(featureSlug)
│
├─ If NOT isManaged:
│   │
│   ├─ [PHASE 13] evaluateAgeGuard(threadHistory)
│   │   ├─ Count messages where isBot === true AND content includes "<routing>"
│   │   ├─ count ≤ 1 → eligible: true
│   │   └─ count > 1 → eligible: false, turnCount: count
│   │
│   ├─ If NOT eligible:
│   │   ├─ logger.info("[ptah] Skipping PDLC auto-init ...")
│   │   └─ effectivelyManaged = false  →  fall through to legacy path
│   │
│   └─ If eligible:
│       ├─ initialMessage = first message in threadHistory where isBot === false
│       ├─ config = parseKeywords(initialMessage?.content ?? null)
│       │   └─ Extract [backend-only|frontend-only|fullstack|skip-fspec] tokens (case-sensitive)
│       │   └─ Last discipline keyword wins; default "backend-only"; skipFspec defaults false
│       │
│       ├─ await pdlcDispatcher.initializeFeature(featureSlug, config)
│       │   ├─ [idempotency guard] If state already exists → return existing, log info
│       │   └─ Else: createFeatureState() → save to stateStore → return new state
│       │
│       ├─ If initializeFeature() throws:
│       │   ├─ logger.error("[ptah] Failed to auto-initialize ...")
│       │   └─ RETURN — do not proceed to managed or legacy path
│       │
│       ├─ try { logger.info("[ptah] Auto-initialized PDLC state ...") } catch { /* swallow */ }
│       ├─ postToDebugChannel("[ptah] PDLC auto-init: ...") — non-fatal, warns on failure
│       └─ effectivelyManaged = true
│
├─ If effectivelyManaged:
│   └─ [existing] Managed PDLC path: processAgentCompletion() / handleDispatchAction()
│
└─ If NOT effectivelyManaged:
    └─ [existing] Legacy path: routingEngine.decide() / isTerminal / isPaused / createNewThread
```

### 5.2 Race Condition Handling

Discord dispatches messages to per-thread queues. The `ThreadQueue` serializes all messages for the same thread, so two messages for the same thread cannot trigger concurrent routing loop iterations. However, two messages on **different** threads that resolve to the same feature slug can trigger concurrent `executeRoutingLoop()` calls:

1. Thread A: `isManaged("013-pdlc-auto-init")` → `false` → eligible → `initializeFeature("013-pdlc-auto-init", config)`
2. Thread B: `isManaged("013-pdlc-auto-init")` → `false` (state not yet persisted) → eligible → `initializeFeature("013-pdlc-auto-init", config)`

The idempotency guard in `initializeFeature()` is an in-memory read before write (`this.state!.features[slug]` check). Since JavaScript is single-threaded (Node.js event loop), the two `initializeFeature()` calls are interleaved at `await stateStore.save()` boundaries but not within the synchronous read-check section:

- Call A reaches the guard: `existing = undefined` → proceeds to create state, sets `this.state!.features[slug]`.
- Before A reaches `await stateStore.save()`, Call B could begin executing.
- Call B reaches the guard: `existing = featureState` (already set in memory by Call A) → returns existing without overwrite.

This is safe because:
- The in-memory map mutation is synchronous.
- `stateStore.save()` may be called twice, but both saves contain the same state (since Call B detected the existing record and returned early without mutating `this.state`). The second save is a no-op from a correctness standpoint.

---

## 6. Error Handling

| Scenario | Behavior | Log Level | Req |
|----------|----------|-----------|-----|
| `featureNameToSlug` or `extractFeatureName` throws | `featureSlug = ""`; falls through to unmanaged legacy path | none (silent) | REQ-PI-01, A-06 |
| `featureSlug` resolves to falsy/empty string | Falls through to unmanaged legacy path without calling age guard | none (silent) | REQ-PI-01, A-06 |
| `threadHistory` is malformed during age guard evaluation | Age guard treats count as 0 → eligible (fail-open) | `warn` | FSPEC-BC-01 |
| `initializeFeature()` throws (filesystem write fails) | `logger.error(...)`, `return` — neither managed nor legacy path invoked | `error` | BR-PI-03, AT-PI-03 |
| Logger throws when emitting info log after init | Error swallowed; feature remains initialized; routing proceeds | — (swallowed) | REQ-PI-03 |
| `postToDebugChannel()` fails | `logger.warn("Failed to post to #agent-debug")` (existing `postToDebugChannel` implementation) | `warn` | REQ-PI-04 |
| `initializeFeature()` called for already-existing slug (race) | Returns existing `FeatureState` without overwrite; logs info-level idempotency message | `info` | REQ-PI-05, AT-PI-04 |

---

## 7. Test Strategy

### 7.1 Approach

All tests use Vitest with test doubles (fakes). No real filesystem, Discord, or Git operations occur in unit tests. Integration tests exercise the orchestrator wiring with all fakes, asserting observable side effects (log messages, `initializeFeature()` call count, managed-path invocations).

Test-first order:
1. Pure helpers: `countPriorAgentTurns` and `parseKeywords` — fully deterministic, zero dependencies.
2. `evaluateAgeGuard` — wraps `countPriorAgentTurns` with threshold logic.
3. `DefaultPdlcDispatcher.initializeFeature()` idempotency guard — unit-tested in `pdlc-dispatcher.test.ts`.
4. Orchestrator integration tests — `orchestrator.test.ts` (existing file, new test cases) + `pdlc-auto-init.test.ts` (new integration file).

### 7.2 Test Doubles

All test doubles already exist in `ptah/tests/fixtures/factories.ts`. The following minimal additions are required:

#### `FakePdlcDispatcher` additions

```typescript
// Additions to existing FakePdlcDispatcher in factories.ts:
export class FakePdlcDispatcher implements PdlcDispatcher {
  // ... existing fields ...

  // Control flag: if true, initializeFeature() marks the slug as managed after init
  autoRegisterOnInit = false;

  // Override: if set, initializeFeature() throws this error
  initError: Error | null = null;

  async initializeFeature(slug: string, config: FeatureConfig): Promise<FeatureState> {
    this.initializeFeatureCalls.push({ slug, config });
    if (this.initError) throw this.initError;
    if (!this.initResult) throw new Error("FakePdlcDispatcher: no initResult configured");
    if (this.autoRegisterOnInit) {
      this.managedSlugs.add(slug);
    }
    return this.initResult;
  }
}
```

#### `FakeLogger` additions

The existing `FakeLogger` already captures all messages with `{ level, message }`. No changes needed. Test assertions filter by `level` and `message` content:

```typescript
// Existing FakeLogger supports this assertion pattern already:
const infoLogs = logger.messages.filter(m => m.level === "info");
expect(infoLogs.some(m => m.message.includes("Auto-initialized PDLC state"))).toBe(true);

// For the skip log:
expect(logger.messages.some(m =>
  m.level === "info" &&
  m.message.includes("[ptah] Skipping PDLC auto-init") &&
  m.message.includes("prior turns")
)).toBe(true);
```

#### Thread message factory helper

```typescript
// Helper to create a thread message with isBot and content (used in age guard tests):
export function createBotMessageWithRouting(content = "<routing>{}</routing>"): ThreadMessage {
  return createThreadMessage({ isBot: true, content });
}
export function createBotMessageNoRouting(content = "Progress update"): ThreadMessage {
  return createThreadMessage({ isBot: true, content });
}
```

### 7.3 Test Categories

| Category | File | Test IDs | Covers |
|----------|------|----------|--------|
| Pure helper — `countPriorAgentTurns` | `tests/unit/orchestrator/pdlc/auto-init.test.ts` | UT-CAT-01 to UT-CAT-06 | Zero history, user-only history, bot-with-routing, bot-without-routing, mixed |
| Pure helper — `parseKeywords` | `tests/unit/orchestrator/pdlc/auto-init.test.ts` | UT-KW-01 to UT-KW-09 | No keywords, each valid keyword, case variants, conflict (last wins), unknown token |
| Pure helper — `evaluateAgeGuard` | `tests/unit/orchestrator/pdlc/auto-init.test.ts` | UT-AG-01 to UT-AG-05 | 0 turns, 1 turn (boundary), 2 turns (boundary), 5 turns, empty history |
| `initializeFeature()` idempotency | `tests/unit/orchestrator/pdlc/pdlc-dispatcher.test.ts` | UT-IDP-01, UT-IDP-02 | First call creates; second call returns existing without overwrite |
| Orchestrator auto-init — new feature | `tests/unit/orchestrator/orchestrator.test.ts` | UT-ORC-AI-01 to UT-ORC-AI-06 | AT-PI-01 through AT-PI-06 from FSPEC |
| Orchestrator age guard — skip | `tests/unit/orchestrator/orchestrator.test.ts` | UT-ORC-BC-01 to UT-ORC-BC-05 | AT-BC-01 through AT-BC-05 from FSPEC |
| Orchestrator keyword parsing — integration | `tests/unit/orchestrator/orchestrator.test.ts` | UT-ORC-DC-01 to UT-ORC-DC-09 | AT-DC-01 through AT-DC-09 from FSPEC |
| Orchestrator unresolvable slug | `tests/unit/orchestrator/orchestrator.test.ts` | UT-ORC-SLUG-01 | Falsy slug → no auto-init, no age guard |
| Integration — full routing loop | `tests/integration/orchestrator/pdlc-auto-init.test.ts` | IT-01 to IT-05 | New feature auto-init → managed path; old feature → legacy; concurrent same-slug |

### 7.4 Key Test Cases

#### UT-CAT-01: `countPriorAgentTurns` — empty history

```typescript
it("returns 0 for empty history", () => {
  expect(countPriorAgentTurns([])).toBe(0);
});
```

#### UT-CAT-04: `countPriorAgentTurns` — bot message without routing tag excluded

```typescript
it("excludes bot messages that lack <routing> tag", () => {
  const history = [
    createThreadMessage({ isBot: true, content: "Progress: assembling context..." }),
    createThreadMessage({ isBot: false, content: "@pm create REQ" }),
  ];
  expect(countPriorAgentTurns(history)).toBe(0);
});
```

#### UT-KW-07: `parseKeywords` — last discipline keyword wins

```typescript
it("uses last discipline keyword when multiple present", () => {
  expect(parseKeywords("@pm create REQ [backend-only] [fullstack]"))
    .toEqual({ discipline: "fullstack", skipFspec: false });
});
```

#### UT-AG-03: `evaluateAgeGuard` — boundary at 2

```typescript
it("returns not eligible for exactly 2 prior agent turns", () => {
  const history = [
    createBotMessageWithRouting(),
    createBotMessageWithRouting(),
  ];
  const result = evaluateAgeGuard(history);
  expect(result.eligible).toBe(false);
  expect((result as { eligible: false; turnCount: number }).turnCount).toBe(2);
});
```

#### UT-ORC-AI-01: New feature (0 prior turns) auto-initializes and routes managed

```typescript
it("auto-initializes new feature and routes through managed path", async () => {
  // Setup: slug not managed, 0 prior bot turns in history
  pdlcDispatcher.managedSlugs.clear();
  pdlcDispatcher.autoRegisterOnInit = true;
  pdlcDispatcher.initResult = { /* FeatureState at REQ_CREATION */ };
  pdlcDispatcher.agentCompletionResult = { action: "wait" };
  discord.threadHistory = [createThreadMessage({ isBot: false, content: "@pm create REQ" })];
  invocationGuard.results = [{ status: "success", invocationResult: lgtmResult(), commitResult: defaultCommitResult() }];

  const msg = createThreadMessage({ threadName: "013-pdlc-auto-init — create REQ" });
  await orchestrator.handleMessage(msg);
  await threadQueue.drain();

  expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
  expect(pdlcDispatcher.initializeFeatureCalls[0].config).toEqual({ discipline: "backend-only", skipFspec: false });
  expect(pdlcDispatcher.processAgentCompletionCalls).toHaveLength(1);
  expect(logger.messages.some(m => m.message.includes("Auto-initialized PDLC state"))).toBe(true);
});
```

#### UT-ORC-AI-03: `initializeFeature()` throws → return, no managed or legacy path

```typescript
it("halts routing when initializeFeature() throws", async () => {
  pdlcDispatcher.managedSlugs.clear();
  pdlcDispatcher.initError = new Error("disk full");
  discord.threadHistory = [createThreadMessage({ isBot: false, content: "@pm create REQ" })];
  invocationGuard.results = [{ status: "success", invocationResult: lgtmResult(), commitResult: defaultCommitResult() }];

  const msg = createThreadMessage({ threadName: "013-pdlc-auto-init — create REQ" });
  await orchestrator.handleMessage(msg);
  await threadQueue.drain();

  expect(pdlcDispatcher.initializeFeatureCalls).toHaveLength(1);
  expect(pdlcDispatcher.processAgentCompletionCalls).toHaveLength(0);
  expect(routingEngine.decideCalls).toHaveLength(0);
  expect(logger.messages.some(m => m.level === "error" && m.message.includes("Failed to auto-initialize"))).toBe(true);
});
```

#### UT-IDP-01: `initializeFeature()` idempotency — second call returns existing

```typescript
it("returns existing state without overwrite on second call for same slug", async () => {
  const store = new FakeStateStore();
  const dispatcher = new DefaultPdlcDispatcher(store, new FakeFileSystem(), new FakeLogger(), "docs");
  await dispatcher.loadState();

  const config: FeatureConfig = { discipline: "backend-only", skipFspec: false };
  const first = await dispatcher.initializeFeature("013-pdlc-auto-init", config);

  const config2: FeatureConfig = { discipline: "fullstack", skipFspec: true };
  const second = await dispatcher.initializeFeature("013-pdlc-auto-init", config2);

  expect(second).toBe(first);  // same object reference
  expect(second.config.discipline).toBe("backend-only");  // not overwritten by second call
  expect(store.saveCount).toBe(1);  // only saved once
});
```

---

## 8. Requirement → Technical Component Mapping

| Requirement ID | Description | Component | Implementation Location |
|----------------|-------------|-----------|------------------------|
| REQ-PI-01 | Auto-initialize on first signal | `executeRoutingLoop()` auto-init block | `orchestrator.ts` lines after `isManaged` check |
| REQ-PI-02 | Default feature configuration `{ discipline: "backend-only", skipFspec: false }` | `parseKeywords()` default return | `orchestrator.ts` module-level helper |
| REQ-PI-03 | Log `[ptah] Auto-initialized PDLC state for feature ...` at info level | `logger.info(...)` call in auto-init block; swallowed on logger throw | `orchestrator.ts` |
| REQ-PI-04 | Post debug channel notification; non-fatal | `postToDebugChannel(...)` call after info log | `orchestrator.ts` (reuses existing `postToDebugChannel` method) |
| REQ-PI-05 | Idempotent initialization — check-before-write | Early return if `this.state!.features[slug]` exists | `pdlc-dispatcher.ts` `initializeFeature()` |
| REQ-BC-01 | Age guard: ≤ 1 prior agent turn to be eligible | `evaluateAgeGuard()` + `countPriorAgentTurns()` | `orchestrator.ts` module-level helpers |
| REQ-BC-02 | Debug log when age guard fails: exact message format | `logger.info("[ptah] Skipping PDLC auto-init ...")` | `orchestrator.ts` auto-init block, ineligible branch |
| REQ-DC-01 | Discipline keyword parsing (`[backend-only]`, `[frontend-only]`, `[fullstack]`) | `parseKeywords()` regex token extraction | `orchestrator.ts` module-level helper |
| REQ-DC-02 | `[skip-fspec]` keyword sets `skipFspec: true` | `parseKeywords()` | `orchestrator.ts` module-level helper |
| REQ-DC-03 | Unknown keywords ignored silently | `parseKeywords()` default case | `orchestrator.ts` module-level helper |
| REQ-NF-01 | Latency ≤ 100ms p95 | Single `initializeFeature()` call (one state file write) — no additional I/O introduced | — (no new I/O, existing benchmark applies) |
| REQ-NF-02 | No state schema change | No modification to `FeatureState`, `FeatureConfig`, or `PdlcStateFile` | — |
| REQ-NF-03 | Test coverage for all new code paths | Unit tests for helpers, orchestrator tests, dispatcher idempotency test | `auto-init.test.ts`, `orchestrator.test.ts`, `pdlc-dispatcher.test.ts` |

---

## 9. Integration Points

### 9.1 `executeRoutingLoop()` — insertion point

The auto-init block is inserted immediately after the existing `isManaged` call (line 498 in current `orchestrator.ts`), before the `if (isManaged)` branch. The existing managed-path block and legacy-path block are preserved unchanged; only the `if (isManaged)` condition is replaced with `if (effectivelyManaged)`.

**Constraint:** The `threadHistory` variable used by the auto-init block must be the same variable populated earlier in the same loop iteration (line ~380: `const threadHistory = await this.discord.readThreadHistory(...)`). No second read is issued.

### 9.2 `PdlcDispatcher.initializeFeature()` — idempotency guard

The guard is a pure in-memory read (`this.state!.features[slug]`) before the write. It does not call `stateStore.load()` again and does not issue any disk I/O for the check. The observable side effect for tests is the `logger.info(...)` message with the `"already initialized (concurrent request)"` suffix.

### 9.3 `FakePdlcDispatcher` — test double update

The `initResult` must be configured to a valid `FeatureState` for any test that exercises the auto-init path. Tests that expect `initializeFeature()` to throw set `initError` instead. The `autoRegisterOnInit = true` flag causes the fake to add the slug to `managedSlugs` on a successful init call, simulating the real dispatcher's behavior where `isManaged()` returns `true` after init.

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| OQ-01 | `Logger` interface lacks a `debug` method. [REQ-BC-02] requires a "debug-level" log assertable via a test spy. The current resolution is to use `logger.info()` with a distinguishing message prefix. Should a `debug` method be added to the `Logger` interface in a follow-on feature? | Deferred — current implementation uses `info` level with prefix `[ptah] Skipping PDLC auto-init`; test assertions match on message content |
| OQ-02 | Should keyword parsing be extended to the thread name (not just the initial message body)? Some developers may put discipline hints in the thread name. Not required by current requirements. | Deferred |
| OQ-03 | The age guard threshold of 1 is hardcoded. Should it be a `ptah.config.json` setting? [BR-BC-02] says changing it requires a code change. If operational experience shows the threshold needs tuning, this could become a config value. | Deferred |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | Backend Engineer | Initial TSPEC — module architecture, concrete implementations for `countPriorAgentTurns`, `parseKeywords`, `evaluateAgeGuard`, auto-init block in `executeRoutingLoop()`, idempotency guard in `initializeFeature()`, test strategy |

---

*End of Document*
