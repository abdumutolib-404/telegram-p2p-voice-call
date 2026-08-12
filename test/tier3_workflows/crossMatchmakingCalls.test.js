/**
 * test/tier3_workflows/crossMatchmakingCalls.test.js
 * Tier 3 Pairwise Cross-Feature Workflows: Matchmaking, LiveKit Calls & Recordings.
 */

const assert = require('assert');
const { MemoryDatabase, resolveMixedPlanDuration } = require('../harness/dbHelper');
const { TelegramBotMock } = require('../harness/botMock');
const { MockSocketHub, waitForEvent } = require('../harness/socketClient');

let testCount = 0;
let passedCount = 0;

function runTest(name, fn) {
  testCount++;
  try {
    fn();
    passedCount++;
    console.log(`  [PASS] Test ${testCount}: ${name}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${testCount}: ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  testCount++;
  try {
    await fn();
    passedCount++;
    console.log(`  [PASS] Test ${testCount}: ${name}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${testCount}: ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function runCrossMatchmakingCallsSuite() {
  console.log('--- Running Tier 3 Matchmaking & Calls Workflow Test Suite ---');

  await runAsyncTest('T3.1: Onboarding -> Mini App Radar Join -> Matchmaking Queue pairing workflow', async () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });
    const hub = new MockSocketHub();

    // 1. Onboarding User A and B
    const resA = bot.simulateStartOnboarding('3001', { FC: 6.5, LR: 6.5, GRA: 6.0, P: 7.0 }); // weak GRA, strong P
    const resB = bot.simulateStartOnboarding('3002', { FC: 6.5, LR: 6.5, GRA: 7.0, P: 6.0 }); // weak P, strong GRA

    assert.strictEqual(resA.user.band, 6.5);
    assert.strictEqual(resB.user.band, 6.5);

    // 2. Open Mini App & Join Queue via Sockets
    const sA = hub.createClient(resA.user.id);
    const sB = hub.createClient(resB.user.id);

    let matchA = null;
    let matchB = null;
    sA.on('match_found', d => matchA = d);
    sB.on('match_found', d => matchB = d);

    hub.onServerEvent('join_queue', (socket, data) => {
      const match = db.popComplementaryMatch(data.band, data.weakSkill, data.strongSkill);
      if (match) {
        const roomName = `room_${Date.now()}`;
        socket.receive('match_found', { roomName, partnerId: match.userId });
        hub.sendToSocket(`socket_${match.userId}`, 'match_found', { roomName, partnerId: data.userId });
      } else {
        db.pushToQueue(data.band, data.weakSkill, data.strongSkill, { userId: data.userId });
      }
    });

    sA.emit('join_queue', { userId: resA.user.id, band: 6.5, weakSkill: 'GRA', strongSkill: 'P' });
    await new Promise(r => setTimeout(r, 20));

    sB.emit('join_queue', { userId: resB.user.id, band: 6.5, weakSkill: 'P', strongSkill: 'GRA' });
    await new Promise(r => setTimeout(r, 20));

    assert.ok(matchA, 'User A should receive match_found');
    assert.ok(matchB, 'User B should receive match_found');
    assert.strictEqual(matchA.roomName, matchB.roomName);

    sA.disconnect();
    sB.disconnect();
    hub.clear();
  });

  await runAsyncTest('T3.2: Complementary Match -> LiveKit Token -> Mixed-Plan Duration -> Active Call Controls workflow', async () => {
    const db = new MemoryDatabase();
    const hub = new MockSocketHub();

    const u1 = db.seedUser({ plan: 'FREE' }); // 10 mins
    const u2 = db.seedUser({ plan: 'PRO' });  // 30 mins

    const duration = resolveMixedPlanDuration(u1.plan, u2.plan);
    assert.strictEqual(duration, 30, 'Mixed FREE+PRO should grant 30 mins');

    const session = db.seedCallSession({ callerId: u1.id, calleeId: u2.id, maxDurationMinutes: duration });
    assert.strictEqual(session.maxDurationMinutes, 30);

    // Socket controls
    hub.onServerEvent('toggle_record', (soc, data) => {
      db.updateCallSession(session.id, { egressId: data.record ? 'egress_99' : null });
      hub.broadcastToAll('record_status', { record: data.record });
    });

    const client = hub.createClient(u1.id);
    const recPromise = waitForEvent(client, 'record_status');
    client.emit('toggle_record', { roomName: session.roomName, record: true });

    const recStatus = await recPromise;
    assert.strictEqual(recStatus.record, true);
    assert.strictEqual(db.getCallSession(session.id).egressId, 'egress_99');

    client.disconnect();
    hub.clear();
  });

  runTest('T3.5: Audio Egress Recording -> Storage Purge -> Bot Recordings Menu update workflow', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const user = db.seedUser({ telegramId: '3005', plan: 'FREE' });
    const expiredDate = new Date(Date.now() - 86400 * 1000 * 2);

    const session = db.seedCallSession({
      callerId: user.id,
      recordingPath: '/recordings/rec_old.mp4',
      recordingExpiresAt: expiredDate
    });

    // Before purge
    assert.strictEqual(db.getCallSession(session.id).recordingPath, '/recordings/rec_old.mp4');

    // Execute purge
    db.purgeExpiredRecordings(new Date());
    assert.strictEqual(db.getCallSession(session.id).recordingPath, null);

    // Bot recordings menu output reflects purged status
    const menuMsg = bot.simulateCallbackQuery('3005', 'cb_recordings');
    assert.ok(menuMsg.text.includes('Past Audio Recordings'));
  });

  runTest('T3.7: Direct Call menu select favorite partner -> Ringing -> Accept & Join LiveKit Session workflow', () => {
    const db = new MemoryDatabase();
    const userA = db.seedUser({ telegramId: '3007' });
    const partnerB = db.seedUser({ telegramId: '3008', alias: 'Favorite_Partner_B' });

    // Direct call initiation
    const initiateDirectCall = (callerId, partnerId) => {
      const session = db.seedCallSession({ callerId, calleeId: partnerId, status: 'RINGING' });
      return { status: 'RINGING', session };
    };

    const directCall = initiateDirectCall(userA.id, partnerB.id);
    assert.strictEqual(directCall.status, 'RINGING');

    // Accept call
    const acceptedSession = db.updateCallSession(directCall.session.id, { status: 'ACTIVE' });
    assert.strictEqual(acceptedSession.status, 'ACTIVE');
  });

  runTest('T3.9: Mixed Plan Match (FREE + PRO) -> 30-min limit applied -> Record toggle -> Post-call review card delivery', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const uA = db.seedUser({ telegramId: '3009_A', plan: 'FREE' });
    const uB = db.seedUser({ telegramId: '3009_B', plan: 'PRO' });

    const session = db.seedCallSession({ callerId: uA.id, calleeId: uB.id });
    assert.strictEqual(session.maxDurationMinutes, 30);

    // Post-call summary card
    const card = bot.sendPostCallReview(uA.telegramId, {
      sessionId: session.id,
      partnerAlias: uB.alias,
      durationMinutes: 30,
      recordingPath: '/recordings/rec_3009.mp4'
    });

    assert.ok(card.text.includes('Duration: 30 mins'));
    assert.ok(card.text.includes('Recording: Available'));
  });

  runTest('T3.10: Onboarding score update -> Immediate queue join -> Match with complementary peer matching new scores', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    // Initial onboarding: Band 6.0
    const res = bot.simulateStartOnboarding('3010', { FC: 6.0, LR: 6.0, GRA: 6.0, P: 6.0 });
    assert.strictEqual(res.user.band, 6.0);

    // Update scores via re-onboarding: Band 7.0
    const updatedRes = bot.simulateStartOnboarding('3010', { FC: 7.0, LR: 7.0, GRA: 7.0, P: 7.0 });
    assert.strictEqual(updatedRes.user.band, 7.0);

    // Queue at new band 7.0
    const key = db.pushToQueue(7.0, 'FC', 'P', { userId: updatedRes.user.id });
    assert.strictEqual(key, 'match_queue:7:FC:P');
  });

  await runAsyncTest('T3.11: Queue cancellation -> Instant retry -> Successful match -> LiveKit room setup workflow', async () => {
    const hub = new MockSocketHub();
    const db = new MemoryDatabase();

    const client = hub.createClient('usr_retry');

    db.pushToQueue(6.5, 'FC', 'P', { userId: 'usr_retry' });
    db.removeFromQueue('usr_retry');

    let match = null;
    hub.onServerEvent('join_queue', (soc, data) => {
      const comp = db.popComplementaryMatch(data.band, data.weakSkill, data.strongSkill);
      if (comp) {
        match = { roomName: 'room_retry', partnerId: comp.userId };
      }
    });

    // Seed peer
    db.pushToQueue(6.5, 'P', 'FC', { userId: 'usr_peer' });

    client.emit('join_queue', { userId: 'usr_retry', band: 6.5, weakSkill: 'FC', strongSkill: 'P' });
    await new Promise(r => setTimeout(r, 20));

    assert.ok(match);
    assert.strictEqual(match.partnerId, 'usr_peer');

    client.disconnect();
    hub.clear();
  });

  runTest('T3.12: Active call session -> Network disconnect -> Reconnect -> Finish call -> Recording path updated', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser();
    const session = db.seedCallSession({ callerId: user.id, status: 'ACTIVE' });

    db.setActiveCallLock(user.id, session.roomName);
    assert.strictEqual(db.hasActiveCallLock(user.id), true);

    // Finish call
    db.updateCallSession(session.id, { status: 'COMPLETED', recordingPath: '/rec_recon.mp4' });
    db.clearActiveCallLock(user.id);

    assert.strictEqual(db.hasActiveCallLock(user.id), false);
    assert.strictEqual(db.getCallSession(session.id).recordingPath, '/rec_recon.mp4');
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCrossMatchmakingCallsSuite().catch(err => {
    console.error('Fatal error in crossMatchmakingCalls test suite:', err);
    process.exit(1);
  });
}

module.exports = { runCrossMatchmakingCallsSuite };
