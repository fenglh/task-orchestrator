import type {
  TaskTreeNodeView,
  TaskTreeView,
} from "../types/task-status-view.ts";

function describePlanNodeStatus(status: string): string {
  switch (status) {
    case "pending":
      return "待执行";
    case "running":
      return "执行中";
    case "waiting_children":
      return "等待子任务";
    case "waiting_human":
      return "等待输入";
    case "blocked":
      return "已阻塞";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function renderPlanNodes(nodes: TaskTreeNodeView[], indent = ""): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    lines.push(`${indent}${node.displayPath}. ${node.title}（${describePlanNodeStatus(node.status)}）`);
    if (node.children.length > 0) {
      lines.push(...renderPlanNodes(node.children, `${indent}  `));
    }
  }

  return lines;
}

function allNodesPending(nodes: TaskTreeNodeView[]): boolean {
  return nodes.every((node) => node.status === "pending" && allNodesPending(node.children));
}

export function renderPlanPreview(view: TaskTreeView): string {
  const lines = [
    "计划已生成，尚未开始执行。",
    `任务：${view.title}`,
    "",
    "计划步骤：",
    ...renderPlanNodes(view.tree),
  ];

  if (allNodesPending(view.tree)) {
    lines.push("", "当前这些步骤都还未开始。");
  }

  lines.push(
    "",
    "你现在可以：",
    "- 回复 `开始执行` 或输入 `/task resume` 开始执行",
    "- 输入 `/task tree` 查看任务树",
    "- 输入 `/task refine <节点>` 继续细化某一步",
    "- 输入 `/task cancel` 取消任务",
  );

  return lines.join("\n");
}
