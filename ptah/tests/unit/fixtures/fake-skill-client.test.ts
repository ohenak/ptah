import { describe, it, expect } from "vitest";
import { FakeSkillClient } from "../../fixtures/factories.js";
import type { SkillRequest } from "../../../src/types.js";

function createTestRequest(overrides: Partial<SkillRequest> = {}): SkillRequest {
  return {
    systemPrompt: "You are a test agent.",
    userMessage: "Do something.",
    worktreePath: "/tmp/ptah-worktrees/test",
    timeoutMs: 90_000,
    ...overrides,
  };
}

describe("FakeSkillClient", () => {
  describe("invoke", () => {
    it("returns responses sequentially by call index", async () => {
      const client = new FakeSkillClient();
      client.responses = [
        { textContent: "first response" },
        { textContent: "second response" },
      ];

      const r1 = await client.invoke(createTestRequest());
      const r2 = await client.invoke(createTestRequest({ userMessage: "second call" }));

      expect(r1.textContent).toBe("first response");
      expect(r2.textContent).toBe("second response");
    });

    it("records all invocations", async () => {
      const client = new FakeSkillClient();
      client.responses = [{ textContent: "ok" }];

      const request = createTestRequest({ userMessage: "tracked call" });
      await client.invoke(request);

      expect(client.invocations).toHaveLength(1);
      expect(client.invocations[0].userMessage).toBe("tracked call");
    });

    it("throws invokeError when set", async () => {
      const client = new FakeSkillClient();
      client.invokeError = new Error("claude code unavailable");

      await expect(client.invoke(createTestRequest())).rejects.toThrow(
        "claude code unavailable",
      );
      expect(client.invocations).toHaveLength(1);
    });

    it("throws when no response is configured for the call index", async () => {
      const client = new FakeSkillClient();
      client.responses = [{ textContent: "only one" }];

      await client.invoke(createTestRequest());
      await expect(client.invoke(createTestRequest())).rejects.toThrow(
        "no response configured for call index 1",
      );
    });

    it("throws invokeError even when responses are configured", async () => {
      const client = new FakeSkillClient();
      client.responses = [{ textContent: "should not return" }];
      client.invokeError = new Error("forced error");

      await expect(client.invoke(createTestRequest())).rejects.toThrow("forced error");
    });
  });
});
