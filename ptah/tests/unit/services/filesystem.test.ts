import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { NodeFileSystem } from "../../../src/services/filesystem.js";

describe("NodeFileSystem — appendFile (unit)", () => {
  let tmpDir: string;
  let fileSystem: NodeFileSystem;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ptah-fs-test-"));
    fileSystem = new NodeFileSystem(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // Task 46: appendFile appends to existing file
  it("appends content to an existing file", async () => {
    const filePath = "test.txt";
    await fs.writeFile(path.join(tmpDir, filePath), "hello", "utf-8");

    await fileSystem.appendFile(filePath, " world");

    const content = await fs.readFile(path.join(tmpDir, filePath), "utf-8");
    expect(content).toBe("hello world");
  });

  // Task 46: appendFile creates file if missing
  it("creates the file if it does not exist", async () => {
    const filePath = "new-file.txt";

    await fileSystem.appendFile(filePath, "created");

    const content = await fs.readFile(path.join(tmpDir, filePath), "utf-8");
    expect(content).toBe("created");
  });
});
