import { describe, it, expect, beforeEach } from "vitest";
import { TemporalOrchestrator, parseUserIntent } from "../../../src/orchestrator/temporal-orchestrator.js";
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
  defaultFeatureWorkflowState,
  createThreadMessage,
  makeRegisteredAgent,
} from "../../fixtures/factories.js";
import type { PtahConfig } from "../../../src/types.js";
import type { FeatureWorkflowState } from "../../../src/temporal/types.js";

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

    // Set up a running workflow for the "my-feature" slug used by ad-hoc tests
    temporalClient.workflowStates.set(
      "ptah-my-feature",
      defaultFeatureWorkflowState({ featureSlug: "my-feature", phaseStatus: "running" }),
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

// ---------------------------------------------------------------------------
// A4: FakeTemporalClient — queryWorkflowState (Map-based + global error injection)
// ---------------------------------------------------------------------------

describe("FakeTemporalClient.queryWorkflowState", () => {
  it("returns the state from the Map for a known workflow ID", async () => {
    const client = new FakeTemporalClient();
    const state = defaultFeatureWorkflowState({ featureSlug: "my-feature" });
    client.workflowStates.set("ptah-my-feature", state);

    const result = await client.queryWorkflowState("ptah-my-feature");
    expect(result).toEqual(state);
  });

  it("throws WorkflowNotFoundError when workflow ID is not in the Map", async () => {
    const client = new FakeTemporalClient();

    try {
      await client.queryWorkflowState("ptah-nonexistent");
      expect.fail("Expected queryWorkflowState to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe("WorkflowNotFoundError");
      expect((err as Error).message).toContain("ptah-nonexistent");
    }
  });

  it("throws global error when queryWorkflowStateError is set (overrides Map lookup)", async () => {
    const client = new FakeTemporalClient();
    const state = defaultFeatureWorkflowState({ featureSlug: "my-feature" });
    client.workflowStates.set("ptah-my-feature", state);

    const globalErr = new Error("Temporal server unreachable");
    client.queryWorkflowStateError = globalErr;

    await expect(client.queryWorkflowState("ptah-my-feature")).rejects.toThrow(
      "Temporal server unreachable",
    );
  });

  it("supports multiple workflows in the Map simultaneously", async () => {
    const client = new FakeTemporalClient();
    const state1 = defaultFeatureWorkflowState({ featureSlug: "feature-a" });
    const state2 = defaultFeatureWorkflowState({ featureSlug: "feature-b", phaseStatus: "completed" });
    client.workflowStates.set("ptah-feature-a", state1);
    client.workflowStates.set("ptah-feature-b", state2);

    const result1 = await client.queryWorkflowState("ptah-feature-a");
    const result2 = await client.queryWorkflowState("ptah-feature-b");
    expect(result1.featureSlug).toBe("feature-a");
    expect(result2.featureSlug).toBe("feature-b");
    expect(result2.phaseStatus).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// G1: parseUserIntent — pure function
// ---------------------------------------------------------------------------

describe("parseUserIntent", () => {
  it("returns 'retry' for message containing 'retry'", () => {
    expect(parseUserIntent("retry")).toBe("retry");
  });

  it("returns 'cancel' for message containing 'cancel'", () => {
    expect(parseUserIntent("cancel")).toBe("cancel");
  });

  it("returns 'resume' for message containing 'resume'", () => {
    expect(parseUserIntent("resume")).toBe("resume");
  });

  it("returns null when no keyword is found", () => {
    expect(parseUserIntent("what happened?")).toBeNull();
  });

  it("matches case-insensitively", () => {
    expect(parseUserIntent("Retry")).toBe("retry");
    expect(parseUserIntent("CANCEL")).toBe("cancel");
    expect(parseUserIntent("rEsUmE")).toBe("resume");
  });

  it("matches standalone words with word boundary", () => {
    expect(parseUserIntent("please retry")).toBe("retry");
    expect(parseUserIntent("can you retry?")).toBe("retry");
  });

  it("does not match substrings (retrying is not retry)", () => {
    expect(parseUserIntent("I'm retrying")).toBeNull();
    expect(parseUserIntent("cancellation")).toBeNull();
    expect(parseUserIntent("resumed")).toBeNull();
  });

  it("returns the first match by position when multiple keywords present", () => {
    expect(parseUserIntent("cancel first, then retry")).toBe("cancel");
    expect(parseUserIntent("retry and then cancel if it fails again")).toBe("retry");
  });

  it("matches keyword before punctuation", () => {
    expect(parseUserIntent("retry!")).toBe("retry");
    expect(parseUserIntent("do not retry!!")).toBe("retry");
  });
});

// ---------------------------------------------------------------------------
// G2: containsAgentMention — tested via handleMessage (Branch B)
// ---------------------------------------------------------------------------

describe("handleMessage — containsAgentMention (G2)", () => {
  let discord: FakeDiscordClient;
  let temporalClient: FakeTemporalClient;
  let logger: FakeLogger;
  let agentRegistry: FakeAgentRegistry;
  let gitClient: FakeGitClient;
  let orchestrator: TemporalOrchestrator;

  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });
  const engAgent = makeRegisteredAgent({ id: "eng", display_name: "Engineer" });

  beforeEach(() => {
    discord = new FakeDiscordClient();
    temporalClient = new FakeTemporalClient();
    logger = new FakeLogger();
    gitClient = new FakeGitClient();
    agentRegistry = new FakeAgentRegistry([pmAgent, engAgent]);
    orchestrator = new TemporalOrchestrator(
      makeDeps({ discordClient: discord, temporalClient, logger, agentRegistry, gitClient }),
    );
    // No workflow state set — triggers Branch B (no running workflow)
  });

  it("starts workflow when message contains @pm at the start", async () => {
    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.startedWorkflows).toHaveLength(1);
    expect(temporalClient.startedWorkflows[0].featureSlug).toBe("auth");
  });

  it("starts workflow when @agent appears in the middle of message", async () => {
    const msg = createThreadMessage({
      content: "Please start the requirements process @pm",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.startedWorkflows).toHaveLength(1);
  });

  it("ignores message without agent mention when no workflow exists", async () => {
    const msg = createThreadMessage({
      content: "let's start working on auth",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.startedWorkflows).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(0);
  });

  it("matches agent mention case-insensitively", async () => {
    const msg = createThreadMessage({
      content: "Hey @PM can you start?",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.startedWorkflows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// G3: startNewWorkflow — tested via handleMessage (Branch B)
// ---------------------------------------------------------------------------

describe("handleMessage — startNewWorkflow (G3)", () => {
  let discord: FakeDiscordClient;
  let temporalClient: FakeTemporalClient;
  let logger: FakeLogger;
  let agentRegistry: FakeAgentRegistry;
  let gitClient: FakeGitClient;
  let orchestrator: TemporalOrchestrator;

  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });

  beforeEach(() => {
    discord = new FakeDiscordClient();
    temporalClient = new FakeTemporalClient();
    logger = new FakeLogger();
    gitClient = new FakeGitClient();
    agentRegistry = new FakeAgentRegistry([pmAgent]);
    orchestrator = new TemporalOrchestrator(
      makeDeps({ discordClient: discord, temporalClient, logger, agentRegistry, gitClient }),
    );
  });

  it("starts workflow with default featureConfig and posts confirmation", async () => {
    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.startedWorkflows).toHaveLength(1);
    const params = temporalClient.startedWorkflows[0];
    expect(params.featureSlug).toBe("auth");
    expect(params.featureConfig).toEqual({
      discipline: "fullstack",
      skipFspec: false,
      useTechLead: false,
    });

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toBe("Started workflow ptah-auth for auth");
  });

  it("posts notice when workflow already running (WorkflowExecutionAlreadyStartedError)", async () => {
    const err = new Error("already started");
    err.name = "WorkflowExecutionAlreadyStartedError";
    temporalClient.startWorkflowError = err;

    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toBe("Workflow already running for auth");
  });

  it("posts error when workflow start fails with unexpected error", async () => {
    temporalClient.startWorkflowError = new Error("Temporal unreachable");

    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toBe(
      "Failed to start workflow for auth. Please try again.",
    );
  });
});

// ---------------------------------------------------------------------------
// G4: handleStateDependentRouting — user-answer routing (waiting-for-user)
// ---------------------------------------------------------------------------

describe("handleMessage — user-answer routing (G4)", () => {
  let discord: FakeDiscordClient;
  let temporalClient: FakeTemporalClient;
  let logger: FakeLogger;
  let agentRegistry: FakeAgentRegistry;
  let orchestrator: TemporalOrchestrator;

  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });

  beforeEach(() => {
    discord = new FakeDiscordClient();
    temporalClient = new FakeTemporalClient();
    logger = new FakeLogger();
    agentRegistry = new FakeAgentRegistry([pmAgent]);
    orchestrator = new TemporalOrchestrator(
      makeDeps({ discordClient: discord, temporalClient, logger, agentRegistry }),
    );
  });

  it("routes user message as user-answer signal when workflow is waiting-for-user", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "waiting-for-user" }),
    );

    const msg = createThreadMessage({
      content: "Use JWT tokens for authentication",
      threadName: "auth — define requirements",
      threadId: "thread-1",
      authorName: "Alice",
      timestamp: new Date("2026-04-08T10:00:00Z"),
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(1);
    const signal = temporalClient.sentSignals[0];
    expect(signal.workflowId).toBe("ptah-auth");
    expect(signal.signal).toBe("user-answer");
    expect((signal.payload as { answer: string }).answer).toBe(
      "Use JWT tokens for authentication",
    );
    expect((signal.payload as { answeredBy: string }).answeredBy).toBe("Alice");
  });

  it("does not post confirmation after delivering answer (BR-DR-08)", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "waiting-for-user" }),
    );

    const msg = createThreadMessage({
      content: "yes, proceed",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    // No Discord messages posted (answer is delivered silently)
    expect(discord.postPlainMessageCalls).toHaveLength(0);
  });

  it("posts error when user-answer signal delivery fails", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "waiting-for-user" }),
    );
    temporalClient.signalError = new Error("signal failed");

    const msg = createThreadMessage({
      content: "yes, proceed",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toBe(
      "Failed to deliver answer. Please try again.",
    );
  });

  it("silently ignores non-ad-hoc messages when workflow is in running state (BR-DR-09)", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "running" }),
    );

    const msg = createThreadMessage({
      content: "Just checking on progress",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G5: handleIntentRouting — retry/cancel/resume with state-action validation
// ---------------------------------------------------------------------------

describe("handleMessage — intent routing (G5)", () => {
  let discord: FakeDiscordClient;
  let temporalClient: FakeTemporalClient;
  let logger: FakeLogger;
  let agentRegistry: FakeAgentRegistry;
  let orchestrator: TemporalOrchestrator;

  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });

  beforeEach(() => {
    discord = new FakeDiscordClient();
    temporalClient = new FakeTemporalClient();
    logger = new FakeLogger();
    agentRegistry = new FakeAgentRegistry([pmAgent]);
    orchestrator = new TemporalOrchestrator(
      makeDeps({ discordClient: discord, temporalClient, logger, agentRegistry }),
    );
  });

  it("sends retry-or-cancel signal with action 'retry' when workflow is failed", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "failed" }),
    );

    const msg = createThreadMessage({
      content: "retry",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].signal).toBe("retry-or-cancel");
    expect(temporalClient.sentSignals[0].payload).toBe("retry");
  });

  it("sends retry-or-cancel signal with action 'cancel' when workflow is failed", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "failed" }),
    );

    const msg = createThreadMessage({
      content: "CANCEL",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].signal).toBe("retry-or-cancel");
    expect(temporalClient.sentSignals[0].payload).toBe("cancel");
  });

  it("sends resume-or-cancel signal with action 'resume' when workflow is revision-bound-reached", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "revision-bound-reached" }),
    );

    const msg = createThreadMessage({
      content: "resume",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].signal).toBe("resume-or-cancel");
    expect(temporalClient.sentSignals[0].payload).toBe("resume");
  });

  it("sends resume-or-cancel signal with action 'cancel' when workflow is revision-bound-reached", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "revision-bound-reached" }),
    );

    const msg = createThreadMessage({
      content: "cancel",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].signal).toBe("resume-or-cancel");
    expect(temporalClient.sentSignals[0].payload).toBe("cancel");
  });

  it("posts hint when 'resume' is used in failed state (invalid action)", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "failed" }),
    );

    const msg = createThreadMessage({
      content: "resume",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toBe(
      "Workflow is in failed state. Use 'retry' to re-execute or 'cancel' to abort.",
    );
  });

  it("posts hint when 'retry' is used in revision-bound-reached state (invalid action)", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "revision-bound-reached" }),
    );

    const msg = createThreadMessage({
      content: "retry",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toBe(
      "Workflow reached revision bound. Use 'resume' to continue or 'cancel' to abort.",
    );
  });

  it("silently ignores messages without intent keywords in failed state", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "failed" }),
    );

    const msg = createThreadMessage({
      content: "what happened? show me the error",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(0);
  });

  it("posts ack after successful signal delivery", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "failed" }),
    );

    const msg = createThreadMessage({
      content: "retry",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toBe(
      "Sent retry signal to workflow ptah-auth",
    );
  });

  it("posts error when signal delivery fails", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "failed" }),
    );
    temporalClient.signalError = new Error("Temporal unreachable");

    const msg = createThreadMessage({
      content: "retry",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(discord.postPlainMessageCalls).toHaveLength(1);
    expect(discord.postPlainMessageCalls[0].content).toBe(
      "Failed to send retry signal. Please try again.",
    );
  });

  it("logs warning but does not fail when ack post fails after successful signal (BR-DR-14)", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "failed" }),
    );
    discord.postPlainMessageError = new Error("Discord down");

    const msg = createThreadMessage({
      content: "retry",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    // Signal was still sent
    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].signal).toBe("retry-or-cancel");

    // Warning was logged
    const warnings = logger.entriesAt("WARN");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("matches case-insensitive 'Please Retry' as retry intent", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "failed" }),
    );

    const msg = createThreadMessage({
      content: "Please Retry",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].signal).toBe("retry-or-cancel");
    expect(temporalClient.sentSignals[0].payload).toBe("retry");
  });
});

