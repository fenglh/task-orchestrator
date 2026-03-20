import type { TaskThread } from "../types/task-thread.ts";

export function renderBlockedMessage(thread: TaskThread): string {
  if (!thread.blocked) {
    return "当前任务没有在等待你的输入。";
  }

  const lines = [
    "# 任务等待输入",
    "",
    "## 当前问题",
    `- **问题**：${thread.blocked.question}`,
    `- **原因**：${thread.blocked.whyBlocked}`,
  ];

  if (thread.blocked.requiredInputSchema) {
    lines.push("", "## 你现在最该做什么", "- 直接回复缺失信息即可，不必重复整个任务背景");
  }

  if (thread.blocked.suggestedActions?.length) {
    lines.push("", "## 建议操作");
    for (const action of thread.blocked.suggestedActions) {
      lines.push(`- ${action}`);
    }
  }

  lines.push("", "## 推荐命令", "```bash", "/task tree", "/task pause", "/task cancel", "```");

  return lines.join("\n");
}
