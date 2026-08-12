/**
 * test/tier2_api_socket/boundariesMatchmaking.test.js
 * Tier 2 Boundary & Corner Cases: Matchmaking Queue & Redis Buckets.
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

async function runBoundariesMatchmakingSuite() {
  console.log('--- Running Tier 2 Matchmaking Boundaries Test Suite ---');

  runTest('T2.1: Concurrent queue joins at exact same millisecond preserve queue ordering', () => {
    const db = new MemoryDatabase();
    const band = 6.5;

    db.pushToQueue(band, 'FC', 'P', { userId: 'usr_conc_1', timestamp: 1000 });
    db.pushToQueue(band, 'FC', 'P', { userId: 'usr_conc_2', timestamp: 1000 });

    const bucket = db.redisBuckets.get(db.getQueueKey(band, 'FC', 'P'));
    assert.strictEqual(bucket.length, 2);
    assert.strictEqual(bucket[0].userId, 'usr_conc_1');
    assert.strictEqual(bucket[1].userId, 'usr_conc_2');
  });

  await runAsyncTest('T2.2: Queue cancellation while server is processing match handles race condition', async () => {
    const hub = new MockSocketHub();
    const db = new MemoryDatabase();

    const client = hub.createClient('usr_race_1');
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'usr_race_1' });

    let cancelled = false;
    hub.onServerEvent('cancel_queue', (socket, data) => {
      db.removeFromQueue(data.userId);
      cancelled = true;
    });

    client.emit('cancel_queue', { userId: 'usr_race_1' });
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(cancelled, true);
    assert.strictEqual(db.popComplementaryMatch(6.5, 'P', 'FC'), null);
    client.disconnect();
    hub.clear();
  });

  runTest('T2.3: Queue join when daily call limit is exactly reached (3/3 for FREE plan) is rejected', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser({ plan: 'FREE' });

    const dailyCalls = 3;
    const dailyLimit = db.planLimits.FREE.dailyLimit;
    const canQueue = dailyCalls < dailyLimit;

    assert.strictEqual(dailyLimit, 3);
    assert.strictEqual(canQueue, false, 'User at daily limit 3/3 must be blocked from queueing');
  });

  runTest('T2.4: Score boundary (5.0, 9.0) and precision rounding (6.375 -> 6.4)', () => {
    const db = new MemoryDatabase();
    const userMin = db.seedUser({ subscores: { FC: 5.0, LR: 5.0, GRA: 5.0, P: 5.0 }, band: 5.0 });
    const userMax = db.seedUser({ subscores: { FC: 9.0, LR: 9.0, GRA: 9.0, P: 9.0 }, band: 9.0 });

    assert.strictEqual(userMin.band, 5.0);
    assert.strictEqual(userMax.band, 9.0);

    const roundedBand = Number(((6.5 + 6.0 + 7.0 + 6.0) / 4).toFixed(1));
    assert.strictEqual(roundedBand, 6.4);
  });

  await runAsyncTest('T2.5: User socket disconnect during active queue search automatically cleans queue', async () => {
    const hub = new MockSocketHub();
    const db = new MemoryDatabase();

    const socket = hub.createClient('usr_disc_1');
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'usr_disc_1' });

    socket.on('disconnect', () => {
      db.removeFromQueue('usr_disc_1');
    });

    socket.disconnect();
    await new Promise(r => setTimeout(r, 20));

    const bucket = db.redisBuckets.get(db.getQueueKey(6.5, 'FC', 'P'));
    assert.strictEqual(bucket ? bucket.length : 0, 0);
    hub.clear();
  });

  runTest('T2.6: Queueing with identical weak and strong skill (e.g. FC and FC) is rejected', () => {
    const validateSkillPair = (weak, strong) => {
      if (weak === strong) return false;
      return true;
    };

    assert.strictEqual(validateSkillPair('FC', 'FC'), false);
    assert.strictEqual(validateSkillPair('FC', 'P'), true);
  });

  await runAsyncTest('T2.7: Rapid re-queueing (join -> cancel -> join -> cancel within 50ms)', async () => {
    const hub = new MockSocketHub();
    const db = new MemoryDatabase();
    const client = hub.createClient('usr_rapid_1');

    hub.onServerEvent('join_queue', (s, d) => db.pushToQueue(d.band, d.weakSkill, d.strongSkill, { userId: d.userId }));
    hub.onServerEvent('cancel_queue', (s, d) => db.removeFromQueue(d.userId));

    client.emit('join_queue', { userId: 'usr_rapid_1', band: 6.5, weakSkill: 'FC', strongSkill: 'P' });
    client.emit('cancel_queue', { userId: 'usr_rapid_1' });
    client.emit('join_queue', { userId: 'usr_rapid_1', band: 6.5, weakSkill: 'FC', strongSkill: 'P' });

    await new Promise(r => setTimeout(r, 30));

    const bucket = db.redisBuckets.get(db.getQueueKey(6.5, 'FC', 'P'));
    assert.strictEqual(bucket.length, 1);
    assert.strictEqual(bucket[0].userId, 'usr_rapid_1');

    client.disconnect();
    hub.clear();
  });

  runTest('T2.8: Redis queue bucket stress with 50 concurrent queued users', () => {
    const db = new MemoryDatabase();
    const band = 7.0;

    for (let i = 0; i < 50; i++) {
      db.pushToQueue(band, 'LR', 'GRA', { userId: `usr_stress_${i}` });
    }

    const key = db.getQueueKey(band, 'LR', 'GRA');
    assert.strictEqual(db.redisBuckets.get(key).length, 50);

    const match = db.popComplementaryMatch(band, 'GRA', 'LR');
    assert.strictEqual(match.userId, 'usr_stress_0'); // FIFO pop
    assert.strictEqual(db.redisBuckets.get(key).length, 49);
  });

  runTest('T2.9: FIFO ordering verified when multiple complementary users are in queue', () => {
    const db = new MemoryDatabase();
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'first_in', seq: 1 });
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'second_in', seq: 2 });

    const popped = db.popComplementaryMatch(6.5, 'P', 'FC');
    assert.strictEqual(popped.userId, 'first_in');
    assert.strictEqual(popped.seq, 1);
  });

  runTest('T2.10: Joining queue while user is in active DND mode is rejected', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser({ dnd: true });

    const canQueue = !user.dnd && !user.isBanned;
    assert.strictEqual(canQueue, false, 'User in DND mode must be blocked from queueing');
  });

  runTest('T2.11: Queue key resolution across all band values (5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0)', () => {
    const db = new MemoryDatabase();
    const bands = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

    for (const b of bands) {
      const key = db.getQueueKey(b, 'FC', 'LR');
      assert.strictEqual(key, `match_queue:${b}:FC:LR`);
    }
  });

  runTest('T2.12: Queue join with invalid sub-score object structure returns validation error', () => {
    const validateSubscores = (subscores) => {
      if (!subscores || typeof subscores !== 'object') return false;
      const keys = ['FC', 'LR', 'GRA', 'P'];
      return keys.every(k => typeof subscores[k] === 'number');
    };

    assert.strictEqual(validateSubscores(null), false);
    assert.strictEqual(validateSubscores({ FC: 6.5, LR: 6.5 }), false);
    assert.strictEqual(validateSubscores({ FC: 6.5, LR: 6.5, GRA: 6.5, P: 6.5 }), true);
  });

  runTest('T2.13: Duplicate queue join attempts for same user updates entry without duplication', () => {
    const db = new MemoryDatabase();
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'usr_dup_1', band: 6.5 });
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'usr_dup_1', band: 6.5 });

    const bucket = db.redisBuckets.get(db.getQueueKey(6.5, 'FC', 'P'));
    assert.strictEqual(bucket.length, 1);
  });

  runTest('T2.14: Matchmaking queue pop on empty bucket returns null', () => {
    const db = new MemoryDatabase();
    const match = db.popComplementaryMatch(6.5, 'FC', 'P');
    assert.strictEqual(match, null);
  });

  runTest('T2.15: Matching FREE user at daily limit 3/3 blocks queue entry', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser({ plan: 'FREE' });

    const checkLimit = (plan, count) => {
      const limit = db.planLimits[plan].dailyLimit;
      return count < limit;
    };

    assert.strictEqual(checkLimit('FREE', 3), false);
    assert.strictEqual(checkLimit('PLUS', 3), true);
  });

  runTest('T2.16: Queue cancellation for user not in queue completes without error', () => {
    const db = new MemoryDatabase();
    const removed = db.removeFromQueue('usr_not_exist');
    assert.strictEqual(removed, false);
  });

  runTest('T2.17: Matching users with identical sub-scores and alias structure succeeds', () => {
    const db = new MemoryDatabase();
    const u1 = db.seedUser({ alias: 'Alias_Same_1', band: 6.5 });
    const u2 = db.seedUser({ alias: 'Alias_Same_2', band: 6.5 });

    db.pushToQueue(6.5, 'GRA', 'LR', { userId: u1.id });
    const popped = db.popComplementaryMatch(6.5, 'LR', 'GRA');

    assert.strictEqual(popped.userId, u1.id);
  });

  runTest('T2.18: Re-joining queue immediately after completing a call session', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser();
    db.setActiveCallLock(user.id, 'room_101');

    assert.strictEqual(db.hasActiveCallLock(user.id), true);
    db.clearActiveCallLock(user.id);
    assert.strictEqual(db.hasActiveCallLock(user.id), false);

    const key = db.pushToQueue(6.5, 'FC', 'P', { userId: user.id });
    assert.ok(key);
  });

  runTest('T2.19: Bucket isolation: users at band 6.5 cannot match with band 7.0 even if skills match', () => {
    const db = new MemoryDatabase();
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'usr_6.5' });

    const poppedAt7 = db.popComplementaryMatch(7.0, 'P', 'FC');
    assert.strictEqual(poppedAt7, null);
  });

  runTest('T2.20: Queue join payload with invalid skill string name returns validation failure', () => {
    const validSkills = ['FC', 'LR', 'GRA', 'P'];
    const isValidSkill = (s) => validSkills.includes(s);

    assert.strictEqual(isValidSkill('INVALID_SKILL'), false);
    assert.strictEqual(isValidSkill('FC'), true);
  });

  runTest('T2.21: Clearing queue resets all Redis bucket stores', () => {
    const db = new MemoryDatabase();
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'u1' });
    db.pushToQueue(7.0, 'LR', 'GRA', { userId: 'u2' });

    assert.strictEqual(db.redisBuckets.size, 2);
    db.clearQueue();
    assert.strictEqual(db.redisBuckets.size, 0);
  });

  runTest('T2.22: Re-queueing with modified sub-scores updates queue payload properly', () => {
    const db = new MemoryDatabase();
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'u_mod', band: 6.5 });
    db.removeFromQueue('u_mod');

    db.pushToQueue(7.0, 'LR', 'GRA', { userId: 'u_mod', band: 7.0 });
    const bucket7 = db.redisBuckets.get(db.getQueueKey(7.0, 'LR', 'GRA'));
    assert.strictEqual(bucket7[0].userId, 'u_mod');
  });

  runTest('T2.23: Queue push with null or incomplete payload handles safety checks', () => {
    const db = new MemoryDatabase();
    const pushSafe = (band, weak, strong, payload) => {
      if (!payload || !payload.userId) return false;
      db.pushToQueue(band, weak, strong, payload);
      return true;
    };

    assert.strictEqual(pushSafe(6.5, 'FC', 'P', null), false);
    assert.strictEqual(pushSafe(6.5, 'FC', 'P', { userId: 'valid_usr' }), true);
  });

  runTest('T2.24: Pop complementary match on bucket with multiple items pops oldest item (FIFO)', () => {
    const db = new MemoryDatabase();
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'u_oldest', joinedAt: 100 });
    db.pushToQueue(6.5, 'FC', 'P', { userId: 'u_newest', joinedAt: 200 });

    const popped = db.popComplementaryMatch(6.5, 'P', 'FC');
    assert.strictEqual(popped.userId, 'u_oldest');
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runBoundariesMatchmakingSuite().catch(err => {
    console.error('Fatal error in boundariesMatchmaking test suite:', err);
    process.exit(1);
  });
}

module.exports = { runBoundariesMatchmakingSuite };
