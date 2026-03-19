import { runCurrentNode } from "../../bridge/run-current-node.ts";
import { emitTaskEvent } from "../../ui-status/emit-task-event.ts";
import type { TaskResult } from "../../types/task-result.ts";
import type { GraphRuntimeContext } from "../state.ts";
import type { TaskThread } from "../../types/task-thread.ts";
import { appendChildTasks } from "../../state/task-tree.ts";
import { verifyNodeCompletion } from "../../runner/verify-node-completion.ts";

export async function executeCurrent(
  context: GraphRuntimeContext,
  thread: TaskThread,
  nodeId: string,
): Promise<TaskResult> {
  const node = thread.nodes[nodeId];
  node.status = "running";
  node.startedAt = node.startedAt ?? context.now();
  thread.activeNodeId = nodeId;

  const result = await runCurrentNode(context.adapter, thread, nodeId);

  switch (result.status) {
    case "done": {
      node.status = "done";
      node.report = result.report;
      node.userVisibleSummary = result.userVisibleSummary ?? result.report;
      node.evidence.push(...(result.evidence ?? []));
      node.artifacts.push(...(result.artifacts ?? []));
      node.completionEvidence = await verifyNodeCompletion({
        node,
        result,
        workspaceDir: context.adapter.workspaceDir,
        runtimeEvidence: context.adapter.consumeRuntimeEvidence?.(node.id),
        now: context.now(),
      });
      node.pendingResumeInput = undefined;
      node.finishedAt = context.now();
      thread.blocked = undefined;
      await emitTaskEvent(thread, {
        type: "task_progress",
        message: node.userVisibleSummary,
      }, context.publishTaskEvent);
      break;
    }
    case "expand": {
      node.status = "waiting_children";
      node.expandMode = result.mode;
      node.needsResume = result.mode === "suspend";
      node.userVisibleSummary = result.reason;
      appendChildTasks(thread, nodeId, result.newTasks);
      await emitTaskEvent(thread, {
        type: "task_progress",
        message: `Expanded ${node.displayPath} into ${result.newTasks.length} child task(s).`,
      }, context.publishTaskEvent);
      break;
    }
    case "blocked": {
      node.status = "blocked";
      thread.status = "waiting_human";
      thread.blocked = {
        nodeId,
        question: result.question,
        whyBlocked: result.whyBlocked,
        requiredInputSchema: result.requiredInputSchema,
        suggestedActions: result.suggestedActions,
      };
      await emitTaskEvent(thread, {
        type: "task_blocked",
        message: result.question,
      }, context.publishTaskEvent);
      break;
    }
    case "failed": {
      node.status = "failed";
      node.report = result.reason;
      node.finishedAt = context.now();
      thread.status = "failed";
      await emitTaskEvent(thread, {
        type: "task_failed",
        message: result.reason,
      }, context.publishTaskEvent);
      break;
    }
  }

  return result;
}
