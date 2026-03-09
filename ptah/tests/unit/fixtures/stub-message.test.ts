import { describe, it, expect } from "vitest";
import { createStubMessage } from "../../fixtures/factories.js";

describe("createStubMessage", () => {
  describe("default values match TSPEC 13.4", () => {
    it("returns a message with default id 'msg-1'", () => {
      const msg = createStubMessage();
      expect(msg.id).toBe("msg-1");
    });

    it("returns a message with default content 'test message'", () => {
      const msg = createStubMessage();
      expect(msg.content).toBe("test message");
    });

    it("returns a message with default channelId 'thread-1'", () => {
      const msg = createStubMessage();
      expect(msg.channelId).toBe("thread-1");
    });

    it("returns a message with default createdAt", () => {
      const msg = createStubMessage();
      expect(msg.createdAt).toEqual(new Date("2026-03-09T12:00:00Z"));
    });

    it("returns a message with default author fields", () => {
      const msg = createStubMessage();
      expect(msg.author.id).toBe("user-1");
      expect(msg.author.displayName).toBe("TestUser");
      expect(msg.author.username).toBe("testuser");
      expect(msg.author.bot).toBe(false);
    });

    it("returns a message with default channel fields", () => {
      const msg = createStubMessage();
      expect(msg.channel.id).toBe("thread-1");
      expect((msg.channel as any).name).toBe("test-thread");
      expect((msg.channel as any).parentId).toBe("parent-1");
    });

    it("isThread() returns true by default", () => {
      const msg = createStubMessage();
      expect(msg.channel.isThread()).toBe(true);
    });
  });

  describe("each option overrides correctly", () => {
    it("overrides id", () => {
      const msg = createStubMessage({ id: "custom-id" });
      expect(msg.id).toBe("custom-id");
    });

    it("overrides content", () => {
      const msg = createStubMessage({ content: "custom content" });
      expect(msg.content).toBe("custom content");
    });

    it("overrides authorId", () => {
      const msg = createStubMessage({ authorId: "author-99" });
      expect(msg.author.id).toBe("author-99");
    });

    it("overrides authorName", () => {
      const msg = createStubMessage({ authorName: "CustomUser" });
      expect(msg.author.displayName).toBe("CustomUser");
      expect(msg.author.username).toBe("CustomUser");
    });

    it("overrides authorBot", () => {
      const msg = createStubMessage({ authorBot: true });
      expect(msg.author.bot).toBe(true);
    });

    it("overrides channelId for both message and channel", () => {
      const msg = createStubMessage({ channelId: "chan-99" });
      expect(msg.channelId).toBe("chan-99");
      expect(msg.channel.id).toBe("chan-99");
    });

    it("overrides channelName", () => {
      const msg = createStubMessage({ channelName: "custom-thread" });
      expect((msg.channel as any).name).toBe("custom-thread");
    });

    it("overrides parentId", () => {
      const msg = createStubMessage({ parentId: "parent-99" });
      expect((msg.channel as any).parentId).toBe("parent-99");
    });

    it("overrides parentId to null", () => {
      const msg = createStubMessage({ parentId: null });
      expect((msg.channel as any).parentId).toBeNull();
    });

    it("overrides createdAt", () => {
      const date = new Date("2025-01-01T00:00:00Z");
      const msg = createStubMessage({ createdAt: date });
      expect(msg.createdAt).toEqual(date);
    });
  });

  describe("isThread() returns expected boolean", () => {
    it("returns true when isThread is true", () => {
      const msg = createStubMessage({ isThread: true });
      expect(msg.channel.isThread()).toBe(true);
    });

    it("returns false when isThread is false", () => {
      const msg = createStubMessage({ isThread: false });
      expect(msg.channel.isThread()).toBe(false);
    });
  });
});
