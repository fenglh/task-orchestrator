import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderNodeDetail } from "./task-orchestrator/ui-status/render-node-detail.ts";
import { OpenClawWebChatTaskHandler } from "./task-orchestrator/openclaw/webchat-handler.ts";
import type {
  EmbeddedPiRunResult,
  OpenClawEmbeddedPiRunner,
  RunEmbeddedPiAgentParams,
} from "./task-orchestrator/openclaw/types.ts";

class FakeEmbeddedPiRunner implements OpenClawEmbeddedPiRunner {
  private static readonly attempts = new Map<string, number>();

  async runEmbeddedPiAgent(
    input: RunEmbeddedPiAgentParams,
  ): Promise<EmbeddedPiRunResult> {
    const nodeTitle = input.prompt.match(/Node title: (.+)/)?.[1];

    if (input.prompt.includes("TASK_KIND: PLAN_ROOT")) {
      return {
        text: JSON.stringify({
          tasks: [
            {
              title: "Define the analysis scope",
              goal: "Confirm which product category, sellers, and time range are in scope.",
              successCriteria: "A clear analysis scope is recorded.",
            },
            {
              title: "Collect competitor samples",
              goal: "Gather representative competitor listings and core attributes.",
              successCriteria: "A usable competitor sample set is available.",
            },
            {
              title: "Analyze brand matrix",
              goal: "Compare pricing, positioning, and selling points.",
              successCriteria: "The brand matrix is summarized.",
            },
          ],
        }),
      };
    }

    if (input.prompt.includes("TASK_KIND: FINALIZE")) {
      return {
        text: JSON.stringify({
          summary: "Task finished with 5 completed node(s).",
        }),
      };
    }

    if (input.prompt.includes("TASK_KIND: REFINE_NODE")) {
      return {
        text: JSON.stringify({
          status: "expand",
          reason: "The node was refined into more granular scope-setting steps.",
          mode: "replace",
          newTasks: [
            {
              title: "Define category scope",
              goal: "Specify the product category and exclusions.",
              successCriteria: "Category scope is explicit.",
            },
            {
              title: "Define seller scope",
              goal: "Specify whether to include self-operated and marketplace sellers.",
              successCriteria: "Seller scope is explicit.",
            },
            {
              title: "Define price band scope",
              goal: "Specify which price ranges to analyze.",
              successCriteria: "Price bands are explicit.",
            },
          ],
        }),
      };
    }

    if (nodeTitle === "Collect competitor samples" && !input.prompt.includes("User supplied resume input:")) {
      await input.onBlockReply?.({
        text: JSON.stringify({
          status: "blocked",
          question: "Should the sample include third-party marketplace sellers?",
          whyBlocked: "The sampling scope changes the analysis output.",
          suggestedActions: [
            "Reply with: include marketplace sellers",
            "Reply with: self-operated stores only",
          ],
        }),
      });
      return {
        text: undefined,
      };
    }

    if (nodeTitle === "Analyze brand matrix") {
      return {
        text: JSON.stringify({
          status: "expand",
          reason: "The brand matrix should be split into pricing and selling points.",
          mode: "replace",
          newTasks: [
            {
              title: "Compare price bands",
              goal: "Cluster competitors into price bands and identify the leading brands.",
              successCriteria: "Price bands are identified.",
            },
            {
              title: "Compare selling points",
              goal: "Summarize the main selling points used by leading brands.",
              successCriteria: "Selling points are summarized.",
            },
          ],
        }),
      };
    }

    if (nodeTitle === "Compare selling points") {
      const attemptKey = input.runId;
      const attemptCount = FakeEmbeddedPiRunner.attempts.get(attemptKey) ?? 0;
      FakeEmbeddedPiRunner.attempts.set(attemptKey, attemptCount + 1);
      if (attemptCount === 0) {
        return {
          text: JSON.stringify({
            status: "failed",
            reason: "The source listing data was incomplete. Retry after narrowing the seller scope.",
            retryable: true,
            diagnostics: ["missing attribute set"],
          }),
        };
      }
    }

    const title = nodeTitle ?? "task node";
    await input.onPartialReply?.(`Working on ${title}`);
    await input.onAgentEvent?.({ type: "turn_end" });

    return {
      text: JSON.stringify({
        status: "done",
        report: `Completed: ${title}`,
        userVisibleSummary: `Finished ${title}.`,
      }),
    };
  }
}

