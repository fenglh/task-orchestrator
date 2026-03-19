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
  RuntimeEvidenceSnapshot,
} from "./types.ts";

interface PlannedTasksPayload {
  tasks: TaskDraft[];
}

interface FinalizePayload {
  summary: string;
}

function summarizeRuntimeEvidence(events?: OpenClawPromptResponse["events"]): RuntimeEvidenceSnapshot {
  const toolCalls = new Set<string>();
  const modifiedArtifacts = new Set<string>();
  const commandLabels = new Set<string>();

  for (const event of events ?? []) {
    if (event.type === "tool_execution_start" || event.type === "tool_execution_end") {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const toolName = typeof payload.tool === "string"
        ? payload.tool
        : typeof payload.toolName === "string"
          ? payload.toolName
          : undefined;
      if (toolName) toolCalls.add(toolName);

      const path = typeof payload.path === "string"
        ? payload.path
        : typeof payload.file_path === "string"
          ? payload.file_path
          : undefined;
      if (path) modifiedArtifacts.add(path);

      const command = typeof payload.command === "string" ? payload.command : undefined;
      if (command) commandLabels.add(command);
    }
  }

  return {
    toolCalls: [...toolCalls],
    modifiedArtifacts: [...modifiedArtifacts],
    commandLabels: [...commandLabels],
  };
}

export interface OpenClawTaskExecutionAdapterOptions {
  runtime: OpenClawRuntime;
  eventSink?: OpenClawEventSink;
}

export class OpenClawTaskExecutionAdapter implements TaskExecutionAdapter {
  readonly workspaceDir?: string;
  private readonly runtime: OpenClawRuntime;
  private readonly eventSink?: OpenClawEventSink;
  private readonly runtimeEvidence = new Map<string, RuntimeEvidenceSnapshot>();

  constructor(options: OpenClawTaskExecutionAdapterOptions) {
    this.runtime = options.runtime;
    this.eventSink = options.eventSink;
    this.workspaceDir = options.workspaceDir;
  }

  consumeRuntimeEvidence(nodeId: string): RuntimeEvidenceSnapshot | undefined {
    const snapshot = this.runtimeEvidence.get(nodeId);
    this.runtimeEvidence.delete(nodeId);
    return snapshot;
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

    this.runtimeEvidence.set(input.node.id, summarizeRuntimeEvidence(response.events));
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
