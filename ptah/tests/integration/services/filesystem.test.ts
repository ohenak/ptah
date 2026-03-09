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
