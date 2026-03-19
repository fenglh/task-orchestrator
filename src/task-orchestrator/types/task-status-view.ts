import type { TaskNodeStatus } from "./task-node.ts";
import type { TaskThreadStatus } from "./task-thread.ts";
import type {
  NodeCompletionContract,
  NodeCompletionEvidence,
} from "./completion-contract.ts";

export type TaskStatusViewKind = "summary" | "tree" | "node";

export interface TaskProgressView {
  done: number;
  total: number;
}

export interface TaskSummaryView {
  kind: "summary";
  threadId: string;
  title: string;
  status: TaskThreadStatus;
  currentNode?: {
    id: string;
    displayPath: string;
    title: string;
  };
  progress: TaskProgressView;
  blocked?: {
    question: string;
    whyBlocked: string;
    suggestedActions?: string[];
  };
  latestSummary?: string;
  updatedAt: string;
}

export interface TaskTreeNodeView {
  id: string;
  displayPath: string;
  title: string;
  status: TaskNodeStatus;
  children: TaskTreeNodeView[];
}

export interface TaskTreeView {
  kind: "tree";
  threadId: string;
  title: string;
  status: TaskThreadStatus;
  currentPath: string[];
  tree: TaskTreeNodeView[];
  updatedAt: string;
}

export interface TaskNodeDetailView {
  kind: "node";
  threadId: string;
  node: {
    id: string;
    displayPath: string;
    title: string;
    goal: string;
    successCriteria: string;
    status: TaskNodeStatus;
    report?: string;
    userVisibleSummary?: string;
    completionContract?: NodeCompletionContract;
    completionEvidence?: NodeCompletionEvidence;
    evidence: string[];
    children: Array<{
      id: string;
      displayPath: string;
      title: string;
      status: TaskNodeStatus;
    }>;
  };
  updatedAt: string;
}

export type TaskStatusView =
  | TaskSummaryView
  | TaskTreeView
  | TaskNodeDetailView;

