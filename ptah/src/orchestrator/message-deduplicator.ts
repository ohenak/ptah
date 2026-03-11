export interface MessageDeduplicator {
  isDuplicate(messageId: string): boolean;
}

export class InMemoryMessageDeduplicator implements MessageDeduplicator {
  private seen = new Set<string>();

  isDuplicate(messageId: string): boolean {
    if (this.seen.has(messageId)) return true;
    this.seen.add(messageId);
    return false;
  }
}
