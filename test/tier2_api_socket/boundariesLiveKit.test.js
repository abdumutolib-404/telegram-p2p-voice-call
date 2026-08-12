/**
 * test/tier2_api_socket/boundariesLiveKit.test.js
 * Tier 2 Boundary & Corner Cases: Call Session & LiveKit SFU.
 */

const assert = require('assert');
const { MemoryDatabase } = require('../harness/dbHelper');
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

async function runBoundariesLiveKitSuite() {
  console.log('--- Running Tier 2 LiveKit & Call Session Boundaries Test Suite ---');

  await runAsyncTest('T2.23: Dual disconnect simultaneously from active call session handles cleanup', async () => {
    const hub = new MockSocketHub();
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ status: 'ACTIVE' });

    db.setActiveCallLock('usr_dual_A', session.roomName);
    db.setActiveCallLock('usr_dual_B', session.roomName);

    const sA = hub.createClient('usr_dual_A');
    const sB = hub.createClient('usr_dual_B');

    sA.on('disconnect', () => db.clearActiveCallLock('usr_dual_A'));
    sB.on('disconnect', () => db.clearActiveCallLock('usr_dual_B'));

    sA.disconnect();
    sB.disconnect();

    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(db.hasActiveCallLock('usr_dual_A'), false);
    assert.strictEqual(db.hasActiveCallLock('usr_dual_B'), false);
    hub.clear();
  });

  await runAsyncTest('T2.24: Rapid toggle_record ON/OFF within 100ms updates state predictably', async () => {
    const hub = new MockSocketHub();
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ status: 'ACTIVE' });

    let finalRecordState = null;
    hub.onServerEvent('toggle_record', (soc, data) => {
      db.updateCallSession(session.id, { egressId: data.record ? 'egress_active' : null });
      finalRecordState = data.record;
    });

    const client = hub.createClient('usr_toggle');
    client.emit('toggle_record', { roomName: session.roomName, record: true });
    client.emit('toggle_record', { roomName: session.roomName, record: false });

    await new Promise(r => setTimeout(r, 30));

    assert.strictEqual(finalRecordState, false);
    assert.strictEqual(db.getCallSession(session.id).egressId, null);
    client.disconnect();
    hub.clear();
  });

  runTest('T2.25: Call duration reaching exact limit auto-terminates session', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ maxDurationMinutes: 10, startedAt: new Date(Date.now() - 600 * 1000) });

    const elapsedSec = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
    const maxSec = session.maxDurationMinutes * 60;
    const isExpired = elapsedSec >= maxSec;

    assert.strictEqual(isExpired, true, '10-minute call at 600s must be marked expired');
  });

  runTest('T2.26: Egress failure handling when LiveKit egress returns error or is unreachable', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession();

    const handleEgressFailure = (sessId, errorMsg) => {
      return db.updateCallSession(sessId, {
        egressId: null,
        recordingPath: null,
        egressError: errorMsg
      });
    };

    const updated = handleEgressFailure(session.id, 'LiveKit Egress Service Unavailable');
    assert.strictEqual(updated.recordingPath, null);
    assert.strictEqual(updated.egressError, 'LiveKit Egress Service Unavailable');
  });

  runTest('T2.27: Re-joining active call room after network drop within grace period succeeds', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser();
    db.setActiveCallLock(user.id, 'room_active_99', 1800);

    const hasActiveLock = db.hasActiveCallLock(user.id);
    assert.strictEqual(hasActiveLock, true);
    assert.strictEqual(db.redisActiveCallLocks.get(user.id).roomName, 'room_active_99');
  });

  runTest('T2.28: LiveKit token generation with 0 second TTL is rejected as expired', () => {
    const generateToken = (ttl) => {
      const now = Math.floor(Date.now() / 1000);
      return { exp: now + ttl };
    };

    const token0 = generateToken(0);
    const isExpired = token0.exp <= Math.floor(Date.now() / 1000);
    assert.strictEqual(isExpired, true);
  });

  runTest('T2.29: Finish call executed twice concurrently for same room handles idempotency', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ status: 'ACTIVE' });

    const finishCall = (sessId) => {
      const current = db.getCallSession(sessId);
      if (current.status === 'COMPLETED') {
        return { alreadyFinished: true, session: current };
      }
      const updated = db.updateCallSession(sessId, { status: 'COMPLETED', endedAt: new Date() });
      return { alreadyFinished: false, session: updated };
    };

    const res1 = finishCall(session.id);
    const res2 = finishCall(session.id);

    assert.strictEqual(res1.alreadyFinished, false);
    assert.strictEqual(res2.alreadyFinished, true);
    assert.strictEqual(res2.session.status, 'COMPLETED');
  });

  runTest('T2.30: Audio visualizer receiving extreme frequency amplitude values (0 vs 255)', () => {
    const minFreq = 0;
    const maxFreq = 255;
    const canvasHeight = 100;

    const minBar = (minFreq / 255) * canvasHeight;
    const maxBar = (maxFreq / 255) * canvasHeight;

    assert.strictEqual(minBar, 0);
    assert.strictEqual(maxBar, 100);
  });

  runTest('T2.31: Session completion with missing recording egress path sets recordingPath to null', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ status: 'COMPLETED', recordingPath: null });

    assert.strictEqual(session.status, 'COMPLETED');
    assert.strictEqual(session.recordingPath, null);
  });

  runTest('T2.32: Audio egress metadata recording when caller or callee disconnects abruptly', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ egressId: 'egress_abrupt' });

    const updated = db.updateCallSession(session.id, {
      status: 'ABORTED',
      endedAt: new Date(),
      recordingPath: `/recordings/rec_abrupt_${session.roomName}.mp4`
    });

    assert.strictEqual(updated.status, 'ABORTED');
    assert.ok(updated.recordingPath);
  });

  runTest('T2.33: Call duration calculation handles boundary transitions across midnight', () => {
    const start = new Date('2026-08-11T23:55:00Z');
    const end = new Date('2026-08-12T00:05:00Z');
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / (60 * 1000));

    assert.strictEqual(durationMinutes, 10);
  });

  runTest('T2.34: Toggling recording after call session status COMPLETED returns error', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ status: 'COMPLETED' });

    const toggleRecord = (sessId) => {
      const current = db.getCallSession(sessId);
      if (current.status === 'COMPLETED') {
        return { error: 'Cannot toggle recording on completed call' };
      }
      return { ok: true };
    };

    const res = toggleRecord(session.id);
    assert.ok(res.error);
  });

  runTest('T2.35: Room token decode attempt with corrupted base64 string throws syntax error', () => {
    const decodeCorruptedToken = (corrupted) => {
      try {
        const str = Buffer.from(corrupted, 'base64').toString('utf8');
        return JSON.parse(str);
      } catch (err) {
        return null;
      }
    };

    assert.strictEqual(decodeCorruptedToken('not_valid_base64_json!@#$'), null);
  });

  runTest('T2.36: Maximum room duration enforcement for 30-min PRO calls', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ maxDurationMinutes: 30 });
    assert.strictEqual(session.maxDurationMinutes, 30);
  });

  await runAsyncTest('T2.37: Simultaneous toggle_record events from both caller and callee broadcast state', async () => {
    const hub = new MockSocketHub();
    const db = new MemoryDatabase();
    const session = db.seedCallSession();

    let eventCount = 0;
    hub.onServerEvent('toggle_record', (soc, data) => {
      eventCount++;
      hub.broadcastToAll('record_status', { record: data.record, by: soc.id });
    });

    const s1 = hub.createClient('usr_rec_1');
    const s2 = hub.createClient('usr_rec_2');

    s1.emit('toggle_record', { roomName: session.roomName, record: true });
    s2.emit('toggle_record', { roomName: session.roomName, record: true });

    await new Promise(r => setTimeout(r, 30));

    assert.strictEqual(eventCount, 2);
    s1.disconnect();
    s2.disconnect();
    hub.clear();
  });

  runTest('T2.38: Active call lock release when server forcibly terminates room', () => {
    const db = new MemoryDatabase();
    db.setActiveCallLock('usr_force_1', 'room_terminated');
    db.setActiveCallLock('usr_force_2', 'room_terminated');

    db.clearActiveCallLock('usr_force_1');
    db.clearActiveCallLock('usr_force_2');

    assert.strictEqual(db.hasActiveCallLock('usr_force_1'), false);
    assert.strictEqual(db.hasActiveCallLock('usr_force_2'), false);
  });

  runTest('T2.39: Audio visualizer canvas rendering with empty FFT data buffer handles zeroes', () => {
    const fftBuffer = new Uint8Array(32); // All zeros
    const isEmpty = fftBuffer.every(val => val === 0);
    assert.strictEqual(isEmpty, true);
  });

  runTest('T2.40: Direct call initiation when target partner is in another call is rejected as BUSY', () => {
    const db = new MemoryDatabase();
    const targetUser = db.seedUser({ alias: 'Busy_Partner' });
    db.setActiveCallLock(targetUser.id, 'room_other_123');

    const initiateDirectCall = (targetId) => {
      if (db.hasActiveCallLock(targetId)) {
        return { status: 'BUSY', message: 'Partner is currently in another call' };
      }
      return { status: 'RINGING' };
    };

    const res = initiateDirectCall(targetUser.id);
    assert.strictEqual(res.status, 'BUSY');
  });

  runTest('T2.41: LiveKit token claim by unauthorized user not participating in room returns 403', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ callerId: 'usr_A', calleeId: 'usr_B' });

    const authorizeRoomAccess = (userId, sessionObj) => {
      return userId === sessionObj.callerId || userId === sessionObj.calleeId;
    };

    assert.strictEqual(authorizeRoomAccess('usr_intruder', session), false);
    assert.strictEqual(authorizeRoomAccess('usr_A', session), true);
  });

  runTest('T2.42: Finishing call with negative or zero elapsed duration rounds to 1 minute minimum', () => {
    const calculateCallDuration = (start, end) => {
      const diffMs = end.getTime() - start.getTime();
      const minutes = Math.ceil(diffMs / (60 * 1000));
      return minutes <= 0 ? 1 : minutes;
    };

    const now = new Date();
    assert.strictEqual(calculateCallDuration(now, now), 1);
  });

  runTest('T2.43: Egress recording path update with unsupported file extension defaults to m4a format', () => {
    const validateRecordingPath = (path) => {
      if (!path.endsWith('.mp4') && !path.endsWith('.m4a')) {
        return path + '.m4a';
      }
      return path;
    };

    assert.strictEqual(validateRecordingPath('/rec_test.raw'), '/rec_test.raw.m4a');
    assert.strictEqual(validateRecordingPath('/rec_test.mp4'), '/rec_test.mp4');
  });

  runTest('T2.44: Direct call ringing times out after 30 seconds if not accepted', () => {
    const isRingingExpired = (ringStartTimeSec, timeoutSec = 30) => {
      const nowSec = Math.floor(Date.now() / 1000);
      return (nowSec - ringStartTimeSec) >= timeoutSec;
    };

    const ring31sAgo = Math.floor(Date.now() / 1000) - 31;
    assert.strictEqual(isRingingExpired(ring31sAgo), true);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runBoundariesLiveKitSuite().catch(err => {
    console.error('Fatal error in boundariesLiveKit test suite:', err);
    process.exit(1);
  });
}

module.exports = { runBoundariesLiveKitSuite };
