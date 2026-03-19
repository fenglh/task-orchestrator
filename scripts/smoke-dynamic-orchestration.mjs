import { createTaskOrchestrator } from '../src/task-orchestrator/index.ts';
import { renderTaskSummary } from '../src/task-orchestrator/ui-status/render-task-summary.ts';
import { renderTaskTree } from '../src/task-orchestrator/ui-status/render-task-tree.ts';
import { renderNodeDetail } from '../src/task-orchestrator/ui-status/render-node-detail.ts';

class DynamicFakeAdapter {
  workspaceDir = '/tmp/task-orchestrator-dynamic-smoke';
  #runtimeEvidence = new Map();
  #calls = [];

  async planRoot() {
    return [
      {
        title: '主任务A：先调查再完成',
        goal: '如果发现信息不足，就自动拆成子任务',
        successCriteria: '能够先 expand，再在子任务后回收完成',
        completionContract: {
          objective: '验证 expand/reconcile 主链',
          outcomeType: 'analysis_summary',
          reviewMode: 'needs_review',
        },
      },
      {
        title: '主任务B：收尾任务',
        goal: '在 A 完成后自动切换执行',
        successCriteria: 'A 完成后，B 应自动被执行',
      },
    ];
  }

  async executeNode(input) {
    this.#calls.push(`execute:${input.node.displayPath}:${input.node.title}`);

    if (input.node.displayPath === '1' && input.node.status !== 'waiting_children') {
      return {
        status: 'expand',
        reason: '主任务A发现信息不足，需要先补两个子任务。',
        mode: 'replace',
        newTasks: [
          {
            title: '子任务A1：收集背景',
            goal: '补足背景信息',
            successCriteria: '背景信息收集完成',
          },
          {
            title: '子任务A2：整理结论',
            goal: '基于背景信息整理结论',
            successCriteria: '结论整理完成',
          },
        ],
      };
    }

    if (input.node.displayPath === '1.1') {
      return {
        status: 'done',
        report: '子任务A1完成',
        userVisibleSummary: '子任务A1完成。',
        evidence: ['child A1 done'],
        artifacts: [],
      };
    }

    if (input.node.displayPath === '1.2') {
      return {
        status: 'done',
        report: '子任务A2完成',
        userVisibleSummary: '子任务A2完成。',
        evidence: ['child A2 done'],
        artifacts: [],
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
    return { summary: '动态编排 smoke test 完成。' };
  }

  async refineNode() {
    throw new Error('refineNode not used in this smoke test');
  }

  consumeRuntimeEvidence(nodeId) {
    const snapshot = this.#runtimeEvidence.get(nodeId);
    this.#runtimeEvidence.delete(nodeId);
    return snapshot;
  }

  getCalls() {
    return [...this.#calls];
  }
}

const adapter = new DynamicFakeAdapter();
const orchestrator = createTaskOrchestrator({
  adapter,
  previewPlanByDefault: false,
});

const channelContext = {
  channelConversationId: 'dynamic:smoke',
  channelName: 'smoke',
  userId: 'tester',
};

const waitingThread = await orchestrator.startTask('运行动态编排 smoke test', channelContext);
const waitingSummaryView = await orchestrator.getTaskStatus(waitingThread.threadId, 'summary');
const waitingTreeView = await orchestrator.getTaskStatus(waitingThread.threadId, 'tree');
const node1View = await orchestrator.getTaskStatus(waitingThread.threadId, 'node', '1');
const node2View = await orchestrator.getTaskStatus(waitingThread.threadId, 'node', '2');

console.log('--- SUMMARY ---');
console.log(renderTaskSummary(waitingSummaryView));
console.log('');
console.log('--- TREE ---');
console.log(renderTaskTree(waitingTreeView));
console.log('');
console.log('--- NODE 1 DETAIL ---');
console.log(renderNodeDetail(node1View));
console.log('');
console.log('--- NODE 2 DETAIL ---');
console.log(renderNodeDetail(node2View));
console.log('');

const finishedThread = await orchestrator.confirmTaskFinish(waitingThread.threadId);
const finishedSummaryView = await orchestrator.getTaskStatus(finishedThread.threadId, 'summary');
console.log('--- FINISHED SUMMARY ---');
console.log(renderTaskSummary(finishedSummaryView));
console.log('');

console.log('--- CALLS ---');
console.log(adapter.getCalls().join('\n'));
console.log('');

const treeText = renderTaskTree(waitingTreeView);
const waitingSummaryText = renderTaskSummary(waitingSummaryView);
const finishedSummaryText = renderTaskSummary(finishedSummaryView);
const calls = adapter.getCalls();

const assertions = [
  ['thread waits for finish confirmation first', waitingSummaryView.status === 'awaiting_finish_confirmation'],
  ['task A expanded first', calls[0] === 'execute:1:主任务A：先调查再完成'],
  ['child A1 executed', calls.includes('execute:1.1:子任务A1：收集背景')],
  ['child A2 executed', calls.includes('execute:1.2:子任务A2：整理结论')],
  ['task B executed after child tasks', calls.indexOf('execute:2:主任务B：收尾任务') > calls.indexOf('execute:1.2:子任务A2：整理结论')],
  ['finalize called after confirm finish', calls[calls.length - 1] === 'finalize'],
  ['tree contains child A1', treeText.includes('1.1. 子任务A1：收集背景 [已完成]')],
  ['tree contains child A2', treeText.includes('1.2. 子任务A2：整理结论 [已完成]')],
  ['tree contains task B done', treeText.includes('2. 主任务B：收尾任务 [已完成]')],
  ['waiting summary text present', waitingSummaryText.includes('状态：等待你确认是否结束')],
  ['finished summary text present', finishedSummaryText.includes('状态：已完成')],
  ['node1 completed after children', node1View.node.status === 'done'],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error('DYNAMIC ORCHESTRATION SMOKE TEST FAILED');
  for (const [name] of failed) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log('DYNAMIC ORCHESTRATION SMOKE TEST PASSED');
