import type { TaskTreeView } from "../types/task-status-view.ts";
import { renderTaskTree } from "./render-task-tree.ts";

export function renderPlanPreview(view: TaskTreeView): string {
  return [
    "Execution plan ready",
    `Task: ${view.title}`,
    "",
    renderTaskTree(view),
    "",
    "Reply with `开始执行` or `/task resume` to start.",
    "Use `/task refine <node>` to split a task further, `/task tree` to inspect the tree, or `/task cancel` to stop.",
  ].join("\n");
}
