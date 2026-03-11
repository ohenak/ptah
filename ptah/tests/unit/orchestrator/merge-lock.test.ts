import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AsyncMutex,
  MergeLockTimeoutError,
} from "../../../src/orchestrator/merge-lock.js";

describe("AsyncMutex", () => {
  let mutex: AsyncMutex;

  beforeEach(() => {
    mutex = new AsyncMutex();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Task 17: Basic acquire/release
  describe("basic acquire/release", () => {
    it("acquire succeeds and returns a release function", async () => {
      const release = await mutex.acquire();
      expect(typeof release).toBe("function");
    });

    it("release frees the lock so it can be acquired again", async () => {
      const release1 = await mutex.acquire();
      release1();

      const release2 = await mutex.acquire();
      expect(typeof release2).toBe("function");
      release2();
    });
  });

  // Task 18: Serialization
  describe("serialization", () => {
    it("second acquire waits until first release; verify sequential execution", async () => {
      const order: string[] = [];

      const release1 = await mutex.acquire();
      order.push("acquire1");

      const p2 = mutex.acquire().then((release2) => {
        order.push("acquire2");
        order.push("work2");
        release2();
        order.push("release2");
      });

      order.push("work1");
      release1();
      order.push("release1");

      await p2;

      expect(order).toEqual([
        "acquire1",
        "work1",
        "release1",
        "acquire2",
        "work2",
        "release2",
      ]);
    });
  });

  // Task 19: Timeout
  describe("timeout", () => {
    it("second acquirer times out after configured ms, throws MergeLockTimeoutError", async () => {
      vi.useFakeTimers();

      const release1 = await mutex.acquire();

      const p2 = mutex.acquire(500);

      vi.advanceTimersByTime(500);

      await expect(p2).rejects.toThrow(MergeLockTimeoutError);
      await expect(p2).rejects.toThrow(
        "Merge lock acquisition timed out after 500ms",
      );

      release1();
    });
  });

  // Task 20: FIFO ordering
  describe("FIFO ordering", () => {
    it("multiple waiters are served in FIFO order", async () => {
      const order: number[] = [];

      const release1 = await mutex.acquire();

      const p2 = mutex.acquire().then((release) => {
        order.push(2);
        release();
      });

      const p3 = mutex.acquire().then((release) => {
        order.push(3);
        release();
      });

      const p4 = mutex.acquire().then((release) => {
        order.push(4);
        release();
      });

      release1();

      await Promise.all([p2, p3, p4]);

      expect(order).toEqual([2, 3, 4]);
    });
  });

  // Task 21: Release on every path
  describe("release on every path", () => {
    it("lock is released even when the holder's code throws (try/finally pattern)", async () => {
      const release1 = await mutex.acquire();

      try {
        throw new Error("critical section error");
      } catch {
        // error handled
      } finally {
        release1();
      }

      // Lock should be free — acquiring again should succeed immediately
      const release2 = await mutex.acquire();
      expect(typeof release2).toBe("function");
      release2();
    });

    it("after an error in the critical section, the next waiter can acquire", async () => {
      let acquired = false;

      const release1 = await mutex.acquire();

      const p2 = mutex.acquire().then((release2) => {
        acquired = true;
        release2();
      });

      // Simulate error in critical section with try/finally
      try {
        throw new Error("critical section error");
      } catch {
        // error handled
      } finally {
        release1();
      }

      await p2;
      expect(acquired).toBe(true);
    });
  });
});
