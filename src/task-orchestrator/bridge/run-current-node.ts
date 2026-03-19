import type { TaskExecutionAdapter } from "../types/adapters.ts";
import type { TaskResult } from "../types/task-result.ts";
import type { TaskThread } from "../types/task-thread.ts";
import { buildNodePrompt } from "./build-node-prompt.ts";

export async function runCurrentNode(
  adapter: TaskExecutionAdapter,
  thread: TaskThread,
  nodeId: string,
): Promise<TaskResult> {
  const node = thread.nodes[nodeId];

  return adapter.executeNode({
    thread,
    node,
    prompt: buildNodePrompt(thread, nodeId),
    resumeInput: node.pendingResumeInput,
  });
}
