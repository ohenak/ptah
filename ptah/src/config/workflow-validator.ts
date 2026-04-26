/**
 * Workflow configuration validator.
 *
 * Validates WorkflowConfig at startup per REQ-CD-05:
 * - Unique phase IDs
 * - Valid agent references
 * - Valid transition targets
 * - No invalid cycles (review loops are allowed)
 * - Required fields present
 */

import type { WorkflowConfig, PhaseDefinition } from "./workflow-config.js";
import type { AgentRegistry } from "../orchestrator/agent-registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationError {
  phase: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface WorkflowValidator {
  validate(config: WorkflowConfig, agentRegistry: AgentRegistry): ValidationResult;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DefaultWorkflowValidator implements WorkflowValidator {
  validate(config: WorkflowConfig, agentRegistry: AgentRegistry): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    this.validateUniquePhaseIds(config.phases, errors);
    this.validateRequiredFields(config.phases, errors, warnings);
    this.validateAgentRefs(config.phases, agentRegistry, errors);
    this.validateTransitions(config.phases, errors);
    this.validateNoCycles(config.phases, errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateUniquePhaseIds(phases: PhaseDefinition[], errors: ValidationError[]): void {
    const seen = new Set<string>();
    for (const phase of phases) {
      if (seen.has(phase.id)) {
        errors.push({
          phase: phase.id,
          field: "id",
          message: `Phase ID "${phase.id}" is duplicate. Phase IDs must be unique.`,
        });
      }
      seen.add(phase.id);
    }
  }

  private validateRequiredFields(phases: PhaseDefinition[], errors: ValidationError[], warnings: ValidationError[]): void {
    for (const phase of phases) {
      if (phase.type === "creation" || phase.type === "implementation") {
        if (!phase.agent && (!phase.agents || phase.agents.length === 0)) {
          errors.push({
            phase: phase.id,
            field: "agent",
            message: `Phase "${phase.id}" of type "${phase.type}" must have "agent" or "agents" field.`,
          });
        }
      }

      if (phase.type === "review") {
        if (!phase.reviewers || Object.keys(phase.reviewers).length === 0) {
          errors.push({
            phase: phase.id,
            field: "reviewers",
            message: `Phase "${phase.id}" of type "review" must have "reviewers" field with at least one manifest.`,
          });
        }

        // PROP-WFV-01: revision_bound missing produces a warning for backward compat
        if (phase.revision_bound === undefined || phase.revision_bound === null) {
          warnings.push({
            phase: phase.id,
            field: "revision_bound",
            message: `Phase "${phase.id}" of type "review" should have a "revision_bound" field.`,
          });
        }
      }

      // PROP-WFV-02, PROP-WFV-03, PROP-WFV-04: validate skip_if block
      if (phase.skip_if !== undefined) {
        this.validateSkipIfBlock(phase, errors);
      }
    }
  }

  private validateSkipIfBlock(phase: PhaseDefinition, errors: ValidationError[]): void {
    const skipIf = phase.skip_if as unknown as Record<string, unknown>;

    if (skipIf["field"] === "artifact.exists") {
      // PROP-WFV-04: artifact.exists must NOT have equals
      if ("equals" in skipIf) {
        errors.push({
          phase: phase.id,
          field: "skip_if",
          message: `Phase "${phase.id}" skip_if with field "artifact.exists" must not have an "equals" property (malformed discriminated union).`,
        });
      }
      // PROP-WFV-03: artifact.exists must have a non-empty artifact field
      if (!skipIf["artifact"] || typeof skipIf["artifact"] !== "string" || skipIf["artifact"] === "") {
        errors.push({
          phase: phase.id,
          field: "skip_if",
          message: `Phase "${phase.id}" skip_if with field "artifact.exists" must have a non-empty "artifact" field.`,
        });
      }
    } else {
      // config.* branch: must NOT have artifact property
      if ("artifact" in skipIf) {
        errors.push({
          phase: phase.id,
          field: "skip_if",
          message: `Phase "${phase.id}" skip_if with a config.* field must not have an "artifact" property (malformed discriminated union).`,
        });
      }
    }
  }

  private validateAgentRefs(
    phases: PhaseDefinition[],
    agentRegistry: AgentRegistry,
    errors: ValidationError[],
  ): void {
    for (const phase of phases) {
      // Single agent
      if (phase.agent) {
        if (!agentRegistry.getAgentById(phase.agent)) {
          errors.push({
            phase: phase.id,
            field: "agent",
            message: `Phase "${phase.id}" references unknown agent "${phase.agent}".`,
          });
        }
      }

      // Fork/join agents
      if (phase.agents) {
        for (const agentId of phase.agents) {
          if (!agentRegistry.getAgentById(agentId)) {
            errors.push({
              phase: phase.id,
              field: "agents",
              message: `Phase "${phase.id}" references unknown agent "${agentId}" in agents array.`,
            });
          }
        }
      }

      // Reviewer manifests
      if (phase.reviewers) {
        for (const [discipline, reviewerIds] of Object.entries(phase.reviewers)) {
          if (!reviewerIds) continue;
          for (const reviewerId of reviewerIds) {
            if (!agentRegistry.getAgentById(reviewerId)) {
              errors.push({
                phase: phase.id,
                field: "reviewers",
                message: `Phase "${phase.id}" reviewers.${discipline} references unknown agent "${reviewerId}".`,
              });
            }
          }
        }
      }
    }
  }

  private validateTransitions(phases: PhaseDefinition[], errors: ValidationError[]): void {
    const phaseIds = new Set(phases.map(p => p.id));

    for (const phase of phases) {
      if (phase.transition && !phaseIds.has(phase.transition)) {
        errors.push({
          phase: phase.id,
          field: "transition",
          message: `Phase "${phase.id}" has transition to non-existent phase "${phase.transition}".`,
        });
      }
    }
  }

  private validateNoCycles(phases: PhaseDefinition[], errors: ValidationError[]): void {
    // Build the transition graph (only explicit transitions)
    const transitionMap = new Map<string, string>();
    for (const phase of phases) {
      if (phase.transition) {
        transitionMap.set(phase.id, phase.transition);
      }
    }

    // Build a lookup for phase types
    const phaseTypeMap = new Map<string, string>();
    for (const phase of phases) {
      phaseTypeMap.set(phase.id, phase.type);
    }

    // Check for self-transitions
    for (const phase of phases) {
      if (phase.transition === phase.id) {
        errors.push({
          phase: phase.id,
          field: "transition",
          message: `Phase "${phase.id}" has a self-referencing cycle.`,
        });
      }
    }

    // Check for multi-phase cycles that don't include a review phase
    // (Review loops are allowed because the workflow engine handles them)
    const phaseIds = new Set(phases.map(p => p.id));

    for (const startId of phaseIds) {
      const visited = new Set<string>();
      let current: string | undefined = startId;

      while (current && !visited.has(current)) {
        visited.add(current);
        current = transitionMap.get(current);
      }

      // If we found a cycle (current is in visited and equals a node we visited)
      if (current && visited.has(current)) {
        // Collect all phases in the cycle
        const cyclePhases: string[] = [];
        let inCycle = false;
        const visitedArray = [...visited];
        for (const phaseId of visitedArray) {
          if (phaseId === current) inCycle = true;
          if (inCycle) cyclePhases.push(phaseId);
        }
        if (current !== visitedArray[visitedArray.length - 1]) {
          // The cycle continues back to `current`
        }

        // Check if any phase in the cycle is a review phase
        const hasReviewPhase = cyclePhases.some(
          pid => phaseTypeMap.get(pid) === "review"
        );

        if (!hasReviewPhase) {
          // Only report the cycle starting from `current` to avoid duplicates
          // We only report if `startId` is the cycle entry point
          if (startId === current) {
            errors.push({
              phase: current,
              field: "transition",
              message: `Phase "${current}" is part of a cycle: ${cyclePhases.join(" → ")} → ${current}. Cycles are only allowed when they include a review phase.`,
            });
          }
        }
      }
    }
  }
}
