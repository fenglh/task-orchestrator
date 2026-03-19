import { createTaskOrchestrator } from '../src/task-orchestrator/index.ts';
import { renderTaskSummary } from '../src/task-orchestrator/ui-status/render-task-summary.ts';
import { renderTaskTree } from '../src/task-orchestrator/ui-status/render-task-tree.ts';
import { renderNodeDetail } from '../src/task-orchestrator/ui-status/render-node-detail.ts';

class RetrySkipFakeAdapter {
  #calls = [];
  #taskAFailedOnce = false;
  #taskBShouldFail = true;

  async planRoot() {
    return [
      {
        title: '任务A：失败后 retry',
        goal: '第一次失败，retry 后成功',
        successCriteria: 'retry 后主线继续',
      },
      {
        title: '任务B：失败后 skip',
        goal: '失败后被跳过，主线继续收尾',
        successCriteria: 'skip 后能 finalize',
      },
    ];
  }

  async executeNode(input) {
    this.#calls.push(`execute:${input.node.displayPath}:${input.node.title}:${input.resumeInput ?? ''}`);

    if (input.node.displayPath === '1' && !this.#taskAFailedOnce) {
      this.#taskAFailedOnce = true;
      return {
        status: 'failed',
        reason: '任务A首次执行失败',
        retryable: true,
        diagnostics: ['first failure expected in smoke test'],
      };
    }

    if (input.node.displayPath === '1' && this.#taskAFailedOnce) {
      return {
        status: 'done',
        report: '任务A retry 后成功',
        userVisibleSummary: '任务A retry 后成功。',
        evidence: ['retry succeeded'],
        artifacts: [],
      };
    }

    if (input.node.displayPath === '2' && this.#taskBShouldFail) {
      return {
        status: 'failed',
        reason: '任务B故意失败，等待 skip',
        retryable: true,
        diagnostics: ['skip path expected in smoke test'],
      };
    }

    return {
      status: 'done',
      report: `${input.node.title} 默认完成`,
      userVisibleSummary: `${input.node.title} 默认完成。`,
      evidence: [],
      artifacts: [],
    };
  }

  async finalize() {
    this.#calls.push('finalize');
    return { summary: 'retry/skip smoke test 完成。' };
  }

  async refineNode() {
    throw new Error('refineNode not used in this smoke test');
  }

  consumeRuntimeEvidence() {
    return undefined;
  }

  markTaskBSkipped() {
    this.#taskBShouldFail = false;
  }

  getCalls() {
    return [...this.#calls];
  }
}

const adapter = new RetrySkipFakeAdapter();
const orchestrator = createTaskOrchestrator({
  adapter,
  previewPlanByDefault: false,
});

const channelContext = {
  channelConversationId: 'retry:skip:smoke',
  channelName: 'smoke',
  userId: 'tester',
};

let thread = await orchestrator.startTask('运行 retry/skip smoke test', channelContext);
let summaryView = await orchestrator.getTaskStatus(thread.threadId, 'summary');
console.log('--- AFTER FIRST FAILURE ---');
console.log(renderTaskSummary(summaryView));
console.log('');

thread = await orchestrator.retryTaskNode(thread.threadId, '请重试并继续');
summaryView = await orchestrator.getTaskStatus(thread.threadId, 'summary');
console.log('--- AFTER RETRY ---');
console.log(renderTaskSummary(summaryView));
console.log('');

adapter.markTaskBSkipped();
thread = await orchestrator.skipTaskNode(thread.threadId, '2');
summaryView = await orchestrator.getTaskStatus(thread.threadId, 'summary');
const treeView = await orchestrator.getTaskStatus(thread.threadId, 'tree');
const node1View = await orchestrator.getTaskStatus(thread.threadId, 'node', '1');
const node2View = await orchestrator.getTaskStatus(thread.threadId, 'node', '2');

console.log('--- FINAL SUMMARY ---');
console.log(renderTaskSummary(summaryView));
console.log('');
console.log('--- TREE ---');
console.log(renderTaskTree(treeView));
console.log('');
console.log('--- NODE 1 DETAIL ---');
console.log(renderNodeDetail(node1View));
console.log('');
console.log('--- NODE 2 DETAIL ---');
console.log(renderNodeDetail(node2View));
console.log('');
console.log('--- CALLS ---');
console.log(adapter.getCalls().join('\n'));
console.log('');

const calls = adapter.getCalls();
const treeText = renderTaskTree(treeView);

const assertions = [
  ['first run failed', calls.includes('execute:1:任务A：失败后 retry:')],
  ['retry reran task A', calls.filter((line) => line.startsWith('execute:1:任务A：失败后 retry')).length === 2],
  ['task B executed and failed once', calls.includes('execute:2:任务B：失败后 skip:')],
  ['thread finished after skip', summaryView.status === 'finished'],
  ['finalize called', calls[calls.length - 1] === 'finalize'],
  ['tree shows task A done', treeText.includes('1. 任务A：失败后 retry [done]')],
  ['tree shows task B cancelled', treeText.includes('2. 任务B：失败后 skip [cancelled]')],
  ['node1 summary mentions retry success', (node1View.node.userVisibleSummary ?? '').includes('retry 后成功')],
  ['node2 is cancelled', node2View.node.status === 'cancelled'],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error('RETRY/SKIP SMOKE TEST FAILED');
  for (const [name] of failed) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log('RETRY/SKIP SMOKE TEST PASSED');
