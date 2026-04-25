#!/usr/bin/env node

import { NodeFileSystem } from "../src/services/filesystem.js";
import { NodeGitClient } from "../src/services/git.js";
import { InitCommand } from "../src/commands/init.js";
import { NodeConfigLoader } from "../src/config/loader.js";
import { DiscordJsClient } from "../src/services/discord.js";
import { ConsoleLogger } from "../src/services/logger.js";
import { StartCommand } from "../src/commands/start.js";
import { createShutdownHandler } from "../src/shutdown.js";
import { DefaultRoutingEngine } from "../src/orchestrator/router.js";
import { DefaultContextAssembler } from "../src/orchestrator/context-assembler.js";
import { DefaultSkillInvoker } from "../src/orchestrator/skill-invoker.js";
import { CharTokenCounter } from "../src/orchestrator/token-counter.js";
import { ClaudeCodeClient } from "../src/services/claude-code.js";
import type { ClaudeCodeInvokeFn } from "../src/services/claude-code.js";
import { DefaultArtifactCommitter } from "../src/orchestrator/artifact-committer.js";
import { DefaultAgentLogWriter } from "../src/orchestrator/agent-log-writer.js";
import { InMemoryWorktreeRegistry } from "../src/orchestrator/worktree-registry.js";
import { DefaultFeatureResolver } from "../src/orchestrator/feature-resolver.js";
import { DefaultPhaseDetector } from "../src/orchestrator/phase-detector.js";
import { DefaultWorktreeManager } from "../src/orchestrator/worktree-manager.js";
import { buildAgentRegistry } from "../src/orchestrator/agent-registry.js";
import { MigrateCommand } from "../src/commands/migrate.js";
import { TemporalClientWrapperImpl } from "../src/temporal/client.js";
import { TemporalOrchestrator } from "../src/orchestrator/temporal-orchestrator.js";
import { createTemporalWorker } from "../src/temporal/worker.js";
import { YamlWorkflowConfigLoader } from "../src/config/workflow-config.js";
import { DefaultWorkflowValidator } from "../src/config/workflow-validator.js";
import type { TemporalConfig } from "../src/types.js";

