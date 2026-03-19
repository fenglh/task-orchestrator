import type {
  TaskEvent,
  TaskEventPublisher,
  TaskThread,
} from "../types/task-thread.ts";

export async function emitTaskEvent(
  thread: TaskThread,
  event: Omit<TaskEvent, "timestamp"> & { timestamp?: string },
  publisher?: TaskEventPublisher,
): Promise<void> {
  const timestamp = event.timestamp ?? thread.updatedAt;
  const normalizedEvent: TaskEvent = {
    type: event.type,
    message: event.message,
    timestamp,
  };
  thread.events.push(normalizedEvent);
  thread.latestUserVisibleSummary = event.message;

  if (publisher) {
    await publisher(thread, normalizedEvent);
  }
}
