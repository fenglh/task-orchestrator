import type { PlanRootInput } from "../types/adapters.ts";

export function buildPlanRootPrompt(input: PlanRootInput): string {
  return [
    "TASK_KIND: PLAN_ROOT",
    "You are planning the top-level execution steps for a complex task.",
    `Task title: ${input.rootNode.title}`,
    `Task goal: ${input.rootNode.goal}`,
    `Success criteria: ${input.rootNode.successCriteria}`,
    "Return JSON only.",
    'Schema: {"tasks":[{"title":"string","goal":"string","successCriteria":"string","completionContract":{"objective":"string","outcomeType":"file_write|file_edit|structured_response|analysis_summary|state_update|external_action|research_note|unknown","expectedArtifacts":[],"acceptanceChecks":[],"reviewMode":"auto|auto_with_warning|needs_review","failureHints":{"commonFailureModes":["string"]}}}]}',
    "For each planned task, include a completionContract when you can clearly describe: what will be delivered, how the system can check it, and whether human review is needed.",
    "If the task is too open-ended to fully auto-verify, still provide a minimal completionContract and set reviewMode=needs_review.",
  ].join("\n");
}
