import { describe, it, expect, beforeEach } from "vitest";
import { DefaultAgentRegistry, buildAgentRegistry } from "../../../src/orchestrator/agent-registry.js";
import { FakeFileSystem, FakeLogger } from "../../fixtures/factories.js";
import type { AgentEntry } from "../../../src/types.js";

function makeEntry(overrides: Partial<AgentEntry> = {}): AgentEntry {
  return {
    id: "pm-agent",
    skill_path: "/skills/pm.md",
    log_file: "/logs/pm.md",
    mention_id: "123456789",
    display_name: "Product Manager",
    ...overrides,
  };
}

describe("DefaultAgentRegistry", () => {
  it("getAgentById returns agent when found", () => {
    const registry = new DefaultAgentRegistry([
      { id: "pm-agent", skill_path: "/s/pm.md", log_file: "/l/pm.md", mention_id: "111", display_name: "PM" },
    ]);
    const result = registry.getAgentById("pm-agent");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("pm-agent");
  });

  it("getAgentById returns null when not found", () => {
    const registry = new DefaultAgentRegistry([]);
    expect(registry.getAgentById("unknown")).toBeNull();
  });

  it("getAgentByMentionId returns agent when found", () => {
    const registry = new DefaultAgentRegistry([
      { id: "eng", skill_path: "/s/eng.md", log_file: "/l/eng.md", mention_id: "999", display_name: "Engineer" },
    ]);
    expect(registry.getAgentByMentionId("999")).not.toBeNull();
  });

  it("getAgentByMentionId returns null when not found", () => {
    const registry = new DefaultAgentRegistry([]);
    expect(registry.getAgentByMentionId("000")).toBeNull();
  });

  it("getAllAgents returns all registered agents", () => {
    const registry = new DefaultAgentRegistry([
      { id: "pm", skill_path: "/s/pm.md", log_file: "/l/pm.md", mention_id: "1", display_name: "PM" },
      { id: "eng", skill_path: "/s/eng.md", log_file: "/l/eng.md", mention_id: "2", display_name: "Eng" },
    ]);
    expect(registry.getAllAgents()).toHaveLength(2);
  });

  it("getAllAgents returns a defensive copy", () => {
    const registry = new DefaultAgentRegistry([
      { id: "pm", skill_path: "/s/pm.md", log_file: "/l/pm.md", mention_id: "1", display_name: "PM" },
    ]);
    const all = registry.getAllAgents();
    all.push({ id: "hacked", skill_path: "", log_file: "", mention_id: "0", display_name: "" });
    expect(registry.getAllAgents()).toHaveLength(1);
  });
});

