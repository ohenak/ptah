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

// ---------------------------------------------------------------------------
// REQ-CD-01: Context Document Resolution at Dispatch Sites
//
// Each dispatch site (dispatchSingleAgent, dispatchForkJoin, runReviewCycle)
// must call resolveContextDocuments() before buildInvokeSkillInput() and pass
// the resolved refs via resolvedContextDocumentRefs.
// ---------------------------------------------------------------------------

describe("REQ-CD-01: dispatchSingleAgent — resolves context documents before buildInvokeSkillInput", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("calls resolveContextDocuments before buildInvokeSkillInput in dispatchSingleAgent", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the dispatchSingleAgent function body
    const fnMatch = source.match(
      /async function dispatchSingleAgent\b[\s\S]*?(?=\n\/\/ -{10,}|\nasync function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must contain resolveContextDocuments call
    expect(fnBody).toContain("resolveContextDocuments");

    // resolveContextDocuments must appear BEFORE buildInvokeSkillInput
    const resolveIdx = fnBody.indexOf("resolveContextDocuments");
    const buildIdx = fnBody.indexOf("buildInvokeSkillInput");
    expect(resolveIdx).toBeLessThan(buildIdx);

    // Must pass resolvedContextDocumentRefs to buildInvokeSkillInput
    expect(fnBody).toContain("resolvedContextDocumentRefs");
  });
});

describe("REQ-CD-01: dispatchForkJoin — resolves context documents before buildInvokeSkillInput", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("calls resolveContextDocuments before buildInvokeSkillInput in dispatchForkJoin", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the dispatchForkJoin function body
    const fnMatch = source.match(
      /async function dispatchForkJoin\b[\s\S]*?(?=\n\/\/ -{10,}|\nasync function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must contain resolveContextDocuments call
    expect(fnBody).toContain("resolveContextDocuments");

    // resolveContextDocuments must appear BEFORE buildInvokeSkillInput
    const resolveIdx = fnBody.indexOf("resolveContextDocuments");
    const buildIdx = fnBody.indexOf("buildInvokeSkillInput");
    expect(resolveIdx).toBeLessThan(buildIdx);

    // Must pass resolvedContextDocumentRefs to buildInvokeSkillInput
    expect(fnBody).toContain("resolvedContextDocumentRefs");
  });
});

describe("REQ-CD-01: runReviewCycle — resolves context documents before buildInvokeSkillInput", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("calls resolveContextDocuments before buildInvokeSkillInput in runReviewCycle", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the runReviewCycle function body
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must contain resolveContextDocuments call
    expect(fnBody).toContain("resolveContextDocuments");

    // resolveContextDocuments must appear BEFORE buildInvokeSkillInput
    const resolveIdx = fnBody.indexOf("resolveContextDocuments");
    const buildIdx = fnBody.indexOf("buildInvokeSkillInput");
    expect(resolveIdx).toBeLessThan(buildIdx);

    // Must pass resolvedContextDocumentRefs to buildInvokeSkillInput
    expect(fnBody).toContain("resolvedContextDocumentRefs");
  });
});

// ---------------------------------------------------------------------------
// REQ-RC-01 E1: readCrossReviewRecommendation proxy
//
// The workflow must register a separate proxyActivities call for
// readCrossReviewRecommendation with a 30s startToCloseTimeout (shorter
// than the main invokeSkill proxy which uses 30 minutes).
// ---------------------------------------------------------------------------

describe("REQ-RC-01 E1: readCrossReviewRecommendation activity proxy", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("has a proxyActivities call that includes readCrossReviewRecommendation", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // The workflow must have a proxyActivities call that destructures readCrossReviewRecommendation
    expect(source).toContain("readCrossReviewRecommendation");

    // It should be destructured from a proxyActivities call
    const proxyPattern = /proxyActivities[\s\S]*?readCrossReviewRecommendation/;
    expect(proxyPattern.test(source)).toBe(true);
  });

  it("uses a 30-second timeout for the cross-review proxy (not the 30-minute invokeSkill timeout)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Find the proxyActivities block that contains readCrossReviewRecommendation
    // and verify it has a 30-second timeout (not 30 minutes)
    const crossReviewProxyMatch = source.match(
      /(?:const\s*\{[^}]*readCrossReviewRecommendation[^}]*\}\s*=\s*wf\.proxyActivities[\s\S]*?\{[\s\S]*?startToCloseTimeout[\s\S]*?\}[\s\S]*?\))/
    );
    expect(crossReviewProxyMatch).not.toBeNull();
    const proxyBlock = crossReviewProxyMatch![0];

    // Must use "30 seconds" or "30s" — NOT "30 minutes"
    expect(proxyBlock).toMatch(/30\s*second/i);
    expect(proxyBlock).not.toContain("30 minute");
  });
});

