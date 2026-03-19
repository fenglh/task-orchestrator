import type { TaskSummaryView } from "../types/task-status-view.ts";

function describeStatus(status: TaskSummaryView["status"]): string {
  switch (status) {
    case "running":
      return "运行中";
    case "waiting_human":
      return "等待你的输入";
    case "failed":
      return "某个节点失败，等待你决定如何继续";
    case "finished":
      return "已完成";
    case "paused":
      return "已暂停";
    case "awaiting_plan_confirmation":
      return "计划已生成，等待你确认开始";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function reviewHint(view: TaskSummaryView): string | undefined {
  if (!view.reviewStats) {
    return undefined;
  }

  if (view.reviewStats.needsReview > 0) {
    return `有 ${view.reviewStats.needsReview} 个节点建议人工复核：这不代表失败，而是说明系统只完成了自动证据检查，建议你快速看一眼节点详情。`;
  }

  if (view.reviewStats.partial > 0) {
    return `有 ${view.reviewStats.partial} 个节点只部分通过自动检查，建议优先查看这些节点的 check 明细。`;
  }

  if (view.reviewStats.failedChecks > 0) {
    return `有 ${view.reviewStats.failedChecks} 个节点在自动检查层失败，建议优先查看失败节点详情。`;
  }

  return undefined;
}

function finishedOutcomeHint(view: TaskSummaryView): string | undefined {
  if (view.status !== "finished" || !view.outcomeStats) {
    return undefined;
  }

  return `结束摘要：完成 ${view.outcomeStats.done} 个节点，跳过 ${view.outcomeStats.cancelled} 个节点，仍失败 ${view.outcomeStats.failed} 个节点，当前阻塞 ${view.outcomeStats.blocked} 个节点。`;
}

function nextStepHint(view: TaskSummaryView): string | undefined {
  if (view.status === "awaiting_plan_confirmation") {
    return "下一步：查看任务树后，使用 `/task resume` 或直接确认开始。";
  }

  if (view.status === "waiting_human" && view.blocked) {
    return "下一步：直接回复所需输入，或使用 `/task tree` / `/task pause` / `/task cancel`。";
  }

  if (view.status === "failed") {
    return "下一步：使用 `/task retry` 重试，或用 `/task skip` 跳过当前失败节点。";
  }

  if (view.status === "running" && view.currentNode) {
    return "下一步：当前由系统自动推进；如需介入，可查看 `/task tree`。";
  }

  if (view.status === "finished") {
    return "下一步：查看任务树或节点详情，确认是否有需要复核的结果。";
  }

  return undefined;
}

export function renderTaskSummary(view: TaskSummaryView): string {
  const lines = [
    `Task: ${view.title}`,
    `Status: ${view.status} · ${describeStatus(view.status)}`,
    `Progress: ${view.progress.done}/${view.progress.total}`,
  ];

  if (view.currentNode) {
    lines.push(`Current node: ${view.currentNode.displayPath} ${view.currentNode.title}`);
    lines.push(`Current path focus: 当前主线正在推进节点 ${view.currentNode.displayPath}`);
  }

  if (view.reviewStats) {
    lines.push(
      `Review flags: needs_review=${view.reviewStats.needsReview}, partial=${view.reviewStats.partial}, failed_checks=${view.reviewStats.failedChecks}`,
    );
  }

  const reviewHintText = reviewHint(view);
  if (reviewHintText) {
    lines.push(`Review note: ${reviewHintText}`);
  }

  if (view.blocked) {
    lines.push(`Blocked question: ${view.blocked.question}`);
    lines.push(`Blocked reason: ${view.blocked.whyBlocked}`);
  }

  if (view.latestSummary) {
    lines.push(`Latest update: ${view.latestSummary}`);
  }

  if (view.suggestedNode) {
    lines.push(`Suggested node: ${view.suggestedNode.displayPath} ${view.suggestedNode.title}`);
    lines.push(`Suggested action reason: ${view.suggestedNode.reason}`);
    lines.push(`Suggested inspect command: /task node ${view.suggestedNode.displayPath}`);
  }

  const outcomeHint = finishedOutcomeHint(view);
  if (outcomeHint) {
    lines.push(outcomeHint);
  }

  const hint = nextStepHint(view);
  if (hint) {
    lines.push(hint);
  }

  return lines.join("\n");
}
