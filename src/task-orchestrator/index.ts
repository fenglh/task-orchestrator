import { routeMessage } from "./chat-router/route-message.ts";
import { InMemoryChannelStateRepository } from "./state/channel-state-repo.ts";
import type { ChannelStateRepository } from "./state/channel-state-repo.ts";
import { FileChannelStateRepository } from "./state/file-channel-state-repo.ts";
import { FileTaskThreadRepository } from "./state/file-task-thread-repo.ts";
import {
  InMemoryTaskThreadRepository,
  type TaskThreadRepository,
} from "./state/task-thread-repo.ts";
import { defaultTaskGuards, type TaskGuards } from "./state/guards.ts";
import {
  appendChildTasks,
  cancelNodeSubtree,
  createRevisionNode,
  createTaskThread,
  findNodeByRef,
} from "./state/task-tree.ts";
import { projectTaskStatusView } from "./state/status-projection.ts";
import { emitTaskEvent } from "./ui-status/emit-task-event.ts";
import type { ChannelContext, ChannelState } from "./types/channel-state.ts";
import type { TaskExecutionAdapter } from "./types/adapters.ts";
import type {
  TaskNodeDetailView,
  TaskStatusView,
  TaskSummaryView,
  TaskTreeView,
} from "./types/task-status-view.ts";
import type { TaskEventPublisher, TaskThread } from "./types/task-thread.ts";
import { runLoop } from "./runner/run-loop.ts";
import { nowIso } from "./utils/time.ts";

export interface TaskOrchestratorOptions {
  adapter: TaskExecutionAdapter;
  taskThreadRepo?: TaskThreadRepository;
  channelStateRepo?: ChannelStateRepository;
  guards?: Partial<TaskGuards>;
  now?: () => string;
  previewPlanByDefault?: boolean;
  fallbackChatHandler?: (
    channelContext: ChannelContext,
    message: string,
  ) => Promise<string>;
  publishTaskEvent?: TaskEventPublisher;
}

export interface RecoverTasksOptions {
  resumeRunning?: boolean;
}

function normalizeTaskInput(taskInput: string): {
  title: string;
  goal: string;
  successCriteria: string;
} {
  const compact = taskInput.trim();

  return {
    title: compact,
    goal: compact,
    successCriteria: "Complete the requested task and provide a verifiable result.",
  };
}

export class TaskOrchestrator {
  readonly adapter: TaskExecutionAdapter;
  readonly taskThreadRepo: TaskThreadRepository;
  readonly channelStateRepo: ChannelStateRepository;
  readonly guards: TaskGuards;
  readonly now: () => string;
  readonly previewPlanByDefault: boolean;
  readonly fallbackChatHandler?: (
    channelContext: ChannelContext,
    message: string,
  ) => Promise<string>;
  readonly publishTaskEvent?: TaskEventPublisher;

  constructor(options: TaskOrchestratorOptions) {
    this.adapter = options.adapter;
    this.taskThreadRepo =
      options.taskThreadRepo ?? new InMemoryTaskThreadRepository();
    this.channelStateRepo =
      options.channelStateRepo ?? new InMemoryChannelStateRepository();
    this.guards = {
      ...defaultTaskGuards,
      ...options.guards,
    };
    this.now = options.now ?? nowIso;
    this.previewPlanByDefault = options.previewPlanByDefault ?? true;
    this.fallbackChatHandler = options.fallbackChatHandler;
    this.publishTaskEvent = options.publishTaskEvent;
  }

  async getThread(threadId: string): Promise<TaskThread | undefined> {
    return this.taskThreadRepo.get(threadId);
  }

  async getChannelState(
    channelConversationId: string,
  ): Promise<ChannelState | undefined> {
    return this.channelStateRepo.get(channelConversationId);
  }

  async startTask(
    taskInput: string,
    channelContext: ChannelContext,
  ): Promise<TaskThread> {
    const now = this.now();
    const normalized = normalizeTaskInput(taskInput);
    const thread = createTaskThread({
      ...normalized,
      channelContext,
      now,
      maxAutoAdvanceSteps: this.guards.maxAutoAdvanceSteps,
      previewPlan: this.previewPlanByDefault,
    });

    await emitTaskEvent(thread, {
      type: "task_started",
      message: `Started task: ${thread.title}`,
      timestamp: now,
    }, this.publishTaskEvent);

    await this.taskThreadRepo.save(thread);
    await this.channelStateRepo.save({
      channelConversationId: channelContext.channelConversationId,
      mode: "task",
      activeThreadId: thread.threadId,
      awaitingInputThreadId: undefined,
      pendingTaskInput: undefined,
      latestRenderedMessage: thread.latestUserVisibleSummary,
      createdAt: now,
      updatedAt: now,
    });

    return this.run(thread);
  }

