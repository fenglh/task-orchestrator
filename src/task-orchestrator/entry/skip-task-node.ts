import type { TaskOrchestrator } from "../index.ts";
import type { TaskThread } from "../types/task-thread.ts";

export async function skipTaskNode(
  orchestrator: TaskOrchestrator,
  threadId: string,
  nodeRef?: string,
): Promise<TaskThread> {
  return orchestrator.skipTaskNode(threadId, nodeRef);
}
