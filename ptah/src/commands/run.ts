/**
 * RunCommand — `ptah run` CLI command.
 *
 * Starts a feature workflow from a REQ file and polls for progress.
 */

import * as nodePath from "node:path";
import * as nodeReadline from "node:readline";
import type { FileSystem } from "../services/filesystem.js";
import type { TemporalClientWrapper } from "../temporal/client.js";
import type { WorkflowConfigLoader, WorkflowConfig } from "../config/workflow-config.js";
import { WorkflowConfigError } from "../config/workflow-config.js";
import type { FeatureWorkflowState, ReviewState, PendingQuestionState } from "../temporal/types.js";
import type { TemporalConfig } from "../types.js";
import {
  agentIdToSkillName,
  crossReviewPath,
} from "../orchestrator/pdlc/cross-review-parser.js";
import { deriveDocumentType } from "../temporal/workflows/feature-lifecycle.js";

// ---------------------------------------------------------------------------
// RunConfig and RunConfigLoader
// ---------------------------------------------------------------------------

export interface RunConfig {
  temporal?: TemporalConfig;
  discord?: {
    bot_token_env: string;
    server_id: string;
    channels: { updates: string; questions: string; debug: string };
    mention_user_id: string;
  };
}

export interface RunConfigLoader {
  load(): Promise<RunConfig>;
}

/**
 * LenientConfigLoader — reads ptah.config.json without requiring the discord section.
 * Throws only if the file is missing or contains invalid JSON.
 */
export class LenientConfigLoader implements RunConfigLoader {
  constructor(private fs: FileSystem) {}