function printHelp(): void {
  console.log(`ptah v0.1.0

Usage: ptah <command>

Commands:
  init     Scaffold the Ptah docs structure into the current Git repository
  start    Start the Orchestrator as a Discord bot
  migrate  Migrate v4 pdlc-state.json to Temporal Workflows
  run      Start a feature workflow from a REQ file and stream progress

Options:
  --help  Show this help message

Run options:
  ptah run <path/to/REQ-feature.md> [--from-phase <phase-id>]`);
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

      // Build agent registry from config.agentEntries
      const configLogger = logger.forComponent('config');
      const { registry: agentRegistry } = await buildAgentRegistry(
        config.agentEntries,
        fs,
        configLogger,
      );

      // Load and validate workflow config
      const workflowConfigLoader = new YamlWorkflowConfigLoader(fs);
      let workflowConfig;
      try {
        workflowConfig = await workflowConfigLoader.load();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to load workflow config: ${message}`);
        process.exitCode = 1;
        return;
      }

      const validator = new DefaultWorkflowValidator();
      const validation = validator.validate(workflowConfig, agentRegistry);
      for (const w of validation.warnings) {
        logger.warn(`Workflow config warning in phase '${w.phase}' field '${w.field}': ${w.message}`);
      }
      if (!validation.valid) {
        for (const err of validation.errors) {
          logger.error(`Workflow config error in phase '${err.phase}' field '${err.field}': ${err.message}`);
        }
        process.exitCode = 1;
        return;
      }

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

      // Wire up shared dependencies
      const routingEngine = new DefaultRoutingEngine(agentRegistry, logger);
      const contextAssembler = new DefaultContextAssembler(fs, tokenCounter, logger);
      const skillInvoker = new DefaultSkillInvoker(skillClient, git, logger);
      const worktreeRegistry = new InMemoryWorktreeRegistry();
      const featureResolver = new DefaultFeatureResolver(fs, logger);
      const phaseDetector = new DefaultPhaseDetector(fs, logger, config.docs.root);
      const worktreeManager = new DefaultWorktreeManager(git, worktreeRegistry, logger);

      // Startup sweep: prune dangling ptah worktrees from previous crashes.
      // At startup we have no known active executions, so pass an empty set.
      try {
        await worktreeManager.cleanupDangling(new Set());
        logger.info("Startup worktree cleanup complete");
      } catch (err) {
        logger.warn(`Startup worktree cleanup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }

      // Phase 4: Artifact commit pipeline services (AsyncMutex no longer needed at top level)
      const { AsyncMutex } = await import("../src/orchestrator/merge-lock.js");
      const mergeLock = new AsyncMutex();
      const artifactCommitter = new DefaultArtifactCommitter(git, mergeLock, logger);
      const agentLogWriter = new DefaultAgentLogWriter(fs, mergeLock, logger);

      // Abort controller for graceful shutdown
      const abortController = new AbortController();

      // Build Temporal config with defaults
      const temporalConfig: TemporalConfig = config.temporal ?? {
        address: "localhost:7233",
        namespace: "default",
        taskQueue: "ptah-main",
        worker: { maxConcurrentWorkflowTasks: 10, maxConcurrentActivities: 3 },
        retry: { maxAttempts: 3, initialIntervalSeconds: 30, backoffCoefficient: 2.0, maxIntervalSeconds: 600 },
        heartbeat: { intervalSeconds: 30, timeoutSeconds: 120 },
      };

      // Construct activity closures for the Worker
      const { createActivities } = await import("../src/temporal/activities/skill-activity.js");
      const { createNotificationActivities } = await import("../src/temporal/activities/notification-activity.js");
      const { createCrossReviewActivities } = await import("../src/temporal/activities/cross-review-activity.js");
      const { createPromotionActivities } = await import("../src/orchestrator/promotion-activity.js");
      const { createArtifactActivities } = await import("../src/temporal/activities/artifact-activity.js");
      const skillActivities = createActivities({
        skillInvoker,
        contextAssembler,
        artifactCommitter,
        gitClient: git,
        routingEngine,
        agentRegistry,
        logger,
        config,
        featureResolver,
        worktreeManager,
        fs,
      });
      const notificationActivities = createNotificationActivities({ discordClient: discord, logger, config });
      const crossReviewActivities = createCrossReviewActivities({ fs, logger });
      const promotionActivities = createPromotionActivities({
        worktreeManager,
        gitClient: git,
        fs,
        logger,
      });
      const artifactActivities = createArtifactActivities(fs);

      // Create Temporal Worker
      let worker;
      try {
        worker = await createTemporalWorker({
          config,
          activities: {
            invokeSkill: skillActivities.invokeSkill,
            mergeWorktree: skillActivities.mergeWorktree,
            resolveFeaturePath: skillActivities.resolveFeaturePath,
            sendNotification: notificationActivities.sendNotification,
            promoteBacklogToInProgress: promotionActivities.promoteBacklogToInProgress,
            promoteInProgressToCompleted: promotionActivities.promoteInProgressToCompleted,
            readCrossReviewRecommendation: crossReviewActivities.readCrossReviewRecommendation,
            checkArtifactExists: artifactActivities.checkArtifactExists,
          },
          logger,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to create Temporal Worker: ${message}`);
        process.exitCode = 1;
        return;
      }

      const temporalClient = new TemporalClientWrapperImpl(temporalConfig);

      const orchestrator = new TemporalOrchestrator({
        temporalClient,
        worker,
        discordClient: discord,
        gitClient: git,
        logger,
        config,
        workflowConfig,
        agentRegistry,
        skillInvoker,
        phaseDetector,
      });

      const command = new StartCommand(configLoader, discord, logger, {
        orchestrator,
      });

      try {
        const result = await command.execute();

        const { registerSignals } = createShutdownHandler(
          result,
          logger,
          orchestrator,
          discord,
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

      const temporalConfig: TemporalConfig = config.temporal ?? {
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

    case "run": {
      const reqPath = args[1];
      if (!reqPath) {
        console.error("Error: ptah run requires a REQ file path.");
        console.error("Usage: ptah run <path/to/REQ-feature.md> [--from-phase <phase-id>]");
        process.exitCode = 1;
        break;
      }

      // Parse --from-phase flag
      const fromPhaseIdx = args.indexOf("--from-phase");
      const fromPhase = fromPhaseIdx !== -1 ? args[fromPhaseIdx + 1] : undefined;

      const { RunCommand, LenientConfigLoader } = await import("../src/commands/run.js");
      const { YamlWorkflowConfigLoader } = await import("../src/config/workflow-config.js");
      const { TemporalClientWrapperImpl } = await import("../src/temporal/client.js");
      const { NodeFileSystem } = await import("../src/services/filesystem.js");

      const runFs = new NodeFileSystem();
      const runConfigLoader = new LenientConfigLoader(runFs);
      const runWorkflowConfigLoader = new YamlWorkflowConfigLoader(runFs);

      // Load config to get Temporal address
      let runConfig;
      try {
        runConfig = await runConfigLoader.load();
      } catch {
        // Config load failure is handled inside RunCommand.execute()
        runConfig = {};
      }

      const runTemporalConfig = (runConfig as { temporal?: import("../src/types.js").TemporalConfig }).temporal ?? {
        address: "localhost:7233",
        namespace: "default",
        taskQueue: "ptah-main",
        worker: { maxConcurrentWorkflowTasks: 10, maxConcurrentActivities: 3 },
        retry: { maxAttempts: 3, initialIntervalSeconds: 30, backoffCoefficient: 2.0, maxIntervalSeconds: 600 },
        heartbeat: { intervalSeconds: 30, timeoutSeconds: 120 },
      };

      const runTemporalClient = new TemporalClientWrapperImpl(runTemporalConfig);

      const command = new RunCommand({
        fs: runFs,
        temporalClient: runTemporalClient,
        workflowConfigLoader: runWorkflowConfigLoader,
        configLoader: runConfigLoader,
        stdout: process.stdout,
        stderr: process.stderr,
        stdin: process.stdin,
      });

      try {
        const exitCode = await command.execute({ reqPath, fromPhase });
        process.exitCode = exitCode;
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
