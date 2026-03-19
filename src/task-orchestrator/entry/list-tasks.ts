import type { TaskOrchestrator } from "../index.ts";
import type { TaskThread } from "../types/task-thread.ts";

export async function listTasks(
  orchestrator: TaskOrchestrator,
  channelConversationId?: string,
): Promise<TaskThread[]> {
  return orchestrator.listTasks(channelConversationId);
}
