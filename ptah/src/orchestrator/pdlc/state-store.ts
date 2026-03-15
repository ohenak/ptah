/**
 * PDLC state persistence layer.
 */

import type { FileSystem } from "../../services/filesystem.js";
import type { Logger } from "../../services/logger.js";
import type { PdlcStateFile } from "./phases.js";
import { CURRENT_VERSION, migrateState } from "./migrations.js";

export interface StateStore {
  load(): Promise<PdlcStateFile>;
  save(state: PdlcStateFile): Promise<void>;
}

function freshState(): PdlcStateFile {
  return { version: CURRENT_VERSION, features: {} };
}

export class FileStateStore implements StateStore {
  constructor(
    private readonly fs: FileSystem,
    private readonly logger: Logger,
    private readonly statePath: string,
  ) {}

  async load(): Promise<PdlcStateFile> {
    const exists = await this.fs.exists(this.statePath);
    if (!exists) {
      this.logger.info(`State file not found at ${this.statePath}, starting fresh`);
      return freshState();
    }

    let raw: string;
    try {
      raw = await this.fs.readFile(this.statePath);
    } catch {
      this.logger.error(`Failed to read state file at ${this.statePath}, starting fresh`);
      return freshState();
    }

    // Empty file
    if (raw.length === 0) {
      this.logger.warn(`State file at ${this.statePath} is empty, starting fresh`);
      return freshState();
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.error(`State file at ${this.statePath} contains invalid JSON, starting fresh`);
      return freshState();
    }

    // Validate it's an object with a version field
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      typeof (parsed as Record<string, unknown>).version !== "number"
    ) {
      this.logger.error(`State file at ${this.statePath} is missing version field, starting fresh`);
      return freshState();
    }

    const state = parsed as PdlcStateFile;

    // Future version check
    if (state.version > CURRENT_VERSION) {
      this.logger.error(
        `State file version ${state.version} is newer than supported ${CURRENT_VERSION}`,
      );
      return freshState();
    }

    // Current version — return as-is
    if (state.version === CURRENT_VERSION) {
      return state;
    }

    // Older version — migrate
    try {
      const migrated = migrateState(state, state.version, CURRENT_VERSION);
      await this.save(migrated);
      return migrated;
    } catch (err) {
      // Migration failed — backup original, return fresh
      const backupPath = `${this.statePath}.bak`;
      try {
        await this.fs.copyFile(this.statePath, backupPath);
      } catch {
        this.logger.warn(`Failed to create backup at ${backupPath}`);
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Migration failed: ${message}, starting fresh`);
      return freshState();
    }
  }

  async save(state: PdlcStateFile): Promise<void> {
    const json = JSON.stringify(state, null, 2);
    const tmpPath = `${this.statePath}.tmp`;

    // Ensure directory exists
    const dir = this.statePath.substring(0, this.statePath.lastIndexOf("/"));
    if (dir) {
      await this.fs.mkdir(dir);
    }

    // Write to temp file
    await this.fs.writeFile(tmpPath, json);

    // Atomic rename
    try {
      await this.fs.rename(tmpPath, this.statePath);
    } catch (err) {
      throw err;
    }
  }
}
