import type {
  TaskTreeNodeView,
  TaskTreeView,
} from "../types/task-status-view.ts";

function describeEvidenceStatus(status?: string): string {
  switch (status) {
    case "needs_review":
      return "⚠️ review";
    case "partial":
      return "⚠️ partial";
    case "failed":
      return "❌ failed-checks";
    case "passed":
      return "✅ checks-pass";
    default:
      return status ? `evidence=${status}` : "";
  }
}

function renderNode(node: TaskTreeNodeView, indent: string): string[] {
  const evidenceText = describeEvidenceStatus(node.completionEvidenceStatus);
  const evidenceSuffix = evidenceText ? ` {${evidenceText}}` : "";
  const pathMarker = node.isCurrentNode ? "👉 " : node.isInCurrentPath ? "↳ " : "";
  const lines = [`${indent}- ${pathMarker}${node.displayPath}. ${node.title} [${node.status}]${evidenceSuffix}`];

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

  if (view.currentNodeRef && view.currentNodeTitle) {
    lines.push(`Current node: ${view.currentNodeRef} ${view.currentNodeTitle}`);
  }

  if (view.currentPath.length > 0) {
    lines.push(`Current path: ${view.currentPath.join(" > ")}`);
  }

  lines.push("Legend: 👉 current node · ↳ current path · ⚠️ review · ⚠️ partial · ❌ failed-checks · ✅ checks-pass");

  for (const node of view.tree) {
    lines.push(...renderNode(node, ""));
  }

  return lines.join("\n");
}
