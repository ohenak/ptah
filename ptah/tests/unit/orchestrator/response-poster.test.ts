import { describe, it, expect } from "vitest";
import { DefaultResponsePoster } from "../../../src/orchestrator/response-poster.js";
import { FakeDiscordClient, FakeLogger, defaultTestConfig } from "../../fixtures/factories.js";

function setup() {
  const discord = new FakeDiscordClient();
  const logger = new FakeLogger();
  const poster = new DefaultResponsePoster(discord, logger);
  const config = defaultTestConfig();
  return { discord, logger, poster, config };
}

describe("DefaultResponsePoster", () => {
  // postAgentResponse — plain messages at 2000 chars
  describe("postAgentResponse — plain messages (Phase 7)", () => {
    it("posts text as plain message via postPlainMessage", async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Hello from dev agent.",
        config,
      });

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls).toHaveLength(1);
      expect((plainCalls[0] as { method: "postPlainMessage"; threadId: string; content: string }).content).toBe("Hello from dev agent.");
      expect(plainCalls[0].threadId).toBe("thread-1");
    });

    it("uses 'No response text' for empty string", async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "",
        config,
      });

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls).toHaveLength(1);
      expect((plainCalls[0] as { method: "postPlainMessage"; threadId: string; content: string }).content).toBe("No response text");
    });

    it("does not split text at exactly 2000 chars (1 chunk)", async () => {
      const { discord, poster, config } = setup();
      const exactText = "a".repeat(2000);
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: exactText,
        config,
      });

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls).toHaveLength(1);
    });

    it("splits text at 2001 chars into 2 chunks", async () => {
      const { discord, poster, config } = setup();
      const longText = "b".repeat(2001);
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: longText,
        config,
      });

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls).toHaveLength(2);
      expect((plainCalls[0] as { method: "postPlainMessage"; threadId: string; content: string }).content).toHaveLength(2000);
      expect((plainCalls[1] as { method: "postPlainMessage"; threadId: string; content: string }).content).toHaveLength(1);
    });

    it("splits text at 2000*2+100 chars into 3 chunks", async () => {
      const { discord, poster, config } = setup();
      const longText = "c".repeat(2000 * 2 + 100);
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: longText,
        config,
      });

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls).toHaveLength(3);
    });

    it("returns PostResult with threadId", async () => {
      const { poster, config } = setup();
      const result = await poster.postAgentResponse({
        threadId: "thread-42",
        agentId: "dev-agent",
        text: "Done.",
        config,
      });

      expect(result.threadId).toBe("thread-42");
      expect(result.newThreadCreated).toBe(false);
    });

    it("does not post to embeds (no postEmbed calls)", async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Some response.",
        config,
      });

      expect(discord.postedEmbeds).toHaveLength(0);
    });
  });

  // postRoutingNotificationEmbed
  describe("postRoutingNotificationEmbed", () => {
    it("posts embed with blurple color (0x5865F2)", async () => {
      const { discord, poster } = setup();
      await poster.postRoutingNotificationEmbed({
        threadId: "thread-1",
        fromAgentDisplayName: "Orchestrator",
        toAgentDisplayName: "Dev Agent",
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0x5865F2);
      expect(discord.postedEmbeds[0].threadId).toBe("thread-1");
    });

    it("title includes toAgentDisplayName", async () => {
      const { discord, poster } = setup();
      await poster.postRoutingNotificationEmbed({
        threadId: "thread-1",
        fromAgentDisplayName: "Orchestrator",
        toAgentDisplayName: "Pm Agent",
      });

      expect(discord.postedEmbeds[0].title).toContain("Pm Agent");
    });

    it("falls back to plain message when postEmbed throws", async () => {
      const { discord, poster } = setup();
      discord.postEmbedError = new Error("Discord embed failed");

      await poster.postRoutingNotificationEmbed({
        threadId: "thread-1",
        fromAgentDisplayName: "Orchestrator",
        toAgentDisplayName: "Dev Agent",
      });

      // Should not throw; fallback plain message attempted
      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls.length).toBeGreaterThan(0);
    });
  });

  // postResolutionNotificationEmbed
  describe("postResolutionNotificationEmbed", () => {
    it("posts embed with green color (0x57F287) for LGTM", async () => {
      const { discord, poster } = setup();
      await poster.postResolutionNotificationEmbed({
        threadId: "thread-1",
        signalType: "LGTM",
        agentDisplayName: "Test Agent",
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0x57F287);
      expect(discord.postedEmbeds[0].threadId).toBe("thread-1");
    });

    it("posts embed with green color (0x57F287) for TASK_COMPLETE", async () => {
      const { discord, poster } = setup();
      await poster.postResolutionNotificationEmbed({
        threadId: "thread-1",
        signalType: "TASK_COMPLETE",
        agentDisplayName: "Dev Agent",
      });

      expect(discord.postedEmbeds[0].colour).toBe(0x57F287);
    });

    it("title includes LGTM for LGTM signal type", async () => {
      const { discord, poster } = setup();
      await poster.postResolutionNotificationEmbed({
        threadId: "thread-1",
        signalType: "LGTM",
        agentDisplayName: "Test Agent",
      });

      expect(discord.postedEmbeds[0].title).toContain("LGTM");
    });

    it("falls back to plain message when postEmbed throws", async () => {
      const { discord, poster } = setup();
      discord.postEmbedError = new Error("Discord embed failed");

      await poster.postResolutionNotificationEmbed({
        threadId: "thread-1",
        signalType: "LGTM",
        agentDisplayName: "Dev Agent",
      });

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls.length).toBeGreaterThan(0);
    });
  });

  // postErrorReportEmbed
  describe("postErrorReportEmbed", () => {
    it("posts embed with red color (0xED4245)", async () => {
      const { discord, poster } = setup();
      await poster.postErrorReportEmbed({
        threadId: "thread-1",
        errorType: "ERR-RP-01",
        context: { agentDisplayName: "Dev Agent" },
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0xED4245);
      expect(discord.postedEmbeds[0].threadId).toBe("thread-1");
    });

    it("title includes error type", async () => {
      const { discord, poster } = setup();
      await poster.postErrorReportEmbed({
        threadId: "thread-1",
        errorType: "ERR-RP-03",
        context: {},
      });

      expect(discord.postedEmbeds[0].title).toContain("ERR-RP-03");
    });

    it("falls back to plain message when postEmbed throws", async () => {
      const { discord, poster } = setup();
      discord.postEmbedError = new Error("Discord embed failed");

      await poster.postErrorReportEmbed({
        threadId: "thread-1",
        errorType: "ERR-RP-01",
        context: {},
      });

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls.length).toBeGreaterThan(0);
    });
  });

  // postUserEscalationEmbed
  describe("postUserEscalationEmbed", () => {
    it("posts embed with yellow color (0xFEE75C)", async () => {
      const { discord, poster } = setup();
      await poster.postUserEscalationEmbed({
        threadId: "thread-1",
        agentDisplayName: "PM Agent",
        question: "Which approach should I use?",
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0xFEE75C);
      expect(discord.postedEmbeds[0].threadId).toBe("thread-1");
    });

    it("description includes the question text", async () => {
      const { discord, poster } = setup();
      await poster.postUserEscalationEmbed({
        threadId: "thread-1",
        agentDisplayName: "PM Agent",
        question: "Should we use REST or GraphQL?",
      });

      expect(discord.postedEmbeds[0].description).toContain("Should we use REST or GraphQL?");
    });

    it("falls back to plain message when postEmbed throws", async () => {
      const { discord, poster } = setup();
      discord.postEmbedError = new Error("Discord embed failed");

      await poster.postUserEscalationEmbed({
        threadId: "thread-1",
        agentDisplayName: "PM Agent",
        question: "Any question?",
      });

      const plainCalls = discord.calls.filter((c) => c.method === "postPlainMessage");
      expect(plainCalls.length).toBeGreaterThan(0);
    });
  });

  // createCoordinationThread
  describe("createCoordinationThread (Phase 7 — routing notification embed)", () => {
    it("creates thread with correct naming convention", async () => {
      const { discord, poster, config } = setup();
      const threadId = await poster.createCoordinationThread({
        channelId: "channel-1",
        featureName: "Auth Flow",
        description: "implement OAuth",
        agentId: "dev-agent",
        initialText: "Starting auth implementation.",
        config,
      });

      expect(discord.createdThreads).toHaveLength(1);
      expect(discord.createdThreads[0].name).toBe("Auth Flow — implement OAuth");
      expect(discord.createdThreads[0].channelId).toBe("channel-1");
      expect(threadId).toBe("fake-thread-1");
    });

    it("posts initial embed with routing notification color (0x5865F2)", async () => {
      const { discord, poster, config } = setup();
      await poster.createCoordinationThread({
        channelId: "channel-1",
        featureName: "Auth",
        description: "login page",
        agentId: "dev-agent",
        initialText: "Getting started.",
        config,
      });

      const initialMsg = discord.createdThreads[0].initialMessage;
      expect(initialMsg.colour).toBe(0x5865F2);
    });

    it("returns thread ID", async () => {
      const { poster, config } = setup();
      const threadId = await poster.createCoordinationThread({
        channelId: "channel-1",
        featureName: "Feature",
        description: "desc",
        agentId: "dev-agent",
        initialText: "text",
        config,
      });

      expect(threadId).toBe("fake-thread-1");
    });

    it("retries once on thread creation failure and succeeds", async () => {
      const { discord, poster, config } = setup();
      discord.createThreadFailOnCall = 1;
      discord.createThreadError = new Error("Thread creation error");

      const threadId = await poster.createCoordinationThread({
        channelId: "channel-1",
        featureName: "Feature",
        description: "desc",
        agentId: "dev-agent",
        initialText: "text",
        config,
      });

      expect(threadId).toBe("fake-thread-1");
    });

    it("falls back to parent channel when retry also fails", async () => {
      const { discord, logger, poster, config } = setup();
      discord.createThreadError = new Error("Persistent thread error");

      const threadId = await poster.createCoordinationThread({
        channelId: "channel-1",
        featureName: "Feature",
        description: "desc",
        agentId: "dev-agent",
        initialText: "text",
        config,
      });

      // Falls back to parent channel
      expect(threadId).toBe("channel-1");
      // Posts embed in parent channel
      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].threadId).toBe("channel-1");

      const errorMessages = logger.messages.filter((m) => m.level === "error");
      expect(errorMessages.some((m) => m.message.includes("parent channel"))).toBe(true);
    });
  });
});
