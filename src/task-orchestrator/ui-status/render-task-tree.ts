import type { TaskTreeNodeView, TaskTreeView } from "../types/task-status-view.ts";

function threadStatusLabel(status?: string): string {
  switch (status) {
    case "pending":
      return "待处理";
    case "running":
      return "进行中";
    case "waiting_human":
      return "等待你的输入";
    case "awaiting_plan_confirmation":
      return "等待你确认开始";
    case "awaiting_finish_confirmation":
      return "等待你确认是否结束";
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
      return "⚠️ 建议复核";
    case "partial":
      return "⚠️ 部分通过";
    case "failed":
      return "❌ 检查失败";
    case "passed":
      return "✅ 检查通过";
    default:
      return status ? `证据状态=${status}` : "";
  }
}

function renderNode(node: TaskTreeNodeView, indent: string): string[] {
  const evidenceText = evidenceStatusLabel(node.completionEvidenceStatus);
  const evidenceSuffix = evidenceText ? ` {${evidenceText}}` : "";
  const marker = node.isCurrentNode ? "👉 " : node.isSuggestedNode ? "⭐ " : node.isInCurrentPath ? "↳ " : "";
  const lines = [`${indent}- ${marker}${node.displayPath}. ${node.title} [${nodeStatusLabel(node.status)}]${evidenceSuffix}`];
  for (const child of node.children) {
    lines.push(...renderNode(child, `${indent}  `));
  }
  return lines;
}

function displayTaskTitle(view: Pick<TaskTreeView, "title" | "rootGoal">): string {
  const title = String(view.title || "").trim();
  const rootGoal = String(view.rootGoal || "").trim();
  if (title.endsWith("...") && rootGoal) return rootGoal;
  return title || rootGoal || "未命名任务";
}

export function renderTaskTree(view: TaskTreeView): string {
  const lines = [
    "# 任务树",
    "",
    "## 任务信息",
    `- **任务**：${displayTaskTitle(view)}`,
    `- **状态**：${threadStatusLabel(view.status)}`,
  ];

  if (view.status === "awaiting_plan_confirmation") {
    lines.push("", "## 说明", "- 计划已生成，尚未执行，正在等待你确认开始。");
  }

  if (view.status === "awaiting_finish_confirmation") {
    lines.push("", "## 说明", "- 执行链已跑完，但系统检测到仍需人工复核的结果，正在等待你确认是否结束。");
  }

  if (view.currentNodeRef && view.currentNodeTitle) {
    lines.push("", "## 当前节点", `- **节点**：${view.currentNodeRef} ${view.currentNodeTitle}`);
  }

  if (view.currentPath.length > 0) {
    lines.push("", "## 当前路径", `- ${"`"}${view.currentPath.join(" > ")}${"`"}`);
  }

  if (view.suggestedNodeRef && view.suggestedNodeTitle) {
    lines.push("", "## 推荐查看节点", `- **节点**：${view.suggestedNodeRef} ${view.suggestedNodeTitle}`);
  }

  lines.push(
    "",
    "## 图例",
    "- 👉 当前节点",
    "- ⭐ 推荐查看节点",
    "- ↳ 当前路径",
    "- ⚠️ 建议复核",
    "- ❌ 检查失败",
    "- ✅ 检查通过",
    "",
    "## 节点列表",
  );

  for (const node of view.tree) {
    lines.push(...renderNode(node, ""));
  }

  return lines.join("\n");
}
