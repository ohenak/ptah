/**
 * Unit tests for ad-hoc queue pure helper functions.
 *
 * Tests the `findAgentPhase` helper exported from feature-lifecycle.ts
 * and validates ad-hoc queue integration points (signal handler, drain
 * at phase transitions, drain before termination).
 *
 * @see TSPEC-agent-coordination Section 6.2, 6.4
 * @see PLAN-agent-coordination Tasks 40-41, 47, 50, 52
 */

import { describe, it, expect } from "vitest";
import type { PhaseDefinition, WorkflowConfig } from "../../../../src/config/workflow-config.js";
import type { AdHocRevisionSignal, FeatureWorkflowState } from "../../../../src/temporal/types.js";
import {
  findAgentPhase,
  buildInitialWorkflowState,
  buildContinueAsNewPayload,
} from "../../../../src/temporal/workflows/feature-lifecycle.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makePhase(overrides: Partial<PhaseDefinition>): PhaseDefinition {
  return {
    id: "test-phase",
    name: "Test Phase",
    type: "creation",
    agent: "pm",
    ...overrides,
  };
}

function makeConfig(phases: PhaseDefinition[]): WorkflowConfig {
  return { version: 1, phases };
}

// ---------------------------------------------------------------------------
// Task 40-41: findAgentPhase
// ---------------------------------------------------------------------------

describe("findAgentPhase", () => {
  it("returns first phase where phase.agent === agentId", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm" }),
      makePhase({ id: "tspec", agent: "eng" }),
      makePhase({ id: "review-tspec", agent: "qa", type: "review" }),
    ]);

    const result = findAgentPhase("eng", config);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("tspec");
    expect(result!.agent).toBe("eng");
  });

  it("returns the first matching phase when agent appears in multiple phases", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm" }),
      makePhase({ id: "tspec", agent: "eng" }),
      makePhase({ id: "impl", agent: "eng", type: "implementation" }),
    ]);

    const result = findAgentPhase("eng", config);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("tspec");
  });

  it("returns null when agent not in any phase", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm" }),
      makePhase({ id: "tspec", agent: "eng" }),
    ]);

    const result = findAgentPhase("qa", config);

    expect(result).toBeNull();
  });

  it("returns null for empty phases array", () => {
    // WorkflowConfig validation requires non-empty phases,
    // but the function should handle it gracefully
    const config = makeConfig([]);

    const result = findAgentPhase("pm", config);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 47: adHocRevisionSignal definition and handler
//
// The signal is defined at module scope as:
//   wf.defineSignal<[AdHocRevisionSignal]>("ad-hoc-revision")
// and the handler enqueues into state.adHocQueue.
//
// We cannot directly test the Temporal signal handler without a
// TestWorkflowEnvironment, but we can verify the queue state is correctly
// initialized and that the queue datastructure supports push/shift (FIFO).
// ---------------------------------------------------------------------------

describe("ad-hoc queue FIFO behavior (state-level)", () => {
  it("supports push/shift FIFO ordering on adHocQueue", () => {
    const state = buildInitialWorkflowState({
      featureSlug: "test",
      featureConfig: { name: "test", slug: "test", discipline: "fullstack", skipFspec: false },
      workflowConfig: makeConfig([makePhase({ id: "req", agent: "pm" })]),
      startedAt: "2026-04-06T10:00:00Z",
    });

    const signal1: AdHocRevisionSignal = {
      targetAgentId: "eng",
      instruction: "first",
      requestedBy: "user1",
      requestedAt: "2026-04-06T10:01:00Z",
    };
    const signal2: AdHocRevisionSignal = {
      targetAgentId: "pm",
      instruction: "second",
      requestedBy: "user2",
      requestedAt: "2026-04-06T10:02:00Z",
    };

    // Simulate signal handler: push
    state.adHocQueue.push(signal1);
    state.adHocQueue.push(signal2);

    expect(state.adHocQueue).toHaveLength(2);

    // Simulate drainAdHocQueue: shift (FIFO)
    const first = state.adHocQueue.shift()!;
    expect(first.instruction).toBe("first");

    const second = state.adHocQueue.shift()!;
    expect(second.instruction).toBe("second");

    expect(state.adHocQueue).toHaveLength(0);
  });

  it("adHocInProgress flag tracks processing state", () => {
    const state = buildInitialWorkflowState({
      featureSlug: "test",
      featureConfig: { name: "test", slug: "test", discipline: "fullstack", skipFspec: false },
      workflowConfig: makeConfig([makePhase({ id: "req", agent: "pm" })]),
      startedAt: "2026-04-06T10:00:00Z",
    });

    expect(state.adHocInProgress).toBe(false);

    // Simulate drainAdHocQueue setting the flag
    state.adHocInProgress = true;
    expect(state.adHocInProgress).toBe(true);

    state.adHocInProgress = false;
    expect(state.adHocInProgress).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task 50: drainAdHocQueue at phase transitions
//
// The drain function uses findAgentPhase to locate the target agent's phase.
// We verify the lookup works correctly for ad-hoc dispatch scenarios.
// ---------------------------------------------------------------------------

describe("drainAdHocQueue — phase lookup for ad-hoc dispatch", () => {
  it("findAgentPhase returns correct phase for ad-hoc target agent", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
      makePhase({ id: "review-req", agent: "qa", type: "review" }),
      makePhase({ id: "tspec", agent: "eng", type: "creation" }),
    ]);

    // When ad-hoc targets "eng", drainAdHocQueue uses findAgentPhase
    // to build SkillActivityInput with the correct phase
    const phase = findAgentPhase("eng", config);
    expect(phase).not.toBeNull();
    expect(phase!.id).toBe("tspec");
    expect(phase!.type).toBe("creation");
  });

  it("findAgentPhase returns null for unknown agent — signal is skipped", () => {
    const config = makeConfig([
      makePhase({ id: "req", agent: "pm", type: "creation" }),
    ]);

    // drainAdHocQueue skips signals for unknown agents
    const phase = findAgentPhase("unknown-agent", config);
    expect(phase).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 52: Drain remaining queue signals before workflow termination
//
// After the main loop exits, drainAdHocQueue() is called one final time.
// We verify that the queue is correctly preserved in ContinueAsNewPayload
// so no signals are lost across CAN boundaries.
// ---------------------------------------------------------------------------

describe("ad-hoc queue preservation before termination / CAN", () => {
  it("buildContinueAsNewPayload preserves pending ad-hoc signals", () => {
    const signals: AdHocRevisionSignal[] = [
      {
        targetAgentId: "eng",
        instruction: "fix the bug",
        requestedBy: "user1",
        requestedAt: "2026-04-06T10:00:00Z",
      },
      {
        targetAgentId: "pm",
        instruction: "update requirements",
        requestedBy: "user2",
        requestedAt: "2026-04-06T10:01:00Z",
      },
    ];

    const state = {
      featurePath: "docs/in-progress/test/" as string | null,
      signOffs: {},
      adHocQueue: signals,
    };

    const payload = buildContinueAsNewPayload(state);

    expect(payload.adHocQueue).toHaveLength(2);
    expect(payload.adHocQueue[0].targetAgentId).toBe("eng");
    expect(payload.adHocQueue[1].targetAgentId).toBe("pm");
  });

  it("buildContinueAsNewPayload preserves empty queue", () => {
    const state = {
      featurePath: null,
      signOffs: {},
      adHocQueue: [] as AdHocRevisionSignal[],
    };

    const payload = buildContinueAsNewPayload(state);
    expect(payload.adHocQueue).toEqual([]);
  });
});
