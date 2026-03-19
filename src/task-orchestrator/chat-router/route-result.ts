export interface RouteResult {
  mode: "task" | "chat";
  text: string;
  threadId?: string;
}
