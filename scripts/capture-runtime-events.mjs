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
  'You are running a runtime event probe.',
  'Use the available tools in this exact order if possible:',
  '1. Read AGENTS.md from the workspace root.',
  `2. Write a short markdown file to ${probeOutput}.`,
  'Keep the written content very short.',
  'Return a one-line plain-text confirmation at the end.',
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

const toolEvents = events.filter((event) => event.type === 'tool_execution_start' || event.type === 'tool_execution_end');
console.log('RESULT_TEXT_START');
console.log(result.text ?? '');
console.log('RESULT_TEXT_END');
console.log(`EVENT_FILE=${outputPath}`);
console.log(`TOTAL_EVENTS=${events.length}`);
console.log(`TOOL_EVENTS=${toolEvents.length}`);
for (const [index, event] of toolEvents.slice(0, 10).entries()) {
  console.log(`TOOL_EVENT_${index + 1}=${JSON.stringify(event)}`);
}
