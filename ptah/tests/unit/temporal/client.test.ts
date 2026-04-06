import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @temporalio/client before any imports that use it
vi.mock("@temporalio/client", () => {
  const mockSignal = vi.fn().mockResolvedValue(undefined);
  const mockQuery = vi.fn().mockResolvedValue({
    featureSlug: "my-feature",
    currentPhaseId: "req-creation",
    phaseStatus: "running",
  });
  const mockResult = vi.fn().mockResolvedValue(undefined);
  const mockTerminate = vi.fn().mockResolvedValue(undefined);

  const mockHandle = {
    signal: mockSignal,
    query: mockQuery,
    result: mockResult,
    terminate: mockTerminate,
    workflowId: "ptah-feature-my-feature-1",
  };

  const mockStart = vi.fn().mockResolvedValue("ptah-feature-my-feature-1");
  const mockGetHandle = vi.fn().mockReturnValue(mockHandle);
  const mockList = vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      // empty by default
    },
  });

  const MockWorkflowClient = vi.fn().mockImplementation(() => ({
    start: mockStart,
    getHandle: mockGetHandle,
    list: mockList,
  }));

  const mockClose = vi.fn().mockResolvedValue(undefined);
  const MockConnection = {
    connect: vi.fn().mockResolvedValue({
      close: mockClose,
      _mockClose: mockClose,
    }),
  };

  return {
    Connection: MockConnection,
    WorkflowClient: MockWorkflowClient,
    _mockStart: mockStart,
    _mockGetHandle: mockGetHandle,
    _mockHandle: mockHandle,
    _mockSignal: mockSignal,
    _mockQuery: mockQuery,
    _mockList: mockList,
    _mockClose: mockClose,
    _MockWorkflowClient: MockWorkflowClient,
    _MockConnection: MockConnection,
  };
});

import {
  TemporalClientWrapperImpl,
} from "../../../src/temporal/client.js";
import type { TemporalConfig } from "../../../src/types.js";
import type { AdHocRevisionSignal, FeatureWorkflowState, StartWorkflowParams, UserAnswerSignal } from "../../../src/temporal/types.js";

// Access mock internals for assertions
const temporalClientModule = await import("@temporalio/client") as any;

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

