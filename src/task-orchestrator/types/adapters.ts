import type { TaskNode } from "./task-node.ts";
import type { ExpandResult, TaskDraft, TaskResult } from "./task-result.ts";
import type { TaskThread } from "./task-thread.ts";

export interface PlanRootInput {
  thread: TaskThread;
  rootNode: TaskNode;
}

export interface ExecuteNodeInput {
  thread: TaskThread;
  node: TaskNode;
  prompt: string;
  resumeInput?: string;
}

export interface FinalizeInput {
  thread: TaskThread;
}

export interface RefineNodeInput {
  thread: TaskThread;
  node: TaskNode;
  instruction: string;
}

export interface TaskExecutionAdapter {
  workspaceDir?: string;
  planRoot(input: PlanRootInput): Promise<TaskDraft[]>;
  executeNode(input: ExecuteNodeInput): Promise<TaskResult>;
  finalize(input: FinalizeInput): Promise<{ summary: string }>;
  refineNode(input: RefineNodeInput): Promise<ExpandResult>;
}
