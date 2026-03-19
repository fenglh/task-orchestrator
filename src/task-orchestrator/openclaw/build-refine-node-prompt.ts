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
    'Schema: {"status":"expand","reason":"string","mode":"replace|suspend","newTasks":[{"title":"string","goal":"string","successCriteria":"string","completionContract":{"objective":"string","outcomeType":"file_write|file_edit|structured_response|analysis_summary|state_update|external_action|research_note|unknown","expectedArtifacts":[],"acceptanceChecks":[],"reviewMode":"auto|auto_with_warning|needs_review","failureHints":{"commonFailureModes":["string"]}}}]}',
    "Each refined child task should include a completionContract whenever possible.",
    "For complex or open-ended child tasks, prefer a minimal contract plus reviewMode=needs_review instead of pretending the task is fully auto-verifiable.",
  ].join("\n");
}
