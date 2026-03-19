import type { TaskThread } from "../types/task-thread.ts";
import type { TaskOrchestrator } from "../index.ts";

export async function resumeTask(
  orchestrator: TaskOrchestrator,
  threadId: string,
  userInput?: string,
): Promise<TaskThread> {
  return orchestrator.resumeTask(threadId, userInput);
}
