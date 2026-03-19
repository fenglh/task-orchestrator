import type { ChannelContext } from "../types/channel-state.ts";

export interface OpenClawSessionEvent {
  type:
    | "message_start"
    | "message_update"
    | "message_end"
    | "tool_execution_start"
    | "tool_execution_end"
    | "turn_end"
    | "agent_start"
    | "agent_end"
    | string;
  payload?: unknown;
  timestamp?: string;
}

export interface OpenClawPromptRequest {
  sessionId: string;
  prompt: string;
  channelContext?: ChannelContext;
  metadata?: Record<string, unknown>;
}

export interface OpenClawPromptResponse {
  text: string;
  events?: OpenClawSessionEvent[];
}

export interface OpenClawRuntime {
  ensureSession(input: {
    sessionId: string;
    channelContext?: ChannelContext;
  }): Promise<void>;
  prompt(input: OpenClawPromptRequest): Promise<OpenClawPromptResponse>;
}

export interface EmbeddedPiBlockReplyPayload {
  text: string;
  mediaUrls?: string[];
}

export interface RunEmbeddedPiAgentParams {
  sessionId: string;
  sessionKey: string;
  sessionFile: string;
  workspaceDir: string;
  config?: unknown;
  prompt: string;
  provider?: string;
  model?: string;
  timeoutMs?: number;
  runId: string;
  onBlockReply?: (payload: EmbeddedPiBlockReplyPayload) => Promise<void> | void;
  onPartialReply?: (text: string) => Promise<void> | void;
  onAgentEvent?: (event: OpenClawSessionEvent) => Promise<void> | void;
}

export interface EmbeddedPiRunResult {
  text?: string;
}

export interface OpenClawEmbeddedPiRunner {
  runEmbeddedPiAgent(params: RunEmbeddedPiAgentParams): Promise<EmbeddedPiRunResult>;
}

export interface OpenClawEventEnvelope {
  threadId: string;
  sessionId: string;
  event: OpenClawSessionEvent;
}

export interface OpenClawEventSink {
  onEvent(envelope: OpenClawEventEnvelope): Promise<void> | void;
}
