import { spawn } from 'node:child_process';

const scripts = [
  'smoke-task-orchestrator.mjs',
  'smoke-dynamic-orchestration.mjs',
  'smoke-blocked-resume-orchestration.mjs',
  'smoke-expand-modes.mjs',
  'smoke-retry-skip-orchestration.mjs',
  'smoke-retry-twice-orchestration.mjs',
];

function runScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL(`./${script}`, import.meta.url).pathname], {
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${script} failed with exit code ${code}`));
    });

    child.on('error', reject);
  });
}

for (const script of scripts) {
  console.log(`\n=== RUN ${script} ===\n`);
  await runScript(script);
}

console.log('\nALL SMOKE TESTS PASSED');
