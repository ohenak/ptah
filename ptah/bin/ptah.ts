#!/usr/bin/env node

import { NodeFileSystem } from "../src/services/filesystem.js";
import { NodeGitClient } from "../src/services/git.js";
import { InitCommand } from "../src/commands/init.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (subcommand !== "init") {
    console.error(`Unknown command: ${subcommand ?? "(none)"}`);
    console.error("Usage: ptah init");
    process.exitCode = 1;
    return;
  }

  const fs = new NodeFileSystem();
  const git = new NodeGitClient();
  const command = new InitCommand(fs, git);

  try {
    const result = await command.execute();

    for (const path of result.created) {
      console.log(`✓  Created ${path}`);
    }
    for (const path of result.skipped) {
      console.log(`⊘  Skipped ${path} (exists)`);
    }

    if (result.created.length === 0) {
      console.log("ℹ  No new files created — skipping commit.");
    } else if (result.committed) {
      console.log("✓  Committed: [ptah] init: scaffolded docs structure");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

main();
