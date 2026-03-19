import { emitTaskEvent } from "../../ui-status/emit-task-event.ts";
import type { GraphRuntimeContext } from "../state.ts";
import type { TaskThread } from "../../types/task-thread.ts";

export async function finalizeTask(
  context: GraphRuntimeContext,
  thread: TaskThread,
): Promise<void> {
  const result = await context.adapter.finalize({ thread });
  thread.phase = "finished";
  thread.status = "finished";
  thread.completedAt = context.now();
  thread.activeNodeId = undefined;
  thread.latestUserVisibleSummary = result.summary;
  await emitTaskEvent(thread, {
    type: "task_finished",
    message: result.summary,
  }, context.publishTaskEvent);
}
