import { describe, it, expect, vi } from "vitest";
import { ClaudeCodeClient, type ClaudeCodeInvokeFn } from "../../../src/services/claude-code.js";
import type { SkillRequest } from "../../../src/types.js";

function makeRequest(overrides: Partial<SkillRequest> = {}): SkillRequest {
  return {
    systemPrompt: "You are a helpful assistant.",
    userMessage: "Hello, world!",
    worktreePath: "/tmp/worktree",
    timeoutMs: 30_000,
    ...overrides,
  };
}

describe("ClaudeCodeClient", () => {
  // Task 116: invoke() calls Claude Code SDK with system prompt + user message + cwd
  describe("invoke() happy path", () => {
    it("calls invoke function with system prompt, user message, and cwd set to worktree path", async () => {
      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockResolvedValue("Generated code output");
      const client = new ClaudeCodeClient(invokeFn);

      const request = makeRequest({
        systemPrompt: "System prompt here",
        userMessage: "User message here",
        worktreePath: "/my/worktree",
      });
      const response = await client.invoke(request);

      expect(response.textContent).toBe("Generated code output");
      expect(invokeFn).toHaveBeenCalledTimes(1);
      const callArgs = invokeFn.mock.calls[0][0];
      expect(callArgs.systemPrompt).toBe("System prompt here");
      expect(callArgs.userMessage).toBe("User message here");
      expect(callArgs.cwd).toBe("/my/worktree");
    });

    it("returns text content from the SDK response", async () => {
      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockResolvedValue("The answer is 42");
      const client = new ClaudeCodeClient(invokeFn);

      const response = await client.invoke(makeRequest());
      expect(response).toEqual({ textContent: "The answer is 42" });
    });
  });

  // Task 117: allowedTools defaults
  describe("allowedTools defaults", () => {
    it("defaults to Edit, Read, Write, Glob, Grep — no Bash access", async () => {
      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockResolvedValue("ok");
      const client = new ClaudeCodeClient(invokeFn);

      await client.invoke(makeRequest());

      const callArgs = invokeFn.mock.calls[0][0];
      expect(callArgs.allowedTools).toEqual(["Edit", "Read", "Write", "Glob", "Grep"]);
      expect(callArgs.allowedTools).not.toContain("Bash");
    });

    it("uses custom allowedTools when provided", async () => {
      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockResolvedValue("ok");
      const client = new ClaudeCodeClient(invokeFn);

      await client.invoke(makeRequest({ allowedTools: ["Read", "Bash"] }));

      const callArgs = invokeFn.mock.calls[0][0];
      expect(callArgs.allowedTools).toEqual(["Read", "Bash"]);
    });
  });

  // Task 118: Timeout
  describe("timeout", () => {
    it("throws after timeoutMs elapsed", async () => {
      vi.useFakeTimers();

      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockImplementation(
        ({ signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          }),
      );
      const client = new ClaudeCodeClient(invokeFn);

      const promise = client.invoke(makeRequest({ timeoutMs: 5000 }));
      vi.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow("timed out after 5000ms");
      vi.useRealTimers();
    });
  });

  // Task 119: Process/API error
  describe("process/API error", () => {
    it("throws on Claude Code failure", async () => {
      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockRejectedValue(
        new Error("SDK connection failed"),
      );
      const client = new ClaudeCodeClient(invokeFn);

      await expect(client.invoke(makeRequest())).rejects.toThrow(
        "Claude Code invocation failed: SDK connection failed",
      );
    });

    it("handles non-Error rejections", async () => {
      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockRejectedValue("string error");
      const client = new ClaudeCodeClient(invokeFn);

      await expect(client.invoke(makeRequest())).rejects.toThrow(
        "Claude Code invocation failed: string error",
      );
    });
  });

  // Task 120: Rate limit error
  describe("rate limit error", () => {
    it("throws identifiable rate limit error when message contains 'rate limit'", async () => {
      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockRejectedValue(
        new Error("rate limit exceeded, retry after 60s"),
      );
      const client = new ClaudeCodeClient(invokeFn);

      try {
        await client.invoke(makeRequest());
        expect.fail("Expected error to be thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        const err = error as Error;
        expect(err.name).toBe("RateLimitError");
        expect(err.message).toContain("Rate limit exceeded");
      }
    });

    it("throws identifiable rate limit error when message contains '429'", async () => {
      const invokeFn = vi.fn<ClaudeCodeInvokeFn>().mockRejectedValue(
        new Error("HTTP 429 Too Many Requests"),
      );
      const client = new ClaudeCodeClient(invokeFn);

      try {
        await client.invoke(makeRequest());
        expect.fail("Expected error to be thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        const err = error as Error;
        expect(err.name).toBe("RateLimitError");
      }
    });
  });
});
