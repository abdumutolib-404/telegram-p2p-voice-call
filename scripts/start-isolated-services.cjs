// Dedicated local verification services. Never uses the project's .env or production volumes.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pairtalk-isolated-'));
const password = crypto.randomBytes(24).toString('hex');
const suffix = crypto.randomBytes(4).toString('hex');
const names = { postgres: `pairtalk-check-pg-${suffix}`, redis: `pairtalk-check-redis-${suffix}` };
const execute = args => execFileSync('docker', args, { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
try {
  execute(['run', '-d', '--name', names.postgres, '-p', '127.0.0.1:55432:5432', '-e', 'POSTGRES_USER=pairtalk_check', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=pairtalk_check', 'postgres:16-alpine']);
  execute(['run', '-d', '--name', names.redis, '-p', '127.0.0.1:56379:6379', 'redis:7-alpine', 'redis-server', '--save', '', '--appendonly', 'no']);
  fs.writeFileSync(path.join(directory, 'runtime.json'), JSON.stringify({ names, DATABASE_URL: `postgresql://pairtalk_check:${password}@127.0.0.1:55432/pairtalk_check`, REDIS_URL: 'redis://127.0.0.1:56379', JWT_SECRET: crypto.randomBytes(32).toString('hex'), MASTER_PASSWORD: crypto.randomBytes(24).toString('hex') }), { mode: 0o600 });
  console.log(`Isolated runtime bindings saved outside the repository: ${directory}`);
  console.log(`Containers: ${names.postgres}, ${names.redis}; loopback ports 55432 and 56379.`);
} catch (error) {
  console.error('Isolated service startup failed:', String(error.stderr || error.message).replaceAll(password, '[REDACTED]'));
  process.exitCode = 1;
}
