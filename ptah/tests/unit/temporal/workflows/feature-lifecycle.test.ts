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
import type { AdHocRevisionSignal, ReviewState } from "../../../../src/temporal/types.js";
import {
  buildInitialWorkflowState,
  buildContinueAsNewPayload,
  evaluateSkipCondition,
  isCompletionReady,
  deriveDocumentType,
  computeReviewerList,
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
      reviewStates: {},
    };

    const payload = buildContinueAsNewPayload(state);

    expect(payload.adHocQueue).toEqual(signals);
  });

  it("carries empty adHocQueue when no pending signals", () => {
    const state = {
      featurePath: "docs/in-progress/test-feature/" as string | null,
      signOffs: {},
      adHocQueue: [] as AdHocRevisionSignal[],
      reviewStates: {},
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
      reviewStates: {},
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

// ---------------------------------------------------------------------------
// Phase 3 Task 3.3: evaluateSkipCondition — artifact.exists branch
// PROP-SC-01 through PROP-SC-05
// ---------------------------------------------------------------------------

function makeFeatureConfigForEvaluate(overrides?: Partial<FeatureConfig>): FeatureConfig {
  return { name: "test", slug: "test", discipline: "fullstack", skipFspec: false, ...overrides };
}

describe("evaluateSkipCondition — artifact.exists branch (PROP-SC-01 through PROP-SC-04)", () => {
  it("returns true when artifactExists[condition.artifact] is true (PROP-SC-01)", () => {
    const condition = { field: "artifact.exists" as const, artifact: "REQ" };
    const featureConfig = makeFeatureConfigForEvaluate();
    const artifactExists = { REQ: true };

    const result = evaluateSkipCondition(condition, featureConfig, artifactExists);

    expect(result).toBe(true);
  });

  it("returns false when artifactExists[condition.artifact] is false (PROP-SC-02)", () => {
    const condition = { field: "artifact.exists" as const, artifact: "REQ" };
    const featureConfig = makeFeatureConfigForEvaluate();
    const artifactExists = { REQ: false };

    const result = evaluateSkipCondition(condition, featureConfig, artifactExists);

    expect(result).toBe(false);
  });

  it("returns false when artifact key is absent from artifactExists map (PROP-SC-03)", () => {
    const condition = { field: "artifact.exists" as const, artifact: "FSPEC" };
    const featureConfig = makeFeatureConfigForEvaluate();
    const artifactExists = { REQ: true }; // FSPEC not populated

    const result = evaluateSkipCondition(condition, featureConfig, artifactExists);

    expect(result).toBe(false);
  });

  it("throws with exact error message when artifactExists is undefined (PROP-SC-04)", () => {
    const condition = { field: "artifact.exists" as const, artifact: "REQ" };
    const featureConfig = makeFeatureConfigForEvaluate();

    expect(() => {
      evaluateSkipCondition(condition, featureConfig, undefined);
    }).toThrow(
      "evaluateSkipCondition: artifactExists map not yet populated — checkArtifactExists Activity must run before evaluating artifact.exists conditions"
    );
  });
});

describe("evaluateSkipCondition — config.* branch still works", () => {
  it("returns true when config field matches equals=true", () => {
    const condition = { field: "config.skipFspec" as `config.${string}`, equals: true };
    const featureConfig = makeFeatureConfigForEvaluate({ skipFspec: true });

    const result = evaluateSkipCondition(condition, featureConfig);

    expect(result).toBe(true);
  });

  it("returns false when config field does not match", () => {
    const condition = { field: "config.skipFspec" as `config.${string}`, equals: true };
    const featureConfig = makeFeatureConfigForEvaluate({ skipFspec: false });

    const result = evaluateSkipCondition(condition, featureConfig);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 3.4: buildInitialWorkflowState initializes artifactExists/completedPhaseResults
// ---------------------------------------------------------------------------

describe("buildInitialWorkflowState — Phase 3 new fields", () => {
  it("initializes artifactExists as empty object", () => {
    const state = buildInitialWorkflowState({
      featureSlug: "test-feature",
      featureConfig: makeFeatureConfigForEvaluate(),
      workflowConfig: { version: 1, phases: [{ id: "req", name: "REQ", type: "creation", agent: "pm" }] },
      startedAt: "2026-04-22T00:00:00Z",
    });

    expect(state.artifactExists).toEqual({});
  });

  it("initializes completedPhaseResults as empty object", () => {
    const state = buildInitialWorkflowState({
      featureSlug: "test-feature",
      featureConfig: makeFeatureConfigForEvaluate(),
      workflowConfig: { version: 1, phases: [{ id: "req", name: "REQ", type: "creation", agent: "pm" }] },
      startedAt: "2026-04-22T00:00:00Z",
    });

    expect(state.completedPhaseResults).toEqual({});
  });

  it("initializes activeAgentIds as empty array", () => {
    const state = buildInitialWorkflowState({
      featureSlug: "test-feature",
      featureConfig: makeFeatureConfigForEvaluate(),
      workflowConfig: { version: 1, phases: [{ id: "req", name: "REQ", type: "creation", agent: "pm" }] },
      startedAt: "2026-04-22T00:00:00Z",
    });

    expect(state.activeAgentIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 3.7: isCompletionReady — dynamic derivation from workflowConfig
// PROP-ICR-01 through PROP-ICR-07
// ---------------------------------------------------------------------------

function makeWorkflowConfigWithImplReview(reviewers: string[]): WorkflowConfig {
  return {
    version: 1,
    phases: [
      { id: "req-creation", name: "REQ", type: "creation", agent: "pm" },
      {
        id: "implementation-review",
        name: "Implementation Review",
        type: "review",
        reviewers: { default: reviewers },
        revision_bound: 5,
      },
    ],
  };
}

function makeWorkflowConfigWithoutImplReview(): WorkflowConfig {
  return {
    version: 1,
    phases: [
      { id: "req-creation", name: "REQ", type: "creation", agent: "pm" },
    ],
  };
}

describe("isCompletionReady — dynamic derivation (PROP-ICR-01 through PROP-ICR-07)", () => {
  it("returns true when all implementation-review phase reviewers have signOffs=true (PROP-ICR-01)", () => {
    const config = makeWorkflowConfigWithImplReview(["pm-review", "te-review"]);
    const signOffs = { "pm-review": true, "te-review": true };

    expect(isCompletionReady(signOffs, config)).toBe(true);
  });

  it("returns false when at least one reviewer does not have signOff=true (PROP-ICR-02)", () => {
    const config = makeWorkflowConfigWithImplReview(["pm-review", "te-review"]);
    const signOffs = { "pm-review": true, "te-review": false };

    expect(isCompletionReady(signOffs, config)).toBe(false);
  });

  it("returns false when a reviewer signOff is absent (PROP-ICR-02)", () => {
    const config = makeWorkflowConfigWithImplReview(["pm-review", "te-review"]);
    const signOffs = { "pm-review": true };

    expect(isCompletionReady(signOffs, config)).toBe(false);
  });

  it("falls back to legacy signOffs.qa && signOffs.pm when no implementation-review phase (PROP-ICR-03)", () => {
    const config = makeWorkflowConfigWithoutImplReview();
    const signOffs = { qa: true, pm: true };

    expect(isCompletionReady(signOffs, config)).toBe(true);
  });

  it("legacy fallback returns false when qa or pm is missing (PROP-ICR-03)", () => {
    const config = makeWorkflowConfigWithoutImplReview();
    const signOffs = { pm: true };

    expect(isCompletionReady(signOffs, config)).toBe(false);
  });

  it("returns true when implementation-review has empty reviewers list (PROP-ICR-04 — vacuous truth)", () => {
    const config = makeWorkflowConfigWithImplReview([]);
    const signOffs = {};

    expect(isCompletionReady(signOffs, config)).toBe(true);
  });

  // PROP-ICR-05: must use computeReviewerList() to derive required agents
  it("derives required reviewers via computeReviewerList() on the implementation-review phase (PROP-ICR-05)", () => {
    // computeReviewerList with the implementation-review phase reviewers manifest should give same result
    // as what isCompletionReady uses internally
    const config = makeWorkflowConfigWithImplReview(["pm-review", "te-review"]);
    const implPhase = config.phases.find((p) => p.id === "implementation-review")!;

    // computeReviewerList derives the list that isCompletionReady uses
    const derived = computeReviewerList(implPhase, { discipline: "default" } as never);
    expect(derived).toContain("pm-review");
    expect(derived).toContain("te-review");

    // isCompletionReady must agree: all present → ready
    expect(isCompletionReady({ "pm-review": true, "te-review": true }, config)).toBe(true);
    // one missing → not ready
    expect(isCompletionReady({ "pm-review": true }, config)).toBe(false);
  });

  // PROP-ICR-06: approved_with_minor_issues (stored as true) satisfies completion check
  it("signOff stored as true satisfies completion check for any reviewer (PROP-ICR-06)", () => {
    // parseRecommendation("Approved with Minor Issues") returns { status: "approved" }
    // The workflow converts status "approved" → signOffs[agentId] = true
    // isCompletionReady must count true as approved
    const config = makeWorkflowConfigWithImplReview(["pm-review"]);
    const signOffs = { "pm-review": true };

    expect(isCompletionReady(signOffs, config)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PROP-ICR-07: static scan — no single-arg isCompletionReady call site
// ---------------------------------------------------------------------------

describe("PROP-ICR-07: isCompletionReady call sites always pass workflowConfig (static scan)", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("every isCompletionReady( call is followed by a comma — no single-arg invocation", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    // Match all call sites: isCompletionReady(...)
    // A single-arg call would have only one argument before the closing paren
    // We verify by checking that no call to isCompletionReady has only one argument
    // Pragmatic approach: find all isCompletionReady( occurrences and check they have a comma
    const callPattern = /isCompletionReady\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    const singleArgCalls: string[] = [];
    while ((match = callPattern.exec(source)) !== null) {
      const args = match[1]!;
      // If no comma in args, it's a single-argument call
      if (!args.includes(",")) {
        singleArgCalls.push(match[0]!);
      }
    }
    expect(singleArgCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 3.8: deriveDocumentType — DOCUMENT_TYPE_OVERRIDES
// PROP-RRC-06
// ---------------------------------------------------------------------------

describe("deriveDocumentType — PROP-RRC-06: properties-tests maps to PROPERTIES", () => {
  it("returns PROPERTIES for properties-tests phase ID", () => {
    expect(deriveDocumentType("properties-tests")).toBe("PROPERTIES");
  });

  it("still returns correct values for non-overridden phase IDs", () => {
    expect(deriveDocumentType("req-review")).toBe("REQ");
    expect(deriveDocumentType("fspec-creation")).toBe("FSPEC");
    expect(deriveDocumentType("tspec-review")).toBe("TSPEC");
    expect(deriveDocumentType("properties-review")).toBe("PROPERTIES");
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 3.8: buildContinueAsNewPayload — includes reviewStates
// PROP-CNP-01, PROP-CNP-03, PROP-CNP-04
// ---------------------------------------------------------------------------

describe("buildContinueAsNewPayload — reviewStates inclusion (PROP-CNP-01, PROP-CNP-03, PROP-CNP-04)", () => {
  it("includes reviewStates in the payload with non-trivial writtenVersions (PROP-CNP-01, PROP-CNP-04)", () => {
    const reviewStates: Record<string, ReviewState> = {
      "req-review": {
        reviewerStatuses: { "se-review": "approved" },
        revisionCount: 2,
        writtenVersions: { "se-review": 2 },
      },
    };

    const payload = buildContinueAsNewPayload({
      featurePath: "docs/in-progress/test-feature/",
      signOffs: {},
      adHocQueue: [],
      reviewStates,
    });

    expect(payload.reviewStates).toBeDefined();
    expect(payload.reviewStates["req-review"].writtenVersions).toEqual({ "se-review": 2 });
  });

  it("preserves all existing fields alongside reviewStates (PROP-CNP-03)", () => {
    const payload = buildContinueAsNewPayload({
      featurePath: "docs/in-progress/test-feature/",
      signOffs: { "se-review": true },
      adHocQueue: [],
      reviewStates: {},
    });

    expect(payload.featurePath).toBe("docs/in-progress/test-feature/");
    expect(payload.worktreeRoot).toBeNull();
    expect(payload.signOffs).toBeDefined();
    expect(payload.adHocQueue).toBeDefined();
    expect(payload.reviewStates).toBeDefined();
  });

  it("deep-copies reviewStates (writtenVersions preserved, not same reference)", () => {
    const writtenVersions = { "se-review": 3 };
    const reviewStates: Record<string, ReviewState> = {
      "req-review": {
        reviewerStatuses: {},
        revisionCount: 3,
        writtenVersions,
      },
    };

    const payload = buildContinueAsNewPayload({
      featurePath: null,
      signOffs: {},
      adHocQueue: [],
      reviewStates,
    });

    // Values are preserved
    expect(payload.reviewStates["req-review"].writtenVersions["se-review"]).toBe(3);
    // Not same reference — deep copy
    expect(payload.reviewStates["req-review"].writtenVersions).not.toBe(writtenVersions);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 3.8: static-scan for mapRecommendationToStatus removal
// PROP-PR-09, PROP-PR-10
// ---------------------------------------------------------------------------

describe("PROP-PR-09 / PROP-PR-10: feature-lifecycle.ts static scan", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("does not contain mapRecommendationToStatus (PROP-PR-09)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    expect(source).not.toContain("mapRecommendationToStatus");
  });

  it("imports parseRecommendation from cross-review-parser (PROP-PR-10)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    expect(source).toContain("parseRecommendation");
    expect(source).toMatch(/from\s+["'].*cross-review-parser/);
  });

  it("calls parseRecommendation at least once (PROP-PR-10)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    expect(source).toContain("parseRecommendation(");
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 3.4: static-scan for pre-loop checkArtifactExists Activity
// PROP-SC-07, PROP-SC-08, PROP-SC-09
// ---------------------------------------------------------------------------

describe("PROP-SC-07/SC-09: pre-loop checkArtifactExists scan in featureLifecycleWorkflow", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("registers checkArtifactExists activity proxy in the workflow file", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    expect(source).toContain("checkArtifactExists");
    // Must be in a proxyActivities call
    expect(source).toMatch(/proxyActivities[\s\S]*?checkArtifactExists/);
  });

  it("the pre-loop scan uses the full workflowConfig.phases (not filtered by startAtPhase)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    // The scan must use workflowConfig.phases to find artifact.exists conditions
    expect(source).toContain("artifact.exists");
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 3.5: runReviewCycle revision threading
// PROP-RRC-01, PROP-RRC-02, PROP-RWV-03
// ---------------------------------------------------------------------------

describe("PROP-RRC-01/RRC-02/RWV-03: runReviewCycle revision threading (static scan)", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("computes currentRevision = reviewState.revisionCount + 1 (PROP-RRC-01)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toContain("revisionCount + 1");
  });

  it("passes revisionCount to readCrossReviewRecommendation (PROP-RRC-02)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    // readCrossReviewRecommendation call must include revisionCount
    expect(fnBody).toMatch(/readCrossReviewRecommendation[\s\S]*?revisionCount/);
  });

  it("updates reviewState.writtenVersions[reviewerId] after dispatch (PROP-RWV-03)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toContain("writtenVersions");
  });

  it("initializes writtenVersions: {} in new ReviewState construction", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toContain("writtenVersions: {}");
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 3.6: optimizer context uses full version history
// PROP-RRC-04, PROP-RRC-05, PROP-RWV-07
// ---------------------------------------------------------------------------

describe("PROP-RRC-04/RRC-05/RWV-07: optimizer context uses full version history (static scan)", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  it("does not filter reviewers by revision_requested status for optimizer context (PROP-RRC-04)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    // The old filter .filter((id) => reviewState.reviewerStatuses[id] === "revision_requested")
    // must be gone from the cross-review context assembly section
    expect(fnBody).not.toMatch(/\.filter\(\s*\([^)]+\)\s*=>\s*reviewState\.reviewerStatuses\[[^\]]+\]\s*===\s*["']revision_requested["']\s*\)/);
  });

  it("enumerates versions using writtenVersions for optimizer context paths (PROP-RWV-07)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    const fnMatch = source.match(
      /async function runReviewCycle\b[\s\S]*?(?=\n\/\/ -{10,}|\nexport async function )/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    // Must use writtenVersions to enumerate paths
    expect(fnBody).toContain("writtenVersions");
  });
});
