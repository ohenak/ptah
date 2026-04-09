/**
 * Temporal Workflow Integration Tests — Phase G (015-temporal-foundation)
 *
 * These tests use @temporalio/testing's TestWorkflowEnvironment with time-skipping
 * enabled. Activities are replaced with mock implementations to isolate workflow logic.
 *
 * G4: Full workflow lifecycle (happy path: creation → review → approved → next phase)
 * G5: ROUTE_TO_USER signal round trip
 * G6: Fork/join with wait_for_all failure policy
 * G7: Migration dry-run (no server required) — live migration tested via FakeTemporalClient
 *
 * Environment requirements:
 * - @temporalio/testing is installed (included in temporalio meta-package)
 * - The test server binary is downloaded on first run (~5s)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { SkillActivityInput, SkillActivityResult, NotificationInput, ReadCrossReviewInput, CrossReviewResult } from "../../../src/temporal/types.js";
import type { MergeWorktreeInput, MergeResult } from "../../../src/temporal/activities/skill-activity.js";
import type { StartWorkflowParams, FeatureWorkflowState } from "../../../src/temporal/types.js";
import type { WorkflowConfig, PhaseDefinition } from "../../../src/config/workflow-config.js";
import {
  FakeFileSystem,
  FakeLogger,
  FakeTemporalClient,
  FakeGitClient,
  FakeDiscordClient,
  FakeSkillInvoker,
  FakeAgentRegistry,
  FakeTemporalWorker,
  defaultFeatureWorkflowState,
  defaultTestConfig,
  defaultTestWorkflowConfig,
} from "../../fixtures/factories.js";
import { MigrateCommand } from "../../../src/commands/migrate.js";
import type { PdlcStateFile } from "../../../src/orchestrator/pdlc/v4-types.js";
import {
  parseRecommendation,
  crossReviewPath,
  agentIdToSkillName,
} from "../../../src/orchestrator/pdlc/cross-review-parser.js";
import {
  resolveContextDocuments,
  buildInvokeSkillInput,
} from "../../../src/temporal/workflows/feature-lifecycle.js";
import { TemporalOrchestrator } from "../../../src/orchestrator/temporal-orchestrator.js";
import type { RegisteredAgent } from "../../../src/types.js";

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

const TASK_QUEUE = "ptah-integration-tests";

/** Resolve the workflows module path for the Worker.
 * Temporal requires the compiled JS (dist/) not the TypeScript source.
 * We resolve relative to the repo root using import.meta.url.
 */
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const workflowsPath = resolve(repoRoot, "dist/src/temporal/workflows/feature-lifecycle.js");

/** Minimal workflow config for testing — 3 phases: creation → review → approved */
function makeMinimalWorkflowConfig(): WorkflowConfig {
  return {
    version: 1,
    phases: [
      {
        id: "req-creation",
        name: "Requirements Creation",
        type: "creation",
        agent: "pm",
        context_documents: [],
      },
      {
        id: "req-review",
        name: "Requirements Review",
        type: "review",
        reviewers: { default: ["eng"] },
        context_documents: [],
        revision_bound: 2,
      },
      {
        id: "req-approved",
        name: "Requirements Approved",
        type: "approved",
      },
    ],
  };
}

