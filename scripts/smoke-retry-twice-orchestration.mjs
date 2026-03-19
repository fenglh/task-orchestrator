import { createTaskOrchestrator } from '../src/task-orchestrator/index.ts';
import { renderTaskSummary } from '../src/task-orchestrator/ui-status/render-task-summary.ts';
import { renderTaskTree } from '../src/task-orchestrator/ui-status/render-task-tree.ts';
import { renderNodeDetail } from '../src/task-orchestrator/ui-status/render-node-detail.ts';

class RetryTwiceFakeAdapter {
  #calls = [];
  #attempt = 0;

  async planRoot() {
    return [
      {
        title: '任务A：连续 retry 两次',
        goal: '前两次失败，第三次成功',
        successCriteria: '验证 failed -> retry -> failed -> retry -> success',
      },
    ];
  }

  async executeNode(input) {
    this.#attempt += 1;
    this.#calls.push(`execute:${input.node.displayPath}:${this.#attempt}:${input.resumeInput ?? ''}`);

    if (input.node.displayPath === '1' && this.#attempt <= 2) {
      return {
        status: 'failed',
        reason: `任务A第 ${this.#attempt} 次执行失败`,
        retryable: true,
        diagnostics: [`attempt=${this.#attempt}`],
      };
    }

    return {
      status: 'done',
      report: `任务A第 ${this.#attempt} 次执行成功`,
      userVisibleSummary: `任务A第 ${this.#attempt} 次执行成功。`,
      evidence: [`attempt=${this.#attempt}`],
      artifacts: [],
    };
  }

  async finalize() {
    this.#calls.push('finalize');
    return { summary: 'retry twice smoke test 完成。' };
  }

  async refineNode() {
    throw new Error('refineNode not used in this smoke test');
  }

  consumeRuntimeEvidence() {
    return undefined;
  }

  getCalls() {
    return [...this.#calls];
  }
}

const adapter = new RetryTwiceFakeAdapter();
const orchestrator = createTaskOrchestrator({
  adapter,
  previewPlanByDefault: false,
});

const channelContext = {
  channelConversationId: 'retry:twice:smoke',
  channelName: 'smoke',
  userId: 'tester',
};

let thread = await orchestrator.startTask('运行 retry twice smoke test', channelContext);
let summary1 = await orchestrator.getTaskStatus(thread.threadId, 'summary');
console.log('--- AFTER FIRST FAILURE ---');
console.log(renderTaskSummary(summary1));
console.log('');

thread = await orchestrator.retryTaskNode(thread.threadId, '第一次 retry');
let summary2 = await orchestrator.getTaskStatus(thread.threadId, 'summary');
console.log('--- AFTER SECOND FAILURE ---');
console.log(renderTaskSummary(summary2));
console.log('');

thread = await orchestrator.retryTaskNode(thread.threadId, '第二次 retry');
const finalSummary = await orchestrator.getTaskStatus(thread.threadId, 'summary');
const treeView = await orchestrator.getTaskStatus(thread.threadId, 'tree');
const node1View = await orchestrator.getTaskStatus(thread.threadId, 'node', '1');

console.log('--- FINAL SUMMARY ---');
console.log(renderTaskSummary(finalSummary));
console.log('');
console.log('--- TREE ---');
console.log(renderTaskTree(treeView));
console.log('');
console.log('--- NODE 1 DETAIL ---');
console.log(renderNodeDetail(node1View));
console.log('');
console.log('--- CALLS ---');
console.log(adapter.getCalls().join('\n'));
console.log('');

const calls = adapter.getCalls();
const treeText = renderTaskTree(treeView);

const assertions = [
  ['first failure status', summary1.status === 'failed'],
  ['second failure status', summary2.status === 'failed'],
  ['final status finished', finalSummary.status === 'finished'],
  ['node executed three times', calls.filter((line) => line.startsWith('execute:1:')).length === 3],
  ['finalize called', calls[calls.length - 1] === 'finalize'],
  ['tree shows node done', treeText.includes('1. 任务A：连续 retry 两次 [done]')],
  ['node detail shows final success summary', (node1View.node.userVisibleSummary ?? '').includes('第 3 次执行成功')],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error('RETRY TWICE SMOKE TEST FAILED');
  for (const [name] of failed) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log('RETRY TWICE SMOKE TEST PASSED');
