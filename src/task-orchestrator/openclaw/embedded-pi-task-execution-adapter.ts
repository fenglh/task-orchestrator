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
  RuntimeEvidenceSnapshot,
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

function extractPathFromMeta(meta: string): string | undefined {
  const match = meta.match(/(?:from|to)\s+([^()]+?)(?:\s*\(|$)/i);
  return match?.[1]?.trim();
}

function extractCommandFromMeta(meta: string): string | undefined {
  const [head] = meta.split(/\s+\(in\s+/i, 1);
  return head?.trim() || meta.trim() || undefined;
}

function summarizeRuntimeEvidence(events: OpenClawSessionEvent[]): RuntimeEvidenceSnapshot {
  const toolCalls = new Set<string>();
  const modifiedArtifacts = new Set<string>();
  const commandLabels = new Set<string>();

  for (const event of events) {
    const record = event as Record<string, unknown>;
    const data = (record.data ?? event.payload ?? {}) as Record<string, unknown>;
    const stream = typeof record.stream === "string" ? record.stream : undefined;
    const eventType = typeof event.type === "string" ? event.type : undefined;

    const toolName = typeof data.name === "string"
      ? data.name
      : typeof data.tool === "string"
        ? data.tool
        : typeof data.toolName === "string"
          ? data.toolName
          : undefined;

    if (
      stream === "tool" ||
      eventType === "tool_execution_start" ||
      eventType === "tool_execution_end"
    ) {
      if (toolName) toolCalls.add(toolName);

      const path = typeof data.path === "string"
        ? data.path
        : typeof data.file_path === "string"
          ? data.file_path
          : typeof data.meta === "string"
            ? extractPathFromMeta(data.meta)
            : undefined;
      if (path) modifiedArtifacts.add(path);

      const command = typeof data.command === "string"
        ? data.command
        : toolName === "exec" && typeof data.meta === "string"
          ? extractCommandFromMeta(data.meta)
          : undefined;
      if (command) commandLabels.add(command);
    }
  }

  return {
    toolCalls: [...toolCalls],
    modifiedArtifacts: [...modifiedArtifacts],
    commandLabels: [...commandLabels],
  };
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
  readonly workspaceDir: string;
  private readonly config?: unknown;
  private readonly provider?: string;
  private readonly model?: string;
  private readonly timeoutMs?: number;
  private readonly eventSink?: OpenClawEventSink;
  private readonly runtimeEvidence = new Map<string, RuntimeEvidenceSnapshot>();

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

  consumeRuntimeEvidence(nodeId: string): RuntimeEvidenceSnapshot | undefined {
    const snapshot = this.runtimeEvidence.get(nodeId);
    this.runtimeEvidence.delete(nodeId);
    return snapshot;
  }

  async planRoot(input: PlanRootInput): Promise<TaskDraft[]> {
    const result = await this.run(input.thread.threadId, input.thread.sessionId, {
      prompt: buildPlanRootPrompt(input),
      runIdSuffix: "plan-root",
    });

    return parseJsonPayload<PlannedTasksPayload>(result.text).tasks;
  }

  async executeNode(input: ExecuteNodeInput): Promise<TaskResult> {
    const result = await this.run(input.thread.threadId, input.thread.sessionId, {
      prompt: buildExecuteNodePrompt(input),
      runIdSuffix: `execute-${input.node.id}`,
    });

    this.runtimeEvidence.set(input.node.id, summarizeRuntimeEvidence(result.events));
    return parseJsonPayload<TaskResult>(result.text);
  }

  async finalize(input: FinalizeInput): Promise<{ summary: string }> {
    const result = await this.run(input.thread.threadId, input.thread.sessionId, {
      prompt: buildFinalizePrompt(input),
      runIdSuffix: "finalize",
    });

    return parseJsonPayload<FinalizePayload>(result.text);
  }

  async refineNode(input: RefineNodeInput): Promise<ExpandResult> {
    const result = await this.run(input.thread.threadId, input.thread.sessionId, {
      prompt: buildRefineNodePrompt(input),
      runIdSuffix: `refine-${input.node.id}`,
    });

    return parseJsonPayload<ExpandResult>(result.text);
  }

  private async run(
    threadId: string,
    sessionId: string,
    input: {
      prompt: string;
      runIdSuffix: string;
    },
  ): Promise<{ text: string; events: OpenClawSessionEvent[] }> {
    let lastBlockText = "";
    const capturedEvents: OpenClawSessionEvent[] = [];

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
        capturedEvents.push(event);
        await this.emitEvent(threadId, sessionId, event);
      },
    });

    return { text: result.text ?? lastBlockText, events: capturedEvents };
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
