import type {
  NodeCompletionContract,
  NodeCompletionEvidence,
} from "./completion-contract.ts";

export interface TaskDraft {
  title: string;
  goal: string;
  successCriteria: string;
  completionContract?: NodeCompletionContract;
}

export interface DoneResult {
  status: "done";
  report: string;
  userVisibleSummary?: string;
  evidence?: string[];
  artifacts?: string[];
  completionEvidence?: NodeCompletionEvidence;
}

export interface ExpandResult {
  status: "expand";
  reason: string;
  mode: "replace" | "suspend";
  newTasks: TaskDraft[];
}

export interface BlockedResult {
  status: "blocked";
  question: string;
  requiredInputSchema?: Record<string, unknown>;
  whyBlocked: string;
  suggestedActions?: string[];
}

export interface FailedResult {
  status: "failed";
  reason: string;
  retryable: boolean;
  diagnostics?: string[];
}

export type TaskResult =
  | DoneResult
  | ExpandResult
  | BlockedResult
  | FailedResult;
