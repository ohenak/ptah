/**
 * Workflow Configuration types and YAML parser.
 *
 * Parses `ptah.workflow.yaml` into a validated WorkflowConfig structure.
 */

import yaml from "js-yaml";
import type { FileSystem } from "../services/filesystem.js";

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

export type PhaseType = "creation" | "review" | "approved" | "implementation";
export type FailurePolicy = "wait_for_all" | "fail_fast";

export interface ReviewerManifest {
  default?: string[];
  "backend-only"?: string[];
  "frontend-only"?: string[];
  fullstack?: string[];
}

export interface SkipCondition {
  field: string;  // e.g., "config.skipFspec"
  equals: boolean;
}

export interface ActivityRetryConfig {
  maxAttempts?: number;
  initialIntervalSeconds?: number;
  backoffCoefficient?: number;
  maxIntervalSeconds?: number;
}

export interface PhaseDefinition {
  id: string;
  name: string;
  type: PhaseType;
  agent?: string;
  agents?: string[];
  reviewers?: ReviewerManifest;
  transition?: string;
  skip_if?: SkipCondition;
  failure_policy?: FailurePolicy;
  context_documents?: string[];
  revision_bound?: number;
  retry?: ActivityRetryConfig;
}

export interface WorkflowConfig {
  version: number;
  phases: PhaseDefinition[];
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class WorkflowConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowConfigError";
  }
}

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

export interface WorkflowConfigLoader {
  load(path?: string): Promise<WorkflowConfig>;
}

// ---------------------------------------------------------------------------
// Default Path
// ---------------------------------------------------------------------------

const DEFAULT_WORKFLOW_CONFIG_PATH = "ptah.workflow.yaml";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class YamlWorkflowConfigLoader implements WorkflowConfigLoader {
  constructor(private fs: FileSystem) {}

  async load(path?: string): Promise<WorkflowConfig> {
    const configPath = path ?? DEFAULT_WORKFLOW_CONFIG_PATH;

    let raw: string;
    try {
      raw = await this.fs.readFile(configPath);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new WorkflowConfigError(
          `${configPath} not found. Run 'ptah init' first.`
        );
      }
      throw new WorkflowConfigError(
        `Failed to read ${configPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    let parsed: unknown;
    try {
      parsed = yaml.load(raw);
    } catch (error: unknown) {
      throw new WorkflowConfigError(
        `${configPath} contains invalid YAML: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (parsed === null || parsed === undefined || typeof parsed !== "object") {
      throw new WorkflowConfigError(
        `${configPath} is empty or not a valid YAML object.`
      );
    }

    const config = parsed as Record<string, unknown>;
    this.validateStructure(config, configPath);

    return config as unknown as WorkflowConfig;
  }

  private validateStructure(config: Record<string, unknown>, path: string): void {
    if (typeof config.version !== "number") {
      throw new WorkflowConfigError(
        `${path} is missing required field "version" (must be a number).`
      );
    }

    if (!Array.isArray(config.phases)) {
      throw new WorkflowConfigError(
        `${path} is missing required field "phases" (must be an array).`
      );
    }

    if (config.phases.length === 0) {
      throw new WorkflowConfigError(
        `${path} "phases" array must not be empty.`
      );
    }

    for (let i = 0; i < config.phases.length; i++) {
      const phase = config.phases[i] as Record<string, unknown>;

      if (typeof phase.id !== "string" || phase.id === "") {
        throw new WorkflowConfigError(
          `${path} phases[${i}].id is missing or empty.`
        );
      }

      if (typeof phase.name !== "string" || phase.name === "") {
        throw new WorkflowConfigError(
          `${path} phases[${i}].name is missing or empty.`
        );
      }

      const validTypes: PhaseType[] = ["creation", "review", "approved", "implementation"];
      if (!validTypes.includes(phase.type as PhaseType)) {
        throw new WorkflowConfigError(
          `${path} phases[${i}].type "${phase.type}" is invalid. Must be one of: ${validTypes.join(", ")}.`
        );
      }
    }
  }
}
