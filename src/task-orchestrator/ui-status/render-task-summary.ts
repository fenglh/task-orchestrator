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
      return "等待输入";
    case "awaiting_finish_confirmation":
      return "待确认结束";
    case "failed":
      return "执行失败";
    case "finished":
      return hasReviewRisk(view) ? "已完成（待复核）" : "已完成";
    case "paused":
      return "已暂停";
    case "awaiting_plan_confirmation":
      return "待确认开始";
    case "cancelled":
      return "已取消";
    default:
      return "状态未知";
  }
}

function taskText(view: Pick<TaskSummaryView, "title" | "rootGoal">): string {
  const title = String(view.title || "").trim();
  const rootGoal = String(view.rootGoal || "").trim();
  if (title.endsWith("...") && rootGoal) return rootGoal;
  return title || rootGoal || "未命名任务";
}

function displayTaskTitle(view: Pick<TaskSummaryView, "title" | "rootGoal">): string {
  const full = taskText(view);
  return full.length > 36 ? `${full.slice(0, 36).trim()}…` : full;
}

function formatSummaryBullets(text: string): string[] {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/^结论[:：]\s*/u, "")
    .replace(/最优先建议不是/gu, "更建议优先")
    .replace(/最优先建议是/gu, "更建议优先")
    .trim();

  if (!cleaned) return [];

  const numberedMatches = [...cleaned.matchAll(/([0-9]+）[^0-9]+?)(?=(?:[0-9]+）)|$)/gu)].map((m) => m[1].trim());
  let textWithoutNumbered = cleaned;
  if (numberedMatches.length) {
    for (const item of numberedMatches) {
      textWithoutNumbered = textWithoutNumbered.replace(item, "").trim();
    }
  }

  const baseParts = textWithoutNumbered
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[。！？])/u))
    .map((part) => part.trim())
    .filter(Boolean);

  const bullets: string[] = [];
  for (const part of baseParts) {
    if (/^基于当前分析，更建议优先继续扩写愿景，而是补 4 件事[:：]?$/u.test(part)) {
      bullets.push("更建议优先补 4 件事：");
      continue;
    }
    bullets.push(part);
  }

  if (numberedMatches.length) {
    if (!bullets.some((x) => /补 4 件事[:：]?$/u.test(x))) {
      bullets.push("更建议优先补 4 件事：");
    }
    bullets.push(...numberedMatches);
  }

  return bullets.map((item) => `- ${item}`);
}

function buildNextStep(view: TaskSummaryView): { title: string; lines: string[] } | undefined {
  if (view.suggestedNode) {
    return {
      title: "## 下一步",
      lines: [
        `- 先看节点 **${view.suggestedNode.displayPath} ${view.suggestedNode.title}**`,
        `- 原因：${view.suggestedNode.reason}`,
        "```bash",
        `/task node ${view.suggestedNode.displayPath}`,
        "```",
      ],
    };
  }

  if (view.status === "failed") {
    return { title: "## 下一步", lines: ["```bash", "/task retry", "/task skip", "/task tree", "```"] };
  }

  if (view.status === "waiting_human" && view.blocked) {
    return { title: "## 下一步", lines: ["- 直接回复缺失输入即可", "```bash", "/task tree", "/task pause", "/task cancel", "```"] };
  }

  return undefined;
}

function buildRiskLines(view: TaskSummaryView): string[] {
  const lines: string[] = [];
  const needsReview = Number(view.reviewStats?.needsReview || 0);
  const partial = Number(view.reviewStats?.partial || 0);
  const failedChecks = Number(view.reviewStats?.failedChecks || 0);
  const blocked = Number(view.outcomeStats?.blocked || 0);
  const failed = Number(view.outcomeStats?.failed || 0);

  if (needsReview > 0) lines.push(`- 有 **${needsReview}** 个节点建议复核`);
  if (partial > 0) lines.push(`- 有 **${partial}** 个节点仅部分通过检查`);
  if (failedChecks > 0) lines.push(`- 有 **${failedChecks}** 个节点检查失败`);
  if (failed > 0) lines.push(`- 当前仍有 **${failed}** 个失败节点`);
  if (blocked > 0) lines.push(`- 当前仍有 **${blocked}** 个阻塞节点`);
  if (view.blocked) lines.push(`- 当前卡点：${view.blocked.question}`);

  return lines;
}

export function renderTaskSummary(view: TaskSummaryView): string {
  const lines = [
    "# 任务状态",
    "",
    "## 任务",
    `- **名称**：${displayTaskTitle(view)}`,
    `- **状态**：${statusLabel(view)}`,
    `- **进度**：${view.progress.done}/${view.progress.total}`,
  ];

  const fullTaskText = taskText(view);
  if (fullTaskText !== displayTaskTitle(view)) {
    lines.push("- **完整任务**：", "```text", fullTaskText, "```");
  }

  const summaryBullets = formatSummaryBullets(view.latestSummary || "");
  if (summaryBullets.length) {
    lines.push("", "## 当前判断", ...summaryBullets);
  }

  const nextStep = buildNextStep(view);
  if (nextStep) {
    lines.push("", nextStep.title, ...nextStep.lines);
  }

  const riskLines = buildRiskLines(view);
  if (riskLines.length) {
    lines.push("", "## 风险与注意", ...riskLines);
  }

  if (view.currentNode && view.status === "running") {
    lines.push("", "## 当前焦点", `- 正在执行节点 **${view.currentNode.displayPath} ${view.currentNode.title}**`);
  }

  return lines.join("\n");
}