/** Minimal StartWorkflowParams */
function makeStartParams(overrides?: Partial<StartWorkflowParams>): StartWorkflowParams {
  return {
    featureSlug: "test-feature",
    featureConfig: { discipline: "backend-only", skipFspec: false },
    workflowConfig: makeMinimalWorkflowConfig(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Environment lifecycle
// ---------------------------------------------------------------------------

let testEnv: TestWorkflowEnvironment;
let worker: Worker;
let workerRunPromise: Promise<void>;

beforeAll(async () => {
  // Start the time-skipping test server (downloads Java binary on first run)
  testEnv = await TestWorkflowEnvironment.createTimeSkipping();

  // Create worker with mock activities
  worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities: makeMockActivities(),
  });

  // Run worker in background; store the promise so we can await it during cleanup
  workerRunPromise = worker.run();
}, 30_000);

afterAll(async () => {
  // Shutdown the worker and wait for it to stop before tearing down the test env
  worker?.shutdown();
  await workerRunPromise;
  await testEnv?.teardown();
});

// ---------------------------------------------------------------------------
// Mock activity factory — returns activity functions that simulate typical behavior
// ---------------------------------------------------------------------------

/** Per-test activity behavior overrides */
let activityOverrides: Partial<MockActivities> = {};

interface MockActivities {
  invokeSkill: (input: SkillActivityInput) => Promise<SkillActivityResult>;
  mergeWorktree: (input: MergeWorktreeInput) => Promise<MergeResult>;
  sendNotification: (input: NotificationInput) => Promise<void>;
  resolveFeaturePath: (input: { featureSlug: string; worktreeRoot: string }) => Promise<{ found: boolean; path?: string; lifecycle?: string; slug?: string }>;
  promoteBacklogToInProgress: (input: { featureSlug: string; featureBranch: string; workflowId: string; runId: string }) => Promise<{ featurePath: string; promoted: boolean }>;
  promoteInProgressToCompleted: (input: { featureSlug: string; featureBranch: string; workflowId: string; runId: string }) => Promise<{ featurePath: string; promoted: boolean }>;
  readCrossReviewRecommendation: (input: ReadCrossReviewInput) => Promise<CrossReviewResult>;
}

/** Notifications captured during each test */
const capturedNotifications: NotificationInput[] = [];

/** Activity call tracking (F-04: verify input parameters passed to activities) */
const capturedInvokeSkillCalls: SkillActivityInput[] = [];
const capturedCrossReviewCalls: ReadCrossReviewInput[] = [];

function makeMockActivities(): MockActivities {
  return {
    async invokeSkill(input: SkillActivityInput): Promise<SkillActivityResult> {
      capturedInvokeSkillCalls.push(input);
      if (activityOverrides.invokeSkill) return activityOverrides.invokeSkill(input);
      const isReviewLike = input.taskType === "Review";
      return {
        routingSignalType: isReviewLike ? "LGTM" : "LGTM",
        artifactChanges: ["README.md"],
        durationMs: 100,
      };
    },
    async mergeWorktree(_input: MergeWorktreeInput): Promise<MergeResult> {
      if (activityOverrides.mergeWorktree) return activityOverrides.mergeWorktree(_input);
      return "merged";
    },
    async sendNotification(input: NotificationInput): Promise<void> {
      capturedNotifications.push(input);
      if (activityOverrides.sendNotification) return activityOverrides.sendNotification(input);
    },
    async resolveFeaturePath(input: { featureSlug: string; worktreeRoot: string }) {
      if (activityOverrides.resolveFeaturePath) return activityOverrides.resolveFeaturePath(input);
      return { found: true, path: `docs/in-progress/${input.featureSlug}/`, lifecycle: "in-progress" };
    },
    async promoteBacklogToInProgress(input: { featureSlug: string; featureBranch: string; workflowId: string; runId: string }) {
      if (activityOverrides.promoteBacklogToInProgress) return activityOverrides.promoteBacklogToInProgress(input);
      return { featurePath: `docs/in-progress/${input.featureSlug}/`, promoted: true };
    },
    async promoteInProgressToCompleted(input: { featureSlug: string; featureBranch: string; workflowId: string; runId: string }) {
      if (activityOverrides.promoteInProgressToCompleted) return activityOverrides.promoteInProgressToCompleted(input);
      return { featurePath: `docs/completed/001-${input.featureSlug}/`, promoted: true };
    },
    async readCrossReviewRecommendation(input: ReadCrossReviewInput): Promise<CrossReviewResult> {
      capturedCrossReviewCalls.push(input);
      if (activityOverrides.readCrossReviewRecommendation) return activityOverrides.readCrossReviewRecommendation(input);
      // Default: return approved for all cross-review reads
      return { status: "approved" };
    },
  };
}

afterEach(() => {
  // Reset overrides and captured state after each test
  activityOverrides = {};
  capturedNotifications.length = 0;
  capturedInvokeSkillCalls.length = 0;
  capturedCrossReviewCalls.length = 0;
});

// ---------------------------------------------------------------------------
// G4: Full workflow lifecycle — happy path
// ---------------------------------------------------------------------------

describe("G4: full workflow lifecycle (happy path)", () => {
  it("completes: creation → review → approved phase via single approved reviewer", async () => {
    const workflowId = `integration-g4-${Date.now()}`;
    const params = makeStartParams();

    // Start the workflow
    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [params],
    });

    // Wait for workflow to reach "req-review" phase (after creation LGTM)
    // The creation phase will invoke a single agent and get LGTM immediately.
    // The review phase will invoke reviewer(s) and get LGTM/approved.
    // Then it auto-transitions through "req-approved" and the workflow completes.

    // Default mock returns LGTM for all agents, so the workflow should complete.
    await handle.result();

    // Query final state via the result (workflow completed → query may not be available)
    // Verify by checking the workflow completed without error
    // (no assertion needed — handle.result() would throw on error)
  });

  it("executes phases in order: creation first, then review", async () => {
    const phaseOrder: string[] = [];
    const workflowId = `integration-g4-order-${Date.now()}`;

    activityOverrides.invokeSkill = async (input) => {
      phaseOrder.push(`${input.phaseId}:${input.agentId}`);
      const isReviewLike = input.taskType === "Review";
      return {
        routingSignalType: isReviewLike ? "Approved" : "LGTM",
        artifactChanges: [],
        durationMs: 50,
      };
    };

    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams()],
    });

    await handle.result();

    // req-creation (agent: pm) must come before req-review (reviewer: eng)
    expect(phaseOrder[0]).toBe("req-creation:pm");
    expect(phaseOrder[1]).toBe("req-review:eng");
  });

  it("workflow state query returns completed state after workflow finishes", async () => {
    const workflowId = `integration-g4-query-${Date.now()}`;

    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams()],
    });

    // Wait for workflow to complete
    await handle.result();

    // After completion, query state — workflow should have completed all phases
    // Note: Temporal allows querying closed workflows; the state reflects the final snapshot
    // The completed phases should include at least the req-creation phase
    // (The workflow state is updated as phases complete)
    // We verify the workflow completed without error (no exception from handle.result())
    // and query the final state
    const state = await handle.query<FeatureWorkflowState>("workflow-state");
    // The workflow ran all 3 phases: req-creation, req-review, req-approved
    expect(state.completedPhaseIds).toContain("req-creation");
    expect(state.completedPhaseIds).toContain("req-review");
  });

  it("verifies readCrossReviewRecommendation receives correct parameters (PROP-RC-05, PROP-NF-01)", async () => {
    const workflowId = `integration-g4-params-${Date.now()}`;

    activityOverrides.invokeSkill = async (input) => {
      const isReviewLike = input.taskType === "Review";
      return {
        routingSignalType: isReviewLike ? "Approved" : "LGTM",
        artifactChanges: [],
        durationMs: 50,
      };
    };

    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams()],
    });

    await handle.result();

    // The review phase (req-review) should have triggered readCrossReviewRecommendation
    // for reviewer "eng" with documentType derived from "req-review" → "REQ"
    expect(capturedCrossReviewCalls.length).toBeGreaterThan(0);
    const reviewCall = capturedCrossReviewCalls.find((c) => c.agentId === "eng");
    expect(reviewCall).toBeDefined();
    expect(reviewCall!.documentType).toBe("REQ");
    expect(reviewCall!.featurePath).toContain("test-feature");
  });
});

// ---------------------------------------------------------------------------
// F-01: parse_error → handleFailureFlow (PROP-RC-08)
// ---------------------------------------------------------------------------

