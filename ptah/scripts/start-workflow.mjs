/**
 * One-off script to start a feature workflow via the Temporal client.
 *
 * Usage (from ptah/ directory):
 *   node scripts/start-workflow.mjs <feature-slug> [start-at-phase]
 *
 * Examples:
 *   node scripts/start-workflow.mjs message-acknowledgement
 *   node scripts/start-workflow.mjs message-acknowledgement fspec-creation
 */

import { readFileSync } from "fs";
import { load } from "js-yaml";
import { Connection, WorkflowClient } from "@temporalio/client";

const [featureSlug, startAtPhase] = process.argv.slice(2);

if (!featureSlug) {
  console.error("Usage: node scripts/start-workflow.mjs <feature-slug> [start-at-phase]");
  process.exit(1);
}

const config = JSON.parse(readFileSync("ptah.config.json", "utf8"));
const workflowConfig = load(readFileSync("ptah.workflow.yaml", "utf8"));

const connection = await Connection.connect({ address: config.temporal.address });
const client = new WorkflowClient({ connection, namespace: config.temporal.namespace });

const workflowId = `ptah-${featureSlug}`;

const params = {
  featureSlug,
  featureConfig: {
    discipline: "fullstack",
    skipFspec: false,
    useTechLead: false,
  },
  workflowConfig,
  ...(startAtPhase ? { startAtPhase } : {}),
};

console.log(`Starting workflow ${workflowId}...`);
if (startAtPhase) console.log(`  Starting at phase: ${startAtPhase}`);

await client.start("featureLifecycleWorkflow", {
  workflowId,
  taskQueue: config.temporal.taskQueue,
  args: [params],
});

console.log(`Workflow started: ${workflowId}`);
await connection.close();
