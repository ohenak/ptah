/**
 * Temporal Activities for skill invocation and worktree merging.
 *
 * Activities are plain async functions that close over injected dependencies (SkillActivityDeps).
 * They are NOT classes. Dependencies are injected via closure at Worker setup time.
 *
 * @see FSPEC-TF-01 (Activity Lifecycle and Heartbeat)
 * @see FSPEC-TF-03 (Activity Failure Classification and Retry)
 */

import { heartbeat, CancelledFailure, Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import type { SkillInvoker } from "../../orchestrator/skill-invoker.js";
import type { ContextAssembler } from "../../orchestrator/context-assembler.js";
import type { ArtifactCommitter } from "../../orchestrator/artifact-committer.js";
import type { GitClient } from "../../services/git.js";
import type { RoutingEngine } from "../../orchestrator/router.js";
import type { AgentRegistry } from "../../orchestrator/agent-registry.js";
import type { Logger } from "../../services/logger.js";
import type { PtahConfig } from "../../types.js";
import type {
  SkillActivityInput,
  SkillActivityResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

export interface SkillActivityDeps {
  skillInvoker: SkillInvoker;
  contextAssembler: ContextAssembler;
  artifactCommitter: ArtifactCommitter;
  gitClient: GitClient;
  routingEngine: RoutingEngine;
  agentRegistry: AgentRegistry;
  logger: Logger;
  config: PtahConfig;
}

// ---------------------------------------------------------------------------
// Merge Activity types
// ---------------------------------------------------------------------------

export interface MergeWorktreeInput {
  worktreePath: string;
  featureBranch: string;
  agentId: string;
  worktreeBranch: string;
  featureBranchWorktreePath: string;
}

export type MergeResult = "merged" | "conflict";

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const MAX_429_RETRIES = 3;
const DEFAULT_429_BACKOFF_MS = 1000;

// ---------------------------------------------------------------------------
// Activity factory — returns activity functions closed over deps
// ---------------------------------------------------------------------------

export function createActivities(deps: SkillActivityDeps) {
  const {
    skillInvoker,
    contextAssembler,
    artifactCommitter,
    gitClient,
    routingEngine,
    logger,
    config,
  } = deps;

  // -------------------------------------------------------------------------
  // invokeSkill Activity
  // -------------------------------------------------------------------------

  async function invokeSkill(input: SkillActivityInput): Promise<SkillActivityResult> {
    const startTime = Date.now();
    const {
      agentId,
      featureSlug,
      phaseId,
      forkJoin,
      contextDocumentRefs,
      featureConfig,
      priorQuestion,
      priorAnswer,
      taskType,
      documentType,
      isRevision,
    } = input;

    const worktreeBranch = `ptah/${featureSlug}/${agentId}/${phaseId}`;
    const worktreeBasePath = `/tmp/ptah-worktrees/${agentId}/${featureSlug}/${phaseId}`;

    // ------------------------------------------------------------------
    // Step 1: Idempotency check (FSPEC-TF-01 step 2)
    // ------------------------------------------------------------------
    const existingWorktrees = await gitClient.listWorktrees();
    const existingWorktree = existingWorktrees.find(
      (wt) => wt.branch === worktreeBranch || wt.path === worktreeBasePath,
    );

    if (existingWorktree) {
      const hasCommitted = await gitClient.hasUnmergedCommits(existingWorktree.branch);
      if (hasCommitted) {
        logger.info(
          `Idempotent skip: worktree already committed for ${agentId}/${featureSlug}/${phaseId}`,
        );
        return {
          routingSignalType: "LGTM",
          artifactChanges: [],
          durationMs: Date.now() - startTime,
        };
      }
    }

    // ------------------------------------------------------------------
    // Step 2: Create worktree (FSPEC-TF-01 step 3)
    // ------------------------------------------------------------------
    let worktreePath = worktreeBasePath;
    try {
      await gitClient.createWorktree(worktreeBranch, worktreePath);
    } catch (err) {
      // If worktree already exists (from prior ROUTE_TO_USER), reuse it
      if (existingWorktree) {
        worktreePath = existingWorktree.path;
      } else {
        throw err;
      }
    }

    // ------------------------------------------------------------------
    // Step 3: Assemble context (FSPEC-TF-01 step 4)
    // ------------------------------------------------------------------
    try {
      const contextBundle = await contextAssembler.assemble({
        agentId,
        threadId: `temporal-${featureSlug}-${phaseId}`,
        threadName: `${featureSlug} — ${phaseId}`,
        threadHistory: [],
        triggerMessage: {
          id: `activity-${featureSlug}-${phaseId}`,
          threadId: `temporal-${featureSlug}-${phaseId}`,
          threadName: `${featureSlug} — ${phaseId}`,
          parentChannelId: "temporal",
          authorId: "temporal",
          authorName: "Temporal",
          isBot: true,
          content: `Execute ${taskType} for ${documentType}`,
          timestamp: new Date(),
        },
        config,
        worktreePath,
      });

      // ------------------------------------------------------------------
      // Step 4: Heartbeat + invoke skill (FSPEC-TF-01 steps 5-6)
      // ------------------------------------------------------------------
      // Emit initial heartbeat
      heartbeat({ elapsedMs: 0, phase: "invoking" });

      // Start concurrent heartbeat loop (FSPEC-TF-01 step 6)
      const heartbeatIntervalMs =
        (config.temporal?.heartbeat?.intervalSeconds ?? 30) * 1000;
      let heartbeatStopped = false;
      const heartbeatLoop = (async () => {
        while (!heartbeatStopped) {
          await sleep(heartbeatIntervalMs);
          if (heartbeatStopped) break;

          // Check for cancellation at heartbeat boundary (FSPEC-TF-01 step 6d)
          try {
            const ctx = Context.current();
            if (ctx.cancellationSignal.aborted) {
              heartbeatStopped = true;
              throw new CancelledFailure("Activity cancelled at heartbeat boundary");
            }
          } catch (err) {
            if (err instanceof CancelledFailure) throw err;
            // Context.current() may not be available in tests; continue
          }

          heartbeat({ elapsedMs: Date.now() - startTime, phase: "running" });
        }
      })();

      let invocationResult;
      try {
        invocationResult = await invokeSkillWithInternalRetry(
          contextBundle,
          config,
          worktreePath,
        );
      } finally {
        // Stop heartbeat loop after invocation completes (FSPEC-TF-01 step 6c)
        heartbeatStopped = true;
      }

      // Swallow the heartbeat loop promise (it may have already resolved or
      // will resolve on next iteration check)
      heartbeatLoop.catch(() => {
        // Heartbeat loop errors are expected on cancellation; swallow.
      });

      // Emit post-invocation heartbeat
      heartbeat({ elapsedMs: Date.now() - startTime, phase: "parsing" });

      // ------------------------------------------------------------------
      // Step 5: Parse routing signal (FSPEC-TF-01 step 7)
      // ------------------------------------------------------------------
      let routingSignal;
      try {
        routingSignal = routingEngine.parseSignal(invocationResult.routingSignalRaw);
      } catch (parseErr) {
        // Non-retryable: routing signal parse failure (FSPEC-TF-03)
        throw ApplicationFailure.nonRetryable(
          `Routing signal parse failure: ${(parseErr as Error).message}`,
          "RoutingParseError",
        );
      }

      // ------------------------------------------------------------------
      // Step 6: Handle routing signal (FSPEC-TF-01 steps 8-9)
      // ------------------------------------------------------------------
      if (routingSignal.type === "ROUTE_TO_USER") {
        // BR-03: ROUTE_TO_USER is NOT an error. Do not merge.
        return {
          routingSignalType: "ROUTE_TO_USER",
          question: routingSignal.question,
          artifactChanges: [],
          worktreePath,
          durationMs: Date.now() - startTime,
        };
      }

      // LGTM or TASK_COMPLETE
      const artifactChanges = await gitClient.diffWorktreeIncludingUntracked(worktreePath);

      if (forkJoin) {
        // BR-04a: Fork/join — commit but do NOT merge
        if (artifactChanges.length > 0) {
          await gitClient.addAllInWorktree(worktreePath);
          await gitClient.commitInWorktree(
            worktreePath,
            `[ptah] ${agentId}: ${taskType} ${documentType} for ${featureSlug}`,
          );
        }
        return {
          routingSignalType: routingSignal.type,
          artifactChanges,
          worktreePath,
          durationMs: Date.now() - startTime,
        };
      }

      // Single-agent: commit and merge
      const commitResult = await artifactCommitter.commitAndMerge({
        worktreePath,
        branch: worktreeBranch,
        featureBranch: `feat-${featureSlug}`,
        artifactChanges,
        agentId,
        threadName: `${featureSlug} — ${phaseId}`,
      });

      if (commitResult.mergeStatus === "conflict") {
        // Non-retryable: merge conflict requires human intervention
        throw ApplicationFailure.nonRetryable(
          `Git merge conflict: ${commitResult.conflictFiles?.join(", ") ?? "unknown files"}`,
          "MergeConflict",
        );
      }

      // Clean up worktree after successful single-agent merge
      try {
        await gitClient.removeWorktree(worktreePath);
      } catch {
        // Best-effort cleanup
      }

      return {
        routingSignalType: routingSignal.type,
        artifactChanges,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      // ------------------------------------------------------------------
      // Step 7: Error handling — cleanup worktree (FSPEC-TF-01 step 10)
      // BR-04: Worktree cleanup in finally for errors (not ROUTE_TO_USER)
      // ------------------------------------------------------------------
      const isRouteToUser =
        err instanceof Error &&
        "routingSignalType" in (err as unknown as Record<string, unknown>) &&
        (err as unknown as Record<string, unknown>).routingSignalType === "ROUTE_TO_USER";

      if (!isRouteToUser) {
        try {
          await gitClient.removeWorktree(worktreePath);
        } catch {
          // Best-effort cleanup
        }
      }

      // Classify and re-throw
      if (isNonRetryableError(err)) {
        throw err; // Already wrapped as ApplicationFailure.nonRetryable
      }

      // Retryable errors: just re-throw, Temporal retries automatically
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Internal 429 retry (BR-26)
  // -------------------------------------------------------------------------

  async function invokeSkillWithInternalRetry(
    contextBundle: Parameters<typeof skillInvoker.invoke>[0],
    cfg: PtahConfig,
    worktreePath: string,
  ) {
    for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
      try {
        return await skillInvoker.invoke(contextBundle, cfg, worktreePath);
      } catch (err) {
        if (is429Error(err) && attempt < MAX_429_RETRIES) {
          const retryAfter = getRetryAfterMs(err);
          logger.warn(
            `Rate limited (429), retrying in ${retryAfter}ms (attempt ${attempt + 1}/${MAX_429_RETRIES})`,
          );
          // Emit heartbeat during wait
          heartbeat({ elapsedMs: 0, phase: "rate-limited" });
          await sleep(retryAfter);
          continue;
        }
        throw err;
      }
    }
    // Should not reach here, but satisfy TypeScript
    throw new Error("Exhausted 429 retries");
  }

  // -------------------------------------------------------------------------
  // mergeWorktree Activity (TSPEC Section 7)
  // -------------------------------------------------------------------------

  async function mergeWorktree(input: MergeWorktreeInput): Promise<MergeResult> {
    const { worktreePath, featureBranch, agentId, worktreeBranch, featureBranchWorktreePath } =
      input;

    const result = await artifactCommitter.mergeBranchIntoFeature({
      sourceBranch: worktreeBranch,
      featureBranch,
      featureBranchWorktreePath,
      agentId,
    });

    if (result.status === "conflict") {
      throw ApplicationFailure.nonRetryable(
        `Merge conflict for agent ${agentId}: ${result.conflictingFiles.join(", ")}`,
        "MergeConflict",
      );
    }

    if (result.status === "merge-error") {
      throw ApplicationFailure.nonRetryable(
        `Merge error for agent ${agentId}: ${result.errorMessage ?? "unknown"}`,
        "MergeError",
      );
    }

    // Clean up worktree after successful merge
    try {
      await gitClient.removeWorktree(worktreePath);
    } catch {
      // Best-effort cleanup
    }

    return "merged";
  }

  return { invokeSkill, mergeWorktree };
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

function isNonRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const anyErr = err as Error & { nonRetryable?: boolean; name?: string };
    if (anyErr.nonRetryable === true) return true;
    if (anyErr.name === "ApplicationFailure") return true;
  }
  return false;
}

function is429Error(err: unknown): boolean {
  if (err instanceof Error) {
    const anyErr = err as Error & { statusCode?: number };
    return anyErr.statusCode === 429;
  }
  return false;
}

function getRetryAfterMs(err: unknown): number {
  if (err instanceof Error) {
    const anyErr = err as Error & { retryAfter?: number };
    if (typeof anyErr.retryAfter === "number") {
      return anyErr.retryAfter;
    }
  }
  return DEFAULT_429_BACKOFF_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
