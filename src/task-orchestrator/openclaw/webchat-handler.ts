import {
  createPersistentTaskOrchestrator,
  createTaskOrchestrator,
  type TaskOrchestrator,
} from "../index.ts";
import type { ChannelContext } from "../types/channel-state.ts";
import { EmbeddedPiTaskExecutionAdapter } from "./embedded-pi-task-execution-adapter.ts";
import type {
  OpenClawEmbeddedPiRunner,
  OpenClawEventSink,
} from "./types.ts";

export interface OpenClawWebChatTaskHandlerOptions {
  runner: OpenClawEmbeddedPiRunner;
  eventSink?: OpenClawEventSink;
  storageDir?: string;
  sessionDir?: string;
  workspaceDir: string;
  config?: unknown;
  provider?: string;
  model?: string;
  timeoutMs?: number;
  previewPlanByDefault?: boolean;
  fallbackChatHandler?: (
    channelContext: ChannelContext,
    message: string,
  ) => Promise<string>;
  taskEventHandler?: (
    channelContext: ChannelContext,
    payload: { threadId: string; eventType: string; message: string },
  ) => Promise<void>;
}

export class OpenClawWebChatTaskHandler {
  private readonly orchestrator: TaskOrchestrator;

  constructor(options: OpenClawWebChatTaskHandlerOptions) {
    const adapter = new EmbeddedPiTaskExecutionAdapter({
      runner: options.runner,
      eventSink: options.eventSink,
      sessionDir: options.sessionDir ?? options.storageDir ?? ".openclaw-sessions",
      workspaceDir: options.workspaceDir,
      config: options.config,
      provider: options.provider,
      model: options.model,
      timeoutMs: options.timeoutMs,
    });

    this.orchestrator = options.storageDir
      ? createPersistentTaskOrchestrator(options.storageDir, {
          adapter,
          previewPlanByDefault: options.previewPlanByDefault,
          fallbackChatHandler: options.fallbackChatHandler,
          publishTaskEvent: async (thread, event) => {
            await options.taskEventHandler?.(thread.channelContext, {
              threadId: thread.threadId,
              eventType: event.type,
              message: event.message,
            });
          },
        })
      : createTaskOrchestrator({
          adapter,
          previewPlanByDefault: options.previewPlanByDefault,
          fallbackChatHandler: options.fallbackChatHandler,
          publishTaskEvent: async (thread, event) => {
            await options.taskEventHandler?.(thread.channelContext, {
              threadId: thread.threadId,
              eventType: event.type,
              message: event.message,
            });
          },
        });
  }

  async handleMessage(channelContext: ChannelContext, message: string) {
    return this.orchestrator.routeWebChatMessage(channelContext, message);
  }

  async recover(options?: { resumeRunning?: boolean }) {
    return this.orchestrator.recoverTasks(options);
  }

  getOrchestrator(): TaskOrchestrator {
    return this.orchestrator;
  }
}
