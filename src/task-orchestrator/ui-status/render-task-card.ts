import type { TaskThread } from "../types/task-thread.ts";

export function renderTaskCard(thread: TaskThread): string {
  return [
    "Task started",
    `Task ID: ${thread.threadId}`,
    `Title: ${thread.title}`,
    `Status: ${thread.status}`,
  ].join("\n");
}
