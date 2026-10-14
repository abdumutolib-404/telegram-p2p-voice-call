// Real PostgreSQL verification only; no bot, Redis, media or payment provider is started.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
function verifyUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/pairtalk_check') throw new Error('Use the dedicated loopback verification database.');
}
if (process.argv[2] !== '--child') {
  const bindings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  verifyUrl(bindings.DATABASE_URL);
  const probeUrl = new URL(bindings.DATABASE_URL);
  probeUrl.searchParams.set('options', '-c application_name=pairtalk-readiness -c timezone=Asia/Tashkent');
  const env = require('./safe-environment.cjs')({ DATABASE_URL: probeUrl.toString(), NODE_ENV: 'development' });
  const result = spawnSync(process.execPath, [__filename, '--child'], { env, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  let output = (result.stdout || '') + (result.stderr || '');
  for (const key of ['DATABASE_URL', 'BOT_TOKEN', 'MASTER_PASSWORD', 'JWT_SECRET', 'LIVEKIT_API_SECRET']) if (env[key]) output = output.split(env[key]).join('[REDACTED]');
  process.stdout.write(output); process.exitCode = result.status ?? 1;
} else {
  verifyUrl(process.env.DATABASE_URL);
  if (process.env.NODE_ENV !== 'development') throw new Error('Verification must use the real database adapter.');
  const { prisma, connectDB, disconnectDB } = require('../server/dist/config/database');
  (async () => {
    try {
      await connectDB();
      const connections = await Promise.all(Array.from({ length: 8 }, () => prisma.$transaction(async tx => {
        const before = Date.now();
        const rows = await tx.$queryRawUnsafe("SELECT pg_backend_pid() AS pid, current_setting('TimeZone') AS zone, current_setting('application_name') AS app_name, CURRENT_TIMESTAMP::timestamp AS stored_now");
        assert.equal(rows[0].zone, 'UTC');
        assert.equal(rows[0].app_name, 'pairtalk-readiness');
        assert(rows[0].stored_now.getTime() >= before - 1000 && rows[0].stored_now.getTime() <= Date.now() + 1000);
        await tx.$queryRawUnsafe('SELECT 1 FROM pg_sleep(0.05)');
        return rows[0].pid;
      })));
      assert(new Set(connections).size > 1, 'The probe did not exercise multiple pooled connections.');
      console.log(`PASS database-generated UTC timestamps on ${new Set(connections).size} concurrent Prisma connections.`);
    } finally { await disconnectDB(); }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
