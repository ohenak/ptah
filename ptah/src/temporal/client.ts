/**
 * Temporal Client Wrapper — manages connection lifecycle, workflow creation,
 * signal delivery, state queries, and workflow listing.
 *
 * Wraps @temporalio/client WorkflowClient. Workflow IDs follow the
 * deterministic `ptah-{featureSlug}` convention (REQ-MR-08).
 */

import { Connection, WorkflowClient } from "@temporalio/client";
import type { TemporalConfig } from "../types.js";
import type {
  AdHocRevisionSignal,
  FeatureWorkflowState,
  StartWorkflowParams,
  UserAnswerSignal,
} from "./types.js";

/**
 * TemporalClientWrapper interface — the contract for Temporal client operations.
 * FakeTemporalClient in factories.ts implements this for testing.
 */
export interface TemporalClientWrapper {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  startFeatureWorkflow(params: StartWorkflowParams): Promise<string>;
  signalUserAnswer(workflowId: string, answer: UserAnswerSignal): Promise<void>;
  signalRetryOrCancel(workflowId: string, action: "retry" | "cancel"): Promise<void>;
  signalResumeOrCancel(workflowId: string, action: "resume" | "cancel"): Promise<void>;
  signalAdHocRevision(workflowId: string, signal: AdHocRevisionSignal): Promise<void>;
  queryWorkflowState(workflowId: string): Promise<FeatureWorkflowState>;
  listWorkflowsByPrefix(prefix: string): Promise<string[]>;
  isConnected(): boolean;
}

/**
 * Concrete implementation of TemporalClientWrapper backed by @temporalio/client.
 */
export class TemporalClientWrapperImpl implements TemporalClientWrapper {
  private connection: Awaited<ReturnType<typeof Connection.connect>> | null = null;
  private workflowClient: InstanceType<typeof WorkflowClient> | null = null;
  private readonly config: TemporalConfig;

  constructor(config: TemporalConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.connection = await Connection.connect({
      address: this.config.address,
      tls: this.config.tls ? {
        clientCertPair: this.config.tls.clientCertPath && this.config.tls.clientKeyPath
          ? {
              crt: Buffer.from(""), // Placeholder — real TLS reads from files at runtime
              key: Buffer.from(""),
            }
          : undefined,
      } : undefined,
    });

    this.workflowClient = new WorkflowClient({
      connection: this.connection,
      namespace: this.config.namespace,
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.workflowClient = null;
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.workflowClient !== null;
  }

  async startFeatureWorkflow(params: StartWorkflowParams): Promise<string> {
    this.ensureConnected();

    const workflowId = `ptah-${params.featureSlug}`;

    await this.workflowClient!.start("featureLifecycleWorkflow", {
      workflowId,
      taskQueue: this.config.taskQueue,
      args: [{
        featureSlug: params.featureSlug,
        featureConfig: params.featureConfig,
        workflowConfig: params.workflowConfig,
        startAtPhase: params.startAtPhase,
        initialReviewState: params.initialReviewState,
      }],
    });

    return workflowId;
  }

  async signalUserAnswer(workflowId: string, answer: UserAnswerSignal): Promise<void> {
    this.ensureConnected();
    const handle = this.workflowClient!.getHandle(workflowId);
    await handle.signal("user-answer", answer);
  }

  async signalRetryOrCancel(workflowId: string, action: "retry" | "cancel"): Promise<void> {
    this.ensureConnected();
    const handle = this.workflowClient!.getHandle(workflowId);
    await handle.signal("retry-or-cancel", action);
  }

  async signalResumeOrCancel(workflowId: string, action: "resume" | "cancel"): Promise<void> {
    this.ensureConnected();
    const handle = this.workflowClient!.getHandle(workflowId);
    await handle.signal("resume-or-cancel", action);
  }

  async signalAdHocRevision(workflowId: string, signal: AdHocRevisionSignal): Promise<void> {
    this.ensureConnected();
    const handle = this.workflowClient!.getHandle(workflowId);
    await handle.signal("ad-hoc-revision", signal);
  }

  async queryWorkflowState(workflowId: string): Promise<FeatureWorkflowState> {
    this.ensureConnected();
    const handle = this.workflowClient!.getHandle(workflowId);
    return handle.query("workflow-state") as Promise<FeatureWorkflowState>;
  }

  async listWorkflowsByPrefix(prefix: string): Promise<string[]> {
    this.ensureConnected();
    const ids: string[] = [];
    const iterable = this.workflowClient!.list({
      query: `WorkflowId STARTS_WITH '${prefix}'`,
    });
    for await (const info of iterable) {
      ids.push(info.workflowId);
    }
    return ids;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error("Temporal client is not connected. Call connect() first.");
    }
  }

}