describe("TemporalClientWrapperImpl", () => {
  let client: TemporalClientWrapperImpl;
  let config: TemporalConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = makeTemporalConfig();
    client = new TemporalClientWrapperImpl(config);
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  // -------------------------------------------------------------------------
  // PROP-NF-05: TLS configuration
  // -------------------------------------------------------------------------
  describe("TLS configuration (PROP-NF-05)", () => {
    it("connects without TLS when tls config is not provided", async () => {
      // Default config has no tls field
      await client.connect();

      expect(temporalClientModule.Connection.connect).toHaveBeenCalledWith(
        expect.objectContaining({ address: "localhost:7233" }),
      );
      // tls should be undefined or falsy when no TLS config is set
      const connectArg = temporalClientModule.Connection.connect.mock.calls[0][0];
      expect(connectArg.tls).toBeFalsy();
    });

    it("passes TLS config to Connection.connect when tls is provided", async () => {
      const tlsConfig = makeTemporalConfig({
        tls: {
          clientCertPath: "/path/to/cert.pem",
          clientKeyPath: "/path/to/key.pem",
          serverRootCACertPath: "/path/to/ca.pem",
        },
      });
      const tlsClient = new TemporalClientWrapperImpl(tlsConfig);

      await tlsClient.connect();

      const connectArg = temporalClientModule.Connection.connect.mock.calls[0][0];
      // TLS should be enabled when tls config is present
      expect(connectArg.tls).toBeDefined();
      expect(connectArg.tls).toBeTruthy();

      await tlsClient.disconnect();
    });

    it("does not add TLS config when tls is absent from TemporalConfig", async () => {
      // Ensure no tls field at all
      const noTlsConfig: TemporalConfig = {
        address: "localhost:7233",
        namespace: "default",
        taskQueue: "ptah-main",
        worker: { maxConcurrentWorkflowTasks: 10, maxConcurrentActivities: 3 },
        retry: { maxAttempts: 3, initialIntervalSeconds: 30, backoffCoefficient: 2.0, maxIntervalSeconds: 600 },
        heartbeat: { intervalSeconds: 30, timeoutSeconds: 120 },
        // No tls field
      };
      const noTlsClient = new TemporalClientWrapperImpl(noTlsConfig);

      await noTlsClient.connect();

      const connectArg = temporalClientModule.Connection.connect.mock.calls[0][0];
      // tls should be falsy / undefined
      expect(connectArg.tls).toBeFalsy();

      await noTlsClient.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // B1: connect, disconnect, isConnected
  // -------------------------------------------------------------------------
  describe("connect / disconnect / isConnected", () => {
    it("connects to Temporal server using config address and namespace", async () => {
      await client.connect();

      expect(temporalClientModule.Connection.connect).toHaveBeenCalledWith(
        expect.objectContaining({ address: "localhost:7233" }),
      );
      expect(temporalClientModule.WorkflowClient).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: "default" }),
      );
      expect(client.isConnected()).toBe(true);
    });

    it("isConnected returns false before connect", () => {
      expect(client.isConnected()).toBe(false);
    });

    it("disconnect closes connection and resets state", async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it("disconnect is safe to call when not connected", async () => {
      // Should not throw
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it("throws if connect fails", async () => {
      temporalClientModule.Connection.connect.mockRejectedValueOnce(
        new Error("Connection refused"),
      );

      await expect(client.connect()).rejects.toThrow("Connection refused");
      expect(client.isConnected()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // B1: startFeatureWorkflow (deterministic ID — REQ-MR-08)
  // -------------------------------------------------------------------------
  describe("startFeatureWorkflow", () => {
    const params: StartWorkflowParams = {
      featureSlug: "auth-feature",
      featureConfig: { discipline: "backend-only", skipFspec: false },
      workflowConfig: { version: 1, phases: [] },
    };

    beforeEach(async () => {
      await client.connect();
    });

    it("uses deterministic workflow ID ptah-{featureSlug}", async () => {
      const workflowId = await client.startFeatureWorkflow(params);

      expect(workflowId).toBe("ptah-auth-feature");
      expect(temporalClientModule._mockStart).toHaveBeenCalledWith(
        "featureLifecycleWorkflow",
        expect.objectContaining({
          workflowId: "ptah-auth-feature",
          taskQueue: "ptah-main",
        }),
      );
    });

    it("does not query existing workflows for sequencing", async () => {
      await client.startFeatureWorkflow(params);

      // listWorkflowsByPrefix should NOT be called — no sequence resolution
      expect(temporalClientModule._mockList).not.toHaveBeenCalled();
    });

    it("passes workflowConfig and featureConfig as workflow args", async () => {
      await client.startFeatureWorkflow(params);

      expect(temporalClientModule._mockStart).toHaveBeenCalledWith(
        "featureLifecycleWorkflow",
        expect.objectContaining({
          args: [expect.objectContaining({
            featureSlug: "auth-feature",
            featureConfig: params.featureConfig,
            workflowConfig: params.workflowConfig,
          })],
        }),
      );
    });

    it("passes startAtPhase when provided (migration)", async () => {
      const migrationParams: StartWorkflowParams = {
        ...params,
        startAtPhase: "tspec-creation",
      };

      await client.startFeatureWorkflow(migrationParams);

      expect(temporalClientModule._mockStart).toHaveBeenCalledWith(
        "featureLifecycleWorkflow",
        expect.objectContaining({
          args: [expect.objectContaining({
            startAtPhase: "tspec-creation",
          })],
        }),
      );
    });

    it("passes initialReviewState when provided (migration)", async () => {
      const migrationParams: StartWorkflowParams = {
        ...params,
        initialReviewState: {
          "req-review": { reviewerStatuses: { eng: "approved" }, revisionCount: 1 },
        },
      };

      await client.startFeatureWorkflow(migrationParams);

      expect(temporalClientModule._mockStart).toHaveBeenCalledWith(
        "featureLifecycleWorkflow",
        expect.objectContaining({
          args: [expect.objectContaining({
            initialReviewState: migrationParams.initialReviewState,
          })],
        }),
      );
    });

    it("throws if not connected", async () => {
      await client.disconnect();
      await expect(client.startFeatureWorkflow(params)).rejects.toThrow(
        /not connected/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // B2: signalUserAnswer
  // -------------------------------------------------------------------------
  describe("signalUserAnswer", () => {
    beforeEach(async () => {
      await client.connect();
    });

    it("sends user-answer signal to the workflow", async () => {
      const answer: UserAnswerSignal = {
        answer: "Use Google OAuth",
        answeredBy: "user123",
        answeredAt: "2026-04-02T10:00:00Z",
      };

      await client.signalUserAnswer("ptah-feature-auth-1", answer);

      expect(temporalClientModule._mockGetHandle).toHaveBeenCalledWith("ptah-feature-auth-1");
      expect(temporalClientModule._mockSignal).toHaveBeenCalledWith(
        "user-answer",
        answer,
      );
    });

    it("throws if not connected", async () => {
      await client.disconnect();
      await expect(
        client.signalUserAnswer("wf-1", { answer: "x", answeredBy: "u", answeredAt: "t" }),
      ).rejects.toThrow(/not connected/i);
    });
  });

  // -------------------------------------------------------------------------
  // B2: signalRetryOrCancel
  // -------------------------------------------------------------------------
  describe("signalRetryOrCancel", () => {
    beforeEach(async () => {
      await client.connect();
    });

    it("sends retry-or-cancel signal with 'retry' action", async () => {
      await client.signalRetryOrCancel("ptah-feature-auth-1", "retry");

      expect(temporalClientModule._mockSignal).toHaveBeenCalledWith(
        "retry-or-cancel",
        "retry",
      );
    });

    it("sends retry-or-cancel signal with 'cancel' action", async () => {
      await client.signalRetryOrCancel("ptah-feature-auth-1", "cancel");

      expect(temporalClientModule._mockSignal).toHaveBeenCalledWith(
        "retry-or-cancel",
        "cancel",
      );
    });
  });

  // -------------------------------------------------------------------------
  // B2: signalResumeOrCancel
  // -------------------------------------------------------------------------
  describe("signalResumeOrCancel", () => {
    beforeEach(async () => {
      await client.connect();
    });

    it("sends resume-or-cancel signal with 'resume' action", async () => {
      await client.signalResumeOrCancel("ptah-feature-auth-1", "resume");

      expect(temporalClientModule._mockSignal).toHaveBeenCalledWith(
        "resume-or-cancel",
        "resume",
      );
    });

    it("sends resume-or-cancel signal with 'cancel' action", async () => {
      await client.signalResumeOrCancel("ptah-feature-auth-1", "cancel");

      expect(temporalClientModule._mockSignal).toHaveBeenCalledWith(
        "resume-or-cancel",
        "cancel",
      );
    });
  });

  // -------------------------------------------------------------------------
  // B2: queryWorkflowState
  // -------------------------------------------------------------------------
  describe("queryWorkflowState", () => {
    beforeEach(async () => {
      await client.connect();
    });

    it("queries workflow state by workflow ID", async () => {
      const state = await client.queryWorkflowState("ptah-feature-auth-1");

      expect(temporalClientModule._mockGetHandle).toHaveBeenCalledWith("ptah-feature-auth-1");
      expect(temporalClientModule._mockQuery).toHaveBeenCalledWith("workflow-state");
      expect(state).toEqual(expect.objectContaining({
        featureSlug: "my-feature",
        currentPhaseId: "req-creation",
      }));
    });

    it("throws if not connected", async () => {
      await client.disconnect();
      await expect(
        client.queryWorkflowState("wf-1"),
      ).rejects.toThrow(/not connected/i);
    });
  });

  // -------------------------------------------------------------------------
  // B2: listWorkflowsByPrefix
  // -------------------------------------------------------------------------
  describe("listWorkflowsByPrefix", () => {
    beforeEach(async () => {
      await client.connect();
    });

    it("returns workflow IDs matching prefix", async () => {
      temporalClientModule._mockList.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield { workflowId: "ptah-feature-auth-1" };
          yield { workflowId: "ptah-feature-auth-2" };
        },
      });

      const ids = await client.listWorkflowsByPrefix("ptah-feature-auth");
      expect(ids).toEqual(["ptah-feature-auth-1", "ptah-feature-auth-2"]);
    });

    it("returns empty array when no workflows match", async () => {
      temporalClientModule._mockList.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          // empty
        },
      });

      const ids = await client.listWorkflowsByPrefix("ptah-feature-nonexistent");
      expect(ids).toEqual([]);
    });

    it("uses Temporal list with workflow ID prefix query", async () => {
      temporalClientModule._mockList.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {},
      });

      await client.listWorkflowsByPrefix("ptah-feature-auth");

      expect(temporalClientModule._mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining("ptah-feature-auth"),
        }),
      );
    });

    it("throws if not connected", async () => {
      await client.disconnect();
      await expect(
        client.listWorkflowsByPrefix("ptah-feature-auth"),
      ).rejects.toThrow(/not connected/i);
    });
  });

  // -------------------------------------------------------------------------
  // Phase D: signalAdHocRevision (REQ-MR-02)
  // -------------------------------------------------------------------------
  describe("signalAdHocRevision", () => {
    const adHocSignal: AdHocRevisionSignal = {
      targetAgentId: "eng",
      instruction: "Update the API endpoint to use POST instead of GET",
      requestedBy: "user123",
      requestedAt: "2026-04-06T12:00:00Z",
    };

    beforeEach(async () => {
      await client.connect();
    });

    it("sends ad-hoc-revision signal to the workflow handle", async () => {
      await client.signalAdHocRevision("ptah-auth-feature", adHocSignal);

      expect(temporalClientModule._mockGetHandle).toHaveBeenCalledWith("ptah-auth-feature");
      expect(temporalClientModule._mockSignal).toHaveBeenCalledWith(
        "ad-hoc-revision",
        adHocSignal,
      );
    });

    it("throws when workflow not found", async () => {
      temporalClientModule._mockGetHandle.mockImplementationOnce(() => {
        const error = new Error("Workflow not found");
        error.name = "WorkflowNotFoundError";
        throw error;
      });

      await expect(
        client.signalAdHocRevision("ptah-nonexistent", adHocSignal),
      ).rejects.toThrow("Workflow not found");
    });

    it("throws if not connected", async () => {
      await client.disconnect();
      await expect(
        client.signalAdHocRevision("ptah-auth-feature", adHocSignal),
      ).rejects.toThrow(/not connected/i);
    });
  });
});