// ---------------------------------------------------------------------------
// G6: handleMessage restructure — workflow existence check first
// ---------------------------------------------------------------------------

describe("handleMessage — workflow existence check first (G6)", () => {
  let discord: FakeDiscordClient;
  let temporalClient: FakeTemporalClient;
  let logger: FakeLogger;
  let agentRegistry: FakeAgentRegistry;
  let gitClient: FakeGitClient;
  let orchestrator: TemporalOrchestrator;

  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });
  const engAgent = makeRegisteredAgent({ id: "eng", display_name: "Engineer" });

  beforeEach(() => {
    discord = new FakeDiscordClient();
    temporalClient = new FakeTemporalClient();
    logger = new FakeLogger();
    gitClient = new FakeGitClient();
    agentRegistry = new FakeAgentRegistry([pmAgent, engAgent]);
    orchestrator = new TemporalOrchestrator(
      makeDeps({ discordClient: discord, temporalClient, logger, agentRegistry, gitClient }),
    );
  });

  it("routes @pm as ad-hoc when workflow IS running (Branch A)", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "running" }),
    );

    const msg = createThreadMessage({
      content: "@pm address feedback from review",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    // Should be dispatched as ad-hoc, not as new workflow start
    expect(temporalClient.adHocSignals).toHaveLength(1);
    expect(temporalClient.startedWorkflows).toHaveLength(0);
  });

  it("starts new workflow when no workflow exists and @pm is mentioned (Branch B)", async () => {
    // No workflow state set — triggers Branch B
    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.startedWorkflows).toHaveLength(1);
    expect(temporalClient.adHocSignals).toHaveLength(0);
  });

  it("routes user-answer in waiting-for-user state, not ad-hoc parse", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "waiting-for-user" }),
    );

    // Non-directive message
    const msg = createThreadMessage({
      content: "Use JWT tokens",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.sentSignals).toHaveLength(1);
    expect(temporalClient.sentSignals[0].signal).toBe("user-answer");
  });

  it("ad-hoc takes priority over state-dependent routing in waiting-for-user", async () => {
    temporalClient.workflowStates.set(
      "ptah-auth",
      defaultFeatureWorkflowState({ featureSlug: "auth", phaseStatus: "waiting-for-user" }),
    );

    // Message that IS an ad-hoc directive
    const msg = createThreadMessage({
      content: "@pm address feedback from review",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    // Should be dispatched as ad-hoc, not user-answer
    expect(temporalClient.adHocSignals).toHaveLength(1);
    expect(temporalClient.sentSignals.filter((s) => s.signal === "user-answer")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G7: handleMessage — fail-silent on Temporal query failure
// ---------------------------------------------------------------------------

describe("handleMessage — fail-silent on Temporal query failure (G7)", () => {
  let discord: FakeDiscordClient;
  let temporalClient: FakeTemporalClient;
  let logger: FakeLogger;
  let agentRegistry: FakeAgentRegistry;
  let orchestrator: TemporalOrchestrator;

  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });

  beforeEach(() => {
    discord = new FakeDiscordClient();
    temporalClient = new FakeTemporalClient();
    logger = new FakeLogger();
    agentRegistry = new FakeAgentRegistry([pmAgent]);
    orchestrator = new TemporalOrchestrator(
      makeDeps({ discordClient: discord, temporalClient, logger, agentRegistry }),
    );
  });

  it("fails silently when Temporal query throws non-WorkflowNotFoundError", async () => {
    temporalClient.queryWorkflowStateError = new Error("Temporal server unreachable");

    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    // No signals sent, no workflows started, no Discord messages posted
    expect(temporalClient.sentSignals).toHaveLength(0);
    expect(temporalClient.startedWorkflows).toHaveLength(0);
    expect(discord.postPlainMessageCalls).toHaveLength(0);

    // Warning was logged
    const warnings = logger.entriesAt("WARN");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.message.includes("Temporal query failed"))).toBe(true);
  });

  it("does not fail-silent on WorkflowNotFoundError (goes to Branch B)", async () => {
    // No workflow state set → WorkflowNotFoundError → Branch B
    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "auth — define requirements",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    // Should have started a workflow (Branch B, agent mention detected)
    expect(temporalClient.startedWorkflows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PROP-DR-24: Edge-case slug handling
// ---------------------------------------------------------------------------

describe("handleMessage — degenerate thread name slug handling (PROP-DR-24)", () => {
  let discord: FakeDiscordClient;
  let temporalClient: FakeTemporalClient;
  let logger: FakeLogger;
  let agentRegistry: FakeAgentRegistry;
  let orchestrator: TemporalOrchestrator;

  const pmAgent = makeRegisteredAgent({ id: "pm", display_name: "PM" });

  beforeEach(() => {
    discord = new FakeDiscordClient();
    temporalClient = new FakeTemporalClient();
    logger = new FakeLogger();
    agentRegistry = new FakeAgentRegistry([pmAgent]);
    orchestrator = new TemporalOrchestrator(
      makeDeps({ discordClient: discord, temporalClient, logger, agentRegistry }),
    );
  });

  it("uses 'unnamed' fallback slug when thread name is all special characters", async () => {
    // featureNameToSlug("---") → "unnamed" (fallback), so workflow ID = "ptah-unnamed"
    // The empty-slug guard in handleMessage is defensive; featureNameToSlug never
    // returns empty. This test verifies the observable behavior with degenerate input.
    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "--- — some task",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    // Should start a workflow with the fallback slug "unnamed"
    expect(temporalClient.startedWorkflows).toHaveLength(1);
    expect(temporalClient.startedWorkflows[0].featureSlug).toBe("unnamed");
  });

  it("uses 'unnamed' fallback slug when thread name is empty", async () => {
    const msg = createThreadMessage({
      content: "@pm define requirements",
      threadName: "",
      threadId: "thread-1",
    });
    await orchestrator.handleMessage(msg);

    expect(temporalClient.startedWorkflows).toHaveLength(1);
    expect(temporalClient.startedWorkflows[0].featureSlug).toBe("unnamed");
  });
});
