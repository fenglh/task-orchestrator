import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { runEmbeddedPiAgent } from '/opt/homebrew/lib/node_modules/openclaw/dist/extensionAPI.js';

const workspaceDir = '/Users/sanjiao/.openclaw/workspace';
const outputPath = '/Users/sanjiao/task-orchestrator/debug/runtime-events-sample.jsonl';
const sessionDir = '/Users/sanjiao/task-orchestrator/.tmp/pi-sessions';
const sessionId = `runtime-event-probe-${Date.now()}`;
const sessionFile = join(sessionDir, `${sessionId}.jsonl`);
const runId = `runtime-event-probe-${randomUUID()}`;
const probeOutput = 'debug/runtime-event-probe-output.md';
const configPath = '/Users/sanjiao/.openclaw/openclaw.json';

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(sessionDir, { recursive: true });
await writeFile(outputPath, '', 'utf8');

const config = JSON.parse(await readFile(configPath, 'utf8'));
const events = [];

const prompt = [
  'Runtime event probe.',
  `Write a very short markdown file to ${probeOutput}.`,
  'Then use exec to run exactly: pwd',
  'Then reply with exactly: probe done',
].join('\n');

const result = await runEmbeddedPiAgent({
  sessionId,
  sessionKey: sessionId,
  sessionFile,
  workspaceDir,
  config,
  provider: 'openai-codex',
  model: 'gpt-5.4',
  timeoutMs: 120000,
  runId,
  prompt,
  onAgentEvent: async (event) => {
    events.push(event);
    await appendFile(outputPath, `${JSON.stringify(event)}\n`, 'utf8');
  },
  onPartialReply: async (text) => {
    await appendFile(outputPath, `${JSON.stringify({ type: 'partial_reply', payload: { text } })}\n`, 'utf8');
  },
  onBlockReply: async (payload) => {
    await appendFile(outputPath, `${JSON.stringify({ type: 'block_reply', payload })}\n`, 'utf8');
  },
});

const toolLikeEvents = events.filter((event) => {
  const record = event;
  return record?.type === 'tool_execution_start' || record?.type === 'tool_execution_end' || record?.stream === 'tool';
});
console.log('RESULT_TEXT_START');
console.log(result.text ?? '');
console.log('RESULT_TEXT_END');
console.log(`EVENT_FILE=${outputPath}`);
console.log(`TOTAL_EVENTS=${events.length}`);
console.log(`TOOL_EVENTS=${toolLikeEvents.length}`);
for (const [index, event] of toolLikeEvents.slice(0, 12).entries()) {
  console.log(`TOOL_EVENT_${index + 1}=${JSON.stringify(event)}`);
}
