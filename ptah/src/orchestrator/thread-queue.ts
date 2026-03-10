export interface ThreadQueue {
  enqueue(threadId: string, task: () => Promise<void>): void;
  isProcessing(threadId: string): boolean;
}

export class InMemoryThreadQueue implements ThreadQueue {
  private queues = new Map<string, Array<() => Promise<void>>>();
  private processing = new Map<string, boolean>();

  enqueue(threadId: string, task: () => Promise<void>): void {
    if (!this.queues.has(threadId)) {
      this.queues.set(threadId, []);
    }

    this.queues.get(threadId)!.push(task);

    if (!this.processing.get(threadId)) {
      this.processQueue(threadId);
    }
  }

  isProcessing(threadId: string): boolean {
    const queue = this.queues.get(threadId);
    const isActive = this.processing.get(threadId) ?? false;
    const hasQueued = queue !== undefined && queue.length > 0;
    return isActive || hasQueued;
  }

  private async processQueue(threadId: string): Promise<void> {
    this.processing.set(threadId, true);

    while (true) {
      const queue = this.queues.get(threadId);
      if (!queue || queue.length === 0) {
        break;
      }

      const task = queue.shift()!;
      try {
        await task();
      } catch {
        // Error isolation: swallow error so next task can proceed
      }
    }

    this.processing.set(threadId, false);
    this.queues.delete(threadId);
  }
}
