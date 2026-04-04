#!/usr/bin/env node
/**
 * CLI entry point for the lifecycle migration command.
 *
 * Usage: ptah-migrate-lifecycle
 *
 * Reorganizes docs/ from the flat structure into:
 *   docs/backlog/, docs/in-progress/, docs/completed/
 */

import { NodeFileSystem } from "../src/services/filesystem.js";
import { NodeGitClient } from "../src/services/git.js";
import { ConsoleLogger } from "../src/services/logger.js";
import { MigrateLifecycleCommand } from "../src/commands/migrate-lifecycle.js";

async function main(): Promise<void> {
  const fs = new NodeFileSystem();
  const git = new NodeGitClient();
  const logger = new ConsoleLogger();

  const cmd = new MigrateLifecycleCommand(git, fs, logger);

  try {
    const result = await cmd.execute();

    console.log(`\n✓ Migration complete`);
    console.log(`  Completed:   ${result.completedMoved} folder(s) moved to docs/completed/`);
    console.log(`  In-progress: ${result.inProgressMoved} folder(s) moved to docs/in-progress/`);
    if (result.committed) {
      console.log(`  Committed: chore(migration): reorganize docs/ into lifecycle folders`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

main();
