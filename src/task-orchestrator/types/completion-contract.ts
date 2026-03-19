/**
 * 动态节点完成契约与完成证据机制 v1
 *
 * 说明：
 * - 节点内容是动态生成的，因此不能为每一种任务预写固定验收规则。
 * - 平台层应提供固定的协议结构与通用检查原语。
 * - 每个节点在生成时动态声明自己的完成契约（completion contract）。
 * - 每个节点在执行后记录完成证据（completion evidence）。
 */

/**
 * 节点交付结果的大类。
 * 不是具体业务类型，而是 verifier 可理解的交付形态。
 */
export type TaskOutcomeType =
  | "file_write"
  | "file_edit"
  | "structured_response"
  | "analysis_summary"
  | "state_update"
  | "external_action"
  | "research_note"
  | "unknown";

/**
 * 节点复核模式：
 * - auto: 自动验收通过即可算完成
 * - auto_with_warning: 自动验收为主，但允许带弱告警通过
 * - needs_review: 系统收集证据，但最终建议人工复核
 */
export type ReviewMode = "auto" | "auto_with_warning" | "needs_review";

/** 文件类产物期望 */
export interface FileArtifactExpectation {
  type: "file";
  path: string;
  required?: boolean;
}

/** 结构化响应字段类产物期望 */
export interface ResponseFieldArtifactExpectation {
  type: "response_field";
  field: string;
  required?: boolean;
}

/** 状态变化类产物期望 */
export interface StateChangeArtifactExpectation {
  type: "state_change";
  target: string;
  expectation: string;
  required?: boolean;
}

/** 命令/动作结果类产物期望 */
export interface CommandResultArtifactExpectation {
  type: "command_result";
  commandLabel: string;
  required?: boolean;
}

/** 节点期望产物 */
export type ExpectedArtifact =
  | FileArtifactExpectation
  | ResponseFieldArtifactExpectation
  | StateChangeArtifactExpectation
  | CommandResultArtifactExpectation;

/** 文件存在检查 */
export interface FileExistsCheck {
  kind: "file_exists";
  path: string;
}

/** 文件非空检查 */
export interface FileNonemptyCheck {
  kind: "file_nonempty";
  path: string;
}

/** JSON 可解析检查 */
export interface JsonParseableCheck {
  kind: "json_parseable";
  path?: string;
  field?: string;
}

/** JSON 必含字段检查 */
export interface JsonHasKeysCheck {
  kind: "json_has_keys";
  path?: string;
  field?: string;
  keys: string[];
}

/** markdown 章节存在检查 */
export interface MarkdownSectionsPresentCheck {
  kind: "markdown_sections_present";
  path: string;
  sections: string[];
}

/** 文本最小长度检查 */
export interface TextMinLengthCheck {
  kind: "text_min_length";
  path?: string;
  field?: string;
  minLength: number;
}

/** 观察到工具调用（后续 phase 更适合真正接 runtime） */
export interface ToolCallObservedCheck {
  kind: "tool_call_observed";
  tool: string;
}

/** 观察到产物被修改（后续 phase） */
export interface ArtifactModifiedCheck {
  kind: "artifact_modified";
  path: string;
}

/** 命令执行成功（后续 phase） */
export interface CommandExitSuccessCheck {
  kind: "command_exit_success";
  commandLabel: string;
}

/** 平台提供的通用验收检查原语 */
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

/** 节点可提前声明的失败提示 */
export interface CompletionFailureHints {
  commonFailureModes?: string[];
}

/**
 * 动态节点完成契约：节点在执行前自声明
 * “我要交付什么、系统怎么验收、哪些要人工复核”。
 */
export interface NodeCompletionContract {
  objective?: string;
  outcomeType?: TaskOutcomeType;
  expectedArtifacts?: ExpectedArtifact[];
  acceptanceChecks?: AcceptanceCheck[];
  reviewMode?: ReviewMode;
  failureHints?: CompletionFailureHints;
}

/**
 * 完成证据状态：
 * 先用在 evidence 层，不要求 v1 立刻扩展所有 node status。
 */
export type CompletionEvidenceStatus =
  | "passed"
  | "failed"
  | "partial"
  | "blocked"
  | "needs_review"
  | "not_evaluated";

/** 实际产出证据 */
export interface CompletionOutputEvidence {
  type: string;
  path?: string;
  field?: string;
  summary?: string;
}

/** 单条检查结果 */
export interface AcceptanceCheckResult {
  checkId: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
}

/**
 * 节点完成证据：节点执行后由系统记录
 * “实际产出了什么、检查结果如何、最终应如何理解”。
 */
export interface RuntimeEvidenceDetails {
  toolCalls?: string[];
  modifiedArtifacts?: string[];
  commandLabels?: string[];
}

export interface NodeCompletionEvidence {
  status: CompletionEvidenceStatus;
  outputs: CompletionOutputEvidence[];
  checkResults: AcceptanceCheckResult[];
  verifierSummary: string;
  reviewMode?: ReviewMode;
  runtimeEvidence?: RuntimeEvidenceDetails;
  generatedAt: string;
}