describe("buildAgentRegistry", () => {
  let fs: FakeFileSystem;
  let logger: FakeLogger;

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    fs.addExisting("/skills/pm.md", "# PM Skill");
    fs.addExisting("/logs/pm.md", "");
  });

  it("returns registry with valid entry", async () => {
    const { registry, errors } = await buildAgentRegistry(
      [makeEntry()],
      fs,
      logger,
    );
    expect(errors).toHaveLength(0);
    expect(registry.getAgentById("pm-agent")).not.toBeNull();
  });

  it("skips entry with missing id and records error", async () => {
    const { registry, errors } = await buildAgentRegistry(
      [makeEntry({ id: "" })],
      fs,
      logger,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("id");
    expect(registry.getAllAgents()).toHaveLength(0);
  });

  it("skips entry with invalid id format and records error", async () => {
    const { errors } = await buildAgentRegistry(
      [makeEntry({ id: "PM Agent!" })],
      fs,
      logger,
    );
    expect(errors.some(e => e.field === "id")).toBe(true);
  });

  it("skips entry with non-numeric mention_id and records error", async () => {
    const { errors } = await buildAgentRegistry(
      [makeEntry({ mention_id: "not-a-number" })],
      fs,
      logger,
    );
    expect(errors.some(e => e.field === "mention_id")).toBe(true);
  });

  it("skips entry with missing skill_path and records error", async () => {
    const { errors } = await buildAgentRegistry(
      [makeEntry({ skill_path: "" })],
      fs,
      logger,
    );
    expect(errors.some(e => e.field === "skill_path")).toBe(true);
  });

  it("skips entry when skill_path file does not exist", async () => {
    const { registry, errors } = await buildAgentRegistry(
      [makeEntry({ skill_path: "/nonexistent/skill.md" })],
      fs,
      logger,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("skill_path");
    expect(registry.getAllAgents()).toHaveLength(0);
  });

  it("skips entry when log_file does not exist", async () => {
    const { registry, errors } = await buildAgentRegistry(
      [makeEntry({ log_file: "/nonexistent/log.md" })],
      fs,
      logger,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("log_file");
    expect(registry.getAllAgents()).toHaveLength(0);
  });

  it("detects duplicate id and records error", async () => {
    const entry1 = makeEntry({ id: "pm-agent", mention_id: "111" });
    const entry2 = makeEntry({ id: "pm-agent", mention_id: "222" });
    const { errors } = await buildAgentRegistry([entry1, entry2], fs, logger);
    expect(errors.some(e => e.reason.includes("duplicate id"))).toBe(true);
  });

  it("detects duplicate mention_id and records error", async () => {
    fs.addExisting("/skills/eng.md", "");
    fs.addExisting("/logs/eng.md", "");
    const entry1 = makeEntry({ id: "pm-agent", mention_id: "123456789" });
    const entry2 = makeEntry({ id: "eng-agent", skill_path: "/skills/eng.md", log_file: "/logs/eng.md", mention_id: "123456789" });
    const { errors } = await buildAgentRegistry([entry1, entry2], fs, logger);
    expect(errors.some(e => e.reason.includes("duplicate mention_id"))).toBe(true);
  });

  it("defaults display_name to id when not provided", async () => {
    const { registry } = await buildAgentRegistry(
      [makeEntry({ display_name: undefined })],
      fs,
      logger,
    );
    const agent = registry.getAgentById("pm-agent");
    expect(agent!.display_name).toBe("pm-agent");
  });

  it("logs error for each invalid entry", async () => {
    await buildAgentRegistry(
      [makeEntry({ id: "" })],
      fs,
      logger,
    );
    expect(logger.entries.some(e => e.level === "ERROR")).toBe(true);
  });

  it("handles empty entries array", async () => {
    const { registry, errors } = await buildAgentRegistry([], fs, logger);
    expect(errors).toHaveLength(0);
    expect(registry.getAllAgents()).toHaveLength(0);
  });

  it("logs INFO with registered agent ids after successful registration", async () => {
    await buildAgentRegistry([makeEntry()], fs, logger);
    const infoEntries = logger.entries.filter(e => e.level === "INFO");
    expect(infoEntries.length).toBeGreaterThan(0);
    expect(infoEntries.some(e => e.message.includes("pm-agent"))).toBe(true);
  });

  it("logs WARN when no agents are registered from a non-empty input", async () => {
    // All entries are invalid so zero agents get registered
    await buildAgentRegistry([makeEntry({ id: "" })], fs, logger);
    const warnEntries = logger.entries.filter(e => e.level === "WARN");
    expect(warnEntries.some(e => e.message.includes("no agents"))).toBe(true);
  });

  it("logs WARN when entries array is empty", async () => {
    await buildAgentRegistry([], fs, logger);
    const warnEntries = logger.entries.filter(e => e.level === "WARN");
    expect(warnEntries.some(e => e.message.includes("no agents"))).toBe(true);
  });

  it("logs WARN for duplicate id (not ERROR)", async () => {
    const entry1 = makeEntry({ id: "pm-agent", mention_id: "111" });
    const entry2 = makeEntry({ id: "pm-agent", mention_id: "222" });
    await buildAgentRegistry([entry1, entry2], fs, logger);
    // The duplicate entry should produce a WARN, not an ERROR
    const warnEntries = logger.entries.filter(e => e.level === "WARN");
    expect(warnEntries.some(e => e.message.includes("pm-agent"))).toBe(true);
  });
});