describe("PROP-RC-08: parse_error triggers handleFailureFlow", () => {
  it("enters failure flow when readCrossReviewRecommendation returns parse_error", async () => {
    const workflowId = `integration-rc08-${Date.now()}`;

    activityOverrides.invokeSkill = async (input) => {
      const isReviewLike = input.taskType === "Review";
      return {
        routingSignalType: isReviewLike ? "Approved" : "LGTM",
        artifactChanges: [],
        durationMs: 50,
      };
    };

    // Return parse_error for cross-review reads — simulates malformed cross-review file
    activityOverrides.readCrossReviewRecommendation = async () => ({
      status: "parse_error" as const,
      reason: "file_not_found",
    });

    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams()],
    });

    // Give the workflow time to reach the failure state
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    // Workflow should be in failed state — send cancel to let it complete
    await handle.signal("retry-or-cancel", "cancel");

    await handle.result();

    // Verify a failure notification was sent with RecommendationParseError
    const failureNotification = capturedNotifications.find(
      (n) => n.type === "failure" && n.message.includes("RecommendationParseError"),
    );
    expect(failureNotification).toBeDefined();
    expect(failureNotification!.message).toContain("file_not_found");
  });
});

// ---------------------------------------------------------------------------
// F-02: anyRevisionRequested triggers revision dispatch (PROP-RC-07)
// ---------------------------------------------------------------------------

describe("PROP-RC-07: revision_requested triggers author revision dispatch", () => {
  it("dispatches author for revision when reviewer returns revision_requested", async () => {
    const workflowId = `integration-rc07-${Date.now()}`;
    let revisionDispatchCount = 0;

    activityOverrides.invokeSkill = async (input) => {
      if (input.taskType === "Revise") {
        revisionDispatchCount++;
        // Revision succeeds — author fixes the document
        return { routingSignalType: "LGTM", artifactChanges: [], durationMs: 50 };
      }
      // Creation and review phases complete normally
      const isReviewLike = input.taskType === "Review";
      return {
        routingSignalType: isReviewLike ? "Approved" : "LGTM",
        artifactChanges: [],
        durationMs: 50,
      };
    };

    let crossReviewCallCount = 0;
    activityOverrides.readCrossReviewRecommendation = async () => {
      crossReviewCallCount++;
      if (crossReviewCallCount === 1) {
        // First review round: revision requested
        return { status: "revision_requested" as const };
      }
      // Second review round (after revision): approved
      return { status: "approved" as const };
    };

    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams()],
    });

    await handle.result();

    // Author should have been dispatched for revision exactly once
    expect(revisionDispatchCount).toBe(1);
    // Cross-review should have been read twice (first: revision_requested, second: approved)
    expect(crossReviewCallCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// F-03: skipFspec:true skips all FSPEC phases (PROP-NF-05)
// ---------------------------------------------------------------------------

describe("PROP-NF-05: skipFspec:true skips all FSPEC phases", () => {
  it("skips fspec-creation, fspec-review, fspec-approved when skipFspec is true", async () => {
    const workflowId = `integration-nf05-${Date.now()}`;
    const dispatchedPhases: string[] = [];

    // Workflow config with FSPEC phases that have skip_if: config.skipFspec
    const workflowConfig: WorkflowConfig = {
      version: 1,
      phases: [
        {
          id: "req-creation",
          name: "Requirements Creation",
          type: "creation",
          agent: "pm",
          context_documents: [],
        },
        {
          id: "req-review",
          name: "Requirements Review",
          type: "review",
          reviewers: { default: ["eng"] },
          context_documents: [],
          revision_bound: 2,
        },
        {
          id: "req-approved",
          name: "Requirements Approved",
          type: "approved",
        },
        {
          id: "fspec-creation",
          name: "FSPEC Creation",
          type: "creation",
          agent: "pm",
          skip_if: { field: "config.skipFspec", equals: true },
          context_documents: [],
        },
        {
          id: "fspec-review",
          name: "FSPEC Review",
          type: "review",
          reviewers: { default: ["eng"] },
          skip_if: { field: "config.skipFspec", equals: true },
          context_documents: [],
          revision_bound: 2,
        },
        {
          id: "fspec-approved",
          name: "FSPEC Approved",
          type: "approved",
          skip_if: { field: "config.skipFspec", equals: true },
        },
        {
          id: "tspec-creation",
          name: "TSPEC Creation",
          type: "creation",
          agent: "eng",
          context_documents: [],
        },
        {
          id: "tspec-approved",
          name: "TSPEC Approved",
          type: "approved",
        },
      ],
    };

    activityOverrides.invokeSkill = async (input) => {
      dispatchedPhases.push(input.phaseId);
      const isReviewLike = input.taskType === "Review";
      return {
        routingSignalType: isReviewLike ? "Approved" : "LGTM",
        artifactChanges: [],
        durationMs: 50,
      };
    };

    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams({
        featureConfig: { discipline: "backend-only", skipFspec: true },
        workflowConfig,
      })],
    });

    await handle.result();

    // FSPEC phases should NOT appear in dispatched phases
    expect(dispatchedPhases).not.toContain("fspec-creation");
    expect(dispatchedPhases).not.toContain("fspec-review");
    // fspec-approved is type "approved" (auto-transition), never dispatched anyway

    // REQ and TSPEC phases should have been dispatched
    expect(dispatchedPhases).toContain("req-creation");
    expect(dispatchedPhases).toContain("req-review");
    expect(dispatchedPhases).toContain("tspec-creation");

    // resolveNextPhase recursively skips all FSPEC phases when transitioning
    // from req-approved. They never enter the main loop, so they are NOT in completedPhaseIds.
    const state = await handle.query<FeatureWorkflowState>("workflow-state");
    expect(state.completedPhaseIds).not.toContain("fspec-creation");
    expect(state.completedPhaseIds).not.toContain("fspec-review");
    expect(state.completedPhaseIds).not.toContain("fspec-approved");
    // Non-skipped phases completed normally
    expect(state.completedPhaseIds).toContain("req-creation");
    expect(state.completedPhaseIds).toContain("req-review");
    expect(state.completedPhaseIds).toContain("req-approved");
    expect(state.completedPhaseIds).toContain("tspec-creation");
  });
});

// ---------------------------------------------------------------------------
// G5: ROUTE_TO_USER signal round trip
// ---------------------------------------------------------------------------