// ---------------------------------------------------------------------------
// REQ-RC-01 E2: Replace routingSignalType proxy with readCrossReviewRecommendation
//
// In runReviewCycle, the recommendation should come from calling the
// readCrossReviewRecommendation activity, NOT from result.routingSignalType
// via mapRecommendationToStatus.
// ---------------------------------------------------------------------------

describe("REQ-RC-01 E2: runReviewCycle uses readCrossReviewRecommendation instead of routingSignalType", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("calls readCrossReviewRecommendation in runReviewCycle", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the runReviewCycle function body
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must call readCrossReviewRecommendation
    expect(fnBody).toContain("readCrossReviewRecommendation");
  });

  it("does not use mapRecommendationToStatus in runReviewCycle", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the runReviewCycle function body
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must NOT use mapRecommendationToStatus (old approach)
    expect(fnBody).not.toContain("mapRecommendationToStatus");
  });

  it("calls deriveDocumentType to get the document type for cross-review lookup", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the runReviewCycle function body
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must call deriveDocumentType to derive the document type from the phase ID
    expect(fnBody).toContain("deriveDocumentType");
  });
});

// ---------------------------------------------------------------------------
// REQ-RC-01 E3: Handle parse_error in review cycle
//
// When readCrossReviewRecommendation returns status === "parse_error",
// the workflow must enter handleFailureFlow with a RecommendationParseError.
// ---------------------------------------------------------------------------

describe("REQ-RC-01 E3: runReviewCycle handles parse_error from readCrossReviewRecommendation", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("checks for parse_error status and calls handleFailureFlow", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the runReviewCycle function body
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must check for parse_error status
    expect(fnBody).toContain("parse_error");

    // Must call handleFailureFlow when parse_error occurs
    expect(fnBody).toContain("handleFailureFlow");

    // Must use RecommendationParseError as the error type
    expect(fnBody).toContain("RecommendationParseError");
  });
});

// ---------------------------------------------------------------------------
// REQ-RC-01 E4: Cross-review refs in revision dispatch
//
// When dispatching a revision, the cross-review refs must be constructed
// using agentIdToSkillName() + crossReviewPath() + deriveDocumentType(),
// NOT using raw string concatenation with agent IDs and creation phase IDs.
// ---------------------------------------------------------------------------

describe("REQ-RC-01 E4: runReviewCycle builds cross-review refs using agentIdToSkillName + crossReviewPath", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("uses agentIdToSkillName to map reviewer IDs to skill names for cross-review paths", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the runReviewCycle function body
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must use agentIdToSkillName for mapping
    expect(fnBody).toContain("agentIdToSkillName");
  });

  it("uses crossReviewPath to construct file paths instead of raw string concatenation", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the runReviewCycle function body
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must use crossReviewPath function
    expect(fnBody).toContain("crossReviewPath");

    // Must NOT use the old raw concatenation pattern with CROSS-REVIEW- string template
    // The old pattern was: `${state.featurePath}CROSS-REVIEW-${id}-${creationPhase.id}.md`
    expect(fnBody).not.toMatch(/CROSS-REVIEW-\$\{/);
  });

  it("imports agentIdToSkillName and crossReviewPath from cross-review-parser", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Must import these pure functions
    expect(source).toContain("agentIdToSkillName");
    expect(source).toContain("crossReviewPath");

    // Must import from cross-review-parser
    expect(source).toMatch(/from\s+["'].*cross-review-parser/);
  });
});

// ---------------------------------------------------------------------------
// REQ-RC-01 E5: Set phaseStatus = "revision-bound-reached" before wait
//
// When the revision bound is exceeded, the workflow must set
// state.phaseStatus to "revision-bound-reached" before waiting for
// the resume-or-cancel signal. This enables Discord routing (FSPEC-DR-03).
// ---------------------------------------------------------------------------

describe("REQ-RC-01 E5: runReviewCycle sets phaseStatus to revision-bound-reached", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("sets phaseStatus to revision-bound-reached before waiting for resume-or-cancel", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");

    // Extract the runReviewCycle function body
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    // Must set phaseStatus to "revision-bound-reached"
    expect(fnBody).toContain('"revision-bound-reached"');

    // The phaseStatus assignment must come BEFORE the wf.condition wait
    const statusIdx = fnBody.indexOf('"revision-bound-reached"');
    const conditionIdx = fnBody.indexOf("wf.condition", statusIdx > 0 ? 0 : undefined);

    // Find the wf.condition call that follows the revision-bound-reached assignment
    const conditionAfterStatus = fnBody.indexOf("wf.condition", statusIdx);
    expect(conditionAfterStatus).toBeGreaterThan(statusIdx);
  });
});
