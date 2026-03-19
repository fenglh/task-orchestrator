import type { TaskThread } from "../types/task-thread.ts";

export function renderBlockedMessage(thread: TaskThread): string {
  if (!thread.blocked) {
    return "Task is not waiting for user input.";
  }

  const lines = [
    "Task is waiting for input",
    `Question: ${thread.blocked.question}`,
    `Reason: ${thread.blocked.whyBlocked}`,
  ];

  if (thread.blocked.suggestedActions?.length) {
    lines.push("Suggested actions:");
    for (const action of thread.blocked.suggestedActions) {
      lines.push(`- ${action}`);
    }
  }

  return lines.join("\n");
}
