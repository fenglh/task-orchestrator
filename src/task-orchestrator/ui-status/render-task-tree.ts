import type { TaskTreeNodeView, TaskTreeView } from "../types/task-status-view.ts";

function threadStatusLabel(status?: string): string {
  switch (status) {
    case "pending":
      return "待处理";
    case "running":
      return "进行中";
    case "waiting_human":
      return "等待输入";
    case "awaiting_plan_confirmation":
      return "待确认开始";
    case "awaiting_finish_confirmation":
      return "待确认结束";
    case "paused":
      return "已暂停";
    case "finished":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status ?? "未知";
  }
}

function nodeStatusLabel(status?: string): string {
  switch (status) {
    case "pending":
      return "待处理";
    case "running":
      return "进行中";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
    case "blocked":
      return "阻塞";
    case "waiting_children":
      return "等待子任务";
    case "cancelled":
      return "已跳过";
    default:
      return status ?? "未知";
  }
}

function evidenceStatusLabel(status?: string): string {
  switch (status) {
    case "needs_review":
      return "⚠️";
    case "partial":
      return "⚠️";
    case "failed":
      return "❌";
    case "passed":
      return "✅";
    default:
      return "";
  }
}

function renderNode(node: TaskTreeNodeView, indent: string): string[] {
  const marker = node.isSuggestedNode ? "⭐ " : node.isCurrentNode ? "👉 " : "";
  const evidence = evidenceStatusLabel(node.completionEvidenceStatus);
  const evidenceSuffix = evidence ? ` ${evidence}` : "";
  const lines = [`${indent}- ${marker}${node.displayPath}. ${node.title}（${nodeStatusLabel(node.status)}）${evidenceSuffix}`];
  for (const child of node.children) {
    lines.push(...renderNode(child, `${indent}  `));
  }
  return lines;
}

function taskText(view: Pick<TaskTreeView, "title" | "rootGoal">): string {
  const title = String(view.title || "").trim();
  const rootGoal = String(view.rootGoal || "").trim();
  if (title.endsWith("...") && rootGoal) return rootGoal;
  return title || rootGoal || "未命名任务";
}

function displayTaskTitle(view: Pick<TaskTreeView, "title" | "rootGoal">): string {
  const full = taskText(view);
  return full.length > 36 ? `${full.slice(0, 36).trim()}…` : full;
}

export function renderTaskTree(view: TaskTreeView): string {
  const lines = [
    "# 任务树",
    "",
    "## 任务",
    `- **名称**：${displayTaskTitle(view)}`,
    `- **状态**：${threadStatusLabel(view.status)}`,
  ];

  const fullTaskText = taskText(view);
  if (fullTaskText !== displayTaskTitle(view)) {
    lines.push("- **完整任务**：", "```text", fullTaskText, "```");
  }

  if (view.suggestedNodeRef && view.suggestedNodeTitle) {
    lines.push("", "## 建议先看", `- **${view.suggestedNodeRef} ${view.suggestedNodeTitle}**`);
  }

  lines.push("", "## 节点列表");
  for (const node of view.tree) {
    lines.push(...renderNode(node, ""));
  }

  return lines.join("\n");
}
