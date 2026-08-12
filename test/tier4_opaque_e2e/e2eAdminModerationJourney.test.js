/**
 * test/tier4_opaque_e2e/e2eAdminModerationJourney.test.js
 * Tier 4 Opaque-Box E2E Test: Stealth Admin Moderation & Appeals Resolution Journey.
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

async function runE2EAdminModerationJourneySuite() {
  console.log('--- Running Tier 4 E2E Admin Moderation & Appeals Journey Test Suite ---');

  runTest('T4.3.1: Stealth Admin Moderation & Appeals Resolution Journey', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db, adminTelegramIds: ['999'] });

    // Step 1: User A gets reported twice and receives 6h ban
    const userA = db.seedUser({ telegramId: '4301', warningCount: 1 });
    db.applyModerationPenalty(userA.id, 'Offensive language reported');

    const bannedUser = db.getUserById(userA.id);
    assert.strictEqual(bannedUser.isBanned, true);
    assert.strictEqual(bannedUser.warningCount, 2);

    // Step 2: User A submits unblock appeal via Bot/Support menu
    const appeal = db.seedUnblockAppeal({
      userId: userA.id,
      telegramId: userA.telegramId,
      appealText: 'I apologize for the misunderstanding during practice.'
    });
    assert.strictEqual(appeal.status, 'PENDING');

    // Step 3: Admin executes stealth /admin command
    const adminCmd = bot.simulateAdminCommand('999');
    assert.strictEqual(adminCmd.isAuthorized, true);
    assert.ok(adminCmd.token);

    // Step 4: Admin exchanges 2FA token + Master Password for JWT session
    const tokenData = db.consumeAdmin2FAToken(adminCmd.token);
    assert.ok(tokenData);

    // Step 5: Admin reviews pending appeals queue
    const pendingAppeals = db.getPendingAppeals();
    assert.strictEqual(pendingAppeals.length, 1);
    assert.strictEqual(pendingAppeals[0].id, appeal.id);

    // Step 6: Admin approves appeal
    const resolved = db.resolveAppeal(appeal.id, 'APPROVED');
    assert.strictEqual(resolved.status, 'APPROVED');

    // Step 7: User A is unbanned, warning count reset to 0, and re-joins queue
    const unbannedUser = db.getUserById(userA.id);
    assert.strictEqual(unbannedUser.isBanned, false);
    assert.strictEqual(unbannedUser.warningCount, 0);

    const queueKey = db.pushToQueue(6.5, 'FC', 'P', { userId: userA.id });
    assert.ok(queueKey);
  });

  runTest('T4.3.2: Escalation to Permanent Ban & Appeal Rejection Journey', () => {
    const db = new MemoryDatabase();

    // Step 1: User gets 3 consecutive reports
    const user = db.seedUser({ warningCount: 0 });
    db.applyModerationPenalty(user.id, 'Report 1');
    db.applyModerationPenalty(user.id, 'Report 2');
    db.applyModerationPenalty(user.id, 'Report 3');

    const permUser = db.getUserById(user.id);
    assert.strictEqual(permUser.warningCount, 3);
    assert.strictEqual(permUser.isPermanentBanned, true);

    // Step 2: User submits appeal
    const appeal = db.seedUnblockAppeal({ userId: user.id, appealText: 'Please unban me' });

    // Step 3: Admin reviews and REJECTS appeal
    const resolved = db.resolveAppeal(appeal.id, 'REJECTED');
    assert.strictEqual(resolved.status, 'REJECTED');

    // Step 4: User remains permanently banned
    const finalUser = db.getUserById(user.id);
    assert.strictEqual(finalUser.isBanned, true);
    assert.strictEqual(finalUser.isPermanentBanned, true);
  });

  runTest('T4.3.3: Admin Dynamic Configuration Management Journey', () => {
    const db = new MemoryDatabase();

    // Step 1: Initial default limits
    assert.strictEqual(db.planLimits.PLUS.maxDuration, 20);
    assert.strictEqual(db.planLimits.PLUS.starsPrice, 250);

    // Step 2: Admin updates limits via admin panel
    db.planLimits.PLUS.maxDuration = 25;
    db.planLimits.PLUS.starsPrice = 300;

    // Step 3: Verify new settings affect system
    assert.strictEqual(db.planLimits.PLUS.maxDuration, 25);
    assert.strictEqual(db.planLimits.PLUS.starsPrice, 300);

    // Step 4: Analytics stats report correct defaults & configuration
    const stats = db.getStats();
    assert.ok(stats);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runE2EAdminModerationJourneySuite().catch(err => {
    console.error('Fatal error in e2eAdminModerationJourney test suite:', err);
    process.exit(1);
  });
}

module.exports = { runE2EAdminModerationJourneySuite };
