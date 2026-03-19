import type { TaskThread } from "../types/task-thread.ts";
import type { TaskOrchestrator } from "../index.ts";

export async function cancelTask(
  orchestrator: TaskOrchestrator,
  threadId: string,
): Promise<TaskThread> {
  return orchestrator.cancelTask(threadId);
}
