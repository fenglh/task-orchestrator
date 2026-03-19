import { readFile } from 'node:fs/promises';

const samplePath = '/Users/sanjiao/task-orchestrator/debug/runtime-events-sample.jsonl';
const lines = (await readFile(samplePath, 'utf8')).trim().split('\n').filter(Boolean);
const events = lines.map((line) => JSON.parse(line));

function extractPathFromMeta(meta) {
  const match = meta.match(/(?:from|to)\s+([^()]+?)(?:\s*\(|$)/i);
  return match?.[1]?.trim();
}

function summarizeRuntimeEvidence(events) {
  const toolCalls = new Set();
  const modifiedArtifacts = new Set();
  const commandLabels = new Set();

  for (const event of events) {
    const record = event;
    const data = (record.data ?? event.payload ?? {});
    const stream = typeof record.stream === 'string' ? record.stream : undefined;
    const eventType = typeof event.type === 'string' ? event.type : undefined;

    const toolName = typeof data.name === 'string'
      ? data.name
      : typeof data.tool === 'string'
        ? data.tool
        : typeof data.toolName === 'string'
          ? data.toolName
          : undefined;

    if (stream === 'tool' || eventType === 'tool_execution_start' || eventType === 'tool_execution_end') {
      if (toolName) toolCalls.add(toolName);
      const path = typeof data.path === 'string'
        ? data.path
        : typeof data.file_path === 'string'
          ? data.file_path
          : typeof data.meta === 'string'
            ? extractPathFromMeta(data.meta)
            : undefined;
      if (path) modifiedArtifacts.add(path);
      const command = typeof data.command === 'string'
        ? data.command
        : toolName === 'exec' && typeof data.meta === 'string'
          ? data.meta
          : undefined;
      if (command) commandLabels.add(command);
    }
  }

  return {
    toolCalls: [...toolCalls],
    modifiedArtifacts: [...modifiedArtifacts],
    commandLabels: [...commandLabels],
  };
}

const summary = summarizeRuntimeEvidence(events);
console.log(JSON.stringify(summary, null, 2));
