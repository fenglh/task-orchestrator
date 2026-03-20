import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTaskOrchestrator } from '../src/task-orchestrator/index.ts';
import { renderTaskSummary } from '../src/task-orchestrator/ui-status/render-task-summary.ts';
import { renderTaskTree } from '../src/task-orchestrator/ui-status/render-task-tree.ts';
import { renderNodeDetail } from '../src/task-orchestrator/ui-status/render-node-detail.ts';

const workspaceDir = '/tmp/task-orchestrator-smoke-workspace';
await rm(workspaceDir, { recursive: true, force: true });
await mkdir(join(workspaceDir, 'progress'), { recursive: true });

class FakeAdapter {
  workspaceDir = workspaceDir;
  #runtimeEvidence = new Map();

  async planRoot() {
    return [
      {
        title: '生成 smoke 测试报告',
        goal: '写出一个 markdown 报告并留下可验证证据',
        successCriteria: '报告存在且包含指定章节',
        completionContract: {
          objective: '生成 smoke markdown 报告',
          outcomeType: 'analysis_summary',
          expectedArtifacts: [
            { type: 'file', path: 'progress/smoke-report.md', required: true },
          ],
          acceptanceChecks: [
            { kind: 'file_exists', path: 'progress/smoke-report.md' },
            { kind: 'file_nonempty', path: 'progress/smoke-report.md' },
            {
              kind: 'markdown_sections_present',
              path: 'progress/smoke-report.md',
              sections: ['结论', '建议'],
            },
            { kind: 'tool_call_observed', tool: 'write' },
            { kind: 'artifact_modified', path: 'progress/smoke-report.md' },
            { kind: 'command_exit_success', commandLabel: 'write progress/smoke-report.md' },
          ],
          reviewMode: 'needs_review',
        },
      },
    ];
  }

  async executeNode(input) {
    const outputPath = join(workspaceDir, 'progress', 'smoke-report.md');
    await writeFile(outputPath, '# 结论\n\nSmoke test ok.\n\n## 建议\n\n继续推进。\n');

    this.#runtimeEvidence.set(input.node.id, {
      toolCalls: ['write'],
      modifiedArtifacts: ['progress/smoke-report.md'],
      commandLabels: ['write progress/smoke-report.md'],
    });

    return {
      status: 'done',
      report: 'Smoke task finished.',
      userVisibleSummary: 'Smoke task finished with contract/evidence/runtime evidence.',
      evidence: ['fake adapter finished node'],
      artifacts: ['progress/smoke-report.md'],
    };
  }

  async finalize() {
    return { summary: 'Smoke finalize ok.' };
  }

  async refineNode() {
    throw new Error('refineNode not used in smoke test');
  }

  consumeRuntimeEvidence(nodeId) {
    const snapshot = this.#runtimeEvidence.get(nodeId);
    this.#runtimeEvidence.delete(nodeId);
    return snapshot;
  }
}

const orchestrator = createTaskOrchestrator({
  adapter: new FakeAdapter(),
  previewPlanByDefault: false,
});

const channelContext = {
  channelConversationId: 'smoke:test',
  channelName: 'smoke',
  userId: 'tester',
};

const thread = await orchestrator.startTask('运行 smoke test', channelContext);
const summaryView = await orchestrator.getTaskStatus(thread.threadId, 'summary');
const treeView = await orchestrator.getTaskStatus(thread.threadId, 'tree');
const nodeView = await orchestrator.getTaskStatus(thread.threadId, 'node', '1');

console.log('--- SUMMARY ---');
console.log(renderTaskSummary(summaryView));
console.log('');
console.log('--- TREE ---');
console.log(renderTaskTree(treeView));
console.log('');
console.log('--- NODE DETAIL ---');
console.log(renderNodeDetail(nodeView));
console.log('');

const nodeText = renderNodeDetail(nodeView);
const summaryText = renderTaskSummary(summaryView);
const treeText = renderTaskTree(treeView);

const assertions = [
  ['summary has review section', summaryText.includes('## 复核情况')],
  ['tree has evidence status', treeText.includes('{⚠️ 建议复核}')],
  ['node detail has runtime evidence', nodeText.includes('运行时证据：')],
  ['node detail has tool calls', nodeText.includes('观察到的工具调用：write')],
  ['node detail has modified artifacts', nodeText.includes('观察到的产物修改：progress/smoke-report.md')],
  ['node detail has commands', nodeText.includes('观察到的命令：write progress/smoke-report.md')],
  ['node detail has check details', nodeText.includes('检查明细：')],
  ['node detail has chinese node status', nodeText.includes('状态：已完成')],
  ['node detail has chinese evidence status', nodeText.includes('完成证据：\n- 状态：建议复核')],
  ['node detail has chinese outcome type', nodeText.includes('结果类型：分析总结')],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error('SMOKE TEST FAILED');
  for (const [name] of failed) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log('SMOKE TEST PASSED');
