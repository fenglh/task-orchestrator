import type {
  TaskNodeDetailView,
  TaskStatusView,
  TaskSummaryView,
  TaskTreeNodeView,
  TaskTreeView,
} from "../types/task-status-view.ts";
import type { TaskThread } from "../types/task-thread.ts";
import {
  countTaskProgress,
  findNodeByRef,
  getNodePath,
  listChildNodes,
} from "./task-tree.ts";

function projectTreeNode(
  thread: TaskThread,
  nodeId: string,
  currentNodeId?: string,
  currentPathIds: Set<string> = new Set(),
): TaskTreeNodeView {
  const node = thread.nodes[nodeId];

  return {
    id: node.id,
    displayPath: node.displayPath,
    title: node.title,
    status: node.status,
    completionEvidenceStatus: node.completionEvidence?.status,
    isInCurrentPath: currentPathIds.has(node.id),
    isCurrentNode: node.id === currentNodeId,
    children: node.children.map((childId) =>
      projectTreeNode(thread, childId, currentNodeId, currentPathIds)
    ),
  };
}

function collectReviewStats(thread: TaskThread): {
  needsReview: number;
  partial: number;
  failedChecks: number;
} {
  const nodes = Object.values(thread.nodes);
  return {
    needsReview: nodes.filter((node) => node.completionEvidence?.status === "needs_review").length,
    partial: nodes.filter((node) => node.completionEvidence?.status === "partial").length,
    failedChecks: nodes.filter((node) => node.completionEvidence?.status === "failed").length,
  };
}

function collectOutcomeStats(thread: TaskThread): {
  done: number;
  cancelled: number;
  failed: number;
  blocked: number;
} {
  const nodes = Object.values(thread.nodes).filter((node) => node.displayPath !== "0");
  return {
    done: nodes.filter((node) => node.status === "done").length,
    cancelled: nodes.filter((node) => node.status === "cancelled").length,
    failed: nodes.filter((node) => node.status === "failed").length,
    blocked: nodes.filter((node) => node.status === "blocked").length,
  };
}

function pickSuggestedNode(thread: TaskThread): {
  displayPath: string;
  title: string;
  reason: string;
} | undefined {
  const nodes = Object.values(thread.nodes).filter((node) => node.displayPath !== "0");

  const blockedNode = nodes.find((node) => node.status === "blocked");
  if (blockedNode) {
    return {
      displayPath: blockedNode.displayPath,
      title: blockedNode.title,
      reason: "这是当前阻塞节点，优先补输入或查看详情。",
    };
  }

  const failedNode = nodes.find((node) => node.status === "failed");
  if (failedNode) {
    return {
      displayPath: failedNode.displayPath,
      title: failedNode.title,
      reason: "这是当前失败节点，优先决定 retry 还是 skip。",
    };
  }

  const reviewNode = nodes.find((node) => node.completionEvidence?.status === "needs_review");
  if (reviewNode) {
    return {
      displayPath: reviewNode.displayPath,
      title: reviewNode.title,
      reason: "这个节点建议人工复核，适合作为任务结束后的第一查看点。",
    };
  }

  return undefined;
}

export function projectSummaryView(thread: TaskThread): TaskSummaryView {
  const currentNode = thread.activeNodeId ? thread.nodes[thread.activeNodeId] : undefined;

  return {
    kind: "summary",
    threadId: thread.threadId,
    title: thread.title,
    status: thread.status,
    currentNode: currentNode
      ? {
          id: currentNode.id,
          displayPath: currentNode.displayPath,
          title: currentNode.title,
        }
      : undefined,
    suggestedNode: pickSuggestedNode(thread),
    progress: countTaskProgress(thread),
    reviewStats: collectReviewStats(thread),
    outcomeStats: collectOutcomeStats(thread),
    blocked: thread.blocked
      ? {
          question: thread.blocked.question,
          whyBlocked: thread.blocked.whyBlocked,
          suggestedActions: thread.blocked.suggestedActions,
        }
      : undefined,
    latestSummary: thread.latestUserVisibleSummary,
    updatedAt: thread.updatedAt,
  };
}

export function projectTreeView(thread: TaskThread): TaskTreeView {
  const rootNode = thread.nodes[thread.rootTaskId];
  const currentPathNodes = getNodePath(thread, thread.activeNodeId);
  const currentPath = currentPathNodes.map((node) => `${node.displayPath} ${node.title}`);
  const currentPathIds = new Set(currentPathNodes.map((node) => node.id));
  const currentNode = thread.activeNodeId ? thread.nodes[thread.activeNodeId] : undefined;

  return {
    kind: "tree",
    threadId: thread.threadId,
    title: thread.title,
    status: thread.status,
    currentNodeRef: currentNode?.displayPath,
    currentNodeTitle: currentNode?.title,
    currentPath,
    tree: rootNode.children.map((childId) =>
      projectTreeNode(thread, childId, thread.activeNodeId, currentPathIds)
    ),
    updatedAt: thread.updatedAt,
  };
}

export function projectNodeView(
  thread: TaskThread,
  nodeRef: string,
): TaskNodeDetailView {
  const node = findNodeByRef(thread, nodeRef);
  if (!node) {
    throw new Error(`Task node not found: ${nodeRef}`);
  }

  return {
    kind: "node",
    threadId: thread.threadId,
    node: {
      id: node.id,
      displayPath: node.displayPath,
      title: node.title,
      goal: node.goal,
      successCriteria: node.successCriteria,
      completionContract: node.completionContract,
      completionEvidence: node.completionEvidence,
      status: node.status,
      report: node.report,
      userVisibleSummary: node.userVisibleSummary,
      evidence: node.evidence,
      children: listChildNodes(thread, node.id).map((child) => ({
        id: child.id,
        displayPath: child.displayPath,
        title: child.title,
        status: child.status,
      })),
    },
    updatedAt: thread.updatedAt,
  };
}

export function projectTaskStatusView(
  thread: TaskThread,
  view: "summary" | "tree" | "node",
  nodeRef?: string,
): TaskStatusView {
  if (view === "summary") {
    return projectSummaryView(thread);
  }

  if (view === "tree") {
    return projectTreeView(thread);
  }

  if (!nodeRef) {
    throw new Error("nodeRef is required when requesting the node view");
  }

  return projectNodeView(thread, nodeRef);
}
