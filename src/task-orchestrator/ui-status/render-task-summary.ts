import type { TaskSummaryView } from "../types/task-status-view.ts";

export function renderTaskSummary(view: TaskSummaryView): string {
  const lines = [
    `Task: ${view.title}`,
    `Status: ${view.status}`,
    `Progress: ${view.progress.done}/${view.progress.total}`,
  ];

  if (view.currentNode) {
    lines.push(
      `Current node: ${view.currentNode.displayPath} ${view.currentNode.title}`,
    );
  }

  if (view.blocked) {
    lines.push(`Blocked: ${view.blocked.question}`);
  }

  if (view.status === "awaiting_plan_confirmation") {
    lines.push("Plan ready: review the task tree, then use `/task resume` to start execution.");
  }

  if (view.latestSummary) {
    lines.push(`Latest update: ${view.latestSummary}`);
  }

  return lines.join("\n");
}
