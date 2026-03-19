import type { TaskThread } from "../types/task-thread.ts";

function statusLabel(status?: string): string {
  switch (status) {
    case "pending":
      return "待处理";
    case "running":
      return "进行中";
    case "waiting_human":
      return "等待你的输入";
    case "awaiting_plan_confirmation":
      return "等待你确认开始";
    case "awaiting_finish_confirmation":
      return "等待你确认是否结束";
    case "paused":
      return "已暂停";
    case "finished":
      return "已完成";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
    case "blocked":
      return "阻塞";
    case "waiting_children":
      return "等待子任务";
    case "cancelled":
      return "已取消";
    default:
      return status ?? "未知";
  }
}

export function renderTaskCard(thread: TaskThread): string {
  return [
    "任务已创建",
    `任务 ID：${thread.threadId}`,
    `任务标题：${thread.title}`,
    `当前状态：${statusLabel(thread.status)}`,
  ].join("\n");
}
