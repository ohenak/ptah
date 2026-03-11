// src/orchestrator/merge-lock.ts

export interface MergeLock {
  acquire(timeoutMs?: number): Promise<MergeLockRelease>;
}

export type MergeLockRelease = () => void;

export class MergeLockTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Merge lock acquisition timed out after ${timeoutMs}ms`);
    this.name = "MergeLockTimeoutError";
  }
}

export class AsyncMutex implements MergeLock {
  private queue: Promise<void> = Promise.resolve();

  async acquire(timeoutMs = 10_000): Promise<MergeLockRelease> {
    let release: MergeLockRelease;
    const prev = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Wait for previous holder to release, with timeout
    await Promise.race([
      prev,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new MergeLockTimeoutError(timeoutMs)),
          timeoutMs,
        ),
      ),
    ]);

    return release!;
  }
}
