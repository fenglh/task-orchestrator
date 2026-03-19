import { buildRefineNodePrompt } from "./build-refine-node-prompt.ts";
import { buildExecuteNodePrompt } from "./build-execute-node-prompt.ts";
import { buildFinalizePrompt } from "./build-finalize-prompt.ts";
import { buildPlanRootPrompt } from "./build-plan-root-prompt.ts";
import { parseJsonPayload } from "./extract-json.ts";
import type {
  ExecuteNodeInput,
  FinalizeInput,
  PlanRootInput,
  RefineNodeInput,
  TaskExecutionAdapter,
} from "../types/adapters.ts";
import type { ExpandResult, TaskDraft, TaskResult } from "../types/task-result.ts";
import type {
  OpenClawEventSink,
  OpenClawPromptResponse,
  OpenClawRuntime,
} from "./types.ts";

interface PlannedTasksPayload {
  tasks: TaskDraft[];
}

interface FinalizePayload {
  summary: string;
}

export interface OpenClawTaskExecutionAdapterOptions {
  runtime: OpenClawRuntime;
  eventSink?: OpenClawEventSink;
}

export class OpenClawTaskExecutionAdapter implements TaskExecutionAdapter {
  private readonly runtime: OpenClawRuntime;
  private readonly eventSink?: OpenClawEventSink;

  constructor(options: OpenClawTaskExecutionAdapterOptions) {
    this.runtime = options.runtime;
    this.eventSink = options.eventSink;
  }

  async planRoot(input: PlanRootInput): Promise<TaskDraft[]> {
    const response = await this.prompt(input.thread.threadId, input.thread.sessionId, {
      sessionId: input.thread.sessionId,
      channelContext: input.thread.channelContext,
      prompt: buildPlanRootPrompt(input),
      metadata: {
        taskKind: "plan_root",
      },
    });

    return parseJsonPayload<PlannedTasksPayload>(response.text).tasks;
  }

  async executeNode(input: ExecuteNodeInput): Promise<TaskResult> {
    const response = await this.prompt(input.thread.threadId, input.thread.sessionId, {
      sessionId: input.thread.sessionId,
      channelContext: input.thread.channelContext,
      prompt: buildExecuteNodePrompt(input),
      metadata: {
        taskKind: "execute_node",
        nodeId: input.node.id,
        nodePath: input.node.displayPath,
      },
    });

    return parseJsonPayload<TaskResult>(response.text);
  }

  async finalize(input: FinalizeInput): Promise<{ summary: string }> {
    const response = await this.prompt(input.thread.threadId, input.thread.sessionId, {
      sessionId: input.thread.sessionId,
      channelContext: input.thread.channelContext,
      prompt: buildFinalizePrompt(input),
      metadata: {
        taskKind: "finalize",
      },
    });

    return parseJsonPayload<FinalizePayload>(response.text);
  }

  async refineNode(input: RefineNodeInput): Promise<ExpandResult> {
    const response = await this.prompt(input.thread.threadId, input.thread.sessionId, {
      sessionId: input.thread.sessionId,
      channelContext: input.thread.channelContext,
      prompt: buildRefineNodePrompt(input),
      metadata: {
        taskKind: "refine_node",
        nodeId: input.node.id,
        nodePath: input.node.displayPath,
      },
    });

    return parseJsonPayload<ExpandResult>(response.text);
  }

  private async prompt(
    threadId: string,
    sessionId: string,
    request: {
      sessionId: string;
      channelContext?: PlanRootInput["thread"]["channelContext"];
      prompt: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<OpenClawPromptResponse> {
    await this.runtime.ensureSession({
      sessionId: request.sessionId,
      channelContext: request.channelContext,
    });
    const response = await this.runtime.prompt(request);

    if (response.events?.length && this.eventSink) {
      for (const event of response.events) {
        await this.eventSink.onEvent({
          threadId,
          sessionId,
          event,
        });
      }
    }

    return response;
  }
}
