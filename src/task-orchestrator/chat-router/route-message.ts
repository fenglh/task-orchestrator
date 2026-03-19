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
        if (!activeThreadId) {
          return { mode: "chat", text: "No active task." };
        }
        const view = await orchestrator.getTaskStatus(activeThreadId, "summary");
        return { mode: "task", text: renderTaskSummary(view), threadId: activeThreadId };
      }
      case "tree": {
        if (!activeThreadId) {
          return { mode: "chat", text: "No active task." };
        }
        const view = await orchestrator.getTaskStatus(activeThreadId, "tree");
        return { mode: "task", text: renderTaskTree(view), threadId: activeThreadId };
      }
      case "node": {
        if (!activeThreadId) {
          return { mode: "chat", text: "No active task." };
        }
        const view = await orchestrator.getTaskStatus(
          activeThreadId,
          "node",
          command.nodeRef,
        );
        return { mode: "task", text: renderNodeDetail(view), threadId: activeThreadId };
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
            "Updated the pending task draft. Reply with `确认开始任务` to launch it, or `取消待启动任务` to discard it.",
        };
      }
      case "discard": {
        await orchestrator.clearPendingTask(input.channelContext);
        return {
          mode: "chat",
          text: "Discarded the pending task draft.",
        };
      }
      case "refine": {
        if (!activeThreadId) {
          return { mode: "chat", text: "No active task." };
        }
        const thread = await orchestrator.refineTaskNode(
          activeThreadId,
          command.instruction || "Refine this task into smaller executable child tasks.",
          command.nodeRef,
        );
        const tree = await orchestrator.getTaskStatus(thread.threadId, "tree");
        return {
          mode: "task",
          text: [
            "Task node refined. Review the updated tree and use `/task resume` to continue.",
            "",
            renderTaskTree(tree),
          ].join("\n"),
          threadId: activeThreadId,
        };
      }
      case "retry": {
        if (!activeThreadId) {
          return { mode: "chat", text: "No active task." };
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
          return { mode: "chat", text: "No active task." };
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
          return { mode: "chat", text: "No active task." };
        }
        const thread = await orchestrator.pauseTask(activeThreadId);
        return { mode: "task", text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")), threadId: activeThreadId };
      }
      case "resume": {
        if (!activeThreadId) {
          return { mode: "chat", text: "No active task." };
        }
        const thread = await orchestrator.resumeTask(activeThreadId, command.payload);
        return {
          mode: "task",
          text: await renderThreadResponse(orchestrator, thread),
          threadId: activeThreadId,
        };
      }
      case "cancel": {
        if (!activeThreadId) {
          return { mode: "chat", text: "No active task." };
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
          return { mode: "chat", text: "No tasks in this conversation." };
        }
        return {
          mode: "task",
          text: threads
            .map((thread) => `${thread.threadId} ${thread.title} [${thread.status}]`)
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
        text: "Discarded the pending task draft.",
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
          "Updated the pending task draft. Reply with `确认开始任务` to launch it, or `取消待启动任务` to discard it.",
      };
    }

    if (pendingIntent.kind === "start") {
      await orchestrator.updatePendingTask(input.channelContext, input.message);
      return {
        mode: "chat",
        text:
          "Replaced the pending task draft. Reply with `确认开始任务` to launch it, or `取消待启动任务` to discard it.",
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
          "This looks like a complex task. Reply with `确认开始任务` or `/task start ...` to launch task mode.",
      };
    }
    case "confirm_start": {
      if (!channelState?.pendingTaskInput) {
        return {
          mode: "chat",
          text: "No pending task to confirm.",
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
        return { mode: "chat", text: "No active task." };
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
          "Task node refined. Review the updated tree and use `/task resume` to continue.",
          "",
          renderTaskTree(tree),
        ].join("\n"),
        threadId: activeThreadId,
      };
    }
    case "retry": {
      if (!activeThreadId) {
        return { mode: "chat", text: "No active task." };
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
        return { mode: "chat", text: "No active task." };
      }
      const thread = await orchestrator.skipTaskNode(activeThreadId, intent.nodeRef);
      return {
        mode: "task",
        text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")),
        threadId: activeThreadId,
      };
    }
    case "status": {
      if (!activeThreadId) {
        return { mode: "chat", text: "No active task." };
      }
      return {
        mode: "task",
        text: renderTaskSummary(await orchestrator.getTaskStatus(activeThreadId, "summary")),
        threadId: activeThreadId,
      };
    }
    case "tree": {
      if (!activeThreadId) {
        return { mode: "chat", text: "No active task." };
      }
      return {
        mode: "task",
        text: renderTaskTree(await orchestrator.getTaskStatus(activeThreadId, "tree")),
        threadId: activeThreadId,
      };
    }
    case "pause": {
      if (!activeThreadId) {
        return { mode: "chat", text: "No active task." };
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
        return { mode: "chat", text: "No active task." };
      }
      const thread = await orchestrator.resumeTask(activeThreadId);
      return {
        mode: "task",
        text: await renderThreadResponse(orchestrator, thread),
        threadId: activeThreadId,
      };
    }
    case "cancel": {
      if (!activeThreadId) {
        return { mode: "chat", text: "No active task." };
      }
      const thread = await orchestrator.cancelTask(activeThreadId);
      return {
        mode: "task",
        text: renderTaskSummary(await orchestrator.getTaskStatus(thread.threadId, "summary")),
        threadId: activeThreadId,
      };
    }
    case "node": {
      if (!activeThreadId) {
        return { mode: "chat", text: "No active task." };
      }
      return {
        mode: "task",
        text: renderNodeDetail(
          await orchestrator.getTaskStatus(activeThreadId, "node", intent.nodeRef),
        ),
        threadId: activeThreadId,
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
