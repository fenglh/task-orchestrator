import type { TaskNodeDetailView } from "../types/task-status-view.ts";

function suggestedActions(view: TaskNodeDetailView): string[] {
  const actions: string[] = [];
  const node = view.node;

  if (node.status === "blocked") {
    actions.push("直接回复缺失输入，系统会尝试继续执行这个节点。");
    actions.push("如果暂时不想继续，可使用 `/task pause` 暂停任务。");
    return actions;
  }

  if (node.status === "failed") {
    actions.push("优先考虑用 `/task retry` 重试这个失败节点。");
    actions.push("如果这是低价值节点或外部条件不满足，可考虑 `/task skip`。");
    return actions;
  }

  if (node.completionEvidence?.status === "needs_review") {
    actions.push("先快速查看本节点的 completion evidence 和 check 明细。");
    actions.push("如果结果可信，可继续沿主线推进；如果不放心，可要求重做或细化。");
    return actions;
  }

  if (node.completionEvidence?.status === "partial") {
    actions.push("优先查看未通过的 check 明细，判断是结果缺失还是规则过严。");
    actions.push("必要时可要求重做该节点或补充子任务。");
    return actions;
  }

  if (node.status === "done") {
    actions.push("如果这是关键节点，建议快速浏览证据后再继续看下一个节点。");
  }

  return actions;
}

export function renderNodeDetail(view: TaskNodeDetailView): string {
  const lines = [
    `Node: ${view.node.displayPath} ${view.node.title}`,
    `Status: ${view.node.status}`,
    `Goal: ${view.node.goal}`,
    `Success criteria: ${view.node.successCriteria}`,
  ];

  if (view.node.userVisibleSummary) {
    lines.push(`Summary: ${view.node.userVisibleSummary}`);
  }

  if (view.node.completionContract) {
    lines.push("Completion contract:");
    if (view.node.completionContract.objective) {
      lines.push(`- Objective: ${view.node.completionContract.objective}`);
    }
    if (view.node.completionContract.outcomeType) {
      lines.push(`- Outcome type: ${view.node.completionContract.outcomeType}`);
    }
    if (view.node.completionContract.reviewMode) {
      lines.push(`- Review mode: ${view.node.completionContract.reviewMode}`);
    }
    if (view.node.completionContract.expectedArtifacts?.length) {
      lines.push(`- Expected artifacts: ${view.node.completionContract.expectedArtifacts.length}`);
    }
    if (view.node.completionContract.acceptanceChecks?.length) {
      lines.push(`- Acceptance checks: ${view.node.completionContract.acceptanceChecks.length}`);
    }
  }

  if (view.node.completionEvidence) {
    lines.push("Completion evidence:");
    lines.push(`- Status: ${view.node.completionEvidence.status}`);
    if (view.node.completionEvidence.status === "needs_review") {
      lines.push("- Interpretation: 这不是失败，而是建议你快速复核该节点；系统只完成了自动证据检查。");
    }
    if (view.node.completionEvidence.status === "partial") {
      lines.push("- Interpretation: 该节点已有结果，但自动检查只部分通过，建议优先查看失败项。");
    }
    lines.push(`- Verifier summary: ${view.node.completionEvidence.verifierSummary}`);
    lines.push("- Note: verifier 只校验可观察证据与基本交付形式，不对复杂动态任务结论做最终裁定");

    if (view.node.completionEvidence.checkResults.length > 0) {
      lines.push(`- Check results: ${view.node.completionEvidence.checkResults.length}`);
      lines.push("Check result details:");
      for (const checkResult of view.node.completionEvidence.checkResults) {
        lines.push(`- [${checkResult.status}] ${checkResult.checkId}: ${checkResult.detail}`);
      }
    }

    if (view.node.completionEvidence.runtimeEvidence) {
      lines.push("Runtime evidence:");
      if ((view.node.completionEvidence.runtimeEvidence.toolCalls?.length ?? 0) > 0) {
        lines.push(`- Tool calls observed: ${view.node.completionEvidence.runtimeEvidence.toolCalls.join(", ")}`);
      }
      if ((view.node.completionEvidence.runtimeEvidence.modifiedArtifacts?.length ?? 0) > 0) {
        lines.push(`- Modified artifacts observed: ${view.node.completionEvidence.runtimeEvidence.modifiedArtifacts.join(", ")}`);
      }
      if ((view.node.completionEvidence.runtimeEvidence.commandLabels?.length ?? 0) > 0) {
        lines.push(`- Commands observed: ${view.node.completionEvidence.runtimeEvidence.commandLabels.join(" | ")}`);
      }
    }
  }

  if (view.node.report) {
    lines.push(`Report: ${view.node.report}`);
  }

  const actions = suggestedActions(view);
  if (actions.length > 0) {
    lines.push("Suggested actions:");
    for (const action of actions) {
      lines.push(`- ${action}`);
    }
  }

  if (view.node.children.length > 0) {
    lines.push("Children:");
    for (const child of view.node.children) {
      lines.push(`- ${child.displayPath}. ${child.title} [${child.status}]`);
    }
  }

  return lines.join("\n");
}
