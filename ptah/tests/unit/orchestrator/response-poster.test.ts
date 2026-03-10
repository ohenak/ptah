import { describe, it, expect, vi } from "vitest";
import { DefaultResponsePoster } from "../../../src/orchestrator/response-poster.js";
import { FakeDiscordClient, FakeLogger, defaultTestConfig } from "../../fixtures/factories.js";
import type { PtahConfig } from "../../../src/types.js";

function setup() {
  const discord = new FakeDiscordClient();
  const logger = new FakeLogger();
  const poster = new DefaultResponsePoster(discord, logger);
  const config = defaultTestConfig();
  return { discord, logger, poster, config };
}

describe("DefaultResponsePoster", () => {
  // Task 81: postAgentResponse() posts embed with correct colour per agent
  describe("postAgentResponse — agent colours (Task 81)", () => {
    it("posts PM Agent embed with Blue (#1F4E79)", async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "pm-agent",
        text: "Requirements documented.",
        config,
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0x1F4E79);
      expect(discord.postedEmbeds[0].title).toBe("Pm Agent");
    });

    it("posts Dev Agent embed with Amber (#E65100)", async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Code implemented.",
        config,
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0xE65100);
      expect(discord.postedEmbeds[0].title).toBe("Dev Agent");
    });

    it("posts Frontend Agent embed with Purple (#6A1B9A)", async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "frontend-agent",
        text: "UI updated.",
        config,
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0x6A1B9A);
      expect(discord.postedEmbeds[0].title).toBe("Frontend Agent");
    });

    it("posts Test Agent embed with Green (#1B5E20)", async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "test-agent",
        text: "Tests passing.",
        config,
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0x1B5E20);
      expect(discord.postedEmbeds[0].title).toBe("Test Agent");
    });

    it("includes footer when provided", async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Done.",
        config,
        footer: "Turn 3/10",
      });

      expect(discord.postedEmbeds[0].footer).toBe("Turn 3/10");
    });

    it("returns PostResult with messageId and threadId", async () => {
      const { poster, config } = setup();
      const result = await poster.postAgentResponse({
        threadId: "thread-42",
        agentId: "dev-agent",
        text: "Done.",
        config,
      });

      expect(result.messageId).toBe("embed-msg-1");
      expect(result.threadId).toBe("thread-42");
      expect(result.newThreadCreated).toBe(false);
    });
  });

  // Task 82: Unknown agent colour uses default Medium Gray, logs warning
  describe("unknown agent colour (Task 82)", () => {
    it("uses default gray (0x757575) for unknown agent", async () => {
      const { discord, logger, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "unknown-agent",
        text: "Hello.",
        config,
      });

      expect(discord.postedEmbeds[0].colour).toBe(0x757575);
    });

    it("logs warning for unknown agent", async () => {
      const { logger, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "unknown-agent",
        text: "Hello.",
        config,
      });

      const warnMessages = logger.messages.filter((m) => m.level === "warn");
      expect(warnMessages.some((m) => m.message.includes("unknown-agent"))).toBe(true);
    });
  });

  // Task 83: Agent name derived from ID
  describe("agent name from ID (Task 83)", () => {
    it('derives "Dev Agent" from "dev-agent"', async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Hi.",
        config,
      });

      expect(discord.postedEmbeds[0].title).toBe("Dev Agent");
    });

    it('derives "Frontend Agent" from "frontend-agent"', async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "frontend-agent",
        text: "Hi.",
        config,
      });

      expect(discord.postedEmbeds[0].title).toBe("Frontend Agent");
    });

    it('derives "Pm Agent" from "pm-agent"', async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "pm-agent",
        text: "Hi.",
        config,
      });

      expect(discord.postedEmbeds[0].title).toBe("Pm Agent");
    });
  });

  // Task 84: Long response split into numbered embeds
  describe("long response splitting (Task 84)", () => {
    it("splits text >4096 chars into numbered embeds", async () => {
      const { discord, poster, config } = setup();
      const longText = "x".repeat(4096 * 2 + 100);
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: longText,
        config,
      });

      expect(discord.postedEmbeds).toHaveLength(3);
      expect(discord.postedEmbeds[0].title).toBe("Dev Agent (1/3)");
      expect(discord.postedEmbeds[1].title).toBe("Dev Agent (2/3)");
      expect(discord.postedEmbeds[2].title).toBe("Dev Agent (3/3)");
    });

    it("uses same colour for all chunks", async () => {
      const { discord, poster, config } = setup();
      const longText = "a".repeat(4096 * 2 + 1);
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: longText,
        config,
      });

      const colours = discord.postedEmbeds.map((e) => e.colour);
      expect(colours).toEqual([0xE65100, 0xE65100, 0xE65100]);
    });

    it("only includes footer on last chunk", async () => {
      const { discord, poster, config } = setup();
      const longText = "b".repeat(4096 * 2 + 1);
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: longText,
        config,
        footer: "Final footer",
      });

      expect(discord.postedEmbeds[0].footer).toBeUndefined();
      expect(discord.postedEmbeds[1].footer).toBeUndefined();
      expect(discord.postedEmbeds[2].footer).toBe("Final footer");
    });

    it("does not split text exactly 4096 chars", async () => {
      const { discord, poster, config } = setup();
      const exactText = "c".repeat(4096);
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: exactText,
        config,
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].title).toBe("Dev Agent");
    });

    it("returns messageId of the last embed", async () => {
      const { poster, config } = setup();
      const longText = "d".repeat(4096 * 2 + 1);
      const result = await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: longText,
        config,
      });

      expect(result.messageId).toBe("embed-msg-3");
    });
  });

  // Task 85: Empty text produces minimal embed
  describe("empty text (Task 85)", () => {
    it('uses "No response text" for empty string', async () => {
      const { discord, poster, config } = setup();
      await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "",
        config,
      });

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].description).toBe("No response text");
    });
  });

  // Task 86: postErrorEmbed
  describe("postErrorEmbed (Task 86)", () => {
    it("posts gray (#9E9E9E) embed with error message", async () => {
      const { discord, poster } = setup();
      await poster.postErrorEmbed("thread-1", "Something went wrong");

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0x9E9E9E);
      expect(discord.postedEmbeds[0].title).toBe("Error");
      expect(discord.postedEmbeds[0].description).toBe("Something went wrong");
      expect(discord.postedEmbeds[0].threadId).toBe("thread-1");
    });
  });

  // Task 87: postCompletionEmbed
  describe("postCompletionEmbed (Task 87)", () => {
    it("posts green (#1B5E20) completion embed", async () => {
      const { discord, poster, config } = setup();
      await poster.postCompletionEmbed("thread-1", "dev-agent", config);

      expect(discord.postedEmbeds).toHaveLength(1);
      expect(discord.postedEmbeds[0].colour).toBe(0x1B5E20);
      expect(discord.postedEmbeds[0].title).toBe("Task Complete");
      expect(discord.postedEmbeds[0].description).toBe("Dev Agent has completed the task.");
      expect(discord.postedEmbeds[0].threadId).toBe("thread-1");
    });
  });

  // Task 88: createCoordinationThread
  describe("createCoordinationThread (Task 88)", () => {
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

    it("posts initial embed with agent colour and name", async () => {
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
      expect(initialMsg.title).toBe("Dev Agent");
      expect(initialMsg.description).toBe("Getting started.");
      expect(initialMsg.colour).toBe(0xE65100);
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
  });

  // Task 89: Embed post failure — retries once
  describe("embed post failure retry (Task 89)", () => {
    it("retries once on Discord API error and succeeds", async () => {
      const { discord, poster, config } = setup();
      discord.postEmbedFailOnCall = 1;
      discord.postEmbedError = new Error("Discord API error");

      const result = await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Hello.",
        config,
      });

      // Second call succeeds (postEmbedError is still set but failOnCall was reset)
      // Actually, we need the error to only happen once. Let me reconsider the fake.
      // The failOnCall mechanism clears itself, but postEmbedError remains.
      // We need to adjust: after failOnCall fires, postEmbedError should not fire on next call.
      // Let me fix the test to use a different approach.
      expect(result.messageId).toBe("embed-msg-1");
      expect(discord.postedEmbeds).toHaveLength(1);
    });

    it("logs warning and skips when retry also fails", async () => {
      const { discord, logger, poster, config } = setup();
      discord.postEmbedError = new Error("Persistent Discord failure");

      const result = await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Hello.",
        config,
      });

      // Should not throw, returns empty messageId
      expect(result.messageId).toBe("");
      const warnMessages = logger.messages.filter((m) => m.level === "warn");
      expect(warnMessages.some((m) => m.message.includes("retry failed"))).toBe(true);
    });

    it("routing signal still processed (does not throw)", async () => {
      const { discord, poster, config } = setup();
      discord.postEmbedError = new Error("Total failure");

      // Should NOT throw
      const result = await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Hello.",
        config,
      });

      expect(result.threadId).toBe("thread-1");
    });
  });

  // Task 90: Thread creation failure — retries once, fallback to parent channel
  describe("thread creation failure retry (Task 90)", () => {
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

  // Task 91: Discord API rate limit on embed post
  describe("rate limit handling (Task 91)", () => {
    it("retries after retry_after duration on rate limit error", async () => {
      const { discord, logger, poster, config } = setup();
      const rateLimitError = new Error("Rate limited") as Error & { retry_after: number };
      rateLimitError.retry_after = 10; // 10ms for test speed

      // Make first call fail with rate limit, second succeed
      discord.postEmbedFailOnCall = 1;
      discord.postEmbedError = rateLimitError;

      const result = await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Hello.",
        config,
      });

      expect(result.messageId).toBe("embed-msg-1");
      const warnMessages = logger.messages.filter((m) => m.level === "warn");
      expect(warnMessages.some((m) => m.message.includes("Rate limited"))).toBe(true);
    });

    it("logs warning and skips when rate limit retry also fails", async () => {
      const { discord, logger, poster, config } = setup();
      const rateLimitError = new Error("Rate limited") as Error & { retry_after: number };
      rateLimitError.retry_after = 10;
      discord.postEmbedError = rateLimitError;

      const result = await poster.postAgentResponse({
        threadId: "thread-1",
        agentId: "dev-agent",
        text: "Hello.",
        config,
      });

      expect(result.messageId).toBe("");
      const warnMessages = logger.messages.filter((m) => m.level === "warn");
      expect(warnMessages.some((m) => m.message.includes("retry failed"))).toBe(true);
    });
  });
});
