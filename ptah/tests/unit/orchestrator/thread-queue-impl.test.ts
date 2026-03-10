import { describe, it, expect } from "vitest";
import { InMemoryThreadQueue } from "../../../src/orchestrator/thread-queue.js";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Task 36
describe("InMemoryThreadQueue — dedicated implementation test", () => {
  it("verifies sequential ordering with async resolution and error isolation", async () => {
    const queue = new InMemoryThreadQueue();
    const order: string[] = [];

    const d1 = deferred();
    const d2 = deferred();
    const d3 = deferred();

    // Enqueue three tasks on the same thread:
    // 1. completes normally (delayed)
    // 2. throws an error (delayed)
    // 3. completes normally (delayed)
    queue.enqueue("thread-1", async () => {
      await d1.promise;
      order.push("task-1-done");
    });

    queue.enqueue("thread-1", async () => {
      await d2.promise;
      throw new Error("task-2-error");
    });

    queue.enqueue("thread-1", async () => {
      await d3.promise;
      order.push("task-3-done");
    });

    // All three are queued; only the first should be in-flight
    expect(queue.isProcessing("thread-1")).toBe(true);
    expect(order).toEqual([]);

    // Resolve task 1
    d1.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["task-1-done"]);

    // Task 2 is now in-flight, task 3 is queued
    expect(queue.isProcessing("thread-1")).toBe(true);

    // Resolve task 2 (which will throw)
    d2.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Task 2 threw, but task 3 should now be in-flight
    expect(queue.isProcessing("thread-1")).toBe(true);

    // Resolve task 3
    d3.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["task-1-done", "task-3-done"]);

    // Queue is now drained
    expect(queue.isProcessing("thread-1")).toBe(false);
  });
});
