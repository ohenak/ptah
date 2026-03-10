import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextBundle, InvocationResult, PtahConfig } from "../types.js";
import type { SkillClient } from "../services/skill-client.js";
import type { GitClient } from "../services/git.js";
import type { Logger } from "../services/logger.js";

export interface SkillInvoker {
  invoke(bundle: ContextBundle, config: PtahConfig): Promise<InvocationResult>;
  pruneOrphanedWorktrees(): Promise<void>;
}

export class InvocationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Skill invocation timed out after ${timeoutMs}ms`);
    this.name = "InvocationTimeoutError";
  }
}

export class InvocationError extends Error {
  public readonly cause: Error;

  constructor(message: string, cause: Error) {
    super(message);
    this.name = "InvocationError";
    this.cause = cause;
  }
}

export class DefaultSkillInvoker implements SkillInvoker {
  private readonly skillClient: SkillClient;
  private readonly gitClient: GitClient;
  private readonly logger: Logger;

  constructor(skillClient: SkillClient, gitClient: GitClient, logger: Logger) {
    this.skillClient = skillClient;
    this.gitClient = gitClient;
    this.logger = logger;
  }

  async invoke(
    bundle: ContextBundle,
    config: PtahConfig
  ): Promise<InvocationResult> {
    const invocationId = randomBytes(4).toString("hex");
    const branch = `ptah/${bundle.agentId}/${bundle.threadId}/${invocationId}`;
    const worktreePath = join(tmpdir(), "ptah-worktrees", invocationId);
    const timeoutMs = config.orchestrator.invocation_timeout_ms;

    // Create worktree (not in try/finally — if this fails, nothing to clean up)
    await this.gitClient.createWorktree(branch, worktreePath);

    const startTime = Date.now();

    try {
      // Invoke skill with timeout
      const response = await this.invokeWithTimeout(
        bundle,
        worktreePath,
        timeoutMs
      );

      // Detect artifact changes
      const allChanges = await this.gitClient.diffWorktree(worktreePath);
      const artifactChanges = this.filterArtifactChanges(allChanges);

      const durationMs = Date.now() - startTime;

      return {
        textResponse: response.textContent,
        routingSignalRaw: response.textContent,
        artifactChanges,
        worktreePath,
        branch,
        durationMs,
      };
    } catch (error) {
      if (error instanceof InvocationTimeoutError) {
        throw error;
      }
      if (error instanceof InvocationError) {
        throw error;
      }
      throw new InvocationError(
        `Skill invocation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      await this.cleanup(worktreePath, branch);
    }
  }

  async pruneOrphanedWorktrees(): Promise<void> {
    await this.gitClient.pruneWorktrees("ptah/");
  }

  private async invokeWithTimeout(
    bundle: ContextBundle,
    worktreePath: string,
    timeoutMs: number
  ): Promise<{ textContent: string }> {
    return new Promise<{ textContent: string }>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new InvocationTimeoutError(timeoutMs));
        }
      }, timeoutMs);

      this.skillClient
        .invoke({
          systemPrompt: bundle.systemPrompt,
          userMessage: bundle.userMessage,
          worktreePath,
          timeoutMs,
        })
        .then((response) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(response);
          }
        })
        .catch((error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(
              new InvocationError(
                `Skill invocation failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : new Error(String(error))
              )
            );
          }
        });
    });
  }

  private filterArtifactChanges(allChanges: string[]): string[] {
    const docsChanges: string[] = [];
    const nonDocsChanges: string[] = [];

    for (const change of allChanges) {
      if (change.startsWith("docs/")) {
        docsChanges.push(change);

        // Check for Layer 1 file (overview.md) modification
        if (change.endsWith("overview.md")) {
          this.logger.warn(
            `Layer 1 file modified: ${change} — this is unusual but allowed`
          );
        }
      } else {
        nonDocsChanges.push(change);
      }
    }

    if (nonDocsChanges.length > 0) {
      this.logger.warn(
        `Ignoring ${nonDocsChanges.length} non-docs change(s): ${nonDocsChanges.join(", ")}`
      );
    }

    return docsChanges;
  }

  private async cleanup(worktreePath: string, branch: string): Promise<void> {
    try {
      await this.gitClient.removeWorktree(worktreePath);
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup worktree ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    try {
      await this.gitClient.deleteBranch(branch);
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup branch ${branch}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
