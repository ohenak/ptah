import { describe, it, expect, beforeEach } from "vitest";
import { DefaultPdlcDispatcher } from "../../../src/orchestrator/pdlc/pdlc-dispatcher.js";
import { PdlcPhase } from "../../../src/orchestrator/pdlc/phases.js";
import type { FeatureConfig, FeatureState, DispatchAction } from "../../../src/orchestrator/pdlc/phases.js";
import { FakeStateStore, FakeFileSystem, FakeLogger } from "../../fixtures/factories.js";

describe("PDLC lifecycle integration", () => {
  let stateStore: FakeStateStore;
  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let dispatcher: DefaultPdlcDispatcher;

  const slug = "011-auth-feature";
  const docsRoot = "docs";

  function makeConfig(overrides: Partial<FeatureConfig> = {}): FeatureConfig {
    return {
      discipline: "backend-only",
      skipFspec: false,
      ...overrides,
    };
  }

  /**
   * Helper: seed a cross-review file in the fake filesystem with a given recommendation.
   */
  function seedCrossReview(
    worktreePath: string,
    skillName: string,
    docType: string,
    recommendation: string,
  ): void {
    const path = fs.joinPath(worktreePath, docsRoot, slug, `CROSS-REVIEW-${skillName}-${docType}.md`);
    fs.addExisting(path, `# Cross-Review\n\n## Recommendation\n\n${recommendation}\n`);
  }

  beforeEach(async () => {
    stateStore = new FakeStateStore();
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    dispatcher = new DefaultPdlcDispatcher(stateStore, fs, logger, docsRoot);
    await dispatcher.loadState();
  });

  // Task 47: Full PDLC lifecycle — backend-only feature from REQ_CREATION through DONE
  describe("full PDLC lifecycle (Task 47)", () => {
    it("progresses a backend-only feature from REQ_CREATION through DONE", async () => {
      const config = makeConfig();
      await dispatcher.initializeFeature(slug, config);

      let state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.REQ_CREATION);

      // REQ_CREATION -> REQ_REVIEW (LGTM from pm)
      fs.addExisting("/wt/1/docs/011-auth-feature/011-REQ-auth-feature.md", "content");
      let action = await dispatcher.processAgentCompletion({
        featureSlug: slug,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: "/wt/1",
      });
      expect(action.action).toBe("dispatch");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.REQ_REVIEW);

      // REQ_REVIEW: eng approves, qa approves -> REQ_APPROVED -> auto -> FSPEC_CREATION
      seedCrossReview("/wt/2", "backend-engineer", "REQ", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "eng",
        worktreePath: "/wt/2",
      });
      // Still waiting for qa
      expect(action.action).toBe("wait");

      seedCrossReview("/wt/3", "test-engineer", "REQ", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "qa",
        worktreePath: "/wt/3",
      });
      // All approved -> auto-transition to FSPEC_CREATION
      expect(action.action).toBe("dispatch");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_CREATION);

      // FSPEC_CREATION -> FSPEC_REVIEW
      fs.addExisting("/wt/4/docs/011-auth-feature/011-FSPEC-auth-feature.md", "content");
      action = await dispatcher.processAgentCompletion({
        featureSlug: slug,
        agentId: "pm",
        signal: "LGTM",
        worktreePath: "/wt/4",
      });
      expect(action.action).toBe("dispatch");
      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_REVIEW);

      // FSPEC_REVIEW: eng approves, qa approves -> FSPEC_APPROVED -> auto -> TSPEC_CREATION
      seedCrossReview("/wt/5", "backend-engineer", "FSPEC", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "eng",
        worktreePath: "/wt/5",
      });
      expect(action.action).toBe("wait");

      seedCrossReview("/wt/6", "test-engineer", "FSPEC", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "qa",
        worktreePath: "/wt/6",
      });
      expect(action.action).toBe("dispatch");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_CREATION);

      // TSPEC_CREATION -> TSPEC_REVIEW
      fs.addExisting("/wt/7/docs/011-auth-feature/011-TSPEC-auth-feature.md", "content");
      action = await dispatcher.processAgentCompletion({
        featureSlug: slug,
        agentId: "eng",
        signal: "LGTM",
        worktreePath: "/wt/7",
      });
      expect(action.action).toBe("dispatch");
      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_REVIEW);

      // TSPEC_REVIEW: pm approves, qa approves -> TSPEC_APPROVED -> auto -> PLAN_CREATION
      seedCrossReview("/wt/8", "product-manager", "TSPEC", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "pm",
        worktreePath: "/wt/8",
      });
      expect(action.action).toBe("wait");

      seedCrossReview("/wt/9", "test-engineer", "TSPEC", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "qa",
        worktreePath: "/wt/9",
      });
      expect(action.action).toBe("dispatch");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.PLAN_CREATION);

      // PLAN_CREATION -> PLAN_REVIEW
      fs.addExisting("/wt/10/docs/011-auth-feature/011-PLAN-auth-feature.md", "content");
      action = await dispatcher.processAgentCompletion({
        featureSlug: slug,
        agentId: "eng",
        signal: "LGTM",
        worktreePath: "/wt/10",
      });
      expect(action.action).toBe("dispatch");
      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.PLAN_REVIEW);

      // PLAN_REVIEW: pm approves, qa approves -> PLAN_APPROVED -> auto -> PROPERTIES_CREATION
      seedCrossReview("/wt/11", "product-manager", "PLAN", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "pm",
        worktreePath: "/wt/11",
      });
      expect(action.action).toBe("wait");

      seedCrossReview("/wt/12", "test-engineer", "PLAN", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "qa",
        worktreePath: "/wt/12",
      });
      expect(action.action).toBe("dispatch");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.PROPERTIES_CREATION);

      // PROPERTIES_CREATION -> PROPERTIES_REVIEW
      fs.addExisting("/wt/13/docs/011-auth-feature/011-PROPERTIES-auth-feature.md", "content");
      action = await dispatcher.processAgentCompletion({
        featureSlug: slug,
        agentId: "qa",
        signal: "LGTM",
        worktreePath: "/wt/13",
      });
      expect(action.action).toBe("dispatch");
      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.PROPERTIES_REVIEW);

      // PROPERTIES_REVIEW: pm approves, eng approves -> PROPERTIES_APPROVED -> auto -> IMPLEMENTATION
      seedCrossReview("/wt/14", "product-manager", "PROPERTIES", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "pm",
        worktreePath: "/wt/14",
      });
      expect(action.action).toBe("wait");

      seedCrossReview("/wt/15", "backend-engineer", "PROPERTIES", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "eng",
        worktreePath: "/wt/15",
      });
      expect(action.action).toBe("dispatch");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.IMPLEMENTATION);

      // IMPLEMENTATION -> IMPLEMENTATION_REVIEW
      action = await dispatcher.processAgentCompletion({
        featureSlug: slug,
        agentId: "eng",
        signal: "LGTM",
        worktreePath: "/wt/16",
      });
      expect(action.action).toBe("dispatch");
      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.IMPLEMENTATION_REVIEW);

      // IMPLEMENTATION_REVIEW: qa approves -> DONE
      seedCrossReview("/wt/17", "test-engineer", "IMPLEMENTATION", "Approved");
      action = await dispatcher.processReviewCompletion({
        featureSlug: slug,
        reviewerAgentId: "qa",
        worktreePath: "/wt/17",
      });
      expect(action.action).toBe("done");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.DONE);
      expect(state!.completedAt).not.toBeNull();

      // Verify state was persisted
      expect(stateStore.saveCount).toBeGreaterThan(0);
    });
  });

  // Task 48: FSPEC skip path
  describe("FSPEC skip path (Task 48)", () => {
    it("skips FSPEC phases when skipFspec=true", async () => {
      const config = makeConfig({ skipFspec: true });
      await dispatcher.initializeFeature(slug, config);

      // REQ_CREATION -> REQ_REVIEW (LGTM)
      fs.addExisting("/wt/1/docs/011-auth-feature/011-REQ-auth-feature.md", "content");
      await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "pm", signal: "LGTM", worktreePath: "/wt/1",
      });

      let state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.REQ_REVIEW);

      // REQ_REVIEW: both approve -> REQ_APPROVED -> auto -> TSPEC_CREATION (skips FSPEC!)
      seedCrossReview("/wt/2", "backend-engineer", "REQ", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "eng", worktreePath: "/wt/2",
      });
      seedCrossReview("/wt/3", "test-engineer", "REQ", "Approved");
      const action = await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "qa", worktreePath: "/wt/3",
      });

      state = await dispatcher.getFeatureState(slug);
      // Should skip directly to TSPEC_CREATION, not FSPEC_CREATION
      expect(state!.phase).toBe(PdlcPhase.TSPEC_CREATION);
      expect(action.action).toBe("dispatch");
    });
  });

  // Task 49: Fullstack fork/join
  describe("fullstack fork/join (Task 49)", () => {
    it("handles parallel TSPEC creation with subtask_complete events", async () => {
      const config = makeConfig({ discipline: "fullstack" });
      await dispatcher.initializeFeature(slug, config);

      // REQ_CREATION -> REQ_REVIEW (pm LGTM)
      fs.addExisting("/wt/1/docs/011-auth-feature/011-REQ-auth-feature.md", "content");
      await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "pm", signal: "LGTM", worktreePath: "/wt/1",
      });

      // Approve REQ — fullstack has 3 reviewers: eng, fe, qa
      seedCrossReview("/wt/2", "backend-engineer", "REQ", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "eng", worktreePath: "/wt/2",
      });
      seedCrossReview("/wt/3", "frontend-engineer", "REQ", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "fe", worktreePath: "/wt/3",
      });
      seedCrossReview("/wt/4", "test-engineer", "REQ", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "qa", worktreePath: "/wt/4",
      });

      // Skip FSPEC -- approve it quickly
      let state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_CREATION);
      fs.addExisting("/wt/5/docs/011-auth-feature/011-FSPEC-auth-feature.md", "content");
      await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "pm", signal: "LGTM", worktreePath: "/wt/5",
      });

      // Approve FSPEC
      seedCrossReview("/wt/6", "backend-engineer", "FSPEC", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "eng", worktreePath: "/wt/6",
      });
      seedCrossReview("/wt/7", "frontend-engineer", "FSPEC", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "fe", worktreePath: "/wt/7",
      });
      seedCrossReview("/wt/8", "test-engineer", "FSPEC", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "qa", worktreePath: "/wt/8",
      });

      // Now in TSPEC_CREATION — fullstack, so fork/join
      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_CREATION);
      expect(state!.forkJoin).not.toBeNull();
      expect(state!.forkJoin!.subtasks.eng).toBe("pending");
      expect(state!.forkJoin!.subtasks.fe).toBe("pending");

      // eng completes — partial completion
      fs.addExisting("/wt/9/docs/011-auth-feature/011-TSPEC-auth-feature.md", "content");
      let action = await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "eng", signal: "LGTM", worktreePath: "/wt/9",
      });
      expect(action.action).toBe("wait");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_CREATION);
      expect(state!.forkJoin!.subtasks.eng).toBe("complete");
      expect(state!.forkJoin!.subtasks.fe).toBe("pending");

      // fe completes — full completion -> TSPEC_REVIEW
      fs.addExisting("/wt/10/docs/011-auth-feature/011-TSPEC-auth-feature.md", "content");
      action = await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "fe", signal: "LGTM", worktreePath: "/wt/10",
      });
      expect(action.action).toBe("dispatch");

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.TSPEC_REVIEW);
      expect(state!.forkJoin).toBeNull();
    });
  });

  // Task 50: Revision loop with mixed outcomes
  describe("revision loop (Task 50)", () => {
    it("handles rejection -> revision -> re-review -> approval", async () => {
      const config = makeConfig();
      await dispatcher.initializeFeature(slug, config);

      // Get to REQ_REVIEW
      fs.addExisting("/wt/1/docs/011-auth-feature/011-REQ-auth-feature.md", "content");
      await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "pm", signal: "LGTM", worktreePath: "/wt/1",
      });

      let state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.REQ_REVIEW);

      // eng approves, qa rejects -> revision
      seedCrossReview("/wt/2", "backend-engineer", "REQ", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "eng", worktreePath: "/wt/2",
      });

      seedCrossReview("/wt/3", "test-engineer", "REQ", "Needs revision");
      const action = await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "qa", worktreePath: "/wt/3",
      });

      // Should go back to REQ_CREATION with dispatch for revision
      expect(action.action).toBe("dispatch");
      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.REQ_CREATION);

      // Verify revision count incremented
      const reviewState = state!.reviewPhases[PdlcPhase.REQ_REVIEW];
      expect(reviewState).toBeDefined();
      expect(reviewState!.revisionCount).toBe(1);

      // PM revises and resubmits LGTM -> back to REQ_REVIEW
      fs.addExisting("/wt/4/docs/011-auth-feature/011-REQ-auth-feature.md", "content");
      await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "pm", signal: "LGTM", worktreePath: "/wt/4",
      });

      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.REQ_REVIEW);

      // This time both approve
      seedCrossReview("/wt/5", "backend-engineer", "REQ", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "eng", worktreePath: "/wt/5",
      });
      seedCrossReview("/wt/6", "test-engineer", "REQ", "Approved with minor changes");
      const approveAction = await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "qa", worktreePath: "/wt/6",
      });

      // Should advance through REQ_APPROVED to FSPEC_CREATION
      expect(approveAction.action).toBe("dispatch");
      state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_CREATION);
    });
  });

  // Task 51: Revision bound escalation + resume
  describe("revision bound escalation (Task 51)", () => {
    it("pauses feature after 4 revision cycles and resumes on processResumeFromBound", async () => {
      const config = makeConfig();
      await dispatcher.initializeFeature(slug, config);

      // Get to REQ_REVIEW
      fs.addExisting("/wt/1/docs/011-auth-feature/011-REQ-auth-feature.md", "content");
      await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "pm", signal: "LGTM", worktreePath: "/wt/1",
      });

      // Simulate 4 rejection cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // Both reject
        seedCrossReview(`/wt/r${cycle}a`, "backend-engineer", "REQ", "Needs revision");
        await dispatcher.processReviewCompletion({
          featureSlug: slug, reviewerAgentId: "eng", worktreePath: `/wt/r${cycle}a`,
        });
        seedCrossReview(`/wt/r${cycle}b`, "test-engineer", "REQ", "Needs revision");
        await dispatcher.processReviewCompletion({
          featureSlug: slug, reviewerAgentId: "qa", worktreePath: `/wt/r${cycle}b`,
        });

        // Should go back to REQ_CREATION (not paused yet)
        let s = await dispatcher.getFeatureState(slug);
        expect(s!.phase).toBe(PdlcPhase.REQ_CREATION);

        // PM revises
        fs.addExisting(`/wt/rev${cycle}/docs/011-auth-feature/011-REQ-auth-feature.md`, "content");
        await dispatcher.processAgentCompletion({
          featureSlug: slug, agentId: "pm", signal: "LGTM", worktreePath: `/wt/rev${cycle}`,
        });
      }

      // 4th rejection cycle -> should trigger pause
      seedCrossReview("/wt/r3a", "backend-engineer", "REQ", "Needs revision");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "eng", worktreePath: "/wt/r3a",
      });
      seedCrossReview("/wt/r3b", "test-engineer", "REQ", "Needs revision");
      const pauseAction = await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "qa", worktreePath: "/wt/r3b",
      });

      expect(pauseAction.action).toBe("pause");

      // State still in REQ_REVIEW (the pause prevents transition)
      let state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.REQ_REVIEW);

      // Resume from bound
      const resumeAction = await dispatcher.processResumeFromBound(slug);
      expect(resumeAction.action).toBe("dispatch");

      // After resume, revision count should be reset
      state = await dispatcher.getFeatureState(slug);
      const reviewState = state!.reviewPhases[PdlcPhase.REQ_REVIEW];
      expect(reviewState!.revisionCount).toBe(0);
    });
  });

  // Task 52: Backward compatibility — unmanaged feature
  describe("backward compatibility (Task 52)", () => {
    it("isManaged returns false for unknown features", async () => {
      const managed = await dispatcher.isManaged("unknown-feature");
      expect(managed).toBe(false);
    });

    it("getFeatureState returns null for unknown features", async () => {
      const state = await dispatcher.getFeatureState("unknown-feature");
      expect(state).toBeNull();
    });
  });

  // Task 53: State persistence and recovery
  describe("state persistence and recovery (Task 53)", () => {
    it("persists state and recovers via loadState + getNextAction", async () => {
      const config = makeConfig();
      await dispatcher.initializeFeature(slug, config);

      // Progress to FSPEC_CREATION
      fs.addExisting("/wt/1/docs/011-auth-feature/011-REQ-auth-feature.md", "content");
      await dispatcher.processAgentCompletion({
        featureSlug: slug, agentId: "pm", signal: "LGTM", worktreePath: "/wt/1",
      });
      seedCrossReview("/wt/2", "backend-engineer", "REQ", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "eng", worktreePath: "/wt/2",
      });
      seedCrossReview("/wt/3", "test-engineer", "REQ", "Approved");
      await dispatcher.processReviewCompletion({
        featureSlug: slug, reviewerAgentId: "qa", worktreePath: "/wt/3",
      });

      let state = await dispatcher.getFeatureState(slug);
      expect(state!.phase).toBe(PdlcPhase.FSPEC_CREATION);

      // Verify state was persisted to store
      const persistedState = stateStore.state;
      expect(persistedState.features[slug]).toBeDefined();
      expect(persistedState.features[slug].phase).toBe(PdlcPhase.FSPEC_CREATION);

      // Simulate restart: create a new dispatcher with the same state store
      const dispatcher2 = new DefaultPdlcDispatcher(stateStore, fs, logger, docsRoot);
      await dispatcher2.loadState();

      // Verify recovery
      const managed = await dispatcher2.isManaged(slug);
      expect(managed).toBe(true);

      const recoveredState = await dispatcher2.getFeatureState(slug);
      expect(recoveredState!.phase).toBe(PdlcPhase.FSPEC_CREATION);

      // getNextAction should dispatch pm for FSPEC creation
      const nextAction = await dispatcher2.getNextAction(slug);
      expect(nextAction.action).toBe("dispatch");
      if (nextAction.action === "dispatch") {
        expect(nextAction.agents[0].agentId).toBe("pm");
        expect(nextAction.agents[0].taskType).toBe("Create");
      }
    });
  });
});
