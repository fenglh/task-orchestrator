import type {
  TaskTreeNodeView,
  TaskTreeView,
} from "../types/task-status-view.ts";

function renderNode(node: TaskTreeNodeView, indent: string): string[] {
  const evidenceSuffix = node.completionEvidenceStatus
    ? ` {evidence=${node.completionEvidenceStatus}}`
    : "";
  const lines = [`${indent}- ${node.displayPath}. ${node.title} [${node.status}]${evidenceSuffix}`];
  for (const child of node.children) {
    lines.push(...renderNode(child, `${indent}  `));
  }
  return lines;
}

export function renderTaskTree(view: TaskTreeView): string {
  const lines = [
    `Task: ${view.title}`,
    `Status: ${view.status}`,
  ];

  if (view.currentPath.length > 0) {
    lines.push(`Current path: ${view.currentPath.join(" > ")}`);
  }

  for (const node of view.tree) {
    lines.push(...renderNode(node, ""));
  }

  return lines.join("\n");
}
