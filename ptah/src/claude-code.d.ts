declare module "@anthropic-ai/claude-code" {
  export interface QueryOptions {
    prompt: string;
    systemPrompt?: string;
    cwd?: string;
    allowedTools?: string[];
    abortController?: AbortController;
  }

  export interface Message {
    role: string;
    content: string | Array<{ type: string; text: string }>;
  }

  export function query(options: QueryOptions): Promise<Message[]>;
}
