import type { TaskNodeDetailView } from "../types/task-status-view.ts";

function statusLabel(status?: string): string {
  switch (status) {
    case "pending": return "待处理";
    case "running": return "进行中";
    case "done": return "已完成";
    case "failed": return "失败";
    case "blocked": return "阻塞";
    case "waiting_children": return "等待子任务";
    case "cancelled": return "已跳过";
    default: return status ?? "未知";
  }
}

function evidenceStatusLabel(status?: string): string {
  switch (status) {
    case "needs_review": return "建议复核";
    case "partial": return "部分通过";
    case "failed": return "检查失败";
    case "passed": return "检查通过";
    default: return status ?? "未知";
  }
}

function checkStatusLabel(status?: string): string {
  switch (status) {
    case "passed": return "通过";
    case "failed": return "失败";
    case "skipped": return "跳过";
    default: return status ?? "未知";
  }
}

function suggestedCommands(view: TaskNodeDetailView): string[] {
  const node = view.node;
  if (node.status === "blocked") return [`/task node ${node.displayPath}`, "/task pause"];
  if (node.status === "failed") return [`/task retry ${node.displayPath}`, `/task skip ${node.displayPath}`];
  return [`/task node ${node.displayPath}`, "/task tree"];
}

export function renderNodeDetail(view: TaskNodeDetailView): string {
  const lines = [
    "# 节点详情",
    "",
    "## 节点",
    `- **名称**：${view.node.displayPath} ${view.node.title}`,
    `- **状态**：${statusLabel(view.node.status)}`,
    `- **目标**：${view.node.goal}`,
    `- **完成标准**：${view.node.successCriteria}`,
  ];

  if (view.node.userVisibleSummary) {
    lines.push("", "## 当前结论", `- ${view.node.userVisibleSummary}`);
  }

  if (view.node.completionEvidence) {
    lines.push("", "## 证据摘要", `- **状态**：${evidenceStatusLabel(view.node.completionEvidence.status)}`, `- **摘要**：${view.node.completionEvidence.verifierSummary}`);

    if (view.node.completionEvidence.checkResults.length > 0) {
      lines.push("", "## 检查明细");
      for (const checkResult of view.node.completionEvidence.checkResults) {
        lines.push(`- [${checkStatusLabel(checkResult.status)}] ${checkResult.checkId}: ${checkResult.detail}`);
      }
    }
  }

  if (view.node.report) {
    lines.push("", "## 补充说明", `- ${view.node.report}`);
  }

  if (view.node.children.length > 0) {
    lines.push("", "## 子节点");
    for (const child of view.node.children) {
      lines.push(`- ${child.displayPath}. ${child.title}（${statusLabel(child.status)}）`);
    }
  }

  lines.push("", "## 相关命令", "```bash", ...suggestedCommands(view), "```");

  return lines.join("\n");
}
