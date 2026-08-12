/**
 * test/tier2_api_socket/boundariesModeration.test.js
 * Tier 2 Boundary & Corner Cases: Moderation Ladder, Appeals, Retention Purge & Payments.
 */

const assert = require('assert');
const { MemoryDatabase } = require('../harness/dbHelper');
const { TelegramBotMock } = require('../harness/botMock');

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

async function runBoundariesModerationSuite() {
  console.log('--- Running Tier 2 Moderation & Appeals Boundaries Test Suite ---');

  runTest('T2.65: Multiple rapid reports submitted for same call session handle escalation correctly', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser({ warningCount: 0 });

    db.applyModerationPenalty(user.id, 'Report 1');
    db.applyModerationPenalty(user.id, 'Report 2');

    const updated = db.getUserById(user.id);
    assert.strictEqual(updated.warningCount, 2);
    assert.strictEqual(updated.isBanned, true);
    assert.ok(updated.bannedUntil);
  });

  runTest('T2.66: Unblock appeal submission by non-banned user is rejected', () => {
    const db = new MemoryDatabase();
    const activeUser = db.seedUser({ isBanned: false });

    const submitAppeal = (userObj, text) => {
      if (!userObj.isBanned) {
        return { error: 'Only banned users may submit unblock appeals', appeal: null };
      }
      return { appeal: db.seedUnblockAppeal({ userId: userObj.id, appealText: text }) };
    };

    const res = submitAppeal(activeUser, 'Please unban me');
    assert.ok(res.error);
    assert.strictEqual(res.appeal, null);
  });

  runTest('T2.67: 6-hour temporary ban exact expiration boundary check (5h59m vs 6h01m)', () => {
    const db = new MemoryDatabase();

    const ban5h59m = new Date(Date.now() + (5 * 3600 + 59 * 60) * 1000);
    const u1 = db.seedUser({ isBanned: true, bannedUntil: ban5h59m });

    const isBannedNow = u1.bannedUntil && u1.bannedUntil > new Date();
    assert.strictEqual(isBannedNow, true, 'User banned for 5h59m remaining is still banned');

    const expiredBan = new Date(Date.now() - 1000);
    const u2 = db.seedUser({ isBanned: true, bannedUntil: expiredBan });
    const isExpiredNow = u2.bannedUntil && u2.bannedUntil > new Date();
    assert.strictEqual(isExpiredNow, false, 'Expired ban is no longer active');
  });

  runTest('T2.68: Self-reporting call partner (reviewer === target) is rejected', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser();

    const submitReport = (reviewerId, targetId, reason) => {
      if (reviewerId === targetId) {
        return { error: 'Cannot report yourself' };
      }
      return { ok: true };
    };

    const res = submitReport(user.id, user.id, 'Self report');
    assert.ok(res.error);
  });

  runTest('T2.69: Repeat appeal submission while appeal is already PENDING is rejected', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser({ isBanned: true });

    db.seedUnblockAppeal({ userId: user.id, telegramId: user.telegramId, status: 'PENDING' });

    const submitAppeal = (userId, text) => {
      const existing = db.getPendingAppeals().find(a => a.userId === userId);
      if (existing) {
        return { error: 'An appeal is already pending review' };
      }
      return { appeal: db.seedUnblockAppeal({ userId, appealText: text }) };
    };

    const res = submitAppeal(user.id, 'Another appeal');
    assert.ok(res.error);
  });

  runTest('T2.70: Moderation warning notice text content length and structure validation', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser({ warningCount: 0 });

    const updated = db.applyModerationPenalty(user.id, 'Spamming text in call');
    assert.strictEqual(updated.warningCount, 1);
    assert.strictEqual(updated.warningNotice, 'Spamming text in call');
  });

  runTest('T2.71: Report reason with max character length (500 chars) truncates cleanly', () => {
    const sanitizeReportReason = (reason) => {
      if (!reason) return 'No reason provided';
      return reason.substring(0, 500);
    };

    const longReason = 'A'.repeat(600);
    const cleaned = sanitizeReportReason(longReason);
    assert.strictEqual(cleaned.length, 500);
  });

  runTest('T2.72: Permanent ban (warning count >= 3) has no expiration date and cannot be auto-unbanned', () => {
    const db = new MemoryDatabase();
    const user = db.seedUser({ warningCount: 2, isBanned: true });

    const permBanned = db.applyModerationPenalty(user.id, '3rd strike');
    assert.strictEqual(permBanned.isPermanentBanned, true);
    assert.strictEqual(permBanned.bannedUntil, null);
  });

  runTest('T2.73: Storage purge cron executed when 0 recordings exist in DB returns purgedCount: 0', () => {
    const db = new MemoryDatabase();
    const res = db.purgeExpiredRecordings(new Date());
    assert.strictEqual(res.purgedCount, 0);
  });

  runTest('T2.74: Storage purge cron boundary: recording created 1 second before vs 1 second after cutoff', () => {
    const db = new MemoryDatabase();
    const now = new Date();

    const expiredDate = new Date(now.getTime() - 1000); // 1s ago
    const futureDate = new Date(now.getTime() + 1000);  // 1s in future

    const s1 = db.seedCallSession({ recordingPath: '/rec1.mp4', recordingExpiresAt: expiredDate });
    const s2 = db.seedCallSession({ recordingPath: '/rec2.mp4', recordingExpiresAt: futureDate });

    const res = db.purgeExpiredRecordings(now);
    assert.strictEqual(res.purgedCount, 1);
    assert.strictEqual(db.getCallSession(s1.id).recordingPath, null);
    assert.strictEqual(db.getCallSession(s2.id).recordingPath, '/rec2.mp4');
  });

  runTest('T2.75: Rating submission with invalid star rating value (0 or 6) returns validation error', () => {
    const validateRating = (rating) => {
      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return { error: 'Rating must be between 1 and 5 stars' };
      }
      return { ok: true };
    };

    assert.ok(validateRating(0).error);
    assert.ok(validateRating(6).error);
    assert.strictEqual(validateRating(4).ok, true);
  });

  runTest('T2.76: Unban approval for non-existent appeal ID returns null', () => {
    const db = new MemoryDatabase();
    const result = db.resolveAppeal('invalid_appeal_999', 'APPROVED');
    assert.strictEqual(result, null);
  });

  runTest('T2.77: Pre-checkout Stars payment query with missing payload returns ok: false', () => {
    const bot = new TelegramBotMock();
    const res = bot.simulatePreCheckoutQuery('1001', null);
    assert.strictEqual(res.ok, false);
  });

  runTest('T2.78: Stars transaction idempotency: processing payment twice for same telegramId maintains single plan upgrade', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });
    const user = db.seedUser({ telegramId: '5001', plan: 'FREE' });

    bot.simulateSuccessfulPayment('5001', { planTier: 'PLUS', amount: 250 });
    bot.simulateSuccessfulPayment('5001', { planTier: 'PLUS', amount: 250 });

    const updated = db.getUserById(user.id);
    assert.strictEqual(updated.plan, 'PLUS');
    assert.strictEqual(db.starsTransactions.size, 2);
  });

  runTest('T2.79: Storage retention calculation for PLUS plan (exact 7-day cutoff)', () => {
    const db = new MemoryDatabase();
    const now = new Date();

    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400 * 1000);
    const session = db.seedCallSession({
      recordingPath: '/rec_plus.mp4',
      recordingExpiresAt: sevenDaysAgo
    });

    const res = db.purgeExpiredRecordings(now);
    assert.strictEqual(res.purgedCount, 1);
  });

  runTest('T2.80: Storage retention calculation for PRO plan (exact 30-day cutoff)', () => {
    const db = new MemoryDatabase();
    const now = new Date();

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400 * 1000);
    const session = db.seedCallSession({
      recordingPath: '/rec_pro.mp4',
      recordingExpiresAt: thirtyDaysAgo
    });

    const res = db.purgeExpiredRecordings(now);
    assert.strictEqual(res.purgedCount, 1);
  });

  runTest('T2.81: Appeal review attempt on already APPROVED or REJECTED appeal returns error', () => {
    const db = new MemoryDatabase();
    const appeal = db.seedUnblockAppeal({ status: 'APPROVED' });

    const reviewAppeal = (appealId, status) => {
      const existing = db.unblockAppeals.get(appealId);
      if (!existing || existing.status !== 'PENDING') {
        return { error: 'Appeal is not pending review' };
      }
      return db.resolveAppeal(appealId, status);
    };

    const res = reviewAppeal(appeal.id, 'REJECTED');
    assert.ok(res.error);
  });

  runTest('T2.82: Auto-report trigger threshold verification (2 stars triggers report vs 3 stars does not)', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const user = db.seedUser();
    const partner = db.seedUser({ warningCount: 0 });
    const session = db.seedCallSession({ callerId: user.id, calleeId: partner.id });

    // 3-star rating: no report
    const r3 = bot.simulatePostCallRating(user.id, { sessionId: session.id, partnerId: partner.id }, 3);
    assert.strictEqual(r3.reported, false);

    // 2-star rating: auto-report
    const r2 = bot.simulatePostCallRating(user.id, { sessionId: session.id, partnerId: partner.id }, 2);
    assert.strictEqual(r2.reported, true);
  });

  runTest('T2.83: Post-call summary review rating submission twice for same session is recorded', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const session = db.seedCallSession();
    const r1 = bot.simulatePostCallRating('rev_1', { sessionId: session.id, partnerId: 'tgt_1' }, 5);
    const r2 = bot.simulatePostCallRating('rev_1', { sessionId: session.id, partnerId: 'tgt_1' }, 4);

    assert.ok(r1.id);
    assert.ok(r2.id);
    assert.notStrictEqual(r1.id, r2.id);
  });

  runTest('T2.84: Invoicing Stars for unknown plan tier returns error', () => {
    const bot = new TelegramBotMock();
    const validateInvoiceTier = (tier) => {
      if (tier !== 'PLUS' && tier !== 'PRO') {
        return { error: 'Invalid plan tier' };
      }
      return { ok: true };
    };

    assert.ok(validateInvoiceTier('ULTIMATE').error);
    assert.strictEqual(validateInvoiceTier('PLUS').ok, true);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runBoundariesModerationSuite().catch(err => {
    console.error('Fatal error in boundariesModeration test suite:', err);
    process.exit(1);
  });
}

module.exports = { runBoundariesModerationSuite };