  async resumeTask(
    threadId: string,
    userInput?: string,
  ): Promise<TaskThread> {
    const thread = await this.requireThread(threadId);
    const wasAwaitingPlanConfirmation =
      thread.status === "awaiting_plan_confirmation" ||
      (thread.previewPlan && !thread.planConfirmed);
    thread.pauseRequested = false;
    thread.cancelRequested = false;
    if (wasAwaitingPlanConfirmation) {
      thread.planConfirmed = true;
    }
    thread.status = "running";
    if (thread.blocked) {
      const blockedNode = thread.nodes[thread.blocked.nodeId];
      if (blockedNode) {
        blockedNode.status = "pending";
        blockedNode.pendingResumeInput = userInput?.trim() || blockedNode.pendingResumeInput;
      }
      thread.blocked = undefined;
    }

    await emitTaskEvent(thread, {
      type: "task_resumed",
      message: "Task resumed.",
      timestamp: this.now(),
    }, this.publishTaskEvent);

    await this.taskThreadRepo.save(thread);
    await this.updateChannelState(thread.channelConversationId, {
      mode: "task",
      activeThreadId: thread.threadId,
      awaitingInputThreadId: undefined,
    });

    return this.run(thread);
  }

  async confirmTaskFinish(threadId: string): Promise<TaskThread> {
    const thread = await this.requireThread(threadId);
    if (thread.status !== "awaiting_finish_confirmation") {
      throw new Error("Task is not waiting for finish confirmation");
    }

    thread.status = "running";
    thread.phase = "finalizing";
    thread.updatedAt = this.now();

    await this.taskThreadRepo.save(thread);
    await this.updateChannelState(thread.channelConversationId, {
      mode: "task",
      activeThreadId: thread.threadId,
      awaitingInputThreadId: undefined,
    });

    return this.run(thread);
  }

  async pauseTask(threadId: string): Promise<TaskThread> {
    const thread = await this.requireThread(threadId);
    thread.pauseRequested = true;
    thread.updatedAt = this.now();
    await this.taskThreadRepo.save(thread);
    return this.run(thread);
  }

  async cancelTask(threadId: string): Promise<TaskThread> {
    const thread = await this.requireThread(threadId);
    thread.cancelRequested = true;
    thread.updatedAt = this.now();
    await this.taskThreadRepo.save(thread);
    const updated = await this.run(thread);
    await this.updateChannelState(thread.channelConversationId, {
      mode: "chat",
      activeThreadId: undefined,
      awaitingInputThreadId: undefined,
    });
    return updated;
  }

  async getTaskStatus(
    threadId: string,
    view: "summary",
  ): Promise<TaskSummaryView>;
  async getTaskStatus(
    threadId: string,
    view: "tree",
  ): Promise<TaskTreeView>;
  async getTaskStatus(
    threadId: string,
    view: "node",
    nodeRef: string,
  ): Promise<TaskNodeDetailView>;
  async getTaskStatus(
    threadId: string,
    view: "summary" | "tree" | "node" = "summary",
    nodeRef?: string,
  ): Promise<TaskStatusView> {
    const thread = await this.requireThread(threadId);
    return projectTaskStatusView(thread, view, nodeRef);
  }

  async listTasks(channelConversationId?: string): Promise<TaskThread[]> {
    if (channelConversationId) {
      return this.taskThreadRepo.listByConversation(channelConversationId);
    }

    return this.taskThreadRepo.list();
  }

  async resolveThreadId(
    channelConversationId: string,
    idOrPrefix: string,
  ): Promise<string | undefined> {
    const exact = await this.taskThreadRepo.get(idOrPrefix);
    if (exact) return exact.threadId;

    const threads = await this.listTasks(channelConversationId);
    const matches = threads.filter((thread) => thread.threadId.startsWith(idOrPrefix));
    if (matches.length === 1) return matches[0].threadId;
    if (matches.length > 1) {
      throw new Error(`Task id is ambiguous: ${idOrPrefix}`);
    }
    return undefined;
  }

  async stagePendingTask(
    channelContext: ChannelContext,
    taskInput: string,
  ): Promise<void> {
    const existing = await this.getChannelState(channelContext.channelConversationId);
    await this.updateChannelState(channelContext.channelConversationId, {
      mode: existing?.mode ?? "chat",
      activeThreadId: existing?.activeThreadId,
      awaitingInputThreadId: existing?.awaitingInputThreadId,
      pendingTaskInput: taskInput,
      latestRenderedMessage: "Pending task confirmation.",
    });
  }

  async clearPendingTask(channelContext: ChannelContext): Promise<void> {
    await this.updateChannelState(channelContext.channelConversationId, {
      pendingTaskInput: undefined,
      latestRenderedMessage: "Pending task cleared.",
    });
  }

