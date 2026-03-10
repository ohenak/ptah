export interface ThreadQueue {
  enqueue(threadId: string, task: () => Promise<void>): void;
  isProcessing(threadId: string): boolean;
}
