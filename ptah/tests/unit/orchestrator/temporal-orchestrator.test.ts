import { describe, it, expect, beforeEach } from "vitest";
import { TemporalOrchestrator } from "../../../src/orchestrator/temporal-orchestrator.js";
import type { TemporalOrchestratorDeps } from "../../../src/orchestrator/temporal-orchestrator.js";
import {
  FakeTemporalClient,
  FakeTemporalWorker,
  FakeDiscordClient,
  FakeLogger,
  FakeSkillInvoker,
  FakeAgentRegistry,
  FakeGitClient,
  defaultTestConfig,
  defaultTestWorkflowConfig,
  createThreadMessage,
  makeRegisteredAgent,
} from "../../fixtures/factories.js";
import type { PtahConfig } from "../../../src/types.js";

function makeDeps(overrides?: Partial<TemporalOrchestratorDeps>): TemporalOrchestratorDeps {
  return {
    temporalClient: new FakeTemporalClient(),
    worker: new FakeTemporalWorker() as unknown as TemporalOrchestratorDeps["worker"],
    discordClient: new FakeDiscordClient(),
    logger: new FakeLogger(),
    config: defaultTestConfig(),
    workflowConfig: defaultTestWorkflowConfig(),
    agentRegistry: new FakeAgentRegistry(),
    skillInvoker: new FakeSkillInvoker(),
    gitClient: new FakeGitClient(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task 30: startWorkflowForFeature calls ensureBranchExists before starting workflow
// ---------------------------------------------------------------------------

describe("startWorkflowForFeature", () => {
  it("calls ensureBranchExists before starting workflow", async () => {
    const gitClient = new FakeGitClient();
    const temporalClient = new FakeTemporalClient();
    const deps = makeDeps({ gitClient, temporalClient });
    const orchestrator = new TemporalOrchestrator(deps);

    await orchestrator.startWorkflowForFeature({
      featureSlug: "my-feature",
      featureConfig: { discipline: "backend-only", skipFspec: false },
    });

    // ensureBranchExists was called with the feature branch name
    expect(gitClient.ensuredBranches).toContain("feat-my-feature");
    // and the workflow was started
    expect(temporalClient.startedWorkflows).toHaveLength(1);
    expect(temporalClient.startedWorkflows[0].featureSlug).toBe("my-feature");
  });

  it("does not start workflow if ensureBranchExists fails", async () => {
    const gitClient = new FakeGitClient();
    gitClient.ensureBranchExistsError = new Error("branch creation failed");
    const temporalClient = new FakeTemporalClient();
    const deps = makeDeps({ gitClient, temporalClient });
    const orchestrator = new TemporalOrchestrator(deps);

    await expect(
      orchestrator.startWorkflowForFeature({
        featureSlug: "my-feature",
        featureConfig: { discipline: "backend-only", skipFspec: false },
      }),
    ).rejects.toThrow("branch creation failed");

    expect(temporalClient.startedWorkflows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tasks 31-39: handleMessage
// ---------------------------------------------------------------------------

describe("handleMessage", () => {
  let discord: FakeDiscordClient;
  let temporalClient: FakeTemporalClient;
  let logger: FakeLogger;
  let agentRegistry: FakeAgentRegistry;
  let orchestrator: TemporalOrchestrator;

  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });
  const engAgent = makeRegisteredAgent({ id: "eng", display_name: "Engineer" });

  beforeEach(() => {
    discord = new FakeDiscordClient();
    temporalClient = new FakeTemporalClient();
    logger = new FakeLogger();
    agentRegistry = new FakeAgentRegistry([pmAgent, engAgent]);
    orchestrator = new TemporalOrchestrator(
      makeDeps({ discordClient: discord, temporalClient, logger, agentRegistry }),
    );
  });

  // Task 31: ignores bot messages
  it("ignores bot messages", async () => {
    const msg = createThreadMessage({ isBot: true, content: "@pm do something" });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.adHocSignals).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(0);
  });

  // Task 32: passes non-@-directive messages to existing handling
  it("returns without action for non-@-directive messages", async () => {
    const msg = createThreadMessage({ content: "just a normal message" });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.adHocSignals).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(0);
  });

  // Task 33: dispatches ad-hoc signal for known agent
  it("dispatches ad-hoc signal for known agent", async () => {
    const msg = createThreadMessage({
      content: "@pm address feedback from review",
      threadName: "my-feature — define requirements",
      authorName: "Alice",
      timestamp: new Date("2026-04-06T10:00:00Z"),
    });

    await orchestrator.handleMessage(msg);

    expect(temporalClient.adHocSignals).toHaveLength(1);
    const sent = temporalClient.adHocSignals[0];
    expect(sent.workflowId).toBe("ptah-my-feature");
    expect(sent.signal.targetAgentId).toBe("pm");
    expect(sent.signal.instruction).toBe("address feedback from review");
    expect(sent.signal.requestedBy).toBe("Alice");
    expect(sent.signal.requestedAt).toBe("2026-04-06T10:00:00.000Z");
  });

  // Task 34: posts ack after successful signal dispatch
  it("posts ack after successful signal dispatch", async () => {
    const msg = createThreadMessage({
      content: "@pm address feedback from review",
      threadName: "my-feature — define requirements",
      threadId: "thread-42",
    });

    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    const ack = discord.postPlainMessageCalls[0];
    expect(ack.threadId).toBe("thread-42");
    expect(ack.content).toBe("Dispatching @pm: address feedback from review");
  });

  // Task 35: posts error reply for unknown agent
  it("posts error reply for unknown agent", async () => {
    const msg = createThreadMessage({
      content: "@designer create a mockup",
      threadName: "my-feature — define requirements",
      threadId: "thread-42",
    });

    await orchestrator.handleMessage(msg);

    expect(temporalClient.adHocSignals).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(1);
    const reply = discord.postPlainMessageCalls[0];
    expect(reply.threadId).toBe("thread-42");
    expect(reply.content).toContain("Agent @designer is not part of the my-feature workflow");
    expect(reply.content).toContain("pm");
    expect(reply.content).toContain("eng");
  });

  // Task 36: posts error reply when workflow not found
  it("posts error reply when workflow not found", async () => {
    const err = new Error("Workflow not found");
    err.name = "WorkflowNotFoundError";
    temporalClient.signalAdHocRevisionError = err;

    const msg = createThreadMessage({
      content: "@pm fix the docs",
      threadName: "my-feature — define requirements",
      threadId: "thread-42",
    });

    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    const reply = discord.postPlainMessageCalls[0];
    expect(reply.threadId).toBe("thread-42");
    expect(reply.content).toBe("No active workflow found for my-feature.");
  });

  // Task 37: posts error reply on signal delivery failure
  it("posts error reply on signal delivery failure", async () => {
    temporalClient.signalAdHocRevisionError = new Error("network timeout");

    const msg = createThreadMessage({
      content: "@pm fix the docs",
      threadName: "my-feature — define requirements",
      threadId: "thread-42",
    });

    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    const reply = discord.postPlainMessageCalls[0];
    expect(reply.threadId).toBe("thread-42");
    expect(reply.content).toBe("Failed to dispatch to @pm. Please try again.");
  });

  // Task 38: truncates instruction in ack to 100 chars
  it("truncates instruction in ack to 100 chars", async () => {
    const longInstruction = "a".repeat(150);
    const msg = createThreadMessage({
      content: `@pm ${longInstruction}`,
      threadName: "my-feature — define requirements",
      threadId: "thread-42",
    });

    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    const ack = discord.postPlainMessageCalls[0];
    const truncated = "a".repeat(100);
    expect(ack.content).toBe(`Dispatching @pm: ${truncated}...`);
  });

  it("does not append ellipsis when instruction is 100 chars or less", async () => {
    const instruction = "a".repeat(100);
    const msg = createThreadMessage({
      content: `@pm ${instruction}`,
      threadName: "my-feature — define requirements",
      threadId: "thread-42",
    });

    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    const ack = discord.postPlainMessageCalls[0];
    expect(ack.content).toBe(`Dispatching @pm: ${instruction}`);
    expect(ack.content).not.toContain("...");
  });

  // Task 39: logs warning but does not throw when Discord ack post fails (BR-05)
  it("logs warning but does not throw when Discord ack post fails after successful signal dispatch", async () => {
    discord.postPlainMessageError = new Error("Discord API error");

    const msg = createThreadMessage({
      content: "@pm fix the docs",
      threadName: "my-feature — define requirements",
      threadId: "thread-42",
    });

    // Should not throw
    await orchestrator.handleMessage(msg);

    // Signal was still sent
    expect(temporalClient.adHocSignals).toHaveLength(1);

    // Warning was logged
    const warnings = logger.entriesAt("WARN");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.message.includes("ack") || w.message.includes("Discord"))).toBe(
      true,
    );
  });
});
