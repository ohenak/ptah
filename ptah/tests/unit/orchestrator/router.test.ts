import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultRoutingEngine,
  RoutingParseError,
  RoutingError,
} from "../../../src/orchestrator/router.js";
import { FakeLogger, defaultTestConfig } from "../../fixtures/factories.js";
import type { PtahConfig, ThreadMessage } from "../../../src/types.js";

function makeThreadMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "msg-1",
    threadId: "thread-1",
    threadName: "test-thread",
    parentChannelId: "parent-1",
    authorId: "user-1",
    authorName: "TestUser",
    isBot: false,
    content: "hello",
    timestamp: new Date("2026-03-09T12:00:00Z"),
    ...overrides,
  };
}

describe("DefaultRoutingEngine", () => {
  let engine: DefaultRoutingEngine;
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
    engine = new DefaultRoutingEngine(logger);
  });

  describe("parseSignal", () => {
    // Task 37: Parse valid ROUTE_TO_AGENT signal
    it("parses ROUTE_TO_AGENT signal with correct type, agentId, and threadAction", () => {
      const text = `Some preamble <routing>{"type":"ROUTE_TO_AGENT","agent_id":"dev-agent","thread_action":"reply"}</routing> trailing`;

      const signal = engine.parseSignal(text);

      expect(signal.type).toBe("ROUTE_TO_AGENT");
      expect(signal.agentId).toBe("dev-agent");
      expect(signal.threadAction).toBe("reply");
    });

    // Task 38: Parse valid ROUTE_TO_USER signal
    it("parses ROUTE_TO_USER signal with question field", () => {
      const text = `<routing>{"type":"ROUTE_TO_USER","question":"What is the DB schema?"}</routing>`;

      const signal = engine.parseSignal(text);

      expect(signal.type).toBe("ROUTE_TO_USER");
      expect(signal.question).toBe("What is the DB schema?");
    });

    // Task 39: Parse valid LGTM and TASK_COMPLETE signals
    it("parses LGTM signal as terminal", () => {
      const text = `<routing>{"type":"LGTM"}</routing>`;

      const signal = engine.parseSignal(text);

      expect(signal.type).toBe("LGTM");
    });

    it("parses TASK_COMPLETE signal as terminal", () => {
      const text = `<routing>{"type":"TASK_COMPLETE"}</routing>`;

      const signal = engine.parseSignal(text);

      expect(signal.type).toBe("TASK_COMPLETE");
    });

    // Task 40: Missing routing signal
    it("throws RoutingParseError for missing routing signal", () => {
      const text = "This response has no routing tags at all.";

      expect(() => engine.parseSignal(text)).toThrow(RoutingParseError);
      expect(() => engine.parseSignal(text)).toThrow("missing routing signal");
    });

    // Task 41: Malformed JSON inside routing tags
    it("throws RoutingParseError for malformed JSON inside routing tags", () => {
      const text = `<routing>{not valid json}</routing>`;

      expect(() => engine.parseSignal(text)).toThrow(RoutingParseError);
      expect(() => engine.parseSignal(text)).toThrow("malformed routing signal JSON");
    });

    // Task 42: Multiple routing signals — uses first, logs warning
    it("uses first signal and logs warning when multiple routing signals present", () => {
      const text = `<routing>{"type":"ROUTE_TO_AGENT","agent_id":"dev-agent","thread_action":"reply"}</routing> text <routing>{"type":"LGTM"}</routing>`;

      const signal = engine.parseSignal(text);

      expect(signal.type).toBe("ROUTE_TO_AGENT");
      expect(signal.agentId).toBe("dev-agent");
      expect(logger.messages).toContainEqual({
        level: "warn",
        message: expect.stringContaining("Multiple routing signals found (2)"),
      });
    });

    // Task 43: Empty response
    it("throws RoutingParseError for empty response", () => {
      expect(() => engine.parseSignal("")).toThrow(RoutingParseError);
      expect(() => engine.parseSignal("")).toThrow("missing routing signal");
    });

    it("throws RoutingParseError for whitespace-only response", () => {
      expect(() => engine.parseSignal("   ")).toThrow(RoutingParseError);
      expect(() => engine.parseSignal("   ")).toThrow("missing routing signal");
    });

    // Task 44: Validation — ROUTE_TO_AGENT without agent_id, ROUTE_TO_USER without question
    it("throws RoutingParseError when ROUTE_TO_AGENT is missing agent_id", () => {
      const text = `<routing>{"type":"ROUTE_TO_AGENT","thread_action":"reply"}</routing>`;

      expect(() => engine.parseSignal(text)).toThrow(RoutingParseError);
      expect(() => engine.parseSignal(text)).toThrow("ROUTE_TO_AGENT requires agent_id");
    });

    it("throws RoutingParseError when ROUTE_TO_USER is missing question", () => {
      const text = `<routing>{"type":"ROUTE_TO_USER"}</routing>`;

      expect(() => engine.parseSignal(text)).toThrow(RoutingParseError);
      expect(() => engine.parseSignal(text)).toThrow("ROUTE_TO_USER requires question");
    });

    // Task 45: ROUTE_TO_AGENT with missing thread_action defaults to "reply"
    it("defaults thread_action to reply when missing for ROUTE_TO_AGENT", () => {
      const text = `<routing>{"type":"ROUTE_TO_AGENT","agent_id":"dev-agent"}</routing>`;

      const signal = engine.parseSignal(text);

      expect(signal.type).toBe("ROUTE_TO_AGENT");
      expect(signal.agentId).toBe("dev-agent");
      expect(signal.threadAction).toBe("reply");
    });
  });

  describe("resolveHumanMessage", () => {
    let config: PtahConfig;

    beforeEach(() => {
      config = {
        ...defaultTestConfig(),
        agents: {
          ...defaultTestConfig().agents,
          role_mentions: {
            "111222333": "dev-agent",
            "444555666": "pm-agent",
          },
        },
      };
    });

    // Task 46: Detects Discord role @mention and maps to agent ID
    it("detects Discord role mention and maps to agent ID", () => {
      const message = makeThreadMessage({
        content: "Hey <@&111222333> can you review this?",
      });

      const result = engine.resolveHumanMessage(message, config);

      expect(result).toBe("dev-agent");
    });

    // Task 47: No @mention returns null
    it("returns null when no role mention is present", () => {
      const message = makeThreadMessage({
        content: "Just a regular message with no mentions",
      });

      const result = engine.resolveHumanMessage(message, config);

      expect(result).toBeNull();
    });

    // Task 48: Unknown role ID returns null
    it("returns null when role ID is not in config", () => {
      const message = makeThreadMessage({
        content: "Hey <@&999999999> unknown role",
      });

      const result = engine.resolveHumanMessage(message, config);

      expect(result).toBeNull();
    });

    it("returns null when role_mentions is not configured", () => {
      const configNoMentions = defaultTestConfig();

      const message = makeThreadMessage({
        content: "Hey <@&111222333> can you help?",
      });

      const result = engine.resolveHumanMessage(message, configNoMentions);

      expect(result).toBeNull();
    });
  });

  describe("decide", () => {
    let config: PtahConfig;

    beforeEach(() => {
      config = defaultTestConfig();
    });

    // Task 49: ROUTE_TO_AGENT with reply
    it("returns decision with targetAgentId and createNewThread false for reply", () => {
      const decision = engine.decide(
        { type: "ROUTE_TO_AGENT", agentId: "dev-agent", threadAction: "reply" },
        config,
      );

      expect(decision.targetAgentId).toBe("dev-agent");
      expect(decision.isTerminal).toBe(false);
      expect(decision.isPaused).toBe(false);
      expect(decision.createNewThread).toBe(false);
      expect(decision.signal.type).toBe("ROUTE_TO_AGENT");
    });

    // Task 50: ROUTE_TO_AGENT with new_thread
    it("returns createNewThread true for new_thread action", () => {
      const decision = engine.decide(
        { type: "ROUTE_TO_AGENT", agentId: "dev-agent", threadAction: "new_thread" },
        config,
      );

      expect(decision.targetAgentId).toBe("dev-agent");
      expect(decision.createNewThread).toBe(true);
      expect(decision.isTerminal).toBe(false);
      expect(decision.isPaused).toBe(false);
    });

    // Task 51: ROUTE_TO_USER
    it("returns isPaused true and targetAgentId null for ROUTE_TO_USER", () => {
      const decision = engine.decide(
        { type: "ROUTE_TO_USER", question: "What DB to use?" },
        config,
      );

      expect(decision.isPaused).toBe(true);
      expect(decision.isTerminal).toBe(false);
      expect(decision.targetAgentId).toBeNull();
    });

    // Task 52: LGTM and TASK_COMPLETE
    it("returns isTerminal true for LGTM signal", () => {
      const decision = engine.decide({ type: "LGTM" }, config);

      expect(decision.isTerminal).toBe(true);
      expect(decision.targetAgentId).toBeNull();
      expect(decision.isPaused).toBe(false);
      expect(decision.createNewThread).toBe(false);
    });

    it("returns isTerminal true for TASK_COMPLETE signal", () => {
      const decision = engine.decide({ type: "TASK_COMPLETE" }, config);

      expect(decision.isTerminal).toBe(true);
      expect(decision.targetAgentId).toBeNull();
    });

    // Task 53: Unknown agent
    it("throws RoutingError for unknown agent", () => {
      expect(() =>
        engine.decide(
          { type: "ROUTE_TO_AGENT", agentId: "unknown-agent", threadAction: "reply" },
          config,
        ),
      ).toThrow(RoutingError);
      expect(() =>
        engine.decide(
          { type: "ROUTE_TO_AGENT", agentId: "unknown-agent", threadAction: "reply" },
          config,
        ),
      ).toThrow("unknown agent 'unknown-agent'");
    });

    // Task 54: Self-routing is valid
    it("allows self-routing — agent routes to itself", () => {
      const decision = engine.decide(
        { type: "ROUTE_TO_AGENT", agentId: "dev-agent", threadAction: "reply" },
        config,
      );

      expect(decision.targetAgentId).toBe("dev-agent");
      expect(decision.isTerminal).toBe(false);
    });
  });
});
