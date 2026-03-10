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

describe("InMemoryThreadQueue", () => {
  // Task 31
  it("runs task immediately when no other task is processing for the thread", async () => {
    const queue = new InMemoryThreadQueue();
    let executed = false;

    queue.enqueue("thread-1", async () => {
      executed = true;
    });

    // Microtask should have run the task synchronously/immediately
    await Promise.resolve();
    expect(executed).toBe(true);
  });

  // Task 32
  it("runs same-thread tasks sequentially — second waits for first", async () => {
    const queue = new InMemoryThreadQueue();
    const order: number[] = [];
    const d1 = deferred();

    queue.enqueue("thread-1", async () => {
      await d1.promise;
      order.push(1);
    });

    queue.enqueue("thread-1", async () => {
      order.push(2);
    });

    // Second task should not have run yet
    await Promise.resolve();
    expect(order).toEqual([]);

    // Complete first task
    d1.resolve();
    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(order).toEqual([1, 2]);
  });

  // Task 33
  it("runs different-thread tasks concurrently", async () => {
    const queue = new InMemoryThreadQueue();
    const d1 = deferred();
    const d2 = deferred();
    let task1Started = false;
    let task2Started = false;

    queue.enqueue("thread-A", async () => {
      task1Started = true;
      await d1.promise;
    });

    queue.enqueue("thread-B", async () => {
      task2Started = true;
      await d2.promise;
    });

    // Both tasks should have started (running concurrently)
    await Promise.resolve();
    expect(task1Started).toBe(true);
    expect(task2Started).toBe(true);

    d1.resolve();
    d2.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });

  // Task 34
  it("isolates errors — a failing task does not block the next queued task", async () => {
    const queue = new InMemoryThreadQueue();
    let secondRan = false;

    queue.enqueue("thread-1", async () => {
      throw new Error("boom");
    });

    queue.enqueue("thread-1", async () => {
      secondRan = true;
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(secondRan).toBe(true);
  });

  // Task 35
  describe("isProcessing()", () => {
    it("returns true when a task is in-flight", async () => {
      const queue = new InMemoryThreadQueue();
      const d1 = deferred();

      queue.enqueue("thread-1", async () => {
        await d1.promise;
      });

      await Promise.resolve();
      expect(queue.isProcessing("thread-1")).toBe(true);

      d1.resolve();
      await new Promise((r) => setTimeout(r, 0));
      expect(queue.isProcessing("thread-1")).toBe(false);
    });

    it("returns true when tasks are queued", async () => {
      const queue = new InMemoryThreadQueue();
      const d1 = deferred();

      queue.enqueue("thread-1", async () => {
        await d1.promise;
      });
      queue.enqueue("thread-1", async () => {});

      expect(queue.isProcessing("thread-1")).toBe(true);

      d1.resolve();
      await new Promise((r) => setTimeout(r, 0));
      expect(queue.isProcessing("thread-1")).toBe(false);
    });

    it("returns false for an unknown thread", () => {
      const queue = new InMemoryThreadQueue();
      expect(queue.isProcessing("unknown")).toBe(false);
    });
  });
});
