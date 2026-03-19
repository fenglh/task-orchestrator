import type { TaskExecutionAdapter } from "../types/adapters.ts";
import type { TaskGuards } from "../state/guards.ts";
import type { ChannelStateRepository } from "../state/channel-state-repo.ts";
import type { TaskThreadRepository } from "../state/task-thread-repo.ts";
import type { TaskEventPublisher } from "../types/task-thread.ts";

export interface GraphRuntimeContext {
  adapter: TaskExecutionAdapter;
  taskThreadRepo: TaskThreadRepository;
  channelStateRepo: ChannelStateRepository;
  guards: TaskGuards;
  publishTaskEvent?: TaskEventPublisher;
  now(): string;
}
