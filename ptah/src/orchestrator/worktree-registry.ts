export interface ActiveWorktree {
  worktreePath: string;
  branch: string;
}

export interface WorktreeRegistry {
  register(worktreePath: string, branch: string): void;
  deregister(worktreePath: string): void;
  getAll(): ReadonlyArray<ActiveWorktree>;
  size(): number;
}

export class InMemoryWorktreeRegistry implements WorktreeRegistry {
  private worktrees = new Map<string, ActiveWorktree>();

  register(worktreePath: string, branch: string): void {
    this.worktrees.set(worktreePath, { worktreePath, branch });
  }

  deregister(worktreePath: string): void {
    this.worktrees.delete(worktreePath);
  }

  getAll(): ReadonlyArray<ActiveWorktree> {
    return Array.from(this.worktrees.values());
  }

  size(): number {
    return this.worktrees.size;
  }
}
