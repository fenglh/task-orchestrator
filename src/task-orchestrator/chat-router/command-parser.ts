export type TaskCommand =
  | { name: "start"; payload: string }
  | { name: "status" }
  | { name: "tree" }
  | { name: "node"; nodeRef: string }
  | { name: "use"; threadId: string }
  | { name: "edit"; payload: string }
  | { name: "discard" }
  | { name: "refine"; nodeRef?: string; instruction: string }
  | { name: "retry"; nodeRef?: string; instruction?: string }
  | { name: "skip"; nodeRef?: string }
  | { name: "pause" }
  | { name: "resume"; payload?: string }
  | { name: "cancel" }
  | { name: "list" };

export function parseTaskCommand(message: string): TaskCommand | undefined {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/task")) {
    return undefined;
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[1];

  switch (command) {
    case "start":
      return {
        name: "start",
        payload: parts.slice(2).join(" "),
      };
    case "status":
      return { name: "status" };
    case "tree":
      return { name: "tree" };
    case "node":
      return parts[2] ? { name: "node", nodeRef: parts[2] } : undefined;
    case "use":
      return parts[2] ? { name: "use", threadId: parts[2] } : undefined;
    case "edit":
      return {
        name: "edit",
        payload: parts.slice(2).join(" "),
      };
    case "discard":
      return { name: "discard" };
    case "refine": {
      const maybeNodeRef = parts[2];
      if (!maybeNodeRef) {
        return undefined;
      }
      const isNodeRef = /^[A-Za-z0-9.]+$/.test(maybeNodeRef);
      return {
        name: "refine",
        nodeRef: isNodeRef ? maybeNodeRef : undefined,
        instruction: isNodeRef ? parts.slice(3).join(" ") : parts.slice(2).join(" "),
      };
    }
    case "retry": {
      const maybeNodeRef = parts[2];
      const isNodeRef = maybeNodeRef ? /^[A-Za-z0-9.]+$/.test(maybeNodeRef) : false;
      return {
        name: "retry",
        nodeRef: isNodeRef ? maybeNodeRef : undefined,
        instruction: isNodeRef ? parts.slice(3).join(" ") : parts.slice(2).join(" "),
      };
    }
    case "skip":
      return {
        name: "skip",
        nodeRef: parts[2] && /^[A-Za-z0-9.]+$/.test(parts[2]) ? parts[2] : undefined,
      };
    case "pause":
      return { name: "pause" };
    case "resume":
      return {
        name: "resume",
        payload: parts.slice(2).join(" "),
      };
    case "cancel":
      return { name: "cancel" };
    case "list":
      return { name: "list" };
    default:
      return undefined;
  }
}
