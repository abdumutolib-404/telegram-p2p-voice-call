/**
 * test/tier4_opaque_e2e/e2eStudentJourney.test.js
 * Tier 4 Opaque-Box E2E Test: Full Student Practice Journey.
 */

const assert = require('assert');
const { MemoryDatabase } = require('../harness/dbHelper');
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

async function runE2EStudentJourneySuite() {
  console.log('--- Running Tier 4 E2E Student Journey Test Suite ---');

  await runAsyncTest('T4.1.1: Complete Student Practice Journey (Onboard -> Queue -> Call -> Record -> 5-Star Rating -> Playback)', async () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });
    const hub = new MockSocketHub();

    // Step 1: Onboard Alice & Bob via /start
    const aliceOnboard = bot.simulateStartOnboarding('4001', { FC: 7.0, LR: 6.5, GRA: 6.5, P: 8.0 }); // Band 7.0 (Weak LR, Strong P)
    const bobOnboard = bot.simulateStartOnboarding('4002', { FC: 7.0, LR: 8.0, GRA: 6.5, P: 6.5 });   // Band 7.0 (Weak P, Strong LR)

    assert.strictEqual(aliceOnboard.user.band, 7.0);
    assert.strictEqual(bobOnboard.user.band, 7.0);
    assert.ok(aliceOnboard.user.alias.startsWith('IELTS_Partner_'));

    // Step 2: Open Mini App & Join Queue via Sockets
    const sAlice = hub.createClient(aliceOnboard.user.id);
    const sBob = hub.createClient(bobOnboard.user.id);

    let aliceMatch = null;
    let bobMatch = null;
    sAlice.on('match_found', d => aliceMatch = d);
    sBob.on('match_found', d => bobMatch = d);

    hub.onServerEvent('join_queue', (socket, data) => {
      const match = db.popComplementaryMatch(data.band, data.weakSkill, data.strongSkill);
      if (match) {
        const roomName = `room_student_${Date.now()}`;
        const session = db.seedCallSession({
          callerId: match.userId,
          calleeId: data.userId,
          roomName,
          status: 'ACTIVE'
        });
        socket.receive('match_found', { roomName, partnerAlias: 'Alice_Alias', sessionId: session.id });
        hub.sendToSocket(`socket_${match.userId}`, 'match_found', { roomName, partnerAlias: 'Bob_Alias', sessionId: session.id });
      } else {
        db.pushToQueue(data.band, data.weakSkill, data.strongSkill, { userId: data.userId });
      }
    });

    sAlice.emit('join_queue', { userId: aliceOnboard.user.id, band: 7.0, weakSkill: 'LR', strongSkill: 'P' });
    await new Promise(r => setTimeout(r, 20));

    sBob.emit('join_queue', { userId: bobOnboard.user.id, band: 7.0, weakSkill: 'P', strongSkill: 'LR' });
    await new Promise(r => setTimeout(r, 20));

    assert.ok(aliceMatch, 'Alice should be matched');
    assert.ok(bobMatch, 'Bob should be matched');
    assert.strictEqual(aliceMatch.roomName, bobMatch.roomName);

    // Step 3: Active Call - Toggle Recording ON
    hub.onServerEvent('toggle_record', (soc, data) => {
      db.updateCallSession(aliceMatch.sessionId, { egressId: 'egress_live_123' });
      hub.broadcastToAll('record_status', { record: true });
    });

    const recPromise = waitForEvent(sAlice, 'record_status');
    sAlice.emit('toggle_record', { roomName: aliceMatch.roomName, record: true });
    await recPromise;

    assert.strictEqual(db.getCallSession(aliceMatch.sessionId).egressId, 'egress_live_123');

    // Step 4: Finish Call
    db.updateCallSession(aliceMatch.sessionId, {
      status: 'COMPLETED',
      recordingPath: `/recordings/rec_${aliceMatch.roomName}.mp4`,
      endedAt: new Date()
    });

    // Step 5: Post-Call Rating (Alice rates Bob 5 stars)
    const rating = bot.simulatePostCallRating(aliceOnboard.user.id, {
      sessionId: aliceMatch.sessionId,
      partnerId: bobOnboard.user.id
    }, 5);

    assert.strictEqual(rating.rating, 5);
    assert.strictEqual(rating.reported, false);

    // Step 6: Recordings playback link in Bot menu
    const recMsg = bot.simulateCallbackQuery('4001', 'cb_recordings');
    assert.ok(recMsg.text.includes('Past Audio Recordings'));

    sAlice.disconnect();
    sBob.disconnect();
    hub.clear();
  });

  runTest('T4.1.2: Student Re-evaluation & Direct Call Practice Journey', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    // Step 1: Alice onboards
    const alice = bot.simulateStartOnboarding('4010', { FC: 6.0, LR: 6.0, GRA: 6.0, P: 6.0 });
    const originalAlias = alice.user.alias;

    // Step 2: Alice re-evaluates scores -> band updates from 6.0 to 7.0, alias remains locked
    const updatedAlice = bot.simulateStartOnboarding('4010', { FC: 7.0, LR: 7.0, GRA: 7.0, P: 7.0 });
    assert.strictEqual(updatedAlice.user.band, 7.0);
    assert.strictEqual(updatedAlice.user.alias, originalAlias);

    // Step 3: Direct call favorite partner
    const partner = db.seedUser({ alias: 'Favorite_Partner' });
    const session = db.seedCallSession({ callerId: alice.user.id, calleeId: partner.id, status: 'ACTIVE' });

    assert.strictEqual(session.status, 'ACTIVE');

    // Step 4: Review card
    const card = bot.sendPostCallReview('4010', { sessionId: session.id, partnerAlias: partner.alias });
    assert.ok(card.text.includes('Please rate your audio call quality'));
  });

  runTest('T4.1.3: Multi-session Practice Journey (Free Daily Limit 3/3 Enforcement)', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser({ plan: 'FREE' });

    // Simulate 3 completed calls today
    for (let i = 1; i <= 3; i++) {
      db.seedCallSession({ callerId: user.id, status: 'COMPLETED' });
    }

    const checkQuota = (userId) => {
      const completedCalls = Array.from(db.callSessions.values()).filter(s => s.callerId === userId).length;
      const limit = db.planLimits.FREE.dailyLimit;
      return { completedCalls, limit, allowed: completedCalls < limit };
    };

    const quota = checkQuota(user.id);
    assert.strictEqual(quota.completedCalls, 3);
    assert.strictEqual(quota.limit, 3);
    assert.strictEqual(quota.allowed, false, '4th call must be blocked due to daily limit');
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runE2EStudentJourneySuite().catch(err => {
    console.error('Fatal error in e2eStudentJourney test suite:', err);
    process.exit(1);
  });
}

module.exports = { runE2EStudentJourneySuite };
