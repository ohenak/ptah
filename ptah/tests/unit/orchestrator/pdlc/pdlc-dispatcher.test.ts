import { describe, it, expect, beforeEach } from "vitest";
import { DefaultPdlcDispatcher, phaseToAgentId, isForkJoinPhase } from "../../../../src/orchestrator/pdlc/pdlc-dispatcher.js";
import { PdlcPhase } from "../../../../src/orchestrator/pdlc/phases.js";
import type {
  FeatureState,
  FeatureConfig,
  PdlcStateFile,
  DispatchAction,
} from "../../../../src/orchestrator/pdlc/phases.js";
import { createFeatureState } from "../../../../src/orchestrator/pdlc/state-machine.js";
import {
  computeReviewerManifest,
  reviewerKey,
  initializeReviewPhaseState,
} from "../../../../src/orchestrator/pdlc/review-tracker.js";
import {
  FakeStateStore,
  FakeFileSystem,
  FakeLogger,
  makeTechLeadConfig,
} from "../../../fixtures/factories.js";

// --- Test helpers ---

function backendConfig(): FeatureConfig {
  return { discipline: "backend-only", skipFspec: false };
}

function frontendConfig(): FeatureConfig {
  return { discipline: "frontend-only", skipFspec: false };
}

function fullstackConfig(): FeatureConfig {
  return { discipline: "fullstack", skipFspec: false };
}

function skipFspecConfig(): FeatureConfig {
  return { discipline: "backend-only", skipFspec: true };
}

const SLUG = "011-auth-login";
const NOW = "2026-03-14T10:00:00.000Z";
const WORKTREE = "/worktrees/feature-auth";
const DOCS_ROOT = "docs";

function makeDispatcher(stateStore?: FakeStateStore, fs?: FakeFileSystem, logger?: FakeLogger) {
  const store = stateStore ?? new FakeStateStore();
  const fileSystem = fs ?? new FakeFileSystem();
  const log = logger ?? new FakeLogger();
  return { dispatcher: new DefaultPdlcDispatcher(store, fileSystem, log, DOCS_ROOT), store, fs: fileSystem, logger: log };
}

async function setupWithFeature(
  config: FeatureConfig = backendConfig(),
  phase: PdlcPhase = PdlcPhase.REQ_CREATION,
): Promise<{
  dispatcher: DefaultPdlcDispatcher;
  store: FakeStateStore;
  fs: FakeFileSystem;
  logger: FakeLogger;
  featureState: FeatureState;
}> {
  const store = new FakeStateStore();
  const fs = new FakeFileSystem();
  const logger = new FakeLogger();

  const featureState = createFeatureState(SLUG, config, NOW);
  featureState.phase = phase;

  store.state = { version: 1, features: { [SLUG]: featureState } };

  const dispatcher = new DefaultPdlcDispatcher(store, fs, logger, DOCS_ROOT);
  await dispatcher.loadState();

  return { dispatcher, store, fs, logger, featureState };
}

async function setupInReviewPhase(
  reviewPhase: PdlcPhase,
  config: FeatureConfig = backendConfig(),
): Promise<{
  dispatcher: DefaultPdlcDispatcher;
  store: FakeStateStore;
  fs: FakeFileSystem;
  logger: FakeLogger;
  featureState: FeatureState;
}> {
  const result = await setupWithFeature(config, reviewPhase);
  const manifest = computeReviewerManifest(reviewPhase, config.discipline);
  const reviewState = initializeReviewPhaseState(manifest);
  result.featureState.reviewPhases[reviewPhase] = reviewState;
  result.store.state.features[SLUG] = result.featureState;
  // Reload
  await result.dispatcher.loadState();
  return result;
}

// --- Task 30: Constructor, loadState(), isManaged(), getFeatureState(), initializeFeature() ---

