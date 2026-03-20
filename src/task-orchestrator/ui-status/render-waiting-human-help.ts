import type { TaskThread } from "../types/task-thread.ts";

export function renderWaitingHumanHelp(thread: TaskThread): string {
  if (!thread.blocked) {
    return "当前任务没有在等待输入。";
  }

  return [
    "# 任务等待输入",
    "",
    "## 当前问题",
    `- **问题**：${thread.blocked.question}`,
    `- **原因**：${thread.blocked.whyBlocked}`,
    "",
    "## 你现在可以",
    "- 直接回复缺失输入，系统会继续执行",
    "- 使用 `/task status` 查看任务状态",
    "- 使用 `/task tree` 查看任务树",
    "- 使用 `/task pause` 或 `/task cancel` 控制任务",
  ].join("\n");
}
