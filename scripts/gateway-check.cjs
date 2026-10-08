// Run gateway verification without loading developer/production credentials.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bindings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:55432\/pairtalk_check$/.test(bindings.DATABASE_URL) || bindings.REDIS_URL !== 'redis://127.0.0.1:56379') {
  throw new Error('Gateway verification requires the dedicated loopback services.');
}
const env = require('./safe-environment.cjs')({ PAIRTALK_GATEWAY_TEST_DATABASE_URL: bindings.DATABASE_URL, PAIRTALK_GATEWAY_TEST_REDIS_URL: bindings.REDIS_URL });
const result = spawnSync('go', process.argv.slice(3).length ? process.argv.slice(3) : ['test', './...', '-count=1'], {
  cwd: path.resolve(__dirname, '../gateway'), env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
let output = (result.stdout || '') + (result.stderr || '');
for (const value of [bindings.DATABASE_URL, env.JWT_SECRET, env.MASTER_PASSWORD, env.LIVEKIT_API_SECRET]) {
  if (value) output = output.split(value).join('[REDACTED]');
}
if (result.error) output += 'Unable to run Go verification: ' + result.error.code + '\n';
process.stdout.write(output);
process.exitCode = result.status ?? 1;