describe("DefaultPdlcDispatcher", () => {
  describe("loadState()", () => {
    it("loads state from state store", async () => {
      const { dispatcher, store } = makeDispatcher();
      const featureState = createFeatureState(SLUG, backendConfig(), NOW);
      store.state = { version: 1, features: { [SLUG]: featureState } };

      await dispatcher.loadState();

      expect(await dispatcher.isManaged(SLUG)).toBe(true);
    });

    it("handles empty state", async () => {
      const { dispatcher } = makeDispatcher();
      await dispatcher.loadState();

      expect(await dispatcher.isManaged(SLUG)).toBe(false);
    });
  });

  describe("isManaged()", () => {
    it("returns true for managed features", async () => {
      const { dispatcher } = await setupWithFeature();
      expect(await dispatcher.isManaged(SLUG)).toBe(true);
    });

    it("returns false for unmanaged features", async () => {
      const { dispatcher } = await setupWithFeature();
      expect(await dispatcher.isManaged("unknown-feature")).toBe(false);
    });

    it("throws if state not loaded", async () => {
      const { dispatcher } = makeDispatcher();
      await expect(dispatcher.isManaged(SLUG)).rejects.toThrow("State not loaded");
    });
  });

  describe("getFeatureState()", () => {
    it("returns state for managed feature", async () => {
      const { dispatcher, featureState } = await setupWithFeature();
      const state = await dispatcher.getFeatureState(SLUG);

      expect(state).not.toBeNull();
      expect(state!.slug).toBe(SLUG);
      expect(state!.phase).toBe(featureState.phase);
    });

    it("returns null for unmanaged feature", async () => {
      const { dispatcher } = await setupWithFeature();
      const state = await dispatcher.getFeatureState("unknown");
      expect(state).toBeNull();
    });
  });

  describe("initializeFeature()", () => {
    it("creates feature state with REQ_CREATION phase", async () => {
      const { dispatcher, store } = makeDispatcher();
      await dispatcher.loadState();

      const state = await dispatcher.initializeFeature(SLUG, backendConfig());

      expect(state.slug).toBe(SLUG);
      expect(state.phase).toBe(PdlcPhase.REQ_CREATION);
      expect(state.config.discipline).toBe("backend-only");
    });

    it("persists state via stateStore.save()", async () => {
      const { dispatcher, store } = makeDispatcher();
      await dispatcher.loadState();

      await dispatcher.initializeFeature(SLUG, backendConfig());

      expect(store.saveCount).toBe(1);
      expect(store.savedStates[0].features[SLUG]).toBeDefined();
    });

    it("makes feature managed after initialization", async () => {
      const { dispatcher } = makeDispatcher();
      await dispatcher.loadState();

      await dispatcher.initializeFeature(SLUG, backendConfig());

      expect(await dispatcher.isManaged(SLUG)).toBe(true);
    });
  });

  // --- Task 31: processAgentCompletion() — single-discipline LGTM ---

  describe("processAgentCompletion() — single-discipline LGTM", () => {
    it("transitions from REQ_CREATION to REQ_REVIEW on LGTM", async () => {
      const { dispatcher, store, fs } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);

      // Add the expected artifact
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-REQ-auth-login.md`, "# REQ doc");

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        // Should dispatch reviewers
        expect(result.agents.length).toBeGreaterThan(0);
        expect(result.agents.every(a => a.taskType === "Review")).toBe(true);
      }

      // State should be persisted
      expect(store.saveCount).toBeGreaterThan(0);
      const savedState = store.savedStates[store.savedStates.length - 1];
      expect(savedState.features[SLUG].phase).toBe(PdlcPhase.REQ_REVIEW);
    });

    it("transitions from FSPEC_CREATION to FSPEC_REVIEW", async () => {
      const { dispatcher, fs } = await setupWithFeature(backendConfig(), PdlcPhase.FSPEC_CREATION);
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-FSPEC-auth-login.md`, "# FSPEC doc");

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("dispatch");
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_REVIEW);
    });

    it("TASK_COMPLETE in non-terminal phase treated as LGTM with warning", async () => {
      const { dispatcher, fs, logger } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-REQ-auth-login.md`, "# REQ");

      await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "TASK_COMPLETE",
        worktreePath: WORKTREE,
      });

      expect(logger.messages.some(m => m.level === "warn" && m.message.includes("TASK_COMPLETE"))).toBe(true);
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.REQ_REVIEW);
    });

    it("dispatches correct reviewers for backend-only REQ_REVIEW", async () => {
      const { dispatcher, fs } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-REQ-auth-login.md`, "# REQ");

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        const agentIds = result.agents.map(a => a.agentId);
        expect(agentIds).toContain("eng");
        expect(agentIds).toContain("qa");
      }
    });

    it("persists updated state after transition", async () => {
      const { dispatcher, store, fs } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-REQ-auth-login.md`, "# REQ");

      await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      const lastSaved = store.savedStates[store.savedStates.length - 1];
      expect(lastSaved.features[SLUG].phase).toBe(PdlcPhase.REQ_REVIEW);
    });
  });

  // --- Task 32: processAgentCompletion() — fullstack fork/join ---

  describe("processAgentCompletion() — fullstack fork/join", () => {
    it("partial completion returns wait", async () => {
      const { dispatcher, fs } = await setupWithFeature(fullstackConfig(), PdlcPhase.TSPEC_CREATION);
      // Initialize fork/join state
      const featureState = (await dispatcher.getFeatureState(SLUG))!;
      featureState.forkJoin = { subtasks: { eng: "pending", fe: "pending" } };

      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-TSPEC-auth-login.md`, "# TSPEC");

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "eng",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("wait");
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_CREATION);
      expect(state!.forkJoin?.subtasks.eng).toBe("complete");
      expect(state!.forkJoin?.subtasks.fe).toBe("pending");
    });

    it("full completion transitions to review and dispatches reviewers", async () => {
      const { dispatcher, fs, store } = await setupWithFeature(fullstackConfig(), PdlcPhase.TSPEC_CREATION);
      const featureState = (await dispatcher.getFeatureState(SLUG))!;
      featureState.forkJoin = { subtasks: { eng: "complete", fe: "pending" } };

      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-TSPEC-auth-login.md`, "# TSPEC");

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "fe",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents.every(a => a.taskType === "Review")).toBe(true);
      }

      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_REVIEW);
      expect(state!.forkJoin).toBeNull();
    });

    it("uses subtask_complete event for fullstack fork/join phases", async () => {
      const { dispatcher, fs } = await setupWithFeature(fullstackConfig(), PdlcPhase.PLAN_CREATION);
      const featureState = (await dispatcher.getFeatureState(SLUG))!;
      featureState.forkJoin = { subtasks: { eng: "pending", fe: "pending" } };

      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-PLAN-auth-login.md`, "# PLAN");

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "eng",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      // Partial completion — should wait
      expect(result.action).toBe("wait");
    });

    it("handles IMPLEMENTATION fork/join", async () => {
      const { dispatcher, fs } = await setupWithFeature(fullstackConfig(), PdlcPhase.IMPLEMENTATION);
      const featureState = (await dispatcher.getFeatureState(SLUG))!;
      featureState.forkJoin = { subtasks: { eng: "complete", fe: "pending" } };

      // No artifact validation for IMPLEMENTATION
      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "fe",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("dispatch");
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.IMPLEMENTATION_REVIEW);
    });
  });

  // --- Task 33: processAgentCompletion() — artifact validation ---

  describe("processAgentCompletion() — artifact validation", () => {
    it("returns retry_agent when artifact missing", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);
      // Do NOT add the artifact file

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("retry_agent");
      if (result.action === "retry_agent") {
        expect(result.reason).toBe("artifact_missing");
        expect(result.message).toContain("011-REQ-auth-login.md");
      }
    });

    it("skips artifact validation for IMPLEMENTATION phase", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.IMPLEMENTATION);
      // No artifact to validate for IMPLEMENTATION

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "eng",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("dispatch");
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.IMPLEMENTATION_REVIEW);
    });

    it("validates artifact for FSPEC_CREATION", async () => {
      const { dispatcher, fs } = await setupWithFeature(backendConfig(), PdlcPhase.FSPEC_CREATION);

      // Without artifact
      const resultMissing = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });
      expect(resultMissing.action).toBe("retry_agent");

      // With artifact
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-FSPEC-auth-login.md`, "# FSPEC");

      // Need to reload state since the prior call didn't transition
      const resultPresent = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });
      expect(resultPresent.action).toBe("dispatch");
    });

    it("validates artifact for TSPEC_CREATION", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.TSPEC_CREATION);

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "eng",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("retry_agent");
      if (result.action === "retry_agent") {
        expect(result.message).toContain("011-TSPEC-auth-login.md");
      }
    });

    it("validates artifact for PROPERTIES_CREATION", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.PROPERTIES_CREATION);

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "qa",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("retry_agent");
      if (result.action === "retry_agent") {
        expect(result.message).toContain("011-PROPERTIES-auth-login.md");
      }
    });
  });

  // --- Task 34: processReviewCompletion() — happy path ---

  describe("processReviewCompletion() — happy path", () => {
    it("processes approved review and updates reviewer status", async () => {
      const { dispatcher, fs, store } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      // Add cross-review file with Approved recommendation
      const reviewFile = `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`;
      fs.addExisting(reviewFile, "## Recommendation\n\nApproved");

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      // eng approved but qa still pending — should be wait
      expect(result.action).toBe("wait");
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.reviewPhases[PdlcPhase.REQ_REVIEW]!.reviewerStatuses.eng).toBe("approved");
    });

    it("all reviewers approved triggers auto-transition to next creation phase", async () => {
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      // Both reviewers approve
      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "## Recommendation\n\nApproved",
      );
      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-test-engineer-REQ.md`,
        "## Recommendation\n\nApproved",
      );

      // First reviewer
      await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      // Second reviewer
      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "qa",
        worktreePath: WORKTREE,
      });

      // Should auto-transition to FSPEC_CREATION and dispatch
      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents[0].taskType).toBe("Create");
        expect(result.agents[0].documentType).toBe("FSPEC");
      }

      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_CREATION);
    });

    it("handles Approved with minor changes as approved", async () => {
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "## Recommendation\n\nApproved with minor changes.",
      );

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("wait");
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.reviewPhases[PdlcPhase.REQ_REVIEW]!.reviewerStatuses.eng).toBe("approved");
    });

    it("revision requested by one reviewer waits for all then triggers revision", async () => {
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      // eng rejects
      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "## Recommendation\n\nNeeds revision",
      );
      // qa approves
      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-test-engineer-REQ.md`,
        "## Recommendation\n\nApproved",
      );

      // First: eng rejects
      const result1 = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });
      expect(result1.action).toBe("wait"); // Still waiting for qa

      // Second: qa approves — now all complete, has rejection
      const result2 = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "qa",
        worktreePath: WORKTREE,
      });

      expect(result2.action).toBe("dispatch");
      if (result2.action === "dispatch") {
        expect(result2.agents[0].taskType).toBe("Revise");
        expect(result2.agents[0].documentType).toBe("REQ");
      }

      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.REQ_CREATION);
    });

    it("persists state after review", async () => {
      const { dispatcher, fs, store } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "## Recommendation\n\nApproved",
      );

      const initialSaveCount = store.saveCount;

      await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      expect(store.saveCount).toBeGreaterThan(initialSaveCount);
    });

    it("handles scoped reviewer key", async () => {
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.TSPEC_REVIEW, fullstackConfig());

      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-product-manager-TSPEC.md`,
        "## Recommendation\n\nApproved",
      );

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "pm",
        reviewerScope: "fe_tspec",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("wait");
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.reviewPhases[PdlcPhase.TSPEC_REVIEW]!.reviewerStatuses["pm:fe_tspec"]).toBe("approved");
    });
  });

  // --- Task 35: processReviewCompletion() — error cases ---

  describe("processReviewCompletion() — error cases", () => {
    it("returns pause when cross-review file is missing", async () => {
      const { dispatcher } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);
      // Do NOT add the cross-review file

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("pause");
      if (result.action === "pause") {
        expect(result.reason).toBe("file_missing");
        expect(result.message).toContain("not found");
      }
    });

    it("returns pause when no Recommendation heading found", async () => {
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "# Cross Review\n\nThis document has no recommendation section.",
      );

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("pause");
      if (result.action === "pause") {
        expect(result.reason).toBe("no_recommendation");
        expect(result.message).toContain("Recommendation");
      }
    });

    it("returns pause when recommendation is unrecognized", async () => {
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "## Recommendation\n\nConditionally deferred pending further analysis",
      );

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("pause");
      if (result.action === "pause") {
        expect(result.reason).toBe("unrecognized_recommendation");
        expect(result.message).toContain("unrecognized");
      }
    });

    it("returns pause for unknown agent ID", async () => {
      const { dispatcher } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "unknown-agent",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("pause");
      if (result.action === "pause") {
        expect(result.reason).toBe("unknown_agent");
      }
    });
  });

  // --- Task 36: getNextAction() — startup recovery ---

  describe("getNextAction() — startup recovery", () => {
    it("dispatches creation agent for creation phases", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents.length).toBe(1);
        expect(result.agents[0].agentId).toBe("pm");
        expect(result.agents[0].taskType).toBe("Create");
        expect(result.agents[0].documentType).toBe("REQ");
      }
    });

    it("dispatches pending reviewers for review phases", async () => {
      const { dispatcher } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        const agentIds = result.agents.map(a => a.agentId);
        expect(agentIds).toContain("eng");
        expect(agentIds).toContain("qa");
        expect(result.agents.every(a => a.taskType === "Review")).toBe(true);
      }
    });

    it("dispatches only pending reviewers (some already complete)", async () => {
      const { dispatcher } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      // Mark eng as already approved
      const state = await dispatcher.getFeatureState(SLUG);
      state!.reviewPhases[PdlcPhase.REQ_REVIEW]!.reviewerStatuses.eng = "approved";

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents.length).toBe(1);
        expect(result.agents[0].agentId).toBe("qa");
      }
    });

    it("auto-transitions for approved phases", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_APPROVED);

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents[0].taskType).toBe("Create");
        expect(result.agents[0].documentType).toBe("FSPEC");
      }

      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_CREATION);
    });

    it("returns done for DONE phase", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.DONE);

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("done");
    });

    it("dispatches fork/join agents for fullstack creation", async () => {
      const { dispatcher } = await setupWithFeature(fullstackConfig(), PdlcPhase.TSPEC_CREATION);
      const state = await dispatcher.getFeatureState(SLUG);
      state!.forkJoin = { subtasks: { eng: "pending", fe: "pending" } };

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        const agentIds = result.agents.map(a => a.agentId);
        expect(agentIds).toContain("eng");
        expect(agentIds).toContain("fe");
      }
    });

    it("dispatches only pending fork/join agents", async () => {
      const { dispatcher } = await setupWithFeature(fullstackConfig(), PdlcPhase.TSPEC_CREATION);
      const state = await dispatcher.getFeatureState(SLUG);
      state!.forkJoin = { subtasks: { eng: "complete", fe: "pending" } };

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents.length).toBe(1);
        expect(result.agents[0].agentId).toBe("fe");
      }
    });

    it("handles skipFspec auto-transition from REQ_APPROVED", async () => {
      const { dispatcher } = await setupWithFeature(skipFspecConfig(), PdlcPhase.REQ_APPROVED);

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents[0].documentType).toBe("TSPEC");
      }

      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_CREATION);
    });

    it("throws for unknown feature", async () => {
      const { dispatcher } = await setupWithFeature();

      await expect(dispatcher.getNextAction("unknown-slug")).rejects.toThrow("No state record");
    });

    it("dispatches Revise task type when in revision", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);
      const state = await dispatcher.getFeatureState(SLUG);
      // Simulate being in a revision (review phase has revisionCount > 0)
      state!.reviewPhases[PdlcPhase.REQ_REVIEW] = {
        reviewerStatuses: { eng: "pending", qa: "pending" },
        revisionCount: 1,
      };

      const result = await dispatcher.getNextAction(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents[0].taskType).toBe("Revise");
      }
    });
  });

  // --- Task 37: processResumeFromBound() ---

  describe("processResumeFromBound()", () => {
    it("resets revisionCount to 0", async () => {
      const { dispatcher } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);
      const state = await dispatcher.getFeatureState(SLUG);
      state!.reviewPhases[PdlcPhase.REQ_REVIEW]!.revisionCount = 4;

      await dispatcher.processResumeFromBound(SLUG);

      const updated = await dispatcher.getFeatureState(SLUG);
      expect(updated!.reviewPhases[PdlcPhase.REQ_REVIEW]!.revisionCount).toBe(0);
    });

    it("resets all reviewer statuses to pending", async () => {
      const { dispatcher } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);
      const state = await dispatcher.getFeatureState(SLUG);
      state!.reviewPhases[PdlcPhase.REQ_REVIEW]!.reviewerStatuses.eng = "revision_requested";
      state!.reviewPhases[PdlcPhase.REQ_REVIEW]!.reviewerStatuses.qa = "approved";

      await dispatcher.processResumeFromBound(SLUG);

      const updated = await dispatcher.getFeatureState(SLUG);
      const statuses = updated!.reviewPhases[PdlcPhase.REQ_REVIEW]!.reviewerStatuses;
      expect(Object.values(statuses).every(s => s === "pending")).toBe(true);
    });

    it("persists state", async () => {
      const { dispatcher, store } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);
      const state = await dispatcher.getFeatureState(SLUG);
      state!.reviewPhases[PdlcPhase.REQ_REVIEW]!.revisionCount = 4;

      const initialSaveCount = store.saveCount;
      await dispatcher.processResumeFromBound(SLUG);

      expect(store.saveCount).toBeGreaterThan(initialSaveCount);
    });

    it("returns dispatch action with reviewer entries", async () => {
      const { dispatcher } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      const result = await dispatcher.processResumeFromBound(SLUG);

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents.length).toBeGreaterThan(0);
        expect(result.agents.every(a => a.taskType === "Review")).toBe(true);
      }
    });

    it("returns pause for non-review phase", async () => {
      const { dispatcher } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);

      const result = await dispatcher.processResumeFromBound(SLUG);

      expect(result.action).toBe("pause");
      if (result.action === "pause") {
        expect(result.reason).toBe("invalid_phase");
      }
    });
  });

  // --- Task 38: Side effect processing ---

  describe("side effect processing", () => {
    it("dispatch_agent builds AgentDispatch with context documents", async () => {
      const { dispatcher, fs } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-REQ-auth-login.md`, "# REQ");

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      // After REQ_CREATION -> REQ_REVIEW, dispatch_reviewers side effect
      // Should have context documents in each agent dispatch
      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        for (const agent of result.agents) {
          expect(agent.contextDocuments).toBeDefined();
          expect(agent.contextDocuments.documents.length).toBeGreaterThan(0);
        }
      }
    });

    it("auto_transition recursively processes", async () => {
      // Set up a feature in REQ_REVIEW with all reviewers approved
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);

      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "## Recommendation\n\nApproved",
      );
      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-test-engineer-REQ.md`,
        "## Recommendation\n\nApproved",
      );

      await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "qa",
        worktreePath: WORKTREE,
      });

      // Should have auto-transitioned through REQ_APPROVED to FSPEC_CREATION
      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents[0].taskType).toBe("Create");
        expect(result.agents[0].documentType).toBe("FSPEC");
      }

      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_CREATION);
    });

    it("pause_feature returns pause action", async () => {
      // Create a scenario where revision bound is exceeded
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW);
      const state = await dispatcher.getFeatureState(SLUG);
      state!.reviewPhases[PdlcPhase.REQ_REVIEW]!.revisionCount = 3;

      // Both reviewers reject
      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "## Recommendation\n\nNeeds revision",
      );
      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-test-engineer-REQ.md`,
        "## Recommendation\n\nNeeds revision",
      );

      await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "qa",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("pause");
      if (result.action === "pause") {
        expect(result.reason).toBe("Revision bound exceeded");
        expect(result.message).toContain("exceeded the maximum of 3 revision cycles");
      }
    });

    it("log_warning logs via logger", async () => {
      // Force a log_warning by sending lgtm in a review phase (ignored with warning)
      // We can test this indirectly through the state machine...
      // Actually, lgtm in review phase would be caught by processAgentCompletion which treats it differently
      // Let's test it through TASK_COMPLETE which logs a warning
      const { dispatcher, fs, logger } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-REQ-auth-login.md`, "# REQ");

      await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "TASK_COMPLETE",
        worktreePath: WORKTREE,
      });

      expect(logger.messages.some(m => m.level === "warn")).toBe(true);
    });

    it("dispatch_reviewers includes context documents for each reviewer", async () => {
      const { dispatcher, fs } = await setupWithFeature(backendConfig(), PdlcPhase.REQ_CREATION);
      fs.addExisting(`${WORKTREE}/${DOCS_ROOT}/${SLUG}/011-REQ-auth-login.md`, "# REQ");

      const result = await dispatcher.processAgentCompletion({
        featureSlug: SLUG,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        for (const agent of result.agents) {
          expect(agent.contextDocuments.documents.length).toBeGreaterThan(0);
          // REQ_REVIEW should include the REQ document
          const hasReqDoc = agent.contextDocuments.documents.some(d => d.type === "req");
          expect(hasReqDoc).toBe(true);
        }
      }
    });

    it("skipFspec auto-transition skips FSPEC phases", async () => {
      // REQ_REVIEW all approved -> REQ_APPROVED -> auto -> TSPEC_CREATION (skip FSPEC)
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.REQ_REVIEW, skipFspecConfig());

      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-backend-engineer-REQ.md`,
        "## Recommendation\n\nApproved",
      );
      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-test-engineer-REQ.md`,
        "## Recommendation\n\nApproved",
      );

      await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "eng",
        worktreePath: WORKTREE,
      });

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "qa",
        worktreePath: WORKTREE,
      });

      expect(result.action).toBe("dispatch");
      if (result.action === "dispatch") {
        expect(result.agents[0].documentType).toBe("TSPEC");
      }

      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_CREATION);
    });

    it("IMPLEMENTATION_REVIEW all approved transitions to DONE", async () => {
      const { dispatcher, fs } = await setupInReviewPhase(PdlcPhase.IMPLEMENTATION_REVIEW);

      fs.addExisting(
        `${WORKTREE}/docs/${SLUG}/CROSS-REVIEW-test-engineer-IMPLEMENTATION.md`,
        "## Recommendation\n\nApproved",
      );

      const result = await dispatcher.processReviewCompletion({
        featureSlug: SLUG,
        reviewerAgentId: "qa",
        worktreePath: WORKTREE,
      });

      // IMPLEMENTATION_REVIEW -> DONE (no auto_transition, just done)
      const state = await dispatcher.getFeatureState(SLUG);
      expect(state!.phase).toBe(PdlcPhase.DONE);
      expect(state!.completedAt).not.toBeNull();
    });
  });

  // --- Task D-1: Idempotency guard ---

  describe("initializeFeature — idempotency guard", () => {
    it("UT-IDP-01: first call for new slug creates state and saves once", async () => {
      const store = new FakeStateStore();
      const fs = new FakeFileSystem();
      const logger = new FakeLogger();
      const dispatcher = new DefaultPdlcDispatcher(store, fs, logger, "docs");
      await dispatcher.loadState();

      const state = await dispatcher.initializeFeature("013-test-feature", {
        discipline: "backend-only",
        skipFspec: false,
      });

      expect(state.slug).toBe("013-test-feature");
      expect(state.phase).toBe(PdlcPhase.REQ_CREATION);
      expect(state.config.discipline).toBe("backend-only");
      expect(store.saveCount).toBe(1);
    });

    it("UT-IDP-02: second call for same slug returns existing record without overwrite, saveCount stays 1", async () => {
      const store = new FakeStateStore();
      const fs = new FakeFileSystem();
      const logger = new FakeLogger();
      const dispatcher = new DefaultPdlcDispatcher(store, fs, logger, "docs");
      await dispatcher.loadState();

      const first = await dispatcher.initializeFeature("013-test-feature", {
        discipline: "backend-only",
        skipFspec: false,
      });

      const second = await dispatcher.initializeFeature("013-test-feature", {
        discipline: "fullstack",
        skipFspec: true,
      });

      // Should return existing state, not overwritten
      expect(second.phase).toBe(PdlcPhase.REQ_CREATION);
      expect(second.config.discipline).toBe("backend-only");
      expect(second).toEqual(first);
      expect(store.saveCount).toBe(1);
      expect(
        logger.messages.some(
          (m) =>
            m.level === "debug" &&
            m.message.includes("already initialized (concurrent request)"),
        ),
      ).toBe(true);
    });
  });

  // --- Phase B: Dispatcher Routing — useTechLead ---

  describe("phaseToAgentId — useTechLead routing", () => {
    it("returns 'tl' for IMPLEMENTATION when useTechLead is true (backend-only)", () => {
      const config = makeTechLeadConfig({ discipline: "backend-only" });
      expect(phaseToAgentId(PdlcPhase.IMPLEMENTATION, config)).toBe("tl");
    });

    it("returns 'tl' for IMPLEMENTATION when useTechLead is true (fullstack)", () => {
      const config = makeTechLeadConfig({ discipline: "fullstack" });
      expect(phaseToAgentId(PdlcPhase.IMPLEMENTATION, config)).toBe("tl");
    });

    it("returns 'tl' for IMPLEMENTATION when useTechLead is true (frontend-only)", () => {
      const config = makeTechLeadConfig({ discipline: "frontend-only" });
      expect(phaseToAgentId(PdlcPhase.IMPLEMENTATION, config)).toBe("tl");
    });

    it("preserves existing routing when useTechLead is absent", () => {
      const config: FeatureConfig = { discipline: "backend-only", skipFspec: false };
      expect(phaseToAgentId(PdlcPhase.IMPLEMENTATION, config)).toBe("eng");
    });

    it("preserves existing routing when useTechLead is false", () => {
      const config: FeatureConfig = { discipline: "frontend-only", skipFspec: false, useTechLead: false };
      expect(phaseToAgentId(PdlcPhase.IMPLEMENTATION, config)).toBe("fe");
    });

    it("does not affect TSPEC_CREATION routing even when useTechLead is true", () => {
      const config = makeTechLeadConfig({ discipline: "backend-only" });
      expect(phaseToAgentId(PdlcPhase.TSPEC_CREATION, config)).toBe("eng");
    });
  });

  describe("isForkJoinPhase — useTechLead suppresses fork-join for IMPLEMENTATION", () => {
    it("returns false for IMPLEMENTATION when useTechLead is true and fullstack", () => {
      const config = makeTechLeadConfig({ discipline: "fullstack" });
      expect(isForkJoinPhase(PdlcPhase.IMPLEMENTATION, config)).toBe(false);
    });

    it("returns true for IMPLEMENTATION when useTechLead is absent and fullstack", () => {
      const config: FeatureConfig = { discipline: "fullstack", skipFspec: false };
      expect(isForkJoinPhase(PdlcPhase.IMPLEMENTATION, config)).toBe(true);
    });

    it("returns true for TSPEC_CREATION when useTechLead is true and fullstack (no suppression for non-IMPLEMENTATION)", () => {
      const config = makeTechLeadConfig({ discipline: "fullstack" });
      expect(isForkJoinPhase(PdlcPhase.TSPEC_CREATION, config)).toBe(true);
    });
  });
});
