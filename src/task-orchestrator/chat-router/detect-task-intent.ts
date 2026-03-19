export type TaskIntent =
  | { kind: "start" }
  | { kind: "status" }
  | { kind: "tree" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "cancel" }
  | { kind: "retry"; nodeRef?: string; instruction?: string }
  | { kind: "skip"; nodeRef?: string }
  | { kind: "confirm_start" }
  | { kind: "discard_pending" }
  | { kind: "edit_pending"; taskInput: string }
  | { kind: "refine"; nodeRef?: string; instruction: string }
  | { kind: "node"; nodeRef: string }
  | { kind: "none" };

const startKeywords = [
  "task",
  "tasks",
  "analyze",
  "analysis",
  "break down",
  "competitor",
  "research",
  "workflow",
  "任务",
  "分析",
  "拆解",
  "竞品",
  "调研",
];

export function detectTaskIntent(message: string): TaskIntent {
  const normalized = message.trim().toLowerCase();

  if (!normalized) {
    return { kind: "none" };
  }

  if (
    normalized.includes("重试") ||
    normalized.startsWith("retry")
  ) {
    const nodeMatch = normalized.match(/(?:node|子任务|任务)\s*([a-z0-9.]+)/);
    return {
      kind: "retry",
      nodeRef: nodeMatch?.[1],
      instruction: message.trim(),
    };
  }

  if (
    normalized.includes("跳过") ||
    normalized.startsWith("skip")
  ) {
    const nodeMatch = normalized.match(/(?:node|子任务|任务)\s*([a-z0-9.]+)/);
    return {
      kind: "skip",
      nodeRef: nodeMatch?.[1],
    };
  }

  if (
    normalized === "确认开始任务" ||
    normalized === "开始任务" ||
    normalized === "确认" ||
    normalized === "yes" ||
    normalized === "confirm"
  ) {
    return { kind: "confirm_start" };
  }

  if (
    normalized === "取消待启动任务" ||
    normalized === "取消待确认任务" ||
    normalized === "算了" ||
    normalized === "不用了" ||
    normalized === "forget it"
  ) {
    return { kind: "discard_pending" };
  }

  const editPrefixes = ["修改为：", "修改为:", "改成：", "改成:", "更新为：", "更新为:"];
  const matchedEditPrefix = editPrefixes.find((prefix) => message.startsWith(prefix));
  if (matchedEditPrefix) {
    return {
      kind: "edit_pending",
      taskInput: message.slice(matchedEditPrefix.length).trim(),
    };
  }

  if (
    normalized.includes("拆细") ||
    normalized.includes("细化") ||
    normalized.includes("refine")
  ) {
    const nodeMatch = normalized.match(/(?:node|子任务|任务)\s*([a-z0-9.]+)/);
    return {
      kind: "refine",
      nodeRef: nodeMatch?.[1],
      instruction: message.trim(),
    };
  }

  if (
    normalized.includes("暂停") ||
    normalized.includes("pause")
  ) {
    return { kind: "pause" };
  }

  if (
    normalized.includes("继续") ||
    normalized.includes("resume") ||
    normalized.includes("开始执行") ||
    normalized.includes("执行吧") ||
    normalized.includes("按计划执行")
  ) {
    return { kind: "resume" };
  }

  if (
    normalized.includes("停止") ||
    normalized.includes("取消任务") ||
    normalized.includes("cancel")
  ) {
    return { kind: "cancel" };
  }

  if (
    normalized.includes("任务树") ||
    normalized.includes("tree")
  ) {
    return { kind: "tree" };
  }

  if (
    normalized.includes("进展") ||
    normalized.includes("状态") ||
    normalized.includes("status")
  ) {
    return { kind: "status" };
  }

  const nodeMatch = normalized.match(/(?:node|子任务)\s*([a-z0-9.]+)/);
  if (nodeMatch?.[1]) {
    return { kind: "node", nodeRef: nodeMatch[1] };
  }

  const looksLikeTask = startKeywords.some((keyword) =>
    normalized.includes(keyword),
  );
  if (looksLikeTask && normalized.length > 16) {
    return { kind: "start" };
  }

  return { kind: "none" };
}
