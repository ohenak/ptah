import type { PdlcStateFile } from "./phases.js";

export type MigrationFn = (state: unknown) => unknown;

export const CURRENT_VERSION = 1;

/** Registry of migration functions. Key is the source version. */
export const migrations: Record<number, MigrationFn> = {
  // Future migrations will be added here:
  // 0: migrateV0ToV1,
  // 1: migrateV1ToV2,
};

/**
 * Run sequential migrations from fromVersion to toVersion.
 * Throws if any migration function is missing or fails.
 */
export function migrateState(
  state: unknown,
  fromVersion: number,
  toVersion: number,
): PdlcStateFile {
  if (fromVersion >= toVersion) {
    throw new Error(
      `Cannot migrate from version ${fromVersion} to ${toVersion}: fromVersion must be less than toVersion`,
    );
  }

  let current: unknown = state;

  for (let v = fromVersion; v < toVersion; v++) {
    const migrationFn = migrations[v];
    if (!migrationFn) {
      throw new Error(
        `No migration function for version ${v} to ${v + 1}`,
      );
    }
    current = migrationFn(current);
  }

  const result = current as PdlcStateFile;
  result.version = toVersion;
  return result;
}
