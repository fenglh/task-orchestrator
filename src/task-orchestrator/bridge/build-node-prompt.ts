import { getNodePath } from "../state/task-tree.ts";
import type { TaskThread } from "../types/task-thread.ts";

export function buildNodePrompt(thread: TaskThread, nodeId: string): string {
  const node = thread.nodes[nodeId];
  const parentPath = getNodePath(thread, node.parentId)
    .map((pathNode) => pathNode.title)
    .join(" > ");

  return [
    "Execute only the current task node.",
    `Title: ${node.title}`,
    `Goal: ${node.goal}`,
    `Success criteria: ${node.successCriteria}`,
    `Parent path: ${parentPath || "root"}`,
    "Return only one structured result: done, expand, blocked, or failed.",
  ].join("\n");
}
