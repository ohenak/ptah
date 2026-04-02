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
import { AsyncMutex } from "../src/orchestrator/merge-lock.js";
import { DefaultArtifactCommitter } from "../src/orchestrator/artifact-committer.js";
import { DefaultAgentLogWriter } from "../src/orchestrator/agent-log-writer.js";
import { InMemoryMessageDeduplicator } from "../src/orchestrator/message-deduplicator.js";
import { DefaultQuestionStore } from "../src/orchestrator/question-store.js";
import { DefaultQuestionPoller } from "../src/orchestrator/question-poller.js";
import { DefaultPatternBContextBuilder } from "../src/orchestrator/pattern-b-context-builder.js";
import { InMemoryWorktreeRegistry } from "../src/orchestrator/worktree-registry.js";
import { InMemoryThreadStateManager } from "../src/orchestrator/thread-state-manager.js";
import { DefaultInvocationGuard } from "../src/orchestrator/invocation-guard.js";
import { FileStateStore } from "../src/orchestrator/pdlc/state-store.js";
import { DefaultPdlcDispatcher } from "../src/orchestrator/pdlc/pdlc-dispatcher.js";
import { buildAgentRegistry } from "../src/orchestrator/agent-registry.js";
import { MigrateCommand } from "../src/commands/migrate.js";
import { TemporalClientWrapperImpl } from "../src/temporal/client.js";

