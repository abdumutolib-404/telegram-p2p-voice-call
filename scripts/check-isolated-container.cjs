const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const file = path.resolve(process.argv[2] || '');
const relative = path.relative(path.resolve(__dirname, '..'), file);
if (!path.isAbsolute(process.argv[2] || '') || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) throw new Error('Use the private verification metadata outside the checkout.');
const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!/^pairtalk-audit-runtime-[a-f0-9]{8}$/.test(meta.container)) throw new Error('Unexpected verification container.');
const inspect = spawnSync('docker', ['inspect', '--format', '{{index .Config.Labels "pairtalk.verification"}}', meta.container], { encoding: 'utf8' });
if (inspect.status !== 0 || inspect.stdout.trim() !== 'whole-audit') throw new Error('Container is not owned by this verification workflow.');
const readinessDeadline = Date.now() + 15000;
let ready = false;
while (Date.now() < readinessDeadline) {
  const probe = spawnSync('docker', ['exec', meta.container, 'node', '-e', "fetch('http://127.0.0.1:3001/healthz',{signal:AbortSignal.timeout(2500),redirect:'manual'}).then(response=>{if(response.status!==200)process.exitCode=1}).catch(()=>{process.exitCode=1})"], { encoding: 'utf8', timeout: 4000 });
  if (probe.status === 0) { ready = true; break; }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
}
if (!ready) throw new Error('Owned production verification container did not become ready within fifteen seconds.');
for (const script of ['check-backend.cjs', 'check-container-sockets.cjs', 'check-container-boundaries.cjs']) {
  const result = spawnSync('docker', ['exec', '-i', meta.container, 'node', '-', '--container-bindings'], {
    input: fs.readFileSync(path.join(__dirname, script), 'utf8'), encoding: 'utf8', timeout: 60000,
  });
  process.stdout.write((result.stdout || '') + (result.stderr || ''));
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
