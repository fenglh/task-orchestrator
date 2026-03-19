import type { TaskNodeDetailView } from "../types/task-status-view.ts";

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
        lines.push(`- Tool calls observed: ${view.node.completionEvidence.runtimeEvidence.toolCalls?.join(", ")}`);
      }
      if ((view.node.completionEvidence.runtimeEvidence.modifiedArtifacts?.length ?? 0) > 0) {
        lines.push(`- Modified artifacts observed: ${view.node.completionEvidence.runtimeEvidence.modifiedArtifacts?.join(", ")}`);
      }
      if ((view.node.completionEvidence.runtimeEvidence.commandLabels?.length ?? 0) > 0) {
        lines.push(`- Commands observed: ${view.node.completionEvidence.runtimeEvidence.commandLabels?.join(" | ")}`);
      }
    }
  }

  if (view.node.report) {
    lines.push(`Report: ${view.node.report}`);
  }

  if (view.node.children.length > 0) {
    lines.push("Children:");
    for (const child of view.node.children) {
      lines.push(`- ${child.displayPath}. ${child.title} [${child.status}]`);
    }
  }

  return lines.join("\n");
}
