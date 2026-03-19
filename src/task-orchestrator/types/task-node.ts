import type {
  NodeCompletionContract,
  NodeCompletionEvidence,
} from "./completion-contract.ts";

export type TaskNodeStatus =
  | "pending"
  | "running"
  | "waiting_children"
  | "blocked"
  | "done"
  | "failed"
  | "cancelled";

export interface TaskNode {
  id: string;
  displayPath: string;
  parentId?: string;
  revisesNodeId?: string;
  title: string;
  goal: string;
  successCriteria: string;
  completionContract?: NodeCompletionContract;
  completionEvidence?: NodeCompletionEvidence;
  status: TaskNodeStatus;
  children: string[];
  report?: string;
  userVisibleSummary?: string;
  needsResume: boolean;
  pendingResumeInput?: string;
  expandMode?: "replace" | "suspend";
  depth: number;
  evidence: string[];
  artifacts: string[];
  startedAt?: string;
  finishedAt?: string;
}
