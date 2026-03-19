export type TaskOutcomeType =
  | "file_write"
  | "file_edit"
  | "structured_response"
  | "analysis_summary"
  | "state_update"
  | "external_action"
  | "research_note"
  | "unknown";

export type ReviewMode = "auto" | "auto_with_warning" | "needs_review";

export interface FileArtifactExpectation {
  type: "file";
  path: string;
  required?: boolean;
}

export interface ResponseFieldArtifactExpectation {
  type: "response_field";
  field: string;
  required?: boolean;
}

export interface StateChangeArtifactExpectation {
  type: "state_change";
  target: string;
  expectation: string;
  required?: boolean;
}

export interface CommandResultArtifactExpectation {
  type: "command_result";
  commandLabel: string;
  required?: boolean;
}

export type ExpectedArtifact =
  | FileArtifactExpectation
  | ResponseFieldArtifactExpectation
  | StateChangeArtifactExpectation
  | CommandResultArtifactExpectation;

export interface FileExistsCheck {
  kind: "file_exists";
  path: string;
}

export interface FileNonemptyCheck {
  kind: "file_nonempty";
  path: string;
}

export interface JsonParseableCheck {
  kind: "json_parseable";
  path?: string;
  field?: string;
}

export interface JsonHasKeysCheck {
  kind: "json_has_keys";
  path?: string;
  field?: string;
  keys: string[];
}

export interface MarkdownSectionsPresentCheck {
  kind: "markdown_sections_present";
  path: string;
  sections: string[];
}

export interface TextMinLengthCheck {
  kind: "text_min_length";
  path?: string;
  field?: string;
  minLength: number;
}

export interface ToolCallObservedCheck {
  kind: "tool_call_observed";
  tool: string;
}

export interface ArtifactModifiedCheck {
  kind: "artifact_modified";
  path: string;
}

export interface CommandExitSuccessCheck {
  kind: "command_exit_success";
  commandLabel: string;
}

export type AcceptanceCheck =
  | FileExistsCheck
  | FileNonemptyCheck
  | JsonParseableCheck
  | JsonHasKeysCheck
  | MarkdownSectionsPresentCheck
  | TextMinLengthCheck
  | ToolCallObservedCheck
  | ArtifactModifiedCheck
  | CommandExitSuccessCheck;

export interface CompletionFailureHints {
  commonFailureModes?: string[];
}

export interface NodeCompletionContract {
  objective?: string;
  outcomeType?: TaskOutcomeType;
  expectedArtifacts?: ExpectedArtifact[];
  acceptanceChecks?: AcceptanceCheck[];
  reviewMode?: ReviewMode;
  failureHints?: CompletionFailureHints;
}

export type CompletionEvidenceStatus =
  | "passed"
  | "failed"
  | "partial"
  | "blocked"
  | "needs_review"
  | "not_evaluated";

export interface CompletionOutputEvidence {
  type: string;
  path?: string;
  field?: string;
  summary?: string;
}

export interface AcceptanceCheckResult {
  checkId: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
}

export interface NodeCompletionEvidence {
  status: CompletionEvidenceStatus;
  outputs: CompletionOutputEvidence[];
  checkResults: AcceptanceCheckResult[];
  verifierSummary: string;
  reviewMode?: ReviewMode;
  generatedAt: string;
}
