import type { ChannelContext } from "../types/channel-state.ts";
import type { TaskThread } from "../types/task-thread.ts";
import type { TaskOrchestrator } from "../index.ts";

export async function startTask(
  orchestrator: TaskOrchestrator,
  taskInput: string,
  channelContext: ChannelContext,
): Promise<TaskThread> {
  return orchestrator.startTask(taskInput, channelContext);
}
