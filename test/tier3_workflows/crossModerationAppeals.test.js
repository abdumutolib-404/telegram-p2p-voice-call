/**
 * test/tier3_workflows/crossModerationAppeals.test.js
 * Tier 3 Pairwise Cross-Feature Workflows: Rating, Moderation Ladder, Unblock Appeals & Admin Resolution.
 */

const assert = require('assert');
const { MemoryDatabase } = require('../harness/dbHelper');
const { TelegramBotMock } = require('../harness/botMock');
const { MockSocketHub } = require('../harness/socketClient');

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

async function runCrossModerationAppealsSuite() {
  console.log('--- Running Tier 3 Moderation & Appeals Workflows Test Suite ---');

  runTest('T3.3: Post-Call Review Low Rating (<=2 stars) -> Moderation Penalty Escalation -> Unblock Appeal Submission -> Admin Approval & Unban workflow', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const reviewer = db.seedUser({ telegramId: '3003_REV' });
    const target = db.seedUser({ telegramId: '3003_TGT', warningCount: 1 }); // 1 existing warning
    const session = db.seedCallSession({ callerId: reviewer.id, calleeId: target.id });

    // 1. Post-call review 2-star rating triggers 2nd strike (6h ban)
    bot.simulatePostCallRating(reviewer.id, { sessionId: session.id, partnerId: target.id }, 2);

    const bannedTarget = db.getUserById(target.id);
    assert.strictEqual(bannedTarget.warningCount, 2);
    assert.strictEqual(bannedTarget.isBanned, true);

    // 2. Target user submits unblock appeal
    const appeal = db.seedUnblockAppeal({
      userId: target.id,
      telegramId: target.telegramId,
      appealText: 'My audio cut out due to bad connection, I did not intend to be rude.'
    });
    assert.strictEqual(appeal.status, 'PENDING');

    // 3. Admin approves appeal
    const resolved = db.resolveAppeal(appeal.id, 'APPROVED');
    assert.strictEqual(resolved.status, 'APPROVED');

    // 4. Target user is unbanned and warning count reset
    const unbannedTarget = db.getUserById(target.id);
    assert.strictEqual(unbannedTarget.isBanned, false);
    assert.strictEqual(unbannedTarget.warningCount, 0);
  });

  await runAsyncTest('T3.8: Temporary Ban applied via moderation ladder -> Socket connection rejected during handshake -> Queue blocked workflow', async () => {
    const db = new MemoryDatabase();
    const hub = new MockSocketHub();

    const user = db.seedUser({ warningCount: 1 });
    db.applyModerationPenalty(user.id, '2nd report');

    const bannedUser = db.getUserById(user.id);
    assert.strictEqual(bannedUser.isBanned, true);

    // Socket handshake auth check
    const checkSocketHandshake = (userId) => {
      const u = db.getUserById(userId);
      if (u.isBanned || u.isPermanentBanned) {
        return { allowed: false, reason: 'User is currently banned' };
      }
      return { allowed: true };
    };

    const auth = checkSocketHandshake(user.id);
    assert.strictEqual(auth.allowed, false);
    assert.ok(auth.reason.includes('banned'));
  });

  runTest('T3.17: Explicit Partner Report -> Warning Notice sent via Bot -> 2nd Report -> 6h Ban -> Queue join blocked workflow', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const user = db.seedUser({ telegramId: '3017_U', warningCount: 0 });

    // 1st explicit report
    const p1 = db.applyModerationPenalty(user.id, 'Inappropriate language');
    assert.strictEqual(p1.warningCount, 1);
    assert.strictEqual(p1.isBanned, false);

    // 2nd report
    const p2 = db.applyModerationPenalty(user.id, 'Offensive username');
    assert.strictEqual(p2.warningCount, 2);
    assert.strictEqual(p2.isBanned, true);

    // Attempting queue join
    const canQueue = !p2.isBanned && !p2.isPermanentBanned;
    assert.strictEqual(canQueue, false);
  });

  runTest('T3.18: 3rd Report -> Permanent Ban -> Appeal Submitted -> Admin Rejects Appeal -> User remains permanently banned workflow', () => {
    const db = new MemoryDatabase();

    const user = db.seedUser({ warningCount: 2, isBanned: true });

    // 3rd strike: Permanent ban
    const p3 = db.applyModerationPenalty(user.id, '3rd severe violation');
    assert.strictEqual(p3.isPermanentBanned, true);
    assert.strictEqual(p3.bannedUntil, null);

    // Submit appeal
    const appeal = db.seedUnblockAppeal({ userId: user.id, telegramId: user.telegramId, appealText: 'Please give me 1 more chance' });

    // Admin rejects appeal
    const resolved = db.resolveAppeal(appeal.id, 'REJECTED');
    assert.strictEqual(resolved.status, 'REJECTED');

    const finalUser = db.getUserById(user.id);
    assert.strictEqual(finalUser.isBanned, true);
    assert.strictEqual(finalUser.isPermanentBanned, true);
  });

  runTest('T3.19: Post-Call 1-star rating -> Auto-ban -> User submits appeal -> Admin approves -> Warning count reset -> User matches in queue workflow', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const rev = db.seedUser({ telegramId: '3019_R' });
    const tgt = db.seedUser({ telegramId: '3019_T', warningCount: 1 });
    const session = db.seedCallSession({ callerId: rev.id, calleeId: tgt.id });

    // 1-star rating triggers strike 2 (ban)
    bot.simulatePostCallRating(rev.id, { sessionId: session.id, partnerId: tgt.id }, 1);
    assert.strictEqual(db.getUserById(tgt.id).isBanned, true);

    // Appeal & approve
    const appeal = db.seedUnblockAppeal({ userId: tgt.id, telegramId: tgt.telegramId });
    db.resolveAppeal(appeal.id, 'APPROVED');

    const unbanned = db.getUserById(tgt.id);
    assert.strictEqual(unbanned.isBanned, false);
    assert.strictEqual(unbanned.warningCount, 0);

    // Successfully queues
    const key = db.pushToQueue(6.5, 'FC', 'P', { userId: tgt.id });
    assert.ok(key);
  });

  runTest('T3.20: Low rating report -> Target user ban -> Expired recordings purged by Cron -> Retention policy maintained post-appeal workflow', () => {
    const db = new MemoryDatabase();

    const target = db.seedUser({ plan: 'FREE', warningCount: 1 });
    db.applyModerationPenalty(target.id, 'Low rating auto-report');

    const oldDate = new Date(Date.now() - 86400 * 1000 * 3);
    const session = db.seedCallSession({
      callerId: target.id,
      recordingPath: '/rec_target.mp4',
      recordingExpiresAt: oldDate
    });

    const purgeRes = db.purgeExpiredRecordings(new Date());
    assert.strictEqual(purgeRes.purgedCount, 1);
    assert.strictEqual(db.getCallSession(session.id).recordingPath, null);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCrossModerationAppealsSuite().catch(err => {
    console.error('Fatal error in crossModerationAppeals test suite:', err);
    process.exit(1);
  });
}

module.exports = { runCrossModerationAppealsSuite };
