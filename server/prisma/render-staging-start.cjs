// The existing Dockerfile copies server/prisma into the runtime image.
// This opt-in Render wrapper never runs during ordinary VM/Fly startup.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const ipaddr = require('ipaddr.js');

const stagingDatabase = 'pairtalk_render_staging';
const lockKey = 724163052;

function assertStaging(environment) {
  if (environment.RENDER !== 'true' || environment.PAIRTALK_RENDER_STAGING !== 'true' ||
      environment.NODE_ENV !== 'production' || environment.RELEASE_COMMAND !== '1' ||
      environment.DISABLE_BOT_POLLING !== 'true' || environment.DISABLE_BACKGROUND_CRAWLER !== 'true') {
    throw new Error('Render staging requires explicit opt-in and disabled polling/crawler.');
  }
  let database;
  try { database = new URL(environment.DATABASE_URL); } catch { throw new Error('Invalid staging database binding.'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      database.pathname !== '/' + stagingDatabase || decodeURIComponent(database.username) !== stagingDatabase ||
      !/^dpg-[a-z0-9-]+$/.test(database.hostname) || database.searchParams.has('schema')) {
    throw new Error('Use the Blueprint private staging database binding without Prisma-only URL parameters.');
  }
  const trusted = (environment.TRUSTED_PROXY_CIDRS || '').split(',').map(value => value.trim()).filter(Boolean);
  const allowed = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1/128', 'fc00::/7'].map(value => ipaddr.parseCIDR(value));
  let loopback = false;
  for (const value of trusted) {
    let network;
    try { network = ipaddr.parseCIDR(value); } catch { throw new Error('Trusted proxies must be explicit private CIDRs.'); }
    if (!allowed.some(([address, bits]) => network[0].kind() === address.kind() && network[1] >= bits && network[0].match(address, bits))) {
      throw new Error('Public or unrestricted proxy trust is prohibited in Render staging.');
    }
    if (network[0].kind() === 'ipv4' && ipaddr.parse('127.0.0.1').match(network)) loopback = true;
  }
  if (!loopback) throw new Error('Trusted proxies must include the internal gateway loopback hop.');
}

function loadMigrations(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => ({
    name: entry.name,
    checksum: crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, entry.name, 'migration.sql'))).digest('hex'),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

async function prepareDatabase(client, migrations, initialize, migrate) {
  if (migrations.length === 0) throw new Error('No reviewed migrations are present.');
  return client.$transaction(async transaction => {
    const [locked] = await transaction.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired', lockKey);
    if (!locked.acquired) throw new Error('Another staging bootstrap holds the database lock.');
    const [history] = await transaction.$queryRawUnsafe("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present");
    if (history.present) {
      const applied = await transaction.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations');
      if (applied.length !== migrations.length || migrations.some(migration => !applied.some(row =>
        row.migration_name === migration.name && row.checksum === migration.checksum && row.finished_at && !row.rolled_back_at))) {
        throw new Error('Staging migration history differs or is incomplete; automatic upgrades are prohibited.');
      }
      return 'verified';
    }
    const [objects] = await transaction.$queryRawUnsafe(`SELECT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ) AS present`);
    if (!initialize || objects.present) throw new Error('Initial migration requires explicit approval and an empty staging database.');
    await migrate();
    const applied = await transaction.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations');
    if (applied.length !== migrations.length || migrations.some(migration => !applied.some(row =>
      row.migration_name === migration.name && row.checksum === migration.checksum && row.finished_at && !row.rolled_back_at))) {
      throw new Error('Initial staging migration verification failed.');
    }
    return 'initialized';
  }, { timeout: 240000, maxWait: 5000 });
}

async function main() {
  assertStaging(process.env);
  const root = path.resolve(__dirname, '..');
  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({ log: [] });
  let activeChild;
  let stopped = false;
  const stop = signal => { stopped = true; activeChild?.kill(signal); };
  const terminate = () => stop('SIGTERM');
  const interrupt = () => stop('SIGINT');
  process.on('SIGTERM', terminate);
  process.on('SIGINT', interrupt);
  const run = (command, args, environment, stdio) => new Promise((resolve, reject) => {
    if (stopped) return reject(new Error('Staging startup interrupted.'));
    activeChild = spawn(command, args, { cwd: root, env: environment, stdio });
    activeChild.once('error', () => { activeChild = undefined; reject(new Error('Staging child process could not start.')); });
    activeChild.once('exit', code => { activeChild = undefined; code === 0 ? resolve() : reject(new Error('Staging child process failed.')); });
  });
  try {
    const result = await prepareDatabase(client, loadMigrations(path.join(root, 'prisma/migrations')),
      process.env.PAIRTALK_RENDER_INITIALIZE_EMPTY_DATABASE === 'true',
      () => run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], process.env, 'ignore'));
    await client.$disconnect();
    console.log('[Render staging] Migration history ' + result + '; starting backend.');
    await run('/bin/sh', ['./docker-entrypoint.sh'], { ...process.env, RELEASE_COMMAND: '0', HOST: '127.0.0.1' }, 'inherit');
  } finally {
    await client.$disconnect();
    process.removeListener('SIGTERM', terminate);
    process.removeListener('SIGINT', interrupt);
  }
}

module.exports = { assertStaging, loadMigrations, prepareDatabase };
if (require.main === module) main().catch(() => {
  // Provider bindings and Prisma errors may contain credentials. Do not log them.
  console.error('[Render staging] Startup refused or failed. Check private bindings, bootstrap approval, and migration history.');
  process.exitCode = 1;
});
