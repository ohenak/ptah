#!/usr/bin/env node

import { NodeFileSystem } from "../src/services/filesystem.js";
import { NodeGitClient } from "../src/services/git.js";
import { InitCommand } from "../src/commands/init.js";
import { NodeConfigLoader } from "../src/config/loader.js";
import { DiscordJsClient } from "../src/services/discord.js";
import { ConsoleLogger } from "../src/services/logger.js";
import { StartCommand } from "../src/commands/start.js";
import { createShutdownHandler } from "../src/shutdown.js";

function printHelp(): void {
  console.log(`ptah v0.1.0

Usage: ptah <command>

Commands:
  init    Scaffold the Ptah docs structure into the current Git repository
  start   Start the Orchestrator as a Discord bot

Options:
  --help  Show this help message`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    printHelp();
    return;
  }

  switch (subcommand) {
    case "init": {
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
      break;
    }

    case "start": {
      const logger = new ConsoleLogger();
      const fs = new NodeFileSystem();
      const configLoader = new NodeConfigLoader(fs);
      const discord = new DiscordJsClient(logger);
      const command = new StartCommand(configLoader, discord, logger);

      try {
        const result = await command.execute();

        const { registerSignals } = createShutdownHandler(result, logger);
        registerSignals();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
        process.exitCode = 1;
      }
      break;
    }

    default: {
      console.error(`Unknown command: ${subcommand}`);
      console.error("Run 'ptah --help' for usage information.");
      process.exitCode = 1;
    }
  }
}

main();
