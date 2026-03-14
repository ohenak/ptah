import { describe, it, expect } from "vitest";
import { InMemoryThreadStateManager } from "../../../src/orchestrator/thread-state-manager.js";
import { createThreadMessage } from "../../fixtures/factories.js";

describe("InMemoryThreadStateManager", () => {
  describe("checkAndIncrementTurn", () => {
    it("allows first turn on unknown thread", () => {
      const mgr = new InMemoryThreadStateManager();
      expect(mgr.checkAndIncrementTurn("t1", 10)).toBe("allowed");
    });

    it("increments turn count on each allowed turn", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.checkAndIncrementTurn("t1", 10);
      mgr.checkAndIncrementTurn("t1", 10);
      mgr.checkAndIncrementTurn("t1", 10);
      // Should still be allowed since count = 3, max = 10
      expect(mgr.checkAndIncrementTurn("t1", 10)).toBe("allowed");
    });

    it("returns limit-reached when turn count reaches maxTurns", () => {
      const mgr = new InMemoryThreadStateManager();
      for (let i = 0; i < 3; i++) {
        mgr.checkAndIncrementTurn("t1", 3);
      }
      expect(mgr.checkAndIncrementTurn("t1", 3)).toBe("limit-reached");
    });

    it("returns limit-reached for closed thread", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.closeThread("t1");
      expect(mgr.checkAndIncrementTurn("t1", 10)).toBe("limit-reached");
    });

    it("returns limit-reached for stalled thread", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.stallReviewThread("t1");
      expect(mgr.checkAndIncrementTurn("t1", 10)).toBe("limit-reached");
    });
  });

  describe("closeThread", () => {
    it("transitions thread to closed status", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.closeThread("t1");
      expect(mgr.getStatus("t1")).toBe("closed");
    });
  });

  describe("review thread registration", () => {
    it("registers a review thread with parentThreadId", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.registerReviewThread("review-1", "parent-1");
      expect(mgr.isReviewThread("review-1")).toBe(true);
      expect(mgr.getParentThreadId("review-1")).toBe("parent-1");
    });

    it("isReviewThread returns false for unregistered thread", () => {
      const mgr = new InMemoryThreadStateManager();
      expect(mgr.isReviewThread("t1")).toBe(false);
    });

    it("getParentThreadId returns undefined for non-review thread", () => {
      const mgr = new InMemoryThreadStateManager();
      expect(mgr.getParentThreadId("t1")).toBeUndefined();
    });
  });

  describe("checkAndIncrementReviewTurn", () => {
    it("allows first 4 review turns", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.registerReviewThread("r1", "p1");
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("allowed");
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("allowed");
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("allowed");
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("allowed");
    });

    it("returns stalled on 5th review turn", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.registerReviewThread("r1", "p1");
      for (let i = 0; i < 4; i++) {
        mgr.checkAndIncrementReviewTurn("r1");
      }
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("stalled");
    });

    it("returns stalled for already-stalled thread", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.stallReviewThread("r1");
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("stalled");
    });
  });

  describe("stallReviewThread", () => {
    it("sets status to stalled", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.stallReviewThread("r1");
      expect(mgr.getStatus("r1")).toBe("stalled");
    });
  });

  describe("getStatus", () => {
    it("returns open for unknown thread", () => {
      const mgr = new InMemoryThreadStateManager();
      expect(mgr.getStatus("unknown")).toBe("open");
    });
  });

  describe("openThreadIds", () => {
    it("returns empty list when no threads", () => {
      const mgr = new InMemoryThreadStateManager();
      expect(mgr.openThreadIds()).toEqual([]);
    });

    it("returns only open thread IDs", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.checkAndIncrementTurn("t1", 10);
      mgr.checkAndIncrementTurn("t2", 10);
      mgr.closeThread("t2");
      const openIds = mgr.openThreadIds();
      expect(openIds).toContain("t1");
      expect(openIds).not.toContain("t2");
    });
  });

  describe("reconstructTurnCount", () => {
    it("counts non-bot messages that are not system messages", () => {
      const mgr = new InMemoryThreadStateManager();
      const messages = [
        createThreadMessage({ isBot: false, content: "Hello" }),
        createThreadMessage({ isBot: true, content: "Agent reply" }),
        createThreadMessage({ isBot: false, content: "Another message" }),
        createThreadMessage({ isBot: false, content: "\u23F8 Paused — system message" }),
        createThreadMessage({ isBot: false, content: "\uD83D\uDD12 Thread Closed" }),
        createThreadMessage({ isBot: false, content: "\uD83D\uDEA8 Review stalled" }),
        createThreadMessage({ isBot: false, content: "\u26D4 Agent Error" }),
      ];
      mgr.reconstructTurnCount("t1", messages, false);
      // Should count 2: "Hello" and "Another message"; skip bot and emoji-prefixed
      expect(mgr.getStatus("t1")).toBe("open");
      // After reconstruction, allow 8 more turns (10 - 2)
      for (let i = 0; i < 8; i++) {
        expect(mgr.checkAndIncrementTurn("t1", 10)).toBe("allowed");
      }
      expect(mgr.checkAndIncrementTurn("t1", 10)).toBe("limit-reached");
    });

    it("sets reviewTurnCount when isReview = true", () => {
      const mgr = new InMemoryThreadStateManager();
      mgr.registerReviewThread("r1", "p1");
      const messages = [
        createThreadMessage({ isBot: false, content: "Review comment 1" }),
        createThreadMessage({ isBot: false, content: "Review comment 2" }),
      ];
      mgr.reconstructTurnCount("r1", messages, true);
      // 2 turns used, so 2 more allowed before hitting limit of 4
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("allowed");
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("allowed");
      expect(mgr.checkAndIncrementReviewTurn("r1")).toBe("stalled");
    });

    it("does not double-count when called multiple times", () => {
      const mgr = new InMemoryThreadStateManager();
      const messages = [
        createThreadMessage({ isBot: false, content: "msg1" }),
        createThreadMessage({ isBot: false, content: "msg2" }),
      ];
      mgr.reconstructTurnCount("t1", messages, false);
      // Call again — should overwrite not accumulate
      mgr.reconstructTurnCount("t1", messages, false);
      // Should be at 2, not 4
      for (let i = 0; i < 8; i++) {
        mgr.checkAndIncrementTurn("t1", 10);
      }
      expect(mgr.checkAndIncrementTurn("t1", 10)).toBe("limit-reached");
    });
  });
});
