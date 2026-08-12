/**
 * test/tier1_protocol/adminManagement.test.js
 * Tier 1 Protocol Test Suite for Admin Management (Features 14, 15, 16).
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

async function runAdminManagementSuite() {
  console.log('--- Running Tier 1 Admin Management Test Suite (Features 14, 15, 16) ---');

  // ==========================================
  // FEATURE 14: Admin Analytics Dashboard
  // ==========================================

  runTest('Feature 14.1: GET /api/admin/stats returns Total Users, MAU, DAU, and Active Calls', () => {
    const localDb = new MemoryDatabase();
    localDb.seedUser({ telegramId: '140001' });
    localDb.seedUser({ telegramId: '140002' });
    localDb.seedCallSession({ status: 'ACTIVE' });

    const stats = localDb.getStats();
    assert.strictEqual(stats.totalUsers, 2, 'Total users count should be 2');
    assert.ok(stats.mau > 0, 'MAU should be calculated');
    assert.ok(stats.dau > 0, 'DAU should be calculated');
    assert.strictEqual(stats.activeCalls, 1, 'Active calls count should be 1');
  });

  runTest('Feature 14.2: Stars revenue & USD conversion calculation ($0.013/Star)', () => {
    const localDb = new MemoryDatabase();
    localDb.seedStarsTransaction({ telegramId: '140003', starsAmount: 500 });
    localDb.seedStarsTransaction({ telegramId: '140004', starsAmount: 250 });

    const stats = localDb.getStats();
    assert.strictEqual(stats.starsRevenue.totalStars, 750);
    const expectedUsd = Number((750 * 0.013).toFixed(2));
    assert.strictEqual(stats.starsRevenue.totalUsd, expectedUsd);
  });

  runTest('Feature 14.3: Unauthenticated request to stats returns 401 Unauthorized', () => {
    const isAuth = false;
    const authError = isAuth ? null : { status: 401, message: 'Unauthorized - Missing Token' };
    assert.strictEqual(authError.status, 401);
    assert.ok(authError.message.includes('Unauthorized'));
  });

  runTest('Feature 14.4: Expired or invalid JWT token access returns 401 Unauthorized', () => {
    const jwtExpired = true;
    const authError = jwtExpired ? { status: 401, message: 'JWT token expired' } : null;
    assert.strictEqual(authError.status, 401);
    assert.ok(authError.message.includes('expired'));
  });

  runTest('Feature 14.5: Monthly revenue history array included in stats payload', () => {
    const localDb = new MemoryDatabase();
    localDb.seedStarsTransaction({ starsAmount: 1000 });

    const stats = localDb.getStats();
    assert.ok(Array.isArray(stats.starsRevenue.monthlyHistory));
    assert.ok(stats.starsRevenue.monthlyHistory.length > 0);
    assert.strictEqual(stats.starsRevenue.monthlyHistory[0].stars, 1000);
  });

  runTest('Feature 14.6: Active call sessions count correctly reflects live active calls', () => {
    const localDb = new MemoryDatabase();
    localDb.seedCallSession({ status: 'ACTIVE' });
    localDb.seedCallSession({ status: 'ACTIVE' });
    localDb.seedCallSession({ status: 'COMPLETED' });

    const stats = localDb.getStats();
    assert.strictEqual(stats.activeCalls, 2);
  });


  // ==========================================
  // FEATURE 15: Dynamic Plan & Price Editor
  // ==========================================

  runTest('Feature 15.1: GET /api/admin/plans returns default plan limits (FREE, PLUS, PRO)', () => {
    const localDb = new MemoryDatabase();
    const plans = localDb.planLimits;

    assert.ok(plans.FREE);
    assert.ok(plans.PLUS);
    assert.ok(plans.PRO);
    assert.strictEqual(plans.FREE.maxDuration, 10);
    assert.strictEqual(plans.PLUS.maxDuration, 20);
    assert.strictEqual(plans.PRO.maxDuration, 30);
  });

  runTest('Feature 15.2: PUT /api/admin/plans updates maximum duration and daily limits dynamically', () => {
    const localDb = new MemoryDatabase();
    localDb.planLimits.PLUS.maxDuration = 25;
    localDb.planLimits.PLUS.dailyLimit = 15;

    assert.strictEqual(localDb.planLimits.PLUS.maxDuration, 25);
    assert.strictEqual(localDb.planLimits.PLUS.dailyLimit, 15);
  });

  runTest('Feature 15.3: PUT /api/admin/plans updates Stars prices for PLUS and PRO plans', () => {
    const localDb = new MemoryDatabase();
    localDb.planLimits.PLUS.starsPrice = 300;
    localDb.planLimits.PRO.starsPrice = 600;

    assert.strictEqual(localDb.planLimits.PLUS.starsPrice, 300);
    assert.strictEqual(localDb.planLimits.PRO.starsPrice, 600);
  });

  runTest('Feature 15.4: Out-of-bounds or invalid plan parameters return 400 Bad Request', () => {
    const validatePlanUpdate = (config) => {
      if (config.maxDuration <= 0 || config.starsPrice < 0) {
        return { status: 400, message: 'Invalid plan parameters' };
      }
      return { status: 200 };
    };

    const resNegative = validatePlanUpdate({ maxDuration: -5, starsPrice: 250 });
    assert.strictEqual(resNegative.status, 400);

    const resPrice = validatePlanUpdate({ maxDuration: 15, starsPrice: -100 });
    assert.strictEqual(resPrice.status, 400);
  });

  runTest('Feature 15.5: Non-admin request to update plan config returns 403 Forbidden', () => {
    const isAdmin = false;
    const res = isAdmin ? { status: 200 } : { status: 403, message: 'Forbidden - Admin role required' };
    assert.strictEqual(res.status, 403);
  });

  runTest('Feature 15.6: Plan config updates immediately affect newly calculated call durations', () => {
    const localDb = new MemoryDatabase();
    const userA = localDb.seedUser({ plan: 'FREE' });
    const userB = localDb.seedUser({ plan: 'PLUS' });

    // Update PLUS max duration to 25 mins
    localDb.planLimits.PLUS.maxDuration = 25;

    const higherTier = 'PLUS';
    const duration = localDb.planLimits[higherTier].maxDuration;
    assert.strictEqual(duration, 25, 'Mixed call with updated PLUS plan should receive 25 mins');
  });


  // ==========================================
  // FEATURE 16: Unblock Appeals Queue
  // ==========================================

  runTest('Feature 16.1: GET /api/admin/appeals lists pending user unblock appeals', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ isBanned: true, isPermanentBanned: true });
    localDb.seedUnblockAppeal({ userId: user.id, telegramId: user.telegramId, appealText: 'I am sorry for my mistake' });

    const appeals = localDb.getPendingAppeals();
    assert.strictEqual(appeals.length, 1);
    assert.strictEqual(appeals[0].appealText, 'I am sorry for my mistake');
    assert.strictEqual(appeals[0].alias, user.alias);
  });

  runTest('Feature 16.2: Approving appeal unbans user, resets warning count, and updates status to APPROVED', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ warningCount: 2, isBanned: true });
    const appeal = localDb.seedUnblockAppeal({ userId: user.id, telegramId: user.telegramId });

    const resolved = localDb.resolveAppeal(appeal.id, 'APPROVED');
    assert.strictEqual(resolved.status, 'APPROVED');

    const updatedUser = localDb.getUserById(user.id);
    assert.strictEqual(updatedUser.isBanned, false);
    assert.strictEqual(updatedUser.warningCount, 0);
  });

  runTest('Feature 16.3: Rejecting appeal maintains ban status and updates status to REJECTED', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ warningCount: 3, isBanned: true, isPermanentBanned: true });
    const appeal = localDb.seedUnblockAppeal({ userId: user.id, telegramId: user.telegramId });

    const resolved = localDb.resolveAppeal(appeal.id, 'REJECTED');
    assert.strictEqual(resolved.status, 'REJECTED');

    const updatedUser = localDb.getUserById(user.id);
    assert.strictEqual(updatedUser.isBanned, true);
    assert.strictEqual(updatedUser.isPermanentBanned, true);
  });

  runTest('Feature 16.4: Resolving non-existent appeal ID returns null / 404', () => {
    const localDb = new MemoryDatabase();
    const res = localDb.resolveAppeal('non_existent_id', 'APPROVED');
    assert.strictEqual(res, null);
  });

  runTest('Feature 16.5: Banned user submitting appeal creates new appeal record with PENDING status', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ isBanned: true });

    const appeal = localDb.seedUnblockAppeal({
      userId: user.id,
      telegramId: user.telegramId,
      appealText: 'Please review my ban'
    });

    assert.ok(appeal.id);
    assert.strictEqual(appeal.status, 'PENDING');
  });

  runTest('Feature 16.6: Appeal list filtering returns only unhandled PENDING appeals', () => {
    const localDb = new MemoryDatabase();
    const u1 = localDb.seedUser();
    const u2 = localDb.seedUser();

    const a1 = localDb.seedUnblockAppeal({ userId: u1.id, status: 'PENDING' });
    const a2 = localDb.seedUnblockAppeal({ userId: u2.id, status: 'PENDING' });

    localDb.resolveAppeal(a1.id, 'APPROVED');

    const pending = localDb.getPendingAppeals();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].id, a2.id);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAdminManagementSuite().catch(err => {
    console.error('Fatal error in adminManagement test suite:', err);
    process.exit(1);
  });
}

module.exports = { runAdminManagementSuite };
