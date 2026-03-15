import { describe, it, expect, afterEach } from "vitest";
import { FileStateStore } from "../../../../src/orchestrator/pdlc/state-store.js";
import { CURRENT_VERSION, migrations } from "../../../../src/orchestrator/pdlc/migrations.js";
import { FakeFileSystem, FakeLogger } from "../../../fixtures/factories.js";
import type { PdlcStateFile } from "../../../../src/orchestrator/pdlc/phases.js";

const STATE_PATH = "ptah/state/pdlc-state.json";

function setup() {
  const fs = new FakeFileSystem();
  const logger = new FakeLogger();
  const store = new FileStateStore(fs, logger, STATE_PATH);
  return { fs, logger, store };
}

// ─── Task 26: load() basic cases ───────────────────────────────────────────

describe("FileStateStore.load() — basic cases", () => {
  it("returns fresh state when file does not exist", async () => {
    const { store, logger } = setup();

    const result = await store.load();

    expect(result).toEqual({ version: CURRENT_VERSION, features: {} });
    expect(logger.messages).toContainEqual(
      expect.objectContaining({ level: "info", message: expect.stringContaining("not found") }),
    );
  });

  it("parses and returns valid JSON file", async () => {
    const { fs, store } = setup();
    const state: PdlcStateFile = {
      version: CURRENT_VERSION,
      features: {
        "auth-login": {
          phase: "implementation",
          assignedAgent: "dev-agent",
          threadId: "thread-1",
          worktreePath: "/tmp/wt",
          branch: "ptah/auth-login",
          updatedAt: "2026-03-14T00:00:00Z",
        },
      },
    };
    fs.addExisting(STATE_PATH, JSON.stringify(state));

    const result = await store.load();

    expect(result).toEqual(state);
  });

  it("returns fresh state and warns when file is empty", async () => {
    const { fs, store, logger } = setup();
    fs.addExisting(STATE_PATH, "");

    const result = await store.load();

    expect(result).toEqual({ version: CURRENT_VERSION, features: {} });
    expect(logger.messages).toContainEqual(
      expect.objectContaining({ level: "warn", message: expect.stringContaining("empty") }),
    );
  });
});

// ─── Task 27: load() error/version cases ───────────────────────────────────

describe("FileStateStore.load() — error/version cases", () => {
  it("returns fresh state and logs error for corrupted JSON", async () => {
    const { fs, store, logger } = setup();
    fs.addExisting(STATE_PATH, "{invalid json!!!");

    const result = await store.load();

    expect(result).toEqual({ version: CURRENT_VERSION, features: {} });
    expect(logger.messages).toContainEqual(
      expect.objectContaining({ level: "error", message: expect.stringContaining("invalid JSON") }),
    );
  });

  it("returns parsed state as-is when version equals CURRENT_VERSION", async () => {
    const { fs, store } = setup();
    const state: PdlcStateFile = { version: CURRENT_VERSION, features: {} };
    fs.addExisting(STATE_PATH, JSON.stringify(state));

    const result = await store.load();

    expect(result).toEqual(state);
  });

  it("returns fresh state and logs error for future version", async () => {
    const { fs, store, logger } = setup();
    const futureState = { version: CURRENT_VERSION + 5, features: {} };
    fs.addExisting(STATE_PATH, JSON.stringify(futureState));

    const result = await store.load();

    expect(result).toEqual({ version: CURRENT_VERSION, features: {} });
    expect(logger.messages).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining(`version ${CURRENT_VERSION + 5} is newer than supported ${CURRENT_VERSION}`),
      }),
    );
  });

  it("treats missing version field as corrupted", async () => {
    const { fs, store, logger } = setup();
    fs.addExisting(STATE_PATH, JSON.stringify({ features: {} }));

    const result = await store.load();

    expect(result).toEqual({ version: CURRENT_VERSION, features: {} });
    expect(logger.messages).toContainEqual(
      expect.objectContaining({ level: "error", message: expect.stringContaining("missing version") }),
    );
  });

  it("treats non-numeric version field as corrupted", async () => {
    const { fs, store, logger } = setup();
    fs.addExisting(STATE_PATH, JSON.stringify({ version: "abc", features: {} }));

    const result = await store.load();

    expect(result).toEqual({ version: CURRENT_VERSION, features: {} });
    expect(logger.messages).toContainEqual(
      expect.objectContaining({ level: "error", message: expect.stringContaining("missing version") }),
    );
  });
});

