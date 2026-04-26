import { describe, it, expect } from "vitest";
import { makeAgentEntry, makeRegisteredAgent, FakeTemporalClient } from "../../fixtures/factories.js";
import type { AgentEntry, RegisteredAgent } from "../../../src/types.js";

describe("makeAgentEntry", () => {
  it("returns a valid AgentEntry with sensible defaults", () => {
    const entry = makeAgentEntry();
    expect(entry.id).toBe("test-agent");
    expect(entry.skill_path).toBe("./ptah/skills/test-agent.md");
    expect(entry.log_file).toBe("./ptah/logs/test-agent.log");
    expect(entry.mention_id).toBe("111111111111111111");
    expect(entry.display_name).toBe("Test Agent");
  });

  it("allows overriding individual fields", () => {
    const entry = makeAgentEntry({ id: "custom-agent", mention_id: "999999999999999999" });
    expect(entry.id).toBe("custom-agent");
    expect(entry.mention_id).toBe("999999999999999999");
    // non-overridden fields retain defaults
    expect(entry.skill_path).toBe("./ptah/skills/test-agent.md");
  });

  it("returns a plain object matching AgentEntry shape", () => {
    const entry: AgentEntry = makeAgentEntry();
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.skill_path).toBe("string");
    expect(typeof entry.log_file).toBe("string");
    expect(typeof entry.mention_id).toBe("string");
  });
});

describe("makeRegisteredAgent", () => {
  it("returns a valid RegisteredAgent with sensible defaults", () => {
    const agent = makeRegisteredAgent();
    expect(agent.id).toBe("test-agent");
    expect(agent.skill_path).toBe("./ptah/skills/test-agent.md");
    expect(agent.log_file).toBe("./ptah/logs/test-agent.log");
    expect(agent.mention_id).toBe("111111111111111111");
    expect(agent.display_name).toBe("Test Agent");
  });

  it("allows overriding individual fields", () => {
    const agent = makeRegisteredAgent({ id: "pm-agent", display_name: "PM Agent" });
    expect(agent.id).toBe("pm-agent");
    expect(agent.display_name).toBe("PM Agent");
    // non-overridden fields retain defaults
    expect(agent.mention_id).toBe("111111111111111111");
  });

  it("returns a plain object matching RegisteredAgent shape with display_name always set", () => {
    const agent: RegisteredAgent = makeRegisteredAgent();
    expect(typeof agent.display_name).toBe("string");
    expect(agent.display_name.length).toBeGreaterThan(0);
  });
});

describe("FakeTemporalClient", () => {
  describe("signalHumanAnswer", () => {
    it("records the call in humanAnswerSignals array", async () => {
      const client = new FakeTemporalClient();

      await client.signalHumanAnswer("ptah-my-feature", "Yes, use GitHub OAuth");

      expect(client.humanAnswerSignals).toHaveLength(1);
      expect(client.humanAnswerSignals[0]).toEqual({
        workflowId: "ptah-my-feature",
        answer: "Yes, use GitHub OAuth",
      });
    });

    it("accumulates multiple signalHumanAnswer calls in order", async () => {
      const client = new FakeTemporalClient();

      await client.signalHumanAnswer("ptah-feature-a", "Answer one");
      await client.signalHumanAnswer("ptah-feature-b", "Answer two");

      expect(client.humanAnswerSignals).toHaveLength(2);
      expect(client.humanAnswerSignals[0]!.workflowId).toBe("ptah-feature-a");
      expect(client.humanAnswerSignals[1]!.workflowId).toBe("ptah-feature-b");
    });
  });

  describe("listWorkflowsByPrefix — statusFilter", () => {
    it("returns only Running workflow IDs when statusFilter is ['Running']", async () => {
      const client = new FakeTemporalClient();
      // Pre-populate workflowIds for the prefix
      client.workflowIds.set("ptah-", ["ptah-feature-a", "ptah-feature-b"]);
      // Pre-populate workflow statuses
      client.workflowStatuses.set("ptah-feature-a", "Running");
      client.workflowStatuses.set("ptah-feature-b", "Completed");

      const result = await client.listWorkflowsByPrefix("ptah-", { statusFilter: ["Running"] });

      expect(result).toEqual(["ptah-feature-a"]);
      expect(result).not.toContain("ptah-feature-b");
    });

    it("returns only ContinuedAsNew workflow IDs when statusFilter is ['ContinuedAsNew']", async () => {
      const client = new FakeTemporalClient();
      client.workflowIds.set("ptah-", ["ptah-feature-a", "ptah-feature-b", "ptah-feature-c"]);
      client.workflowStatuses.set("ptah-feature-a", "Running");
      client.workflowStatuses.set("ptah-feature-b", "ContinuedAsNew");
      client.workflowStatuses.set("ptah-feature-c", "Completed");

      const result = await client.listWorkflowsByPrefix("ptah-", { statusFilter: ["ContinuedAsNew"] });

      expect(result).toEqual(["ptah-feature-b"]);
    });

    it("returns Running and ContinuedAsNew IDs when statusFilter includes both", async () => {
      const client = new FakeTemporalClient();
      client.workflowIds.set("ptah-", ["ptah-a", "ptah-b", "ptah-c"]);
      client.workflowStatuses.set("ptah-a", "Running");
      client.workflowStatuses.set("ptah-b", "ContinuedAsNew");
      client.workflowStatuses.set("ptah-c", "Completed");

      const result = await client.listWorkflowsByPrefix("ptah-", {
        statusFilter: ["Running", "ContinuedAsNew"],
      });

      expect(result).toContain("ptah-a");
      expect(result).toContain("ptah-b");
      expect(result).not.toContain("ptah-c");
      expect(result).toHaveLength(2);
    });

    it("returns all IDs unchanged when no statusFilter is provided (backward compat)", async () => {
      const client = new FakeTemporalClient();
      client.workflowIds.set("ptah-", ["ptah-feature-a", "ptah-feature-b"]);
      client.workflowStatuses.set("ptah-feature-a", "Running");
      client.workflowStatuses.set("ptah-feature-b", "Completed");

      const result = await client.listWorkflowsByPrefix("ptah-");

      expect(result).toEqual(["ptah-feature-a", "ptah-feature-b"]);
    });

    it("returns all IDs when options is provided but statusFilter is absent", async () => {
      const client = new FakeTemporalClient();
      client.workflowIds.set("ptah-", ["ptah-feature-a", "ptah-feature-b"]);
      client.workflowStatuses.set("ptah-feature-a", "Running");
      client.workflowStatuses.set("ptah-feature-b", "Completed");

      const result = await client.listWorkflowsByPrefix("ptah-", {});

      expect(result).toEqual(["ptah-feature-a", "ptah-feature-b"]);
    });
  });
});
