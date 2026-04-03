import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @temporalio/worker before any imports that use it
vi.mock("@temporalio/worker", () => {
  const mockWorkerRun = vi.fn().mockResolvedValue(undefined);
  const mockWorkerShutdown = vi.fn().mockResolvedValue(undefined);

  const mockWorkerInstance = {
    run: mockWorkerRun,
    shutdown: mockWorkerShutdown,
  };

  const mockWorkerCreate = vi.fn().mockResolvedValue(mockWorkerInstance);

  const mockNativeConnectionConnect = vi.fn().mockResolvedValue({
    close: vi.fn().mockResolvedValue(undefined),
  });

  return {
    Worker: {
      create: mockWorkerCreate,
    },
    NativeConnection: {
      connect: mockNativeConnectionConnect,
    },
    _mockWorkerCreate: mockWorkerCreate,
    _mockWorkerInstance: mockWorkerInstance,
    _mockWorkerRun: mockWorkerRun,
    _mockWorkerShutdown: mockWorkerShutdown,
    _mockNativeConnectionConnect: mockNativeConnectionConnect,
  };
});

import {
  createTemporalWorker,
  type WorkerDeps,
} from "../../../src/temporal/worker.js";
import type { TemporalConfig } from "../../../src/types.js";

const workerModule = await import("@temporalio/worker") as any;

function makeTemporalConfig(overrides?: Partial<TemporalConfig>): TemporalConfig {
  return {
    address: "localhost:7233",
    namespace: "default",
    taskQueue: "ptah-main",
    worker: { maxConcurrentWorkflowTasks: 10, maxConcurrentActivities: 3 },
    retry: { maxAttempts: 3, initialIntervalSeconds: 30, backoffCoefficient: 2.0, maxIntervalSeconds: 600 },
    heartbeat: { intervalSeconds: 30, timeoutSeconds: 120 },
    ...overrides,
  };
}

function makeFakeWorkerDeps(configOverrides?: Partial<TemporalConfig>): WorkerDeps {
  return {
    config: {
      project: { name: "test-project" },
      agents: { active: ["pm"], skills: { pm: "skills/pm" }, model: "test", max_tokens: 100 },
      agentEntries: [{ id: "pm", skill_path: "skills/pm", log_file: "logs/pm.log", mention_id: "123" }],
      discord: {
        bot_token_env: "DISCORD_TOKEN",
        server_id: "123",
        channels: { updates: "u", questions: "q", debug: "d" },
        mention_user_id: "123",
      },
      temporal: makeTemporalConfig(configOverrides),
      orchestrator: {
        max_turns_per_thread: 5,
        pending_poll_seconds: 10,
        retry_attempts: 3,
      },
      git: { commit_prefix: "test", auto_commit: true },
      docs: { root: "docs", templates: "templates" },
    } as any,
    activities: {
      invokeSkill: vi.fn(),
      sendNotification: vi.fn(),
      mergeWorktree: vi.fn(),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any,
  };
}

describe("createTemporalWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // B3: Worker creation with NativeConnection
  // -------------------------------------------------------------------------
  it("connects to Temporal using NativeConnection with config address", async () => {
    const deps = makeFakeWorkerDeps();
    await createTemporalWorker(deps);

    expect(workerModule.NativeConnection.connect).toHaveBeenCalledWith(
      expect.objectContaining({ address: "localhost:7233" }),
    );
  });

  it("creates Worker with correct task queue from config", async () => {
    const deps = makeFakeWorkerDeps();
    await createTemporalWorker(deps);

    expect(workerModule.Worker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: "ptah-main",
      }),
    );
  });

  it("creates Worker with correct namespace from config", async () => {
    const deps = makeFakeWorkerDeps({ namespace: "custom-ns" });
    await createTemporalWorker(deps);

    expect(workerModule.Worker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "custom-ns",
      }),
    );
  });

  // -------------------------------------------------------------------------
  // B3: Configurable concurrency
  // -------------------------------------------------------------------------
  it("passes maxConcurrentWorkflowTaskExecutions from config", async () => {
    const deps = makeFakeWorkerDeps({
      worker: { maxConcurrentWorkflowTasks: 20, maxConcurrentActivities: 5 },
    });
    await createTemporalWorker(deps);

    expect(workerModule.Worker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        maxConcurrentWorkflowTaskExecutions: 20,
      }),
    );
  });

  it("passes maxConcurrentActivityTaskExecutions from config", async () => {
    const deps = makeFakeWorkerDeps({
      worker: { maxConcurrentWorkflowTasks: 10, maxConcurrentActivities: 7 },
    });
    await createTemporalWorker(deps);

    expect(workerModule.Worker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        maxConcurrentActivityTaskExecutions: 7,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // B3: Activity closure injection
  // -------------------------------------------------------------------------
  it("passes activities to Worker.create", async () => {
    const deps = makeFakeWorkerDeps();
    await createTemporalWorker(deps);

    expect(workerModule.Worker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        activities: deps.activities,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // B3: Workflow registration
  // -------------------------------------------------------------------------
  it("registers workflow module path via workflowsPath", async () => {
    const deps = makeFakeWorkerDeps();
    await createTemporalWorker(deps);

    expect(workerModule.Worker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowsPath: expect.stringContaining("feature-lifecycle"),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // B3: Return value
  // -------------------------------------------------------------------------
  it("returns the created Worker instance", async () => {
    const deps = makeFakeWorkerDeps();
    const worker = await createTemporalWorker(deps);

    expect(worker).toBe(workerModule._mockWorkerInstance);
  });

  // -------------------------------------------------------------------------
  // B3: Custom task queue
  // -------------------------------------------------------------------------
  it("uses custom task queue from config", async () => {
    const deps = makeFakeWorkerDeps({ taskQueue: "custom-queue" });
    await createTemporalWorker(deps);

    expect(workerModule.Worker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: "custom-queue",
      }),
    );
  });

  // -------------------------------------------------------------------------
  // B3: Connection failure
  // -------------------------------------------------------------------------
  it("propagates NativeConnection errors", async () => {
    workerModule.NativeConnection.connect.mockRejectedValueOnce(
      new Error("Connection refused"),
    );

    const deps = makeFakeWorkerDeps();
    await expect(createTemporalWorker(deps)).rejects.toThrow("Connection refused");
  });
});
