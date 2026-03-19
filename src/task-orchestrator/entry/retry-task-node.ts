import type { TaskOrchestrator } from "../index.ts";
import type { TaskThread } from "../types/task-thread.ts";

export async function retryTaskNode(
  orchestrator: TaskOrchestrator,
  threadId: string,
  instruction?: string,
  nodeRef?: string,
): Promise<TaskThread> {
  return orchestrator.retryTaskNode(threadId, instruction, nodeRef);
}
