import { describe, it, expect, afterEach } from "vitest";
import {
  CURRENT_VERSION,
  migrations,
  migrateState,
} from "../../../../src/orchestrator/pdlc/migrations.js";

describe("migrations", () => {
  // Clean up any test migrations we register
  const registeredVersions: number[] = [];

  function registerMigration(version: number, fn: (state: unknown) => unknown) {
    migrations[version] = fn;
    registeredVersions.push(version);
  }

  afterEach(() => {
    for (const v of registeredVersions) {
      delete migrations[v];
    }
    registeredVersions.length = 0;
  });

  it("CURRENT_VERSION is 1", () => {
    expect(CURRENT_VERSION).toBe(1);
  });

  it("migrations registry is empty (no migrations for v1)", () => {
    expect(Object.keys(migrations)).toHaveLength(0);
  });

  it("migrateState throws when fromVersion >= toVersion (equal)", () => {
    expect(() => migrateState({}, 1, 1)).toThrow(
      "fromVersion must be less than toVersion",
    );
  });

  it("migrateState throws when fromVersion >= toVersion (greater)", () => {
    expect(() => migrateState({}, 3, 1)).toThrow(
      "fromVersion must be less than toVersion",
    );
  });

  it("migrateState throws when migration function is missing", () => {
    expect(() => migrateState({}, 0, 1)).toThrow(
      "No migration function for version 0 to 1",
    );
  });

  it("migrateState with a registered test migration works", () => {
    registerMigration(0, (state: unknown) => {
      const s = state as Record<string, unknown>;
      return { ...s, features: {}, migrated: true };
    });

    const result = migrateState({ oldField: "value" }, 0, 1);

    expect(result.version).toBe(1);
    expect(result.features).toEqual({});
    expect((result as Record<string, unknown>).migrated).toBe(true);
  });

  it("migrateState runs sequential chain (v1 -> v2 -> v3)", () => {
    registerMigration(1, (state: unknown) => {
      const s = state as Record<string, unknown>;
      return { ...s, step1: true };
    });
    registerMigration(2, (state: unknown) => {
      const s = state as Record<string, unknown>;
      return { ...s, step2: true };
    });

    const input = { version: 1, features: {} };
    const result = migrateState(input, 1, 3);

    expect(result.version).toBe(3);
    expect((result as Record<string, unknown>).step1).toBe(true);
    expect((result as Record<string, unknown>).step2).toBe(true);
  });

  it("migrateState sets version field on result to toVersion", () => {
    registerMigration(5, (state: unknown) => {
      const s = state as Record<string, unknown>;
      return { ...s, features: {} };
    });

    const result = migrateState({ version: 5 }, 5, 6);
    expect(result.version).toBe(6);
  });

  it("migrateState propagates errors from migration functions", () => {
    registerMigration(1, () => {
      throw new Error("Migration exploded");
    });

    expect(() => migrateState({ version: 1, features: {} }, 1, 2)).toThrow(
      "Migration exploded",
    );
  });
});
