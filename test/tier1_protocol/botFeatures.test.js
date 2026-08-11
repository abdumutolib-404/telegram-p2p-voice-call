/**
 * test/tier1_protocol/botFeatures.test.js
 * Tier 1 Protocol Test Suite for Bot Features (Features 1, 2, 3, 8).
 */

const assert = require('assert');
const { generateInitData } = require('../harness/webappAuth');
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

async function runBotFeaturesSuite() {
  console.log('--- Running Tier 1 Bot Features Test Suite (Features 1, 2, 3, 8) ---');

  // ==========================================
  // FEATURE 1: Onboarding & Sub-scores
  // ==========================================

  runTest('Feature 1.1: Valid sub-scores onboarding creates user, calculates band, and locks alias', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const subscores = { FC: 6.5, LR: 7.0, GRA: 6.0, P: 6.5 };
    const res = bot.simulateStartOnboarding('100001', subscores);

    assert.ok(res.user, 'User should be created');
    assert.strictEqual(res.user.telegramId, '100001');
    assert.strictEqual(res.user.band, 6.5, 'Band should average (6.5+7.0+6.0+6.5)/4 = 6.5');
    assert.ok(res.user.alias.startsWith('IELTS_Partner_'), 'Alias should follow template');
    assert.strictEqual(res.user.plan, 'FREE');
    assert.ok(res.message.text.includes('Welcome to IELTS Speaking P2P'));
  });

  runTest('Feature 1.2: Out of range sub-scores (<5.0 or >9.0) are rejected', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    // Score < 5.0
    const resLow = bot.simulateStartOnboarding('100002', { FC: 4.5, LR: 6.5, GRA: 6.5, P: 6.5 });
    assert.strictEqual(resLow.user, null);
    assert.ok(resLow.error.includes('Must be between 5.0 and 9.0'));

    // Score > 9.0
    const resHigh = bot.simulateStartOnboarding('100002', { FC: 9.5, LR: 6.5, GRA: 6.5, P: 6.5 });
    assert.strictEqual(resHigh.user, null);
    assert.ok(resHigh.error.includes('Must be between 5.0 and 9.0'));
  });

  runTest('Feature 1.3: Missing required sub-score field returns error', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const resMissing = bot.simulateStartOnboarding('100003', { FC: 6.5, LR: 6.5, GRA: 6.5 });
    assert.strictEqual(resMissing.user, null);
    assert.ok(resMissing.error.includes('Invalid P sub-score'));
  });

  runTest('Feature 1.4: Re-running onboarding updates scores/band but preserves locked alias', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const initial = bot.simulateStartOnboarding('100004', { FC: 6.0, LR: 6.0, GRA: 6.0, P: 6.0 });
    const originalAlias = initial.user.alias;
    assert.strictEqual(initial.user.band, 6.0);

    const updated = bot.simulateStartOnboarding('100004', { FC: 7.0, LR: 7.5, GRA: 7.0, P: 6.5 });
    assert.strictEqual(updated.user.alias, originalAlias, 'Alias must remain locked');
    assert.strictEqual(updated.user.band, 7.0, 'Band should update to 7.0');
  });

  runTest('Feature 1.5: Band calculation rounds average of sub-scores to 1 decimal place', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    // (6.5 + 6.0 + 7.0 + 6.0) / 4 = 6.375 -> 6.4
    const res = bot.simulateStartOnboarding('100005', { FC: 6.5, LR: 6.0, GRA: 7.0, P: 6.0 });
    assert.strictEqual(res.user.band, 6.4);
  });

  runTest('Feature 1.6: Boundary score values (5.0 and 9.0) are accepted', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const minRes = bot.simulateStartOnboarding('100006', { FC: 5.0, LR: 5.0, GRA: 5.0, P: 5.0 });
    assert.strictEqual(minRes.user.band, 5.0);

    const maxRes = bot.simulateStartOnboarding('100007', { FC: 9.0, LR: 9.0, GRA: 9.0, P: 9.0 });
    assert.strictEqual(maxRes.user.band, 9.0);
  });


  // ==========================================
  // FEATURE 2: Telegram Interactive Menu
  // ==========================================

  runTest('Feature 2.1: Onboarding message contains inline menu keyboard with all 6 options', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const res = bot.simulateStartOnboarding('200001');
    const keyboard = res.message.reply_markup.inline_keyboard;
    
    assert.strictEqual(keyboard.length, 4, 'Keyboard should have 4 rows');
    assert.ok(keyboard[0][0].text.includes('Find Partner'));
    assert.ok(keyboard[1][0].text.includes('Profile'));
    assert.ok(keyboard[1][1].text.includes('Recordings'));
    assert.ok(keyboard[2][0].text.includes('Plans'));
    assert.ok(keyboard[2][1].text.includes('Direct Call'));
    assert.ok(keyboard[3][0].text.includes('Support'));
  });

  runTest('Feature 2.2: Profile callback (cb_profile) displays user sub-scores, alias, plan, and DND status', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });
    bot.simulateStartOnboarding('200002');

    const msg = bot.simulateCallbackQuery('200002', 'cb_profile');
    assert.ok(msg.text.includes('Profile Info'));
    assert.ok(msg.text.includes('Band: 6.5'));
    assert.ok(msg.text.includes('Plan: FREE'));
    assert.ok(msg.text.includes('DND Mode: OFF'));
  });

  runTest('Feature 2.3: Recordings callback (cb_recordings) renders past recording links', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });
    bot.simulateStartOnboarding('200003');

    const msg = bot.simulateCallbackQuery('200003', 'cb_recordings');
    assert.ok(msg.text.includes('Past Audio Recordings'));
    assert.ok(msg.text.includes('Listen: https://'));
  });

  runTest('Feature 2.4: Plans callback (cb_plans) renders Plus and Pro upgrade invoice buttons', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });
    bot.simulateStartOnboarding('200004');

    const msg = bot.simulateCallbackQuery('200004', 'cb_plans');
    assert.ok(msg.text.includes('Upgrade Subscription Plans'));
    const buttons = msg.reply_markup.inline_keyboard;
    assert.strictEqual(buttons[0][0].callback_data, 'buy_plan_PLUS');
    assert.strictEqual(buttons[1][0].callback_data, 'buy_plan_PRO');
  });

  runTest('Feature 2.5: Direct Call callback (cb_direct_call) displays favorites list', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });
    bot.simulateStartOnboarding('200005');

    const msg = bot.simulateCallbackQuery('200005', 'cb_direct_call');
    assert.ok(msg.text.includes('Direct Call Favorites'));
  });

  runTest('Feature 2.6: Support callback (cb_support) displays help & unblock appeal instructions', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });
    bot.simulateStartOnboarding('200006');

    const msg = bot.simulateCallbackQuery('200006', 'cb_support');
    assert.ok(msg.text.includes('Support & Help'));
  });


  // ==========================================
  // FEATURE 3: Post-Call Rating & Reports
  // ==========================================

  runTest('Feature 3.1: Post-call review card includes 1-5 star rating buttons and report button', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });
    
    const session = localDb.seedCallSession();
    const msg = bot.sendPostCallReview('300001', {
      sessionId: session.id,
      partnerAlias: 'IELTS_Partner_1234',
      partnerId: 'usr_partner',
      recordingPath: '/recordings/rec_1.mp4'
    });

    const rows = msg.reply_markup.inline_keyboard;
    assert.strictEqual(rows[0].length, 5, 'Should have 5 star rating buttons');
    assert.strictEqual(rows[0][0].callback_data, `rate_${session.id}_1`);
    assert.strictEqual(rows[0][4].callback_data, `rate_${session.id}_5`);
    assert.ok(rows[1][0].text.includes('Report Partner'));
  });

  runTest('Feature 3.2: 5-star call rating records positive rating in DB', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const user = localDb.seedUser({ telegramId: '300002' });
    const partner = localDb.seedUser({ telegramId: '300003' });
    const session = localDb.seedCallSession({ callerId: user.id, calleeId: partner.id });

    const rating = bot.simulatePostCallRating(user.id, { sessionId: session.id, partnerId: partner.id }, 5);
    assert.strictEqual(rating.rating, 5);
    assert.strictEqual(rating.reported, false);
    assert.strictEqual(rating.targetUserId, partner.id);
  });

  runTest('Feature 3.3: Low rating (<=2 stars) automatically sets reported status to true', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const user = localDb.seedUser({ telegramId: '300004' });
    const partner = localDb.seedUser({ telegramId: '300005' });
    const session = localDb.seedCallSession({ callerId: user.id, calleeId: partner.id });

    const rating = bot.simulatePostCallRating(user.id, { sessionId: session.id, partnerId: partner.id }, 2);
    assert.strictEqual(rating.rating, 2);
    assert.strictEqual(rating.reported, true);
  });

  runTest('Feature 3.4: Explicit partner report applies 1st report warning to target user', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const user = localDb.seedUser({ telegramId: '300006' });
    const partner = localDb.seedUser({ telegramId: '300007', warningCount: 0 });
    const session = localDb.seedCallSession({ callerId: user.id, calleeId: partner.id });

    bot.simulatePostCallRating(user.id, { sessionId: session.id, partnerId: partner.id }, 1, 'Audio glitch & bad language');

    const updatedPartner = localDb.getUserById(partner.id);
    assert.strictEqual(updatedPartner.warningCount, 1, 'Target user warning count should increase to 1');
    assert.ok(updatedPartner.warningNotice, 'Target user should receive warning notice');
  });

  runTest('Feature 3.5: Post-call summary message indicates recording status when available', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const msgAvailable = bot.sendPostCallReview('300008', {
      sessionId: 'sess_1', partnerAlias: 'Alias_X', recordingPath: '/recordings/rec_1.mp4'
    });
    assert.ok(msgAvailable.text.includes('Recording: Available'));

    const msgProcessing = bot.sendPostCallReview('300009', {
      sessionId: 'sess_2', partnerAlias: 'Alias_Y', recordingPath: null
    });
    assert.ok(msgProcessing.text.includes('Recording: Processing'));
  });

  runTest('Feature 3.6: Rating submission persists in DB ratings table', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const session = localDb.seedCallSession();
    const rating = bot.simulatePostCallRating('usr_rev', { sessionId: session.id, partnerId: 'usr_tgt' }, 4);

    assert.strictEqual(localDb.callRatings.has(rating.id), true);
    assert.strictEqual(localDb.callRatings.get(rating.id).rating, 4);
  });


  // ==========================================
  // FEATURE 8: Telegram Stars Payments
  // ==========================================

  runTest('Feature 8.1: Stars invoice generation for PLUS tier sets amount to 250 Stars and currency XTR', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const res = bot.simulateStarsInvoice('800001', 'PLUS');
    assert.strictEqual(res.invoice.currency, 'XTR');
    assert.strictEqual(res.invoice.prices[0].amount, 250);
    assert.ok(res.invoice.title.includes('PLUS'));
  });

  runTest('Feature 8.2: Stars invoice generation for PRO tier sets amount to 500 Stars', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const res = bot.simulateStarsInvoice('800002', 'PRO');
    assert.strictEqual(res.invoice.prices[0].amount, 500);
    assert.ok(res.invoice.title.includes('PRO'));
  });

  runTest('Feature 8.3: Pre-checkout query with valid PLUS/PRO payload succeeds', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const resPlus = bot.simulatePreCheckoutQuery('800003', { planTier: 'PLUS' });
    assert.strictEqual(resPlus.ok, true);

    const resPro = bot.simulatePreCheckoutQuery('800003', { planTier: 'PRO' });
    assert.strictEqual(resPro.ok, true);
  });

  runTest('Feature 8.4: Pre-checkout query with invalid payload fails', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const resInvalid = bot.simulatePreCheckoutQuery('800004', { planTier: 'INVALID_TIER' });
    assert.strictEqual(resInvalid.ok, false);
    assert.ok(resInvalid.error_message.includes('Invalid plan tier payload'));
  });

  runTest('Feature 8.5: Successful payment upgrades user plan and records transaction', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const user = localDb.seedUser({ telegramId: '800005', plan: 'FREE' });
    const payRes = bot.simulateSuccessfulPayment('800005', { planTier: 'PRO', amount: 500 });

    assert.strictEqual(payRes.success, true);
    assert.strictEqual(payRes.transaction.starsAmount, 500);
    assert.strictEqual(payRes.transaction.planTier, 'PRO');

    const updatedUser = localDb.getUserById(user.id);
    assert.strictEqual(updatedUser.plan, 'PRO', 'User plan must upgrade to PRO');
  });

  runTest('Feature 8.6: Revenue metrics reflect accumulated Telegram Stars transactions', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    localDb.seedUser({ telegramId: '800006' });
    localDb.seedUser({ telegramId: '800007' });

    bot.simulateSuccessfulPayment('800006', { planTier: 'PLUS', amount: 250 });
    bot.simulateSuccessfulPayment('800007', { planTier: 'PRO', amount: 500 });

    const stats = localDb.getStats();
    assert.strictEqual(stats.starsRevenue.totalStars, 750);
    assert.strictEqual(stats.starsRevenue.totalUsd, Number((750 * 0.013).toFixed(2)));
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runBotFeaturesSuite().catch(err => {
    console.error('Fatal error in botFeatures test suite:', err);
    process.exit(1);
  });
}

module.exports = { runBotFeaturesSuite };
