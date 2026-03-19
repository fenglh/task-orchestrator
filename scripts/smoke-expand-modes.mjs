import { createTaskOrchestrator } from '../src/task-orchestrator/index.ts';
import { renderTaskSummary } from '../src/task-orchestrator/ui-status/render-task-summary.ts';
import { renderTaskTree } from '../src/task-orchestrator/ui-status/render-task-tree.ts';
import { renderNodeDetail } from '../src/task-orchestrator/ui-status/render-node-detail.ts';

class ExpandModesFakeAdapter {
  #calls = [];
  #suspendExpanded = false;
  #suspendParentResumed = false;

  async planRoot() {
    return [
      {
        title: '任务A：replace 模式',
        goal: 'expand 为 replace 后，子任务完成应直接回收为 done',
        successCriteria: 'replace 模式下父节点不需要再次执行',
      },
      {
        title: '任务B：suspend 模式',
        goal: 'expand 为 suspend 后，子任务完成应回到父节点再执行一次',
        successCriteria: 'suspend 模式下父节点应再次执行后才 done',
      },
    ];
  }

  async executeNode(input) {
    this.#calls.push(`execute:${input.node.displayPath}:${input.node.title}`);

    if (input.node.displayPath === '1') {
      return {
        status: 'expand',
        reason: '任务A需要两个 replace 子任务。',
        mode: 'replace',
        newTasks: [
          { title: '任务A1', goal: '完成 replace 子任务 1', successCriteria: 'done' },
          { title: '任务A2', goal: '完成 replace 子任务 2', successCriteria: 'done' },
        ],
      };
    }

    if (input.node.displayPath === '1.1' || input.node.displayPath === '1.2') {
      return {
        status: 'done',
        report: `${input.node.title} 完成`,
        userVisibleSummary: `${input.node.title} 完成。`,
        evidence: [],
        artifacts: [],
      };
    }

    if (input.node.displayPath === '2' && !this.#suspendExpanded) {
      this.#suspendExpanded = true;
      return {
        status: 'expand',
        reason: '任务B需要先暂停去做两个 suspend 子任务。',
        mode: 'suspend',
        newTasks: [
          { title: '任务B1', goal: '完成 suspend 子任务 1', successCriteria: 'done' },
          { title: '任务B2', goal: '完成 suspend 子任务 2', successCriteria: 'done' },
        ],
      };
    }

    if (input.node.displayPath === '2.1' || input.node.displayPath === '2.2') {
      return {
        status: 'done',
        report: `${input.node.title} 完成`,
        userVisibleSummary: `${input.node.title} 完成。`,
        evidence: [],
        artifacts: [],
      };
    }

    if (input.node.displayPath === '2' && this.#suspendExpanded && !this.#suspendParentResumed) {
      this.#suspendParentResumed = true;
      return {
        status: 'done',
        report: '任务B父节点在 suspend 子任务完成后重新执行并完成',
        userVisibleSummary: '任务B父节点重新执行并完成。',
        evidence: ['suspend parent rerun'],
        artifacts: [],
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
    return { summary: 'expand modes smoke test 完成。' };
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

const adapter = new ExpandModesFakeAdapter();
const orchestrator = createTaskOrchestrator({
  adapter,
  previewPlanByDefault: false,
});

const channelContext = {
  channelConversationId: 'expand:modes:smoke',
  channelName: 'smoke',
  userId: 'tester',
};

const thread = await orchestrator.startTask('运行 expand modes smoke test', channelContext);
const summaryView = await orchestrator.getTaskStatus(thread.threadId, 'summary');
const treeView = await orchestrator.getTaskStatus(thread.threadId, 'tree');
const node1View = await orchestrator.getTaskStatus(thread.threadId, 'node', '1');
const node2View = await orchestrator.getTaskStatus(thread.threadId, 'node', '2');

console.log('--- SUMMARY ---');
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

const task2Executions = calls.filter((line) => line === 'execute:2:任务B：suspend 模式').length;

const assertions = [
  ['thread finished', summaryView.status === 'finished'],
  ['replace parent executed once', calls.filter((line) => line === 'execute:1:任务A：replace 模式').length === 1],
  ['replace child A1 executed', calls.includes('execute:1.1:任务A1')],
  ['replace child A2 executed', calls.includes('execute:1.2:任务A2')],
  ['suspend parent executed twice', task2Executions === 2],
  ['suspend child B1 executed', calls.includes('execute:2.1:任务B1')],
  ['suspend child B2 executed', calls.includes('execute:2.2:任务B2')],
  ['finalize called', calls[calls.length - 1] === 'finalize'],
  ['tree contains replace children done', treeText.includes('1.1. 任务A1 [已完成]') && treeText.includes('1.2. 任务A2 [已完成]')],
  ['tree contains suspend children done', treeText.includes('2.1. 任务B1 [已完成]') && treeText.includes('2.2. 任务B2 [已完成]')],
  ['node1 final status done', node1View.node.status === 'done'],
  ['node2 final status done', node2View.node.status === 'done'],
  ['node2 summary shows rerun', (node2View.node.userVisibleSummary ?? '').includes('重新执行并完成')],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error('EXPAND MODES SMOKE TEST FAILED');
  for (const [name] of failed) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log('EXPAND MODES SMOKE TEST PASSED');
