import type { TaskSummaryView } from "../types/task-status-view.ts";

function hasReviewRisk(view: TaskSummaryView): boolean {
  return Boolean(
    view.reviewStats &&
      (view.reviewStats.needsReview > 0 ||
        view.reviewStats.partial > 0 ||
        view.reviewStats.failedChecks > 0),
  );
}

function statusLabel(view: TaskSummaryView): string {
  switch (view.status) {
    case "running":
      return "运行中";
    case "waiting_human":
      return "等待你的输入";
    case "awaiting_finish_confirmation":
      return "等待你确认是否结束";
    case "failed":
      return "等待你决定如何继续";
    case "finished":
      return hasReviewRisk(view) ? "已完成（待复核）" : "已完成";
    case "paused":
      return "已暂停";
    case "awaiting_plan_confirmation":
      return "等待你确认开始";
    case "cancelled":
      return "已取消";
    default:
      return "状态未知";
  }
}

function reviewHint(view: TaskSummaryView): string | undefined {
  if (!view.reviewStats) return undefined;
  if (view.reviewStats.needsReview > 0) {
    return `有 ${view.reviewStats.needsReview} 个节点建议人工复核：这不代表失败，而是说明系统只完成了自动证据检查。`;
  }
  if (view.reviewStats.partial > 0) {
    return `有 ${view.reviewStats.partial} 个节点只部分通过自动检查，建议优先查看这些节点的检查明细。`;
  }
  if (view.reviewStats.failedChecks > 0) {
    return `有 ${view.reviewStats.failedChecks} 个节点在自动检查层失败，建议优先查看失败节点详情。`;
  }
  return undefined;
}

function finishedOutcomeHint(view: TaskSummaryView): string[] {
  if (view.status !== "finished" || !view.outcomeStats) return [];

  const rows = [
    { label: "完成", value: view.outcomeStats.done },
    { label: "跳过", value: view.outcomeStats.cancelled },
    { label: "失败", value: view.outcomeStats.failed },
    { label: "当前阻塞", value: view.outcomeStats.blocked },
  ].filter((item) => Number(item.value) > 0);

  if (!rows.length) return [];

  return rows.map((item) => `- ${item.label} ${item.value} 个节点`);
}

