import type { TaskThread } from "../types/task-thread.ts";

export interface TaskGuards {
  maxDepth: number;
  maxNodes: number;
  maxAutoAdvanceSteps: number;
}

export const defaultTaskGuards: TaskGuards = {
  maxDepth: 6,
  maxNodes: 50,
  maxAutoAdvanceSteps: 12,
};

export function enforceTaskGuards(
  thread: TaskThread,
  guards: TaskGuards,
): void {
  const nodes = Object.values(thread.nodes);
  const deepestNode = nodes.reduce(
    (maxDepth, node) => Math.max(maxDepth, node.depth),
    0,
  );

  if (deepestNode > guards.maxDepth) {
    throw new Error(`Task tree depth exceeded limit: ${guards.maxDepth}`);
  }

  if (nodes.length > guards.maxNodes) {
    throw new Error(`Task tree node count exceeded limit: ${guards.maxNodes}`);
  }
}
