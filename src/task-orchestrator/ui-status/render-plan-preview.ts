import type { TaskTreeView } from "../types/task-status-view.ts";
import { renderTaskTree } from "./render-task-tree.ts";

function renderPlanPreviewTree(view: TaskTreeView): string {
  return renderTaskTree(view)
    .split("\n")
    .filter((line) => !line.startsWith("图例："))
    .join("\n");
}

export function renderPlanPreview(view: TaskTreeView): string {
  return [
    "计划已生成，尚未开始执行。",
    `任务：${view.title}`,
    "",
    renderPlanPreviewTree(view),
    "",
    "你现在可以：",
    "- 回复 `开始执行` 或输入 `/task resume` 开始执行",
    "- 输入 `/task tree` 查看任务树",
    "- 输入 `/task refine <节点>` 继续细化某一步",
    "- 输入 `/task cancel` 取消任务",
  ].join("\n");
}
