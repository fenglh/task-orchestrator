import type { PlanRootInput } from "../types/adapters.ts";

export function buildPlanRootPrompt(input: PlanRootInput): string {
  return [
    "TASK_KIND: PLAN_ROOT",
    "You are planning the top-level execution steps for a complex task.",
    `Task title: ${input.rootNode.title}`,
    `Task goal: ${input.rootNode.goal}`,
    `Success criteria: ${input.rootNode.successCriteria}`,
    "Return JSON only.",
    'Schema: {"tasks":[{"title":"string","goal":"string","successCriteria":"string"}]}',
  ].join("\n");
}
