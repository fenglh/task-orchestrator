import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  OpenClawWebChatTaskHandler,
} from "../../../src/task-orchestrator/openclaw/webchat-handler.ts";
import { createRunnerFromModule } from "../../../src/task-orchestrator/openclaw/create-runner-from-module.ts";

function toConversationId(ctx: {
  channel?: string;
  senderId?: string;
  threadId?: string;
}): string {
  const channel = ctx.channel ?? "webchat";
  const peer = ctx.threadId ?? ctx.senderId ?? "unknown";
  return `${channel}:${peer}`;
}

function resolvePluginConfig(api: any): Record<string, unknown> {
  if (typeof api.getPluginConfig === "function") {
    return api.getPluginConfig("task-orchestrator") ?? {};
  }

  return api.config?.plugins?.entries?.["task-orchestrator"] ?? {};
}

function statSafeIsFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveCommandPath(command: string): string | undefined {
  try {
    return execFileSync("which", [command], { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return undefined;
  }
}

function resolveNpmGlobalRoot(): string | undefined {
  try {
    return execFileSync("npm", ["root", "-g"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return undefined;
  }
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function resolveWorkspaceDir(api: any, pluginConfig: Record<string, unknown>): string {
  const configuredWorkspaceDir = pluginConfig.workspaceDir;
  if (typeof configuredWorkspaceDir === "string" && configuredWorkspaceDir.trim()) {
    return configuredWorkspaceDir;
  }

  const hostWorkspaceDirCandidates = [
    api.config?.agents?.defaults?.workspace,
    api.config?.agents?.workspace,
    api.config?.workspaceDir,
    api.config?.workspace?.rootDir,
    api.config?.workspace?.dir,
  ];

  const hostWorkspaceDir = hostWorkspaceDirCandidates.find(
    (value) => typeof value === "string" && value.trim(),
  );

  if (typeof hostWorkspaceDir === "string") {
    return hostWorkspaceDir;
  }

  throw new Error(
    "workspaceDir is not configured and no host workspace directory was found in api.config",
  );
}

function resolveHostRootDir(api: any): string {
  const rootDirCandidates = [
    api.config?.rootDir,
    api.config?.cwd,
    process.cwd(),
  ];

  const rootDir = rootDirCandidates.find(
    (value) => typeof value === "string" && value.trim(),
  );

  if (typeof rootDir === "string") {
    return rootDir;
  }

  return process.cwd();
}

function buildRunnerModuleCandidates(api: any, pluginConfig: Record<string, unknown>): string[] {
  const relativeRunnerCandidates = [
    "dist/agents/pi-embedded-runner.js",
    "agents/pi-embedded-runner.js",
    "src/agents/pi-embedded-runner.js",
    "src/agents/pi-embedded-runner.ts",
  ];
  const openclawCommandPath = resolveCommandPath("openclaw");
  const npmGlobalRoot = resolveNpmGlobalRoot();
  const commandPrefix = openclawCommandPath ? dirname(dirname(resolve(openclawCommandPath))) : undefined;
  const rootCandidates = unique([
    pluginConfig.runnerModule as string | undefined,
    resolveHostRootDir(api),
    npmGlobalRoot,
    npmGlobalRoot ? join(npmGlobalRoot, "openclaw") : undefined,
    npmGlobalRoot ? join(npmGlobalRoot, "@openclaw", "cli") : undefined,
    commandPrefix,
    commandPrefix ? join(commandPrefix, "lib", "node_modules") : undefined,
    commandPrefix ? join(commandPrefix, "lib", "node_modules", "openclaw") : undefined,
    commandPrefix ? join(commandPrefix, "lib", "node_modules", "@openclaw", "cli") : undefined,
  ]);

  const absoluteCandidates: string[] = [];
  for (const rootCandidate of rootCandidates) {
    if (statSafeIsFile(rootCandidate)) {
      absoluteCandidates.push(rootCandidate);
      continue;
    }

    for (const relativeCandidate of relativeRunnerCandidates) {
      const absolutePath = resolve(rootCandidate, relativeCandidate);
      if (existsSync(absolutePath) && statSafeIsFile(absolutePath)) {
        absoluteCandidates.push(absolutePath);
      }
    }
  }

  return unique([
    pluginConfig.runnerModule as string | undefined,
    ...absoluteCandidates,
    ...relativeRunnerCandidates.map((candidate) => `./${candidate}`),
  ]);
}

async function createHandler(api: any): Promise<OpenClawWebChatTaskHandler> {
  const pluginConfig = resolvePluginConfig(api);
  const stateDir =
    (pluginConfig.storageDir as string | undefined) ??
    join(api.config?.stateDir ?? ".openclaw", "task-orchestrator");
  const sessionDir =
    (pluginConfig.sessionDir as string | undefined) ??
    join(stateDir, "pi-sessions");
  const runner = await createRunnerFromModule({
    runnerModule: pluginConfig.runnerModule as string | undefined,
    runnerExport: pluginConfig.runnerExport as string | undefined,
    baseDir: resolveHostRootDir(api),
    candidateModules: buildRunnerModuleCandidates(api, pluginConfig),
  });

  return new OpenClawWebChatTaskHandler({
    runner,
    storageDir: stateDir,
    sessionDir,
    workspaceDir: resolveWorkspaceDir(api, pluginConfig),
    provider: pluginConfig.provider as string | undefined,
    model: pluginConfig.model as string | undefined,
    timeoutMs: pluginConfig.timeoutMs as number | undefined,
    previewPlanByDefault: pluginConfig.previewPlanByDefault as boolean | undefined,
    fallbackChatHandler: async (channelContext, message) => {
      if (typeof api.callGatewayMethod !== "function") {
        return message;
      }

      const configuredGatewayMethod =
        pluginConfig.fallbackGatewayMethod as string | undefined;
      const candidateMethods = configuredGatewayMethod
        ? [configuredGatewayMethod]
        : ["chat.send"];

      for (const gatewayMethod of candidateMethods) {
        try {
          const result = await api.callGatewayMethod(gatewayMethod, {
            channelContext,
            message,
          });
          if (typeof result === "string") {
            return result;
          }
          if (result && typeof result.text === "string") {
            return result.text;
          }
          return JSON.stringify(result);
        } catch (error) {
          api.logger?.debug?.(
            `[task-orchestrator] fallback gateway ${gatewayMethod} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      return message;
    },
    taskEventHandler: async (channelContext, payload) => {
      const gatewayMethod = pluginConfig.progressGatewayMethod as string | undefined;
      if (!gatewayMethod || typeof api.callGatewayMethod !== "function") {
        return;
      }

      await api.callGatewayMethod(gatewayMethod, {
        channelContext,
        text: payload.message,
        threadId: payload.threadId,
        eventType: payload.eventType,
      });
    },
    eventSink: {
      onEvent: ({ event, threadId }) => {
        api.logger?.debug?.(`[task-orchestrator:${threadId}] ${event.type}`);
      },
    },
  });
}

export default function register(api: any): void {
  let handlerPromise: Promise<OpenClawWebChatTaskHandler> | undefined;

  const getHandler = () => {
    if (!handlerPromise) {
      handlerPromise = createHandler(api);
    }
    return handlerPromise;
  };

  const buildChannelContext = (ctx: any) => ({
    channelConversationId: toConversationId(ctx),
    channelName: ctx.channel,
    userId: ctx.senderId,
  });

  const formatCommandError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  api.registerGatewayMethod("task-orchestrator.start", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const orchestrator = handler.getOrchestrator();
      const thread = await orchestrator.startTask(params.taskInput, params.channelContext);
      respond(true, { threadId: thread.threadId, status: thread.status });
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.resume", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const orchestrator = handler.getOrchestrator();
      const thread = await orchestrator.resumeTask(params.threadId, params.userInput);
      respond(true, { threadId: thread.threadId, status: thread.status });
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.pause", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const orchestrator = handler.getOrchestrator();
      const thread = await orchestrator.pauseTask(params.threadId);
      respond(true, { threadId: thread.threadId, status: thread.status });
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.cancel", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const orchestrator = handler.getOrchestrator();
      const thread = await orchestrator.cancelTask(params.threadId);
      respond(true, { threadId: thread.threadId, status: thread.status });
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.status", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const orchestrator = handler.getOrchestrator();
      const view = await orchestrator.getTaskStatus(
        params.threadId,
        params.view,
        params.nodeRef,
      );
      respond(true, view);
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.refine", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const orchestrator = handler.getOrchestrator();
      const thread = await orchestrator.refineTaskNode(
        params.threadId,
        params.instruction,
        params.nodeRef,
      );
      respond(true, { threadId: thread.threadId, status: thread.status });
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.retry", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const orchestrator = handler.getOrchestrator();
      const thread = await orchestrator.retryTaskNode(
        params.threadId,
        params.instruction,
        params.nodeRef,
      );
      respond(true, { threadId: thread.threadId, status: thread.status });
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.skip", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const orchestrator = handler.getOrchestrator();
      const thread = await orchestrator.skipTaskNode(
        params.threadId,
        params.nodeRef,
      );
      respond(true, { threadId: thread.threadId, status: thread.status });
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.route", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const result = await handler.handleMessage(params.channelContext, params.message);
      respond(true, result);
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerGatewayMethod("task-orchestrator.recover", async ({ params, respond }: any) => {
    try {
      const handler = await getHandler();
      const threads = await handler.recover(params);
      respond(
        true,
        threads.map((thread) => ({
          threadId: thread.threadId,
          status: thread.status,
          title: thread.title,
        })),
      );
    } catch (error) {
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.registerCommand({
    name: "task",
    description: "Control the task orchestrator. Example: /task start <goal>, /task status, /task tree, /task resume.",
    acceptsArgs: true,
    requireAuth: false,
    handler: async (ctx: any) => {
      try {
        const handler = await getHandler();
        const args = (ctx.args ?? "").trim();

        if (!args) {
          return {
            text: [
              "Task command help",
              "/task start <goal>",
              "/task status",
              "/task tree",
              "/task resume",
              "/task pause",
              "/task cancel",
              "/task refine <nodeRef> <instruction>",
              "/task retry [nodeRef] [instruction]",
              "/task skip [nodeRef]",
              "/task list",
            ].join("\n"),
          };
        }

        const result = await handler.handleMessage(
          buildChannelContext(ctx),
          `/task ${args}`,
        );
        return { text: result.text };
      } catch (error) {
        api.logger?.error?.(`[task-orchestrator] /task failed: ${formatCommandError(error)}`);
        return {
          text: `Task command failed: ${formatCommandError(error)}`,
        };
      }
    },
  });

  api.registerCommand({
    name: "taskstatus",
    description: "Show the active task summary for this sender.",
    requireAuth: false,
    handler: async (ctx: any) => {
      try {
        const handler = await getHandler();
        const orchestrator = handler.getOrchestrator();
        const channelConversationId = toConversationId(ctx);
        const channelState = await orchestrator.getChannelState(channelConversationId);
        if (!channelState?.activeThreadId) {
          return { text: "No active task." };
        }
        const view = await orchestrator.getTaskStatus(channelState.activeThreadId, "summary");
        return {
          text: [
            `Task: ${view.title}`,
            `Status: ${view.status}`,
            `Progress: ${view.progress.done}/${view.progress.total}`,
          ].join("\n"),
        };
      } catch (error) {
        api.logger?.error?.(`[task-orchestrator] /taskstatus failed: ${formatCommandError(error)}`);
        return {
          text: `Task status command failed: ${formatCommandError(error)}`,
        };
      }
    },
  });

  api.registerCommand({
    name: "taskroute",
    description: "Route a message through the task orchestrator for this sender.",
    acceptsArgs: true,
    requireAuth: false,
    handler: async (ctx: any) => {
      try {
        const handler = await getHandler();
        const result = await handler.handleMessage(
          buildChannelContext(ctx),
          ctx.args ?? "",
        );
        return { text: result.text };
      } catch (error) {
        api.logger?.error?.(`[task-orchestrator] /taskroute failed: ${formatCommandError(error)}`);
        return {
          text: `Task route command failed: ${formatCommandError(error)}`,
        };
      }
    },
  });

  api.registerService({
    id: "task-orchestrator",
    start: async () => {
      await getHandler();
      api.logger?.info?.("task-orchestrator ready");
    },
    stop: async () => {
      api.logger?.info?.("task-orchestrator stopped");
    },
  });
}
