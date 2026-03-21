import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { NodeConfigLoader } from "../../../src/config/loader.js";
import { NodeFileSystem } from "../../../src/services/filesystem.js";

/**
 * Integration test: Agent registry wiring (Phase E).
 *
 * Loads the real ptah.config.json from the filesystem, resolves the "tl"
 * agent entry, and asserts its skill_path points to an existing file.
 *
 * Prerequisite: ptah.config.json must be present locally with the "tl"
 * agent entry (added in Phase C). The file is gitignored so it won't
 * exist in CI — this test is skipped when the config file is absent.
 */

const ptahRoot = resolve(__dirname, "../../../");
const configExists = existsSync(resolve(ptahRoot, "ptah.config.json"));

describe.skipIf(!configExists)("agent registry wiring — integration", () => {
  it("resolves 'tl' agent from ptah.config.json with a valid skill_path", async () => {
    const fs = new NodeFileSystem(ptahRoot);
    const loader = new NodeConfigLoader(fs);
    const config = await loader.load();

    const tlAgent = config.agentEntries.find((a) => a.id === "tl");
    expect(tlAgent).toBeDefined();
    expect(tlAgent!.mentionable).toBe(false);

    // skill_path is relative to ptah.config.json location (ptah/ root) — resolve it
    const skillPath = resolve(ptahRoot, tlAgent!.skill_path);
    expect(existsSync(skillPath)).toBe(true);
  });
});
