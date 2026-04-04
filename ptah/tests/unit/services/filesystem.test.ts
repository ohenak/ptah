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

describe("NodeFileSystem — rename (unit)", () => {
  let tmpDir: string;
  let fileSystem: NodeFileSystem;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ptah-fs-test-"));
    fileSystem = new NodeFileSystem(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("renames a file atomically", async () => {
    await fs.writeFile(path.join(tmpDir, "old.txt"), "content", "utf-8");

    await fileSystem.rename("old.txt", "new.txt");

    const content = await fs.readFile(path.join(tmpDir, "new.txt"), "utf-8");
    expect(content).toBe("content");

    await expect(fs.access(path.join(tmpDir, "old.txt"))).rejects.toThrow();
  });

  it("throws when source file does not exist", async () => {
    await expect(fileSystem.rename("nonexistent.txt", "dest.txt")).rejects.toThrow();
  });
});

describe("NodeFileSystem — copyFile (unit)", () => {
  let tmpDir: string;
  let fileSystem: NodeFileSystem;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ptah-fs-test-"));
    fileSystem = new NodeFileSystem(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("copies a file preserving content", async () => {
    await fs.writeFile(path.join(tmpDir, "src.txt"), "data", "utf-8");

    await fileSystem.copyFile("src.txt", "dest.txt");

    const srcContent = await fs.readFile(path.join(tmpDir, "src.txt"), "utf-8");
    const destContent = await fs.readFile(path.join(tmpDir, "dest.txt"), "utf-8");
    expect(srcContent).toBe("data");
    expect(destContent).toBe("data");
  });

  it("throws when source file does not exist", async () => {
    await expect(fileSystem.copyFile("nonexistent.txt", "dest.txt")).rejects.toThrow();
  });
});

// A5: readDirMatching
describe("NodeFileSystem — readDirMatching (unit)", () => {
  let tmpDir: string;
  let fileSystem: NodeFileSystem;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ptah-fs-test-"));
    fileSystem = new NodeFileSystem(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns entries matching the regex pattern", async () => {
    const subdir = path.join(tmpDir, "docs");
    await fs.mkdir(subdir);
    await fs.writeFile(path.join(subdir, "REQ-my-feature.md"), "", "utf-8");
    await fs.writeFile(path.join(subdir, "TSPEC-my-feature.md"), "", "utf-8");
    await fs.writeFile(path.join(subdir, "notes.txt"), "", "utf-8");

    const result = await fileSystem.readDirMatching("docs", /\.md$/);
    expect(result.sort()).toEqual(["REQ-my-feature.md", "TSPEC-my-feature.md"]);
  });

  it("returns empty array when no entries match", async () => {
    const subdir = path.join(tmpDir, "docs");
    await fs.mkdir(subdir);
    await fs.writeFile(path.join(subdir, "notes.txt"), "", "utf-8");

    const result = await fileSystem.readDirMatching("docs", /\.md$/);
    expect(result).toEqual([]);
  });

  it("returns empty array when directory does not exist", async () => {
    const result = await fileSystem.readDirMatching("nonexistent", /\.md$/);
    expect(result).toEqual([]);
  });
});
