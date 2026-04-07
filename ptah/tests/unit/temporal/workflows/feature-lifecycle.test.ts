/**
 * Unit tests for Phase H workflow integration helpers.
 *
 * Tests the `buildInitialWorkflowState` ad-hoc queue initialization and
 * `buildContinueAsNewPayload` ad-hoc queue carry-over.
 *
 * @see TSPEC-agent-coordination Section 6.2 (Workflow Queue Management)
 * @see PLAN-agent-coordination Tasks 48-49
 */

import { describe, it, expect } from "vitest";
import type { WorkflowConfig } from "../../../../src/config/workflow-config.js";
import type { FeatureConfig } from "../../../../src/types.js";
import type { AdHocRevisionSignal } from "../../../../src/temporal/types.js";
import {
  buildInitialWorkflowState,
  buildContinueAsNewPayload,
} from "../../../../src/temporal/workflows/feature-lifecycle.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeWorkflowConfig(): WorkflowConfig {
  return {
    version: 1,
    phases: [
      { id: "req", name: "Requirements", type: "creation", agent: "pm" },
      { id: "tspec", name: "Tech Spec", type: "creation", agent: "eng" },
    ],
  };
}

function makeFeatureConfig(): FeatureConfig {
  return {
    name: "test-feature",
    slug: "test-feature",
    discipline: "fullstack",
    skipFspec: false,
  };
}

function makeAdHocSignal(overrides?: Partial<AdHocRevisionSignal>): AdHocRevisionSignal {
  return {
    targetAgentId: "eng",
    instruction: "revise the TSPEC",
    requestedBy: "user1",
    requestedAt: "2026-04-06T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task 48: buildInitialWorkflowState initializes ad-hoc queue fields
// ---------------------------------------------------------------------------

describe("buildInitialWorkflowState — ad-hoc queue fields", () => {
  it("initializes adHocQueue as empty array", () => {
    const state = buildInitialWorkflowState({
      featureSlug: "test-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeWorkflowConfig(),
      startedAt: "2026-04-06T10:00:00Z",
    });

    expect(state.adHocQueue).toEqual([]);
  });

  it("initializes adHocInProgress as false", () => {
    const state = buildInitialWorkflowState({
      featureSlug: "test-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeWorkflowConfig(),
      startedAt: "2026-04-06T10:00:00Z",
    });

    expect(state.adHocInProgress).toBe(false);
  });

  it("adHocQueue is a fresh array (not shared reference)", () => {
    const state1 = buildInitialWorkflowState({
      featureSlug: "test-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeWorkflowConfig(),
      startedAt: "2026-04-06T10:00:00Z",
    });
    const state2 = buildInitialWorkflowState({
      featureSlug: "test-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeWorkflowConfig(),
      startedAt: "2026-04-06T10:00:00Z",
    });

    expect(state1.adHocQueue).not.toBe(state2.adHocQueue);
  });
});

// ---------------------------------------------------------------------------
// Task 49: buildContinueAsNewPayload carries adHocQueue across CAN boundary
// ---------------------------------------------------------------------------

describe("buildContinueAsNewPayload — ad-hoc queue carry-over", () => {
  it("includes adHocQueue in the payload", () => {
    const signals = [makeAdHocSignal(), makeAdHocSignal({ targetAgentId: "pm" })];
    const state = {
      featurePath: "docs/in-progress/test-feature/" as string | null,
      signOffs: {},
      adHocQueue: signals,
    };

    const payload = buildContinueAsNewPayload(state);

    expect(payload.adHocQueue).toEqual(signals);
  });

  it("carries empty adHocQueue when no pending signals", () => {
    const state = {
      featurePath: "docs/in-progress/test-feature/" as string | null,
      signOffs: {},
      adHocQueue: [] as AdHocRevisionSignal[],
    };

    const payload = buildContinueAsNewPayload(state);

    expect(payload.adHocQueue).toEqual([]);
  });

  it("creates a shallow copy of adHocQueue (not same reference)", () => {
    const signals = [makeAdHocSignal()];
    const state = {
      featurePath: "docs/in-progress/test-feature/" as string | null,
      signOffs: {},
      adHocQueue: signals,
    };

    const payload = buildContinueAsNewPayload(state);

    expect(payload.adHocQueue).not.toBe(signals);
    expect(payload.adHocQueue).toEqual(signals);
  });
});
