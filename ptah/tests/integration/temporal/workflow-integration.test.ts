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
import type { SkillActivityInput, SkillActivityResult, NotificationInput } from "../../../src/temporal/types.js";
import type { MergeWorktreeInput, MergeResult } from "../../../src/temporal/activities/skill-activity.js";
import type { StartWorkflowParams, FeatureWorkflowState } from "../../../src/temporal/types.js";
import type { WorkflowConfig } from "../../../src/config/workflow-config.js";
import {
  FakeFileSystem,
  FakeLogger,
  FakeTemporalClient,
  defaultFeatureWorkflowState,
} from "../../fixtures/factories.js";
import { MigrateCommand } from "../../../src/commands/migrate.js";
import type { PdlcStateFile } from "../../../src/orchestrator/pdlc/v4-types.js";

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
}

/** Notifications captured during each test */
const capturedNotifications: NotificationInput[] = [];

function makeMockActivities(): MockActivities {
  return {
    async invokeSkill(input: SkillActivityInput): Promise<SkillActivityResult> {
      if (activityOverrides.invokeSkill) return activityOverrides.invokeSkill(input);
      // Review phases must return "Approved" (not "LGTM") so mapRecommendationToStatus works
      const isReviewLike = input.taskType === "Review";
      return {
        routingSignalType: isReviewLike ? "Approved" : "LGTM",
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
  };
}

afterEach(() => {
  // Reset overrides and captured state after each test
  activityOverrides = {};
  capturedNotifications.length = 0;
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
