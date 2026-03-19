import type { RefineNodeInput } from "../types/adapters.ts";

export function buildRefineNodePrompt(input: RefineNodeInput): string {
  return [
    "TASK_KIND: REFINE_NODE",
    "Refine the specified task node into smaller executable child tasks.",
    `Node title: ${input.node.title}`,
    `Node goal: ${input.node.goal}`,
    `Success criteria: ${input.node.successCriteria}`,
    `User instruction: ${input.instruction}`,
    "Do not execute the node. Only produce a finer-grained breakdown.",
    "Return JSON only.",
    'Schema: {"status":"expand","reason":"string","mode":"replace|suspend","newTasks":[{"title":"string","goal":"string","successCriteria":"string"}]}',
  ].join("\n");
}
