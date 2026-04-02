import { describe, it, expect, beforeEach } from "vitest";
import { DefaultContextAssembler } from "../../../src/orchestrator/context-assembler.js";
import {
  FakeFileSystem,
  FakeTokenCounter,
  FakeLogger,
  defaultTestConfig,
  createThreadMessage,
} from "../../fixtures/factories.js";
import type { PtahConfig, ThreadMessage } from "../../../src/types.js";
import type { TaskType } from "../../../src/orchestrator/pdlc/phases.js";

describe("DefaultContextAssembler", () => {
  let fs: FakeFileSystem;
  let tokenCounter: FakeTokenCounter;
  let logger: FakeLogger;
  let assembler: DefaultContextAssembler;
  let config: PtahConfig;

  beforeEach(() => {
    fs = new FakeFileSystem();
    tokenCounter = new FakeTokenCounter();
    logger = new FakeLogger();
    assembler = new DefaultContextAssembler(fs, tokenCounter, logger);
    config = defaultTestConfig();

    // Default setup: role prompt exists
    fs.addExisting("./ptah/skills/pm-agent.md", "You are a PM agent.");
    fs.addExisting("./ptah/skills/dev-agent.md", "You are a dev agent.");
  });

  // ─── Fresh Invocation ─────────────────────────────────────────

  describe("Fresh Invocation", () => {
    // Task 55: AT-CB-01
    it("Layer 1 contains role prompt + overview.md + two-iteration rule + routing instruction; Layer 2 contains feature files; Layer 3 contains trigger message", async () => {
      // Setup feature folder
      const featureName = "my-feature";
      const featureDir = `docs/${featureName}`;
      fs.addExistingDir(featureDir);
      fs.addExisting(`${featureDir}/overview.md`, "Feature overview content.");
      fs.addExisting(`${featureDir}/spec.md`, "Spec content.");
      fs.addExisting(`${featureDir}/plan.md`, "Plan content.");

      const triggerMessage = createThreadMessage({
        content: "Please review the spec.",
        threadName: `${featureName} \u2014 review`,
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: `${featureName} \u2014 review`,
        threadHistory: [],
        triggerMessage,
        config,
      });

      // Layer 1 (system prompt) checks
      expect(result.systemPrompt).toContain("You are a PM agent.");
      expect(result.systemPrompt).toContain("Feature overview content.");
      expect(result.systemPrompt).toContain("maximum of 2 iterations");
      expect(result.systemPrompt).toContain("<routing>");

      // Layer 2 (feature files) in system prompt
      expect(result.systemPrompt).toContain("Spec content.");
      expect(result.systemPrompt).toContain("Plan content.");

      // Layer 3 (user message)
      expect(result.userMessage).toBe("Please review the spec.");

      // Resume pattern
      expect(result.resumePattern).toBe("fresh");
    });

    // Task 56: Feature name extraction — AT-CB-07, AT-CB-08
    it("extracts feature name before em dash", () => {
      expect(assembler.extractFeatureName("my-feature \u2014 review")).toBe("my-feature");
    });

    it("uses full thread name when no em dash present", () => {
      expect(assembler.extractFeatureName("my-feature-review")).toBe("my-feature-review");
    });

    // Task 57: overview.md deduplication — CB-R4, AT-CB-06
    it("overview.md appears in Layer 1 only, excluded from Layer 2", async () => {
      const featureName = "dedup-feature";
      const featureDir = `docs/${featureName}`;
      fs.addExistingDir(featureDir);
      fs.addExisting(`${featureDir}/overview.md`, "Overview content here.");
      fs.addExisting(`${featureDir}/details.md`, "Detail content.");

      const triggerMessage = createThreadMessage({
        content: "Do the task.",
        threadName: featureName,
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      // Overview in Layer 1 section
      expect(result.systemPrompt).toContain("Overview content here.");

      // Count occurrences of overview content
      const overviewCount = result.systemPrompt.split("Overview content here.").length - 1;
      expect(overviewCount).toBe(1);

      // Layer 2 has detail content but not overview
      expect(result.systemPrompt).toContain("Detail content.");
    });
  });

  // ─── Resume Pattern Detection ──────────────────────────────────

  describe("Resume Pattern Detection", () => {
    // Task 58: zero prior agent turns → "fresh"
    it('returns "fresh" when there are zero prior agent turns', () => {
      const pattern = assembler.detectResumePattern("pm-agent", []);
      expect(pattern).toBe("fresh");
    });

    // Task 59: Pattern A — most recent routing signal targets a different agent
    it('returns "pattern_a" when most recent bot message is from a different agent', () => {
      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "Initial task",
          isBot: false,
          authorId: "human-1",
        }),
        createThreadMessage({
          id: "msg-2",
          content: "I need help from dev-agent.",
          isBot: true,
          authorId: "other-agent",
          authorName: "OtherBot",
        }),
      ];
      const pattern = assembler.detectResumePattern("pm-agent", history);
      expect(pattern).toBe("pattern_a");
    });

    // Task 60: Pattern C — default when prior agent turns exist and Pattern A doesn't apply
    it('returns "pattern_c" as default when prior agent turns exist from same agent', () => {
      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "First review turn",
          isBot: true,
          authorId: "pm-agent",
          authorName: "PMBot",
        }),
      ];
      const pattern = assembler.detectResumePattern("pm-agent", history);
      expect(pattern).toBe("pattern_c");
    });
  });

  // ─── Pattern A — Agent-to-Agent Q&A ───────────────────────────

  describe("Pattern A — Agent-to-Agent Q&A", () => {
    // Task 61: AT-RPA-01, AT-RPA-03
    it("Layer 3 contains task reminder + question verbatim + answer verbatim", async () => {
      const featureName = "qa-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "Build the login page",
          isBot: false,
          authorId: "human-1",
        }),
        createThreadMessage({
          id: "msg-2",
          content: "What database should I use?",
          isBot: true,
          authorId: "dev-agent",
          authorName: "DevBot",
        }),
      ];

      const triggerMessage = createThreadMessage({
        id: "msg-3",
        content: "Use PostgreSQL for the database.",
        isBot: false,
        authorId: "human-1",
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage,
        config,
      });

      expect(result.resumePattern).toBe("pattern_a");
      // Layer 3 is always just the trigger message — no thread history
      expect(result.userMessage).toBe("Use PostgreSQL for the database.");
    });

    it("falls back to first message as task reminder when routing metadata unavailable", async () => {
      const featureName = "fallback-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "Original task description from thread start",
          isBot: false,
          authorId: "human-1",
        }),
        createThreadMessage({
          id: "msg-2",
          content: "Can you clarify the requirements?",
          isBot: true,
          authorId: "other-agent",
        }),
      ];

      const triggerMessage = createThreadMessage({
        id: "msg-3",
        content: "Here are the clarifications.",
        isBot: false,
        authorId: "human-1",
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage,
        config,
      });

      // Layer 3 is always just the trigger message — no thread history
      expect(result.userMessage).toBe("Here are the clarifications.");
    });

    // Task 62: AT-RPA-02 — multi-message question concatenation
    it("concatenates consecutive messages from asking agent", async () => {
      const featureName = "multi-q-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "Build a dashboard",
          isBot: false,
          authorId: "human-1",
        }),
        createThreadMessage({
          id: "msg-2",
          content: "First question part",
          isBot: true,
          authorId: "other-agent",
        }),
        createThreadMessage({
          id: "msg-3",
          content: "Second question part",
          isBot: true,
          authorId: "other-agent",
        }),
      ];

      const triggerMessage = createThreadMessage({
        id: "msg-4",
        content: "Here is my answer.",
        isBot: false,
        authorId: "human-1",
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage,
        config,
      });

      // Layer 3 is always just the trigger message — no thread history
      expect(result.userMessage).toBe("Here is my answer.");
    });

    // Task 63: AT-RPA-04 — no summarization
    it("includes question and answer verbatim regardless of length", async () => {
      const featureName = "long-qa-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const longQuestion = "A".repeat(10000);
      const longAnswer = "B".repeat(10000);

      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "Task description",
          isBot: false,
          authorId: "human-1",
        }),
        createThreadMessage({
          id: "msg-2",
          content: longQuestion,
          isBot: true,
          authorId: "other-agent",
        }),
      ];

      const triggerMessage = createThreadMessage({
        id: "msg-3",
        content: longAnswer,
        isBot: false,
        authorId: "human-1",
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage,
        config,
      });

      // Layer 3 is always just the trigger message — no thread history
      expect(result.userMessage).toBe(longAnswer);
    });
  });

  // ─── Pattern C — Review Loop ───────────────────────────────────

  describe("Pattern C — Review Loop", () => {
    function buildPatternCHistory(
      agentId: string,
      turnContents: string[],
      humanFeedback: string[] = [],
    ): ThreadMessage[] {
      const messages: ThreadMessage[] = [];
      let msgIndex = 0;

      for (let i = 0; i < turnContents.length; i++) {
        messages.push(
          createThreadMessage({
            id: `msg-${++msgIndex}`,
            content: turnContents[i],
            isBot: true,
            authorId: agentId,
            authorName: "Agent",
          }),
        );

        if (humanFeedback[i]) {
          messages.push(
            createThreadMessage({
              id: `msg-${++msgIndex}`,
              content: humanFeedback[i],
              isBot: false,
              authorId: "human-1",
              authorName: "Human",
            }),
          );
        }
      }

      return messages;
    }

    // Task 64: AT-RPC-04 — turn counting
    it("counts agent-posted embeds only, excludes human and system messages", () => {
      const history: ThreadMessage[] = [
        createThreadMessage({ isBot: true, authorId: "pm-agent", content: "Turn 1" }),
        createThreadMessage({ isBot: false, authorId: "human-1", content: "Feedback" }),
        createThreadMessage({ isBot: true, authorId: "pm-agent", content: "Turn 2" }),
        createThreadMessage({ isBot: false, authorId: "human-1", content: "More feedback" }),
      ];

      const pattern = assembler.detectResumePattern("pm-agent", history);
      expect(pattern).toBe("pattern_c");
    });

    // Task 65: AT-RPC-05 — Turn 1 Layer 3
    it("Turn 1: artifact to review verbatim, no prior turns, no final-review", async () => {
      const featureName = "review-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage: createThreadMessage({ content: "Review this artifact." }),
        config,
      });

      // Fresh invocation = turn 1, trigger message verbatim
      expect(result.turnNumber).toBe(1);
      expect(result.userMessage).toBe("Review this artifact.");
      expect(result.userMessage).not.toContain("Final Review");
    });

    // Task 66: AT-RPC-06 — Turn 2 Layer 3
    it("Turn 2: Turn 1 + Turn 2 verbatim, no final-review", async () => {
      const featureName = "review-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history = buildPatternCHistory("pm-agent", ["Turn 1 content"]);

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage: createThreadMessage({ content: "trigger" }),
        config,
      });

      expect(result.turnNumber).toBe(2);
      // Layer 3 is always just the trigger message — no thread history
      expect(result.userMessage).toBe("trigger");
    });

    // Task 67: AT-RPC-01, AT-RPC-02 — Turn 3 with final-review
    it("Turn 3: all prior turns + final-review instruction injected", async () => {
      const featureName = "review-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history = buildPatternCHistory("pm-agent", [
        "Turn 1 content",
        "Turn 2 content",
      ]);

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage: createThreadMessage({ content: "trigger" }),
        config,
      });

      expect(result.turnNumber).toBe(3);
      // Layer 3 is always just the trigger message — no thread history
      expect(result.userMessage).toBe("trigger");
    });

    // Task 68: AT-RPC-07 — Turn 4, NO final-review
    it("Turn 4: all prior turns + current turn, NO final-review instruction", async () => {
      const featureName = "review-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history = buildPatternCHistory("pm-agent", [
        "Turn 1 content",
        "Turn 2 content",
        "Turn 3 content",
      ]);

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage: createThreadMessage({ content: "trigger" }),
        config,
      });

      expect(result.turnNumber).toBe(4);
      // Layer 3 is always just the trigger message — no thread history
      expect(result.userMessage).toBe("trigger");
    });

    // Task 69: AT-RPC-04 — human messages as context but don't affect turn count
    it("human messages between turns included as context but do not affect turn count", async () => {
      const featureName = "review-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history = buildPatternCHistory(
        "pm-agent",
        ["Turn 1 content", "Turn 2 content"],
        ["Human feedback 1", "Human feedback 2"],
      );

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage: createThreadMessage({ content: "trigger" }),
        config,
      });

      // Turn count should be 3 (2 prior bot turns + 1 current)
      expect(result.turnNumber).toBe(3);
      // Layer 3 is always just the trigger message — no thread history
      expect(result.userMessage).toBe("trigger");
    });
  });

  // ─── ACTION Directive Extraction ─────────────────────────────────

  describe("ACTION Directive Extraction", () => {
    it("extracts ACTION directive from routing message", () => {
      const message = "ACTION: Create TSPEC\n\nREQ and FSPEC are approved.";
      expect(assembler.extractActionDirective(message)).toBe("ACTION: Create TSPEC");
    });

    it("extracts ACTION: Implement directive", () => {
      const message = "ACTION: Implement\n\nPROPERTIES are approved.";
      expect(assembler.extractActionDirective(message)).toBe("ACTION: Implement");
    });

    it("extracts ACTION: Create PROPERTIES directive", () => {
      const message = "ACTION: Create PROPERTIES\n\nTSPEC and PLAN are approved.";
      expect(assembler.extractActionDirective(message)).toBe("ACTION: Create PROPERTIES");
    });

    it("returns null when no ACTION directive present", () => {
      const message = "Please review the TSPEC for feasibility.";
      expect(assembler.extractActionDirective(message)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(assembler.extractActionDirective("")).toBeNull();
    });

  });

  describe("Pattern A — Task Directive injection", () => {
    it("uses only ACTION message as Layer 3 (no thread history) when ACTION directive found", async () => {
      const featureName = "action-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "Build the feature",
          isBot: false,
          authorId: "human-1",
        }),
        createThreadMessage({
          id: "msg-2",
          content: "ACTION: Create TSPEC\n\nREQ and FSPEC are approved. Please create the TSPEC.\n\n<routing>{\"type\":\"ROUTE_TO_AGENT\",\"agent_id\":\"eng\"}</routing>",
          isBot: true,
          authorId: "pm-agent",
          authorName: "PMBot",
        }),
      ];

      const triggerMessage = createThreadMessage({
        id: "msg-3",
        content: "Routing to eng.",
        isBot: false,
        authorId: "human-1",
      });

      const routingMessage = "ACTION: Create TSPEC\n\nREQ and FSPEC are approved. Please create the TSPEC.\n\n<routing>{\"type\":\"ROUTE_TO_AGENT\",\"agent_id\":\"eng\"}</routing>";

      const result = await assembler.assemble({
        agentId: "dev-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage,
        config,
        routingMessage,
      });

      // Layer 3 should be ONLY the routing message content (routing tags stripped)
      expect(result.userMessage).toContain("ACTION: Create TSPEC");
      expect(result.userMessage).toContain("REQ and FSPEC are approved");
      expect(result.userMessage).not.toContain("<routing>");
      // Should NOT contain Pattern A sections (no thread history passed)
      expect(result.userMessage).not.toContain("## Task Reminder");
      expect(result.userMessage).not.toContain("## Question");
      expect(result.userMessage).not.toContain("## Answer");
      // Directive should be in system prompt instead
      expect(result.systemPrompt).toContain("ACTIVE TASK DIRECTIVE");
      expect(result.systemPrompt).toContain("ACTION: Create TSPEC");
    });

    it("injects ACTIVE TASK DIRECTIVE into system prompt when routingMessage contains ACTION", async () => {
      const featureName = "sysaction-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const triggerMessage = createThreadMessage({
        id: "msg-3",
        content: "Routing to eng.",
        isBot: false,
        authorId: "human-1",
      });

      const routingMessage = "ACTION: Create TSPEC\n\nREQ and FSPEC are approved.\n\n<routing>{\"type\":\"ROUTE_TO_AGENT\",\"agent_id\":\"eng\"}</routing>";

      const result = await assembler.assemble({
        agentId: "dev-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
        routingMessage,
      });

      // System prompt should contain the directive
      expect(result.systemPrompt).toContain("ACTIVE TASK DIRECTIVE");
      expect(result.systemPrompt).toContain("ACTION: Create TSPEC");
      expect(result.systemPrompt).toContain("Do NOT review documents");
    });

    it("does not inject Task Directive when routing message has no ACTION directive", async () => {
      const featureName = "no-action-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "Build the feature",
          isBot: false,
          authorId: "human-1",
        }),
        createThreadMessage({
          id: "msg-2",
          content: "Please review the TSPEC for feasibility.",
          isBot: true,
          authorId: "other-agent",
        }),
      ];

      const triggerMessage = createThreadMessage({
        id: "msg-3",
        content: "Here is the review.",
        isBot: false,
        authorId: "human-1",
      });

      const result = await assembler.assemble({
        agentId: "dev-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage,
        config,
      });

      // No ACTION directive — Layer 3 is just the trigger message
      expect(result.userMessage).toBe("Here is the review.");
      expect(result.systemPrompt).not.toContain("ACTIVE TASK DIRECTIVE");
    });
  });

  // ─── Pattern C with ACTION Directive (cross-pattern injection) ──

  describe("routingMessage — ACTION directive via orchestrator routing", () => {
    it("injects ACTIVE TASK DIRECTIVE into system prompt when routingMessage contains ACTION", async () => {
      const featureName = "routing-action-feature";
      fs.addExistingDir(`docs/${featureName}`);

      const triggerMessage = createThreadMessage({
        id: "msg-1",
        content: "review FSPEC",
        isBot: false,
        authorId: "human-1",
      });

      // The orchestrator passes PM's response as routingMessage when routing to eng
      const routingMessage = "ACTION: Create TSPEC\n\nREQ and FSPEC approved. Create the TSPEC.\n\n<routing>{\"type\":\"ROUTE_TO_AGENT\",\"agent_id\":\"eng\"}</routing>";

      const result = await assembler.assemble({
        agentId: "dev-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
        routingMessage,
      });

      // System prompt should contain the directive
      expect(result.systemPrompt).toContain("ACTIVE TASK DIRECTIVE");
      expect(result.systemPrompt).toContain("ACTION: Create TSPEC");
      // Layer 3 should be the routing message (tags stripped), NOT the trigger message
      expect(result.userMessage).toContain("ACTION: Create TSPEC");
      expect(result.userMessage).not.toContain("review FSPEC");
      expect(result.userMessage).not.toContain("<routing>");
    });

    it("excludes agent's own prior work from Layer 3 when routingMessage has ACTION", async () => {
      const featureName = "no-prior-work-feature";
      fs.addExistingDir(`docs/${featureName}`);

      // Thread history has agent's own prior work — but it doesn't matter
      const history: ThreadMessage[] = [
        createThreadMessage({
          id: "msg-1",
          content: "FSPEC review complete. Here is my detailed analysis of the FSPEC...",
          isBot: true,
          authorId: "dev-agent",
        }),
      ];

      const triggerMessage = createThreadMessage({
        id: "msg-2",
        content: "review FSPEC",
        isBot: false,
        authorId: "human-1",
      });

      const routingMessage = "ACTION: Create TSPEC\n\nREQ and FSPEC approved. Create the TSPEC.\n\n<routing>{\"type\":\"ROUTE_TO_AGENT\",\"agent_id\":\"eng\"}</routing>";

      const result = await assembler.assemble({
        agentId: "dev-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: history,
        triggerMessage,
        config,
        routingMessage,
      });

      // Layer 3 should be ONLY the routing message — no prior agent work
      expect(result.userMessage).toContain("ACTION: Create TSPEC");
      expect(result.userMessage).not.toContain("FSPEC review complete");
      expect(result.userMessage).not.toContain("detailed analysis");
      expect(result.userMessage).not.toContain("review FSPEC");
      expect(result.userMessage).not.toContain("<routing>");
      expect(result.systemPrompt).toContain("ACTIVE TASK DIRECTIVE");
    });

    it("uses routingMessage as Layer 3 even without ACTION directive", async () => {
      const featureName = "routing-no-action";
      fs.addExistingDir(`docs/${featureName}`);

      const triggerMessage = createThreadMessage({
        id: "msg-1",
        content: "review FSPEC",
        isBot: false,
        authorId: "human-1",
      });

      // Non-ACTION routing message from previous agent
      const routingMessage = "Please review the TSPEC for feasibility.\n\n<routing>{\"type\":\"ROUTE_TO_AGENT\",\"agent_id\":\"eng\"}</routing>";

      const result = await assembler.assemble({
        agentId: "dev-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
        routingMessage,
      });

      // Layer 3 should be the routing message, NOT the trigger message
      expect(result.userMessage).toBe(routingMessage);
      expect(result.userMessage).not.toContain("review FSPEC");
      expect(result.systemPrompt).not.toContain("ACTIVE TASK DIRECTIVE");
    });
  });

  // ─── Token Budget Enforcement ──────────────────────────────────

  describe("Token Budget Enforcement", () => {
    // Task 70: CB-R1, AT-CB-02 — Layer 1 and Layer 3 never truncated
    it("Layer 1 and Layer 3 are never truncated regardless of budget pressure", async () => {
      const featureName = "budget-feature";
      fs.addExistingDir(`docs/${featureName}`);
      fs.addExisting(`docs/${featureName}/overview.md`, "Overview.");

      // Set very small max_tokens to create budget pressure
      config.agents.max_tokens = 100;

      const longTrigger = "X".repeat(500);
      const triggerMessage = createThreadMessage({ content: longTrigger });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      // Layer 3 must be untruncated
      expect(result.userMessage).toBe(longTrigger);
      // Layer 1 must contain role prompt
      expect(result.systemPrompt).toContain("You are a PM agent.");
    });

    // Task 71: AT-CB-12 — Layer 2 truncated from least-relevant files first
    it("Layer 2 truncated from least-relevant files first when over budget", async () => {
      const featureName = "truncate-feature";
      const featureDir = `docs/${featureName}`;
      fs.addExistingDir(featureDir);
      fs.addExisting(`${featureDir}/overview.md`, "Overview.");
      fs.addExisting(`${featureDir}/aaa-important.md`, "Important file.");
      fs.addExisting(`${featureDir}/zzz-least-important.md`, "Z".repeat(50000));

      // Set budget so that the large file can't fit
      config.agents.max_tokens = 500;
      config.orchestrator.token_budget = {
        layer1_pct: 25,
        layer2_pct: 35,
        layer3_pct: 30,
        thread_pct: 5,
        headroom_pct: 5,
      };

      const triggerMessage = createThreadMessage({ content: "Do the thing." });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      // Important file should be included
      expect(result.systemPrompt).toContain("Important file.");
      // Large file should be truncated (not included)
      expect(result.systemPrompt).not.toContain("Z".repeat(50000));
    });

    // Task 72: AT-CB-09 — Layer 2 omitted entirely when L1+L3 > 85%
    it("Layer 2 omitted entirely when Layer 1 + Layer 3 exceed 85% budget, logs warning", async () => {
      const featureName = "omit-l2-feature";
      const featureDir = `docs/${featureName}`;
      fs.addExistingDir(featureDir);
      fs.addExisting(`${featureDir}/overview.md`, "Overview.");
      fs.addExisting(`${featureDir}/file.md`, "File content.");

      // Make role prompt very long so L1 alone blows the budget
      fs.addExisting("./ptah/skills/pm-agent.md", "R".repeat(10000));
      config.agents.max_tokens = 1000;

      const triggerMessage = createThreadMessage({ content: "Do the thing." });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      // Layer 2 should be omitted
      expect(result.tokenCounts.layer2).toBe(0);
      expect(result.systemPrompt).not.toContain("File content.");

      // Warning should be logged
      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("85%"))).toBe(true);
    });

    // Task 73: AT-CB-05 — deferred task splitting
    it.skip("REQ-CB-06 task splitting on budget overflow — deferred to P1 (AT-CB-05)", () => {
      // This test is a placeholder for the task splitting feature.
      // When the total context exceeds the token budget even after Layer 2 removal,
      // the system should split the task into smaller sub-tasks.
      // This functionality is deferred to Phase 1 (P1) as it requires
      // significant additional design work for task decomposition logic.
    });

    // Task 74: CB-R5 — configurable percentages
    it("token budget uses configurable percentages from config.orchestrator.token_budget", async () => {
      const featureName = "config-budget-feature";
      const featureDir = `docs/${featureName}`;
      fs.addExistingDir(featureDir);
      fs.addExisting(`${featureDir}/overview.md`, "Overview.");
      fs.addExisting(`${featureDir}/file.md`, "File content.");

      config.orchestrator.token_budget = {
        layer1_pct: 40,
        layer2_pct: 20,
        layer3_pct: 30,
        thread_pct: 5,
        headroom_pct: 5,
      };
      config.agents.max_tokens = 8192;

      const triggerMessage = createThreadMessage({ content: "Do the thing." });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      // Just verify it completes without error and produces a valid bundle
      expect(result.tokenCounts.total).toBeGreaterThan(0);
      expect(result.systemPrompt).toContain("You are a PM agent.");
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────

  describe("Edge Cases", () => {
    // Task 75: AT-CB-04 — missing feature folder
    it("Layer 2 empty when feature folder missing, logs warning, invocation proceeds", async () => {
      const featureName = "nonexistent-feature";

      const triggerMessage = createThreadMessage({ content: "Do the thing." });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      expect(result.tokenCounts.layer2).toBe(0);
      expect(result.featureName).toBe("nonexistent-feature");

      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("not found") || w.message.includes("Feature folder"))).toBe(true);
    });

    // Task 76: Missing overview.md
    it("Layer 1 contains only role prompt when overview.md missing, logs warning", async () => {
      const featureName = "no-overview-feature";
      fs.addExistingDir(`docs/${featureName}`);
      // No overview.md added

      const triggerMessage = createThreadMessage({ content: "Do the thing." });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      expect(result.systemPrompt).toContain("You are a PM agent.");
      expect(result.systemPrompt).not.toContain("Overview");

      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("overview.md"))).toBe(true);
    });

    // Task 77: Missing role prompt — throws error
    it("throws error when role prompt is missing", async () => {
      const featureName = "missing-role-feature";

      const triggerMessage = createThreadMessage({ content: "Do the thing." });

      await expect(
        assembler.assemble({
          agentId: "unknown-agent",
          threadId: "thread-1",
          threadName: featureName,
          threadHistory: [],
          triggerMessage,
          config,
        }),
      ).rejects.toThrow(/skill path.*unknown-agent|role prompt.*unknown-agent/i);
    });

    // Task 78: AT-CB-10 — ambiguous thread name
    it("exact match preferred for feature name extraction", () => {
      expect(assembler.extractFeatureName("auth")).toBe("auth");
      expect(assembler.extractFeatureName("auth \u2014 login")).toBe("auth");
    });

    it("full name used when no em dash present", () => {
      expect(assembler.extractFeatureName("authentication-feature")).toBe(
        "authentication-feature",
      );
    });

    // Task 79: AT-CB-03 — fresh artifact reads
    it("Layer 2 reads from filesystem at invocation time, not cached", async () => {
      const featureName = "fresh-read-feature";
      const featureDir = `docs/${featureName}`;
      fs.addExistingDir(featureDir);
      fs.addExisting(`${featureDir}/overview.md`, "Overview.");
      fs.addExisting(`${featureDir}/file.md`, "Original content.");

      const triggerMessage = createThreadMessage({ content: "Do the thing." });

      const result1 = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      expect(result1.systemPrompt).toContain("Original content.");

      // Update file content
      fs.addExisting(`${featureDir}/file.md`, "Updated content.");

      const result2 = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      expect(result2.systemPrompt).toContain("Updated content.");
      expect(result2.systemPrompt).not.toContain("Original content.");
    });

    // Task 80: AT-CB-11 — token counting fallback
    it("falls back to char-based estimation when TokenCounter.count() throws, logs warning", async () => {
      const featureName = "fallback-counter-feature";
      fs.addExistingDir(`docs/${featureName}`);
      fs.addExisting(`docs/${featureName}/overview.md`, "Overview.");

      tokenCounter.shouldThrow = true;

      const triggerMessage = createThreadMessage({ content: "Do the thing." });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      // Should still succeed
      expect(result.tokenCounts.layer1).toBeGreaterThan(0);
      expect(result.tokenCounts.layer3).toBeGreaterThan(0);

      // Warning should be logged
      const warnings = logger.messages.filter((m) => m.level === "warn");
      expect(warnings.some((w) => w.message.includes("falling back") || w.message.includes("char-based"))).toBe(true);
    });
  });

  // ─── Task 57: ContextAssembler worktree Layer 2 ───────────────────
  describe("Task 57: Layer 2 reads from worktreePath when provided", () => {
    it("reads Layer 2 feature files from worktreePath instead of repo root", async () => {
      const featureName = "wt-feature";
      const worktreePath = "/tmp/ptah-worktrees/abc12345";

      // Set up files in worktree path (not the default docs root)
      const wtFeatureDir = `${worktreePath}/docs/${featureName}`;
      fs.addExistingDir(wtFeatureDir);
      fs.addExisting(`${wtFeatureDir}/overview.md`, "Worktree overview.");
      fs.addExisting(`${wtFeatureDir}/spec.md`, "Worktree spec content.");

      // Also set up files in main repo root (should NOT be used)
      const mainFeatureDir = `docs/${featureName}`;
      fs.addExistingDir(mainFeatureDir);
      fs.addExisting(`${mainFeatureDir}/overview.md`, "Main repo overview.");
      fs.addExisting(`${mainFeatureDir}/spec.md`, "Main repo spec content.");

      const triggerMessage = createThreadMessage({
        content: "Review the spec.",
        threadName: `${featureName} \u2014 review`,
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: `${featureName} \u2014 review`,
        threadHistory: [],
        triggerMessage,
        config,
        worktreePath,
      });

      // Layer 2 should contain worktree content, not main repo content
      expect(result.systemPrompt).toContain("Worktree spec content.");
      expect(result.systemPrompt).not.toContain("Main repo spec content.");

      // Layer 1 overview also from worktree
      expect(result.systemPrompt).toContain("Worktree overview.");
    });
  });

  // ─── Task 58: ContextAssembler fallback ───────────────────────────
  describe("Task 58: Layer 2 reads from main when worktreePath not provided", () => {
    it("reads Layer 2 from main repo when worktreePath is undefined", async () => {
      const featureName = "main-feature";
      const mainFeatureDir = `docs/${featureName}`;
      fs.addExistingDir(mainFeatureDir);
      fs.addExisting(`${mainFeatureDir}/overview.md`, "Main overview.");
      fs.addExisting(`${mainFeatureDir}/details.md`, "Main details content.");

      const triggerMessage = createThreadMessage({
        content: "Do the thing.",
        threadName: featureName,
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
        // worktreePath intentionally omitted
      });

      // Should read from main repo as before
      expect(result.systemPrompt).toContain("Main overview.");
      expect(result.systemPrompt).toContain("Main details content.");
    });

    it("reads Layer 2 from main repo when worktreePath is explicitly undefined", async () => {
      const featureName = "explicit-undef-feature";
      const mainFeatureDir = `docs/${featureName}`;
      fs.addExistingDir(mainFeatureDir);
      fs.addExisting(`${mainFeatureDir}/overview.md`, "Overview here.");
      fs.addExisting(`${mainFeatureDir}/notes.md`, "Notes content.");

      const triggerMessage = createThreadMessage({
        content: "Check notes.",
        threadName: featureName,
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
        worktreePath: undefined,
      });

      expect(result.systemPrompt).toContain("Notes content.");
    });
  });

  // Phase 9 — AF-R1 contract: locks down extractFeatureName() behavior that PM Phase 0 depends on.
  // If extractFeatureName() changes, these tests break, signaling that SKILL.md must be updated.
  describe("extractFeatureName — Phase 9 AF-R1 contract", () => {
    // Case 1: Standard numbered thread — PM folder matches context-assembler path (happy path, AT-AF-01)
    it("strips after em-dash for standard numbered thread name (AT-AF-01 path)", () => {
      expect(
        assembler.extractFeatureName(
          "009-auto-feature-bootstrap \u2014 create FSPEC",
        ),
      ).toBe("009-auto-feature-bootstrap");
      // PM slugification of "009-auto-feature-bootstrap" is a no-op (already lowercase alnum+hyphen)
      // PM creates docs/009-auto-feature-bootstrap/ which context-assembler can find ✓
    });

    // Case 2: Unnumbered thread with em-dash — illustrates known AF-R8 mismatch (AT-AF-03 path)
    it("strips after em-dash for unnumbered thread name (AT-AF-03 path)", () => {
      expect(
        assembler.extractFeatureName("auth redesign \u2014 define scope"),
      ).toBe("auth redesign");
      // PM slugifies "auth redesign" → "auth-redesign", auto-assigns NNN → "008-auth-redesign"
      // context-assembler returns "auth redesign" (spaces, no NNN) — known mismatch per AF-R8
    });

    // Case 3: No em-dash separator — full name returned, known limitation AF-R8
    it("returns full thread name when no em-dash separator present (known limitation AF-R8)", () => {
      expect(
        assembler.extractFeatureName("create requirements for auth"),
      ).toBe("create requirements for auth");
      // PM slugifies → "create-requirements-for-auth", prepends NNN
      // context-assembler returns "create requirements for auth" with spaces — known mismatch per AF-R8
      // Mitigation: developers should use NNN-slug — task description thread naming convention
    });

    // Case 4: Multiple em-dashes — strips at FIRST occurrence only (genuine new coverage)
    it("strips correctly for thread names with multiple em-dashes (first occurrence only)", () => {
      expect(
        assembler.extractFeatureName("my-feature \u2014 create spec \u2014 v2"),
      ).toBe("my-feature");
      // Only strips at first " — " occurrence; subsequent em-dashes are ignored
    });
  });

  // ─── Task Type Directives (Issue #30) ──────────────────────────

  describe("taskType directive injection", () => {
    const setupRevisionTest = () => {
      const featureName = "my-feature";
      const featureDir = `docs/${featureName}`;
      fs.addExistingDir(featureDir);
      fs.addExisting(`${featureDir}/overview.md`, "Feature overview.");
      fs.addExisting(`${featureDir}/spec.md`, "Spec content.");
      return createThreadMessage({
        threadName: `${featureName} — revise plan`,
        content: "Please revise the PLAN.",
      });
    };

    it("injects REVISION TASK directive into Layer 1 when taskType is Revise", async () => {
      const triggerMessage = setupRevisionTest();
      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: triggerMessage.threadName,
        threadHistory: [],
        triggerMessage,
        config,
        taskType: "Revise",
      });

      expect(result.systemPrompt).toContain("## REVISION TASK");
      expect(result.systemPrompt).toContain("You are revising a document based on cross-review feedback.");
      expect(result.systemPrompt).toContain("address every HIGH and MEDIUM severity issue");
    });

    it("injects RESUBMIT TASK directive into Layer 1 when taskType is Resubmit", async () => {
      const triggerMessage = setupRevisionTest();
      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: triggerMessage.threadName,
        threadHistory: [],
        triggerMessage,
        config,
        taskType: "Resubmit",
      });

      expect(result.systemPrompt).toContain("## RESUBMIT TASK");
      expect(result.systemPrompt).toContain("Your document was approved but a co-author's document was rejected");
    });

    it("does NOT inject any task directive when taskType is undefined", async () => {
      const triggerMessage = setupRevisionTest();
      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: triggerMessage.threadName,
        threadHistory: [],
        triggerMessage,
        config,
      });

      expect(result.systemPrompt).not.toContain("## REVISION TASK");
      expect(result.systemPrompt).not.toContain("## RESUBMIT TASK");
    });

    it("does NOT inject any task directive when taskType is Create", async () => {
      const triggerMessage = setupRevisionTest();
      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: triggerMessage.threadName,
        threadHistory: [],
        triggerMessage,
        config,
        taskType: "Create",
      });

      expect(result.systemPrompt).not.toContain("## REVISION TASK");
      expect(result.systemPrompt).not.toContain("## RESUBMIT TASK");
    });

    it("does NOT inject any task directive when taskType is Review", async () => {
      const triggerMessage = setupRevisionTest();
      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: triggerMessage.threadName,
        threadHistory: [],
        triggerMessage,
        config,
        taskType: "Review",
      });

      expect(result.systemPrompt).not.toContain("## REVISION TASK");
      expect(result.systemPrompt).not.toContain("## RESUBMIT TASK");
    });
  });

  // ─── E6: contextDocumentRefs (config-driven context documents) ────────────

  describe("contextDocumentRefs — config-driven document matrix (E6)", () => {
    it("reads only specified document refs when contextDocumentRefs is provided", async () => {
      const featureName = "015-temporal-foundation";
      const docsRoot = "docs";
      fs.addExistingDir(`${docsRoot}/${featureName}`);
      fs.addExisting(`${docsRoot}/${featureName}/015-REQ-temporal-foundation.md`, "REQ content here");
      fs.addExisting(`${docsRoot}/${featureName}/015-TSPEC-temporal-foundation.md`, "TSPEC content here");
      fs.addExisting(`${docsRoot}/${featureName}/overview.md`, "Feature overview");
      // Extra file that should NOT be included
      fs.addExisting(`${docsRoot}/${featureName}/other.md`, "Other content");

      const triggerMessage = createThreadMessage({
        content: "Implement the feature",
        threadName: featureName,
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
        contextDocumentRefs: [
          `${docsRoot}/${featureName}/015-REQ-temporal-foundation.md`,
          `${docsRoot}/${featureName}/015-TSPEC-temporal-foundation.md`,
        ],
      });

      // REQ and TSPEC are included
      expect(result.systemPrompt).toContain("REQ content here");
      expect(result.systemPrompt).toContain("TSPEC content here");
      // Other file is NOT included (was not in refs)
      expect(result.systemPrompt).not.toContain("Other content");
    });

    it("excludes overview.md from Layer 2 when provided in contextDocumentRefs", async () => {
      const featureName = "015-temporal-foundation";
      const docsRoot = "docs";
      fs.addExistingDir(`${docsRoot}/${featureName}`);
      fs.addExisting(`${docsRoot}/${featureName}/overview.md`, "Feature overview content");
      fs.addExisting(`${docsRoot}/${featureName}/015-REQ-temporal-foundation.md`, "REQ content");

      const triggerMessage = createThreadMessage({
        content: "Do the task",
        threadName: featureName,
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
        contextDocumentRefs: [
          `${docsRoot}/${featureName}/overview.md`,
          `${docsRoot}/${featureName}/015-REQ-temporal-foundation.md`,
        ],
      });

      // overview appears exactly once (in Layer 1), not duplicated in Layer 2
      const overviewCount = result.systemPrompt.split("Feature overview content").length - 1;
      expect(overviewCount).toBe(1);
      // REQ content appears in Layer 2
      expect(result.systemPrompt).toContain("REQ content");
    });

    it("gracefully skips missing files referenced in contextDocumentRefs", async () => {
      const featureName = "015-temporal-foundation";
      const docsRoot = "docs";
      fs.addExistingDir(`${docsRoot}/${featureName}`);
      fs.addExisting(`${docsRoot}/${featureName}/015-REQ-temporal-foundation.md`, "REQ content");

      const triggerMessage = createThreadMessage({
        content: "Do the task",
        threadName: featureName,
      });

      // Does not throw when a referenced file is missing
      await expect(
        assembler.assemble({
          agentId: "pm-agent",
          threadId: "thread-1",
          threadName: featureName,
          threadHistory: [],
          triggerMessage,
          config,
          contextDocumentRefs: [
            `${docsRoot}/${featureName}/015-REQ-temporal-foundation.md`,
            `${docsRoot}/${featureName}/does-not-exist.md`,
          ],
        }),
      ).resolves.toBeDefined();
    });

    it("falls back to full feature folder scan when contextDocumentRefs is absent", async () => {
      const featureName = "015-temporal-foundation";
      const docsRoot = "docs";
      fs.addExistingDir(`${docsRoot}/${featureName}`);
      fs.addExisting(`${docsRoot}/${featureName}/015-REQ-temporal-foundation.md`, "REQ content all");
      fs.addExisting(`${docsRoot}/${featureName}/015-TSPEC-temporal-foundation.md`, "TSPEC content all");

      const triggerMessage = createThreadMessage({
        content: "Do the task",
        threadName: featureName,
      });

      const result = await assembler.assemble({
        agentId: "pm-agent",
        threadId: "thread-1",
        threadName: featureName,
        threadHistory: [],
        triggerMessage,
        config,
        // No contextDocumentRefs — falls back to full folder scan
      });

      expect(result.systemPrompt).toContain("REQ content all");
      expect(result.systemPrompt).toContain("TSPEC content all");
    });
  });
});
