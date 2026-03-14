import { describe, it, expect } from "vitest";
import { InMemoryWorktreeRegistry } from "../../../src/orchestrator/worktree-registry.js";

describe("InMemoryWorktreeRegistry", () => {
  it("starts empty", () => {
    const registry = new InMemoryWorktreeRegistry();
    expect(registry.size()).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it("register adds a worktree", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register("/tmp/wt-abc", "ptah/dev-agent/t1/abc");
    expect(registry.size()).toBe(1);
    expect(registry.getAll()).toEqual([
      { worktreePath: "/tmp/wt-abc", branch: "ptah/dev-agent/t1/abc" },
    ]);
  });

  it("deregister removes the worktree", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register("/tmp/wt-abc", "ptah/dev-agent/t1/abc");
    registry.deregister("/tmp/wt-abc");
    expect(registry.size()).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it("deregister of unknown path is a no-op", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register("/tmp/wt-abc", "ptah/dev-agent/t1/abc");
    registry.deregister("/tmp/nonexistent");
    expect(registry.size()).toBe(1);
  });

  it("getAll returns a snapshot of all worktrees", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register("/tmp/wt-a", "branch-a");
    registry.register("/tmp/wt-b", "branch-b");
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map(w => w.worktreePath).sort()).toEqual(["/tmp/wt-a", "/tmp/wt-b"]);
  });

  it("re-registering same path overwrites the branch", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register("/tmp/wt-abc", "branch-old");
    registry.register("/tmp/wt-abc", "branch-new");
    expect(registry.size()).toBe(1);
    expect(registry.getAll()[0].branch).toBe("branch-new");
  });
});
