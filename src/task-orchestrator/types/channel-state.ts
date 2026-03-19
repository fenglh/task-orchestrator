export type ChannelMode = "chat" | "task";

export interface ChannelContext {
  channelConversationId: string;
  channelName?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelState {
  channelConversationId: string;
  mode: ChannelMode;
  activeThreadId?: string;
  awaitingInputThreadId?: string;
  pendingTaskInput?: string;
  latestRenderedMessage?: string;
  createdAt: string;
  updatedAt: string;
}
