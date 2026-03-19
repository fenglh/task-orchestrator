import type { TaskNodeDetailView } from "../types/task-status-view.ts";

function describeNodeStatus(status: string): string {
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
      return "已跳过";
    default:
      return status;
  }
}

function describeEvidenceStatus(status?: string): string {
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
      return status ?? "未知";
  }
}

function describeOutcomeType(outcomeType?: string): string {
  switch (outcomeType) {
    case "file_write":
      return "写入文件";
    case "file_edit":
      return "编辑文件";
    case "structured_response":
      return "结构化结果";
    case "analysis_summary":
      return "分析总结";
    case "state_update":
      return "状态更新";
    case "external_action":
      return "外部动作";
    case "research_note":
      return "研究笔记";
    case "unknown":
      return "未知类型";
    default:
      return outcomeType ?? "未知类型";
  }
}

function describeReviewMode(reviewMode?: string): string {
  switch (reviewMode) {
    case "auto":
      return "自动判定";
    case "auto_with_warning":
      return "自动判定（带提醒）";
    case "needs_review":
      return "建议人工复核";
    default:
      return reviewMode ?? "未设置";
  }
}

function describeCheckStatus(status: string): string {
  switch (status) {
    case "passed":
      return "通过";
    case "failed":
      return "失败";
    case "warning":
      return "警告";
    case "skipped":
      return "跳过";
    default:
      return status;
  }
}

function suggestedActions(view: TaskNodeDetailView): { notes: string[]; commands: string[] } {
  const notes: string[] = [];
  const commands: string[] = [];
  const node = view.node;

  if (node.status === "blocked") {
    notes.push("直接回复缺失输入，系统会尝试继续执行这个节点。");
    commands.push(`/task node ${node.displayPath}`);
    commands.push("/task pause");
    return { notes, commands };
  }

  if (node.status === "failed") {
    notes.push("优先考虑重试这个失败节点；如果价值较低，也可以跳过。");
    commands.push(`/task retry ${node.displayPath}`);
    commands.push(`/task skip ${node.displayPath}`);
    return { notes, commands };
  }

  if (node.completionEvidence?.status === "needs_review") {
    notes.push("先快速查看本节点的完成证据和检查明细。");
    notes.push("如果结果可信，可继续沿主线推进；如果不放心，可要求重做或细化。");
    commands.push(`/task node ${node.displayPath}`);
    return { notes, commands };
  }

  if (node.completionEvidence?.status === "partial") {
    notes.push("优先查看未通过的检查明细，判断是结果缺失还是规则过严。");
    notes.push("必要时可要求重做该节点或补充子任务。");
    commands.push(`/task node ${node.displayPath}`);
    return { notes, commands };
  }

  if (node.status === "done") {
    notes.push("如果这是关键节点，建议快速浏览证据后再继续看下一个节点。");
    commands.push("/task tree");
  }

  return { notes, commands };
}

export function renderNodeDetail(view: TaskNodeDetailView): string {
  const lines = [
    `节点：${view.node.displayPath} ${view.node.title}`,
    `状态：${describeNodeStatus(view.node.status)}`,
    `目标：${view.node.goal}`,
    `完成标准：${view.node.successCriteria}`,
  ];

  if (view.node.userVisibleSummary) {
    lines.push(`摘要：${view.node.userVisibleSummary}`);
  }

  if (view.node.completionContract) {
    lines.push("完成契约：");
    if (view.node.completionContract.objective) {
      lines.push(`- 目标：${view.node.completionContract.objective}`);
    }
    if (view.node.completionContract.outcomeType) {
      lines.push(`- 结果类型：${describeOutcomeType(view.node.completionContract.outcomeType)}`);
    }
    if (view.node.completionContract.reviewMode) {
      lines.push(`- 复核模式：${describeReviewMode(view.node.completionContract.reviewMode)}`);
    }
    if (view.node.completionContract.expectedArtifacts?.length) {
      lines.push(`- 期望产物数：${view.node.completionContract.expectedArtifacts.length}`);
    }
    if (view.node.completionContract.acceptanceChecks?.length) {
      lines.push(`- 验收检查数：${view.node.completionContract.acceptanceChecks.length}`);
    }
  }

  if (view.node.completionEvidence) {
    lines.push("完成证据：");
    lines.push(`- 状态：${describeEvidenceStatus(view.node.completionEvidence.status)}`);
    if (view.node.completionEvidence.status === "needs_review") {
      lines.push("- 解释：这不是失败，而是建议你快速复核该节点；系统只完成了自动证据检查。");
    }
    if (view.node.completionEvidence.status === "partial") {
      lines.push("- 解释：该节点已有结果，但自动检查只部分通过，建议优先查看失败项。");
    }
    lines.push(`- 校验摘要：${view.node.completionEvidence.verifierSummary}`);
    lines.push("- 说明：verifier 只校验可观察证据与基本交付形式，不对复杂动态任务结论做最终裁定");

    if (view.node.completionEvidence.checkResults.length > 0) {
      lines.push(`- 检查数量：${view.node.completionEvidence.checkResults.length}`);
      lines.push("检查明细：");
      for (const checkResult of view.node.completionEvidence.checkResults) {
        lines.push(`- [${describeCheckStatus(checkResult.status)}] ${checkResult.checkId}: ${checkResult.detail}`);
      }
    }

    if (view.node.completionEvidence.runtimeEvidence) {
      lines.push("运行时证据：");
      if ((view.node.completionEvidence.runtimeEvidence.toolCalls?.length ?? 0) > 0) {
        lines.push(`- 观察到的工具调用：${view.node.completionEvidence.runtimeEvidence.toolCalls.join(", ")}`);
      }
      if ((view.node.completionEvidence.runtimeEvidence.modifiedArtifacts?.length ?? 0) > 0) {
        lines.push(`- 观察到的产物修改：${view.node.completionEvidence.runtimeEvidence.modifiedArtifacts.join(", ")}`);
      }
      if ((view.node.completionEvidence.runtimeEvidence.commandLabels?.length ?? 0) > 0) {
        lines.push(`- 观察到的命令：${view.node.completionEvidence.runtimeEvidence.commandLabels.join(" | ")}`);
      }
    }
  }

  if (view.node.report) {
    lines.push(`报告：${view.node.report}`);
  }

  const actions = suggestedActions(view);
  if (actions.notes.length > 0) {
    lines.push("建议动作：");
    for (const action of actions.notes) {
      lines.push(`- ${action}`);
    }
  }

  if (actions.commands.length > 0) {
    lines.push("推荐命令：");
    for (const command of actions.commands) {
      lines.push(`- ${command}`);
    }
  }

  if (view.node.children.length > 0) {
    lines.push("子节点：");
    for (const child of view.node.children) {
      lines.push(`- ${child.displayPath}. ${child.title} [${describeNodeStatus(child.status)}]`);
    }
  }

  return lines.join("\n");
}
