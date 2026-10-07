const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const scripts = path.resolve(__dirname, '..');
const fixtureToken = ['123456789', 'synthetic'.repeat(5)].join(':');
const databaseURL = 'postgresql://pairtalk_check:synthetic@pairtalk-check-pg-abcdef12:5432/pairtalk_check';

function checkGuard(file, token, extra = {}) {
  // Execute the real guard and setup without invoking its network/database test body.
  const source = fs.readFileSync(path.join(scripts, file), 'utf8').split('main().catch')[0];
  return vm.runInNewContext(source, {
    __dirname: scripts, URL, AbortSignal, console,
    process: { argv: ['node', '-', '--container-bindings'], env: {
      NODE_ENV: 'production', BOT_TOKEN: token, DATABASE_URL: databaseURL, ...extra,
    } },
    require(name) {
      if (name === '@prisma/client') return { PrismaClient: class {} };
      if (name === 'socket.io-client') return { io() { throw new Error('Unexpected socket'); } };
      if (name === 'jsonwebtoken' || name.endsWith('server/node_modules/jsonwebtoken')) return {};
      if (name === 'node:fs') return { readFileSync() { throw new Error('Rejected container bindings'); } };
      return require(name);
    },
    fetch() { throw new Error('Unexpected request'); },
  });
}

for (const file of ['check-backend.cjs', 'check-container-boundaries.cjs', 'check-container-frontends.cjs', 'check-container-sockets.cjs']) {
  test(`${file} accepts the generated fixture and rejects other tokens`, () => {
    assert.doesNotThrow(() => checkGuard(file, fixtureToken));
    for (const token of [undefined, '', 'mock_bot_token', fixtureToken + 'extra', '987654321:' + 'x'.repeat(40)]) {
      assert.throws(() => checkGuard(file, token));
    }
    if (file !== 'check-backend.cjs') assert.throws(() => checkGuard(file, fixtureToken, { NODE_ENV: 'development' }));
  });
}

test('socket guard still rejects a non-fixture database', () => {
  assert.throws(() => checkGuard('check-container-sockets.cjs', fixtureToken, {
    DATABASE_URL: 'postgresql://synthetic:synthetic@production.example:5432/pairtalk_check',
  }));
});

test('container startup supplies the generated fixture and keeps its network isolated', () => {
  const runtimePath = path.resolve(scripts, '../../pairtalk-fixture-private/runtime.json');
  const writes = new Map();
  const deleted = [];
  const commands = [];
  const runtime = {
    DATABASE_URL: 'postgresql://pairtalk_check:synthetic@127.0.0.1:55432/pairtalk_check',
    REDIS_URL: 'redis://127.0.0.1:56379',
  };
  vm.runInNewContext(fs.readFileSync(path.join(scripts, 'start-isolated-container.cjs'), 'utf8'), {
    __dirname: scripts, URL, console: { log() {} },
    process: { argv: ['node', 'starter', runtimePath, 'pairtalk-check-pg-abcdef12', 'pairtalk-check-redis-abcdef12'] },
    require(name) {
      if (name === 'node:fs') return {
        readFileSync(file) { assert.equal(file, runtimePath); return JSON.stringify(runtime); },
        existsSync() { return false; },
        writeFileSync(file, data) { writes.set(file, data); },
        unlinkSync(file) { deleted.push(file); },
      };
      if (name === './safe-environment.cjs') return bindings => ({
        JWT_SECRET: 'synthetic', MASTER_PASSWORD: 'synthetic', ADMIN_TELEGRAM_IDS: '12345678',
        LIVEKIT_HOST: 'ws://127.0.0.1:59999', LIVEKIT_API_KEY: 'synthetic', LIVEKIT_API_SECRET: 'synthetic',
        DISABLE_BOT_POLLING: 'true', DISABLE_BACKGROUND_CRAWLER: 'true', ...bindings,
      });
      if (name === 'node:child_process') return {
        spawnSync(command, args) {
          assert.equal(command, 'docker'); commands.push(args);
          let stdout = 'synthetic-id';
          if (args[0] === 'inspect' && args[2].includes('NetworkSettings.Ports')) {
            const postgres = args[3].includes('-pg-');
            stdout = JSON.stringify({ [postgres ? '5432/tcp' : '6379/tcp']: [{ HostIp: '127.0.0.1', HostPort: postgres ? '55432' : '56379' }] });
          }
          if (args[0] === 'inspect' && args[2] === '{{.State.Running}}') stdout = 'true';
          return { status: 0, stdout };
        },
      };
      return require(name);
    },
  });
  const [envFile, environment] = [...writes].find(([file]) => file.endsWith('.env'));
  assert.ok(environment.includes('BOT_TOKEN=' + fixtureToken + '\n'));
  assert.ok(environment.includes('DISABLE_BOT_POLLING=true\n'));
  assert.ok(environment.includes('DISABLE_BACKGROUND_CRAWLER=true\n'));
  assert.ok(deleted.includes(envFile));
  assert.ok(commands.some(args => args[0] === 'network' && args[1] === 'create' && args.includes('--internal')));
  const launch = commands.find(args => args[0] === 'run');
  assert.ok(launch.includes('--read-only') && !launch.includes('-p') && !launch.includes('--publish'));
});
