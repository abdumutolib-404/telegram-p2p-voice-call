// Sequential feedback timings, with isolated backend configuration and no live services.
const fs = require('node:fs'), path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const logDirectory = path.join(root, 'output/launch-20261016');
fs.mkdirSync(logDirectory, { recursive: true });
const steps = [
  ['backend-build', '.', ['scripts/verify.cjs', 'compile']],
  ['mini-build', 'client', [npm, 'run', 'build']],
  ['admin-build', 'admin', [npm, 'run', 'build']],
  ['landing-build', 'landing', [npm, 'run', 'build']],
  ['landing-check', 'landing', [npm, 'run', 'check']],
  ['mini-typecheck', 'client', ['node_modules/typescript/bin/tsc', '-b']],
  ['admin-typecheck', 'admin', ['node_modules/typescript/bin/tsc', '-b']],
  ['backend-typecheck', '.', ['scripts/verify.cjs', 'build']],
  ['mini-lint', 'client', [npm, 'run', 'lint']],
  ['admin-lint', 'admin', [npm, 'run', 'lint']],
  ['mini-tests', 'client', ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2']],
  ['backend-tests', '.', ['scripts/verify.cjs', 'unit', '--maxWorkers=2']],
];
const results = [];
for (const [name, cwd, args] of steps) {
  const started = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: path.join(root, cwd), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, VERIFICATION_LOG: path.join(logDirectory, `${name}-detail.log`) },
  });
  const output = ((result.stdout ?? '') + (result.stderr ?? '')).replace(/gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+/g, '[REDACTED]');
  fs.writeFileSync(path.join(logDirectory, `${name}.log`), output);
  const row = { name, durationMs: Math.round(performance.now() - started), exitCode: result.status, error: result.error?.code ?? null };
  results.push(row); console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(root, '.ecc/benchmarks/2026-10-16-feedback.json'), JSON.stringify({
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), checkedAt: new Date().toISOString(),
  conditions: 'Sequential local runs; installed dependencies and TypeScript incremental caches warm; Vite rebuilds production assets. Two test workers. Not a clean-install or Docker benchmark.',
  unmeasured: ['Clean-install build time', 'HMR latency', 'Docker build (runtime unavailable)', 'Linux race execution (runtime unavailable)'], results,
}, null, 2) + '\n');
if (results.some(row => row.exitCode !== 0)) process.exitCode = 1;
