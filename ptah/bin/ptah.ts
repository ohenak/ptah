#!/usr/bin/env node

import { NodeFileSystem } from "../src/services/filesystem.js";
import { NodeGitClient } from "../src/services/git.js";
import { InitCommand } from "../src/commands/init.js";
import { NodeConfigLoader } from "../src/config/loader.js";
import { DiscordJsClient } from "../src/services/discord.js";
import { ConsoleLogger } from "../src/services/logger.js";
import { StartCommand } from "../src/commands/start.js";
import { createShutdownHandler } from "../src/shutdown.js";
import { DefaultOrchestrator } from "../src/orchestrator/orchestrator.js";
import { DefaultRoutingEngine } from "../src/orchestrator/router.js";
import { DefaultContextAssembler } from "../src/orchestrator/context-assembler.js";
import { DefaultSkillInvoker } from "../src/orchestrator/skill-invoker.js";
import { DefaultResponsePoster } from "../src/orchestrator/response-poster.js";
import { InMemoryThreadQueue } from "../src/orchestrator/thread-queue.js";
import { CharTokenCounter } from "../src/orchestrator/token-counter.js";
import { ClaudeCodeClient } from "../src/services/claude-code.js";
import type { ClaudeCodeInvokeFn } from "../src/services/claude-code.js";

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
          console.log(`\u2713  Created ${path}`);
        }
        for (const path of result.skipped) {
          console.log(`\u2298  Skipped ${path} (exists)`);
        }

        if (result.created.length === 0) {
          console.log("\u2139  No new files created \u2014 skipping commit.");
        } else if (result.committed) {
          console.log("\u2713  Committed: [ptah] init: scaffolded docs structure");
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
      const git = new NodeGitClient();
      const configLoader = new NodeConfigLoader(fs);
      const discord = new DiscordJsClient(logger);
      const tokenCounter = new CharTokenCounter();

      // Load config first to build orchestrator
      let config;
      try {
        config = await configLoader.load();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
        process.exitCode = 1;
        return;
      }

      // Build Claude Code client
      const claudeCodeInvokeFn: ClaudeCodeInvokeFn = async (options) => {
        const { query } = await import("@anthropic-ai/claude-code");
        const messages = await query({
          prompt: options.userMessage,
          systemPrompt: options.systemPrompt,
          cwd: options.cwd,
          allowedTools: options.allowedTools,
          abortController: new AbortController(),
        });

        // Extract text from the last assistant message
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && typeof lastMessage === "object" && "content" in lastMessage) {
          const content = lastMessage.content;
          if (Array.isArray(content)) {
            return content
              .filter((block: { type: string }) => block.type === "text")
              .map((block: { text: string }) => block.text)
              .join("\n");
          }
          if (typeof content === "string") {
            return content;
          }
        }
        return "";
      };

      const skillClient = new ClaudeCodeClient(claudeCodeInvokeFn);

      // Wire up orchestrator dependencies
      const routingEngine = new DefaultRoutingEngine(logger);
      const contextAssembler = new DefaultContextAssembler(fs, tokenCounter, logger);
      const skillInvoker = new DefaultSkillInvoker(skillClient, git, logger);
      const responsePoster = new DefaultResponsePoster(discord, logger);
      const threadQueue = new InMemoryThreadQueue();

      const orchestrator = new DefaultOrchestrator({
        discordClient: discord,
        routingEngine,
        contextAssembler,
        skillInvoker,
        responsePoster,
        threadQueue,
        logger,
        config,
      });

      const command = new StartCommand(configLoader, discord, logger, {
        orchestrator,
      });

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
