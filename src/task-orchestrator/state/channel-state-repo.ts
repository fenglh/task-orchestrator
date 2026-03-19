import type { ChannelState } from "../types/channel-state.ts";

export interface ChannelStateRepository {
  get(channelConversationId: string): Promise<ChannelState | undefined>;
  save(channelState: ChannelState): Promise<void>;
}

export class InMemoryChannelStateRepository implements ChannelStateRepository {
  private readonly states = new Map<string, ChannelState>();

  async get(channelConversationId: string): Promise<ChannelState | undefined> {
    return this.states.get(channelConversationId);
  }

  async save(channelState: ChannelState): Promise<void> {
    this.states.set(channelState.channelConversationId, channelState);
  }
}
