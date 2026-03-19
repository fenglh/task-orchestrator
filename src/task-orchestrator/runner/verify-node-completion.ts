import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AcceptanceCheck,
  AcceptanceCheckResult,
  NodeCompletionContract,
  NodeCompletionEvidence,
} from "../types/completion-contract.ts";
import type { DoneResult } from "../types/task-result.ts";
import type { TaskNode } from "../types/task-node.ts";

interface VerifyNodeCompletionInput {
  node: TaskNode;
  result: DoneResult;
  workspaceDir?: string;
  now: string;
}

function buildCheckId(check: AcceptanceCheck): string {
  switch (check.kind) {
    case "file_exists":
    case "file_nonempty":
    case "markdown_sections_present":
    case "artifact_modified":
      return `${check.kind}:${check.path}`;
    case "json_parseable":
    case "json_has_keys":
    case "text_min_length":
      return `${check.kind}:${check.path ?? check.field ?? "inline"}`;
    case "tool_call_observed":
      return `${check.kind}:${check.tool}`;
    case "command_exit_success":
      return `${check.kind}:${check.commandLabel}`;
  }
}

async function readTextFromCheck(
  check: AcceptanceCheck,
  result: DoneResult,
  workspaceDir?: string,
): Promise<string | undefined> {
  if ("field" in check && check.field) {
    const fieldValue = (result as Record<string, unknown>)[check.field];
    return typeof fieldValue === "string" ? fieldValue : undefined;
  }

  if ("path" in check && check.path && workspaceDir) {
    const absolutePath = resolve(workspaceDir, check.path);
    return readFile(absolutePath, "utf8");
  }

  return undefined;
}

async function runCheck(
  check: AcceptanceCheck,
  result: DoneResult,
  workspaceDir?: string,
): Promise<AcceptanceCheckResult> {
  try {
    switch (check.kind) {
      case "file_exists": {
        const text = await readTextFromCheck(check, result, workspaceDir);
        return {
          checkId: buildCheckId(check),
          status: typeof text === "string" ? "passed" : "failed",
          detail: typeof text === "string" ? "文件存在" : "文件不存在或无法读取",
        };
      }
      case "file_nonempty": {
        const text = await readTextFromCheck(check, result, workspaceDir);
        return {
          checkId: buildCheckId(check),
          status: typeof text === "string" && text.trim().length > 0 ? "passed" : "failed",
          detail:
            typeof text === "string" && text.trim().length > 0
              ? "文件非空"
              : "文件为空、文件不存在或无法读取",
        };
      }
      case "json_has_keys": {
        const text = await readTextFromCheck(check, result, workspaceDir);
        if (typeof text !== "string") {
          return {
            checkId: buildCheckId(check),
            status: "failed",
            detail: "未找到可用于 JSON 校验的文本",
          };
        }
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const missing = check.keys.filter((key) => !(key in parsed));
        return {
          checkId: buildCheckId(check),
          status: missing.length === 0 ? "passed" : "failed",
          detail: missing.length === 0 ? "JSON 包含所需字段" : `缺少字段: ${missing.join(", ")}`,
        };
      }
      case "markdown_sections_present": {
        const text = await readTextFromCheck(check, result, workspaceDir);
        if (typeof text !== "string") {
          return {
            checkId: buildCheckId(check),
            status: "failed",
            detail: "未找到可用于章节校验的文本",
          };
        }
        const missing = check.sections.filter(
          (section) => !text.includes(`# ${section}`) && !text.includes(`## ${section}`) && !text.includes(section),
        );
        return {
          checkId: buildCheckId(check),
          status: missing.length === 0 ? "passed" : "failed",
          detail: missing.length === 0 ? "包含所需章节" : `缺少章节: ${missing.join(", ")}`,
        };
      }
      case "text_min_length": {
        const text = await readTextFromCheck(check, result, workspaceDir);
        const length = typeof text === "string" ? text.trim().length : 0;
        return {
          checkId: buildCheckId(check),
          status: length >= check.minLength ? "passed" : "failed",
          detail: `文本长度=${length}，要求>=${check.minLength}`,
        };
      }
      case "json_parseable": {
        const text = await readTextFromCheck(check, result, workspaceDir);
        if (typeof text !== "string") {
          return {
            checkId: buildCheckId(check),
            status: "failed",
            detail: "未找到可用于 JSON 解析的文本",
          };
        }
        JSON.parse(text);
        return {
          checkId: buildCheckId(check),
          status: "passed",
          detail: "JSON 可成功解析",
        };
      }
      default:
        return {
          checkId: buildCheckId(check),
          status: "skipped",
          detail: `当前 verifier 尚未实现 ${check.kind}`,
        };
    }
  } catch (error) {
    return {
      checkId: buildCheckId(check),
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function mergeContract(
  nodeContract?: NodeCompletionContract,
  resultEvidence?: NodeCompletionEvidence,
): NodeCompletionContract | undefined {
  if (!nodeContract && !resultEvidence) {
    return undefined;
  }

  return nodeContract;
}

export async function verifyNodeCompletion(
  input: VerifyNodeCompletionInput,
): Promise<NodeCompletionEvidence | undefined> {
  const contract = mergeContract(input.node.completionContract, input.result.completionEvidence);
  const fallbackEvidence = input.result.completionEvidence;

  if (!contract?.acceptanceChecks?.length) {
    if (fallbackEvidence) {
      return fallbackEvidence;
    }

    return undefined;
  }

  const checkResults = await Promise.all(
    contract.acceptanceChecks.map((check) => runCheck(check, input.result, input.workspaceDir)),
  );

  const failedCount = checkResults.filter((item) => item.status === "failed").length;
  const passedCount = checkResults.filter((item) => item.status === "passed").length;

  const status =
    failedCount > 0
      ? passedCount > 0
        ? "partial"
        : "failed"
      : contract.reviewMode === "needs_review"
        ? "needs_review"
        : "passed";

  return {
    status,
    outputs:
      fallbackEvidence?.outputs ??
      (input.result.artifacts ?? []).map((path) => ({
        type: "artifact",
        path,
      })),
    checkResults,
    verifierSummary:
      failedCount > 0
        ? `共 ${failedCount} 项检查失败，${passedCount} 项通过`
        : contract.reviewMode === "needs_review"
          ? "自动检查已通过，但该节点仍建议人工复核"
          : `共 ${passedCount} 项检查通过`,
    reviewMode: contract.reviewMode,
    generatedAt: input.now,
  };
}