  async updatePendingTask(
    channelContext: ChannelContext,
    taskInput: string,
  ): Promise<void> {
    await this.updateChannelState(channelContext.channelConversationId, {
      pendingTaskInput: taskInput,
      latestRenderedMessage: "Pending task updated.",
    });
  }

  async recoverTasks(options: RecoverTasksOptions = {}): Promise<TaskThread[]> {
    const threads = await this.taskThreadRepo.list();
    const recovered: TaskThread[] = [];

    for (const thread of threads) {
      if (thread.status === "running" && options.resumeRunning) {
        recovered.push(await this.run(thread));
        continue;
      }

      recovered.push(thread);
    }

    return recovered;
  }

  async refineTaskNode(
    threadId: string,
    instruction: string,
    nodeRef?: string,
  ): Promise<TaskThread> {
    const thread = await this.requireThread(threadId);
    if (thread.status === "finished" || thread.status === "cancelled") {
      throw new Error("Cannot refine a finished or cancelled task");
    }

    const targetNode = nodeRef
      ? findNodeByRef(thread, nodeRef)
      : thread.activeNodeId
        ? thread.nodes[thread.activeNodeId]
        : undefined;
    if (!targetNode) {
      throw new Error("No task node available to refine");
    }

    const isCompletedNode = targetNode.status === "done";
    const result = await this.adapter.refineNode({
      thread,
      node: targetNode,
      instruction,
    });

    const refinementContainer = isCompletedNode
      ? createRevisionNode(thread, targetNode.id)
      : targetNode;

    if (!isCompletedNode) {
      cancelNodeSubtree(thread, targetNode.id);
      targetNode.status = "waiting_children";
      targetNode.userVisibleSummary = result.reason;
      targetNode.needsResume = result.mode === "suspend";
      targetNode.pendingResumeInput = undefined;
    } else {
      refinementContainer.status = "waiting_children";
      refinementContainer.userVisibleSummary = result.reason;
      refinementContainer.needsResume = result.mode === "suspend";
    }

    if (thread.blocked?.nodeId === targetNode.id || thread.blocked?.nodeId === refinementContainer.id) {
      thread.blocked = undefined;
    }
    appendChildTasks(thread, refinementContainer.id, result.newTasks);
    thread.status = "paused";
    thread.activeNodeId = undefined;
    thread.updatedAt = this.now();
    await emitTaskEvent(thread, {
      type: "task_paused",
      message: isCompletedNode
        ? `Created revision ${refinementContainer.displayPath} for ${targetNode.displayPath} ${targetNode.title} with ${result.newTasks.length} child task(s). Review the task tree, then resume to continue.`
        : `Refined ${targetNode.displayPath} ${targetNode.title} into ${result.newTasks.length} child task(s). Review the task tree, then resume to continue.`,
      timestamp: thread.updatedAt,
    }, this.publishTaskEvent);
    await this.taskThreadRepo.save(thread);
    await this.updateChannelState(thread.channelConversationId, {
      mode: "task",
      activeThreadId: thread.threadId,
      awaitingInputThreadId: undefined,
      pendingTaskInput: undefined,
    });
    return thread;
  }

  async retryTaskNode(
    threadId: string,
    instruction?: string,
    nodeRef?: string,
  ): Promise<TaskThread> {
    const thread = await this.requireThread(threadId);
    const targetNode = nodeRef
      ? findNodeByRef(thread, nodeRef)
      : thread.activeNodeId
        ? thread.nodes[thread.activeNodeId]
        : undefined;

    if (!targetNode) {
      throw new Error("No failed node available to retry");
    }

    if (targetNode.status !== "failed") {
      throw new Error("Target node is not failed");
    }

    targetNode.status = "pending";
    targetNode.pendingResumeInput = instruction?.trim() || undefined;
    targetNode.finishedAt = undefined;
    targetNode.report = undefined;
    thread.status = "running";
    thread.updatedAt = this.now();
    await emitTaskEvent(thread, {
      type: "task_resumed",
      message: `Retrying ${targetNode.displayPath} ${targetNode.title}.`,
      timestamp: thread.updatedAt,
    }, this.publishTaskEvent);
    await this.taskThreadRepo.save(thread);
    return this.run(thread);
  }

  async skipTaskNode(
    threadId: string,
    nodeRef?: string,
  ): Promise<TaskThread> {
    const thread = await this.requireThread(threadId);
    const targetNode = nodeRef
      ? findNodeByRef(thread, nodeRef)
      : thread.activeNodeId
        ? thread.nodes[thread.activeNodeId]
        : undefined;

    if (!targetNode) {
      throw new Error("No node available to skip");
    }

    targetNode.status = "cancelled";
    targetNode.finishedAt = this.now();
    thread.status = "running";
    thread.updatedAt = this.now();
    await emitTaskEvent(thread, {
      type: "task_progress",
      message: `Skipped ${targetNode.displayPath} ${targetNode.title}.`,
      timestamp: thread.updatedAt,
    }, this.publishTaskEvent);
    await this.taskThreadRepo.save(thread);
    return this.run(thread);
  }

