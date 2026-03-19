import type { TaskOrchestrator } from "../index.ts";
import type { ChannelContext } from "../types/channel-state.ts";

export async function setActiveTask(
  orchestrator: TaskOrchestrator,
  channelContext: ChannelContext,
  threadId: string,
): Promise<void> {
  return orchestrator.setActiveTask(channelContext, threadId);
}
