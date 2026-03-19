import type { TaskOrchestrator } from "../index.ts";
import type { TaskStatusView } from "../types/task-status-view.ts";

export async function getTaskStatus(
  orchestrator: TaskOrchestrator,
  threadId: string,
  view: "summary" | "tree" | "node" = "summary",
  nodeRef?: string,
): Promise<TaskStatusView> {
  return orchestrator.getTaskStatus(threadId, view, nodeRef);
}
