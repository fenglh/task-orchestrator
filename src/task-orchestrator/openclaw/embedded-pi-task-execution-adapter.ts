import { join } from "node:path";
import { buildRefineNodePrompt } from "./build-refine-node-prompt.ts";
import { buildExecuteNodePrompt } from "./build-execute-node-prompt.ts";
import { buildFinalizePrompt } from "./build-finalize-prompt.ts";
import { buildPlanRootPrompt } from "./build-plan-root-prompt.ts";
import { parseJsonPayload } from "./extract-json.ts";
import type {
  OpenClawEmbeddedPiRunner,
  OpenClawEventSink,
  OpenClawSessionEvent,
} from "./types.ts";
import type {
  ExecuteNodeInput,
  FinalizeInput,
  PlanRootInput,
  RefineNodeInput,
  TaskExecutionAdapter,
} from "../types/adapters.ts";
import type { ExpandResult, TaskDraft, TaskResult } from "../types/task-result.ts";

interface PlannedTasksPayload {
  tasks: TaskDraft[];
}

interface FinalizePayload {
  summary: string;
}

export interface EmbeddedPiTaskExecutionAdapterOptions {
  runner: OpenClawEmbeddedPiRunner;
  sessionDir: string;
  workspaceDir: string;
  config?: unknown;
  provider?: string;
  model?: string;
  timeoutMs?: number;
  eventSink?: OpenClawEventSink;
}

export class EmbeddedPiTaskExecutionAdapter implements TaskExecutionAdapter {
  private readonly runner: OpenClawEmbeddedPiRunner;
  private readonly sessionDir: string;
  private readonly workspaceDir: string;
  private readonly config?: unknown;
  private readonly provider?: string;
  private readonly model?: string;
  private readonly timeoutMs?: number;
  private readonly eventSink?: OpenClawEventSink;

  constructor(options: EmbeddedPiTaskExecutionAdapterOptions) {
    this.runner = options.runner;
    this.sessionDir = options.sessionDir;
    this.workspaceDir = options.workspaceDir;
    this.config = options.config;
    this.provider = options.provider;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.eventSink = options.eventSink;
  }

  async planRoot(input: PlanRootInput): Promise<TaskDraft[]> {
    const result = await this.run(input.thread.threadId, input.thread.sessionId, {
      prompt: buildPlanRootPrompt(input),
      runIdSuffix: "plan-root",
    });

    return parseJsonPayload<PlannedTasksPayload>(result).tasks;
  }

  async executeNode(input: ExecuteNodeInput): Promise<TaskResult> {
    const result = await this.run(input.thread.threadId, input.thread.sessionId, {
      prompt: buildExecuteNodePrompt(input),
      runIdSuffix: `execute-${input.node.id}`,
    });

    return parseJsonPayload<TaskResult>(result);
  }

  async finalize(input: FinalizeInput): Promise<{ summary: string }> {
    const result = await this.run(input.thread.threadId, input.thread.sessionId, {
      prompt: buildFinalizePrompt(input),
      runIdSuffix: "finalize",
    });

    return parseJsonPayload<FinalizePayload>(result);
  }

  async refineNode(input: RefineNodeInput): Promise<ExpandResult> {
    const result = await this.run(input.thread.threadId, input.thread.sessionId, {
      prompt: buildRefineNodePrompt(input),
      runIdSuffix: `refine-${input.node.id}`,
    });

    return parseJsonPayload<ExpandResult>(result);
  }

  private async run(
    threadId: string,
    sessionId: string,
    input: {
      prompt: string;
      runIdSuffix: string;
    },
  ): Promise<string> {
    let lastBlockText = "";

    const result = await this.runner.runEmbeddedPiAgent({
      sessionId,
      sessionKey: sessionId,
      sessionFile: join(this.sessionDir, `${sessionId}.jsonl`),
      workspaceDir: this.workspaceDir,
      config: this.config,
      prompt: input.prompt,
      provider: this.provider,
      model: this.model,
      timeoutMs: this.timeoutMs,
      runId: `${threadId}:${input.runIdSuffix}`,
      onBlockReply: async (payload) => {
        lastBlockText = payload.text;
      },
      onPartialReply: async (text) => {
        await this.emitEvent(threadId, sessionId, {
          type: "message_update",
          payload: { text },
        });
      },
      onAgentEvent: async (event) => {
        await this.emitEvent(threadId, sessionId, event);
      },
    });

    return result.text ?? lastBlockText;
  }

  private async emitEvent(
    threadId: string,
    sessionId: string,
    event: OpenClawSessionEvent,
  ): Promise<void> {
    if (!this.eventSink) {
      return;
    }

    await this.eventSink.onEvent({
      threadId,
      sessionId,
      event,
    });
  }
}
