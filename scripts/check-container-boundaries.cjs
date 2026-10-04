// Synthetic identities and signed webhook events against the isolated production image only.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
if (process.env.NODE_ENV !== 'production' || process.env.BOT_TOKEN !== '123456789:synthetic-container-verification-token') throw new Error('Use the isolated production verification container.');
const prisma = new PrismaClient();
const suffix = crypto.randomUUID();
const users = [];
let call;
let webhookRequest;
async function post(path, body, authorization = {}) {
  return fetch('http://127.0.0.1:3001' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', ...authorization },
    body, signal: AbortSignal.timeout(12000), redirect: 'manual',
  });
}
function initData(user) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(user.telegramId) }) });
  params.sort();
  const key = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', key).update(Array.from(params, ([name, value]) => `${name}=${value}`).join('\n')).digest('hex'));
  return params.toString();
}
function webhookToken(body) {
  return jwt.sign({ sha256: crypto.createHash('sha256').update(body).digest('base64') }, process.env.LIVEKIT_API_SECRET, { issuer: process.env.LIVEKIT_API_KEY, expiresIn: '1m' });
}
async function main() {
  for (const [index, permanent] of [false, true].entries()) {
    const user = await prisma.user.create({ data: { telegramId: BigInt(Date.now() + index), alias: `boundary-${suffix}-${index}`, isBanned: true, isPermanentlyBanned: permanent, bannedUntil: null } });
    users.push(user);
    const response = await post('/api/auth/verify', '{}', { 'X-Telegram-Init-Data': initData(user) });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.status, permanent ? 'banned' : 'suspended');
    assert.equal(body.user.id, user.id);
    console.log(`PASS signed Telegram authentication rejects ${permanent ? 'permanent' : 'indefinite'} suspension`);
  }
  call = await prisma.callSession.create({ data: { roomName: 'boundary-' + suffix, userAId: users[0].id, userBId: users[1].id, status: 'ACTIVE' } });
  const body = JSON.stringify({ event: 'egress_started', egressInfo: { egressId: 'EG_' + suffix, roomName: call.roomName, status: 'EGRESS_ACTIVE' } });
  const token = webhookToken(body);
  const badSignature = await post('/api/livekit/webhook', body + ' ', { Authorization: token });
  assert.equal(badSignature.status, 401);
  assert.equal((await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } })).egressId, null);
  console.log('PASS webhook body tampering fails checksum validation without changing the call');
  assert.equal((await post('/api/livekit/webhook', body, { Authorization: token })).status, 200);
  assert.equal((await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } })).egressId, null);
  console.log('PASS early signed recording callback leaves the signaling ownership claim intact');
  await prisma.callSession.update({ where: { id: call.id }, data: { egressId: 'EG_' + suffix, recordingUrl: 'recordings/winner-' + suffix + '.mp3' } });

  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT id FROM "CallSession" WHERE id=$1 FOR UPDATE', call.id);
    const [{ pid }] = await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid');
    webhookRequest = post('/api/livekit/webhook', body, { Authorization: token });
    void webhookRequest.catch(() => {}); // The response is awaited after releasing the deliberate row barrier.
    // Observe the webhook's UPDATE blocked by this exact transaction after reading ACTIVE.
    let blocked = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const [{ waiting }] = await prisma.$queryRawUnsafe('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))) AS waiting', pid);
      if (waiting) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert(blocked, 'Webhook did not reach the held call row.');
    await tx.callSession.update({ where: { id: call.id }, data: { status: 'COMPLETED', duration: 35, endedAt: new Date() } });
  }, { timeout: 10000 });
  assert.equal((await webhookRequest).status, 200);
  const saved = await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } });
  assert.equal(saved.status, 'COMPLETED'); assert.equal(saved.duration, 35); assert.equal(saved.egressId, 'EG_' + suffix);
  console.log('PASS signed recording-start webhook preserves a concurrently completed PostgreSQL call');
  const loserBody = JSON.stringify({ event: 'egress_ended', egressInfo: { egressId: 'EG_LOSER_' + suffix, roomName: call.roomName, status: 'EGRESS_FAILED' } });
  assert.equal((await post('/api/livekit/webhook', loserBody, { Authorization: webhookToken(loserBody) })).status, 200);
  assert.equal((await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } })).recordingUrl, 'recordings/winner-' + suffix + '.mp3');
  console.log('PASS signed failure callback from a losing egress preserves the winning recording');
}
main().catch(error => { console.error('Boundary verification failed:', error.message); process.exitCode = 1; }).finally(async () => {
  try {
    await webhookRequest?.catch(() => {});
    if (call) await prisma.callSession.deleteMany({ where: { id: call.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  } finally { await prisma.$disconnect(); }
});
