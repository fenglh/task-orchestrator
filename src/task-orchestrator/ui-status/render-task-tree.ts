import type {
  TaskTreeNodeView,
  TaskTreeView,
} from "../types/task-status-view.ts";

function describeEvidenceStatus(status?: string): string {
  switch (status) {
    case "needs_review":
      return "⚠️ 建议复核";
    case "partial":
      return "⚠️ 部分通过";
    case "failed":
      return "❌ 检查失败";
    case "passed":
      return "✅ 检查通过";
    default:
      return status ? `evidence=${status}` : "";
  }
}

function renderNode(node: TaskTreeNodeView, indent: string): string[] {
  const evidenceText = describeEvidenceStatus(node.completionEvidenceStatus);
  const evidenceSuffix = evidenceText ? ` {${evidenceText}}` : "";
  const marker = node.isCurrentNode ? "👉 " : node.isSuggestedNode ? "⭐ " : node.isInCurrentPath ? "↳ " : "";
  const lines = [`${indent}- ${marker}${node.displayPath}. ${node.title} [${node.status}]${evidenceSuffix}`];

  for (const child of node.children) {
    lines.push(...renderNode(child, `${indent}  `));
  }

  return lines;
}

export function renderTaskTree(view: TaskTreeView): string {
  const lines = [
    `任务：${view.title}`,
    `状态：${view.status}`,
  ];

  if (view.currentNodeRef && view.currentNodeTitle) {
    lines.push(`当前节点：${view.currentNodeRef} ${view.currentNodeTitle}`);
  }

  if (view.currentPath.length > 0) {
    lines.push(`当前路径：${view.currentPath.join(" > ")}`);
  }

  if (view.suggestedNodeRef && view.suggestedNodeTitle) {
    lines.push(`推荐查看节点：${view.suggestedNodeRef} ${view.suggestedNodeTitle}`);
  }

  lines.push("图例：👉 当前节点 · ⭐ 推荐查看节点 · ↳ 当前路径 · ⚠️ 建议复核 · ⚠️ 部分通过 · ❌ 检查失败 · ✅ 检查通过");

  for (const node of view.tree) {
    lines.push(...renderNode(node, ""));
  }

  return lines.join("\n");
}
