import type { ChannelContext } from "../types/channel-state.ts";
import type { TaskNode, TaskNodeStatus } from "../types/task-node.ts";
import type { TaskDraft } from "../types/task-result.ts";
import type { TaskThread } from "../types/task-thread.ts";
import { createNodeId, createSessionId, createThreadId } from "../utils/ids.ts";

export interface CreateThreadInput {
  title: string;
  goal: string;
  successCriteria: string;
  channelContext: ChannelContext;
  now: string;
  maxAutoAdvanceSteps: number;
  previewPlan: boolean;
}

export function createTaskThread(input: CreateThreadInput): TaskThread {
  const threadId = createThreadId();
  const rootTaskId = createNodeId();
  const rootNode: TaskNode = {
    id: rootTaskId,
    displayPath: "0",
    title: input.title,
    goal: input.goal,
    successCriteria: input.successCriteria,
    status: "pending",
    children: [],
    needsResume: false,
    depth: 0,
    evidence: [],
    artifacts: [],
  };

  return {
    threadId,
    sessionId: createSessionId(threadId),
    title: input.title,
    rootTaskId,
    status: "running",
    phase: "planning",
    activeNodeId: undefined,
    channelContext: input.channelContext,
    channelConversationId: input.channelContext.channelConversationId,
    latestUserVisibleSummary: undefined,
    pauseRequested: false,
    cancelRequested: false,
    previewPlan: input.previewPlan,
    planConfirmed: !input.previewPlan,
    autoAdvanceCount: 0,
    maxAutoAdvanceSteps: input.maxAutoAdvanceSteps,
    blocked: undefined,
    nodes: {
      [rootTaskId]: rootNode,
    },
    events: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function getTaskNode(
  thread: TaskThread,
  nodeId: string,
): TaskNode | undefined {
  return thread.nodes[nodeId];
}

export function listChildNodes(thread: TaskThread, nodeId: string): TaskNode[] {
  const node = getTaskNode(thread, nodeId);
  if (!node) {
    return [];
  }

  return node.children
    .map((childId) => thread.nodes[childId])
    .filter((child): child is TaskNode => Boolean(child));
}

export function findNodeByRef(
  thread: TaskThread,
  nodeRef: string,
): TaskNode | undefined {
  const direct = thread.nodes[nodeRef];
  if (direct) {
    return direct;
  }

  return Object.values(thread.nodes).find((node) => node.displayPath === nodeRef);
}

export function appendChildTasks(
  thread: TaskThread,
  parentId: string,
  tasks: TaskDraft[],
): TaskNode[] {
  const parentNode = getTaskNode(thread, parentId);
  if (!parentNode) {
    throw new Error(`Parent node not found: ${parentId}`);
  }

  const createdNodes = tasks.map((task, index) => {
    const nodeId = createNodeId();
    const displayPath =
      parentNode.displayPath === "0"
        ? `${index + 1}`
        : `${parentNode.displayPath}.${index + 1}`;
    const node: TaskNode = {
      id: nodeId,
      displayPath,
      parentId,
      title: task.title,
      goal: task.goal,
      successCriteria: task.successCriteria,
      status: "pending",
      children: [],
      needsResume: false,
      depth: parentNode.depth + 1,
      evidence: [],
      artifacts: [],
    };

    thread.nodes[nodeId] = node;
    parentNode.children.push(nodeId);
    return node;
  });

  return createdNodes;
}

export function createRevisionNode(
  thread: TaskThread,
  targetNodeId: string,
): TaskNode {
  const targetNode = getTaskNode(thread, targetNodeId);
  if (!targetNode) {
    throw new Error(`Target node not found: ${targetNodeId}`);
  }

  const revisionCount =
    Object.values(thread.nodes).filter((node) => node.revisesNodeId === targetNodeId).length + 1;
  const revisionNodeId = createNodeId();
  const revisionNode: TaskNode = {
    id: revisionNodeId,
    displayPath: `${targetNode.displayPath}R${revisionCount}`,
    parentId: targetNode.parentId,
    revisesNodeId: targetNodeId,
    title: `${targetNode.title} (revision ${revisionCount})`,
    goal: targetNode.goal,
    successCriteria: targetNode.successCriteria,
    status: "pending",
    children: [],
    needsResume: false,
    depth: targetNode.depth,
    evidence: [],
    artifacts: [],
  };

  thread.nodes[revisionNodeId] = revisionNode;

  if (targetNode.parentId) {
    const parentNode = getTaskNode(thread, targetNode.parentId);
    if (!parentNode) {
      throw new Error(`Parent node not found: ${targetNode.parentId}`);
    }

    const insertionIndex = parentNode.children.indexOf(targetNodeId);
    if (insertionIndex >= 0) {
      parentNode.children.splice(insertionIndex + 1, 0, revisionNodeId);
    } else {
      parentNode.children.push(revisionNodeId);
    }
  } else {
    const rootNode = getTaskNode(thread, thread.rootTaskId);
    if (rootNode && !rootNode.children.includes(revisionNodeId)) {
      rootNode.children.push(revisionNodeId);
    }
  }

  return revisionNode;
}

export function cancelNodeSubtree(thread: TaskThread, nodeId: string): void {
  const node = getTaskNode(thread, nodeId);
  if (!node) {
    return;
  }

  for (const childId of node.children) {
    cancelNodeSubtree(thread, childId);
    const child = thread.nodes[childId];
    if (child.status !== "done" && child.status !== "failed") {
      child.status = "cancelled";
      child.finishedAt = child.finishedAt ?? new Date().toISOString();
    }
  }
}

export function countTaskProgress(thread: TaskThread): {
  done: number;
  total: number;
} {
  const nonRootNodes = Object.values(thread.nodes).filter(
    (node) => node.id !== thread.rootTaskId,
  );

  return {
    done: nonRootNodes.filter((node) => node.status === "done").length,
    total: nonRootNodes.length,
  };
}

export function isTerminalNodeStatus(status: TaskNodeStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

export function reconcileWaitingNodes(thread: TaskThread, now: string): void {
  const nodes = Object.values(thread.nodes).sort((left, right) => right.depth - left.depth);

  for (const node of nodes) {
    if (node.status !== "waiting_children") {
      continue;
    }

    const children = listChildNodes(thread, node.id);
    if (children.length === 0) {
      continue;
    }

    if (!children.every((child) => isTerminalNodeStatus(child.status))) {
      continue;
    }

    if (node.needsResume) {
      node.needsResume = false;
      node.status = "pending";
      continue;
    }

    node.status = "done";
    node.finishedAt = node.finishedAt ?? now;
    if (!node.userVisibleSummary) {
      node.userVisibleSummary = `Completed after ${children.length} child task(s).`;
    }
  }
}

function visitForExecution(
  thread: TaskThread,
  nodeId: string,
): TaskNode | undefined {
  const node = thread.nodes[nodeId];
  if (!node) {
    return undefined;
  }

  if (node.id !== thread.rootTaskId && node.status === "pending") {
    return node;
  }

  for (const childId of node.children) {
    const candidate = visitForExecution(thread, childId);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

export function selectNextExecutableNode(thread: TaskThread): TaskNode | undefined {
  return visitForExecution(thread, thread.rootTaskId);
}

export function getNodePath(thread: TaskThread, nodeId?: string): TaskNode[] {
  if (!nodeId) {
    return [];
  }

  const path: TaskNode[] = [];
  let current = thread.nodes[nodeId];

  while (current) {
    path.unshift(current);
    current = current.parentId ? thread.nodes[current.parentId] : undefined;
  }

  return path;
}
