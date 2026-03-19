import type { TaskThread } from "../types/task-thread.ts";

export function renderFailedHelp(thread: TaskThread): string {
  const node = thread.activeNodeId ? thread.nodes[thread.activeNodeId] : undefined;
  const lines = [
    "The task stopped because a node failed.",
  ];

  if (node) {
    lines.push(`Failed node: ${node.displayPath} ${node.title}`);
    if (node.report) {
      lines.push(`Reason: ${node.report}`);
    }
  }

  lines.push("You can:");
  lines.push("- use `/task retry` to retry the failed node");
  lines.push("- use `/task retry <nodeRef> <instruction>` to retry with extra guidance");
  lines.push("- use `/task skip` to skip the failed node and continue");
  lines.push("- use `/task tree` to inspect the current task tree");

  return lines.join("\n");
}
