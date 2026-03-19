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
  runtimeEvidence?: {
    toolCalls?: string[];
    modifiedArtifacts?: string[];
    commandLabels?: string[];
  };
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
  runtimeEvidence?: VerifyNodeCompletionInput["runtimeEvidence"],
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
      case "tool_call_observed": {
        const observed = runtimeEvidence?.toolCalls ?? [];
        return {
          checkId: buildCheckId(check),
          status: observed.includes(check.tool) ? "passed" : "failed",
          detail: observed.includes(check.tool)
            ? `观察到工具调用: ${check.tool}`
            : `未观察到工具调用: ${check.tool}`,
        };
      }
      case "artifact_modified": {
        const observed = runtimeEvidence?.modifiedArtifacts ?? [];
        return {
          checkId: buildCheckId(check),
          status: observed.includes(check.path) ? "passed" : "failed",
          detail: observed.includes(check.path)
            ? `观察到产物修改: ${check.path}`
            : `未观察到产物修改: ${check.path}`,
        };
      }
      case "command_exit_success": {
        const observed = runtimeEvidence?.commandLabels ?? [];
        return {
          checkId: buildCheckId(check),
          status: observed.includes(check.commandLabel) ? "passed" : "failed",
          detail: observed.includes(check.commandLabel)
            ? `观察到命令执行: ${check.commandLabel}`
            : `未观察到命令执行: ${check.commandLabel}`,
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

function mergeContract(nodeContract?: NodeCompletionContract): NodeCompletionContract | undefined {
  return nodeContract;
}

export async function verifyNodeCompletion(
  input: VerifyNodeCompletionInput,
): Promise<NodeCompletionEvidence | undefined> {
  const contract = mergeContract(input.node.completionContract);
  const fallbackEvidence = input.result.completionEvidence;

  if (!contract?.acceptanceChecks?.length) {
    if (fallbackEvidence) {
      return {
        ...fallbackEvidence,
        verifierSummary:
          fallbackEvidence.verifierSummary ||
          "未运行系统级自动校验；当前结果主要依赖节点自报证据，建议按任务复杂度决定是否人工复核",
      };
    }

    return {
      status: "needs_review",
      outputs: (input.result.artifacts ?? []).map((path) => ({
        type: "artifact",
        path,
      })),
      checkResults: [],
      verifierSummary:
        "节点未提供可执行的 acceptanceChecks；系统无法对复杂动态任务做固定规则验真，建议人工复核",
      reviewMode: input.node.completionContract?.reviewMode ?? "needs_review",
      generatedAt: input.now,
    };
  }

  const checkResults = await Promise.all(
    contract.acceptanceChecks.map((check) =>
      runCheck(check, input.result, input.workspaceDir, input.runtimeEvidence),
    ),
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
        ? `共 ${failedCount} 项检查失败，${passedCount} 项通过；这只反映可观察证据层，不代表复杂任务质量已被最终裁定`
        : contract.reviewMode === "needs_review"
          ? "自动检查已通过，但该节点仍建议人工复核；当前 verifier 只覆盖可观察证据层"
          : `共 ${passedCount} 项检查通过；当前 verifier 仅验证可观察证据与基本交付形式`,
    reviewMode: contract.reviewMode,
    generatedAt: input.now,
  };
}
