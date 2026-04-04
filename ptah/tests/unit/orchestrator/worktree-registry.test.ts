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
    registry.register({
      worktreePath: "/tmp/wt-abc",
      branch: "ptah/dev-agent/t1/abc",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });
    expect(registry.size()).toBe(1);
    expect(registry.getAll()[0].worktreePath).toBe("/tmp/wt-abc");
    expect(registry.getAll()[0].branch).toBe("ptah/dev-agent/t1/abc");
  });

  it("deregister removes the worktree", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register({
      worktreePath: "/tmp/wt-abc",
      branch: "ptah/dev-agent/t1/abc",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });
    registry.deregister("/tmp/wt-abc");
    expect(registry.size()).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it("deregister of unknown path is a no-op", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register({
      worktreePath: "/tmp/wt-abc",
      branch: "ptah/dev-agent/t1/abc",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });
    registry.deregister("/tmp/nonexistent");
    expect(registry.size()).toBe(1);
  });

  it("getAll returns a snapshot of all worktrees", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register({
      worktreePath: "/tmp/wt-a",
      branch: "branch-a",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });
    registry.register({
      worktreePath: "/tmp/wt-b",
      branch: "branch-b",
      workflowId: "wf-002",
      runId: "run-002",
      activityId: "act-002",
      createdAt: "2026-04-03T00:01:00Z",
    });
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map(w => w.worktreePath).sort()).toEqual(["/tmp/wt-a", "/tmp/wt-b"]);
  });

  it("re-registering same path overwrites the branch", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register({
      worktreePath: "/tmp/wt-abc",
      branch: "branch-old",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });
    registry.register({
      worktreePath: "/tmp/wt-abc",
      branch: "branch-new",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });
    expect(registry.size()).toBe(1);
    expect(registry.getAll()[0].branch).toBe("branch-new");
  });

  // A2: Extended ActiveWorktree and register signature
  it("register accepts a full ActiveWorktree object", () => {
    const registry = new InMemoryWorktreeRegistry();
    const entry = {
      worktreePath: "/tmp/wt-abc",
      branch: "feat-my-feature",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    };
    registry.register(entry);
    expect(registry.size()).toBe(1);
    const all = registry.getAll();
    expect(all[0]).toEqual(entry);
  });

  it("findByActivity returns the matching worktree", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register({
      worktreePath: "/tmp/wt-abc",
      branch: "feat-my-feature",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });
    registry.register({
      worktreePath: "/tmp/wt-def",
      branch: "feat-other",
      workflowId: "wf-002",
      runId: "run-002",
      activityId: "act-002",
      createdAt: "2026-04-03T00:01:00Z",
    });

    const result = registry.findByActivity("act-001");
    expect(result).toBeDefined();
    expect(result!.worktreePath).toBe("/tmp/wt-abc");
  });

  it("findByActivity returns undefined when no match", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register({
      worktreePath: "/tmp/wt-abc",
      branch: "feat-my-feature",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });

    const result = registry.findByActivity("nonexistent");
    expect(result).toBeUndefined();
  });

  it("getAll returns extended ActiveWorktree objects with all fields", () => {
    const registry = new InMemoryWorktreeRegistry();
    registry.register({
      worktreePath: "/tmp/wt-abc",
      branch: "feat-my-feature",
      workflowId: "wf-001",
      runId: "run-001",
      activityId: "act-001",
      createdAt: "2026-04-03T00:00:00Z",
    });

    const all = registry.getAll();
    expect(all[0].workflowId).toBe("wf-001");
    expect(all[0].runId).toBe("run-001");
    expect(all[0].activityId).toBe("act-001");
    expect(all[0].createdAt).toBe("2026-04-03T00:00:00Z");
  });
});