  async load(): Promise<RunConfig> {
    let raw: string;
    try {
      raw = await this.fs.readFile("ptah.config.json");
    } catch (error: unknown) {
      const nodeErr = error as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        throw new Error("ptah.config.json not found. Run 'ptah init' first.");
      }
      throw new Error(
        `Failed to read ptah.config.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error: unknown) {
      throw new Error(
        `ptah.config.json contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const config = parsed as Record<string, unknown>;

    // Apply temporal defaults when temporal section exists but is incomplete
    this.applyTemporalDefaults(config);

    // Extract relevant fields for RunConfig
    const result: RunConfig = {};

    if (config.temporal !== undefined) {
      result.temporal = config.temporal as TemporalConfig;
    }

    if (
      config.discord !== undefined &&
      config.discord !== null &&
      typeof config.discord === "object"
    ) {
      result.discord = config.discord as RunConfig["discord"];
    }

    return result;
  }

  private applyTemporalDefaults(config: Record<string, unknown>): void {
    if (config.temporal === undefined || config.temporal === null) {
      return;
    }

    const temporal = (typeof config.temporal === "object" && !Array.isArray(config.temporal))
      ? config.temporal as Record<string, unknown>
      : {};
    config.temporal = temporal;

    if (temporal.address === undefined) temporal.address = "localhost:7233";
    if (temporal.namespace === undefined) temporal.namespace = "default";
    if (temporal.taskQueue === undefined) temporal.taskQueue = "ptah-main";

    const worker = (typeof temporal.worker === "object" && temporal.worker !== null && !Array.isArray(temporal.worker))
      ? temporal.worker as Record<string, unknown>
      : {};
    temporal.worker = worker;
    if (worker.maxConcurrentWorkflowTasks === undefined) worker.maxConcurrentWorkflowTasks = 10;
    if (worker.maxConcurrentActivities === undefined) worker.maxConcurrentActivities = 3;

    const retry = (typeof temporal.retry === "object" && temporal.retry !== null && !Array.isArray(temporal.retry))
      ? temporal.retry as Record<string, unknown>
      : {};
    temporal.retry = retry;
    if (retry.maxAttempts === undefined) retry.maxAttempts = 3;
    if (retry.initialIntervalSeconds === undefined) retry.initialIntervalSeconds = 30;
    if (retry.backoffCoefficient === undefined) retry.backoffCoefficient = 2.0;
    if (retry.maxIntervalSeconds === undefined) retry.maxIntervalSeconds = 600;

    const heartbeat = (typeof temporal.heartbeat === "object" && temporal.heartbeat !== null && !Array.isArray(temporal.heartbeat))
      ? temporal.heartbeat as Record<string, unknown>
      : {};
    temporal.heartbeat = heartbeat;
    if (heartbeat.intervalSeconds === undefined) heartbeat.intervalSeconds = 30;
    if (heartbeat.timeoutSeconds === undefined) heartbeat.timeoutSeconds = 120;
  }
}

// ---------------------------------------------------------------------------
// resolveStartPhase()
// ---------------------------------------------------------------------------

export interface ResolveStartPhaseParams {
  reqPath: string;
  slug: string;
  fromPhase?: string;
  workflowConfig: WorkflowConfig;
  fs: FileSystem;
}

export interface ResolveStartPhaseResult {
  phase: string;
  logMessage?: string;
  error?: string;
}

interface DetectionEntry {
  docType: string;
  nextPhase: string;
  found: boolean;
}

/**
 * Resolves the start phase for a feature workflow.
 *
 * TIER 1: explicit --from-phase flag
 * TIER 2: filesystem auto-detection of contiguous PDLC artifact prefix
 */
export async function resolveStartPhase(
  params: ResolveStartPhaseParams,
): Promise<ResolveStartPhaseResult> {
  const { reqPath, slug, fromPhase, workflowConfig, fs } = params;

  // TIER 1: explicit --from-phase
  if (fromPhase !== undefined) {
    const phaseIds = workflowConfig.phases.map((p) => p.id);
    if (phaseIds.includes(fromPhase)) {
      return { phase: fromPhase };
    } else {
      return {
        phase: "",
        error: `Error: phase "${fromPhase}" not found. Valid phases: ${phaseIds.join(", ")}`,
      };
    }
  }

  // TIER 2: Auto-detection
  const featureFolder = nodePath.dirname(reqPath).replace(/\\/g, "/");

  const DETECTION_SEQUENCE: DetectionEntry[] = [
    { docType: "REQ",        nextPhase: "req-review",          found: false },
    { docType: "FSPEC",      nextPhase: "fspec-creation",      found: false },
    { docType: "TSPEC",      nextPhase: "tspec-creation",      found: false },
    { docType: "PLAN",       nextPhase: "plan-creation",       found: false },
    { docType: "PROPERTIES", nextPhase: "properties-creation", found: false },
  ];

  // Scan each artifact
  for (const entry of DETECTION_SEQUENCE) {
    const filePath = `${featureFolder}/${entry.docType}-${slug}.md`;
    const exists = await fs.exists(filePath);
    if (exists) {
      try {
        const content = await fs.readFile(filePath);
        entry.found = content.trim().length > 0;
      } catch {
        entry.found = false;
      }
    }
  }

  // Find the length of the contiguous present prefix starting at index 0
  let lastContiguousIndex = -1;
  for (let i = 0; i < DETECTION_SEQUENCE.length; i++) {
    if (DETECTION_SEQUENCE[i]!.found) {
      lastContiguousIndex = i;
    } else {
      break;
    }
  }

  let derivedPhase: string;
  let logMessage: string | undefined;

  if (lastContiguousIndex === -1) {
    // No artifacts present (REQ absent/empty). Defensive case.
    derivedPhase = "req-review";
    logMessage = undefined;
  } else if (lastContiguousIndex === DETECTION_SEQUENCE.length - 1) {
    // All 5 artifacts present
    derivedPhase = "implementation";
    logMessage = "Auto-detected resume phase: implementation (PROPERTIES found, implementation artifact missing)";
  } else if (lastContiguousIndex === 0) {
    // Only REQ contiguously present. Check whether any artifact beyond FSPEC exists.
    const hasGapArtifactBeyondFSPEC = DETECTION_SEQUENCE.slice(2).some((e) => e.found);
    if (hasGapArtifactBeyondFSPEC) {
      derivedPhase = "fspec-creation";
      logMessage = "Auto-detected resume phase: fspec-creation (REQ found, FSPEC missing)";
    } else {
      derivedPhase = "req-review";
      logMessage = undefined;
    }
  } else {
    // lastContiguousIndex > 0 and < length-1
    const nextEntry = DETECTION_SEQUENCE[lastContiguousIndex + 1]!;
    const present = DETECTION_SEQUENCE[lastContiguousIndex]!.docType;
    const missing = nextEntry.docType;
    derivedPhase = nextEntry.nextPhase;
    logMessage = `Auto-detected resume phase: ${derivedPhase} (${present} found, ${missing} missing)`;
  }

  // Validate derived phase exists in config
  const phaseIds = workflowConfig.phases.map((p) => p.id);
  if (!phaseIds.includes(derivedPhase)) {
    return {
      phase: "",
      error: `Error: auto-detected phase "${derivedPhase}" not found in workflow config. Use --from-phase to specify a valid start phase.`,
    };
  }

  return { phase: derivedPhase, logMessage };
}

// ---------------------------------------------------------------------------
// PHASE_LABELS
// ---------------------------------------------------------------------------

export const PHASE_LABELS: Record<string, { label: string; title: string }> = {
  "req-review":            { label: "R",   title: "REQ Review" },
  "fspec-review":          { label: "F",   title: "FSPEC Review" },
  "tspec-review":          { label: "T",   title: "TSPEC Review" },
  "plan-review":           { label: "P",   title: "PLAN Review" },
  "properties-review":     { label: "PR",  title: "PROPERTIES Review" },
  "properties-tests":      { label: "PTT", title: "Properties Tests" },
  "implementation-review": { label: "IR",  title: "Implementation Review" },
};

// ---------------------------------------------------------------------------
// countFindingsInCrossReviewFile()
// ---------------------------------------------------------------------------

/**
 * Count the number of data rows in the ## Findings table of a cross-review file.
 * Returns "?" if the file is not readable.
 */
export async function countFindingsInCrossReviewFile(
  featureFolder: string,
  agentId: string,
  phaseId: string,
  reviewState: ReviewState | undefined,
  slug: string,
  fs: FileSystem,
): Promise<number | "?"> {
  const docType = deriveDocumentType(phaseId);
  const skillName = agentIdToSkillName(agentId) ?? agentId;
  const currentRevision = reviewState?.writtenVersions[agentId] ?? 1;

  // Ensure featureFolder ends with "/"
  const folderWithSlash = featureFolder.endsWith("/") ? featureFolder : featureFolder + "/";
  const filePath = crossReviewPath(folderWithSlash, skillName, docType, currentRevision);

  let content: string;
  try {
    content = await fs.readFile(filePath);
  } catch {
    return "?";
  }

  // Find the ## Findings section and count data rows
  const lines = content.split("\n");
  let inFindingsTable = false;
  let pastSeparator = false;
  let count = 0;

  for (const line of lines) {
    if (!inFindingsTable) {
      if (/^#{1,6}\s+Findings\s*$/i.test(line.trim())) {
        inFindingsTable = true;
      }
      continue;
    }

    // Inside the Findings section
    if (!pastSeparator) {
      // Look for the separator row: |---|...---|
      if (/^\|[-|:\s]+\|/.test(line)) {
        pastSeparator = true;
      }
      continue;
    }

    // Count data rows (lines starting with "|")
    if (line.trimStart().startsWith("|")) {
      count++;
    } else if (line.trim() === "") {
      // Blank line ends the table
      break;
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// emitProgressLines()
// ---------------------------------------------------------------------------

/**
 * Emit progress lines for the current phase to stdout.
 */
export async function emitProgressLines(
  state: FeatureWorkflowState,
  phaseId: string,
  reviewState: ReviewState | undefined,
  featureFolder: string,
  slug: string,
  stdout: NodeJS.WriteStream,
  fs: FileSystem,
): Promise<void> {
  const phaseInfo = PHASE_LABELS[phaseId];
  const label = phaseInfo?.label ?? phaseId;
  const title = phaseInfo?.title ?? phaseId;
  const iteration = (reviewState?.revisionCount ?? 0) + 1;

  stdout.write(`[Phase ${label} — ${title}] Iteration ${iteration}\n`);

  // Emit per-reviewer status lines
  const reviewerStatuses = reviewState?.reviewerStatuses ?? {};
  for (const [reviewerId, status] of Object.entries(reviewerStatuses)) {
    if (status === "approved") {
      stdout.write(`  ${reviewerId}:  Approved ✅\n`);
    } else if (status === "revision_requested") {
      const N = await countFindingsInCrossReviewFile(
        featureFolder,
        reviewerId,
        phaseId,
        reviewState,
        slug,
        fs,
      );
      stdout.write(`  ${reviewerId}:  Need Attention (${N} findings)\n`);
    }
  }

  // Optimizer (author) dispatch detection
  const allReviewersDone =
    Object.keys(reviewerStatuses).length > 0 &&
    Object.values(reviewerStatuses).every((s) => s !== "pending");

  const activeAgentIds = state.activeAgentIds ?? [];
  if (allReviewersDone && activeAgentIds.length > 0) {
    const authorAgentId = activeAgentIds[0]!;
    stdout.write(`[Phase ${label} — ${title}] ${authorAgentId} addressing feedback...\n`);
  }
}

// ---------------------------------------------------------------------------
// handleQuestion()
// ---------------------------------------------------------------------------

/**
 * Handle a pending question in the poll loop.
 *
 * Discord-present: returns immediately (Discord handles this).
 * No Discord: writes question to stdout, prompts for stdin answer,
 * signals the workflow with the answer.
 */
export async function handleQuestion(
  question: PendingQuestionState,
  workflowId: string,
  params: PollParams,
): Promise<void> {
  // Discord present → return immediately (Discord handles this)
  if (params.discordConfig) {
    return;
  }

  // Write the question
  params.stdout.write(`[Question] ${question.question}\n`);

  // Flush "Answer: " before reading stdin (BR-CLI-20)
  await new Promise<void>((resolve) => {
    params.stdout.write("Answer: ", () => resolve());
  });

  // Read one line from stdin
  const answer = await readOneLine(params.stdin);

  if (answer === null) {
    params.stderr.write(
      "Warning: stdin closed before answer was provided; resuming workflow with empty answer.\n"
    );
    await params.temporalClient.signalHumanAnswer(workflowId, "");
  } else {
    await params.temporalClient.signalHumanAnswer(workflowId, answer);
  }
}

/**
 * Read one line from a readable stream.
 * Returns the first line (without trailing newline) or null on EOF/close.
 */
function readOneLine(stdin: NodeJS.ReadableStream): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const rl = nodeReadline.createInterface({ input: stdin as NodeJS.ReadableStream, terminal: false });
    let resolved = false;

    rl.once("line", (line: string) => {
      if (!resolved) {
        resolved = true;
        rl.close();
        resolve(line);
      }
    });

    rl.once("close", () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// PollParams
// ---------------------------------------------------------------------------

export interface PollParams {
  workflowId: string;
  temporalClient: TemporalClientWrapper;
  discordConfig?: RunConfig["discord"];
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadableStream;
  featureFolder: string;
  slug: string;
  fs: FileSystem;
}

// ---------------------------------------------------------------------------
// pollUntilTerminal()
// ---------------------------------------------------------------------------

function deepEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function arrayEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

interface EmittedState {
  phaseId: string;
  iteration: number;
  reviewerStatuses: Record<string, string>;
  activeAgentIds: string[];
}

/**
 * Poll the workflow state until a terminal state is reached.
 * Returns 0 for completed, 1 for failed/cancelled/revision-bound-reached.
 */
const MAX_CONSECUTIVE_QUERY_ERRORS = 5;

export async function pollUntilTerminal(params: PollParams): Promise<number> {
  const { workflowId, temporalClient, stdout, featureFolder, slug, fs } = params;

  let lastEmittedState: EmittedState | null = null;
  let lastTrackedPhaseId: string | null = null;
  let consecutiveErrors = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let state: FeatureWorkflowState;
    try {
      state = await temporalClient.queryWorkflowState(workflowId);
      consecutiveErrors = 0;
    } catch {
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_QUERY_ERRORS) {
        stdout.write(
          `workflow query failed ${MAX_CONSECUTIVE_QUERY_ERRORS} times consecutively — giving up\n`
        );
        return 1;
      }
      await sleep(2000);
      continue;
    }

    // Terminal states
    if (state.phaseStatus === "completed") {
      stdout.write("Workflow completed ✅\n");
      return 0;
    }
    if (state.phaseStatus === "failed") {
      stdout.write("Workflow failed ❌\n");
      return 1;
    }
    if (state.phaseStatus === "revision-bound-reached") {
      stdout.write("Workflow Revision Bound Reached ⚠️\n");
      return 1;
    }
    // "cancelled" is not in the PhaseStatus union but handle defensively
    if ((state.phaseStatus as string) === "cancelled") {
      stdout.write("Workflow cancelled\n");
      return 1;
    }

    // Handle ROUTE_TO_USER
    if (state.phaseStatus === "waiting-for-user" && state.pendingQuestion) {
      await handleQuestion(state.pendingQuestion, workflowId, params);
      await sleep(2000);
      continue;
    }

    // Per-phase transition detection
    if (lastTrackedPhaseId !== null && lastTrackedPhaseId !== state.currentPhaseId) {
      const exitedPhaseId = lastTrackedPhaseId;
      const exitedPhaseInfo = PHASE_LABELS[exitedPhaseId];
      if (exitedPhaseInfo !== undefined) {
        const exitedResult = state.completedPhaseResults?.[exitedPhaseId];
        if (exitedResult === "passed") {
          stdout.write(`[Phase ${exitedPhaseInfo.label} — ${exitedPhaseInfo.title}] Passed ✅\n`);
        } else if (exitedResult === "revision-bound-reached") {
          stdout.write(`[Phase ${exitedPhaseInfo.label} — ${exitedPhaseInfo.title}] Revision Bound Reached ⚠️\n`);
        }
      }
    }

    // Always update lastTrackedPhaseId
    lastTrackedPhaseId = state.currentPhaseId;

    // Progress emission (deduplication) — only for phases in PHASE_LABELS
    if (PHASE_LABELS[state.currentPhaseId] !== undefined) {
      const reviewState = state.reviewStates?.[state.currentPhaseId];
      const currentIteration = reviewState?.revisionCount ?? 0;
      const currentActiveAgentIds = state.activeAgentIds ?? [];

      const hasChanged =
        lastEmittedState?.phaseId !== state.currentPhaseId ||
        lastEmittedState?.iteration !== currentIteration ||
        !deepEqual(
          lastEmittedState?.reviewerStatuses as Record<string, unknown>,
          reviewState?.reviewerStatuses as Record<string, unknown>
        ) ||
        !arrayEqual(lastEmittedState?.activeAgentIds, currentActiveAgentIds);

      if (hasChanged) {
        await emitProgressLines(
          state,
          state.currentPhaseId,
          reviewState,
          featureFolder,
          slug,
          stdout,
          fs,
        );
        lastEmittedState = {
          phaseId: state.currentPhaseId,
          iteration: currentIteration,
          reviewerStatuses: { ...(reviewState?.reviewerStatuses ?? {}) },
          activeAgentIds: [...currentActiveAgentIds],
        };
      }
    }

    await sleep(2000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// RunCommandDeps, RunCommandParams, RunCommand
// ---------------------------------------------------------------------------

export interface RunCommandDeps {
  fs: FileSystem;
  temporalClient: TemporalClientWrapper;
  workflowConfigLoader: WorkflowConfigLoader;
  configLoader: RunConfigLoader;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadableStream;
}

export interface RunCommandParams {
  reqPath: string;
  fromPhase?: string;
}

const DEFAULT_TEMPORAL_CONFIG: TemporalConfig = {
  address: "localhost:7233",
  namespace: "default",
  taskQueue: "ptah-main",
  worker: { maxConcurrentWorkflowTasks: 10, maxConcurrentActivities: 3 },
  retry: { maxAttempts: 3, initialIntervalSeconds: 30, backoffCoefficient: 2.0, maxIntervalSeconds: 600 },
  heartbeat: { intervalSeconds: 30, timeoutSeconds: 120 },
};

export class RunCommand {
  constructor(private deps: RunCommandDeps) {}

  async execute(params: RunCommandParams): Promise<number> {
    const { fs, temporalClient, workflowConfigLoader, configLoader, stdout, stderr, stdin } = this.deps;
    const { reqPath, fromPhase } = params;

    // STEP 1: Validate REQ file
    const reqExists = await fs.exists(reqPath);
    if (!reqExists) {
      stdout.write(`Error: REQ file not found: ${reqPath}\n`);
      return 1;
    }

    let reqContent: string;
    try {
      reqContent = await fs.readFile(reqPath);
    } catch (err) {
      stdout.write(`Error: REQ file not found: ${reqPath}\n`);
      return 1;
    }

    if (reqContent.trim() === "") {
      stdout.write(`Error: REQ file is empty: ${reqPath}\n`);
      return 1;
    }

    // STEP 2: Derive feature slug
    const featureFolder = nodePath.dirname(reqPath);
    let slug = nodePath.basename(featureFolder);
    if (slug === "" || slug === ".") {
      slug = nodePath.basename(reqPath, ".md").replace(/^REQ-/, "");
    }

    // STEP 3: Load workflow config
    let workflowConfig: WorkflowConfig;
    try {
      workflowConfig = await workflowConfigLoader.load();
    } catch (err) {
      if (err instanceof WorkflowConfigError) {
        stdout.write("Error: ptah.workflow.yaml not found in current directory.\n");
        return 1;
      }
      stdout.write(`Error: failed to load workflow config: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }

    // STEP 4: Resolve startAtPhase
    const resolveResult = await resolveStartPhase({ reqPath, slug, fromPhase, workflowConfig, fs });
    if (resolveResult.error) {
      stdout.write(resolveResult.error + "\n");
      return 1;
    }
    const startAtPhase = resolveResult.phase;
    if (resolveResult.logMessage) {
      stdout.write(resolveResult.logMessage + "\n");
    }

    // STEP 5: Check for duplicate running workflow
    let running: string[];
    try {
      running = await temporalClient.listWorkflowsByPrefix(
        `ptah-${slug}`,
        { statusFilter: ["Running", "ContinuedAsNew"] }
      );
    } catch (err) {
      stdout.write(`Error: unable to check for running workflows: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }

    if (running.length > 0) {
      stdout.write(
        `Error: workflow already running for feature "${slug}". ` +
        `Use --from-phase to restart from a specific phase after terminating the existing workflow.\n`
      );
      return 1;
    }

    // STEP 6: Load ptah config (for Discord detection and Temporal config)
    let runConfig: RunConfig;
    try {
      runConfig = await configLoader.load();
    } catch (err) {
      stdout.write(`Error: failed to load ptah.config.json: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }

    // STEP 7: Connect and start workflow
    await temporalClient.connect();

    const featureConfig = { discipline: "fullstack" as const, skipFspec: false };

    const workflowId = await temporalClient.startFeatureWorkflow({
      featureSlug: slug,
      featureConfig,
      workflowConfig,
      startAtPhase,
    });

    // STEP 8: Progress polling loop
    const exitCode = await pollUntilTerminal({
      workflowId,
      temporalClient,
      discordConfig: runConfig.discord,
      stdout,
      stderr,
      stdin,
      featureFolder,
      slug,
      fs,
    });

    await temporalClient.disconnect();
    return exitCode;
  }
}
