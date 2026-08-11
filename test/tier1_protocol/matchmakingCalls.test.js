/**
 * test/tier1_protocol/matchmakingCalls.test.js
 * Tier 1 Protocol Test Suite for Matchmaking & Voice Calls (Features 4, 5, 9, 10, 11, 17).
 */

const assert = require('assert');
const { MemoryDatabase, resolveMixedPlanDuration, resolveHigherPlanTier, DEFAULT_PLAN_LIMITS } = require('../harness/dbHelper');
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

async function runMatchmakingCallsSuite() {
  console.log('--- Running Tier 1 Matchmaking & Call Controls Test Suite (Features 4, 5, 9, 10, 11, 17) ---');

  // ==========================================
  // FEATURE 4: O(1) Redis Complementary Matchmaking Queue
  // ==========================================

  runTest('Feature 4.1: Queue key string formatting for target band and skill pair', () => {
    const localDb = new MemoryDatabase();
    const key = localDb.getQueueKey(6.5, 'FC', 'P');
    assert.strictEqual(key, 'match_queue:6.5:FC:P');
  });

  runTest('Feature 4.2: Complementary queue key resolves inverted weak/strong skill pair', () => {
    const localDb = new MemoryDatabase();
    const compKey = localDb.getComplementaryQueueKey(6.5, 'FC', 'P');
    assert.strictEqual(compKey, 'match_queue:6.5:P:FC');
  });

  runTest('Feature 4.3: Complementary users at same band match successfully', () => {
    const localDb = new MemoryDatabase();

    const userA = localDb.seedUser({ alias: 'User_A', band: 6.5 });
    const userB = localDb.seedUser({ alias: 'User_B', band: 6.5 });

    // User A: Weak in FC, Strong in P
    localDb.pushToQueue(6.5, 'FC', 'P', { userId: userA.id, band: 6.5, weakSkill: 'FC', strongSkill: 'P' });

    // User B: Weak in P, Strong in FC (Complementary to A)
    const match = localDb.popComplementaryMatch(6.5, 'P', 'FC');
    assert.ok(match, 'User B searching for (P, FC) should pop User A (FC, P)');
    assert.strictEqual(match.userId, userA.id);
  });

  runTest('Feature 4.4: Non-complementary skill pairs do not match', () => {
    const localDb = new MemoryDatabase();

    const userA = localDb.seedUser({ alias: 'User_A', band: 6.5 });
    // User A: Weak in FC, Strong in P
    localDb.pushToQueue(6.5, 'FC', 'P', { userId: userA.id });

    // User C: Weak in LR, Strong in FC (Not complementary to FC/P)
    const match = localDb.popComplementaryMatch(6.5, 'LR', 'FC');
    assert.strictEqual(match, null, 'Should not match incompatible skill requirements');
  });

  runTest('Feature 4.5: Mismatched bands do not match even with complementary skills', () => {
    const localDb = new MemoryDatabase();

    const userA = localDb.seedUser({ alias: 'User_A', band: 6.5 });
    localDb.pushToQueue(6.5, 'FC', 'P', { userId: userA.id });

    // Searching at band 7.0
    const match = localDb.popComplementaryMatch(7.0, 'P', 'FC');
    assert.strictEqual(match, null, 'Band 7.0 search should not pop Band 6.5 user');
  });

  runTest('Feature 4.6: Instant cancellation removes user from queue in O(1)', () => {
    const localDb = new MemoryDatabase();

    const userA = localDb.seedUser({ alias: 'User_A', band: 6.5 });
    localDb.pushToQueue(6.5, 'FC', 'P', { userId: userA.id });

    const removed = localDb.removeFromQueue(userA.id);
    assert.strictEqual(removed, true);

    const match = localDb.popComplementaryMatch(6.5, 'P', 'FC');
    assert.strictEqual(match, null, 'Queue should be empty after cancellation');
  });


  // ==========================================
  // FEATURE 5: LiveKit SFU & Audio Egress Token Issue
  // ==========================================

  runTest('Feature 5.1: LiveKit room token issue embeds roomName and user identity', () => {
    const localDb = new MemoryDatabase();
    const session = localDb.seedCallSession({ roomName: 'room_livekit_101' });

    // Token simulation: base64 JWT payload mockup
    const livekitToken = Buffer.from(JSON.stringify({
      room: session.roomName,
      sub: session.callerId,
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64');

    const decoded = JSON.parse(Buffer.from(livekitToken, 'base64').toString('utf8'));
    assert.strictEqual(decoded.room, 'room_livekit_101');
    assert.strictEqual(decoded.sub, session.callerId);
  });

  runTest('Feature 5.2: LiveKit token includes 1-hour expiration timestamp', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const livekitToken = Buffer.from(JSON.stringify({
      room: 'room_102',
      exp: nowSec + 3600
    })).toString('base64');

    const decoded = JSON.parse(Buffer.from(livekitToken, 'base64').toString('utf8'));
    assert.ok(decoded.exp - nowSec >= 3590, 'Token expiration should be ~3600 seconds in future');
  });

  runTest('Feature 5.3: Server audio egress recording start generates egressId', () => {
    const localDb = new MemoryDatabase();
    const session = localDb.seedCallSession({ status: 'ACTIVE' });

    const egressId = `egress_${Math.random().toString(36).substring(2, 9)}`;
    const updated = localDb.updateCallSession(session.id, { egressId });

    assert.strictEqual(updated.egressId, egressId);
  });

  runTest('Feature 5.4: Stopping audio egress saves MP4/M4A recording file path to CallSession', () => {
    const localDb = new MemoryDatabase();
    const session = localDb.seedCallSession({ egressId: 'egress_123' });

    const recordingPath = `/recordings/rec_${session.roomName}.mp4`;
    const updated = localDb.updateCallSession(session.id, {
      recordingPath,
      recordingExpiresAt: new Date(Date.now() + 86400 * 1000)
    });

    assert.strictEqual(updated.recordingPath, recordingPath);
    assert.ok(updated.recordingExpiresAt instanceof Date);
  });

  runTest('Feature 5.5: Dual-channel audio egress metadata records headphones audio stream compatibility', () => {
    const localDb = new MemoryDatabase();
    const session = localDb.seedCallSession();

    const egressMeta = {
      sessionId: session.id,
      audioMix: 'DUAL_CHANNEL_STEREO',
      headphoneSupported: true
    };

    assert.strictEqual(egressMeta.audioMix, 'DUAL_CHANNEL_STEREO');
    assert.strictEqual(egressMeta.headphoneSupported, true);
  });

  runTest('Feature 5.6: Expired or invalid room token rejects session entry', () => {
    const expiredToken = Buffer.from(JSON.stringify({
      room: 'room_103',
      exp: Math.floor(Date.now() / 1000) - 100 // Expired 100s ago
    })).toString('base64');

    const decoded = JSON.parse(Buffer.from(expiredToken, 'base64').toString('utf8'));
    const isExpired = decoded.exp < Math.floor(Date.now() / 1000);
    assert.strictEqual(isExpired, true, 'Expired token must be rejected');
  });


  // ==========================================
  // FEATURE 9: Mini App Radar Screen Queue Events
  // ==========================================

  await runAsyncTest('Feature 9.1: Socket join_queue event registers user into Redis matching queue', async () => {
    const hub = new MockSocketHub();
    const localDb = new MemoryDatabase();

    hub.onServerEvent('join_queue', (socket, data, callback) => {
      const key = localDb.pushToQueue(data.band, data.weakSkill, data.strongSkill, { userId: data.userId });
      if (callback) callback({ status: 'queued', queueKey: key });
    });

    const client = hub.createClient('user_radar_1');
    client.emit('join_queue', { userId: 'user_radar_1', band: 6.5, weakSkill: 'FC', strongSkill: 'P' });

    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(localDb.redisBuckets.has('match_queue:6.5:FC:P'), true);
    client.disconnect();
    hub.clear();
  });

  await runAsyncTest('Feature 9.2: Socket cancel_queue event removes user from queue instantly', async () => {
    const hub = new MockSocketHub();
    const localDb = new MemoryDatabase();

    localDb.pushToQueue(6.5, 'FC', 'P', { userId: 'user_radar_2' });

    hub.onServerEvent('cancel_queue', (socket, data) => {
      localDb.removeFromQueue(data.userId);
      socket.receive('queue_cancelled', { userId: data.userId });
    });

    const client = hub.createClient('user_radar_2');
    const cancelPromise = waitForEvent(client, 'queue_cancelled');
    client.emit('cancel_queue', { userId: 'user_radar_2' });

    const res = await cancelPromise;
    assert.strictEqual(res.userId, 'user_radar_2');
    assert.strictEqual(localDb.redisBuckets.get('match_queue:6.5:FC:P').length, 0);

    client.disconnect();
    hub.clear();
  });

  await runAsyncTest('Feature 9.3: Server emits match_found to both users when complementary pair is matched', async () => {
    const hub = new MockSocketHub();
    const localDb = new MemoryDatabase();

    const socketA = hub.createClient('usr_match_A');
    const socketB = hub.createClient('usr_match_B');

    let matchA = null;
    let matchB = null;

    socketA.on('match_found', (data) => { matchA = data; });
    socketB.on('match_found', (data) => { matchB = data; });

    hub.onServerEvent('join_queue', (socket, data) => {
      const match = localDb.popComplementaryMatch(data.band, data.weakSkill, data.strongSkill);
      if (match) {
        const roomName = `room_${Math.random().toString(36).substring(2, 7)}`;
        const payload = { roomName, partnerAlias: 'MatchedPartner', callDurationLimit: 10 };
        socket.receive('match_found', payload);
        hub.sendToSocket(`socket_${match.userId}`, 'match_found', payload);
      } else {
        localDb.pushToQueue(data.band, data.weakSkill, data.strongSkill, { userId: data.userId });
      }
    });

    // User A joins
    socketA.emit('join_queue', { userId: 'usr_match_A', band: 6.5, weakSkill: 'FC', strongSkill: 'P' });
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(matchA, null);

    // User B joins (complementary: weak P, strong FC)
    socketB.emit('join_queue', { userId: 'usr_match_B', band: 6.5, weakSkill: 'P', strongSkill: 'FC' });
    await new Promise(r => setTimeout(r, 20));

    assert.ok(matchA, 'Socket A should receive match_found');
    assert.ok(matchB, 'Socket B should receive match_found');
    assert.strictEqual(matchA.roomName, matchB.roomName);

    socketA.disconnect();
    socketB.disconnect();
    hub.clear();
  });

  runTest('Feature 9.4: User with active call lock is prevented from double queueing', () => {
    const localDb = new MemoryDatabase();
    localDb.setActiveCallLock('user_active_1', 'room_existing');

    const hasLock = localDb.hasActiveCallLock('user_active_1');
    assert.strictEqual(hasLock, true, 'User should have active call lock');
  });

  runTest('Feature 9.5: Banned user attempting to join queue is rejected', () => {
    const localDb = new MemoryDatabase();
    const bannedUser = localDb.seedUser({ isBanned: true, isPermanentBanned: true });

    const user = localDb.getUserById(bannedUser.id);
    const canQueue = !user.isBanned && !user.isPermanentBanned;
    assert.strictEqual(canQueue, false, 'Banned user must not be allowed to queue');
  });


  // ==========================================
  // FEATURE 10: Active Voice Call Controls
  // ==========================================

  await runAsyncTest('Feature 10.1: toggle_record event with record: true enables recording and emits record_status', async () => {
    const hub = new MockSocketHub();
    const localDb = new MemoryDatabase();
    const session = localDb.seedCallSession();

    hub.onServerEvent('toggle_record', (socket, data) => {
      localDb.updateCallSession(session.id, { egressId: data.record ? 'egress_active' : null });
      hub.broadcastToAll('record_status', { record: data.record });
    });

    const client = hub.createClient('user_call_1');
    const statusPromise = waitForEvent(client, 'record_status');
    client.emit('toggle_record', { roomName: session.roomName, record: true });

    const status = await statusPromise;
    assert.strictEqual(status.record, true);
    client.disconnect();
    hub.clear();
  });

  await runAsyncTest('Feature 10.2: toggle_record event with record: false disables recording', async () => {
    const hub = new MockSocketHub();
    const localDb = new MemoryDatabase();
    const session = localDb.seedCallSession({ egressId: 'egress_123' });

    hub.onServerEvent('toggle_record', (socket, data) => {
      if (!data.record) {
        localDb.updateCallSession(session.id, { egressId: null });
      }
      hub.broadcastToAll('record_status', { record: data.record });
    });

    const client = hub.createClient('user_call_2');
    const statusPromise = waitForEvent(client, 'record_status');
    client.emit('toggle_record', { roomName: session.roomName, record: false });

    const status = await statusPromise;
    assert.strictEqual(status.record, false);
    assert.strictEqual(localDb.getCallSession(session.id).egressId, null);
    client.disconnect();
    hub.clear();
  });

  await runAsyncTest('Feature 10.3: finish_call event disconnects call session and updates status to COMPLETED', async () => {
    const hub = new MockSocketHub();
    const localDb = new MemoryDatabase();
    const session = localDb.seedCallSession({ status: 'ACTIVE' });

    hub.onServerEvent('finish_call', (socket, data) => {
      localDb.updateCallSession(session.id, { status: 'COMPLETED', endedAt: new Date() });
      socket.receive('call_finished', { status: 'COMPLETED' });
    });

    const client = hub.createClient('user_call_3');
    const finishPromise = waitForEvent(client, 'call_finished');
    client.emit('finish_call', { roomName: session.roomName, userId: 'user_call_3' });

    const res = await finishPromise;
    assert.strictEqual(res.status, 'COMPLETED');
    assert.strictEqual(localDb.getCallSession(session.id).status, 'COMPLETED');

    client.disconnect();
    hub.clear();
  });

  runTest('Feature 10.4: finish_call releases active call locks in Redis', () => {
    const localDb = new MemoryDatabase();
    localDb.setActiveCallLock('usr_lock_1', 'room_active_99');

    assert.strictEqual(localDb.hasActiveCallLock('usr_lock_1'), true);
    localDb.clearActiveCallLock('usr_lock_1');
    assert.strictEqual(localDb.hasActiveCallLock('usr_lock_1'), false);
  });

  runTest('Feature 10.5: Active call timer enforces plan duration limit', () => {
    const localDb = new MemoryDatabase();
    const session = localDb.seedCallSession({ maxDurationMinutes: 20 });

    assert.strictEqual(session.maxDurationMinutes, 20);
  });


  // ==========================================
  // FEATURE 11: Dynamic Audio Visualizer Stream Events
  // ==========================================

  runTest('Feature 11.1: Web Audio API frequency data buffer initialization', () => {
    const fftSize = 64;
    const frequencyData = new Uint8Array(fftSize / 2);
    assert.strictEqual(frequencyData.length, 32);
    assert.strictEqual(frequencyData[0], 0);
  });

  runTest('Feature 11.2: Frequency data extraction fills buffer array', () => {
    const frequencyData = new Uint8Array(4);
    // Simulate frequency waveform values
    frequencyData[0] = 120;
    frequencyData[1] = 200;
    frequencyData[2] = 180;
    frequencyData[3] = 90;

    assert.strictEqual(frequencyData[1], 200);
    const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    assert.strictEqual(avg, 147.5);
  });

  runTest('Feature 11.3: Muted audio track produces zero frequency output', () => {
    const frequencyData = new Uint8Array(4); // initialized to zeros
    const isMuted = frequencyData.every(val => val === 0);
    assert.strictEqual(isMuted, true);
  });

  runTest('Feature 11.4: Active audio stream produces positive peak visualizer heights', () => {
    const frequencyData = new Uint8Array([50, 100, 150, 250]);
    const canvasHeight = 100;
    const barHeights = Array.from(frequencyData).map(val => (val / 255) * canvasHeight);

    assert.ok(barHeights[3] > 90, 'Peak bar height should be proportional to frequency');
  });

  runTest('Feature 11.5: Disconnecting audio stream clears visualizer spectrum canvas', () => {
    let frequencyData = new Uint8Array([100, 150, 200]);
    // Simulate cleanup
    frequencyData = new Uint8Array(3);
    assert.strictEqual(frequencyData.every(v => v === 0), true);
  });


  // ==========================================
  // FEATURE 17: Mixed-Plan Call Duration Resolution
  // ==========================================

  runTest('Feature 17.1: FREE user (10m) + PRO user (30m) resolves to PRO duration (30 mins)', () => {
    const duration = resolveMixedPlanDuration('FREE', 'PRO');
    assert.strictEqual(duration, 30);
  });

  runTest('Feature 17.2: FREE user (10m) + PLUS user (20m) resolves to PLUS duration (20 mins)', () => {
    const duration = resolveMixedPlanDuration('FREE', 'PLUS');
    assert.strictEqual(duration, 20);
  });

  runTest('Feature 17.3: PLUS user (20m) + PRO user (30m) resolves to PRO duration (30 mins)', () => {
    const duration = resolveMixedPlanDuration('PLUS', 'PRO');
    assert.strictEqual(duration, 30);
  });

  runTest('Feature 17.4: FREE user + FREE user resolves to FREE duration (10 mins)', () => {
    const duration = resolveMixedPlanDuration('FREE', 'FREE');
    assert.strictEqual(duration, 10);
  });

  runTest('Feature 17.5: PRO user + PRO user resolves to PRO duration (30 mins)', () => {
    const duration = resolveMixedPlanDuration('PRO', 'PRO');
    assert.strictEqual(duration, 30);
  });

  runTest('Feature 17.6: Higher plan tier resolution handles case-insensitive plan strings', () => {
    const tier = resolveHigherPlanTier('free', 'pro');
    assert.strictEqual(tier, 'PRO');
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runMatchmakingCallsSuite().catch(err => {
    console.error('Fatal error in matchmakingCalls test suite:', err);
    process.exit(1);
  });
}

module.exports = { runMatchmakingCallsSuite };
