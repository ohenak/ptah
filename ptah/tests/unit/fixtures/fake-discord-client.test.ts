import { describe, it, expect } from "vitest";
import { FakeDiscordClient, createChannelMessage } from "../../fixtures/factories.js";
import type { ThreadMessage, ChannelMessage } from "../../../src/types.js";

function createTestMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
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

describe("FakeDiscordClient", () => {
  describe("connect", () => {
    it("sets connected and loginToken on success", async () => {
      const client = new FakeDiscordClient();
      await client.connect("test-token");
      expect(client.connected).toBe(true);
      expect(client.loginToken).toBe("test-token");
    });

    it("throws connectError when set", async () => {
      const client = new FakeDiscordClient();
      client.connectError = new Error("connection failed");
      await expect(client.connect("test-token")).rejects.toThrow("connection failed");
      expect(client.connected).toBe(false);
    });
  });

  describe("disconnect", () => {
    it("sets disconnected and clears connected", async () => {
      const client = new FakeDiscordClient();
      await client.connect("test-token");
      await client.disconnect();
      expect(client.disconnected).toBe(true);
      expect(client.connected).toBe(false);
    });
  });

  describe("findChannelByName", () => {
    it("returns channel id when channel exists", async () => {
      const client = new FakeDiscordClient();
      client.channels.set("agent-updates", "channel-123");
      const id = await client.findChannelByName("guild-1", "agent-updates");
      expect(id).toBe("channel-123");
    });

    it("returns null when channel not found", async () => {
      const client = new FakeDiscordClient();
      const id = await client.findChannelByName("guild-1", "nonexistent");
      expect(id).toBeNull();
    });
  });

  describe("onThreadMessage and simulateMessage", () => {
    it("invokes handler for matching parentChannelId", async () => {
      const client = new FakeDiscordClient();
      const received: ThreadMessage[] = [];
      client.onThreadMessage("parent-1", async (msg) => {
        received.push(msg);
      });

      const message = createTestMessage({ parentChannelId: "parent-1" });
      await client.simulateMessage(message);
      expect(received).toHaveLength(1);
      expect(received[0]).toBe(message);
    });

    it("does not invoke handler for non-matching parentChannelId", async () => {
      const client = new FakeDiscordClient();
      const received: ThreadMessage[] = [];
      client.onThreadMessage("parent-1", async (msg) => {
        received.push(msg);
      });

      const message = createTestMessage({ parentChannelId: "parent-other" });
      await client.simulateMessage(message);
      expect(received).toHaveLength(0);
    });

    it("awaits async handlers (TE Review R1)", async () => {
      const client = new FakeDiscordClient();
      const order: string[] = [];
      client.onThreadMessage("parent-1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push("handler-done");
      });

      const message = createTestMessage({ parentChannelId: "parent-1" });
      await client.simulateMessage(message);
      order.push("after-simulate");
      expect(order).toEqual(["handler-done", "after-simulate"]);
    });
  });

  describe("readThreadHistory", () => {
    it("returns messages for known thread", async () => {
      const client = new FakeDiscordClient();
      const messages = [createTestMessage({ id: "msg-1" }), createTestMessage({ id: "msg-2" })];
      client.threadHistory.set("thread-1", messages);
      const result = await client.readThreadHistory("thread-1");
      expect(result).toEqual(messages);
    });

    it("returns empty array for unknown thread", async () => {
      const client = new FakeDiscordClient();
      const result = await client.readThreadHistory("unknown");
      expect(result).toEqual([]);
    });
  });

  describe("Phase 5 methods", () => {
    it("postChannelMessage records call and returns configured response", async () => {
      const fake = new FakeDiscordClient();
      const id = await fake.postChannelMessage("ch-001", "Hello there");
      expect(id).toBe("msg-001");
      expect(fake.postChannelMessageCalls).toEqual([{ channelId: "ch-001", content: "Hello there" }]);
    });

    it("postChannelMessage throws when postChannelMessageError is set", async () => {
      const fake = new FakeDiscordClient();
      fake.postChannelMessageError = new Error("channel not found");
      await expect(fake.postChannelMessage("ch-001", "Hi")).rejects.toThrow("channel not found");
    });

    it("simulateChannelMessage routes to registered onChannelMessage handler", async () => {
      const fake = new FakeDiscordClient();
      const received: ChannelMessage[] = [];
      fake.onChannelMessage("ch-001", async (msg) => { received.push(msg); });
      const msg = createChannelMessage({ channelId: "ch-001" });
      await fake.simulateChannelMessage("ch-001", msg);
      expect(received).toHaveLength(1);
      expect(received[0].content).toBe(msg.content);
    });

    it("simulateChannelMessage is no-op when no handler registered for channelId", async () => {
      const fake = new FakeDiscordClient();
      await expect(fake.simulateChannelMessage("ch-999", createChannelMessage())).resolves.toBeUndefined();
    });

    it("addReaction records call", async () => {
      const fake = new FakeDiscordClient();
      await fake.addReaction("ch-001", "msg-abc", "✅");
      expect(fake.addReactionCalls).toEqual([{ channelId: "ch-001", messageId: "msg-abc", emoji: "✅" }]);
    });

    it("addReaction throws when addReactionError is set", async () => {
      const fake = new FakeDiscordClient();
      fake.addReactionError = new Error("reaction failed");
      await expect(fake.addReaction("ch-001", "msg-abc", "✅")).rejects.toThrow("reaction failed");
    });

    it("replyToMessage records call", async () => {
      const fake = new FakeDiscordClient();
      await fake.replyToMessage("ch-001", "msg-abc", "Got it!");
      expect(fake.replyToMessageCalls).toEqual([{ channelId: "ch-001", messageId: "msg-abc", content: "Got it!" }]);
    });

    it("replyToMessage throws when replyToMessageError is set", async () => {
      const fake = new FakeDiscordClient();
      fake.replyToMessageError = new Error("reply failed");
      await expect(fake.replyToMessage("ch-001", "msg-abc", "Hi")).rejects.toThrow("reply failed");
    });
  });
});
