import { enforceTaskGuards } from "../state/guards.ts";
import {
  reconcileWaitingNodes,
  selectNextExecutableNode,
} from "../state/task-tree.ts";
import type { TaskResult } from "../types/task-result.ts";
import type { TaskThread } from "../types/task-thread.ts";
import { compileTaskGraph } from "../graph/compile.ts";
import type { GraphRuntimeContext } from "../graph/state.ts";
import { applyPauseOrCancel } from "./pause-cancel.ts";
import { shouldAutoAdvance } from "./auto-advance.ts";

function shouldTransitionToFinalize(thread: TaskThread): boolean {
  return (
    thread.status === "running" &&
    thread.phase !== "finalizing" &&
    !selectNextExecutableNode(thread) &&
    thread.nodes[thread.rootTaskId]?.status === "done"
  );
}

export async function runLoop(
  context: GraphRuntimeContext,
  thread: TaskThread,
): Promise<TaskThread> {
  const graph = compileTaskGraph();
  let lastResult: TaskResult | undefined;

  for (;;) {
    thread.updatedAt = context.now();
    enforceTaskGuards(thread, context.guards);

    if (await applyPauseOrCancel(thread, context.publishTaskEvent)) {
      break;
    }

    if (
      thread.status === "awaiting_plan_confirmation" ||
      thread.status === "waiting_human" ||
      thread.status === "paused" ||
      thread.status === "finished" ||
      thread.status === "failed" ||
      thread.status === "cancelled"
    ) {
      break;
    }

    if (thread.phase === "planning") {
      await graph.planRoot(context, thread);
      await context.taskThreadRepo.save(thread);
      continue;
    }

    reconcileWaitingNodes(thread, context.now());

    if (shouldTransitionToFinalize(thread)) {
      thread.phase = "finalizing";
    }

    if (thread.phase === "finalizing") {
      await graph.finalizeTask(context, thread);
      await context.taskThreadRepo.save(thread);
      break;
    }

    const currentNode = selectNextExecutableNode(thread);
    if (!currentNode) {
      break;
    }

    thread.status = "running";
    lastResult = await graph.executeCurrent(context, thread, currentNode.id);
    thread.autoAdvanceCount += 1;
    thread.updatedAt = context.now();
    await context.taskThreadRepo.save(thread);

    if (!shouldAutoAdvance(thread)) {
      break;
    }

    if (lastResult.status === "blocked" || lastResult.status === "failed") {
      break;
    }
  }

  return thread;
}
