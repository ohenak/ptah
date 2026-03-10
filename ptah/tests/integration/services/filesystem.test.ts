import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NodeFileSystem } from "../../../src/services/filesystem.js";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";

describe("NodeFileSystem", () => {
  let tempDir: string;
  let nfs: NodeFileSystem;

  beforeEach(async () => {
    tempDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "ptah-test-"));
    nfs = new NodeFileSystem(tempDir);
  });

  afterEach(async () => {
    await nodeFs.rm(tempDir, { recursive: true, force: true });
  });

  // Task 26: exists()
  describe("exists", () => {
    it("returns false for nonexistent path", async () => {
      expect(await nfs.exists("nonexistent")).toBe(false);
    });

    it("returns true for existing file", async () => {
      await nodeFs.writeFile(nodePath.join(tempDir, "test.txt"), "content");
      expect(await nfs.exists("test.txt")).toBe(true);
    });

    it("returns true for existing directory", async () => {
      await nodeFs.mkdir(nodePath.join(tempDir, "subdir"));
      expect(await nfs.exists("subdir")).toBe(true);
    });
  });

  // Task 27: mkdir()
  describe("mkdir", () => {
    it("creates a directory", async () => {
      await nfs.mkdir("newdir");
      const stat = await nodeFs.stat(nodePath.join(tempDir, "newdir"));
      expect(stat.isDirectory()).toBe(true);
    });

    it("creates nested directories recursively", async () => {
      await nfs.mkdir("a/b/c");
      const stat = await nodeFs.stat(nodePath.join(tempDir, "a/b/c"));
      expect(stat.isDirectory()).toBe(true);
    });

    it("does not throw if directory already exists", async () => {
      await nfs.mkdir("existing");
      await expect(nfs.mkdir("existing")).resolves.not.toThrow();
    });
  });

  // Task 28: writeFile()
  describe("writeFile", () => {
    it("writes content to file", async () => {
      await nfs.writeFile("test.txt", "hello world");
      const content = await nodeFs.readFile(
        nodePath.join(tempDir, "test.txt"),
        "utf-8"
      );
      expect(content).toBe("hello world");
    });

    it("writes UTF-8 content", async () => {
      const utf8Content = "こんにちは 🌍";
      await nfs.writeFile("utf8.txt", utf8Content);
      const content = await nodeFs.readFile(
        nodePath.join(tempDir, "utf8.txt"),
        "utf-8"
      );
      expect(content).toBe(utf8Content);
    });

    it("writes empty content for .gitkeep", async () => {
      await nfs.writeFile(".gitkeep", "");
      const content = await nodeFs.readFile(
        nodePath.join(tempDir, ".gitkeep"),
        "utf-8"
      );
      expect(content).toBe("");
    });
  });

  // Task 34: readFile()
  describe("readFile", () => {
    it("returns file content as UTF-8 string", async () => {
      const content = "hello world\nline two\n日本語テスト";
      await nodeFs.writeFile(nodePath.join(tempDir, "test.txt"), content, "utf-8");

      const result = await nfs.readFile("test.txt");
      expect(result).toBe(content);
    });

    it("throws with ENOENT code for missing files", async () => {
      try {
        await nfs.readFile("nonexistent.txt");
        expect.fail("Expected readFile to throw");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        const nodeError = error as NodeJS.ErrnoException;
        expect(nodeError.code).toBe("ENOENT");
      }
    });
  });

  // Task 131: readDir()
  describe("readDir", () => {
    it("returns filenames in directory", async () => {
      await nodeFs.writeFile(nodePath.join(tempDir, "alpha.txt"), "a");
      await nodeFs.writeFile(nodePath.join(tempDir, "beta.txt"), "b");

      const result = await nfs.readDir(".");
      expect(result).toContain("alpha.txt");
      expect(result).toContain("beta.txt");
      expect(result).toHaveLength(2);
    });

    it("returns empty array for non-existent directory", async () => {
      const result = await nfs.readDir("nonexistent-dir");
      expect(result).toEqual([]);
    });

    it("returns filenames in a subdirectory", async () => {
      await nodeFs.mkdir(nodePath.join(tempDir, "sub"));
      await nodeFs.writeFile(nodePath.join(tempDir, "sub", "file1.ts"), "");
      await nodeFs.writeFile(nodePath.join(tempDir, "sub", "file2.ts"), "");

      const result = await nfs.readDir("sub");
      expect(result).toContain("file1.ts");
      expect(result).toContain("file2.ts");
      expect(result).toHaveLength(2);
    });
  });

  // Task 132: joinPath()
  describe("joinPath", () => {
    it("joins path segments via node:path.join()", () => {
      expect(nfs.joinPath("a", "b", "c")).toBe(nodePath.join("a", "b", "c"));
    });

    it("handles absolute paths", () => {
      expect(nfs.joinPath("/root", "sub", "file.txt")).toBe("/root/sub/file.txt");
    });

    it("handles single segment", () => {
      expect(nfs.joinPath("single")).toBe("single");
    });

    it("normalizes paths with ..", () => {
      expect(nfs.joinPath("a", "b", "..", "c")).toBe(nodePath.join("a", "c"));
    });
  });

  // Task 29: cwd() and basename()
  describe("cwd and basename", () => {
    it("cwd returns the configured working directory", () => {
      expect(nfs.cwd()).toBe(tempDir);
    });

    it("basename returns last segment of path", () => {
      expect(nfs.basename("/foo/bar/baz")).toBe("baz");
    });

    it("basename returns empty string for root", () => {
      expect(nfs.basename("/")).toBe("");
    });
  });
});
