import type { ContextBundle, InvocationResult, PtahConfig } from "../types.js";

export interface SkillInvoker {
  invoke(bundle: ContextBundle, config: PtahConfig): Promise<InvocationResult>;
  pruneOrphanedWorktrees(): Promise<void>;
}
