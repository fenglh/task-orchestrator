export type TaskCommand =
  | { name: "start"; payload: string }
  | { name: "help"; topic?: string }
  | { name: "list" }
  | { name: "current" }
  | { name: "open"; threadId: string }
  | { name: "status"; threadId?: string }
  | { name: "tree"; threadId?: string }
  | { name: "node"; threadId?: string; nodeRef: string }
  | { name: "use"; threadId: string }
  | { name: "edit"; payload: string }
  | { name: "discard" }
  | { name: "refine"; nodeRef?: string; instruction: string }
  | { name: "retry"; threadId?: string; nodeRef?: string; instruction?: string }
  | { name: "skip"; threadId?: string; nodeRef?: string }
  | { name: "pause"; threadId?: string }
  | { name: "resume"; threadId?: string; payload?: string }
  | { name: "finish"; threadId?: string }
  | { name: "cancel"; threadId?: string }
  | { name: "delete"; threadId?: string };

function isLikelyThreadId(value?: string): boolean {
  return Boolean(value && /^[A-Za-z0-9-]{6,}$/u.test(value));
}

function isLikelyNodeRef(value?: string): boolean {
  return Boolean(value && /^[A-Za-z0-9.]+$/u.test(value));
}

export function parseTaskCommand(message: string): TaskCommand | undefined {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/task")) {
    return undefined;
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[1];
  const arg2 = parts[2];
  const arg3 = parts[3];

  switch (command) {
    case "start":
      return { name: "start", payload: parts.slice(2).join(" ") };
    case "help":
      return { name: "help", topic: parts[2] };
    case "list":
      return { name: "list" };
    case "current":
      return { name: "current" };
    case "open":
    case "use":
      return arg2 ? { name: command === "open" ? "open" : "use", threadId: arg2 } as TaskCommand : undefined;
    case "status":
      return { name: "status", threadId: isLikelyThreadId(arg2) ? arg2 : undefined };
    case "tree":
      return { name: "tree", threadId: isLikelyThreadId(arg2) ? arg2 : undefined };
    case "node": {
      if (!arg2) return undefined;
      if (isLikelyThreadId(arg2) && isLikelyNodeRef(arg3)) {
        return { name: "node", threadId: arg2, nodeRef: arg3 };
      }
      return isLikelyNodeRef(arg2) ? { name: "node", nodeRef: arg2 } : undefined;
    }
    case "edit":
      return { name: "edit", payload: parts.slice(2).join(" ") };
    case "discard":
      return { name: "discard" };
    case "refine": {
      const maybeNodeRef = arg2;
      if (!maybeNodeRef) return undefined;
      const isNodeRef = isLikelyNodeRef(maybeNodeRef);
      return {
        name: "refine",
        nodeRef: isNodeRef ? maybeNodeRef : undefined,
        instruction: isNodeRef ? parts.slice(3).join(" ") : parts.slice(2).join(" "),
      };
    }
    case "retry": {
      if (isLikelyThreadId(arg2) && isLikelyNodeRef(arg3)) {
        return { name: "retry", threadId: arg2, nodeRef: arg3, instruction: parts.slice(4).join(" ") };
      }
      const isNodeRef = isLikelyNodeRef(arg2);
      return {
        name: "retry",
        nodeRef: isNodeRef ? arg2 : undefined,
        instruction: isNodeRef ? parts.slice(3).join(" ") : parts.slice(2).join(" "),
      };
    }
    case "skip": {
      if (isLikelyThreadId(arg2) && isLikelyNodeRef(arg3)) {
        return { name: "skip", threadId: arg2, nodeRef: arg3 };
      }
      return { name: "skip", nodeRef: isLikelyNodeRef(arg2) ? arg2 : undefined };
    }
    case "pause":
      return { name: "pause", threadId: isLikelyThreadId(arg2) ? arg2 : undefined };
    case "resume":
      return isLikelyThreadId(arg2)
        ? { name: "resume", threadId: arg2, payload: parts.slice(3).join(" ") }
        : { name: "resume", payload: parts.slice(2).join(" ") };
    case "finish":
      return { name: "finish", threadId: isLikelyThreadId(arg2) ? arg2 : undefined };
    case "cancel":
      return { name: "cancel", threadId: isLikelyThreadId(arg2) ? arg2 : undefined };
    case "delete":
      return { name: "delete", threadId: isLikelyThreadId(arg2) ? arg2 : undefined };
    default:
      return undefined;
  }
}
