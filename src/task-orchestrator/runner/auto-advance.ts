import type { TaskThread } from "../types/task-thread.ts";

export function shouldAutoAdvance(thread: TaskThread): boolean {
  return (
    thread.status === "running" &&
    !thread.pauseRequested &&
    !thread.cancelRequested &&
    thread.autoAdvanceCount < thread.maxAutoAdvanceSteps
  );
}
