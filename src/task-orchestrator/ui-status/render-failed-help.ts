import type { TaskThread } from "../types/task-thread.ts";

export function renderFailedHelp(thread: TaskThread): string {
  const node = thread.activeNodeId ? thread.nodes[thread.activeNodeId] : undefined;
  const lines = [
    "# 任务执行失败",
  ];

  if (node) {
    lines.push(
      "",
      "## 失败节点",
      `- **节点**：${node.displayPath} ${node.title}`,
    );
    if (node.report) {
      lines.push(`- **原因**：${node.report}`);
    }
  }

  lines.push(
    "",
    "## 建议处理",
    "- 如果这是偶发执行失败，优先重试",
    "- 如果这是低价值节点或外部条件不满足，再考虑跳过",
    "",
    "## 推荐命令",
    "```bash",
    "/task retry",
    "/task retry <nodeRef> <instruction>",
    "/task skip",
    "/task tree",
    "```",
  );

  return lines.join("\n");
}
