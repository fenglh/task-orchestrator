import type { FinalizeInput } from "../types/adapters.ts";

export function buildFinalizePrompt(input: FinalizeInput): string {
  const completedNodes = Object.values(input.thread.nodes)
    .filter((node) => node.status === "done" && node.id !== input.thread.rootTaskId)
    .map((node) => `${node.displayPath} ${node.title}: ${node.userVisibleSummary ?? node.report ?? "done"}`);

  return [
    "TASK_KIND: FINALIZE",
    "Summarize the finished task in a concise user-visible way.",
    `Task title: ${input.thread.title}`,
    "Completed nodes:",
    ...completedNodes,
    "Return JSON only.",
    'Schema: {"summary":"string"}',
  ].join("\n");
}