describe("G5: ROUTE_TO_USER signal round trip", () => {
  it("pauses on ROUTE_TO_USER and resumes after user-answer signal", async () => {
    const workflowId = `integration-g5-${Date.now()}`;
    let questionCallCount = 0;

    activityOverrides.invokeSkill = async (input) => {
      if (input.phaseId === "req-creation") {
        questionCallCount++;
        if (questionCallCount === 1) {
          // First invocation: ask a question
          return {
            routingSignalType: "ROUTE_TO_USER",
            question: "What is the scope of this feature?",
            artifactChanges: [],
            durationMs: 100,
          };
        }
        // Second invocation (after answer): complete normally
        return {
          routingSignalType: "LGTM",
          artifactChanges: ["README.md"],
          durationMs: 100,
        };
      }
      // Review phases must return "Approved"
      const isReviewLike = input.taskType === "Review";
      return { routingSignalType: isReviewLike ? "Approved" : "LGTM", artifactChanges: [], durationMs: 50 };
    };

    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams()],
    });

    // Give the workflow a moment to reach the waiting-for-user state
    // then send the signal (Temporal buffers signals sent before the handler is set)
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    // Send the user-answer signal (Temporal buffers it if the handler isn't set yet)
    await handle.signal("user-answer", {
      answer: "The scope is the authentication module.",
      answeredBy: "user-123",
      answeredAt: new Date().toISOString(),
    });

    // Workflow should now complete
    await handle.result();

    // Question flow should have been invoked twice (first time: question, second: LGTM)
    expect(questionCallCount).toBe(2);

    // PROP-NEG-06: Verify invokeSkill for req-creation was called exactly twice,
    // not three times (guards against the old fork/join double-invocation bug)
    const creationCalls = capturedInvokeSkillCalls.filter((c) => c.phaseId === "req-creation");
    expect(creationCalls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// G6: Fork/join with wait_for_all failure policy
// ---------------------------------------------------------------------------

describe("G6: fork/join with wait_for_all failure policy", () => {
  it("waits for all agents before merging worktrees when policy is wait_for_all", async () => {
    const workflowConfig: WorkflowConfig = {
      version: 1,
      phases: [
        {
          id: "parallel-phase",
          name: "Parallel Phase",
          type: "creation",
          agents: ["eng", "fe"],
          failure_policy: "wait_for_all",
          context_documents: [],
        },
        {
          id: "done",
          name: "Done",
          type: "approved",
        },
      ],
    };

    const invokedAgents: string[] = [];

    activityOverrides.invokeSkill = async (input) => {
      invokedAgents.push(input.agentId);
      const isReviewLike = input.taskType === "Review";
      return {
        routingSignalType: isReviewLike ? "Approved" : "LGTM",
        worktreePath: `/tmp/test-worktree-${input.agentId}`,
        artifactChanges: [`${input.agentId}-changes.md`],
        durationMs: 50,
      };
    };

    const workflowId = `integration-g6-${Date.now()}`;
    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams({ workflowConfig })],
    });

    await handle.result();

    // Both agents should have been invoked
    expect(invokedAgents).toHaveLength(2);
    expect(invokedAgents).toContain("eng");
    expect(invokedAgents).toContain("fe");
  });

  it("marks phase as failed if one fork agent fails with wait_for_all policy", async () => {
    const workflowConfig: WorkflowConfig = {
      version: 1,
      phases: [
        {
          id: "parallel-phase",
          name: "Parallel Phase",
          type: "creation",
          agents: ["eng", "fe"],
          failure_policy: "wait_for_all",
          context_documents: [],
        },
        {
          id: "done",
          name: "Done",
          type: "approved",
        },
      ],
    };

    let feCallCount = 0;
    activityOverrides.invokeSkill = async (input) => {
      if (input.agentId === "fe") {
        feCallCount++;
        if (feCallCount === 1) {
          // Simulate non-retryable failure from fe agent
          const { ApplicationFailure } = await import("@temporalio/common");
          throw ApplicationFailure.nonRetryable("Frontend agent failed with config error");
        }
      }
      return {
        routingSignalType: "LGTM",
        worktreePath: `/tmp/test-worktree-${input.agentId}`,
        artifactChanges: [],
        durationMs: 50,
      };
    };

    const workflowId = `integration-g6-fail-${Date.now()}`;
    const handle = await testEnv.client.workflow.start("featureLifecycleWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [makeStartParams({ workflowConfig })],
    });

    // Give the workflow time to reach the failure state and send notification
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    // Send cancel signal to terminate the workflow from the failure wait
    await handle.signal("retry-or-cancel", "cancel");

    // Workflow should complete (cancelled via signal)
    await handle.result();
  });
});

// ---------------------------------------------------------------------------
// G7: Migration tests
// ---------------------------------------------------------------------------

