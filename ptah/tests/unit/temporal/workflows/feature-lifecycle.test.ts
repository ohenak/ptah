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
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
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

// ---------------------------------------------------------------------------
// REQ-FJ-01: Fork/Join ROUTE_TO_USER — no double-invocation
//
// The dispatchForkJoin function must use questionResult directly from
// handleQuestionFlow, NOT re-invoke the agent a second time. handleQuestionFlow
// already re-invokes the agent internally and returns the final result.
//
// This static analysis test verifies the fix by inspecting the source code
// of the dispatchForkJoin function to ensure no invokeSkill call follows
// handleQuestionFlow within the ROUTE_TO_USER handling block.
// ---------------------------------------------------------------------------

describe("REQ-FJ-01: dispatchForkJoin — no redundant invokeSkill after handleQuestionFlow", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("does not call invokeSkill after handleQuestionFlow in the ROUTE_TO_USER loop of dispatchForkJoin", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the dispatchForkJoin function body (from its declaration to the next
    // top-level async function declaration or end of file)
    const forkJoinMatch = source.match(
      /async function dispatchForkJoin\b[\s\S]*?(?=\nasync function |\n\/\/ -{10,})/
    );
    expect(forkJoinMatch).not.toBeNull();
    const forkJoinBody = forkJoinMatch![0];

    // Find the ROUTE_TO_USER handling section (after routeToUserAgents.length > 0)
    const routeToUserSection = forkJoinBody.match(
      /routeToUserAgents\.length > 0[\s\S]*?_state = state;\s*\}/
    );
    expect(routeToUserSection).not.toBeNull();
    const routeToUserCode = routeToUserSection![0];

    // The ROUTE_TO_USER section must call handleQuestionFlow but must NOT
    // contain a subsequent invokeSkill call (that would be the double-invocation bug)
    expect(routeToUserCode).toContain("handleQuestionFlow");

    // Check that there is no invokeSkill call in the ROUTE_TO_USER section
    // (handleQuestionFlow already calls invokeSkill internally)
    const invokeSkillCalls = routeToUserCode
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .filter((line) => /\bawait\s+invokeSkill\b/.test(line));
    expect(invokeSkillCalls).toHaveLength(0);
  });

  it("uses questionResult directly for agentResults status in dispatchForkJoin ROUTE_TO_USER handling", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the dispatchForkJoin function body
    const forkJoinMatch = source.match(
      /async function dispatchForkJoin\b[\s\S]*?(?=\nasync function |\n\/\/ -{10,})/
    );
    expect(forkJoinMatch).not.toBeNull();
    const forkJoinBody = forkJoinMatch![0];

    // Find the ROUTE_TO_USER handling section
    const routeToUserSection = forkJoinBody.match(
      /routeToUserAgents\.length > 0[\s\S]*?_state = state;\s*\}/
    );
    expect(routeToUserSection).not.toBeNull();
    const routeToUserCode = routeToUserSection![0];

    // The code should reference questionResult for building agentResults
    // (not reinvokeResult, which was the buggy variable name)
    expect(routeToUserCode).toContain("questionResult");
    expect(routeToUserCode).not.toContain("reinvokeResult");
  });
});
