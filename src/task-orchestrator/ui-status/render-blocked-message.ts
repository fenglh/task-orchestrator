import type { TaskThread } from "../types/task-thread.ts";

export function renderBlockedMessage(thread: TaskThread): string {
  if (!thread.blocked) {
    return "Task is not waiting for user input.";
  }

  const lines = [
    "当前任务已卡住，正在等待你的输入。",
    `问题：${thread.blocked.question}`,
    `原因：${thread.blocked.whyBlocked}`,
  ];

  if (thread.blocked.requiredInputSchema) {
    lines.push("需要的输入：请尽量直接回复缺失信息，不必重复整个任务背景。");
  }

  if (thread.blocked.suggestedActions?.length) {
    lines.push("建议你现在这样做：");
    for (const action of thread.blocked.suggestedActions) {
      lines.push(`- ${action}`);
    }
  }

  lines.push("你也可以：");
  lines.push("- 直接回复缺失输入，系统会继续执行");
  lines.push("Recommended commands:");
  lines.push("- /task tree");
  lines.push("- /task pause");
  lines.push("- /task cancel");

  return lines.join("\n");
}
