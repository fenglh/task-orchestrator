import { appendChildTasks, getTaskNode } from "../../state/task-tree.ts";
import { emitTaskEvent } from "../../ui-status/emit-task-event.ts";
import type { GraphRuntimeContext } from "../state.ts";
import type { TaskThread } from "../../types/task-thread.ts";

export async function planRoot(
  context: GraphRuntimeContext,
  thread: TaskThread,
): Promise<void> {
  const rootNode = getTaskNode(thread, thread.rootTaskId);
  if (!rootNode) {
    throw new Error("Root task node not found");
  }

  if (rootNode.children.length > 0) {
    thread.phase = "executing";
    return;
  }

  const plannedTasks = await context.adapter.planRoot({
    thread,
    rootNode,
  });

  appendChildTasks(thread, thread.rootTaskId, plannedTasks);
  rootNode.status = plannedTasks.length > 0 ? "waiting_children" : "done";
  thread.phase = plannedTasks.length > 0 ? "executing" : "finalizing";

  if (plannedTasks.length > 0 && thread.previewPlan && !thread.planConfirmed) {
    thread.status = "awaiting_plan_confirmation";
    await emitTaskEvent(thread, {
      type: "task_plan_ready",
      message: `Plan ready with ${plannedTasks.length} top-level task(s). Review it, then resume to start execution.`,
    }, context.publishTaskEvent);
    return;
  }

  await emitTaskEvent(thread, {
    type: "task_progress",
    message: `Planned ${plannedTasks.length} top-level task(s).`,
  }, context.publishTaskEvent);
}
