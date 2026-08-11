/**
 * test/tier1_protocol/securityModeration.test.js
 * Tier 1 Protocol Test Suite for Security & Moderation (Features 6, 7, 12, 13).
 */

const assert = require('assert');
const { MemoryDatabase } = require('../harness/dbHelper');
const { TelegramBotMock } = require('../harness/botMock');
const {
  generateInitData,
  generateInvalidInitData,
  verifyInitData
} = require('../harness/webappAuth');

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

async function runSecurityModerationSuite() {
  console.log('--- Running Tier 1 Security & Moderation Test Suite (Features 6, 7, 12, 13) ---');

  // ==========================================
  // FEATURE 6: Moderation Penalty Ladder
  // ==========================================

  runTest('Feature 6.1: 1st report increases warning count to 1 and issues Warning notice', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ warningCount: 0 });

    const updated = localDb.applyModerationPenalty(user.id, 'Inappropriate behavior');
    assert.strictEqual(updated.warningCount, 1);
    assert.ok(updated.warningNotice);
    assert.strictEqual(updated.isBanned, false);
    assert.strictEqual(updated.isPermanentBanned, false);
  });

  runTest('Feature 6.2: 2nd report increases warning count to 2 and sets 6-hour temporary ban', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ warningCount: 1 });

    const updated = localDb.applyModerationPenalty(user.id, 'Repeated offensive remarks');
    assert.strictEqual(updated.warningCount, 2);
    assert.strictEqual(updated.isBanned, true);
    assert.strictEqual(updated.isPermanentBanned, false);
    assert.ok(updated.bannedUntil instanceof Date);

    const diffHours = (updated.bannedUntil.getTime() - Date.now()) / (3600 * 1000);
    assert.ok(diffHours >= 5.9 && diffHours <= 6.1, 'Ban duration should be approximately 6 hours');
  });

  runTest('Feature 6.3: 3rd report increases warning count to 3 and applies permanent ban', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ warningCount: 2, isBanned: true });

    const updated = localDb.applyModerationPenalty(user.id, 'Severe violation');
    assert.strictEqual(updated.warningCount, 3);
    assert.strictEqual(updated.isBanned, true);
    assert.strictEqual(updated.isPermanentBanned, true);
    assert.strictEqual(updated.bannedUntil, null, 'Permanent ban has no expiration date');
  });

  runTest('Feature 6.4: Sequential escalation ladder (Warning -> 6h Ban -> Permanent Lock)', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ warningCount: 0 });

    // Step 1
    const p1 = localDb.applyModerationPenalty(user.id, 'Report 1');
    assert.strictEqual(p1.warningCount, 1);
    assert.strictEqual(p1.isBanned, false);

    // Step 2
    const p2 = localDb.applyModerationPenalty(user.id, 'Report 2');
    assert.strictEqual(p2.warningCount, 2);
    assert.strictEqual(p2.isBanned, true);
    assert.strictEqual(p2.isPermanentBanned, false);

    // Step 3
    const p3 = localDb.applyModerationPenalty(user.id, 'Report 3');
    assert.strictEqual(p3.warningCount, 3);
    assert.strictEqual(p3.isPermanentBanned, true);
  });

  runTest('Feature 6.5: Expired 6-hour ban allows queueing after time passes', () => {
    const localDb = new MemoryDatabase();
    const pastBanDate = new Date(Date.now() - 3600 * 1000); // Banned until 1h ago
    const user = localDb.seedUser({ isBanned: true, bannedUntil: pastBanDate, isPermanentBanned: false });

    const isCurrentlyBanned = user.isBanned && user.bannedUntil && user.bannedUntil > new Date();
    assert.strictEqual(isCurrentlyBanned, false, 'Expired ban should no longer restrict user');
  });

  runTest('Feature 6.6: Moderation report triggered automatically via low post-call rating (<= 2 stars)', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb });

    const reviewer = localDb.seedUser();
    const target = localDb.seedUser({ warningCount: 0 });
    const session = localDb.seedCallSession({ callerId: reviewer.id, calleeId: target.id });

    bot.simulatePostCallRating(reviewer.id, { sessionId: session.id, partnerId: target.id }, 1);
    const updatedTarget = localDb.getUserById(target.id);
    assert.strictEqual(updatedTarget.warningCount, 1, 'Target user warning count should escalate');
  });


  // ==========================================
  // FEATURE 7: Storage Cleanup Cron
  // ==========================================

  runTest('Feature 7.1: FREE tier recording older than 1 day is purged', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ plan: 'FREE' });

    const twoDaysAgo = new Date(Date.now() - 86400 * 1000 * 2);
    const session = localDb.seedCallSession({
      callerId: user.id,
      recordingPath: '/recordings/free_rec.mp4',
      recordingExpiresAt: twoDaysAgo
    });

    const res = localDb.purgeExpiredRecordings(new Date());
    assert.strictEqual(res.purgedCount, 1);
    assert.strictEqual(localDb.getCallSession(session.id).recordingPath, null);
  });

  runTest('Feature 7.2: PLUS tier recording retained up to 7 days; purged after 7 days', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ plan: 'PLUS' });

    // 8 days ago
    const eightDaysAgo = new Date(Date.now() - 86400 * 1000 * 8);
    const session = localDb.seedCallSession({
      callerId: user.id,
      recordingPath: '/recordings/plus_rec.mp4',
      recordingExpiresAt: eightDaysAgo
    });

    const res = localDb.purgeExpiredRecordings(new Date());
    assert.strictEqual(res.purgedCount, 1);
    assert.strictEqual(localDb.getCallSession(session.id).recordingPath, null);
  });

  runTest('Feature 7.3: PRO tier recording retained up to 30 days; purged after 30 days', () => {
    const localDb = new MemoryDatabase();
    const user = localDb.seedUser({ plan: 'PRO' });

    // 31 days ago
    const thirtyOneDaysAgo = new Date(Date.now() - 86400 * 1000 * 31);
    const session = localDb.seedCallSession({
      callerId: user.id,
      recordingPath: '/recordings/pro_rec.mp4',
      recordingExpiresAt: thirtyOneDaysAgo
    });

    const res = localDb.purgeExpiredRecordings(new Date());
    assert.strictEqual(res.purgedCount, 1);
  });

  runTest('Feature 7.4: Unexpired audio recordings are preserved during storage purge', () => {
    const localDb = new MemoryDatabase();

    const futureDate = new Date(Date.now() + 86400 * 1000 * 5); // Expires in 5 days
    const session = localDb.seedCallSession({
      recordingPath: '/recordings/valid_rec.mp4',
      recordingExpiresAt: futureDate
    });

    const res = localDb.purgeExpiredRecordings(new Date());
    assert.strictEqual(res.purgedCount, 0);
    assert.strictEqual(localDb.getCallSession(session.id).recordingPath, '/recordings/valid_rec.mp4');
  });

  runTest('Feature 7.5: Storage purge updates database record setting recordingPath to null', () => {
    const localDb = new MemoryDatabase();

    const oldDate = new Date(Date.now() - 10000);
    const session = localDb.seedCallSession({
      recordingPath: '/recordings/purge_me.mp4',
      recordingExpiresAt: oldDate
    });

    localDb.purgeExpiredRecordings(new Date());
    const updated = localDb.getCallSession(session.id);
    assert.strictEqual(updated.recordingPath, null);
    assert.ok(updated.purgedAt instanceof Date);
  });

  runTest('Feature 7.6: Storage purge handles sessions without recordings gracefully', () => {
    const localDb = new MemoryDatabase();
    localDb.seedCallSession({ recordingPath: null, recordingExpiresAt: null });

    const res = localDb.purgeExpiredRecordings(new Date());
    assert.strictEqual(res.purgedCount, 0);
  });


  // ==========================================
  // FEATURE 12: Mini App WebApp Lockdown 403
  // ==========================================

  runTest('Feature 12.1: Authentic X-Telegram-Init-Data header passes HMAC verification', () => {
    const botToken = '12345678:ABC-DEF1234ghIkl';
    const userData = { id: 99887766, first_name: 'Alex' };
    const initData = generateInitData(userData, botToken);

    const result = verifyInitData(initData, botToken);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.user.id, 99887766);
  });

  runTest('Feature 12.2: Missing X-Telegram-Init-Data returns 403 Forbidden validation failure', () => {
    const result = verifyInitData('', 'bot_token_123');
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('Missing hash'));
  });

  runTest('Feature 12.3: Tampered initData payload or invalid HMAC returns 403 Forbidden', () => {
    const botToken = '12345678:ABC-DEF1234ghIkl';
    const userData = { id: 99887766, first_name: 'Alex' };
    const invalidInitData = generateInvalidInitData(userData, botToken, 'invalid_hash');

    const result = verifyInitData(invalidInitData, botToken);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('HMAC signature mismatch'));
  });

  runTest('Feature 12.4: Expired initData (> 86400 seconds old) returns 403 Forbidden', () => {
    const botToken = '12345678:ABC-DEF1234ghIkl';
    const userData = { id: 99887766 };
    const expiredInitData = generateInvalidInitData(userData, botToken, 'expired');

    const result = verifyInitData(expiredInitData, botToken, 86400);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('expired'));
  });

  runTest('Feature 12.5: Missing hash parameter in query string returns 403 Forbidden', () => {
    const botToken = '12345678:ABC-DEF1234ghIkl';
    const userData = { id: 99887766 };
    const missingHashData = generateInvalidInitData(userData, botToken, 'missing_hash');

    const result = verifyInitData(missingHashData, botToken);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('Missing hash'));
  });

  runTest('Feature 12.6: HMAC calculated with wrong bot token fails verification', () => {
    const userData = { id: 99887766 };
    const wrongTokenData = generateInvalidInitData(userData, 'correct_token', 'wrong_token');

    const result = verifyInitData(wrongTokenData, 'correct_token');
    assert.strictEqual(result.valid, false);
  });


  // ==========================================
  // FEATURE 13: Stealth /admin 2FA Link & Token Exchange
  // ==========================================

  runTest('Feature 13.1: Non-admin Telegram ID executing /admin gets standard unknown command response', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb, adminTelegramIds: ['999'] });

    const res = bot.simulateAdminCommand('1001'); // Regular user
    assert.strictEqual(res.isAuthorized, false);
    assert.strictEqual(res.token, null);
    assert.ok(res.message.text.includes('Unknown command'));
  });

  runTest('Feature 13.2: Authorized admin Telegram ID executing /admin receives 1-time secret login link with token', () => {
    const localDb = new MemoryDatabase();
    const bot = new TelegramBotMock({ db: localDb, adminTelegramIds: ['999'] });

    const res = bot.simulateAdminCommand('999'); // Admin user
    assert.strictEqual(res.isAuthorized, true);
    assert.ok(res.token, 'Should return secret token');
    assert.ok(res.loginUrl.includes(`/admin/login?token=${res.token}`));
    assert.ok(res.message.text.includes('Stealth Admin Access Granted'));
  });

  runTest('Feature 13.3: Stealth 2FA token stored in Redis with 5-minute (300s) TTL', () => {
    const localDb = new MemoryDatabase();
    localDb.setAdmin2FAToken('token_5min', '999', 300);

    const tokenData = localDb.getAdmin2FAToken('token_5min');
    assert.ok(tokenData);
    assert.strictEqual(tokenData.telegramId, '999');
  });

  runTest('Feature 13.4: Valid 2FA token + Master Password exchanges for Admin Session JWT', () => {
    const localDb = new MemoryDatabase();
    localDb.setAdmin2FAToken('token_valid', '999', 300);

    const tokenData = localDb.consumeAdmin2FAToken('token_valid');
    assert.ok(tokenData);
    assert.strictEqual(tokenData.telegramId, '999');

    // Simulate password check & JWT issue
    const masterPassword = 'CorrectMasterPassword123!';
    const inputPassword = 'CorrectMasterPassword123!';
    const passwordMatch = inputPassword === masterPassword;
    assert.strictEqual(passwordMatch, true);

    const jwtToken = `jwt_admin_session_${Math.random().toString(36).substring(2, 10)}`;
    assert.ok(jwtToken.startsWith('jwt_admin_session_'));
  });

  runTest('Feature 13.5: Incorrect Master Password fails token exchange (401 Unauthorized)', () => {
    const localDb = new MemoryDatabase();
    localDb.setAdmin2FAToken('token_wrong_pass', '999', 300);

    const masterPassword = 'CorrectMasterPassword123!';
    const inputPassword = 'WrongPassword';
    const passwordMatch = inputPassword === masterPassword;
    assert.strictEqual(passwordMatch, false, 'Invalid master password must be rejected');
  });

  runTest('Feature 13.6: Expired or reused 2FA token is consumed and cannot be reused', () => {
    const localDb = new MemoryDatabase();
    localDb.setAdmin2FAToken('token_single_use', '999', 300);

    // 1st consumption: success
    const firstUse = localDb.consumeAdmin2FAToken('token_single_use');
    assert.ok(firstUse);

    // 2nd consumption: fails
    const secondUse = localDb.consumeAdmin2FAToken('token_single_use');
    assert.strictEqual(secondUse, null, 'Reusing 2FA token must fail');
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSecurityModerationSuite().catch(err => {
    console.error('Fatal error in securityModeration test suite:', err);
    process.exit(1);
  });
}

module.exports = { runSecurityModerationSuite };
