import { describe, it, expect } from "vitest";
import { FakeFileSystem } from "../../fixtures/factories.js";

describe("FakeFileSystem", () => {
  it("exists returns false for unknown paths", async () => {
    const fs = new FakeFileSystem();
    expect(await fs.exists("nonexistent")).toBe(false);
  });

  it("exists returns true after writeFile", async () => {
    const fs = new FakeFileSystem();
    await fs.writeFile("test.txt", "content");
    expect(await fs.exists("test.txt")).toBe(true);
  });

  it("exists returns true after mkdir", async () => {
    const fs = new FakeFileSystem();
    await fs.mkdir("some/dir");
    expect(await fs.exists("some/dir")).toBe(true);
  });

  it("getFile returns written content", async () => {
    const fs = new FakeFileSystem();
    await fs.writeFile("hello.md", "# Hello");
    expect(fs.getFile("hello.md")).toBe("# Hello");
  });

  it("getFile returns undefined for unknown file", () => {
    const fs = new FakeFileSystem();
    expect(fs.getFile("missing")).toBeUndefined();
  });

  it("hasDir returns true after mkdir", async () => {
    const fs = new FakeFileSystem();
    await fs.mkdir("my/dir");
    expect(fs.hasDir("my/dir")).toBe(true);
  });

  it("hasDir returns false for unknown dir", () => {
    const fs = new FakeFileSystem();
    expect(fs.hasDir("nope")).toBe(false);
  });

  it("addExisting makes file exist with content", async () => {
    const fs = new FakeFileSystem();
    fs.addExisting("old.txt", "old content");
    expect(await fs.exists("old.txt")).toBe(true);
    expect(fs.getFile("old.txt")).toBe("old content");
  });

  it("addExisting directory makes it exist", async () => {
    const fs = new FakeFileSystem();
    fs.addExistingDir("some/dir");
    expect(await fs.exists("some/dir")).toBe(true);
    expect(fs.hasDir("some/dir")).toBe(true);
  });

  it("cwd returns configured value", () => {
    const fs = new FakeFileSystem("/my/project");
    expect(fs.cwd()).toBe("/my/project");
  });

  it("cwd defaults to /fake/project", () => {
    const fs = new FakeFileSystem();
    expect(fs.cwd()).toBe("/fake/project");
  });

  it("basename returns last segment of path", () => {
    const fs = new FakeFileSystem();
    expect(fs.basename("/foo/bar/baz")).toBe("baz");
  });

  it("basename returns empty string for root /", () => {
    const fs = new FakeFileSystem();
    expect(fs.basename("/")).toBe("");
  });
});
