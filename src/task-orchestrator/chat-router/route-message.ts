import { classifyWaitingHumanMessage } from "./classify-waiting-human-message.ts";
import { renderBlockedMessage } from "../ui-status/render-blocked-message.ts";
import { renderNodeDetail } from "../ui-status/render-node-detail.ts";
import { renderFailedHelp } from "../ui-status/render-failed-help.ts";
import { renderPlanPreview } from "../ui-status/render-plan-preview.ts";
import { renderTaskSummary } from "../ui-status/render-task-summary.ts";
import { renderTaskTree } from "../ui-status/render-task-tree.ts";
import { renderWaitingHumanHelp } from "../ui-status/render-waiting-human-help.ts";
import type { TaskOrchestrator } from "../index.ts";
import type { ChannelContext } from "../types/channel-state.ts";
import type { TaskThread } from "../types/task-thread.ts";
import { detectTaskIntent } from "./detect-task-intent.ts";
import { parseTaskCommand } from "./command-parser.ts";
import { resolveActiveThreadId } from "./resolve-active-thread.ts";
import type { RouteResult } from "./route-result.ts";

export interface RouteMessageInput {
  channelContext: ChannelContext;
  message: string;
}

async function renderThreadResponse(
  orchestrator: TaskOrchestrator,
  thread: TaskThread,
): Promise<string> {
  if (thread.status === "awaiting_plan_confirmation") {
    return renderPlanPreview(
      await orchestrator.getTaskStatus(thread.threadId, "tree"),
    );
  }

  if (thread.status === "waiting_human") {
    return renderBlockedMessage(thread);
  }

  if (thread.status === "failed") {
    return renderFailedHelp(thread);
  }

  return renderTaskSummary(
    await orchestrator.getTaskStatus(thread.threadId, "summary"),
  );
}

