import type { TaskThread } from "../types/task-thread.ts";

export interface TaskThreadRepository {
  get(threadId: string): Promise<TaskThread | undefined>;
  save(thread: TaskThread): Promise<void>;
  delete(threadId: string): Promise<void>;
  list(): Promise<TaskThread[]>;
  listByConversation(channelConversationId: string): Promise<TaskThread[]>;
}

export class InMemoryTaskThreadRepository implements TaskThreadRepository {
  private readonly threads = new Map<string, TaskThread>();

  async get(threadId: string): Promise<TaskThread | undefined> {
    return this.threads.get(threadId);
  }

  async save(thread: TaskThread): Promise<void> {
    this.threads.set(thread.threadId, thread);
  }

  async delete(threadId: string): Promise<void> {
    this.threads.delete(threadId);
  }

  async list(): Promise<TaskThread[]> {
    return [...this.threads.values()];
  }

  async listByConversation(channelConversationId: string): Promise<TaskThread[]> {
    return [...this.threads.values()].filter(
      (thread) => thread.channelConversationId === channelConversationId,
    );
  }
}
