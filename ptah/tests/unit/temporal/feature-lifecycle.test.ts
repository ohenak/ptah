/**
 * Unit tests for the featureLifecycleWorkflow pure helper functions.
 *
 * The Temporal Workflow itself (featureLifecycleWorkflow) is a durable workflow
 * that must be deterministic — it cannot be unit-tested without a
 * TestWorkflowEnvironment (that belongs in Phase G integration tests).
 *
 * Here we test the pure helper functions extracted from the workflow module:
 *   - resolveNextPhase          (D1)
 *   - evaluateSkipCondition     (D1)
 *   - buildInitialWorkflowState (D2)
 *   - resolveContextDocuments   (D14)
 *   - computeReviewerList       (D9)
 *   - mapRecommendationToStatus (D9)
 *   - buildInvokeSkillInput     (D3)
 *   - buildRevisionInput        (D10)
 *
 * The workflow Signal/Query handlers, fork/join orchestration, question flow,
 * review loop, and failure flow are tested via the TestWorkflowEnvironment
 * integration tests in Phase G.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { PhaseDefinition, WorkflowConfig } from "../../../src/config/workflow-config.js";
import type { FeatureConfig } from "../../../src/orchestrator/pdlc/phases.js";
import type { SkillActivityInput, PhaseStatus, ReadCrossReviewInput, CrossReviewResult } from "../../../src/temporal/types.js";
import {
  resolveNextPhase,
  evaluateSkipCondition,
  buildInitialWorkflowState,
  resolveContextDocuments,
  extractCompletedPrefix,
  computeReviewerList,
  mapRecommendationToStatus,
  buildInvokeSkillInput,
  buildRevisionInput,
  recordSignOff,
  isCompletionReady,
  needsBacklogPromotion,
  buildContinueAsNewPayload,
  deriveDocumentType,
} from "../../../src/temporal/workflows/feature-lifecycle.js";

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

function makeFeatureConfig(overrides?: Partial<FeatureConfig>): FeatureConfig {
  return {
    discipline: "backend-only",
    skipFspec: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// D1: resolveNextPhase — explicit transitions, array ordering, skip_if
// ---------------------------------------------------------------------------

describe("resolveNextPhase", () => {
  it("returns the explicit transition when the current phase has a transition field", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a", transition: "phase-c" }),
      makePhase({ id: "phase-b" }),
      makePhase({ id: "phase-c" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig();

    const next = resolveNextPhase("phase-a", config, fc);

    expect(next).toBe("phase-c");
  });

  it("returns the next phase in array order when no explicit transition is set", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a" }),
      makePhase({ id: "phase-b" }),
      makePhase({ id: "phase-c" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig();

    const next = resolveNextPhase("phase-a", config, fc);

    expect(next).toBe("phase-b");
  });

  it("returns null when the current phase is the last phase", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a" }),
      makePhase({ id: "phase-b" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig();

    const next = resolveNextPhase("phase-b", config, fc);

    expect(next).toBeNull();
  });

  it("skips the next phase when its skip_if condition is satisfied", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a" }),
      makePhase({
        id: "phase-b",
        skip_if: { field: "skipFspec", equals: true },
      }),
      makePhase({ id: "phase-c" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig({ skipFspec: true });

    const next = resolveNextPhase("phase-a", config, fc);

    expect(next).toBe("phase-c");
  });

  it("does NOT skip the next phase when skip_if condition is not satisfied", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a" }),
      makePhase({
        id: "phase-b",
        skip_if: { field: "skipFspec", equals: true },
      }),
      makePhase({ id: "phase-c" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig({ skipFspec: false });

    const next = resolveNextPhase("phase-a", config, fc);

    expect(next).toBe("phase-b");
  });

  it("skips multiple consecutive phases when each satisfies skip_if", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a" }),
      makePhase({ id: "phase-b", skip_if: { field: "skipFspec", equals: true } }),
      makePhase({ id: "phase-c", skip_if: { field: "skipFspec", equals: true } }),
      makePhase({ id: "phase-d" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig({ skipFspec: true });

    const next = resolveNextPhase("phase-a", config, fc);

    expect(next).toBe("phase-d");
  });

  it("returns null when all remaining phases are skipped", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a" }),
      makePhase({ id: "phase-b", skip_if: { field: "skipFspec", equals: true } }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig({ skipFspec: true });

    const next = resolveNextPhase("phase-a", config, fc);

    expect(next).toBeNull();
  });

  it("throws when currentPhaseId is not found in the phases array", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "phase-a" })];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig();

    expect(() => resolveNextPhase("nonexistent-phase", config, fc)).toThrow(
      "Phase 'nonexistent-phase' not found in workflow config"
    );
  });

  // REQ-SC-01 / REQ-NF-02: Tests using real YAML convention with "config." prefix
  it("skips phases when skip_if uses YAML convention 'config.skipFspec' prefix", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a" }),
      makePhase({
        id: "phase-b",
        skip_if: { field: "config.skipFspec", equals: true },
      }),
      makePhase({
        id: "phase-c",
        skip_if: { field: "config.skipFspec", equals: true },
      }),
      makePhase({
        id: "phase-d",
        skip_if: { field: "config.skipFspec", equals: true },
      }),
      makePhase({ id: "phase-e" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig({ skipFspec: true });

    const next = resolveNextPhase("phase-a", config, fc);

    // All three FSPEC-like phases should be skipped
    expect(next).toBe("phase-e");
  });

  it("does NOT skip phases when skip_if uses 'config.' prefix but condition is false", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a" }),
      makePhase({
        id: "phase-b",
        skip_if: { field: "config.skipFspec", equals: true },
      }),
      makePhase({ id: "phase-c" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig({ skipFspec: false });

    const next = resolveNextPhase("phase-a", config, fc);

    expect(next).toBe("phase-b");
  });

  it("explicit transition takes precedence over skip_if on the current phase", () => {
    // When the current phase has an explicit transition, it bypasses array ordering
    // and skip_if is evaluated on the target of the explicit transition
    const phases: PhaseDefinition[] = [
      makePhase({ id: "phase-a", transition: "phase-c" }),
      makePhase({ id: "phase-b" }),
      makePhase({ id: "phase-c" }),
    ];
    const config = makeConfig(phases);
    const fc = makeFeatureConfig();

    const next = resolveNextPhase("phase-a", config, fc);

    // Explicit transition goes directly to phase-c (does not visit phase-b)
    expect(next).toBe("phase-c");
  });
});

// ---------------------------------------------------------------------------
// D1: evaluateSkipCondition
// ---------------------------------------------------------------------------

describe("evaluateSkipCondition", () => {
  it("returns true when field equals the configured value (skipFspec: true)", () => {
    const fc = makeFeatureConfig({ skipFspec: true });
    const result = evaluateSkipCondition({ field: "skipFspec", equals: true }, fc);
    expect(result).toBe(true);
  });

  it("returns false when field does not equal the configured value", () => {
    const fc = makeFeatureConfig({ skipFspec: false });
    const result = evaluateSkipCondition({ field: "skipFspec", equals: true }, fc);
    expect(result).toBe(false);
  });

  it("returns false for unknown fields (safe default — do not skip)", () => {
    const fc = makeFeatureConfig();
    const result = evaluateSkipCondition({ field: "unknownField", equals: true }, fc);
    expect(result).toBe(false);
  });

  it("handles equals: false condition correctly", () => {
    const fc = makeFeatureConfig({ skipFspec: false });
    // skip_if field === false (i.e., skip when skipFspec is false)
    const result = evaluateSkipCondition({ field: "skipFspec", equals: false }, fc);
    expect(result).toBe(true);
  });

  // REQ-SC-01 / REQ-NF-02: Tests using real YAML convention with "config." prefix
  it("strips 'config.' prefix and returns true when field matches (YAML convention)", () => {
    const fc = makeFeatureConfig({ skipFspec: true });
    const result = evaluateSkipCondition({ field: "config.skipFspec", equals: true }, fc);
    expect(result).toBe(true);
  });

  it("strips 'config.' prefix and returns false when field does not match (YAML convention)", () => {
    const fc = makeFeatureConfig({ skipFspec: false });
    const result = evaluateSkipCondition({ field: "config.skipFspec", equals: true }, fc);
    expect(result).toBe(false);
  });

  it("strips 'config.' prefix with equals: false condition (YAML convention)", () => {
    const fc = makeFeatureConfig({ skipFspec: false });
    const result = evaluateSkipCondition({ field: "config.skipFspec", equals: false }, fc);
    expect(result).toBe(true);
  });

  it("returns false for unknown field with 'config.' prefix", () => {
    const fc = makeFeatureConfig();
    const result = evaluateSkipCondition({ field: "config.unknownField", equals: true }, fc);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D2: buildInitialWorkflowState
// ---------------------------------------------------------------------------

describe("buildInitialWorkflowState", () => {
  it("builds initial state with featureSlug, featureConfig, workflowConfig snapshotted", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation", agent: "pm" })];
    const workflowConfig = makeConfig(phases);
    const featureConfig = makeFeatureConfig();
    const featureSlug = "my-feature";

    const state = buildInitialWorkflowState({
      featureSlug,
      featureConfig,
      workflowConfig,
      startedAt: "2026-04-02T00:00:00Z",
    });

    expect(state.featureSlug).toBe("my-feature");
    expect(state.featureConfig).toEqual(featureConfig);
    expect(state.workflowConfig).toEqual(workflowConfig);
    expect(state.currentPhaseId).toBe("req-creation");
    expect(state.completedPhaseIds).toEqual([]);
    expect(state.activeAgentIds).toEqual([]);
    expect(state.phaseStatus).toBe("running");
    expect(state.reviewStates).toEqual({});
    expect(state.forkJoinState).toBeNull();
    expect(state.pendingQuestion).toBeNull();
    expect(state.failureInfo).toBeNull();
    expect(state.startedAt).toBe("2026-04-02T00:00:00Z");
    expect(state.updatedAt).toBe("2026-04-02T00:00:00Z");
  });

  it("starts at the specified phase when startAtPhase is provided (migration support)", () => {
    const phases: PhaseDefinition[] = [
      makePhase({ id: "req-creation" }),
      makePhase({ id: "tspec-creation" }),
    ];
    const workflowConfig = makeConfig(phases);
    const featureConfig = makeFeatureConfig();

    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig,
      workflowConfig,
      startedAt: "2026-04-02T00:00:00Z",
      startAtPhase: "tspec-creation",
    });

    expect(state.currentPhaseId).toBe("tspec-creation");
  });

  it("initializes reviewStates from initialReviewState when provided (migration support)", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-review", type: "review" })];
    const workflowConfig = makeConfig(phases);
    const featureConfig = makeFeatureConfig();
    const initialReviewState = {
      "req-review": {
        reviewerStatuses: { eng: "approved" as const, qa: "pending" as const },
        revisionCount: 1,
      },
    };

    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig,
      workflowConfig,
      startedAt: "2026-04-02T00:00:00Z",
      initialReviewState,
    });

    expect(state.reviewStates).toEqual(initialReviewState);
  });

  it("throws when startAtPhase does not match any phase in the config", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const workflowConfig = makeConfig(phases);

    expect(() =>
      buildInitialWorkflowState({
        featureSlug: "my-feature",
        featureConfig: makeFeatureConfig(),
        workflowConfig,
        startedAt: "2026-04-02T00:00:00Z",
        startAtPhase: "nonexistent-phase",
      })
    ).toThrow("startAtPhase 'nonexistent-phase' not found in workflow config");
  });

  // A1: New fields for feature lifecycle folders
  it("initializes featurePath as null", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeConfig(phases),
      startedAt: "2026-04-02T00:00:00Z",
    });
    expect(state.featurePath).toBeNull();
  });

  it("initializes worktreeRoot as null", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeConfig(phases),
      startedAt: "2026-04-02T00:00:00Z",
    });
    expect(state.worktreeRoot).toBeNull();
  });

  it("initializes signOffs as empty object", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeConfig(phases),
      startedAt: "2026-04-02T00:00:00Z",
    });
    expect(state.signOffs).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// D3: buildInvokeSkillInput
// ---------------------------------------------------------------------------

describe("buildInvokeSkillInput", () => {
  it("builds SkillActivityInput for a single-agent creation phase", () => {
    const phase = makePhase({
      id: "req-creation",
      type: "creation",
      agent: "pm",
      context_documents: ["{feature}/overview"],
    });
    const featureConfig = makeFeatureConfig();

    const input = buildInvokeSkillInput({
      phase,
      agentId: "pm",
      featureSlug: "my-feature",
      featureConfig,
      forkJoin: false,
      isRevision: false,
    });

    expect(input).toMatchObject<Partial<SkillActivityInput>>({
      agentId: "pm",
      featureSlug: "my-feature",
      phaseId: "req-creation",
      taskType: "Create",
      featureConfig,
      contextDocumentRefs: ["{feature}/overview"],
      forkJoin: false,
      isRevision: false,
    });
    expect(input.priorQuestion).toBeUndefined();
    expect(input.priorAnswer).toBeUndefined();
  });

  it("sets taskType to 'Implement' for implementation phases", () => {
    const phase = makePhase({ id: "impl", type: "implementation", agent: "eng" });
    const input = buildInvokeSkillInput({
      phase,
      agentId: "eng",
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      forkJoin: false,
      isRevision: false,
    });
    expect(input.taskType).toBe("Implement");
  });

  it("sets taskType to 'Review' for review phases", () => {
    const phase = makePhase({
      id: "req-review",
      type: "review",
      reviewers: { default: ["eng"] },
    });
    const input = buildInvokeSkillInput({
      phase,
      agentId: "eng",
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      forkJoin: false,
      isRevision: false,
    });
    expect(input.taskType).toBe("Review");
  });

  it("sets taskType to 'Revise' and isRevision:true when isRevision flag is set", () => {
    const phase = makePhase({ id: "req-creation", type: "creation", agent: "pm" });
    const input = buildInvokeSkillInput({
      phase,
      agentId: "pm",
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      forkJoin: false,
      isRevision: true,
    });
    expect(input.taskType).toBe("Revise");
    expect(input.isRevision).toBe(true);
  });

  it("sets forkJoin:true for fork/join dispatch", () => {
    const phase = makePhase({
      id: "impl",
      type: "implementation",
      agents: ["eng", "fe"],
    });
    const input = buildInvokeSkillInput({
      phase,
      agentId: "eng",
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      forkJoin: true,
      isRevision: false,
    });
    expect(input.forkJoin).toBe(true);
  });

  it("includes priorQuestion and priorAnswer when answering a user question", () => {
    const phase = makePhase({ id: "req-creation", type: "creation", agent: "pm" });
    const input = buildInvokeSkillInput({
      phase,
      agentId: "pm",
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      forkJoin: false,
      isRevision: false,
      priorQuestion: "Should we use OAuth?",
      priorAnswer: "Yes, use Google OAuth.",
    });
    expect(input.priorQuestion).toBe("Should we use OAuth?");
    expect(input.priorAnswer).toBe("Yes, use Google OAuth.");
  });

  it("uses empty array for contextDocumentRefs when phase has no context_documents", () => {
    const phase = makePhase({ id: "phase-a", type: "creation", agent: "pm" });
    // phase has no context_documents field
    const input = buildInvokeSkillInput({
      phase,
      agentId: "pm",
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      forkJoin: false,
      isRevision: false,
    });
    expect(input.contextDocumentRefs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D9: computeReviewerList
// ---------------------------------------------------------------------------

describe("computeReviewerList", () => {
  it("returns the backend-only reviewer list when feature discipline is backend-only", () => {
    const phase = makePhase({
      id: "req-review",
      type: "review",
      reviewers: {
        "backend-only": ["eng", "qa"],
        "frontend-only": ["fe", "qa"],
        fullstack: ["eng", "fe", "qa"],
        default: ["qa"],
      },
    });
    const fc = makeFeatureConfig({ discipline: "backend-only" });

    const reviewers = computeReviewerList(phase, fc);

    expect(reviewers).toEqual(["eng", "qa"]);
  });

  it("returns the frontend-only reviewer list when feature discipline is frontend-only", () => {
    const phase = makePhase({
      id: "req-review",
      type: "review",
      reviewers: {
        "backend-only": ["eng"],
        "frontend-only": ["fe", "qa"],
        fullstack: ["eng", "fe", "qa"],
      },
    });
    const fc = makeFeatureConfig({ discipline: "frontend-only" });

    const reviewers = computeReviewerList(phase, fc);

    expect(reviewers).toEqual(["fe", "qa"]);
  });

  it("returns the fullstack reviewer list when feature discipline is fullstack", () => {
    const phase = makePhase({
      id: "req-review",
      type: "review",
      reviewers: {
        "backend-only": ["eng"],
        "frontend-only": ["fe"],
        fullstack: ["eng", "fe", "qa"],
      },
    });
    const fc = makeFeatureConfig({ discipline: "fullstack" });

    const reviewers = computeReviewerList(phase, fc);

    expect(reviewers).toEqual(["eng", "fe", "qa"]);
  });

  it("falls back to the default reviewer list when no discipline-specific manifest exists", () => {
    const phase = makePhase({
      id: "req-review",
      type: "review",
      reviewers: {
        default: ["eng", "pm"],
      },
    });
    const fc = makeFeatureConfig({ discipline: "backend-only" });

    const reviewers = computeReviewerList(phase, fc);

    expect(reviewers).toEqual(["eng", "pm"]);
  });

  it("returns empty array when phase has no reviewers manifest", () => {
    const phase = makePhase({ id: "req-review", type: "review" });
    const fc = makeFeatureConfig();

    const reviewers = computeReviewerList(phase, fc);

    expect(reviewers).toEqual([]);
  });

  it("returns empty array when discipline has no manifest and no default exists", () => {
    const phase = makePhase({
      id: "req-review",
      type: "review",
      reviewers: {
        fullstack: ["eng", "fe"],
      },
    });
    const fc = makeFeatureConfig({ discipline: "backend-only" });

    const reviewers = computeReviewerList(phase, fc);

    expect(reviewers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D9: mapRecommendationToStatus — BR-17
// ---------------------------------------------------------------------------

describe("mapRecommendationToStatus", () => {
  it("maps 'Approved' to 'approved'", () => {
    expect(mapRecommendationToStatus("Approved")).toBe("approved");
  });

  it("maps 'Approved with minor changes' to 'approved' (BR-17)", () => {
    expect(mapRecommendationToStatus("Approved with minor changes")).toBe("approved");
  });

  it("maps 'Needs revision' to 'revision_requested'", () => {
    expect(mapRecommendationToStatus("Needs revision")).toBe("revision_requested");
  });

  it("maps 'LGTM' to 'approved'", () => {
    expect(mapRecommendationToStatus("LGTM")).toBe("approved");
  });

  it("maps 'lgtm' (lowercase) to 'approved'", () => {
    expect(mapRecommendationToStatus("lgtm")).toBe("approved");
  });

  it("is case-insensitive — 'approved' (lowercase) maps to 'approved'", () => {
    expect(mapRecommendationToStatus("approved")).toBe("approved");
  });

  it("returns null for unrecognized recommendation strings", () => {
    expect(mapRecommendationToStatus("Conditional Approval")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D10: buildRevisionInput
// ---------------------------------------------------------------------------

describe("buildRevisionInput", () => {
  it("builds SkillActivityInput for a revision dispatch targeting the creation phase", () => {
    const creationPhase = makePhase({
      id: "req-creation",
      type: "creation",
      agent: "pm",
      context_documents: ["{feature}/overview", "{feature}/REQ"],
    });
    const featureConfig = makeFeatureConfig();

    const input = buildRevisionInput({
      creationPhase,
      agentId: "pm",
      featureSlug: "my-feature",
      featureConfig,
      crossReviewRefs: ["docs/in-progress/my-feature/CROSS-REVIEW-eng-REQ.md"],
    });

    expect(input.taskType).toBe("Revise");
    expect(input.isRevision).toBe(true);
    expect(input.phaseId).toBe("req-creation");
    expect(input.agentId).toBe("pm");
    expect(input.featureSlug).toBe("my-feature");
    expect(input.forkJoin).toBe(false);
    // cross-review refs are appended to context documents
    expect(input.contextDocumentRefs).toContain("{feature}/overview");
    expect(input.contextDocumentRefs).toContain("{feature}/REQ");
    expect(input.contextDocumentRefs).toContain("docs/in-progress/my-feature/CROSS-REVIEW-eng-REQ.md");
  });

  it("includes only cross-review refs when creation phase has no context_documents", () => {
    const creationPhase = makePhase({ id: "req-creation", type: "creation", agent: "pm" });

    const input = buildRevisionInput({
      creationPhase,
      agentId: "pm",
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      crossReviewRefs: ["docs/in-progress/my-feature/CROSS-REVIEW-eng-REQ.md"],
    });

    expect(input.contextDocumentRefs).toEqual(["docs/in-progress/my-feature/CROSS-REVIEW-eng-REQ.md"]);
  });
});

// ---------------------------------------------------------------------------
// D14: resolveContextDocuments
// ---------------------------------------------------------------------------

describe("resolveContextDocuments", () => {
  // E1: backlog/in-progress features — uses featurePath directly (no NNN prefix)
  it("resolves {feature}/REQ to featurePath + REQ-slug for in-progress feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/REQ"],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual(["docs/in-progress/my-feature/REQ-my-feature.md"]);
  });

  it("resolves {feature}/FSPEC to featurePath + FSPEC-slug for backlog feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/FSPEC"],
      { featureSlug: "my-feature", featurePath: "docs/backlog/my-feature/" }
    );
    expect(paths).toEqual(["docs/backlog/my-feature/FSPEC-my-feature.md"]);
  });

  it("resolves {feature}/TSPEC for in-progress feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/TSPEC"],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual(["docs/in-progress/my-feature/TSPEC-my-feature.md"]);
  });

  it("resolves {feature}/PLAN for in-progress feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/PLAN"],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual(["docs/in-progress/my-feature/PLAN-my-feature.md"]);
  });

  it("resolves {feature}/PROPERTIES for in-progress feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/PROPERTIES"],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual(["docs/in-progress/my-feature/PROPERTIES-my-feature.md"]);
  });

  it("resolves {feature}/overview to featurePath + overview.md for in-progress feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/overview"],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual(["docs/in-progress/my-feature/overview.md"]);
  });

  it("passes through non-{feature} paths unchanged", () => {
    const paths = resolveContextDocuments(
      ["docs/in-progress/my-feature/CROSS-REVIEW-eng-REQ.md"],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual(["docs/in-progress/my-feature/CROSS-REVIEW-eng-REQ.md"]);
  });

  it("resolves multiple refs in order for in-progress feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/REQ", "{feature}/FSPEC", "docs/in-progress/my-feature/CROSS-REVIEW-eng-REQ.md"],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual([
      "docs/in-progress/my-feature/REQ-my-feature.md",
      "docs/in-progress/my-feature/FSPEC-my-feature.md",
      "docs/in-progress/my-feature/CROSS-REVIEW-eng-REQ.md",
    ]);
  });

  it("returns an empty array for an empty input", () => {
    const paths = resolveContextDocuments(
      [],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual([]);
  });

  // E2: completed features — extracts NNN and applies prefix to all doc types
  it("resolves {feature}/REQ with NNN prefix for completed feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/REQ"],
      { featureSlug: "my-feature", featurePath: "docs/completed/015-my-feature/" }
    );
    expect(paths).toEqual(["docs/completed/015-my-feature/015-REQ-my-feature.md"]);
  });

  it("resolves {feature}/overview with NNN prefix for completed feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/overview"],
      { featureSlug: "my-feature", featurePath: "docs/completed/015-my-feature/" }
    );
    expect(paths).toEqual(["docs/completed/015-my-feature/015-overview.md"]);
  });

  it("resolves {feature}/FSPEC with NNN prefix for completed feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/FSPEC"],
      { featureSlug: "my-feature", featurePath: "docs/completed/015-my-feature/" }
    );
    expect(paths).toEqual(["docs/completed/015-my-feature/015-FSPEC-my-feature.md"]);
  });

  it("resolves {feature}/TSPEC with NNN prefix for completed feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/TSPEC"],
      { featureSlug: "my-feature", featurePath: "docs/completed/015-my-feature/" }
    );
    expect(paths).toEqual(["docs/completed/015-my-feature/015-TSPEC-my-feature.md"]);
  });

  it("resolves {feature}/PLAN with NNN prefix for completed feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/PLAN"],
      { featureSlug: "my-feature", featurePath: "docs/completed/015-my-feature/" }
    );
    expect(paths).toEqual(["docs/completed/015-my-feature/015-PLAN-my-feature.md"]);
  });

  it("resolves {feature}/PROPERTIES with NNN prefix for completed feature", () => {
    const paths = resolveContextDocuments(
      ["{feature}/PROPERTIES"],
      { featureSlug: "my-feature", featurePath: "docs/completed/015-my-feature/" }
    );
    expect(paths).toEqual(["docs/completed/015-my-feature/015-PROPERTIES-my-feature.md"]);
  });

  it("resolves multiple refs for completed feature with NNN prefix", () => {
    const paths = resolveContextDocuments(
      ["{feature}/overview", "{feature}/REQ", "{feature}/FSPEC"],
      { featureSlug: "my-feature", featurePath: "docs/completed/015-my-feature/" }
    );
    expect(paths).toEqual([
      "docs/completed/015-my-feature/015-overview.md",
      "docs/completed/015-my-feature/015-REQ-my-feature.md",
      "docs/completed/015-my-feature/015-FSPEC-my-feature.md",
    ]);
  });

  it("passes through unknown {feature}/X references unchanged", () => {
    const paths = resolveContextDocuments(
      ["{feature}/UNKNOWN"],
      { featureSlug: "my-feature", featurePath: "docs/in-progress/my-feature/" }
    );
    expect(paths).toEqual(["{feature}/UNKNOWN"]);
  });
});

// ---------------------------------------------------------------------------
// E2: extractCompletedPrefix
// ---------------------------------------------------------------------------

describe("extractCompletedPrefix", () => {
  it("extracts NNN from completed feature path", () => {
    expect(extractCompletedPrefix("docs/completed/015-my-feature/")).toBe("015");
  });

  it("returns null for in-progress feature path", () => {
    expect(extractCompletedPrefix("docs/in-progress/my-feature/")).toBeNull();
  });

  it("returns null for backlog feature path", () => {
    expect(extractCompletedPrefix("docs/backlog/my-feature/")).toBeNull();
  });

  it("extracts NNN from completed path with different numbers", () => {
    expect(extractCompletedPrefix("docs/completed/001-first-feature/")).toBe("001");
    expect(extractCompletedPrefix("docs/completed/999-last-feature/")).toBe("999");
  });
});

// ---------------------------------------------------------------------------
// E5: buildInitialWorkflowState — CAN payload fields
// ---------------------------------------------------------------------------

describe("buildInitialWorkflowState — CAN payload support", () => {
  it("uses featurePath from CAN payload when provided", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeConfig(phases),
      startedAt: "2026-04-02T00:00:00Z",
      featurePath: "docs/in-progress/my-feature/",
    });
    expect(state.featurePath).toBe("docs/in-progress/my-feature/");
  });

  it("uses signOffs from CAN payload when provided", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeConfig(phases),
      startedAt: "2026-04-02T00:00:00Z",
      signOffs: { qa: "2026-04-01T10:00:00Z" },
    });
    expect(state.signOffs).toEqual({ qa: "2026-04-01T10:00:00Z" });
  });

  it("uses null worktreeRoot from CAN payload", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeConfig(phases),
      startedAt: "2026-04-02T00:00:00Z",
      worktreeRoot: null,
    });
    expect(state.worktreeRoot).toBeNull();
  });

  it("defaults featurePath to null when CAN payload omits it", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeConfig(phases),
      startedAt: "2026-04-02T00:00:00Z",
    });
    expect(state.featurePath).toBeNull();
  });

  it("defaults signOffs to empty object when CAN payload omits it", () => {
    const phases: PhaseDefinition[] = [makePhase({ id: "req-creation" })];
    const state = buildInitialWorkflowState({
      featureSlug: "my-feature",
      featureConfig: makeFeatureConfig(),
      workflowConfig: makeConfig(phases),
      startedAt: "2026-04-02T00:00:00Z",
    });
    expect(state.signOffs).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// E6: recordSignOff
// ---------------------------------------------------------------------------

describe("recordSignOff", () => {
  it("records agent ID and timestamp in signOffs", () => {
    const signOffs = {};
    const updated = recordSignOff(signOffs, "qa", "2026-04-02T10:00:00Z");
    expect(updated).toEqual({ qa: "2026-04-02T10:00:00Z" });
  });

  it("adds to existing signOffs without mutating the original", () => {
    const signOffs = { qa: "2026-04-02T10:00:00Z" };
    const updated = recordSignOff(signOffs, "pm", "2026-04-02T11:00:00Z");
    expect(updated).toEqual({
      qa: "2026-04-02T10:00:00Z",
      pm: "2026-04-02T11:00:00Z",
    });
    // Original is not mutated
    expect(signOffs).toEqual({ qa: "2026-04-02T10:00:00Z" });
  });

  it("overwrites existing sign-off for the same agent", () => {
    const signOffs = { qa: "2026-04-02T10:00:00Z" };
    const updated = recordSignOff(signOffs, "qa", "2026-04-02T12:00:00Z");
    expect(updated).toEqual({ qa: "2026-04-02T12:00:00Z" });
  });
});

// ---------------------------------------------------------------------------
// E7: isCompletionReady
// ---------------------------------------------------------------------------

describe("isCompletionReady", () => {
  it("returns true when both qa and pm have signed off", () => {
    expect(isCompletionReady({
      qa: "2026-04-02T10:00:00Z",
      pm: "2026-04-02T11:00:00Z",
    })).toBe(true);
  });

  it("returns false when only qa has signed off", () => {
    expect(isCompletionReady({ qa: "2026-04-02T10:00:00Z" })).toBe(false);
  });

  it("returns false when only pm has signed off", () => {
    expect(isCompletionReady({ pm: "2026-04-02T11:00:00Z" })).toBe(false);
  });

  it("returns false when signOffs is empty", () => {
    expect(isCompletionReady({})).toBe(false);
  });

  it("returns true even when extra agents have signed off", () => {
    expect(isCompletionReady({
      qa: "2026-04-02T10:00:00Z",
      pm: "2026-04-02T11:00:00Z",
      eng: "2026-04-02T12:00:00Z",
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E8: needsBacklogPromotion
// ---------------------------------------------------------------------------

describe("needsBacklogPromotion", () => {
  it("returns true when lifecycle is 'backlog'", () => {
    expect(needsBacklogPromotion("backlog")).toBe(true);
  });

  it("returns false when lifecycle is 'in-progress'", () => {
    expect(needsBacklogPromotion("in-progress")).toBe(false);
  });

  it("returns false when lifecycle is 'completed'", () => {
    expect(needsBacklogPromotion("completed")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E9: buildContinueAsNewPayload
// ---------------------------------------------------------------------------

describe("buildContinueAsNewPayload", () => {
  it("carries featurePath and signOffs, nulls worktreeRoot", () => {
    const state = {
      featurePath: "docs/in-progress/my-feature/" as string | null,
      signOffs: { qa: "2026-04-02T10:00:00Z" },
      adHocQueue: [] as import("../../../src/temporal/types.js").AdHocRevisionSignal[],
    };
    const payload = buildContinueAsNewPayload(state);
    expect(payload).toEqual({
      featurePath: "docs/in-progress/my-feature/",
      worktreeRoot: null,
      signOffs: { qa: "2026-04-02T10:00:00Z" },
      adHocQueue: [],
    });
  });

  it("preserves null featurePath", () => {
    const state = {
      featurePath: null,
      signOffs: {},
      adHocQueue: [] as import("../../../src/temporal/types.js").AdHocRevisionSignal[],
    };
    const payload = buildContinueAsNewPayload(state);
    expect(payload.featurePath).toBeNull();
    expect(payload.worktreeRoot).toBeNull();
    expect(payload.signOffs).toEqual({});
  });

  it("creates a shallow copy of signOffs (not the same reference)", () => {
    const signOffs = { qa: "2026-04-02T10:00:00Z", pm: "2026-04-02T11:00:00Z" };
    const state = {
      featurePath: "docs/in-progress/my-feature/" as string | null,
      signOffs,
      adHocQueue: [] as import("../../../src/temporal/types.js").AdHocRevisionSignal[],
    };
    const payload = buildContinueAsNewPayload(state);
    expect(payload.signOffs).not.toBe(signOffs);
    expect(payload.signOffs).toEqual(signOffs);
  });
});

// ---------------------------------------------------------------------------
// PROP-TF-89: Workflow determinism — no non-deterministic APIs in workflow file
//
// Temporal workflows MUST be deterministic. Using Date.now(), Math.random(),
// or direct I/O inside a workflow violates this constraint and causes replay
// bugs. This test statically verifies the feature-lifecycle workflow file
// does not contain calls to these banned APIs.
//
// Source: TSPEC S5.1 comment, PROP-TF-89
// ---------------------------------------------------------------------------

describe("PROP-TF-89: featureLifecycleWorkflow determinism — no non-deterministic APIs", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowSrcPath = path.resolve(
    currentDir,
    "../../../src/temporal/workflows/feature-lifecycle.ts"
  );

  let workflowSource: string;

  it("workflow source file exists", () => {
    expect(() => {
      workflowSource = fs.readFileSync(workflowSrcPath, "utf-8");
    }).not.toThrow();
    expect(workflowSource.length).toBeGreaterThan(0);
  });

  it("does not call Date.now() inside the workflow function body", () => {
    // Read source, which we already confirmed exists
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    // Date.now() is banned in workflow code — Temporal uses its own clock via wf.sleep()
    // We allow Date.now in comments and in test files but not in production function calls
    // Regex matches `Date.now(` as a call expression (not in a comment)
    const linesWithDateNow = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .filter((line) => /\bDate\.now\s*\(/.test(line));
    expect(linesWithDateNow).toHaveLength(0);
  });

  it("does not call Math.random() inside the workflow function body", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    const linesWithMathRandom = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .filter((line) => /\bMath\.random\s*\(/.test(line));
    expect(linesWithMathRandom).toHaveLength(0);
  });

  it("does not use direct fs/io imports (no node:fs or node:path in workflow)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    // Workflow files must not import node:fs, node:path, or node:net etc.
    const linesWithNodeImports = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .filter((line) => /import.*from.*["']node:(fs|path|net|http|https|child_process|os|stream|crypto)["']/.test(line));
    expect(linesWithNodeImports).toHaveLength(0);
  });

  it("uses @temporalio/workflow import (not direct Temporal client)", () => {
    const source = fs.readFileSync(workflowSrcPath, "utf-8");
    // Workflows must import from @temporalio/workflow, not @temporalio/client
    expect(source).toContain("@temporalio/workflow");
    // Must NOT import @temporalio/client or @temporalio/worker (server-side only)
    const linesWithClientImport = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .filter((line) => /@temporalio\/(client|worker)/.test(line));
    expect(linesWithClientImport).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A1: PhaseStatus extension — "revision-bound-reached"
// ---------------------------------------------------------------------------

describe("PhaseStatus type — revision-bound-reached", () => {
  it("accepts 'revision-bound-reached' as a valid PhaseStatus value", () => {
    const status: PhaseStatus = "revision-bound-reached";
    expect(status).toBe("revision-bound-reached");
  });

  it("accepts all existing PhaseStatus values alongside revision-bound-reached", () => {
    const statuses: PhaseStatus[] = [
      "running",
      "waiting-for-user",
      "waiting-for-reviewers",
      "failed",
      "revision-bound-reached",
      "completed",
    ];
    expect(statuses).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// A1: ReadCrossReviewInput type
// ---------------------------------------------------------------------------

describe("ReadCrossReviewInput type", () => {
  it("accepts a well-formed ReadCrossReviewInput object", () => {
    const input: ReadCrossReviewInput = {
      featurePath: "docs/in-progress/auth/",
      agentId: "eng",
      documentType: "REQ",
    };
    expect(input.featurePath).toBe("docs/in-progress/auth/");
    expect(input.agentId).toBe("eng");
    expect(input.documentType).toBe("REQ");
  });
});

// ---------------------------------------------------------------------------
// A1: CrossReviewResult type
// ---------------------------------------------------------------------------

describe("CrossReviewResult type", () => {
  it("accepts an approved result", () => {
    const result: CrossReviewResult = { status: "approved" };
    expect(result.status).toBe("approved");
    expect(result.reason).toBeUndefined();
    expect(result.rawValue).toBeUndefined();
  });

  it("accepts a revision_requested result", () => {
    const result: CrossReviewResult = { status: "revision_requested" };
    expect(result.status).toBe("revision_requested");
  });

  it("accepts a parse_error result with reason", () => {
    const result: CrossReviewResult = {
      status: "parse_error",
      reason: "Cross-review file not found",
    };
    expect(result.status).toBe("parse_error");
    expect(result.reason).toBe("Cross-review file not found");
  });

  it("accepts a parse_error result with reason and rawValue", () => {
    const result: CrossReviewResult = {
      status: "parse_error",
      reason: "Unrecognized recommendation",
      rawValue: "Maybe approved?",
    };
    expect(result.status).toBe("parse_error");
    expect(result.reason).toBe("Unrecognized recommendation");
    expect(result.rawValue).toBe("Maybe approved?");
  });
});

// ---------------------------------------------------------------------------
// A2: deriveDocumentType — pure function
// ---------------------------------------------------------------------------

describe("deriveDocumentType", () => {
  it("derives 'REQ' from 'req-review'", () => {
    expect(deriveDocumentType("req-review")).toBe("REQ");
  });

  it("derives 'FSPEC' from 'fspec-creation'", () => {
    expect(deriveDocumentType("fspec-creation")).toBe("FSPEC");
  });

  it("derives 'TSPEC' from 'tspec-review'", () => {
    expect(deriveDocumentType("tspec-review")).toBe("TSPEC");
  });

  it("derives 'PROPERTIES' from 'properties-review'", () => {
    expect(deriveDocumentType("properties-review")).toBe("PROPERTIES");
  });

  it("derives 'REQ' from 'req-creation'", () => {
    expect(deriveDocumentType("req-creation")).toBe("REQ");
  });

  it("derives 'TSPEC' from 'tspec-approved'", () => {
    expect(deriveDocumentType("tspec-approved")).toBe("TSPEC");
  });

  it("uppercases phase IDs without a known suffix", () => {
    expect(deriveDocumentType("impl")).toBe("IMPL");
  });
});