async function getRecentThread(
  orchestrator: TaskOrchestrator,
  channelConversationId: string,
): Promise<TaskThread | undefined> {
  const threads = await orchestrator.listTasks(channelConversationId);
  return [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function noRecentTaskText(): string {
  return "当前会话里还没有任务。";
}

function recentThreadHint(thread: TaskThread): string {
  return [
    "当前没有进行中的任务。",
    `下面展示最近一条任务：${thread.title}`,
  ].join("\n");
}

export async function routeMessage(
  orchestrator: TaskOrchestrator,
  input: RouteMessageInput,
): Promise<RouteResult> {
  const command = parseTaskCommand(input.message);
  const channelState = await orchestrator.getChannelState(
    input.channelContext.channelConversationId,
  );
  const activeThreadId = resolveActiveThreadId(channelState);

  if (command) {
    switch (command.name) {
      case "start": {
        const thread = await orchestrator.startTask(command.payload, input.channelContext);
        return {
          mode: "task",
          text: await renderThreadResponse(orchestrator, thread),
          threadId: thread.threadId,
        };
      }
      case "status": {
        const targetThread = activeThreadId
          ? await orchestrator.getThread(activeThreadId)
          : await getRecentThread(orchestrator, input.channelContext.channelConversationId);
        if (!targetThread) {
          return { mode: "chat", text: noRecentTaskText() };
        }
        const view = await orchestrator.getTaskStatus(targetThread.threadId, "summary");
        const prefix = activeThreadId ? undefined : recentThreadHint(targetThread);
        return {
          mode: "task",
          text: prefix ? `${prefix}\n\n${renderTaskSummary(view)}` : renderTaskSummary(view),
          threadId: targetThread.threadId,
        };
      }
      case "tree": {
        const targetThread = activeThreadId
          ? await orchestrator.getThread(activeThreadId)
          : await getRecentThread(orchestrator, input.channelContext.channelConversationId);
        if (!targetThread) {
          return { mode: "chat", text: noRecentTaskText() };
        }
        const view = await orchestrator.getTaskStatus(targetThread.threadId, "tree");
        const prefix = activeThreadId ? undefined : recentThreadHint(targetThread);
        return {
          mode: "task",
          text: prefix ? `${prefix}\n\n${renderTaskTree(view)}` : renderTaskTree(view),
          threadId: targetThread.threadId,
        };
      }
      case "node": {
        const targetThread = activeThreadId
          ? await orchestrator.getThread(activeThreadId)
          : await getRecentThread(orchestrator, input.channelContext.channelConversationId);
        if (!targetThread) {
          return { mode: "chat", text: noRecentTaskText() };
        }
        const view = await orchestrator.getTaskStatus(
          targetThread.threadId,
          "node",
          command.nodeRef,
        );
        const prefix = activeThreadId ? undefined : recentThreadHint(targetThread);
        return {
          mode: "task",
          text: prefix ? `${prefix}\n\n${renderNodeDetail(view)}` : renderNodeDetail(view),
          threadId: targetThread.threadId,
        };
      }
      case "use": {
        await orchestrator.setActiveTask(input.channelContext, command.threadId);
        const view = await orchestrator.getTaskStatus(command.threadId, "summary");
        return { mode: "task", text: renderTaskSummary(view), threadId: command.threadId };
      }
      case "edit": {
        await orchestrator.updatePendingTask(input.channelContext, command.payload);
        return {
          mode: "chat",
          text:
            "已更新待启动任务草稿。回复 `确认开始任务` 即可启动，回复 `取消待启动任务` 可放弃。",
        };
      }
      case "discard": {
        await orchestrator.clearPendingTask(input.channelContext);
        return {
          mode: "chat",
          text: "已丢弃待启动任务草稿。",
        };
      }
      case "refine": {
        if (!activeThreadId) {
          return { mode: "chat", text: "当前没有进行中的任务。" };
        }
        const thread = await orchestrator.refineTaskNode(
          activeThreadId,
          command.instruction || "请把这个节点细化成更小、可执行的子任务。",
          command.nodeRef,
        );
        const tree = await orchestrator.getTaskStatus(thread.threadId, "tree");
        return {
          mode: "task",
          text: [
            "已细化该节点。先查看更新后的任务树，再使用 `/task resume` 继续执行。",
            "",
            renderTaskTree(tree),
          ].join("\n"),
          threadId: activeThreadId,
        };
      }
      case "retry": {
        if (!activeThreadId) {
          return { mode: "chat", text: "当前没有进行中的任务。" };
        }
        const thread = await orchestrator.retryTaskNode(
          activeThreadId,
          command.instruction,
          command.nodeRef,
        );
        const view = await orchestrator.getTaskStatus(thread.threadId, "summary");
        return { mode: "task", text: renderTaskSummary(view), threadId: activeThreadId };
      }
      case "skip": {
        if (!activeThreadId) {
          return { mode: "chat", text: "当前没有进行中的任务。" };
        }
        const thread = await orchestrator.skipTaskNode(
          activeThreadId,
          command.nodeRef,
        );
        const view = await orchestrator.getTaskStatus(thread.threadId, "summary");
        return { mode: "task", text: renderTaskSummary(view), threadId: activeThreadId };
      }
      case "pause": {
        if (!activeThreadId) {
          return { mode: "chat", text: "当前没有进行中的任务。" };
        }
        const thread = await orchestrator.pauseTask(activeThreadId);
        return { mode: "task", text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")), threadId: activeThreadId };
      }
      case "resume": {
        if (!activeThreadId) {
          return { mode: "chat", text: "当前没有进行中的任务。" };
        }
        const thread = await orchestrator.resumeTask(activeThreadId, command.payload);
        return {
          mode: "task",
          text: await renderThreadResponse(orchestrator, thread),
          threadId: activeThreadId,
        };
      }
      case "finish": {
        if (!activeThreadId) {
          return { mode: "chat", text: "当前没有进行中的任务。" };
        }
        const thread = await orchestrator.confirmTaskFinish(activeThreadId);
        return {
          mode: "task",
          text: await renderThreadResponse(orchestrator, thread),
          threadId: activeThreadId,
        };
      }
      case "cancel": {
        if (!activeThreadId) {
          return { mode: "chat", text: "当前没有进行中的任务。" };
        }
        const thread = await orchestrator.cancelTask(activeThreadId);
        const view = await orchestrator.getTaskStatus(thread.threadId, "summary");
        return { mode: "task", text: renderTaskSummary(view), threadId: activeThreadId };
      }
      case "list": {
        const threads = await orchestrator.listTasks(
          input.channelContext.channelConversationId,
        );
        if (threads.length === 0) {
          return { mode: "chat", text: "当前会话里还没有任务。" };
        }
        return {
          mode: "task",
          text: threads
            .map((thread) => renderThreadListLine(thread))
            .join("\n"),
        };
      }
    }
  }

  if (
    channelState?.pendingTaskInput &&
    detectTaskIntent(input.message).kind === "confirm_start"
  ) {
    const thread = await orchestrator.startTask(
      channelState.pendingTaskInput,
      input.channelContext,
    );
    return {
      mode: "task",
      text: await renderThreadResponse(orchestrator, thread),
      threadId: thread.threadId,
    };
  }

  if (channelState?.pendingTaskInput) {
    const pendingIntent = detectTaskIntent(input.message);
    if (pendingIntent.kind === "discard_pending") {
      await orchestrator.clearPendingTask(input.channelContext);
      return {
        mode: "chat",
        text: "已丢弃待启动任务草稿。",
      };
    }

    if (pendingIntent.kind === "edit_pending") {
      await orchestrator.updatePendingTask(
        input.channelContext,
        pendingIntent.taskInput,
      );
      return {
        mode: "chat",
        text:
          "已更新待启动任务草稿。回复 `确认开始任务` 即可启动，回复 `取消待启动任务` 可放弃。",
      };
    }

    if (pendingIntent.kind === "start") {
      await orchestrator.updatePendingTask(input.channelContext, input.message);
      return {
        mode: "chat",
        text:
          "已替换待启动任务草稿。回复 `确认开始任务` 即可启动，回复 `取消待启动任务` 可放弃。",
      };
    }
  }

  if (activeThreadId) {
    const activeThread = await orchestrator.getThread(activeThreadId);
    if (activeThread?.status === "awaiting_plan_confirmation") {
      const intent = detectTaskIntent(input.message);

      if (intent.kind === "confirm_start" || intent.kind === "resume") {
        const thread = await orchestrator.resumeTask(activeThreadId);
        return {
          mode: "task",
          text: await renderThreadResponse(orchestrator, thread),
          threadId: activeThreadId,
        };
      }

      if (intent.kind === "none" || intent.kind === "start") {
        return {
          mode: "task",
          text: renderPlanPreview(
            await orchestrator.getTaskStatus(activeThreadId, "tree"),
          ),
          threadId: activeThreadId,
        };
      }
    }

    if (activeThread?.status === "awaiting_finish_confirmation") {
      const intent = detectTaskIntent(input.message);

      if (intent.kind === "confirm_finish") {
        const thread = await orchestrator.confirmTaskFinish(activeThreadId);
        return {
          mode: "task",
          text: await renderThreadResponse(orchestrator, thread),
          threadId: activeThreadId,
        };
      }

      return {
        mode: "task",
        text: renderTaskSummary(await orchestrator.getTaskStatus(activeThreadId, "summary")),
        threadId: activeThreadId,
      };
    }

    if (activeThread?.status === "waiting_human") {
      const classification = classifyWaitingHumanMessage(input.message, activeThread);

      if (classification.kind === "help_request" || classification.kind === "ambiguous") {
        return {
          mode: "task",
          text: renderWaitingHumanHelp(activeThread),
          threadId: activeThreadId,
        };
      }

      if (classification.kind === "resume_input") {
        const thread = await orchestrator.resumeTask(activeThreadId, input.message);
        return {
          mode: "task",
          text: await renderThreadResponse(orchestrator, thread),
          threadId: activeThreadId,
        };
      }
    }

    if (activeThread?.status === "failed") {
      const intent = detectTaskIntent(input.message);
      if (intent.kind === "retry") {
        const thread = await orchestrator.retryTaskNode(
          activeThreadId,
          intent.instruction,
          intent.nodeRef,
        );
        return {
          mode: "task",
          text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")),
          threadId: activeThreadId,
        };
      }

      if (intent.kind === "skip") {
        const thread = await orchestrator.skipTaskNode(
          activeThreadId,
          intent.nodeRef,
        );
        return {
          mode: "task",
          text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")),
          threadId: activeThreadId,
        };
      }

      return {
        mode: "task",
        text: renderFailedHelp(activeThread),
        threadId: activeThreadId,
      };
    }
  }

  const intent = detectTaskIntent(input.message);
  switch (intent.kind) {
    case "start": {
      await orchestrator.stagePendingTask(input.channelContext, input.message);
      return {
        mode: "chat",
        text:
          "这看起来是一个复杂任务。回复 `确认开始任务`，或直接使用 `/task start ...` 进入任务模式。",
      };
    }
    case "confirm_start": {
      if (!channelState?.pendingTaskInput) {
        return {
          mode: "chat",
          text: "当前没有待确认启动的任务。",
        };
      }
      const thread = await orchestrator.startTask(
        channelState.pendingTaskInput,
        input.channelContext,
      );
      return {
        mode: "task",
        text: await renderThreadResponse(orchestrator, thread),
        threadId: thread.threadId,
      };
    }
    case "refine": {
      if (!activeThreadId) {
        return { mode: "chat", text: "当前没有进行中的任务。" };
      }
      const thread = await orchestrator.refineTaskNode(
        activeThreadId,
        intent.instruction,
        intent.nodeRef,
      );
      const tree = await orchestrator.getTaskStatus(thread.threadId, "tree");
      return {
        mode: "task",
        text: [
          "已细化该节点。先查看更新后的任务树，再使用 `/task resume` 继续执行。",
          "",
          renderTaskTree(tree),
        ].join("\n"),
        threadId: activeThreadId,
      };
    }
    case "retry": {
      if (!activeThreadId) {
        return { mode: "chat", text: "当前没有进行中的任务。" };
      }
      const thread = await orchestrator.retryTaskNode(
        activeThreadId,
        intent.instruction,
        intent.nodeRef,
      );
      return {
        mode: "task",
        text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")),
        threadId: activeThreadId,
      };
    }
    case "skip": {
      if (!activeThreadId) {
        return { mode: "chat", text: "当前没有进行中的任务。" };
      }
      const thread = await orchestrator.skipTaskNode(activeThreadId, intent.nodeRef);
      return {
        mode: "task",
        text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")),
        threadId: activeThreadId,
      };
    }
    case "status": {
      const targetThread = activeThreadId
        ? await orchestrator.getThread(activeThreadId)
        : await getRecentThread(orchestrator, input.channelContext.channelConversationId);
      if (!targetThread) {
        return { mode: "chat", text: noRecentTaskText() };
      }
      return {
        mode: "task",
        text:
          activeThreadId
            ? renderTaskSummary(await orchestrator.getTaskStatus(targetThread.threadId, "summary"))
            : `${recentThreadHint(targetThread)}\n\n${renderTaskSummary(await orchestrator.getTaskStatus(targetThread.threadId, "summary"))}`,
        threadId: targetThread.threadId,
      };
    }
    case "tree": {
      const targetThread = activeThreadId
        ? await orchestrator.getThread(activeThreadId)
        : await getRecentThread(orchestrator, input.channelContext.channelConversationId);
      if (!targetThread) {
        return { mode: "chat", text: noRecentTaskText() };
      }
      return {
        mode: "task",
        text:
          activeThreadId
            ? renderTaskTree(await orchestrator.getTaskStatus(targetThread.threadId, "tree"))
            : `${recentThreadHint(targetThread)}\n\n${renderTaskTree(await orchestrator.getTaskStatus(targetThread.threadId, "tree"))}`,
        threadId: targetThread.threadId,
      };
    }
    case "pause": {
      if (!activeThreadId) {
        return { mode: "chat", text: "当前没有进行中的任务。" };
      }
      const thread = await orchestrator.pauseTask(activeThreadId);
      return {
        mode: "task",
        text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")),
        threadId: activeThreadId,
      };
    }
    case "resume": {
      if (!activeThreadId) {
        return { mode: "chat", text: "当前没有进行中的任务。" };
      }
      const thread = await orchestrator.resumeTask(activeThreadId);
      return {
        mode: "task",
        text: await renderThreadResponse(orchestrator, thread),
        threadId: activeThreadId,
      };
    }
    case "confirm_finish": {
      if (!activeThreadId) {
        return { mode: "chat", text: "当前没有进行中的任务。" };
      }
      const thread = await orchestrator.confirmTaskFinish(activeThreadId);
      return {
        mode: "task",
        text: await renderThreadResponse(orchestrator, thread),
        threadId: activeThreadId,
      };
    }
    case "cancel": {
      if (!activeThreadId) {
        return { mode: "chat", text: "当前没有进行中的任务。" };
      }
      const thread = await orchestrator.cancelTask(activeThreadId);
      return {
        mode: "task",
        text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")),
        threadId: activeThreadId,
      };
    }
    case "node": {
      const targetThread = activeThreadId
        ? await orchestrator.getThread(activeThreadId)
        : await getRecentThread(orchestrator, input.channelContext.channelConversationId);
      if (!targetThread) {
        return { mode: "chat", text: noRecentTaskText() };
      }
      return {
        mode: "task",
        text:
          activeThreadId
            ? renderNodeDetail(
                await orchestrator.getTaskStatus(targetThread.threadId, "node", intent.nodeRef),
              )
            : `${recentThreadHint(targetThread)}\n\n${renderNodeDetail(
                await orchestrator.getTaskStatus(targetThread.threadId, "node", intent.nodeRef),
              )}`,
        threadId: targetThread.threadId,
      };
    }
    case "none":
    default:
      return {
        mode: "chat",
        text: await orchestrator.fallbackToDefaultChat(
          input.channelContext,
          input.message,
        ),
      };
  }
}
