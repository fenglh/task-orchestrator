import type { ChannelContext } from "./channel-state.ts";
import type { TaskNode } from "./task-node.ts";

export type TaskThreadStatus =
  | "running"
  | "awaiting_plan_confirmation"
  | "waiting_human"
  | "paused"
  | "finished"
  | "failed"
  | "cancelled";

export type TaskThreadPhase =
  | "planning"
  | "executing"
  | "finalizing"
  | "finished";

export interface TaskBlockedState {
  nodeId: string;
  question: string;
  whyBlocked: string;
  requiredInputSchema?: Record<string, unknown>;
  suggestedActions?: string[];
}

export interface TaskEvent {
  type:
    | "task_started"
    | "task_progress"
    | "task_plan_ready"
    | "task_blocked"
    | "task_paused"
    | "task_resumed"
    | "task_cancelled"
    | "task_finished"
    | "task_failed";
  message: string;
  timestamp: string;
}

export type TaskEventPublisher = (
  thread: TaskThread,
  event: TaskEvent,
) => Promise<void> | void;

export interface TaskThread {
  threadId: string;
  sessionId: string;
  title: string;
  rootTaskId: string;
  status: TaskThreadStatus;
  phase: TaskThreadPhase;
  activeNodeId?: string;
  channelContext: ChannelContext;
  channelConversationId: string;
  latestUserVisibleSummary?: string;
  pauseRequested: boolean;
  cancelRequested: boolean;
  previewPlan: boolean;
  planConfirmed: boolean;
  autoAdvanceCount: number;
  maxAutoAdvanceSteps: number;
  blocked?: TaskBlockedState;
  nodes: Record<string, TaskNode>;
  events: TaskEvent[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
