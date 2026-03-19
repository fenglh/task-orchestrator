import type { ChannelState } from "../types/channel-state.ts";

export function resolveTaskMode(channelState: ChannelState | undefined): "chat" | "task" {
  return channelState?.mode ?? "chat";
}