async function main(): Promise<void> {
  const storageDir = await mkdtemp(join(tmpdir(), "task-orchestrator-"));
  const pushedMessages: string[] = [];
  const handler = new OpenClawWebChatTaskHandler({
    runner: new FakeEmbeddedPiRunner(),
    storageDir,
    sessionDir: join(storageDir, "pi-sessions"),
    workspaceDir: storageDir,
    fallbackChatHandler: async (_channelContext, message) => `[chat] ${message}`,
    taskEventHandler: async (_channelContext, payload) => {
      pushedMessages.push(`[push:${payload.eventType}] ${payload.message}`);
    },
  });

  const channelContext = {
    channelConversationId: "webchat-demo",
    channelName: "webchat",
    userId: "demo-user",
  };

  const casualResult = await handler.handleMessage(
    channelContext,
    "GMV是什么意思？",
  );
  console.log("=== CASUAL ===");
  console.log(casualResult.text);

  const pendingStartResult = await handler.handleMessage(
    channelContext,
    "Run a competitor analysis for JD marketplace floor cleaners and keep going automatically.",
  );
  console.log("\n=== PENDING START ===");
  console.log(pendingStartResult.text);

  const updatePendingResult = await handler.handleMessage(
    channelContext,
    "修改为：只分析京东自营洗地机，并自动继续执行",
  );
  console.log("\n=== UPDATE PENDING ===");
  console.log(updatePendingResult.text);

  const startResult = await handler.handleMessage(
    channelContext,
    "确认开始任务",
  );
  const threadId = startResult.threadId!;
  console.log("\n=== PLAN PREVIEW ===");
  console.log(startResult.text);

  const treeResult = await handler.handleMessage(
    channelContext,
    "/task tree",
  );
  console.log("\n=== TREE ===");
  console.log(treeResult.text);

  const refineResult = await handler.handleMessage(
    channelContext,
    "/task refine 1 把这个任务拆得更细，至少拆到范围定义粒度",
  );
  console.log("\n=== REFINE ===");
  console.log(refineResult.text);

  const refinedTreeResult = await handler.handleMessage(
    channelContext,
    "/task tree",
  );
  console.log("\n=== REFINED TREE ===");
  console.log(refinedTreeResult.text);

  const resumeAfterRefineResult = await handler.handleMessage(
    channelContext,
    "开始执行",
  );
  console.log("\n=== START EXECUTION ===");
  console.log(resumeAfterRefineResult.text);

  const blockedStatus = await handler.handleMessage(
    channelContext,
    "/task status",
  );
  console.log("\n=== STATUS ===");
  console.log(blockedStatus.text);

  const helpWhileBlocked = await handler.handleMessage(
    channelContext,
    "为什么需要这个参数？",
  );
  console.log("\n=== BLOCKED HELP ===");
  console.log(helpWhileBlocked.text);

  const newTaskWhileBlocked = await handler.handleMessage(
    channelContext,
    "再帮我做一个天猫洗地机竞品分析",
  );
  console.log("\n=== BLOCKED NEW TASK ===");
  console.log(newTaskWhileBlocked.text);

  const recoveredHandler = new OpenClawWebChatTaskHandler({
    runner: new FakeEmbeddedPiRunner(),
    storageDir,
    sessionDir: join(storageDir, "pi-sessions"),
    workspaceDir: storageDir,
    fallbackChatHandler: async (_channelContext, message) => `[chat] ${message}`,
    taskEventHandler: async (_channelContext, payload) => {
      pushedMessages.push(`[push:${payload.eventType}] ${payload.message}`);
    },
  });
  const recoveredThreads = await recoveredHandler.recover();
  console.log("\n=== RECOVERED ===");
  console.log(
    recoveredThreads
      .map((thread) => `${thread.threadId} [${thread.status}]`)
      .join("\n"),
  );

  const resumeResult = await recoveredHandler.handleMessage(
    channelContext,
    "include marketplace sellers",
  );
  console.log("\n=== RESUME ===");
  console.log(resumeResult.text);

  const failedHelp = await recoveredHandler.handleMessage(
    channelContext,
    "为什么失败了？",
  );
  console.log("\n=== FAILED HELP ===");
  console.log(failedHelp.text);

  const retryResult = await recoveredHandler.handleMessage(
    channelContext,
    "/task retry",
  );
  console.log("\n=== RETRY ===");
  console.log(retryResult.text);

  const listResult = await recoveredHandler.handleMessage(
    channelContext,
    "/task list",
  );
  console.log("\n=== LIST ===");
  console.log(listResult.text);

  const nodeResult = await recoveredHandler
    .getOrchestrator()
    .getTaskStatus(threadId, "node", "3.1");
  console.log("\n=== NODE ===");
  console.log(renderNodeDetail(nodeResult));

  console.log("\n=== PUSHES ===");
  console.log(pushedMessages.join("\n"));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
