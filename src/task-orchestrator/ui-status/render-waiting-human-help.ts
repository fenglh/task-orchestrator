import type { TaskThread } from "../types/task-thread.ts";

export function renderWaitingHumanHelp(thread: TaskThread): string {
  if (!thread.blocked) {
    return "Task is not waiting for input.";
  }

  return [
    "The task is waiting for your input.",
    `Question: ${thread.blocked.question}`,
    `Reason: ${thread.blocked.whyBlocked}`,
    "You can:",
    "- reply directly with the missing input to continue",
    "- use `/task status` to inspect task status",
    "- use `/task tree` to inspect the task tree",
    "- use `/task pause` or `/task cancel` to control the task",
  ].join("\n");
}