function nextStepHint(view: TaskSummaryView): string | undefined {
  if (view.status === "awaiting_plan_confirmation") {
    return "下一步：请确认是否开始执行；你也可以先查看任务树或继续细化某一步。";
  }
  if (view.status === "awaiting_finish_confirmation") {
    return "下一步：请先查看建议复核的节点；确认无误后使用 `/task finish` 或直接回复“确认结束”。";
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
  if (view.status === "finished" && hasReviewRisk(view)) {
    return "下一步：先看推荐节点，再决定这些结果是否可以接受；如果可以，再视为真正完成。";
  }
  if (view.status === "finished") {
    return "下一步：查看任务树或节点详情，确认是否有需要补充的结果。";
  }
  return undefined;
}

function softenConclusion(text: string): string {
  return text
    .replace(/^结论[:：]\s*/u, "")
    .replace(/本质上已经不是/gu, "当前更不像")
    .replace(/而是一个正在演化中的/gu, "更像一个正在演化中的")
    .replace(/最优先建议不是/gu, "基于当前分析，更建议优先")
    .replace(/最优先建议是/gu, "基于当前分析，更建议优先")
    .replace(/必须/gu, "更适合先")
    .trim();
}

function formatLatestSummary(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (normalized.length > 1) {
    return normalized.map((line) => `- ${line}`);
  }

  const single = (normalized[0] ?? "").replace(/\s+/g, " ").trim();
  if (!single) return [];

  const protectedSingle = single
    .replace(/([0-9]+）)/gu, "\n$1")
    .replace(/；(?=[0-9]+）)/gu, "；\n");

  const sentences = protectedSingle
    .split(/\n|(?<=[。！？])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length > 1) {
    return sentences.map((part) => `- ${part}`);
  }

  return [`- ${single}`];
}

function compactLatestSummary(view: TaskSummaryView): string[] {
  if (!view.latestSummary) return [];
  const softened = softenConclusion(view.latestSummary);
  return formatLatestSummary(softened);
}

function displayTaskTitle(view: Pick<TaskSummaryView, "title" | "rootGoal">): string {
  const title = String(view.title || "").trim();
  const rootGoal = String(view.rootGoal || "").trim();
  if (title.endsWith("...") && rootGoal) return rootGoal;
  return title || rootGoal || "未命名任务";
}

export function renderTaskSummary(view: TaskSummaryView): string {
  const lines = [
    `# 任务状态`,
    "",
    `## 任务信息`,
    `- **任务**：${displayTaskTitle(view)}`,
    `- **状态**：${statusLabel(view)}`,
    `- **进度**：${view.progress.done}/${view.progress.total}`,
  ];

  if (view.status === "awaiting_plan_confirmation") {
    lines.push("", "## 说明", "- 计划已生成，尚未执行", "- 请确认是否开始执行");
  }

  if (view.status === "awaiting_finish_confirmation") {
    lines.push(
      "",
      "## 说明",
      "- 执行链已经跑完",
      "- 结果里包含需要人工复核的节点",
      "- 系统暂不会自动判定任务已完成",
    );
  }

  if (view.status === "finished" && hasReviewRisk(view)) {
    lines.push(
      "",
      "## 说明",
      "- 执行已经结束",
      "- 但这更像一份待你复核的分析结果",
      "- 不是系统替你下的最终定论",
    );
  }

  if (view.currentNode) {
    lines.push(
      "",
      "## 当前焦点",
      `- **当前节点**：${view.currentNode.displayPath} ${view.currentNode.title}`,
      `- **主线位置**：正在推进节点 ${view.currentNode.displayPath}`,
    );
  }

  if (view.reviewStats) {
    const reviewRows = [
      { label: "建议复核", value: view.reviewStats.needsReview },
      { label: "部分通过", value: view.reviewStats.partial },
      { label: "检查失败", value: view.reviewStats.failedChecks },
    ].filter((item) => Number(item.value) > 0);

    if (reviewRows.length) {
      lines.push(
        "",
        "## 复核情况",
        ...reviewRows.map((item) => `- **${item.label}**：${item.value}`),
      );
    }
  }

  const reviewHintText = reviewHint(view);
  if (reviewHintText) {
    lines.push("", "## 需要留意", `- ${reviewHintText}`);
  }

  if (hasReviewRisk(view)) {
    lines.push("", "## 判断边界", "- 当前结论基于自动证据与已读取内容整理", "- 如需最终确认，建议先看推荐节点再下结论");
  }

  if (view.blocked) {
    lines.push(
      "",
      "## 当前阻塞",
      `- **问题**：${view.blocked.question}`,
      `- **原因**：${view.blocked.whyBlocked}`,
    );
  }

  const compactSummary = compactLatestSummary(view);
  if (compactSummary.length) {
    lines.push("", hasReviewRisk(view) ? "## 当前判断" : "## 最新进展", ...compactSummary);
  }

  if (view.suggestedNode) {
    lines.push(
      "",
      "## 建议先看",
      `- **节点**：${view.suggestedNode.displayPath} ${view.suggestedNode.title}`,
      `- **原因**：${view.suggestedNode.reason}`,
      "- **命令**：",
      "```bash",
      `/task node ${view.suggestedNode.displayPath}`,
      "```",
    );
  }

  const outcomeLines = finishedOutcomeHint(view);
  if (outcomeLines.length) {
    lines.push("", "## 结果汇总", ...outcomeLines);
  }

  const hint = nextStepHint(view);
  if (hint) {
    const normalized = hint.replace(/^下一步：/u, "").trim();
    lines.push("", "## 下一步", `- ${normalized}`);
  }

  return lines.join("\n");
}
