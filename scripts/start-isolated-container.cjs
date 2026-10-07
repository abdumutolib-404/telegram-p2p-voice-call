// Runs only a locally built image against the dedicated, synthetic verification services.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runtimePath = path.resolve(process.argv[2] || '');
const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const root = path.resolve(__dirname, '..');
const relative = path.relative(root, runtimePath);
if (!path.isAbsolute(process.argv[2] || '') || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) throw new Error('Private bindings must stay outside the checkout.');
const database = new URL(runtime.DATABASE_URL);
if (database.hostname !== '127.0.0.1' || database.port !== '55432' || database.pathname !== '/pairtalk_check' || database.username !== 'pairtalk_check' || runtime.REDIS_URL !== 'redis://127.0.0.1:56379') throw new Error('Only dedicated verification services are permitted.');
const [postgres, redis] = process.argv.slice(3);
if (!/^pairtalk-check-pg-[a-f0-9]{8}$/.test(postgres || '') || !/^pairtalk-check-redis-[a-f0-9]{8}$/.test(redis || '')) throw new Error('Specify the owned verification container names.');

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Docker verification operation failed: ' + args[0]);
  return result.stdout.trim();
}
for (const [name, port, hostPort] of [[postgres, '5432/tcp', '55432'], [redis, '6379/tcp', '56379']]) {
  const ports = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', name]));
  if (!ports[port]?.some(binding => binding.HostIp === '127.0.0.1' && binding.HostPort === hostPort)) throw new Error('Container is not the dedicated loopback fixture.');
  if (docker(['inspect', '--format', '{{.State.Running}}', name]) !== 'true') throw new Error('Verification service is not running.');
}
const image = 'pairtalk-whole-audit:local';
const metadataFile = path.join(path.dirname(runtimePath), 'container-verification.json');
if (fs.existsSync(metadataFile)) throw new Error('Clean up the existing owned verification container before starting another.');
docker(['image', 'inspect', '--format', '{{.Id}}', image]);
const suffix = require('node:crypto').randomBytes(4).toString('hex');
const network = 'pairtalk-audit-net-' + suffix;
const container = 'pairtalk-audit-runtime-' + suffix;
docker(['network', 'create', '--internal', '--label', 'pairtalk.verification=whole-audit', network]);
try {
  for (const name of [postgres, redis]) docker(['network', 'connect', network, name]);
  database.hostname = postgres; database.port = '5432';
  const environment = require('./safe-environment.cjs')({
    ...runtime, DATABASE_URL: database.toString(), REDIS_URL: 'redis://' + redis + ':6379',
    NODE_ENV: 'production', PORT: '3001', HOST: '127.0.0.1',
    BOT_TOKEN: ['123456789', 'synthetic'.repeat(5)].join(':'),
    ALLOWED_ORIGINS: 'http://127.0.0.1:4184', MINI_APP_URL: 'http://127.0.0.1:4184', ADMIN_PANEL_URL: 'http://127.0.0.1:4184',
  });
  const allowed = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'MASTER_PASSWORD', 'NODE_ENV', 'PORT', 'HOST', 'BOT_TOKEN', 'ALLOWED_ORIGINS', 'MINI_APP_URL', 'ADMIN_PANEL_URL', 'ADMIN_TELEGRAM_IDS', 'LIVEKIT_HOST', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'DISABLE_BOT_POLLING', 'DISABLE_BACKGROUND_CRAWLER'];
  const file = path.join(path.dirname(runtimePath), 'container-' + suffix + '.env');
  fs.writeFileSync(file, allowed.map(key => {
    if (typeof environment[key] !== 'string' || /[\r\n]/.test(environment[key])) throw new Error('Invalid private verification binding.');
    return key + '=' + environment[key];
  }).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  try {
    docker(['run', '-d', '--name', container, '--label', 'pairtalk.verification=whole-audit', '--network', network,
      '--read-only', '--tmpfs', '/tmp', '--tmpfs', '/app/server/recordings', '--env-file', file, image]);
  } finally { fs.unlinkSync(file); }
  fs.writeFileSync(metadataFile, JSON.stringify({ container, network, postgres, redis }), { mode: 0o600, flag: 'wx' });
  console.log('Isolated production container started with external network access disabled; verify through Docker.');
} catch (error) {
  // These names were created by this invocation; never remove unrelated services.
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  for (const name of [postgres, redis]) spawnSync('docker', ['network', 'disconnect', network, name], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
  throw error;
}