// ─── Task 28: save() atomic write ─────────────────────────────────────────

describe("FileStateStore.save() — atomic write", () => {
  it("serializes with 2-space indent and writes atomically", async () => {
    const { fs, store } = setup();
    const state: PdlcStateFile = { version: CURRENT_VERSION, features: {} };

    await store.save(state);

    // The tmp file should have been renamed, so it should not exist
    expect(fs.getFile(`${STATE_PATH}.tmp`)).toBeUndefined();
    // The final file should exist with correct content
    expect(fs.getFile(STATE_PATH)).toBe(JSON.stringify(state, null, 2));
  });

  it("creates directory if missing", async () => {
    const { fs, store } = setup();
    const state: PdlcStateFile = { version: CURRENT_VERSION, features: {} };

    await store.save(state);

    expect(fs.hasDir("ptah/state")).toBe(true);
  });

  it("throws when rename fails — previous state preserved", async () => {
    const { fs, store } = setup();
    // Set up existing state
    const existing: PdlcStateFile = { version: CURRENT_VERSION, features: {} };
    fs.addExisting(STATE_PATH, JSON.stringify(existing));

    // Make rename fail
    fs.renameError = new Error("EXDEV: cross-device rename");

    const newState: PdlcStateFile = {
      version: CURRENT_VERSION,
      features: { "feat-x": { phase: "planning", assignedAgent: null, threadId: null, worktreePath: null, branch: null, updatedAt: "2026-03-14" } },
    };

    await expect(store.save(newState)).rejects.toThrow("cross-device rename");

    // Original file should be untouched
    expect(fs.getFile(STATE_PATH)).toBe(JSON.stringify(existing));
  });

  it("throws when writeFile fails", async () => {
    const { fs, store } = setup();
    fs.writeFileError = new Error("ENOSPC: no space left on device");

    const state: PdlcStateFile = { version: CURRENT_VERSION, features: {} };

    await expect(store.save(state)).rejects.toThrow("no space left");
  });
});

// ─── Task 29: load() migration path ───────────────────────────────────────

describe("FileStateStore.load() — migration path", () => {
  afterEach(() => {
    delete migrations[0];
  });

  it("migrates older version, persists result, and returns migrated state", async () => {
    const { fs, store } = setup();

    // Register a migration from v0 -> v1
    migrations[0] = (state: unknown) => ({
      ...(state as Record<string, unknown>),
      features: { ...(state as Record<string, unknown>).features as Record<string, unknown> },
    });

    const oldState = { version: 0, features: { "feat-a": { phase: "planning", assignedAgent: null, threadId: null, worktreePath: null, branch: null, updatedAt: "2026-01-01" } } };
    fs.addExisting(STATE_PATH, JSON.stringify(oldState));

    const result = await store.load();

    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.features["feat-a"]).toBeDefined();

    // Verify migrated state was persisted
    const persisted = JSON.parse(fs.getFile(STATE_PATH)!);
    expect(persisted.version).toBe(CURRENT_VERSION);
  });

  it("on migration failure, copies original to .bak, logs error, returns fresh", async () => {
    const { fs, store, logger } = setup();

    // No migration registered for v0 -> v1, so migrateState will throw
    const oldState = { version: 0, features: {} };
    fs.addExisting(STATE_PATH, JSON.stringify(oldState));

    const result = await store.load();

    expect(result).toEqual({ version: CURRENT_VERSION, features: {} });

    // .bak should contain original
    const backup = fs.getFile(`${STATE_PATH}.bak`);
    expect(backup).toBe(JSON.stringify(oldState));

    // Error should be logged
    expect(logger.messages).toContainEqual(
      expect.objectContaining({ level: "error", message: expect.stringContaining("Migration failed") }),
    );
  });

  it("overwrites existing .bak on migration failure", async () => {
    const { fs, store } = setup();

    // Pre-existing .bak
    fs.addExisting(`${STATE_PATH}.bak`, "old backup content");

    const oldState = { version: 0, features: {} };
    fs.addExisting(STATE_PATH, JSON.stringify(oldState));

    await store.load();

    // .bak should be overwritten with current state
    const backup = fs.getFile(`${STATE_PATH}.bak`);
    expect(backup).toBe(JSON.stringify(oldState));
  });
});
