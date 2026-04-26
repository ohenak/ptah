/**
 * MigrateCommand — migrates v4 pdlc-state.json to Temporal Workflows.
 *
 * Reads the v4 state file, maps each feature's phase to the v5 workflow
 * phase ID, and starts a Temporal Workflow for each feature at the
 * corresponding phase. Supports --dry-run, --include-completed,
 * and --phase-map flags.
 *
 * TSPEC Section 11, FSPEC-MG-01.
 */

import type { FileSystem } from "../services/filesystem.js";
import type { Logger } from "../services/logger.js";
import type { TemporalClientWrapper } from "../temporal/client.js";
import type { PdlcStateFile, FeatureState } from "../orchestrator/pdlc/v4-types.js";
import type { ReviewPhaseState } from "../temporal/types.js";
import { WorkflowConfigError } from "../config/workflow-config.js";
import type { WorkflowConfig } from "../config/workflow-config.js";

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface MigrateOptions {
  dryRun: boolean;
  includeCompleted: boolean;
  phaseMapPath?: string;
}

export interface MigrateResult {
  activeCreated: number;
  completedImported: number;
  skipped: number;
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Built-in V4 → V5 phase mapping (TSPEC Section 11.1, BR-24)
// ---------------------------------------------------------------------------

const V4_DEFAULT_MAPPING: Record<string, string> = {
  REQ_CREATION: "req-creation",
  REQ_REVIEW: "req-review",
  REQ_APPROVED: "req-approved",
  FSPEC_CREATION: "fspec-creation",
  FSPEC_REVIEW: "fspec-review",
  FSPEC_APPROVED: "fspec-approved",
  TSPEC_CREATION: "tspec-creation",
  TSPEC_REVIEW: "tspec-review",
  TSPEC_APPROVED: "tspec-approved",
  PLAN_CREATION: "plan-creation",
  PLAN_REVIEW: "plan-review",
  PLAN_APPROVED: "plan-approved",
  PROPERTIES_CREATION: "properties-creation",
  PROPERTIES_REVIEW: "properties-review",
  PROPERTIES_APPROVED: "properties-approved",
  IMPLEMENTATION: "implementation",
  IMPLEMENTATION_REVIEW: "implementation-review",
  DONE: "done",
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

// ---------------------------------------------------------------------------
// MigrateCommand
// ---------------------------------------------------------------------------

export class MigrateCommand {
  constructor(
    private readonly temporalClient: TemporalClientWrapper,
    private readonly fs: FileSystem,
    private readonly logger: Logger,
  ) {}

  async execute(options: MigrateOptions): Promise<MigrateResult> {
    // -----------------------------------------------------------------------
    // Step 1: Read pdlc-state.json
    // -----------------------------------------------------------------------
    let stateFile: PdlcStateFile;
    try {
      const raw = await this.fs.readFile("pdlc-state.json");
      stateFile = JSON.parse(raw) as PdlcStateFile;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new MigrationError("pdlc-state.json not found. Nothing to migrate.");
      }
      if (error instanceof SyntaxError) {
        throw new MigrationError(`pdlc-state.json is not valid JSON: ${error.message}`);
      }
      throw error;
    }

    // -----------------------------------------------------------------------
    // Step 2: Read ptah.workflow.yaml (for phase validation)
    // -----------------------------------------------------------------------
    let validPhaseIds: Set<string>;
    try {
      const raw = await this.fs.readFile("ptah.workflow.yaml");
      // Parse only what we need — the set of valid phase IDs
      validPhaseIds = this.extractPhaseIds(raw);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new MigrationError(
          "ptah.workflow.yaml not found. Run 'ptah init' first.",
        );
      }
      if (error instanceof WorkflowConfigError) throw error;
      throw error;
    }

    // -----------------------------------------------------------------------
    // Step 3: Build phase mapping
    // -----------------------------------------------------------------------
    let phaseMapping: Record<string, string>;
    if (options.phaseMapPath) {
      phaseMapping = await this.loadCustomPhaseMap(options.phaseMapPath, validPhaseIds);
    } else {
      phaseMapping = V4_DEFAULT_MAPPING;
    }

    // -----------------------------------------------------------------------
    // Step 4: Validate all features are mappable
    // -----------------------------------------------------------------------
    const features = Object.values(stateFile.features);
    const unmappable: string[] = [];
    for (const feature of features) {
      const v4Phase = feature.phase;
      if (!phaseMapping[v4Phase]) {
        unmappable.push(`${feature.slug} (${v4Phase})`);
      }
    }
    if (unmappable.length > 0) {
      throw new MigrationError(
        `Migration failed: ${unmappable.length} feature(s) have unmapped phases: ${unmappable.join(", ")}. ` +
          `Use --phase-map to provide a custom mapping.`,
      );
    }

    // -----------------------------------------------------------------------
    // Step 5: Dry-run — print table and return counts without creating workflows
    // -----------------------------------------------------------------------
    if (options.dryRun) {
      return this.computeDryRunResult(features, phaseMapping, options.includeCompleted);
    }

    // -----------------------------------------------------------------------
    // Step 6: Connect to Temporal (only if not already connected)
    // -----------------------------------------------------------------------
    if (!this.temporalClient.isConnected()) {
      await this.temporalClient.connect();
    }

    // -----------------------------------------------------------------------
    // Steps 7–9: Create workflows, validate, summarise
    // -----------------------------------------------------------------------
    const warnings: string[] = [];
    const errors: string[] = [];
    let activeCreated = 0;
    let completedImported = 0;
    let skipped = 0;

    // Load workflow config for passing to startFeatureWorkflow
    const workflowConfigRaw = await this.fs.readFile("ptah.workflow.yaml");
    const workflowConfig = this.parseWorkflowYaml(workflowConfigRaw);

    const createdWorkflowIds: Array<{ workflowId: string; expectedPhase: string }> = [];

    for (const feature of features) {
      const isDone = feature.phase === "DONE";

      // Skip completed features unless --include-completed
      if (isDone && !options.includeCompleted) {
        continue;
      }

      const v5Phase = phaseMapping[feature.phase]!;
      const workflowId = `ptah-feature-${feature.slug}-1`;

      // BR-22: check if workflow already exists
      const existingIds = await this.temporalClient.listWorkflowsByPrefix(
        `ptah-feature-${feature.slug}`,
      );
      if (existingIds.length > 0) {
        skipped++;
        this.logger.info(`Skipping ${feature.slug} — workflow already exists (${existingIds[0]})`);
        continue;
      }

      // Emit fork/join reset warning (FSPEC-MG-01 edge case)
      if (feature.forkJoin) {
        const hasPartialCompletion = Object.values(feature.forkJoin.subtasks).some(
          (s) => s === "complete",
        );
        if (hasPartialCompletion) {
          warnings.push(
            `Feature '${feature.slug}' was mid fork/join with partial completion. ` +
              `All subtasks reset to pending — all agents will be re-dispatched.`,
          );
        }
      }

      // Transfer review state (BR-23)
      const initialReviewState = this.buildInitialReviewState(feature, phaseMapping);

      try {
        await this.temporalClient.startFeatureWorkflow({
          featureSlug: feature.slug,
          featureConfig: feature.config,
          workflowConfig,
          startAtPhase: v5Phase,
          initialReviewState,
        });

        if (isDone) {
          completedImported++;
        } else {
          activeCreated++;
        }

        createdWorkflowIds.push({ workflowId, expectedPhase: v5Phase });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to create workflow for feature '${feature.slug}': ${message}`);
        this.logger.error(
          `Failed to create workflow for feature '${feature.slug}': ${message}`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // Step 8: Validate imports
    // -----------------------------------------------------------------------
    for (const { workflowId, expectedPhase } of createdWorkflowIds) {
      try {
        const state = await this.temporalClient.queryWorkflowState(workflowId);
        if (state.currentPhaseId !== expectedPhase) {
          warnings.push(
            `Workflow ${workflowId} expected phase ${expectedPhase} but reports ${state.currentPhaseId}.`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(
          `Could not verify workflow ${workflowId}: failed to query state — ${message}`,
        );
      }
    }

    return { activeCreated, completedImported, skipped, warnings, errors };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract all phase IDs from the raw YAML string without a full YAML parser.
   * Looks for lines matching `  - id: <value>`.
   */
  private extractPhaseIds(yamlContent: string): Set<string> {
    const ids = new Set<string>();
    for (const line of yamlContent.split("\n")) {
      const match = line.match(/^\s*-?\s*id:\s*(\S+)/);
      if (match?.[1]) {
        ids.add(match[1]);
      }
    }
    return ids;
  }

  /**
   * Parse the workflow YAML into a minimal WorkflowConfig shape.
   * Only extracts version and phases array (with id/name/type fields).
   * The type field is widened from string to PhaseType via cast.
   */
  private parseWorkflowYaml(raw: string): WorkflowConfig {
    // Simple line-by-line extraction for the fields we need
    // We rely on the YAML being well-formed (already validated in step 2)
    const lines = raw.split("\n");
    const phases: Array<{ id: string; name: string; type: string }> = [];
    let version = 1;
    let currentPhase: Partial<{ id: string; name: string; type: string }> | null = null;

    for (const line of lines) {
      const versionMatch = line.match(/^version:\s*(\d+)/);
      if (versionMatch) {
        version = parseInt(versionMatch[1]!, 10);
        continue;
      }
      if (line.match(/^\s*-\s+id:/)) {
        if (currentPhase?.id) phases.push(currentPhase as { id: string; name: string; type: string });
        currentPhase = {};
      }
      const idMatch = line.match(/^\s*-?\s*id:\s*(\S+)/);
      if (idMatch?.[1] && currentPhase) currentPhase.id = idMatch[1];
      const nameMatch = line.match(/^\s*name:\s*(.+)$/);
      if (nameMatch?.[1] && currentPhase) currentPhase.name = nameMatch[1].trim();
      const typeMatch = line.match(/^\s*type:\s*(\S+)/);
      if (typeMatch?.[1] && currentPhase) currentPhase.type = typeMatch[1];
    }
    if (currentPhase?.id) phases.push(currentPhase as { id: string; name: string; type: string });

    return { version, phases } as unknown as WorkflowConfig;
  }

  private async loadCustomPhaseMap(
    filePath: string,
    validPhaseIds: Set<string>,
  ): Promise<Record<string, string>> {
    let raw: string;
    try {
      raw = await this.fs.readFile(filePath);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new MigrationError(`Phase map file not found: ${filePath}`);
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new MigrationError(
        `Phase map file '${filePath}' is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new MigrationError(
        `Phase map file '${filePath}' must be a JSON object mapping v4 phases to v5 phase IDs.`,
      );
    }

    const mapping = parsed as Record<string, unknown>;
    const invalidEntries: string[] = [];

    for (const [v4Phase, v5Phase] of Object.entries(mapping)) {
      if (typeof v5Phase !== "string") {
        invalidEntries.push(`${v4Phase}: value must be a string`);
        continue;
      }
      if (!validPhaseIds.has(v5Phase)) {
        invalidEntries.push(`${v4Phase} → ${v5Phase} (not a valid phase ID in ptah.workflow.yaml)`);
      }
    }

    if (invalidEntries.length > 0) {
      throw new MigrationError(
        `Phase map file '${filePath}' contains invalid entries:\n${invalidEntries.join("\n")}`,
      );
    }

    return mapping as Record<string, string>;
  }

  /**
   * Compute dry-run result — counts what would be created without connecting.
   */
  private computeDryRunResult(
    features: FeatureState[],
    phaseMapping: Record<string, string>,
    includeCompleted: boolean,
  ): MigrateResult {
    let activeCreated = 0;
    let completedImported = 0;

    for (const feature of features) {
      if (feature.phase === "DONE") {
        if (includeCompleted) completedImported++;
      } else {
        activeCreated++;
      }
    }

    return {
      activeCreated,
      completedImported,
      skipped: 0,
      warnings: [],
      errors: [],
    };
  }

  /**
   * Build the initialReviewState map from v4 reviewPhases (BR-23).
   * Maps v4 phase keys → v5 phase IDs → ReviewPhaseState.
   */
  private buildInitialReviewState(
    feature: FeatureState,
    phaseMapping: Record<string, string>,
  ): Record<string, ReviewPhaseState> {
    const result: Record<string, ReviewPhaseState> = {};
    if (!feature.reviewPhases) return result;

    for (const [v4Phase, reviewState] of Object.entries(feature.reviewPhases)) {
      if (!reviewState) continue;
      const v5Phase = phaseMapping[v4Phase];
      if (v5Phase) {
        result[v5Phase] = {
          reviewerStatuses: { ...reviewState.reviewerStatuses },
          revisionCount: reviewState.revisionCount,
          writtenVersions: {},
        };
      }
    }
    return result;
  }
}
