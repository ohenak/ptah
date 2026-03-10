import type { ThreadMessage } from "../types.js";

export interface Orchestrator {
  handleMessage(message: ThreadMessage): Promise<void>;
  startup(): Promise<void>;
}
