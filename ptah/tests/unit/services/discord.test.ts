import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChannelType, GatewayIntentBits, type Client, type ClientOptions } from "discord.js";
import EventEmitter from "node:events";
import { DiscordJsClient } from "../../../src/services/discord.js";
import { FakeLogger, createStubMessage } from "../../fixtures/factories.js";

function createStubClient() {
  const emitter = new EventEmitter();
  const stub = Object.assign(emitter, {
    login: vi.fn().mockResolvedValue("token"),
    destroy: vi.fn(),
    guilds: {
      fetch: vi.fn(),
    },
    channels: {
      fetch: vi.fn(),
    },
    user: { id: "bot-user-id" },
  }) as unknown as Client;
  return stub;
}

describe("DiscordJsClient", () => {
  let logger: FakeLogger;
  let stubClient: ReturnType<typeof createStubClient>;
  let discordClient: DiscordJsClient;

  beforeEach(() => {
    logger = new FakeLogger();
    stubClient = createStubClient();
    discordClient = new DiscordJsClient(logger, () => stubClient);
  });

  // Task 26: connect()
  describe("connect", () => {
    it("calls client.login with the provided token", async () => {
      const connectPromise = discordClient.connect("my-bot-token");
      // Emit ready after login
      (stubClient as any).emit("ready", stubClient);
      await connectPromise;
      expect((stubClient as any).login).toHaveBeenCalledWith("my-bot-token");
    });

    it("resolves when ready event fires", async () => {
      const connectPromise = discordClient.connect("my-bot-token");
      (stubClient as any).emit("ready", stubClient);
      await expect(connectPromise).resolves.toBeUndefined();
    });

    it("rejects after 30 seconds if ready not received", async () => {
      vi.useFakeTimers();
      const connectPromise = discordClient.connect("my-bot-token");
      vi.advanceTimersByTime(30000);
      await expect(connectPromise).rejects.toThrow(
        "connection timed out after 30 seconds",
      );
      vi.useRealTimers();
    });

    it("does not reject if ready fires before timeout", async () => {
      vi.useFakeTimers();
      const connectPromise = discordClient.connect("my-bot-token");
      (stubClient as any).emit("ready", stubClient);
      vi.advanceTimersByTime(30000);
      await expect(connectPromise).resolves.toBeUndefined();
      vi.useRealTimers();
    });
  });

  // Task 27: disconnect()
  describe("disconnect", () => {
    it("calls client.destroy()", async () => {
      await discordClient.disconnect();
      expect((stubClient as any).destroy).toHaveBeenCalled();
    });

    // PROP-DI-46: disconnect() idempotent
    it("can be safely called twice without error", async () => {
      await discordClient.disconnect();
      await discordClient.disconnect();
      expect((stubClient as any).destroy).toHaveBeenCalledTimes(2);
    });
  });

  // M-02: Connect-after-disconnect guard (PROP-DI-61)
  describe("connect after disconnect", () => {
    it("throws when connect() is called after disconnect()", async () => {
      await discordClient.disconnect();
      await expect(discordClient.connect("my-bot-token")).rejects.toThrow(
        "Cannot connect: client has been destroyed. Create a new DiscordJsClient instance.",
      );
    });
  });

  // Task 28: findChannelByName()
  describe("findChannelByName", () => {
    it("returns channel ID for matching text channel", async () => {
      const channels = new Map([
        ["chan-1", { id: "chan-1", name: "agent-updates", type: ChannelType.GuildText }],
        ["chan-2", { id: "chan-2", name: "general", type: ChannelType.GuildText }],
      ]);
      const guild = {
        channels: {
          fetch: vi.fn().mockResolvedValue(channels),
        },
      };
      (stubClient as any).guilds.fetch.mockResolvedValue(guild);

      const result = await discordClient.findChannelByName("guild-1", "agent-updates");
      expect(result).toBe("chan-1");
    });

    it("returns null when channel not found", async () => {
      const channels = new Map([
        ["chan-1", { id: "chan-1", name: "general", type: ChannelType.GuildText }],
      ]);
      const guild = {
        channels: {
          fetch: vi.fn().mockResolvedValue(channels),
        },
      };
      (stubClient as any).guilds.fetch.mockResolvedValue(guild);

      const result = await discordClient.findChannelByName("guild-1", "nonexistent");
      expect(result).toBeNull();
    });

    it("throws if guild not found", async () => {
      (stubClient as any).guilds.fetch.mockRejectedValue(
        new Error("Unknown Guild"),
      );

      await expect(
        discordClient.findChannelByName("bad-guild", "agent-updates"),
      ).rejects.toThrow("Unknown Guild");
    });
  });

  // Task 29: onThreadMessage() filtering
  describe("onThreadMessage filtering", () => {
    it("ignores bot messages", async () => {
      const handler = vi.fn();
      discordClient.onThreadMessage("parent-1", handler);

      const botMessage = createStubMessage({ authorBot: true, parentId: "parent-1" });
      (stubClient as any).emit("messageCreate", botMessage);

      // Give the async handler a tick to run
      await new Promise((r) => setTimeout(r, 0));
      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores non-thread messages", async () => {
      const handler = vi.fn();
      discordClient.onThreadMessage("parent-1", handler);

      const nonThreadMessage = createStubMessage({
        isThread: false,
        parentId: "parent-1",
      });
      (stubClient as any).emit("messageCreate", nonThreadMessage);

      await new Promise((r) => setTimeout(r, 0));
      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores messages from wrong parent channel", async () => {
      const handler = vi.fn();
      discordClient.onThreadMessage("parent-1", handler);

      const wrongParent = createStubMessage({ parentId: "parent-other" });
      (stubClient as any).emit("messageCreate", wrongParent);

      await new Promise((r) => setTimeout(r, 0));
      expect(handler).not.toHaveBeenCalled();
    });

    it("invokes handler with converted ThreadMessage for matching messages", async () => {
      const handler = vi.fn();
      discordClient.onThreadMessage("parent-1", handler);

      const validMessage = createStubMessage({
        id: "msg-42",
        content: "hello world",
        authorId: "user-1",
        authorName: "TestUser",
        authorBot: false,
        channelId: "thread-1",
        channelName: "test-thread",
        parentId: "parent-1",
        isThread: true,
        createdAt: new Date("2026-03-09T12:00:00Z"),
      });
      (stubClient as any).emit("messageCreate", validMessage);

      await new Promise((r) => setTimeout(r, 0));
      expect(handler).toHaveBeenCalledTimes(1);
      const threadMsg = handler.mock.calls[0][0];
      expect(threadMsg.id).toBe("msg-42");
      expect(threadMsg.content).toBe("hello world");
      expect(threadMsg.threadId).toBe("thread-1");
      expect(threadMsg.threadName).toBe("test-thread");
      expect(threadMsg.parentChannelId).toBe("parent-1");
      expect(threadMsg.authorId).toBe("user-1");
      expect(threadMsg.authorName).toBe("TestUser");
      expect(threadMsg.isBot).toBe(false);
      expect(threadMsg.timestamp).toEqual(new Date("2026-03-09T12:00:00Z"));
    });
  });

  // Task 30: onThreadMessage() error boundary
  describe("onThreadMessage error boundary", () => {
    it("catches handler errors and logs them via Logger", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("handler boom"));
      discordClient.onThreadMessage("parent-1", handler);

      const message = createStubMessage({ parentId: "parent-1" });
      (stubClient as any).emit("messageCreate", message);

      await new Promise((r) => setTimeout(r, 0));
      expect(handler).toHaveBeenCalled();
      expect(logger.messages).toContainEqual({
        level: "error",
        message: expect.stringContaining("handler boom"),
      });
    });

    it("continues processing messages after a handler error", async () => {
      let callCount = 0;
      const handler = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("first message error");
        }
      });
      discordClient.onThreadMessage("parent-1", handler);

      const msg1 = createStubMessage({ id: "msg-1", parentId: "parent-1" });
      const msg2 = createStubMessage({ id: "msg-2", parentId: "parent-1" });

      (stubClient as any).emit("messageCreate", msg1);
      await new Promise((r) => setTimeout(r, 0));

      (stubClient as any).emit("messageCreate", msg2);
      await new Promise((r) => setTimeout(r, 0));

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  // Task 31: toThreadMessage() conversion
  describe("toThreadMessage conversion", () => {
    it("maps all 9 fields correctly from discord.js Message", async () => {
      const handler = vi.fn();
      discordClient.onThreadMessage("parent-1", handler);

      const discordMessage = createStubMessage({
        id: "msg-100",
        content: "mapped content",
        authorId: "author-42",
        authorName: "MapUser",
        authorBot: false,
        channelId: "thread-55",
        channelName: "mapped-thread",
        parentId: "parent-1",
        isThread: true,
        createdAt: new Date("2026-01-15T08:30:00Z"),
      });

      (stubClient as any).emit("messageCreate", discordMessage);
      await new Promise((r) => setTimeout(r, 0));

      expect(handler).toHaveBeenCalledTimes(1);
      const tm = handler.mock.calls[0][0];
      expect(tm).toEqual({
        id: "msg-100",
        threadId: "thread-55",
        threadName: "mapped-thread",
        parentChannelId: "parent-1",
        authorId: "author-42",
        authorName: "MapUser",
        isBot: false,
        content: "mapped content",
        timestamp: new Date("2026-01-15T08:30:00Z"),
      });
    });
  });

  // Task 32: readThreadHistory()
  describe("readThreadHistory", () => {
    it("returns ThreadMessage[] sorted oldest-first for a single batch", async () => {
      const msg1 = createStubMessage({
        id: "msg-1",
        createdAt: new Date("2026-03-09T12:00:00Z"),
        channelId: "thread-1",
        channelName: "test-thread",
        parentId: "parent-1",
      });
      const msg2 = createStubMessage({
        id: "msg-2",
        createdAt: new Date("2026-03-09T12:01:00Z"),
        channelId: "thread-1",
        channelName: "test-thread",
        parentId: "parent-1",
      });

      // messages.fetch returns a Collection-like Map
      const batch = new Map([
        ["msg-2", msg2],
        ["msg-1", msg1],
      ]);
      const threadChannel = {
        id: "thread-1",
        name: "test-thread",
        parentId: "parent-1",
        isThread: () => true,
        messages: {
          fetch: vi.fn().mockResolvedValue(batch),
        },
      };
      (stubClient as any).channels.fetch.mockResolvedValue(threadChannel);

      const result = await discordClient.readThreadHistory("thread-1");
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("msg-1");
      expect(result[1].id).toBe("msg-2");
      expect(result[0].timestamp.getTime()).toBeLessThan(result[1].timestamp.getTime());
    });

    it("paginates up to 200 messages with 2 API calls", async () => {
      // Create 100 messages for first batch (recent messages)
      const batch1 = new Map<string, any>();
      for (let i = 0; i < 100; i++) {
        const ts = new Date("2026-03-09T12:00:00Z");
        ts.setSeconds(i);
        const msg = createStubMessage({
          id: `msg-${100 + i}`,
          createdAt: ts,
          channelId: "thread-1",
          channelName: "test-thread",
          parentId: "parent-1",
        });
        batch1.set(`msg-${100 + i}`, msg);
      }

      // Create 50 messages for second batch (older messages)
      const batch2 = new Map<string, any>();
      for (let i = 0; i < 50; i++) {
        const ts = new Date("2026-03-08T12:00:00Z");
        ts.setSeconds(i);
        const msg = createStubMessage({
          id: `msg-${i}`,
          createdAt: ts,
          channelId: "thread-1",
          channelName: "test-thread",
          parentId: "parent-1",
        });
        batch2.set(`msg-${i}`, msg);
      }

      const fetchFn = vi.fn()
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2);

      const threadChannel = {
        id: "thread-1",
        name: "test-thread",
        parentId: "parent-1",
        isThread: () => true,
        messages: { fetch: fetchFn },
      };
      (stubClient as any).channels.fetch.mockResolvedValue(threadChannel);

      const result = await discordClient.readThreadHistory("thread-1");
      expect(result).toHaveLength(150);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      // Verify oldest-first ordering
      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          result[i - 1].timestamp.getTime(),
        );
      }
    });

    it("returns empty array for empty thread", async () => {
      const emptyBatch = new Map();
      const threadChannel = {
        id: "thread-1",
        name: "test-thread",
        parentId: "parent-1",
        isThread: () => true,
        messages: {
          fetch: vi.fn().mockResolvedValue(emptyBatch),
        },
      };
      (stubClient as any).channels.fetch.mockResolvedValue(threadChannel);

      const result = await discordClient.readThreadHistory("thread-1");
      expect(result).toEqual([]);
    });

    it("logs warning if >200 messages (2 full batches)", async () => {
      // First batch: 100 messages
      const batch1 = new Map<string, any>();
      for (let i = 0; i < 100; i++) {
        const ts = new Date("2026-03-09T12:00:00Z");
        ts.setSeconds(i);
        const msg = createStubMessage({
          id: `msg-${100 + i}`,
          createdAt: ts,
          channelId: "thread-1",
          channelName: "test-thread",
          parentId: "parent-1",
        });
        batch1.set(`msg-${100 + i}`, msg);
      }

      // Second batch: 100 messages (full = indicates more exist)
      const batch2 = new Map<string, any>();
      for (let i = 0; i < 100; i++) {
        const ts = new Date("2026-03-08T12:00:00Z");
        ts.setSeconds(i);
        const msg = createStubMessage({
          id: `msg-${i}`,
          createdAt: ts,
          channelId: "thread-1",
          channelName: "test-thread",
          parentId: "parent-1",
        });
        batch2.set(`msg-${i}`, msg);
      }

      const fetchFn = vi.fn()
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2);

      const threadChannel = {
        id: "thread-1",
        name: "test-thread",
        parentId: "parent-1",
        isThread: () => true,
        messages: { fetch: fetchFn },
      };
      (stubClient as any).channels.fetch.mockResolvedValue(threadChannel);

      const result = await discordClient.readThreadHistory("thread-1");
      expect(result).toHaveLength(200);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(logger.messages).toContainEqual({
        level: "warn",
        message: expect.stringContaining(">200 messages"),
      });
    });
  });

  // PROP-DI-15: Gateway intents
  describe("gateway intents", () => {
    it("creates client with required gateway intents", () => {
      const factorySpy = vi.fn().mockReturnValue(createStubClient());
      new DiscordJsClient(new FakeLogger(), factorySpy);

      expect(factorySpy).toHaveBeenCalledTimes(1);
      const options = factorySpy.mock.calls[0][0];
      expect(options.intents).toContain(GatewayIntentBits.Guilds);
      expect(options.intents).toContain(GatewayIntentBits.GuildMessages);
      expect(options.intents).toContain(GatewayIntentBits.MessageContent);
    });
  });

  // Task 33: Internal warn/error listeners
  describe("internal warn/error listeners", () => {
    it("logs warn messages from discord.js client via Logger", () => {
      (stubClient as any).emit("warn", "Gateway session warning");
      expect(logger.messages).toContainEqual({
        level: "warn",
        message: "Gateway session warning",
      });
    });

    it("logs error messages from discord.js client via Logger", () => {
      (stubClient as any).emit("error", new Error("WebSocket error"));
      expect(logger.messages).toContainEqual({
        level: "error",
        message: "WebSocket error",
      });
    });
  });
});
