/**
 * Temporal Worker setup — creates an in-process Worker with activity closure
 * injection and configurable concurrency (REQ-NF-15-03, TSPEC Section 9).
 *
 * The Worker runs in-process with the Orchestrator. Activity functions are
 * passed as a pre-constructed object (closure over dependencies), following
 * the Temporal TypeScript SDK pattern.
 */

import { Worker, NativeConnection } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PtahConfig } from "../types.js";
import type { Logger } from "../services/logger.js";

/**
 * Activities interface — the activity functions to register with the Worker.
 * These are created by closing over WorkerDeps at composition time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface WorkerActivities {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invokeSkill: (...args: any[]) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendNotification: (...args: any[]) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mergeWorktree: (...args: any[]) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveFeaturePath: (...args: any[]) => Promise<any>;
}

/**
 * Dependencies required to create the Temporal Worker.
 */
export interface WorkerDeps {
  config: PtahConfig;
  activities: WorkerActivities;
  logger: Logger;
}

/**
 * Create and return a Temporal Worker configured from PtahConfig.
 *
 * The Worker connects to Temporal via NativeConnection, registers the
 * feature-lifecycle workflow module, and injects activity functions via
 * closure. Concurrency limits are read from config.temporal.worker.
 */
export async function createTemporalWorker(deps: WorkerDeps): Promise<Worker> {
  const temporalConfig = deps.config.temporal!;

  const connection = await NativeConnection.connect({
    address: temporalConfig.address,
  });

  // Resolve the workflows module path relative to this file's location.
  // In the built output, this resolves to dist/src/temporal/workflows/feature-lifecycle.js
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const workflowsPath = resolve(currentDir, "./workflows/feature-lifecycle.js");

  const worker = await Worker.create({
    connection,
    namespace: temporalConfig.namespace,
    taskQueue: temporalConfig.taskQueue,
    workflowsPath,
    activities: deps.activities,
    maxConcurrentWorkflowTaskExecutions: temporalConfig.worker.maxConcurrentWorkflowTasks,
    maxConcurrentActivityTaskExecutions: temporalConfig.worker.maxConcurrentActivities,
  });

  return worker;
}
