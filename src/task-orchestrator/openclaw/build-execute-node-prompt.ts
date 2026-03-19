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
    'For "done": include {"report":"string","userVisibleSummary":"string","evidence":["string"],"artifacts":["string"],"completionEvidence":{"status":"passed|failed|partial|blocked|needs_review|not_evaluated","outputs":[{"type":"string","path":"string","field":"string","summary":"string"}],"checkResults":[{"checkId":"string","status":"passed|failed|skipped","detail":"string"}],"verifierSummary":"string","reviewMode":"auto|auto_with_warning|needs_review","generatedAt":"ISO-8601 string"}}',
    'If the node already has a completionContract, try to make completionEvidence consistent with that contract instead of inventing unrelated evidence.',
    'For "expand": include {"reason":"string","mode":"replace|suspend","newTasks":[{"title":"string","goal":"string","successCriteria":"string","completionContract":{"objective":"string","outcomeType":"file_write|file_edit|structured_response|analysis_summary|state_update|external_action|research_note|unknown","expectedArtifacts":[],"acceptanceChecks":[],"reviewMode":"auto|auto_with_warning|needs_review","failureHints":{"commonFailureModes":["string"]}}}]}',
    'When expanding dynamically, each child task should include a completionContract whenever possible. For open-ended child tasks, prefer reviewMode=needs_review instead of pretending they are fully auto-verifiable.',
    'For "blocked": include {"question":"string","whyBlocked":"string","requiredInputSchema":{},"suggestedActions":["string"]}',
    'For "failed": include {"reason":"string","retryable":true,"diagnostics":["string"]}',
  ];

  if (input.resumeInput) {
    lines.push(`User supplied resume input: ${input.resumeInput}`);
  }

  return lines.join("\n");
}