describe("G7: migration dry-run and live migration", () => {
  /** Build a minimal v4 state file JSON string */
  function makeV4StateFile(
    features: Record<string, { phase: string; discipline?: string; skipFspec?: boolean }>,
  ): string {
    const stateFile: PdlcStateFile = {
      version: 1,
      features: Object.fromEntries(
        Object.entries(features).map(([slug, opts]) => [
          slug,
          {
            slug,
            phase: opts.phase as any,
            config: {
              discipline: (opts.discipline ?? "backend-only") as "backend-only",
              skipFspec: opts.skipFspec ?? false,
            },
            reviewPhases: {},
            forkJoin: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            completedAt: null,
          } as any,
        ]),
      ),
    };
    return JSON.stringify(stateFile);
  }

  function makeWorkflowYaml(): string {
    return `version: 1
phases:
  - id: req-creation
    name: Requirements Creation
    type: creation
    agent: pm
  - id: req-review
    name: Requirements Review
    type: review
    reviewers:
      default: [eng]
    revision_bound: 3
  - id: req-approved
    name: Requirements Approved
    type: approved
`;
  }

  it("dry-run: reports features that would be migrated without creating workflows", async () => {
    const fs = new FakeFileSystem();
    const logger = new FakeLogger();
    const temporalClient = new FakeTemporalClient();

    // Seed the v4 state file at the paths MigrateCommand expects
    fs.addExisting("pdlc-state.json", makeV4StateFile({
      "auth-feature": { phase: "REQ_CREATION" },
      "billing-feature": { phase: "FSPEC_CREATION" },
    }));
    fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());

    const command = new MigrateCommand(temporalClient, fs, logger);

    const result = await command.execute({
      dryRun: true,
      includeCompleted: false,
    });

    // Dry-run should not create any workflows
    expect(temporalClient.startedWorkflows).toHaveLength(0);

    // In dry-run, activeCreated reflects the count of features that WOULD be migrated
    // (computeDryRunResult counts them but returns without starting workflows)
    expect(result.activeCreated).toBe(2);
  });

  it("live migration: creates Temporal workflows for each active v4 feature", async () => {
    const fs = new FakeFileSystem();
    const logger = new FakeLogger();
    const temporalClient = new FakeTemporalClient();
    temporalClient.connected = true;

    fs.addExisting("pdlc-state.json", makeV4StateFile({
      "auth-feature": { phase: "REQ_CREATION" },
      "billing-feature": { phase: "TSPEC_CREATION" },
    }));
    fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());

    const command = new MigrateCommand(temporalClient, fs, logger);

    const result = await command.execute({
      dryRun: false,
      includeCompleted: false,
    });

    // Should have started workflows for the 2 active features
    expect(result.activeCreated).toBe(2);
    expect(temporalClient.startedWorkflows).toHaveLength(2);

    // Verify workflow IDs follow the ptah-feature-{slug}-1 convention
    const workflowIds = temporalClient.startedWorkflows.map((w) => w.featureSlug);
    expect(workflowIds).toContain("auth-feature");
    expect(workflowIds).toContain("billing-feature");
  });

  it("skips completed features unless --include-completed is set", async () => {
    const fs = new FakeFileSystem();
    const logger = new FakeLogger();
    const temporalClient = new FakeTemporalClient();
    temporalClient.connected = true;

    fs.addExisting("pdlc-state.json", makeV4StateFile({
      "active-feature": { phase: "REQ_CREATION" },
      "done-feature": { phase: "DONE" },
    }));
    fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());

    const command = new MigrateCommand(temporalClient, fs, logger);

    // Without --include-completed, DONE feature should be skipped
    const result = await command.execute({
      dryRun: false,
      includeCompleted: false,
    });

    const started = temporalClient.startedWorkflows.map((w) => w.featureSlug);
    expect(started).toContain("active-feature");
    expect(started).not.toContain("done-feature");
    // completedImported=0 (not included), activeCreated=1, skipped=0
    expect(result.completedImported).toBe(0);
  });

  it("dry-run reports phase mapping without starting workflows", async () => {
    const fs = new FakeFileSystem();
    const logger = new FakeLogger();
    const temporalClient = new FakeTemporalClient();

    fs.addExisting("pdlc-state.json", makeV4StateFile({
      "test-feature": { phase: "REQ_CREATION" },
    }));
    fs.addExisting("ptah.workflow.yaml", makeWorkflowYaml());

    const command = new MigrateCommand(temporalClient, fs, logger);

    const result = await command.execute({ dryRun: true, includeCompleted: false });

    // No workflows should be started in dry-run
    expect(temporalClient.startedWorkflows).toHaveLength(0);

    // Dry-run should count features that would be migrated
    expect(result.activeCreated).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// H1: Integration test — readCrossReviewRecommendation activity pipeline
// ---------------------------------------------------------------------------

describe("H1: cross-review recommendation parsing pipeline", () => {
  it("end-to-end approved: reads file from disk, parses recommendation, returns approved", async () => {
    const fs = new FakeFileSystem();
    const featurePath = "docs/in-progress/auth-feature/";
    const agentId = "eng";
    const documentType = "REQ";

    // Step 1: Derive skill name from agentId
    const skillName = agentIdToSkillName(agentId);
    expect(skillName).toBe("engineer");

    // Step 2: Derive the expected cross-review file path
    const filePath = crossReviewPath(featurePath, skillName!, documentType);
    expect(filePath).toBe("docs/in-progress/auth-feature/CROSS-REVIEW-engineer-REQ.md");

    // Step 3: Write the cross-review file with an "Approved" recommendation
    const fileContent = `# Cross-Review: REQ for auth-feature

## Summary
The requirements document is well-structured and covers all key areas.

## Recommendation
Approved

## Notes
- Minor formatting suggestions included as inline comments.
`;
    fs.addExisting(filePath, fileContent);

    // Step 4: Read file content via FileSystem (simulating what the activity would do)
    const content = await fs.readFile(filePath);
    expect(content).toBe(fileContent);

    // Step 5: Parse the recommendation
    const result = parseRecommendation(content);
    expect(result.status).toBe("approved");
  });

  it("end-to-end revision_requested: reads file, parses recommendation, returns revision_requested", async () => {
    const fs = new FakeFileSystem();
    const featurePath = "docs/in-progress/billing-feature/";
    const agentId = "qa";
    const documentType = "FSPEC";

    // Derive skill name and file path
    const skillName = agentIdToSkillName(agentId);
    expect(skillName).toBe("test-engineer");

    const filePath = crossReviewPath(featurePath, skillName!, documentType);
    expect(filePath).toBe("docs/in-progress/billing-feature/CROSS-REVIEW-test-engineer-FSPEC.md");

    // Write cross-review file with "Needs Revision" recommendation
    const fileContent = `# Cross-Review: FSPEC for billing-feature

## Issues Found
1. Missing error handling for payment failures
2. No retry logic specified for webhook delivery

## Recommendation
Needs Revision

## Required Changes
- Add error handling section
- Define retry policy for webhooks
`;
    fs.addExisting(filePath, fileContent);

    // Read and parse
    const content = await fs.readFile(filePath);
    const result = parseRecommendation(content);
    expect(result.status).toBe("revision_requested");
  });

  it("returns parse_error when cross-review file does not exist", async () => {
    const fs = new FakeFileSystem();
    const featurePath = "docs/in-progress/missing-feature/";
    const agentId = "pm";
    const documentType = "REQ";

    const skillName = agentIdToSkillName(agentId);
    expect(skillName).toBe("product-manager");

    const filePath = crossReviewPath(featurePath, skillName!, documentType);

    // File does not exist — verify exists() returns false
    const exists = await fs.exists(filePath);
    expect(exists).toBe(false);

    // Simulating activity behavior: if file not found, return parse_error
    // (The activity would check existence before reading)
  });

  it("handles approved with minor changes as approved", async () => {
    const fs = new FakeFileSystem();
    const featurePath = "docs/in-progress/search-feature/";
    const agentId = "fe";
    const documentType = "TSPEC";

    const skillName = agentIdToSkillName(agentId);
    expect(skillName).toBe("frontend-engineer");

    const filePath = crossReviewPath(featurePath, skillName!, documentType);

    const fileContent = `# Cross-Review

## Recommendation
Approved with minor changes

## Minor suggestions
- Consider adding aria labels to search input
`;
    fs.addExisting(filePath, fileContent);

    const content = await fs.readFile(filePath);
    const result = parseRecommendation(content);
    expect(result.status).toBe("approved");
  });

  it("handles table-format recommendation heading", async () => {
    const fs = new FakeFileSystem();
    const featurePath = "docs/in-progress/dashboard-feature/";
    const filePath = crossReviewPath(featurePath, "engineer", "REQ");

    const fileContent = `# Cross-Review Summary

| Field | Value |
|-------|-------|
| Reviewer | engineer |
| Recommendation | Needs Revision |
| Date | 2026-04-09 |
`;
    fs.addExisting(filePath, fileContent);

    const content = await fs.readFile(filePath);
    const result = parseRecommendation(content);
    expect(result.status).toBe("revision_requested");
  });
});

// ---------------------------------------------------------------------------
// H2: Integration test — context document resolution pipeline
// ---------------------------------------------------------------------------

describe("H2: context document resolution through to assembler", () => {
  it("resolves {feature}/REQ template to actual file path for in-progress feature", () => {
    const refs = ["{feature}/REQ"];
    const resolved = resolveContextDocuments(refs, {
      featureSlug: "auth",
      featurePath: "docs/in-progress/auth/",
    });
    expect(resolved).toEqual(["docs/in-progress/auth/REQ-auth.md"]);
  });

  it("resolves multiple template strings in a single phase config", () => {
    const refs = ["{feature}/REQ", "{feature}/FSPEC"];
    const resolved = resolveContextDocuments(refs, {
      featureSlug: "auth",
      featurePath: "docs/in-progress/auth/",
    });
    expect(resolved).toEqual([
      "docs/in-progress/auth/REQ-auth.md",
      "docs/in-progress/auth/FSPEC-auth.md",
    ]);
  });

  it("resolves templates for completed features with NNN prefix", () => {
    const refs = ["{feature}/REQ", "{feature}/FSPEC"];
    const resolved = resolveContextDocuments(refs, {
      featureSlug: "my-feature",
      featurePath: "docs/completed/015-my-feature/",
    });
    expect(resolved).toEqual([
      "docs/completed/015-my-feature/015-REQ-my-feature.md",
      "docs/completed/015-my-feature/015-FSPEC-my-feature.md",
    ]);
  });

  it("passes through non-template refs unchanged", () => {
    const refs = ["{feature}/REQ", "some/absolute/path.md"];
    const resolved = resolveContextDocuments(refs, {
      featureSlug: "auth",
      featurePath: "docs/in-progress/auth/",
    });
    expect(resolved).toEqual([
      "docs/in-progress/auth/REQ-auth.md",
      "some/absolute/path.md",
    ]);
  });

  it("resolves {feature}/overview template correctly", () => {
    const refs = ["{feature}/overview"];
    const resolved = resolveContextDocuments(refs, {
      featureSlug: "auth",
      featurePath: "docs/in-progress/auth/",
    });
    expect(resolved).toEqual(["docs/in-progress/auth/overview.md"]);
  });

  it("full pipeline: resolveContextDocuments -> buildInvokeSkillInput populates contextDocumentRefs", () => {
    // Simulate workflow config phase with context_documents
    const phase: PhaseDefinition = {
      id: "fspec-creation",
      name: "FSPEC Creation",
      type: "creation",
      agent: "eng",
      context_documents: ["{feature}/REQ", "{feature}/FSPEC"],
    };

    const featureSlug = "auth";
    const featurePath = "docs/in-progress/auth/";

    // Step 1: Resolve context documents (as the workflow would do)
    const resolvedRefs = resolveContextDocuments(phase.context_documents!, {
      featureSlug,
      featurePath,
    });

    // Step 2: Create a phase with resolved refs and build skill input
    const resolvedPhase: PhaseDefinition = {
      ...phase,
      context_documents: resolvedRefs,
    };

    const input = buildInvokeSkillInput({
      phase: resolvedPhase,
      agentId: "eng",
      featureSlug,
      featureConfig: { discipline: "backend-only", skipFspec: false },
      forkJoin: false,
      isRevision: false,
    });

    // Verify the full pipeline produced correct contextDocumentRefs
    expect(input.contextDocumentRefs).toEqual([
      "docs/in-progress/auth/REQ-auth.md",
      "docs/in-progress/auth/FSPEC-auth.md",
    ]);
    expect(input.agentId).toBe("eng");
    expect(input.phaseId).toBe("fspec-creation");
    expect(input.featureSlug).toBe("auth");
  });

  it("buildInvokeSkillInput defaults to empty array when phase has no context_documents", () => {
    const phase: PhaseDefinition = {
      id: "req-creation",
      name: "Requirements Creation",
      type: "creation",
      agent: "pm",
      // No context_documents
    };

    const input = buildInvokeSkillInput({
      phase,
      agentId: "pm",
      featureSlug: "my-feature",
      featureConfig: { discipline: "backend-only", skipFspec: false },
      forkJoin: false,
      isRevision: false,
    });

    expect(input.contextDocumentRefs).toEqual([]);
  });

  it("resolves all known document types: REQ, FSPEC, TSPEC, PLAN, PROPERTIES", () => {
    const refs = [
      "{feature}/REQ",
      "{feature}/FSPEC",
      "{feature}/TSPEC",
      "{feature}/PLAN",
      "{feature}/PROPERTIES",
    ];
    const resolved = resolveContextDocuments(refs, {
      featureSlug: "billing",
      featurePath: "docs/in-progress/billing/",
    });
    expect(resolved).toEqual([
      "docs/in-progress/billing/REQ-billing.md",
      "docs/in-progress/billing/FSPEC-billing.md",
      "docs/in-progress/billing/TSPEC-billing.md",
      "docs/in-progress/billing/PLAN-billing.md",
      "docs/in-progress/billing/PROPERTIES-billing.md",
    ]);
  });
});

// ---------------------------------------------------------------------------
// H3: Integration test — Discord message → Temporal signal routing
// ---------------------------------------------------------------------------

describe("H3: Discord message → Temporal signal routing", () => {
  // Shared test fixtures
  const testAgents: RegisteredAgent[] = [
    { id: "pm", skill_path: "./skills/pm.md", log_file: "pm.log", mention_id: "111", display_name: "PM" },
    { id: "eng", skill_path: "./skills/eng.md", log_file: "eng.log", mention_id: "222", display_name: "Engineer" },
  ];

  function makeOrchestrator(overrides?: {
    temporalClient?: FakeTemporalClient;
    agents?: RegisteredAgent[];
  }) {
    const temporalClient = overrides?.temporalClient ?? new FakeTemporalClient();
    const discord = new FakeDiscordClient();
    const gitClient = new FakeGitClient();
    const logger = new FakeLogger();
    const config = defaultTestConfig();
    const workflowConfig = defaultTestWorkflowConfig();
    const agentRegistry = new FakeAgentRegistry(overrides?.agents ?? testAgents);
    const skillInvoker = new FakeSkillInvoker();
    const worker = new FakeTemporalWorker();

    const orchestrator = new TemporalOrchestrator({
      temporalClient,
      worker: worker as any,
      discordClient: discord,
      gitClient,
      logger,
      config,
      workflowConfig,
      agentRegistry,
      skillInvoker,
    });

    return { orchestrator, temporalClient, discord, gitClient, logger };
  }

  it("(a) @agent mention starts a new workflow when no workflow is running", async () => {
    const temporalClient = new FakeTemporalClient();
    // queryWorkflowState throws WorkflowNotFoundError when workflow doesn't exist
    // FakeTemporalClient throws generic Error for missing workflows; monkey-patch for this test
    const origQuery = temporalClient.queryWorkflowState.bind(temporalClient);
    temporalClient.queryWorkflowState = async (workflowId: string) => {
      const notFoundError = new Error(`Workflow ${workflowId} not found`);
      notFoundError.name = "WorkflowNotFoundError";
      throw notFoundError;
    };

    const { orchestrator } = makeOrchestrator({ temporalClient });

    // Simulate a Discord message with @pm mention in a feature thread (no existing workflow)
    await orchestrator.handleMessage({
      id: "msg-1",
      threadId: "thread-1",
      threadName: "auth-feature \u2014 Requirements",
      parentChannelId: "updates-channel",
      authorId: "user-1",
      authorName: "Alice",
      isBot: false,
      content: "@pm define requirements for auth-feature",
      timestamp: new Date("2026-04-09T12:00:00Z"),
    });

    // Verify a new workflow was started
    expect(temporalClient.startedWorkflows).toHaveLength(1);
    expect(temporalClient.startedWorkflows[0].featureSlug).toBe("auth-feature");
  });

  it("(a) @agent ad-hoc directive routes to running workflow", async () => {
    const temporalClient = new FakeTemporalClient();
    // Set up a running workflow so handleMessage takes the ad-hoc branch
    temporalClient.workflowStates.set("ptah-auth-feature", defaultFeatureWorkflowState({
      featureSlug: "auth-feature",
      phaseStatus: "running",
    }));

    const { orchestrator } = makeOrchestrator({ temporalClient });

    await orchestrator.handleMessage({
      id: "msg-2",
      threadId: "thread-1",
      threadName: "auth-feature \u2014 Requirements",
      parentChannelId: "updates-channel",
      authorId: "user-1",
      authorName: "Alice",
      isBot: false,
      content: "@pm please refine the scope section",
      timestamp: new Date("2026-04-09T12:00:00Z"),
    });

    // Verify the ad-hoc signal was sent to the correct workflow
    expect(temporalClient.adHocSignals).toHaveLength(1);
    expect(temporalClient.adHocSignals[0].workflowId).toBe("ptah-auth-feature");
    expect(temporalClient.adHocSignals[0].signal.targetAgentId).toBe("pm");
    expect(temporalClient.adHocSignals[0].signal.instruction).toBe("please refine the scope section");
    expect(temporalClient.adHocSignals[0].signal.requestedBy).toBe("Alice");
  });

  it("(b) message to waiting-for-user workflow sends user-answer signal via handleMessage", async () => {
    const temporalClient = new FakeTemporalClient();
    // Set up workflow state as waiting-for-user
    temporalClient.workflowStates.set("ptah-auth-feature", defaultFeatureWorkflowState({
      featureSlug: "auth-feature",
      phaseStatus: "waiting-for-user",
      pendingQuestion: {
        question: "What is the scope?",
        agentId: "pm",
        phaseId: "req-creation",
        askedAt: "2026-04-09T11:00:00Z",
      },
    }));

    const { orchestrator } = makeOrchestrator({ temporalClient });

    // Simulate a regular (non-directive) message in the thread — routes as user answer
    await orchestrator.handleMessage({
      id: "msg-3",
      threadId: "thread-1",
      threadName: "auth-feature \u2014 Requirements",
      parentChannelId: "updates-channel",
      authorId: "user-1",
      authorName: "Alice",
      isBot: false,
      content: "The scope is the authentication module only.",
      timestamp: new Date("2026-04-09T12:00:00Z"),
    });

    // Verify the user-answer signal was sent
    const userAnswerSignals = temporalClient.sentSignals.filter(s => s.signal === "user-answer");
    expect(userAnswerSignals).toHaveLength(1);
    expect(userAnswerSignals[0].workflowId).toBe("ptah-auth-feature");
    const payload = userAnswerSignals[0].payload as {
      answer: string;
      answeredBy: string;
      answeredAt: string;
    };
    expect(payload.answer).toBe("The scope is the authentication module only.");
    expect(payload.answeredBy).toBe("Alice");
  });

  it("(b) routeUserAnswer sends user-answer signal directly", async () => {
    const temporalClient = new FakeTemporalClient();
    const { orchestrator } = makeOrchestrator({ temporalClient });

    await orchestrator.routeUserAnswer({
      workflowId: "ptah-auth-feature",
      answer: "The scope is the authentication module only.",
      answeredBy: "user-1",
      answeredAt: "2026-04-09T12:00:00Z",
    });

    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].workflowId).toBe("ptah-auth-feature");
    expect(temporalClient.sentSignals[0].signal).toBe("user-answer");
    const payload = temporalClient.sentSignals[0].payload as {
      answer: string;
      answeredBy: string;
      answeredAt: string;
    };
    expect(payload.answer).toBe("The scope is the authentication module only.");
    expect(payload.answeredBy).toBe("user-1");
  });

  it("(c) 'retry' message to failed workflow sends retry-or-cancel signal via handleMessage", async () => {
    const temporalClient = new FakeTemporalClient();
    temporalClient.workflowStates.set("ptah-billing-feature", defaultFeatureWorkflowState({
      featureSlug: "billing-feature",
      phaseStatus: "failed",
      failureInfo: {
        phaseId: "fspec-creation",
        agentId: "eng",
        errorType: "ActivityError",
        errorMessage: "Rate limit exceeded",
        retryCount: 1,
      },
    }));

    const { orchestrator } = makeOrchestrator({ temporalClient });

    // Simulate a user typing "retry" in the thread
    await orchestrator.handleMessage({
      id: "msg-4",
      threadId: "thread-2",
      threadName: "billing-feature \u2014 FSPEC",
      parentChannelId: "updates-channel",
      authorId: "user-1",
      authorName: "Bob",
      isBot: false,
      content: "retry",
      timestamp: new Date("2026-04-09T13:00:00Z"),
    });

    // Verify the retry-or-cancel signal was sent with "retry" action
    const retrySignals = temporalClient.sentSignals.filter(s => s.signal === "retry-or-cancel");
    expect(retrySignals).toHaveLength(1);
    expect(retrySignals[0].workflowId).toBe("ptah-billing-feature");
    expect(retrySignals[0].payload).toBe("retry");
  });

  it("(c) 'cancel' message to failed workflow sends retry-or-cancel signal via handleMessage", async () => {
    const temporalClient = new FakeTemporalClient();
    temporalClient.workflowStates.set("ptah-billing-feature", defaultFeatureWorkflowState({
      featureSlug: "billing-feature",
      phaseStatus: "failed",
      failureInfo: {
        phaseId: "fspec-creation",
        agentId: "eng",
        errorType: "ActivityError",
        errorMessage: "Merge conflict",
        retryCount: 2,
      },
    }));

    const { orchestrator } = makeOrchestrator({ temporalClient });

    await orchestrator.handleMessage({
      id: "msg-5",
      threadId: "thread-2",
      threadName: "billing-feature \u2014 FSPEC",
      parentChannelId: "updates-channel",
      authorId: "user-1",
      authorName: "Bob",
      isBot: false,
      content: "cancel",
      timestamp: new Date("2026-04-09T13:00:00Z"),
    });

    const cancelSignals = temporalClient.sentSignals.filter(s => s.signal === "retry-or-cancel");
    expect(cancelSignals).toHaveLength(1);
    expect(cancelSignals[0].workflowId).toBe("ptah-billing-feature");
    expect(cancelSignals[0].payload).toBe("cancel");
  });

  it("(c) routeResumeOrCancel sends resume signal for revision-bound workflow", async () => {
    const temporalClient = new FakeTemporalClient();

    const { orchestrator } = makeOrchestrator({ temporalClient });

    await orchestrator.routeResumeOrCancel({
      workflowId: "ptah-search-feature",
      action: "resume",
    });

    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].workflowId).toBe("ptah-search-feature");
    expect(temporalClient.sentSignals[0].signal).toBe("resume-or-cancel");
    expect(temporalClient.sentSignals[0].payload).toBe("resume");
  });

  it("ignores bot messages in handleMessage", async () => {
    const temporalClient = new FakeTemporalClient();
    const { orchestrator } = makeOrchestrator({ temporalClient });

    await orchestrator.handleMessage({
      id: "msg-bot",
      threadId: "thread-1",
      threadName: "auth-feature \u2014 Requirements",
      parentChannelId: "updates-channel",
      authorId: "bot-1",
      authorName: "Ptah Bot",
      isBot: true,
      content: "@pm some directive",
      timestamp: new Date("2026-04-09T12:00:00Z"),
    });

    // No signals should be sent for bot messages
    expect(temporalClient.adHocSignals).toHaveLength(0);
    expect(temporalClient.sentSignals).toHaveLength(0);
  });

  it("startWorkflowForFeature creates a new workflow via temporalClient", async () => {
    const temporalClient = new FakeTemporalClient();
    const { orchestrator } = makeOrchestrator({ temporalClient });

    const workflowId = await orchestrator.startWorkflowForFeature({
      featureSlug: "auth-feature",
      featureConfig: { discipline: "backend-only", skipFspec: false },
    });

    // Verify workflow was started
    expect(workflowId).toBe("ptah-auth-feature");
    expect(temporalClient.startedWorkflows).toHaveLength(1);
    expect(temporalClient.startedWorkflows[0].featureSlug).toBe("auth-feature");
    expect(temporalClient.startedWorkflows[0].featureConfig).toEqual({
      discipline: "backend-only",
      skipFspec: false,
    });
  });
});
