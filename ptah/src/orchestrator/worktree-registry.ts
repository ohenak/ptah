export interface ActiveWorktree {
  worktreePath: string;
  branch: string;
  workflowId: string;
  runId: string;
  activityId: string;
  createdAt: string; // ISO 8601
}

export interface WorktreeRegistry {
  register(entry: ActiveWorktree): void;
  deregister(worktreePath: string): void;
  getAll(): ReadonlyArray<ActiveWorktree>;
  findByActivity(activityId: string): ActiveWorktree | undefined;
  size(): number;
}

export class InMemoryWorktreeRegistry implements WorktreeRegistry {
  private worktrees = new Map<string, ActiveWorktree>();

  register(entry: ActiveWorktree): void {
    this.worktrees.set(entry.worktreePath, entry);
  }

  deregister(worktreePath: string): void {
    this.worktrees.delete(worktreePath);
  }

  getAll(): ReadonlyArray<ActiveWorktree> {
    return Array.from(this.worktrees.values());
  }

  findByActivity(activityId: string): ActiveWorktree | undefined {
    for (const wt of this.worktrees.values()) {
      if (wt.activityId === activityId) return wt;
    }
    return undefined;
  }

  size(): number {
    return this.worktrees.size;
  }
}
