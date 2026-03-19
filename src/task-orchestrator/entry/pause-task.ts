import type { TaskThread } from "../types/task-thread.ts";
import type { TaskOrchestrator } from "../index.ts";

export async function pauseTask(
  orchestrator: TaskOrchestrator,
  threadId: string,
): Promise<TaskThread> {
  return orchestrator.pauseTask(threadId);
}
