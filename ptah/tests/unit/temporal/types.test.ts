import { describe, it, expect } from "vitest";
import type {
  FeatureWorkflowState,
  PhaseStatus,
  ReviewState,
  ForkJoinState,
  ForkJoinAgentResult,
  PendingQuestionState,
  FailureInfo,
  UserAnswerSignal,
  RetryOrCancelSignal,
  ResumeOrCancelSignal,
  SkillActivityInput,
  SkillActivityResult,
  NotificationInput,
  NotificationType,
  V4PhaseMapping,
  ReviewPhaseState,
  StartWorkflowParams,
  CheckArtifactExistsInput,
  ReadCrossReviewInput,
} from "../../../src/temporal/types.js";
import type { WorkflowConfig } from "../../../src/config/workflow-config.js";

describe("Temporal shared types", () => {
  describe("FeatureWorkflowState", () => {
    it("can be constructed with all required fields", () => {
      const state: FeatureWorkflowState = {
        featureSlug: "my-feature",
        featureConfig: { discipline: "backend-only", skipFspec: false },
        currentPhaseId: "req-creation",
        completedPhaseIds: [],
        activeAgentIds: ["pm"],
        phaseStatus: "running",
        reviewStates: {},
        forkJoinState: null,
        pendingQuestion: null,
        failureInfo: null,
        startedAt: "2026-04-02T00:00:00Z",
        updatedAt: "2026-04-02T00:00:00Z",
      };

      expect(state.featureSlug).toBe("my-feature");
      expect(state.phaseStatus).toBe("running");
      expect(state.forkJoinState).toBeNull();
      expect(state.pendingQuestion).toBeNull();
      expect(state.failureInfo).toBeNull();
    });

    it("supports all PhaseStatus values", () => {
      const statuses: PhaseStatus[] = [
        "running",
        "waiting-for-user",
        "waiting-for-reviewers",
        "failed",
        "completed",
      ];
      expect(statuses).toHaveLength(5);
    });
  });

  describe("ReviewState", () => {
    it("tracks reviewer statuses and revision count", () => {
      const reviewState: ReviewState = {
        reviewerStatuses: {
          eng: "pending",
          qa: "approved",
          fe: "revision_requested",
        },
        revisionCount: 1,
        writtenVersions: {},
      };

      expect(reviewState.reviewerStatuses["eng"]).toBe("pending");
      expect(reviewState.reviewerStatuses["qa"]).toBe("approved");
      expect(reviewState.reviewerStatuses["fe"]).toBe("revision_requested");
      expect(reviewState.revisionCount).toBe(1);
    });

    it("tracks written versions per reviewer agent ID", () => {
      const reviewState: ReviewState = {
        reviewerStatuses: { "se-review": "approved", "te-review": "revision_requested" },
        revisionCount: 2,
        writtenVersions: { "se-review": 2, "te-review": 1 },
      };

      expect(reviewState.writtenVersions["se-review"]).toBe(2);
      expect(reviewState.writtenVersions["te-review"]).toBe(1);
    });

    it("initializes with empty writtenVersions", () => {
      const reviewState: ReviewState = {
        reviewerStatuses: {},
        revisionCount: 0,
        writtenVersions: {},
      };

      expect(Object.keys(reviewState.writtenVersions)).toHaveLength(0);
    });
  });

  describe("ForkJoinState", () => {
    it("tracks per-agent results and failure policy", () => {
      const fjState: ForkJoinState = {
        agentResults: {
          eng: { status: "success", worktreePath: "/tmp/eng", routingSignal: "LGTM" },
          fe: { status: "pending" },
        },
        failurePolicy: "wait_for_all",
      };

      expect(fjState.agentResults["eng"].status).toBe("success");
      expect(fjState.agentResults["fe"].status).toBe("pending");
      expect(fjState.failurePolicy).toBe("wait_for_all");
    });

    it("supports all ForkJoinAgentResult statuses", () => {
      const results: ForkJoinAgentResult[] = [
        { status: "pending" },
        { status: "success", worktreePath: "/tmp/w", routingSignal: "LGTM" },
        { status: "failed", error: "timeout" },
        { status: "cancelled" },
      ];
      expect(results).toHaveLength(4);
    });
  });

  describe("PendingQuestionState", () => {
    it("records question context", () => {
      const q: PendingQuestionState = {
        question: "Should we use Google or GitHub?",
        agentId: "pm",
        phaseId: "req-creation",
        askedAt: "2026-04-02T00:00:00Z",
      };

      expect(q.question).toBe("Should we use Google or GitHub?");
      expect(q.agentId).toBe("pm");
    });
  });

  describe("FailureInfo", () => {
    it("records failure details", () => {
      const failure: FailureInfo = {
        phaseId: "tspec-creation",
        agentId: "eng",
        errorType: "ActivityFailure",
        errorMessage: "subprocess exited with code 1",
        retryCount: 3,
      };

      expect(failure.phaseId).toBe("tspec-creation");
      expect(failure.retryCount).toBe(3);
    });
  });

  describe("Signal payloads", () => {
    it("UserAnswerSignal has required fields", () => {
      const signal: UserAnswerSignal = {
        answer: "Google",
        answeredBy: "user-123",
        answeredAt: "2026-04-02T00:00:00Z",
      };

      expect(signal.answer).toBe("Google");
      expect(signal.answeredBy).toBe("user-123");
    });

    it("RetryOrCancelSignal accepts valid values", () => {
      const retry: RetryOrCancelSignal = "retry";
      const cancel: RetryOrCancelSignal = "cancel";

      expect(retry).toBe("retry");
      expect(cancel).toBe("cancel");
    });

    it("ResumeOrCancelSignal accepts valid values", () => {
      const resume: ResumeOrCancelSignal = "resume";
      const cancel: ResumeOrCancelSignal = "cancel";

      expect(resume).toBe("resume");
      expect(cancel).toBe("cancel");
    });
  });

  describe("SkillActivityInput", () => {
    it("can be constructed with all fields", () => {
      const input: SkillActivityInput = {
        agentId: "eng",
        featureSlug: "auth",
        phaseId: "tspec-creation",
        taskType: "Create",
        documentType: "TSPEC",
        contextDocumentRefs: ["{feature}/REQ"],
        featureConfig: { discipline: "backend-only", skipFspec: false },
        forkJoin: false,
        isRevision: false,
      };

      expect(input.agentId).toBe("eng");
      expect(input.forkJoin).toBe(false);
    });

    it("supports optional question/answer fields", () => {
      const input: SkillActivityInput = {
        agentId: "pm",
        featureSlug: "auth",
        phaseId: "req-creation",
        taskType: "Create",
        documentType: "REQ",
        contextDocumentRefs: [],
        featureConfig: { discipline: "fullstack", skipFspec: false },
        forkJoin: false,
        isRevision: false,
        priorQuestion: "OAuth provider?",
        priorAnswer: "Google",
      };

      expect(input.priorQuestion).toBe("OAuth provider?");
      expect(input.priorAnswer).toBe("Google");
    });
  });

  describe("SkillActivityResult", () => {
    it("represents LGTM result", () => {
      const result: SkillActivityResult = {
        routingSignalType: "LGTM",
        artifactChanges: ["docs/auth/015-TSPEC-auth.md"],
        durationMs: 5000,
      };

      expect(result.routingSignalType).toBe("LGTM");
      expect(result.artifactChanges).toHaveLength(1);
    });

    it("represents ROUTE_TO_USER result with question", () => {
      const result: SkillActivityResult = {
        routingSignalType: "ROUTE_TO_USER",
        question: "Which auth provider?",
        artifactChanges: [],
        durationMs: 2000,
      };

      expect(result.question).toBe("Which auth provider?");
    });

    it("represents fork/join result with worktree path", () => {
      const result: SkillActivityResult = {
        routingSignalType: "LGTM",
        artifactChanges: ["src/api.ts"],
        worktreePath: "/tmp/worktree-eng",
        durationMs: 10000,
      };

      expect(result.worktreePath).toBe("/tmp/worktree-eng");
    });
  });

  describe("NotificationInput", () => {
    it("supports all notification types", () => {
      const types: NotificationType[] = ["question", "failure", "status", "revision-bound"];
      expect(types).toHaveLength(4);
    });

    it("can be constructed with all fields", () => {
      const notification: NotificationInput = {
        type: "failure",
        featureSlug: "auth",
        phaseId: "tspec-creation",
        agentId: "eng",
        message: "Activity failed after 3 retries",
        workflowId: "ptah-feature-auth-1",
      };

      expect(notification.type).toBe("failure");
      expect(notification.workflowId).toBe("ptah-feature-auth-1");
    });
  });

  describe("CheckArtifactExistsInput", () => {
    it("can be constructed with slug, docType, and featurePath", () => {
      const input: CheckArtifactExistsInput = {
        slug: "my-feature",
        docType: "REQ",
        featurePath: "docs/in-progress/my-feature/",
      };

      expect(input.slug).toBe("my-feature");
      expect(input.docType).toBe("REQ");
      expect(input.featurePath).toBe("docs/in-progress/my-feature/");
    });

    it("accepts different docType values", () => {
      const fspecInput: CheckArtifactExistsInput = {
        slug: "auth",
        docType: "FSPEC",
        featurePath: "docs/in-progress/auth/",
      };
      const tspecInput: CheckArtifactExistsInput = {
        slug: "auth",
        docType: "TSPEC",
        featurePath: "docs/in-progress/auth/",
      };

      expect(fspecInput.docType).toBe("FSPEC");
      expect(tspecInput.docType).toBe("TSPEC");
    });
  });

  describe("SkillActivityInput — revisionCount", () => {
    it("accepts revisionCount as an optional field", () => {
      const input: SkillActivityInput = {
        agentId: "se-author",
        featureSlug: "auth",
        phaseId: "tspec-creation",
        taskType: "Create",
        documentType: "TSPEC",
        contextDocumentRefs: ["{feature}/REQ"],
        featureConfig: { discipline: "backend-only", skipFspec: false },
        forkJoin: false,
        isRevision: true,
        revisionCount: 2,
      };

      expect(input.revisionCount).toBe(2);
    });

    it("can be constructed without revisionCount (backward compatibility)", () => {
      const input: SkillActivityInput = {
        agentId: "eng",
        featureSlug: "auth",
        phaseId: "tspec-creation",
        taskType: "Create",
        documentType: "TSPEC",
        contextDocumentRefs: [],
        featureConfig: { discipline: "backend-only", skipFspec: false },
        forkJoin: false,
        isRevision: false,
      };

      expect(input.revisionCount).toBeUndefined();
    });
  });

  describe("ReadCrossReviewInput — revisionCount", () => {
    it("accepts revisionCount as an optional field", () => {
      const input: ReadCrossReviewInput = {
        featurePath: "docs/in-progress/my-feature/",
        agentId: "se-review",
        documentType: "TSPEC",
        revisionCount: 3,
      };

      expect(input.revisionCount).toBe(3);
    });

    it("can be constructed without revisionCount (backward compatibility)", () => {
      const input: ReadCrossReviewInput = {
        featurePath: "docs/in-progress/my-feature/",
        agentId: "te-review",
        documentType: "REQ",
      };

      expect(input.revisionCount).toBeUndefined();
    });
  });

  describe("FeatureWorkflowState — artifactExists, activeAgentIds, completedPhaseResults", () => {
    it("can be constructed with artifactExists field", () => {
      const state: FeatureWorkflowState = {
        featureSlug: "my-feature",
        featureConfig: { discipline: "backend-only", skipFspec: false },
        workflowConfig: { version: 1, phases: [] },
        currentPhaseId: "req-creation",
        completedPhaseIds: [],
        activeAgentIds: [],
        phaseStatus: "running",
        reviewStates: {},
        forkJoinState: null,
        pendingQuestion: null,
        failureInfo: null,
        startedAt: "2026-04-22T00:00:00Z",
        updatedAt: "2026-04-22T00:00:00Z",
        featurePath: null,
        worktreeRoot: null,
        signOffs: {},
        adHocQueue: [],
        adHocInProgress: false,
        artifactExists: { REQ: true, FSPEC: false },
        completedPhaseResults: {},
      };

      expect(state.artifactExists["REQ"]).toBe(true);
      expect(state.artifactExists["FSPEC"]).toBe(false);
    });

    it("initializes artifactExists as empty record", () => {
      const state: FeatureWorkflowState = {
        featureSlug: "my-feature",
        featureConfig: { discipline: "backend-only", skipFspec: false },
        workflowConfig: { version: 1, phases: [] },
        currentPhaseId: "req-creation",
        completedPhaseIds: [],
        activeAgentIds: [],
        phaseStatus: "running",
        reviewStates: {},
        forkJoinState: null,
        pendingQuestion: null,
        failureInfo: null,
        startedAt: "2026-04-22T00:00:00Z",
        updatedAt: "2026-04-22T00:00:00Z",
        featurePath: null,
        worktreeRoot: null,
        signOffs: {},
        adHocQueue: [],
        adHocInProgress: false,
        artifactExists: {},
        completedPhaseResults: {},
      };

      expect(Object.keys(state.artifactExists)).toHaveLength(0);
    });

    it("tracks completedPhaseResults with passed outcome", () => {
      const state: FeatureWorkflowState = {
        featureSlug: "my-feature",
        featureConfig: { discipline: "backend-only", skipFspec: false },
        workflowConfig: { version: 1, phases: [] },
        currentPhaseId: "fspec-creation",
        completedPhaseIds: ["req-creation", "req-review"],
        activeAgentIds: [],
        phaseStatus: "running",
        reviewStates: {},
        forkJoinState: null,
        pendingQuestion: null,
        failureInfo: null,
        startedAt: "2026-04-22T00:00:00Z",
        updatedAt: "2026-04-22T00:00:00Z",
        featurePath: null,
        worktreeRoot: null,
        signOffs: {},
        adHocQueue: [],
        adHocInProgress: false,
        artifactExists: {},
        completedPhaseResults: { "req-review": "passed" },
      };

      expect(state.completedPhaseResults["req-review"]).toBe("passed");
    });

    it("tracks completedPhaseResults with revision-bound-reached outcome", () => {
      const state: FeatureWorkflowState = {
        featureSlug: "my-feature",
        featureConfig: { discipline: "backend-only", skipFspec: false },
        workflowConfig: { version: 1, phases: [] },
        currentPhaseId: "tspec-creation",
        completedPhaseIds: ["req-creation", "req-review", "fspec-creation", "fspec-review"],
        activeAgentIds: [],
        phaseStatus: "running",
        reviewStates: {},
        forkJoinState: null,
        pendingQuestion: null,
        failureInfo: null,
        startedAt: "2026-04-22T00:00:00Z",
        updatedAt: "2026-04-22T00:00:00Z",
        featurePath: null,
        worktreeRoot: null,
        signOffs: {},
        adHocQueue: [],
        adHocInProgress: false,
        artifactExists: {},
        completedPhaseResults: {
          "req-review": "passed",
          "fspec-review": "revision-bound-reached",
        },
      };

      expect(state.completedPhaseResults["fspec-review"]).toBe("revision-bound-reached");
    });

    it("accumulates multiple phase results without removing prior entries", () => {
      const results: Record<string, "passed" | "revision-bound-reached"> = {};
      results["req-review"] = "passed";
      results["fspec-review"] = "passed";
      results["tspec-review"] = "revision-bound-reached";

      expect(Object.keys(results)).toHaveLength(3);
      expect(results["req-review"]).toBe("passed");
      expect(results["tspec-review"]).toBe("revision-bound-reached");
    });
  });

  describe("V4PhaseMapping", () => {
    it("maps v4 phase strings to v5 phase IDs", () => {
      const mapping: V4PhaseMapping = {
        REQ_CREATION: "req-creation",
        REQ_REVIEW: "req-review",
      };

      expect(mapping["REQ_CREATION"]).toBe("req-creation");
    });
  });

  describe("StartWorkflowParams", () => {
    it("has required fields for starting a workflow", () => {
      const params: StartWorkflowParams = {
        featureSlug: "auth",
        featureConfig: { discipline: "backend-only", skipFspec: false },
        workflowConfig: { version: 1, phases: [] },
      };

      expect(params.featureSlug).toBe("auth");
    });

    it("supports optional migration fields", () => {
      const params: StartWorkflowParams = {
        featureSlug: "auth",
        featureConfig: { discipline: "backend-only", skipFspec: false },
        workflowConfig: { version: 1, phases: [] },
        startAtPhase: "tspec-creation",
        initialReviewState: {
          "req-review": {
            reviewerStatuses: { eng: "approved" },
            revisionCount: 0,
          },
        },
      };

      expect(params.startAtPhase).toBe("tspec-creation");
      expect(params.initialReviewState!["req-review"].revisionCount).toBe(0);
    });
  });
});
