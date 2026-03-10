export interface TokenCounter {
  count(text: string): number;
}

export class CharTokenCounter implements TokenCounter {
  count(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
