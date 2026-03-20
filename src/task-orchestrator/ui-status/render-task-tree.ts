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

function flattenNodes(nodes: TaskTreeNodeView[], bucket: TaskTreeNodeView[] = []): TaskTreeNodeView[] {
  for (const node of nodes) {
    bucket.push(node);
    if (node.children.length > 0) flattenNodes(node.children, bucket);
  }
  return bucket;
}

function renderNodeLine(node: TaskTreeNodeView): string {
  const parts = [`节点 ${node.displayPath}`, node.title, nodeStatusLabel(node.status)];
  const evidence = evidenceStatusLabel(node.completionEvidenceStatus);
  if (evidence && evidence !== "检查通过") parts.push(evidence);
  return `- ${parts.join(" · ")}`;
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

  const flatNodes = flattenNodes(view.tree);
  const suggestedKey = view.suggestedNodeRef && view.suggestedNodeTitle
    ? `${view.suggestedNodeRef} ${view.suggestedNodeTitle}`
    : null;
  const suggestedNode = suggestedKey
    ? flatNodes.find((node) => `${node.displayPath} ${node.title}` === suggestedKey)
    : undefined;
  const otherNodes = flatNodes.filter((node) => node !== suggestedNode);

  if (suggestedNode) {
    lines.push("", "## 建议先看", renderNodeLine(suggestedNode));
  }

  if (otherNodes.length) {
    lines.push("", "## 其他节点");
    for (const node of otherNodes) {
      lines.push(renderNodeLine(node));
    }
  }

  return lines.join("\n");
}
