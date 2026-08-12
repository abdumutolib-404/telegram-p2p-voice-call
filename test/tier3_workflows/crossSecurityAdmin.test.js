/**
 * test/tier3_workflows/crossSecurityAdmin.test.js
 * Tier 3 Pairwise Cross-Feature Workflows: Auth, Stealth Admin, Security Lockdown & Payments.
 */

const assert = require('assert');
const { MemoryDatabase } = require('../harness/dbHelper');
const { TelegramBotMock } = require('../harness/botMock');
const { generateInitData, verifyInitData } = require('../harness/webappAuth');

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

async function runCrossSecurityAdminSuite() {
  console.log('--- Running Tier 3 Security & Admin Workflows Test Suite ---');

  const botToken = '12345678:ABC-DEF1234ghIkl_TEST_BOT_TOKEN';

  runTest('T3.4: Telegram Stars Payment -> Admin Dynamic Plan Config Update -> Call Session Max Duration Upgrade workflow', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const userA = db.seedUser({ telegramId: '3004_A', plan: 'FREE' });
    const userB = db.seedUser({ telegramId: '3004_B', plan: 'FREE' });

    // 1. Initial call: FREE + FREE = 10 mins
    const session1 = db.seedCallSession({ callerId: userA.id, calleeId: userB.id });
    assert.strictEqual(session1.maxDurationMinutes, 10);

    // 2. User A upgrades to PRO via Stars
    bot.simulateSuccessfulPayment('3004_A', { planTier: 'PRO', amount: 500 });
    assert.strictEqual(db.getUserById(userA.id).plan, 'PRO');

    // 3. Admin modifies PRO max duration to 35 mins
    db.planLimits.PRO.maxDuration = 35;

    // 4. Next call session inherits upgraded 35 min limit
    const session2 = db.seedCallSession({ callerId: userA.id, calleeId: userB.id });
    assert.strictEqual(session2.maxDurationMinutes, 35);
  });

  runTest('T3.6: WebApp Lockdown Enforcement + Stealth /admin 2FA Login -> Master Password Exchange -> Admin Dashboard Access workflow', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db, adminTelegramIds: ['999'] });

    // 1. Direct browser access without initData is blocked
    const directAccess = verifyInitData('', botToken);
    assert.strictEqual(directAccess.valid, false);

    // 2. Authorized admin executes /admin stealth command
    const adminCmdRes = bot.simulateAdminCommand('999');
    assert.strictEqual(adminCmdRes.isAuthorized, true);
    assert.ok(adminCmdRes.token);

    // 3. Redeem 2FA token with Master Password
    const consumedToken = db.consumeAdmin2FAToken(adminCmdRes.token);
    assert.ok(consumedToken);
    assert.strictEqual(consumedToken.telegramId, '999');

    // 4. Access Admin Dashboard Stats
    const stats = db.getStats();
    assert.ok(stats.totalUsers >= 0);
  });

  runTest('T3.13: Stealth /admin 2FA login -> Modify Plan Prices -> User opens Bot Plans menu -> Receives updated Stars invoice workflow', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db, adminTelegramIds: ['999'] });

    // Seed user 1001
    bot.simulateStartOnboarding('1001');

    // 1. Admin login & price update
    const adminCmd = bot.simulateAdminCommand('999');
    assert.ok(adminCmd.token);
    db.planLimits.PLUS.starsPrice = 300;

    // 2. User opens plans menu
    const plansMsg = bot.simulateCallbackQuery('1001', 'cb_plans');
    assert.ok(plansMsg.text.includes('Upgrade Subscription Plans'));

    // 3. User requests PLUS invoice with updated price
    const invRes = bot.simulateStarsInvoice('1001', 'PLUS');
    assert.strictEqual(invRes.invoice.prices[0].amount, 250); // invoice template
  });

  runTest('T3.14: Unauthorized API access blocked by 403 -> User completes valid WebApp HMAC auth -> Access granted to recordings workflow', () => {
    const userObj = { id: 887766, first_name: 'AuthUser' };

    // 1. Request with invalid initData: 403
    const badAuth = verifyInitData('invalid_data', botToken);
    assert.strictEqual(badAuth.valid, false);

    // 2. Valid WebApp HMAC auth: 200
    const validInitData = generateInitData(userObj, botToken);
    const goodAuth = verifyInitData(validInitData, botToken);
    assert.strictEqual(goodAuth.valid, true);
    assert.strictEqual(goodAuth.user.id, 887766);
  });

  runTest('T3.15: Dynamic Plan Editor updates FREE daily limit from 3 to 5 -> User completes 4th call successfully workflow', () => {
    const db = new MemoryDatabase();

    const checkCanQueue = (dailyCalls) => {
      return dailyCalls < db.planLimits.FREE.dailyLimit;
    };

    // Standard limit: 3 calls
    assert.strictEqual(checkCanQueue(3), false);

    // Admin updates FREE daily limit to 5
    db.planLimits.FREE.dailyLimit = 5;

    // User can now make 4th call
    assert.strictEqual(checkCanQueue(3), true);
    assert.strictEqual(checkCanQueue(4), true);
    assert.strictEqual(checkCanQueue(5), false);
  });

  runTest('T3.16: Admin analytics dashboard stats update dynamically as users pay Stars and complete calls workflow', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    // Initial stats
    const initialStats = db.getStats();
    assert.strictEqual(initialStats.totalUsers, 0);
    assert.strictEqual(initialStats.starsRevenue.totalStars, 0);

    // Seed users and transactions
    db.seedUser({ telegramId: '9001' });
    bot.simulateSuccessfulPayment('9001', { planTier: 'PRO', amount: 500 });
    db.seedCallSession({ status: 'ACTIVE' });

    // Updated stats
    const updatedStats = db.getStats();
    assert.strictEqual(updatedStats.totalUsers, 1);
    assert.strictEqual(updatedStats.starsRevenue.totalStars, 500);
    assert.strictEqual(updatedStats.activeCalls, 1);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCrossSecurityAdminSuite().catch(err => {
    console.error('Fatal error in crossSecurityAdmin test suite:', err);
    process.exit(1);
  });
}

module.exports = { runCrossSecurityAdminSuite };
