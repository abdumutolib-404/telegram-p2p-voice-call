const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const file = path.resolve(process.argv[2] || '');
const relative = path.relative(path.resolve(__dirname, '..'), file);
if (!path.isAbsolute(process.argv[2] || '') || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) throw new Error('Use private verification metadata outside the checkout.');
const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!/^pairtalk-audit-runtime-[a-f0-9]{8}$/.test(meta.container) || !/^pairtalk-audit-net-[a-f0-9]{8}$/.test(meta.network) || !/^pairtalk-check-redis-[a-f0-9]{8}$/.test(meta.redis) || !/^pairtalk-check-pg-[a-f0-9]{8}$/.test(meta.postgres)) throw new Error('Unexpected verification resources.');
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error('Container verification operation failed: ' + args[0]);
  return result.stdout.trim();
}
assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "pairtalk.verification"}}', meta.container]), 'whole-audit');
assert.equal(docker(['network', 'inspect', '--format', '{{index .Labels "pairtalk.verification"}}', meta.network]), 'whole-audit');
const probe = () => JSON.parse(docker(['exec', '-i', meta.container, 'node', '-'],
  "fetch('http://127.0.0.1:3001/healthz',{signal:AbortSignal.timeout(4000),redirect:'manual'}).then(async response=>console.log(JSON.stringify({code:response.status,body:await response.json()}))).catch(()=>{process.exitCode=1})"));
async function main() {
  assert.equal(probe().code, 200);
  try {
    docker(['network', 'disconnect', meta.network, meta.redis]);
    const degraded = probe();
    assert.equal(degraded.code, 503);
    assert.equal(degraded.body.status, 'degraded');
    assert.deepEqual(Object.keys(degraded.body).sort(), ['service', 'status', 'timestamp']);
    console.log('PASS gateway readiness reports 503 without exposing dependency details during an isolated Redis interruption');
  } finally {
    docker(['network', 'connect', meta.network, meta.redis]);
  }
  let restored = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (probe().code === 200) { restored = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(restored, 'Readiness did not recover after the fixture connection was restored.');
  console.log('PASS gateway readiness recovers after Redis connectivity is restored');
  if (process.argv[3] === '--cleanup') {
    docker(['stop', '--time', '10', meta.container]);
    assert.equal(docker(['inspect', '--format', '{{.State.ExitCode}}', meta.container]), '0', 'Container did not exit gracefully.');
    console.log('PASS production entrypoint drains both services and exits cleanly on SIGTERM');
    docker(['rm', meta.container]);
    for (const name of [meta.postgres, meta.redis]) docker(['network', 'disconnect', meta.network, name]);
    docker(['network', 'rm', meta.network]);
    fs.unlinkSync(file);
    console.log('Disposable runtime and network removed; PostgreSQL/Redis fixtures remain running.');
  }
}
main().catch(error => { console.error('Container lifecycle check failed:', error.message); process.exitCode = 1; });
