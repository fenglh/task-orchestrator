import { randomUUID } from "node:crypto";

export function createThreadId(): string {
  return `thread_${randomUUID()}`;
}

export function createSessionId(threadId: string): string {
  return `session_${threadId}`;
}

export function createNodeId(): string {
  return `node_${randomUUID()}`;
}
