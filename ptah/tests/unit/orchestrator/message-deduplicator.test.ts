import { describe, it, expect } from "vitest";
import { InMemoryMessageDeduplicator } from "../../../src/orchestrator/message-deduplicator.js";

describe("InMemoryMessageDeduplicator", () => {
  // Task 22
  it("returns false for a first-seen message ID and adds it to the internal set", () => {
    const dedup = new InMemoryMessageDeduplicator();

    const result = dedup.isDuplicate("msg-1");

    expect(result).toBe(false);
  });

  // Task 23
  it("returns true on the second call with the same message ID", () => {
    const dedup = new InMemoryMessageDeduplicator();

    dedup.isDuplicate("msg-1");
    const result = dedup.isDuplicate("msg-1");

    expect(result).toBe(true);
  });

  // Task 24
  it("treats different message IDs independently", () => {
    const dedup = new InMemoryMessageDeduplicator();

    const first = dedup.isDuplicate("msg-1");
    const second = dedup.isDuplicate("msg-2");

    expect(first).toBe(false);
    expect(second).toBe(false);
  });
});
