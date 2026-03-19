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
    lines.push(`- Verifier summary: ${view.node.completionEvidence.verifierSummary}`);
    if (view.node.completionEvidence.checkResults.length > 0) {
      lines.push(`- Check results: ${view.node.completionEvidence.checkResults.length}`);
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
