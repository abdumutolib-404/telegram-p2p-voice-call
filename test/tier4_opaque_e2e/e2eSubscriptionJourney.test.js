/**
 * test/tier4_opaque_e2e/e2eSubscriptionJourney.test.js
 * Tier 4 Opaque-Box E2E Test: Subscription Upgrade & Mixed-Plan Journey.
 */

const assert = require('assert');
const { MemoryDatabase, resolveMixedPlanDuration } = require('../harness/dbHelper');
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

async function runE2ESubscriptionJourneySuite() {
  console.log('--- Running Tier 4 E2E Subscription Journey Test Suite ---');

  runTest('T4.2.1: Subscription Upgrade & Mixed-Plan Extended Session Journey', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    // Step 1: User A (FREE) and User B (PRO) onboard
    const uA = bot.simulateStartOnboarding('4201', { FC: 6.5, LR: 6.5, GRA: 6.5, P: 6.5 });
    const uB = bot.simulateStartOnboarding('4202', { FC: 6.5, LR: 6.5, GRA: 6.5, P: 6.5 });

    db.updateUser(uB.user.id, { plan: 'PRO' });

    // Step 2: Match into call session - inherits PRO's 30-min duration limit
    const session1 = db.seedCallSession({ callerId: uA.user.id, calleeId: uB.user.id });
    assert.strictEqual(session1.maxDurationMinutes, 30);

    // Step 3: User A decides to upgrade to PLUS via Telegram Stars Invoice
    const invoiceRes = bot.simulateStarsInvoice('4201', 'PLUS');
    assert.strictEqual(invoiceRes.invoice.prices[0].amount, 250);

    // Pre-checkout validation
    const preCheckout = bot.simulatePreCheckoutQuery('4201', invoiceRes.invoice.payload);
    assert.strictEqual(preCheckout.ok, true);

    // Successful payment callback
    const payRes = bot.simulateSuccessfulPayment('4201', invoiceRes.invoice.payload);
    assert.strictEqual(payRes.success, true);
    assert.strictEqual(db.getUserById(uA.user.id).plan, 'PLUS');

    // Step 4: Admin analytics stats update automatically
    const stats = db.getStats();
    assert.strictEqual(stats.starsRevenue.totalStars, 250);
    assert.strictEqual(stats.starsRevenue.totalUsd, Number((250 * 0.013).toFixed(2)));
  });

  runTest('T4.2.2: Plus Tier Upgrade & Extended Storage Retention Journey', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    // Step 1: User onboards as FREE
    const user = bot.simulateStartOnboarding('4210', { FC: 7.0, LR: 7.0, GRA: 7.0, P: 7.0 });

    // Step 2: Upgrade to PLUS (7 days retention)
    bot.simulateSuccessfulPayment('4210', { planTier: 'PLUS', amount: 250 });
    assert.strictEqual(db.getUserById(user.user.id).plan, 'PLUS');

    // Step 3: Session recorded 3 days ago (would expire under FREE 1-day policy, preserved under PLUS 7-day)
    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
    const expireIn4Days = new Date(Date.now() + 4 * 86400 * 1000);

    const session = db.seedCallSession({
      callerId: user.user.id,
      recordingPath: '/recordings/plus_retention.mp4',
      recordingExpiresAt: expireIn4Days
    });

    // Step 4: Storage purge runs today -> recording preserved
    const purgeToday = db.purgeExpiredRecordings(new Date());
    assert.strictEqual(purgeToday.purgedCount, 0);
    assert.strictEqual(db.getCallSession(session.id).recordingPath, '/recordings/plus_retention.mp4');

    // Step 5: Storage purge runs 5 days in future -> recording purged
    const fiveDaysLater = new Date(Date.now() + 5 * 86400 * 1000);
    const purgeFuture = db.purgeExpiredRecordings(fiveDaysLater);
    assert.strictEqual(purgeFuture.purgedCount, 1);
    assert.strictEqual(db.getCallSession(session.id).recordingPath, null);
  });

  runTest('T4.2.3: Pro Tier Full Upgrade Journey (FREE -> PLUS -> PRO)', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db });

    const user = bot.simulateStartOnboarding('4220', { FC: 8.0, LR: 8.0, GRA: 8.0, P: 8.0 });
    assert.strictEqual(db.getUserById(user.user.id).plan, 'FREE');

    // Upgrade 1: PLUS
    bot.simulateSuccessfulPayment('4220', { planTier: 'PLUS', amount: 250 });
    assert.strictEqual(db.getUserById(user.user.id).plan, 'PLUS');

    // Upgrade 2: PRO
    bot.simulateSuccessfulPayment('4220', { planTier: 'PRO', amount: 500 });
    assert.strictEqual(db.getUserById(user.user.id).plan, 'PRO');

    // PRO tier benefits verified
    const proLimits = db.planLimits.PRO;
    assert.strictEqual(proLimits.maxDuration, 30);
    assert.strictEqual(proLimits.dailyLimit, 999);
    assert.strictEqual(proLimits.retentionDays, 30);

    const stats = db.getStats();
    assert.strictEqual(stats.starsRevenue.totalStars, 750);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runE2ESubscriptionJourneySuite().catch(err => {
    console.error('Fatal error in e2eSubscriptionJourney test suite:', err);
    process.exit(1);
  });
}

module.exports = { runE2ESubscriptionJourneySuite };
