import type { ExecuteNodeInput } from "../types/adapters.ts";

export function buildExecuteNodePrompt(input: ExecuteNodeInput): string {
  const lines = [
    "TASK_KIND: EXECUTE_NODE",
    "Execute only the current task node.",
    `Node title: ${input.node.title}`,
    `Node goal: ${input.node.goal}`,
    `Success criteria: ${input.node.successCriteria}`,
    input.prompt,
    "Return JSON only.",
    'Schema: {"status":"done|expand|blocked|failed", "...":"..."}',
    'For "done": include {"report":"string","userVisibleSummary":"string","evidence":["string"],"artifacts":["string"]}',
    'For "expand": include {"reason":"string","mode":"replace|suspend","newTasks":[{"title":"string","goal":"string","successCriteria":"string"}]}',
    'For "blocked": include {"question":"string","whyBlocked":"string","requiredInputSchema":{},"suggestedActions":["string"]}',
    'For "failed": include {"reason":"string","retryable":true,"diagnostics":["string"]}',
  ];

  if (input.resumeInput) {
    lines.push(`User supplied resume input: ${input.resumeInput}`);
  }

  return lines.join("\n");
}
