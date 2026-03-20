import { createTaskOrchestrator } from '../src/task-orchestrator/index.ts';
import { routeMessage } from '../src/task-orchestrator/chat-router/route-message.ts';

class RecentFallbackFakeAdapter {
  async planRoot() {
    return [
      {
        title: '输出一条可复核结果',
        goal: '生成一个建议人工复核的结果',
        successCriteria: '线程先进入等待确认结束，再可手动结束',
      },
    ];
  }

  async executeNode() {
    return {
      status: 'done',
      report: '最近线程回退 smoke 结果',
      userVisibleSummary: '最近线程回退 smoke 结果。',
      evidence: ['done'],
      artifacts: [],
    };
  }

  async finalize() {
    return { summary: '最近线程回退 smoke 已完成。' };
  }

  async refineNode() {
    throw new Error('refineNode not used in this smoke test');
  }

  consumeRuntimeEvidence() {
    return undefined;
  }
}

const orchestrator = createTaskOrchestrator({
  adapter: new RecentFallbackFakeAdapter(),
  previewPlanByDefault: false,
});

const channelContext = {
  channelConversationId: 'recent:fallback:smoke',
  channelName: 'smoke',
  userId: 'tester',
};

let thread = await orchestrator.startTask('运行 recent fallback smoke test', channelContext);
thread = await orchestrator.confirmTaskFinish(thread.threadId);

const state = await orchestrator.getChannelState(channelContext.channelConversationId);
console.log('--- CHANNEL STATE ---');
console.log(JSON.stringify(state, null, 2));
console.log('');

const statusResult = await routeMessage(orchestrator, {
  channelContext,
  message: '/task status',
});

const treeResult = await routeMessage(orchestrator, {
  channelContext,
  message: '/task tree',
});

console.log('--- STATUS RESULT ---');
console.log(statusResult.text);
console.log('');
console.log('--- TREE RESULT ---');
console.log(treeResult.text);
console.log('');

const assertions = [
  ['channel active thread cleared after finish', !state?.activeThreadId],
  ['status falls back to recent thread', statusResult.text.includes('当前没有进行中的任务。\n下面展示最近一条任务：运行 recent fallback smoke test')],
  ['status shows finished summary', statusResult.text.includes('**状态**：已完成（待复核）') || statusResult.text.includes('**状态**：已完成')],
  ['tree falls back to recent thread', treeResult.text.includes('当前没有进行中的任务。\n下面展示最近一条任务：运行 recent fallback smoke test')],
  ['tree shows task title', treeResult.text.includes('**名称**：运行 recent fallback smoke test')],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error('RECENT THREAD FALLBACK SMOKE TEST FAILED');
  for (const [name] of failed) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log('RECENT THREAD FALLBACK SMOKE TEST PASSED');