function printHelp(): void {
  console.log(`ptah v0.1.0

Usage: ptah <command>

Commands:
  init     Scaffold the Ptah docs structure into the current Git repository
  start    Start the Orchestrator as a Discord bot
  migrate  Migrate v4 pdlc-state.json to Temporal Workflows

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

      // Phase 7 (Phase I): Build agent registry from config.agentEntries.
      // buildAgentRegistry logs each validation error and the final registration summary.
      const configLogger = logger.forComponent('config');
      const { registry: agentRegistry } = await buildAgentRegistry(
        config.agentEntries,
        fs,
        configLogger,
      );

      // Build Claude Code client
      const claudeCodeInvokeFn: ClaudeCodeInvokeFn = async (options) => {
        const { query } = await import("@anthropic-ai/claude-agent-sdk");

        // Forward the AbortSignal to a new AbortController for the SDK
        const abortController = new AbortController();
        options.signal.addEventListener("abort", () => abortController.abort(), { once: true });

        const queryIterable = query({
          prompt: options.userMessage,
          options: {
            systemPrompt: options.systemPrompt,
            cwd: options.cwd,
            allowedTools: options.allowedTools,
            abortController,
            model: config.agents.model,
            permissionMode: "bypassPermissions",
          },
        });

        // Iterate the async stream and return the final result text
        for await (const message of queryIterable) {
          if (
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            (message as { type: string }).type === "result" &&
            "result" in message &&
            typeof (message as { result: unknown }).result === "string"
          ) {
            return (message as { result: string }).result;
          }
        }
        return "";
      };

      const skillClient = new ClaudeCodeClient(claudeCodeInvokeFn);

      // Wire up orchestrator dependencies
      const routingEngine = new DefaultRoutingEngine(agentRegistry, logger);
      const contextAssembler = new DefaultContextAssembler(fs, tokenCounter, logger);
      const skillInvoker = new DefaultSkillInvoker(skillClient, git, logger);
      const responsePoster = new DefaultResponsePoster(discord, logger);
      const threadQueue = new InMemoryThreadQueue();

      // Phase 6: Abort controller for graceful shutdown
      const abortController = new AbortController();

      // Phase 4: Artifact commit pipeline services
      const mergeLock = new AsyncMutex();
      const artifactCommitter = new DefaultArtifactCommitter(git, mergeLock, logger);
      const agentLogWriter = new DefaultAgentLogWriter(fs, mergeLock, logger);
      const messageDeduplicator = new InMemoryMessageDeduplicator();

      // Phase 5: Question pipeline (closure-capture for circular construction)
      const questionStore = new DefaultQuestionStore(
        fs,
        git,
        mergeLock,
        logger,
        "../docs/open-questions/pending.md",
        "../docs/open-questions/resolved.md",
      );
      let orchestrator: DefaultOrchestrator;
      const questionPoller = new DefaultQuestionPoller(
        questionStore,
        (q) => orchestrator.resumeWithPatternB(q),
        30_000, // 30s poll interval
        logger,
      );
      const patternBContextBuilder = new DefaultPatternBContextBuilder(fs, tokenCounter, logger);

      // Phase 6: New modules
      const worktreeRegistry = new InMemoryWorktreeRegistry();
      const threadStateManager = new InMemoryThreadStateManager();
      const invocationGuard = new DefaultInvocationGuard(
        skillInvoker,
        artifactCommitter,
        git,
        discord,
        responsePoster,
        logger,
      );

      // Phase 11: PDLC State Machine
      const stateStore = new FileStateStore(fs, logger, "ptah/state/pdlc-state.json");
      const pdlcDispatcher = new DefaultPdlcDispatcher(stateStore, fs, logger, config.docs.root);

      orchestrator = new DefaultOrchestrator({
        discordClient: discord,
        routingEngine,
        contextAssembler,
        skillInvoker,
        responsePoster,
        threadQueue,
        logger,
        config,
        // Phase 4 additions:
        gitClient: git,
        artifactCommitter,
        agentLogWriter,
        messageDeduplicator,
        // Phase 5 additions:
        questionStore,
        questionPoller,
        patternBContextBuilder,
        // Phase 6 additions:
        invocationGuard,
        threadStateManager,
        worktreeRegistry,
        shutdownSignal: abortController.signal,
        // Phase 11: PDLC State Machine
        pdlcDispatcher,
        // Phase 7: Agent registry
        agentRegistry,
      });

      const command = new StartCommand(configLoader, discord, logger, {
        orchestrator,
      });

      try {
        const result = await command.execute();

        const { registerSignals } = createShutdownHandler(
          result,
          logger,
          threadQueue,
          worktreeRegistry,
          git,
          orchestrator,
          discord,
          config.orchestrator.shutdown_timeout_ms ?? 60000,
          abortController,
        );
        registerSignals();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
        process.exitCode = 1;
      }
      break;
    }

    case "migrate": {
      const fs = new NodeFileSystem();
      const logger = new ConsoleLogger();

      // Parse flags
      const dryRun = args.includes("--dry-run");
      const includeCompleted = args.includes("--include-completed");
      const phaseMapIdx = args.indexOf("--phase-map");
      const phaseMapPath = phaseMapIdx !== -1 ? args[phaseMapIdx + 1] : undefined;

      // Load config to get Temporal connection params
      const configLoader = new NodeConfigLoader(fs);
      let config;
      try {
        config = await configLoader.load();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
        process.exitCode = 1;
        return;
      }

      const temporalConfig = config.temporal ?? {
        address: "localhost:7233",
        namespace: "default",
        taskQueue: "ptah-main",
        worker: { maxConcurrentWorkflowTasks: 10, maxConcurrentActivities: 3 },
        retry: { maxAttempts: 3, initialIntervalSeconds: 30, backoffCoefficient: 2.0, maxIntervalSeconds: 600 },
        heartbeat: { intervalSeconds: 30, timeoutSeconds: 120 },
      };

      const temporalClient = new TemporalClientWrapperImpl(temporalConfig);
      const command = new MigrateCommand(temporalClient, fs, logger);

      try {
        const result = await command.execute({ dryRun, includeCompleted, phaseMapPath });

        if (dryRun) {
          console.log("Dry-run complete. No workflows were created.");
          console.log(`  Active features that would be migrated: ${result.activeCreated}`);
          console.log(`  Completed features that would be imported: ${result.completedImported}`);
        } else {
          console.log("Migration complete.");
          console.log(`  Active workflows created: ${result.activeCreated}`);
          console.log(`  Completed workflows imported: ${result.completedImported}`);
          console.log(`  Skipped (already migrated): ${result.skipped}`);
          console.log(`  Warnings: ${result.warnings.length}`);
          for (const w of result.warnings) {
            console.warn(`  ⚠  ${w}`);
          }
          if (result.errors.length > 0) {
            console.error(`  Errors: ${result.errors.length}`);
            for (const e of result.errors) {
              console.error(`  ✗  ${e}`);
            }
          }
        }

        if (result.errors.length > 0) {
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
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
