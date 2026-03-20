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
      return "⏳";
    case "running":
      return "▶️";
    case "done":
      return "✅";
    case "failed":
      return "❌";
    case "blocked":
      return "⛔";
    case "waiting_children":
      return "⏳";
    case "cancelled":
      return "⏭️";
    default:
      return "•";
  }
}

function evidenceStatusLabel(status?: string): string {
  switch (status) {
    case "needs_review":
      return "建议复核";
    case "partial":
      return "部分通过";
    case "failed":
      return "检查失败";
    case "passed":
      return "检查通过";
    default:
      return "";
  }
}

function renderNode(node: TaskTreeNodeView, indent = ""): string[] {
  const status = nodeStatusLabel(node.status);
  const lines = [`${indent}- ${status}节点${node.displayPath}：${node.title}`];

  const notes: string[] = [];
  const evidence = evidenceStatusLabel(node.completionEvidenceStatus);
  if (evidence && evidence !== "检查通过") notes.push(evidence);
  if (node.isSuggestedNode) notes.push("建议先看");

  if (notes.length) {
    lines.push(`${indent}  > ${notes.join(" · ")}`);
  }

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

  lines.push("", "## 任务结构");
  for (const node of view.tree) {
    lines.push(...renderNode(node));
  }

  return lines.join("\n");
}
