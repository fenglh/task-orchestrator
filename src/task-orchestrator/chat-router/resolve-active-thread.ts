import type { ChannelState } from "../types/channel-state.ts";

export function resolveActiveThreadId(
  channelState: ChannelState | undefined,
): string | undefined {
  return channelState?.activeThreadId;
}
