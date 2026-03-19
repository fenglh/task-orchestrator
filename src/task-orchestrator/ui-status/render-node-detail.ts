import type { TaskNodeDetailView } from "../types/task-status-view.ts";

export function renderNodeDetail(view: TaskNodeDetailView): string {
  const lines = [
    `Node: ${view.node.displayPath} ${view.node.title}`,
    `Status: ${view.node.status}`,
    `Goal: ${view.node.goal}`,
    `Success criteria: ${view.node.successCriteria}`,
  ];

  if (view.node.userVisibleSummary) {
    lines.push(`Summary: ${view.node.userVisibleSummary}`);
  }

  if (view.node.report) {
    lines.push(`Report: ${view.node.report}`);
  }

  if (view.node.children.length > 0) {
    lines.push("Children:");
    for (const child of view.node.children) {
      lines.push(`- ${child.displayPath}. ${child.title} [${child.status}]`);
    }
  }

  return lines.join("\n");
}
