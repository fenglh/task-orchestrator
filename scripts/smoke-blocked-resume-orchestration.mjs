import { createTaskOrchestrator } from '../src/task-orchestrator/index.ts';
import { renderTaskSummary } from '../src/task-orchestrator/ui-status/render-task-summary.ts';
import { renderTaskTree } from '../src/task-orchestrator/ui-status/render-task-tree.ts';
import { renderNodeDetail } from '../src/task-orchestrator/ui-status/render-node-detail.ts';
import { renderBlockedMessage } from '../src/task-orchestrator/ui-status/render-blocked-message.ts';

class BlockedResumeFakeAdapter {
  #calls = [];
  #resumed = false;

  async planRoot() {
    return [
      {
        title: '主任务A：先拿到缺失输入',
        goal: '如果缺输入就 blocked，拿到输入后继续完成',
        successCriteria: '能够 blocked -> resume -> done',
      },
      {
        title: '主任务B：后续任务',
        goal: 'A 完成后继续推进',
        successCriteria: '主任务B被自动执行',
      },
    ];
  }

  async executeNode(input) {
    this.#calls.push(`execute:${input.node.displayPath}:${input.node.title}:${input.resumeInput ?? ''}`);

    if (input.node.displayPath === '1' && input.resumeInput) {
      this.#resumed = true;
      return {
        status: 'done',
        report: `主任务A完成，使用输入: ${input.resumeInput}`,
        userVisibleSummary: `主任务A恢复并完成，输入=${input.resumeInput}`,
        evidence: ['resume input consumed'],
        artifacts: [],
      };
    }

    if (input.node.displayPath === '1' && !this.#resumed) {
      return {
        status: 'blocked',
        question: '请提供一个批准码',
        whyBlocked: '当前节点缺少继续执行所需输入',
        suggestedActions: ['直接回复批准码'],
      };
    }

    if (input.node.displayPath === '2') {
      return {
        status: 'done',
        report: '主任务B完成',
        userVisibleSummary: '主任务B完成。',
        evidence: ['task B done'],
        artifacts: [],
      };
    }

    return {
      status: 'done',
      report: `节点 ${input.node.displayPath} 完成`,
      userVisibleSummary: `节点 ${input.node.displayPath} 完成。`,
      evidence: [],
      artifacts: [],
    };
  }

  async finalize() {
    this.#calls.push('finalize');
    return { summary: 'blocked/resume smoke test 完成。' };
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

const adapter = new BlockedResumeFakeAdapter();
const orchestrator = createTaskOrchestrator({
  adapter,
  previewPlanByDefault: false,
});

const channelContext = {
  channelConversationId: 'blocked:resume:smoke',
  channelName: 'smoke',
  userId: 'tester',
};

let thread = await orchestrator.startTask('运行 blocked/resume smoke test', channelContext);
const blockedSummary = await orchestrator.getTaskStatus(thread.threadId, 'summary');
const blockedThread = await orchestrator.getThread(thread.threadId);
const blockedText = renderBlockedMessage(blockedThread);

console.log('--- BLOCKED SUMMARY ---');
console.log(renderTaskSummary(blockedSummary));
console.log('');
console.log('--- BLOCKED MESSAGE ---');
console.log(blockedText);
console.log('');

thread = await orchestrator.resumeTask(thread.threadId, 'APPROVED-42');
const summaryView = await orchestrator.getTaskStatus(thread.threadId, 'summary');
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
  ['initial thread waiting human', blockedSummary.status === 'waiting_human'],
  ['blocked message rendered', blockedText.includes('请提供一个批准码')],
  ['resume call consumed input', calls.includes('execute:1:主任务A：先拿到缺失输入:APPROVED-42')],
  ['thread finished after resume', summaryView.status === 'finished'],
  ['task B executed after resume', calls.indexOf('execute:2:主任务B：后续任务:') > calls.indexOf('execute:1:主任务A：先拿到缺失输入:APPROVED-42')],
  ['finalize called', calls[calls.length - 1] === 'finalize'],
  ['tree shows task 1 done', treeText.includes('1. 主任务A：先拿到缺失输入 [done]')],
  ['tree shows task 2 done', treeText.includes('2. 主任务B：后续任务 [done]')],
  ['node1 summary mentions resume input', (node1View.node.userVisibleSummary ?? '').includes('APPROVED-42')],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error('BLOCKED/RESUME SMOKE TEST FAILED');
  for (const [name] of failed) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log('BLOCKED/RESUME SMOKE TEST PASSED');
