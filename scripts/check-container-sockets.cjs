// Executed through stdin inside the isolated image; never accepts production credentials.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { io } = require('socket.io-client');
const database = new URL(process.env.DATABASE_URL);
if (process.env.NODE_ENV !== 'production' || process.env.BOT_TOKEN !== '123456789:synthetic-container-verification-token' || !/^pairtalk-check-pg-[a-f0-9]{8}$/.test(database.hostname) || database.pathname !== '/pairtalk_check') throw new Error('Only the isolated production fixture is permitted.');
const prisma = new PrismaClient();
const sockets = [];
const calls = [];
const partners = [];
let user;
async function main() {
  const telegramId = BigInt('0x' + crypto.randomBytes(6).toString('hex'));
  user = await prisma.user.create({ data: { telegramId, alias: 'container-wire-' + crypto.randomUUID(), plan: 'FREE', band: 7 } });
  const data = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(telegramId), first_name: 'Synthetic socket fixture' }) };
  const checkString = Object.keys(data).sort().map(key => key + '=' + data[key]).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const initData = new URLSearchParams({ ...data, hash: crypto.createHmac('sha256', secret).update(checkString).digest('hex') }).toString();
  for (const transport of ['websocket', 'polling']) {
    const socket = io('http://127.0.0.1:3001', { transports: [transport], auth: { token: initData }, reconnection: false, timeout: 8000 });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Gateway handshake did not finish: ' + transport)), 10000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      socket.once('connect_error', () => { clearTimeout(timeout); reject(new Error('Gateway rejected a signed synthetic handshake: ' + transport)); });
    });
    assert(socket.connected);
    const partner = await prisma.user.create({ data: {
      telegramId: BigInt('0x' + crypto.randomBytes(6).toString('hex')),
      alias: 'container-partner-' + crypto.randomUUID(), plan: 'FREE',
    } });
    partners.push(partner.id);
    const call = await prisma.callSession.create({ data: {
      roomName: 'container-room-' + crypto.randomUUID(), userAId: user.id, userBId: partner.id,
      createdAt: new Date(Date.now() - 35000),
    } });
    calls.push(call.id);
    const denied = transport === 'polling';
    socket.emit('finish_call', { roomName: call.roomName, reason: denied ? 'microphone_permission_denied' : 'normal_completion' });
    const deadline = Date.now() + 10000;
    let completed;
    do {
      completed = await prisma.callSession.findUnique({ where: { id: call.id } });
      if (completed?.status === 'COMPLETED') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    assert.equal(completed?.status, 'COMPLETED', 'Authenticated finish must persist through the Go gateway');
    const work = await prisma.postCallJob.findUnique({ where: { callId: call.id } });
    assert(work, 'Gateway completion must save durable work without requiring a subscriber');
    assert.equal(work.status, 'QUEUED');
    if (denied) { assert.equal(work.reason, 'microphone_permission_denied'); assert.equal(work.deniedUserId, user.id); }
    assert.equal((await prisma.user.findUnique({ where: { id: partner.id } })).dailyCallsUsed, denied ? 0 : 1);
    socket.disconnect();
    console.log('PASS production gateway authenticates a signed Telegram launch through ' + transport);
    console.log('PASS production gateway commits call completion and durable effects through ' + transport);
  }
}
main().catch(error => { console.error('Container socket check failed:', error.message); process.exitCode = 1; }).finally(async () => {
  for (const socket of sockets) socket.disconnect();
  await prisma.callSession.deleteMany({ where: { id: { in: calls } } });
  await prisma.user.deleteMany({ where: { id: { in: partners } } });
  if (user) await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});
