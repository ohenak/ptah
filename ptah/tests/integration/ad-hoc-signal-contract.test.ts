/**
 * Integration Test: Ad-Hoc Signal Contract
 *
 * Verifies the contract between three layers:
 *   1. TemporalOrchestrator.handleMessage() — constructs workflow ID and signal payload
 *   2. TemporalClientWrapper.signalAdHocRevision() — sends "ad-hoc-revision" signal
 *   3. featureLifecycleWorkflow — defines wf.defineSignal("ad-hoc-revision")
 *
 * This is NOT an E2E test requiring a real Temporal server. It uses
 * FakeTemporalClient to capture signal calls and verifies:
 *   - Deterministic workflow ID format: ptah-{featureSlug}
 *   - Signal payload shape: { targetAgentId, instruction, requestedBy, requestedAt }
 *   - Signal name consistency: "ad-hoc-revision" across client and workflow
 *
 * Phase J, Task 54
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TemporalOrchestrator } from "../../src/orchestrator/temporal-orchestrator.js";
import type { TemporalOrchestratorDeps } from "../../src/orchestrator/temporal-orchestrator.js";
import { DefaultAgentRegistry } from "../../src/orchestrator/agent-registry.js";
import {
  FakeTemporalClient,
  FakeTemporalWorker,
  FakeDiscordClient,
  FakeLogger,
  FakeSkillInvoker,
  FakeGitClient,
  defaultTestConfig,
  defaultTestWorkflowConfig,
  createThreadMessage,
  makeRegisteredAgent,
} from "../fixtures/factories.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<TemporalOrchestratorDeps>): TemporalOrchestratorDeps {
  return {
    temporalClient: new FakeTemporalClient(),
    worker: new FakeTemporalWorker() as unknown as TemporalOrchestratorDeps["worker"],
    discordClient: new FakeDiscordClient(),
    logger: new FakeLogger(),
    config: defaultTestConfig(),
    workflowConfig: defaultTestWorkflowConfig(),
    agentRegistry: new DefaultAgentRegistry([]),
    skillInvoker: new FakeSkillInvoker(),
    gitClient: new FakeGitClient(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Contract Tests
// ---------------------------------------------------------------------------

describe("Ad-Hoc Signal Contract (Integration)", () => {
  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });
  const engAgent = makeRegisteredAgent({ id: "eng", display_name: "Engineer" });

  let temporalClient: FakeTemporalClient;
  let discord: FakeDiscordClient;
  let orchestrator: TemporalOrchestrator;

  beforeEach(() => {
    temporalClient = new FakeTemporalClient();
    discord = new FakeDiscordClient();

    // Phase G restructured handleMessage() to check workflow existence first.
    // Ad-hoc directives are only processed when a workflow IS running (Branch A).
    // Set up a running workflow state so queryWorkflowState succeeds.
    temporalClient.workflowStates.set("ptah-my-feature", {
      featureSlug: "my-feature",
      featureConfig: { discipline: "backend-only", skipFspec: false },
      workflowConfig: defaultTestWorkflowConfig(),
      currentPhaseId: "req-creation",
      completedPhaseIds: [],
      activeAgentIds: [],
      phaseStatus: "running",
      reviewStates: {},
      forkJoinState: null,
    });


    // Use the real DefaultAgentRegistry (not FakeAgentRegistry) to verify
    // the orchestrator works with the production registry implementation.
    const agentRegistry = new DefaultAgentRegistry([pmAgent, engAgent]);

    orchestrator = new TemporalOrchestrator(
      makeDeps({
        temporalClient,
        discordClient: discord,
        agentRegistry,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Contract 1: Deterministic workflow ID
  // -------------------------------------------------------------------------

  it("startFeatureWorkflow returns deterministic ID ptah-{featureSlug}", async () => {
    const workflowId = await orchestrator.startWorkflowForFeature({
      featureSlug: "my-feature",
      featureConfig: { discipline: "backend-only", skipFspec: false },
    });

    expect(workflowId).toBe("ptah-my-feature");
  });

  it("handleMessage constructs the same ptah-{featureSlug} ID for signal dispatch", async () => {
    const msg = createThreadMessage({
      content: "@pm address feedback from review",
      threadName: "my-feature \u2014 define requirements",
      authorName: "Alice",
      timestamp: new Date("2026-04-06T10:00:00Z"),
    });

    await orchestrator.handleMessage(msg);

    expect(temporalClient.adHocSignals).toHaveLength(1);
    expect(temporalClient.adHocSignals[0].workflowId).toBe("ptah-my-feature");
  });

  it("workflow ID from startFeatureWorkflow matches ID used by handleMessage", async () => {
    // Step 1: Start a workflow and capture the ID
    const workflowId = await orchestrator.startWorkflowForFeature({
      featureSlug: "my-feature",
      featureConfig: { discipline: "backend-only", skipFspec: false },
    });

    // Step 2: Send an ad-hoc message for the same feature
    const msg = createThreadMessage({
      content: "@pm some instruction",
      threadName: "my-feature \u2014 define requirements",
      authorName: "Bob",
      timestamp: new Date("2026-04-06T11:00:00Z"),
    });

    await orchestrator.handleMessage(msg);

    // Step 3: Verify the signal targets the same workflow ID
    expect(temporalClient.adHocSignals).toHaveLength(1);
    expect(temporalClient.adHocSignals[0].workflowId).toBe(workflowId);
  });

  // -------------------------------------------------------------------------
  // Contract 2: AdHocRevisionSignal payload shape
  // -------------------------------------------------------------------------

  it("signal payload contains all required fields with correct types", async () => {
    const msg = createThreadMessage({
      content: "@pm address feedback from CROSS-REVIEW-engineer-REQ.md",
      threadName: "my-feature \u2014 define requirements",
      authorName: "Alice",
      timestamp: new Date("2026-04-06T10:30:00Z"),
    });

    await orchestrator.handleMessage(msg);

    expect(temporalClient.adHocSignals).toHaveLength(1);
    const { signal } = temporalClient.adHocSignals[0];

    // Verify all four fields exist and have the correct types
    expect(signal).toHaveProperty("targetAgentId");
    expect(signal).toHaveProperty("instruction");
    expect(signal).toHaveProperty("requestedBy");
    expect(signal).toHaveProperty("requestedAt");

    expect(typeof signal.targetAgentId).toBe("string");
    expect(typeof signal.instruction).toBe("string");
    expect(typeof signal.requestedBy).toBe("string");
    expect(typeof signal.requestedAt).toBe("string");

    // Verify correct values
    expect(signal.targetAgentId).toBe("pm");
    expect(signal.instruction).toBe(
      "address feedback from CROSS-REVIEW-engineer-REQ.md",
    );
    expect(signal.requestedBy).toBe("Alice");
    expect(signal.requestedAt).toBe("2026-04-06T10:30:00.000Z");
  });

  it("requestedAt is a valid ISO 8601 timestamp", async () => {
    const msg = createThreadMessage({
      content: "@eng update TSPEC",
      threadName: "my-feature \u2014 define requirements",
      authorName: "Bob",
      timestamp: new Date("2026-04-06T14:25:30.123Z"),
    });

    await orchestrator.handleMessage(msg);

    const { signal } = temporalClient.adHocSignals[0];
    // Verify the timestamp round-trips through ISO 8601
    const parsed = new Date(signal.requestedAt);
    expect(parsed.toISOString()).toBe(signal.requestedAt);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Contract 3: Signal name consistency
  // -------------------------------------------------------------------------

  it("signal is recorded as 'ad-hoc-revision' in sentSignals", async () => {
    const msg = createThreadMessage({
      content: "@pm fix the requirements",
      threadName: "my-feature \u2014 define requirements",
      authorName: "Alice",
      timestamp: new Date("2026-04-06T10:00:00Z"),
    });

    await orchestrator.handleMessage(msg);

    // FakeTemporalClient records the signal name in sentSignals
    const adHocEntries = temporalClient.sentSignals.filter(
      (s) => s.signal === "ad-hoc-revision",
    );
    expect(adHocEntries).toHaveLength(1);
    expect(adHocEntries[0].workflowId).toBe("ptah-my-feature");
  });

  // -------------------------------------------------------------------------
  // End-to-end scenario: start workflow then send ad-hoc message
  // -------------------------------------------------------------------------

  it("full flow: start workflow, send @pm message, verify ID match and payload", async () => {
    // 1. Start a workflow for feature "my-feature"
    const workflowId = await orchestrator.startWorkflowForFeature({
      featureSlug: "my-feature",
      featureConfig: { discipline: "backend-only", skipFspec: false },
    });
    expect(workflowId).toBe("ptah-my-feature");

    // 2. Send an @pm ad-hoc message
    const msg = createThreadMessage({
      content: "@pm update the requirements based on stakeholder feedback",
      threadName: "my-feature \u2014 define requirements",
      authorName: "Charlie",
      timestamp: new Date("2026-04-06T15:00:00Z"),
    });

    await orchestrator.handleMessage(msg);

    // 3. Verify signal was sent to the correct workflow with correct payload
    expect(temporalClient.adHocSignals).toHaveLength(1);
    const { workflowId: signalTarget, signal } = temporalClient.adHocSignals[0];

    expect(signalTarget).toBe(workflowId);
    expect(signal.targetAgentId).toBe("pm");
    expect(signal.instruction).toBe(
      "update the requirements based on stakeholder feedback",
    );
    expect(signal.requestedBy).toBe("Charlie");
    expect(signal.requestedAt).toBe("2026-04-06T15:00:00.000Z");

    // 4. Verify Discord acknowledgement was posted
    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toContain("Dispatching @pm");
  });
});