  async routeWebChatMessage(
    channelContext: ChannelContext,
    message: string,
  ) {
    return routeMessage(this, { channelContext, message });
  }

  async fallbackToDefaultChat(
    channelContext: ChannelContext,
    message: string,
  ): Promise<string> {
    if (this.fallbackChatHandler) {
      return this.fallbackChatHandler(channelContext, message);
    }

    return message;
  }

  async setActiveTask(
    channelContext: ChannelContext,
    threadId: string,
  ): Promise<void> {
    const thread = await this.requireThread(threadId);
    await this.updateChannelState(channelContext.channelConversationId, {
      mode: "task",
      activeThreadId: thread.threadId,
      awaitingInputThreadId: thread.status === "waiting_human" ? thread.threadId : undefined,
    });
  }

  async deleteTask(
    channelConversationId: string,
    threadId: string,
  ): Promise<void> {
    const thread = await this.requireThread(threadId);
    await this.taskThreadRepo.delete(threadId);
    const channelState = await this.getChannelState(channelConversationId);
    if (channelState?.activeThreadId === threadId || channelState?.awaitingInputThreadId === threadId) {
      await this.updateChannelState(channelConversationId, {
        mode: "chat",
        activeThreadId: undefined,
        awaitingInputThreadId: undefined,
      });
    }
    if (thread.channelConversationId !== channelConversationId) {
      const ownerState = await this.getChannelState(thread.channelConversationId);
      if (ownerState?.activeThreadId === threadId || ownerState?.awaitingInputThreadId === threadId) {
        await this.updateChannelState(thread.channelConversationId, {
          mode: "chat",
          activeThreadId: undefined,
          awaitingInputThreadId: undefined,
        });
      }
    }
  }

  private async run(thread: TaskThread): Promise<TaskThread> {
    const updatedThread = await runLoop(
      {
        adapter: this.adapter,
        taskThreadRepo: this.taskThreadRepo,
        channelStateRepo: this.channelStateRepo,
        guards: this.guards,
        publishTaskEvent: this.publishTaskEvent,
        now: this.now,
      },
      thread,
    );

    await this.taskThreadRepo.save(updatedThread);
    await this.updateChannelState(updatedThread.channelConversationId, {
      mode: updatedThread.status === "finished" || updatedThread.status === "cancelled" ? "chat" : "task",
      activeThreadId:
        updatedThread.status === "finished" || updatedThread.status === "cancelled"
          ? undefined
          : updatedThread.threadId,
      awaitingInputThreadId:
        updatedThread.status === "waiting_human" ? updatedThread.threadId : undefined,
      pendingTaskInput: undefined,
    });
    return updatedThread;
  }

  private async requireThread(threadId: string): Promise<TaskThread> {
    const thread = await this.taskThreadRepo.get(threadId);
    if (!thread) {
      throw new Error(`Task thread not found: ${threadId}`);
    }

    return thread;
  }

  private async updateChannelState(
    channelConversationId: string,
    patch: Partial<ChannelState>,
  ): Promise<void> {
    const existing = await this.channelStateRepo.get(channelConversationId);
    const now = this.now();

    await this.channelStateRepo.save({
      channelConversationId,
      mode: patch.mode ?? existing?.mode ?? "chat",
      activeThreadId:
        "activeThreadId" in patch
          ? patch.activeThreadId
          : existing?.activeThreadId,
      awaitingInputThreadId:
        "awaitingInputThreadId" in patch
          ? patch.awaitingInputThreadId
          : existing?.awaitingInputThreadId,
      latestRenderedMessage:
        "latestRenderedMessage" in patch
          ? patch.latestRenderedMessage
          : existing?.latestRenderedMessage,
      pendingTaskInput:
        "pendingTaskInput" in patch
          ? patch.pendingTaskInput
          : existing?.pendingTaskInput,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }
}

export function createTaskOrchestrator(
  options: TaskOrchestratorOptions,
): TaskOrchestrator {
  return new TaskOrchestrator(options);
}

export function createPersistentTaskOrchestrator(
  storageDir: string,
  options: Omit<TaskOrchestratorOptions, "taskThreadRepo" | "channelStateRepo">,
): TaskOrchestrator {
  return new TaskOrchestrator({
    ...options,
    taskThreadRepo: new FileTaskThreadRepository(storageDir),
    channelStateRepo: new FileChannelStateRepository(storageDir),
  });
}

export function resolveTaskNodeRef(thread: TaskThread, nodeRef: string): string {
  const node = findNodeByRef(thread, nodeRef);
  if (!node) {
    throw new Error(`Task node not found: ${nodeRef}`);
  }
  return node.id;
}
