import type {
  ContextBundle,
  ThreadMessage,
  PtahConfig,
} from "../types.js";

export interface ContextAssembler {
  assemble(params: {
    agentId: string;
    threadId: string;
    threadName: string;
    threadHistory: ThreadMessage[];
    triggerMessage: ThreadMessage;
    config: PtahConfig;
  }): Promise<ContextBundle>;
}
