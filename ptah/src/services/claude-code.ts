import type { SkillRequest, SkillResponse } from "../types.js";

export interface SkillClient {
  invoke(request: SkillRequest): Promise<SkillResponse>;
}

export type ClaudeCodeInvokeFn = (options: {
  systemPrompt: string;
  userMessage: string;
  cwd: string;
  allowedTools: string[];
  signal: AbortSignal;
}) => Promise<string>;

const DEFAULT_ALLOWED_TOOLS = ["Edit", "Read", "Write", "Glob", "Grep"];

export class ClaudeCodeClient implements SkillClient {
  private invokeFn: ClaudeCodeInvokeFn;

  constructor(invokeFn: ClaudeCodeInvokeFn) {
    this.invokeFn = invokeFn;
  }

  async invoke(request: SkillRequest): Promise<SkillResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const textContent = await this.invokeFn({
        systemPrompt: request.systemPrompt,
        userMessage: request.userMessage,
        cwd: request.worktreePath,
        allowedTools: request.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
        signal: controller.signal,
      });

      return { textContent };
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        throw new Error(`Claude Code invocation timed out after ${request.timeoutMs}ms`);
      }

      if (error instanceof Error) {
        if (
          error.message.includes("rate limit") ||
          error.message.includes("Rate limit") ||
          error.message.includes("429")
        ) {
          const rateLimitError = new Error(`Rate limit exceeded: ${error.message}`);
          rateLimitError.name = "RateLimitError";
          throw rateLimitError;
        }
      }

      throw new Error(
        `Claude Code invocation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
