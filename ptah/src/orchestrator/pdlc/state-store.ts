import type { PdlcStateFile } from "./phases.js";

/**
 * Protocol for PDLC state persistence.
 *
 * Behavioral contract:
 * - load() returns the current state file, or initializes fresh state if no file exists.
 * - save() atomically persists the state (write to .tmp, then rename).
 * - If load() encounters a corrupted or incompatible file, it initializes fresh state.
 *
 * Design rationale:
 * Separated from the state machine to keep transitions pure.
 * The orchestrator calls save() after every transition, and load() on startup.
 */
export interface StateStore {
  load(): Promise<PdlcStateFile>;
  save(state: PdlcStateFile): Promise<void>;
}
