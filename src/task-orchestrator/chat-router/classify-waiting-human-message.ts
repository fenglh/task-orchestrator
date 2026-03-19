import type { TaskThread } from "../types/task-thread.ts";
import { detectTaskIntent } from "./detect-task-intent.ts";

export type WaitingHumanMessageKind =
  | "control"
  | "status_query"
  | "help_request"
  | "resume_input"
  | "ambiguous";

export interface WaitingHumanMessageClassification {
  kind: WaitingHumanMessageKind;
}

function looksLikeDirectAnswer(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.length <= 3) {
    return true;
  }

  if (/^(yes|no|是|否|包含|不包含|确认|取消)$/i.test(trimmed)) {
    return true;
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return true;
  }

  if (/[,，、]/.test(trimmed)) {
    return true;
  }

  return trimmed.length < 80;
}

function looksLikeNewTaskDraft(message: string): boolean {
  return (
    message.includes("帮我") ||
    message.includes("再做一个") ||
    message.includes("再帮我") ||
    message.includes("竞品") ||
    message.includes("分析") ||
    message.includes("任务")
  );
}

export function classifyWaitingHumanMessage(
  message: string,
  thread: TaskThread,
): WaitingHumanMessageClassification {
  const trimmed = message.trim();
  const intent = detectTaskIntent(trimmed);

  if (
    trimmed.startsWith("/task") ||
    intent.kind === "start" ||
    intent.kind === "confirm_start" ||
    intent.kind === "discard_pending" ||
    intent.kind === "edit_pending" ||
    intent.kind === "retry" ||
    intent.kind === "skip" ||
    intent.kind === "pause" ||
    intent.kind === "cancel" ||
    intent.kind === "tree" ||
    intent.kind === "status" ||
    intent.kind === "node" ||
    intent.kind === "refine"
  ) {
    return { kind: intent.kind === "tree" || intent.kind === "status" || intent.kind === "node" ? "status_query" : "control" };
  }

  if (looksLikeNewTaskDraft(trimmed)) {
    return { kind: "ambiguous" };
  }

  if (
    trimmed.includes("为什么") ||
    trimmed.includes("什么意思") ||
    trimmed.includes("解释") ||
    trimmed.includes("help") ||
    trimmed.includes("why")
  ) {
    return { kind: "help_request" };
  }

  if (thread.blocked?.suggestedActions?.some((action) => trimmed.includes(action))) {
    return { kind: "resume_input" };
  }

  if (looksLikeDirectAnswer(trimmed)) {
    return { kind: "resume_input" };
  }

  return { kind: "ambiguous" };
}
