import type { TaskThread } from "../types/task-thread.ts";

export function renderFailedHelp(thread: TaskThread): string {
  const node = thread.activeNodeId ? thread.nodes[thread.activeNodeId] : undefined;
  const lines = [
    "当前任务停止了，因为有一个节点执行失败。",
  ];

  if (node) {
    lines.push(`失败节点：${node.displayPath} ${node.title}`);
    if (node.report) {
      lines.push(`失败原因：${node.report}`);
    }
  }

  lines.push("你现在最常用的继续方式：");
  lines.push("- 优先决定 retry 还是 skip");
  lines.push("Recommended commands:");
  lines.push("- /task retry");
  lines.push("- /task retry <nodeRef> <instruction>");
  lines.push("- /task skip");
  lines.push("- /task tree");

  lines.push("建议：如果这是偶发执行失败，先 retry；如果这是低价值节点或外部条件不满足，再考虑 skip。");

  return lines.join("\n");
}
