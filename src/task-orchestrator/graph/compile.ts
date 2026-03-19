import { executeCurrent } from "./nodes/execute-current.ts";
import { finalizeTask } from "./nodes/finalize.ts";
import { planRoot } from "./nodes/plan-root.ts";

export function compileTaskGraph() {
  return {
    planRoot,
    executeCurrent,
    finalizeTask,
  };
}
