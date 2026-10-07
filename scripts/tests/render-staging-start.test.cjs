const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { assertStaging, loadMigrations, prepareDatabase } = require('../../server/prisma/render-staging-start.cjs');

const environment = {
  RENDER: 'true', PAIRTALK_RENDER_STAGING: 'true', NODE_ENV: 'production', RELEASE_COMMAND: '1',
  DISABLE_BOT_POLLING: 'true', DISABLE_BACKGROUND_CRAWLER: 'true',
  DATABASE_URL: 'postgresql://pairtalk_render_staging:synthetic@dpg-synthetic-a/pairtalk_render_staging',
  TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
};
const migrations = [{ name: 'reviewed', checksum: 'synthetic-checksum' }];
const completed = [{ migration_name: 'reviewed', checksum: 'synthetic-checksum', finished_at: new Date(), rolled_back_at: null }];

function database(state) {
  const transaction = { async $queryRawUnsafe(sql) {
    if (sql.includes('pg_try_advisory_xact_lock')) return [{ acquired: state.locked !== false }];
    if (sql.includes('to_regclass')) return [{ present: state.history === true }];
    if (sql.includes('FROM pg_class')) return [{ present: state.objects === true }];
    if (sql.includes('FROM public._prisma_migrations')) return state.applied;
    throw new Error('Unexpected query');
  } };
  return { $transaction(callback) { return callback(transaction); } };
}

test('staging bootstrap requires explicit isolation and the private dedicated database', () => {
  assert.doesNotThrow(() => assertStaging(environment));
  for (const key of ['RENDER', 'PAIRTALK_RENDER_STAGING', 'RELEASE_COMMAND', 'NODE_ENV', 'DISABLE_BOT_POLLING', 'DISABLE_BACKGROUND_CRAWLER']) {
    assert.throws(() => assertStaging({ ...environment, [key]: '' }));
  }
  for (const databaseURL of [environment.DATABASE_URL.replace('/pairtalk_render_staging', '/production'),
    environment.DATABASE_URL.replace('dpg-synthetic-a', 'production.example'), environment.DATABASE_URL + '?schema=public']) {
    assert.throws(() => assertStaging({ ...environment, DATABASE_URL: databaseURL }));
  }
});

test('proxy trust stays private and includes the internal gateway', () => {
  for (const trusted of ['', '0.0.0.0/0', '127.0.0.1/32,10.0.0.0/0', '127.0.0.1/32,203.0.113.0/24', '127.0.0.1/32,::/0', '10.0.0.1/32']) {
    assert.throws(() => assertStaging({ ...environment, TRUSTED_PROXY_CIDRS: trusted }));
  }
  assert.doesNotThrow(() => assertStaging({ ...environment, TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128,10.2.3.4/32' }));
});

test('a fresh explicitly approved empty database is initialized and verified', async () => {
  const state = { applied: [] }; let calls = 0;
  assert.equal(await prepareDatabase(database(state), migrations, true, async () => { calls++; state.applied = completed; }), 'initialized');
  assert.equal(calls, 1);
});

test('matching history skips migrations on ordinary restarts', async () => {
  assert.equal(await prepareDatabase(database({ history: true, applied: completed }), migrations, false,
    () => { throw new Error('Migrations must not rerun'); }), 'verified');
});

test('locks, unmanaged data, missing approval, failed history and upgrades fail closed', async () => {
  const rejected = [{ locked: false }, { objects: true }, { history: true, applied: [] },
    { history: true, applied: [{ ...completed[0], finished_at: null }] },
    { history: true, applied: [{ ...completed[0], checksum: 'changed' }] },
    { history: true, applied: [{ ...completed[0], rolled_back_at: new Date() }] },
    { history: true, applied: [...completed, { ...completed[0], migration_name: 'unknown' }] }];
  for (const state of rejected) await assert.rejects(prepareDatabase(database(state), migrations, true,
    () => { throw new Error('Migration attempted on unsafe state'); }));
  await assert.rejects(prepareDatabase(database({}), migrations, false, () => { throw new Error('No approval'); }));
  await assert.rejects(prepareDatabase(database({ applied: [] }), migrations, true, async () => {}));
});

const testURL = process.env.PAIRTALK_RENDER_BOOTSTRAP_TEST_DATABASE_URL;
test('PostgreSQL: initial migration, subsequent verification, upgrade refusal and concurrency lock', { skip: !testURL }, async () => {
  const url = new URL(testURL);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/pairtalk_render_staging_test');
  const { PrismaClient } = require('../../server/node_modules/@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: testURL } }, log: [] });
  const contender = new PrismaClient({ datasources: { db: { url: testURL } }, log: [] });
  const root = path.resolve(__dirname, '../../server');
  const reviewed = loadMigrations(path.join(root, 'prisma/migrations'));
  let migrationsRun = 0;
  try {
    assert.equal(await prepareDatabase(client, reviewed, true, async () => {
      migrationsRun++;
      await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
        cwd: root, env: require('../safe-environment.cjs')({ DATABASE_URL: testURL }), timeout: 180000,
      }).catch(() => { throw new Error('Isolated test migration failed'); });
    }), 'initialized');
    assert.equal(migrationsRun, 1);
    assert.equal(await prepareDatabase(client, reviewed, false, () => { throw new Error('Unexpected migration'); }), 'verified');
    await assert.rejects(prepareDatabase(client, [...reviewed, { name: 'future', checksum: 'unreviewed' }], true,
      () => { throw new Error('Unexpected upgrade'); }), /automatic upgrades/);
    await client.$transaction(async transaction => {
      await transaction.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1::bigint)::text', 724163052);
      await assert.rejects(prepareDatabase(contender, reviewed, true, () => { throw new Error('Concurrent migration'); }), /database lock/);
    });
  } finally { await client.$disconnect(); await contender.$disconnect(); }
});
