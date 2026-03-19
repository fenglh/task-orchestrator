export interface TaskDraft {
  title: string;
  goal: string;
  successCriteria: string;
}

export interface DoneResult {
  status: "done";
  report: string;
  userVisibleSummary?: string;
  evidence?: string[];
  artifacts?: string[];
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
