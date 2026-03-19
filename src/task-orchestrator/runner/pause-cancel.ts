import { emitTaskEvent } from "../ui-status/emit-task-event.ts";
import type { TaskEventPublisher } from "../types/task-thread.ts";
import type { TaskThread } from "../types/task-thread.ts";

export async function applyPauseOrCancel(
  thread: TaskThread,
  publisher?: TaskEventPublisher,
): Promise<boolean> {
  if (thread.cancelRequested) {
    thread.status = "cancelled";
    thread.phase = "finished";
    thread.activeNodeId = undefined;
    await emitTaskEvent(thread, {
      type: "task_cancelled",
      message: "Task cancelled.",
    }, publisher);
    return true;
  }

  if (thread.pauseRequested) {
    thread.status = "paused";
    thread.activeNodeId = undefined;
    await emitTaskEvent(thread, {
      type: "task_paused",
      message: "Task paused.",
    }, publisher);
    return true;
  }

  return false;
}
