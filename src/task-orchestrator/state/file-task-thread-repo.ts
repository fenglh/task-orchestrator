import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskThread } from "../types/task-thread.ts";
import type { TaskThreadRepository } from "./task-thread-repo.ts";

export class FileTaskThreadRepository implements TaskThreadRepository {
  private readonly baseDir: string;
  private readonly threadsDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.threadsDir = join(baseDir, "threads");
  }

  async get(threadId: string): Promise<TaskThread | undefined> {
    await this.ensureDirs();
    try {
      const raw = await readFile(this.filePath(threadId), "utf8");
      return JSON.parse(raw) as TaskThread;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async save(thread: TaskThread): Promise<void> {
    await this.ensureDirs();
    await writeFile(this.filePath(thread.threadId), JSON.stringify(thread, null, 2));
  }

  async delete(threadId: string): Promise<void> {
    await this.ensureDirs();
    await rm(this.filePath(threadId), { force: true });
  }

  async list(): Promise<TaskThread[]> {
    await this.ensureDirs();
    const entries = await readdir(this.threadsDir, { withFileTypes: true });
    const threads: TaskThread[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const raw = await readFile(join(this.threadsDir, entry.name), "utf8");
      threads.push(JSON.parse(raw) as TaskThread);
    }

    return threads.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listByConversation(channelConversationId: string): Promise<TaskThread[]> {
    const threads = await this.list();
    return threads.filter(
      (thread) => thread.channelConversationId === channelConversationId,
    );
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.threadsDir, { recursive: true });
  }

  private filePath(threadId: string): string {
    return join(this.threadsDir, `${threadId}.json`);
  }
}
