import type { FinalizeInput } from "../types/adapters.ts";

export function buildFinalizePrompt(input: FinalizeInput): string {
  const completedNodes = Object.values(input.thread.nodes)
    .filter((node) => node.status === "done" && node.id !== input.thread.rootTaskId)
    .map((node) => `${node.displayPath} ${node.title}: ${node.userVisibleSummary ?? node.report ?? "done"}`);

  const reviewSensitiveNodes = Object.values(input.thread.nodes)
    .filter(
      (node) =>
        node.id !== input.thread.rootTaskId &&
        ["needs_review", "partial", "failed", "not_evaluated"].includes(
          node.completionEvidence?.status ?? "",
        ),
    )
    .map((node) => `${node.displayPath} ${node.title}: ${node.completionEvidence?.status}`);

  return [
    "TASK_KIND: FINALIZE",
    "Write a concise user-visible status-card summary, not a long report.",
    "Use at most 2 short sentences.",
    "Do not write like a final verdict unless the task is truly fully settled.",
    "If any node still implies human review, use tentative wording such as 当前判断 / 更像 / 基于当前分析 / 建议优先, and avoid absolute statements like 本质上就是 / 最终结论是 / 必须.",
    "Prefer: what was analyzed, the main current judgment, and the top next priority.",
    `Task title: ${input.thread.title}`,
    "Completed nodes:",
    ...completedNodes,
    "Review-sensitive nodes:",
    ...(reviewSensitiveNodes.length > 0 ? reviewSensitiveNodes : ["none"]),
    "Return JSON only.",
    'Schema: {"summary":"string"}',
  ].join("\n");
}
