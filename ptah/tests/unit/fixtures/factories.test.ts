import { describe, it, expect } from "vitest";
import { makeAgentEntry, makeRegisteredAgent } from "../../fixtures/factories.js";
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
