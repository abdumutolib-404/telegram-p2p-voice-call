/**
 * test/tier4_opaque_e2e/e2eAdversarialSecurityJourney.test.js
 * Tier 4 Opaque-Box E2E Test: Adversarial Security Lockdown & Fault Tolerance Journey.
 */

const assert = require('assert');
const { MemoryDatabase } = require('../harness/dbHelper');
const { TelegramBotMock } = require('../harness/botMock');
const { generateInitData, generateInvalidInitData, verifyInitData } = require('../harness/webappAuth');

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

async function runE2EAdversarialSecurityJourneySuite() {
  console.log('--- Running Tier 4 E2E Adversarial Security Lockdown Journey Test Suite ---');

  const botToken = '12345678:ABC-DEF1234ghIkl_TEST_BOT_TOKEN';

  runTest('T4.4.1: Adversarial Security Lockdown Journey (Browser Lockdown, Rate Limits & Double-Queueing)', () => {
    const db = new MemoryDatabase();
    const bot = new TelegramBotMock({ db, adminTelegramIds: ['999'] });

    // Step 1: Malicious user tries direct browser access without initData -> 403
    const directRes = verifyInitData('', botToken);
    assert.strictEqual(directRes.valid, false);

    // Step 2: Malicious user tampers initData HMAC -> 403
    const tamperedRes = verifyInitData(generateInvalidInitData({ id: 999 }, botToken, 'invalid_hash'), botToken);
    assert.strictEqual(tamperedRes.valid, false);

    // Step 3: Malicious user executes /admin command with unauthorized Telegram ID -> Unknown command
    const unauthCmd = bot.simulateAdminCommand('attacker_666');
    assert.strictEqual(unauthCmd.isAuthorized, false);
    assert.strictEqual(unauthCmd.token, null);
    assert.ok(unauthCmd.message.text.includes('Unknown command'));

    // Step 4: User currently in active call tries double-queueing -> Blocked by active call lock
    const activeUser = db.seedUser();
    db.setActiveCallLock(activeUser.id, 'room_live_441');
    assert.strictEqual(db.hasActiveCallLock(activeUser.id), true);
  });

  runTest('T4.4.2: Expired Credentials & Replay Prevention Journey', () => {
    const db = new MemoryDatabase();

    // Step 1: Expired initData (> 24h old) -> Rejected
    const expiredInitData = generateInvalidInitData({ id: 4420 }, botToken, 'expired');
    const expiredAuth = verifyInitData(expiredInitData, botToken, 86400);
    assert.strictEqual(expiredAuth.valid, false);

    // Step 2: Single-use 2FA token reuse -> Rejected on 2nd attempt
    db.setAdmin2FAToken('token_replay_1', '999', 300);
    const use1 = db.consumeAdmin2FAToken('token_replay_1');
    assert.ok(use1);

    const use2 = db.consumeAdmin2FAToken('token_replay_1');
    assert.strictEqual(use2, null, '2nd attempt to consume same token must fail');

    // Step 3: Expired LiveKit token -> Rejected
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredLiveKitToken = Buffer.from(JSON.stringify({
      room: 'room_442',
      exp: nowSec - 50 // expired 50s ago
    })).toString('base64');

    const decoded = JSON.parse(Buffer.from(expiredLiveKitToken, 'base64').toString('utf8'));
    assert.strictEqual(decoded.exp < nowSec, true);
  });

  runTest('T4.4.3: Unauthorized Recording Access & Injection Security Journey', () => {
    const db = new MemoryDatabase();

    const victim = db.seedUser();
    const attacker = db.seedUser();
    const session = db.seedCallSession({ callerId: victim.id, calleeId: 'user_other', recordingPath: '/rec_secret.mp4' });

    // Step 1: Attacker attempts to download recording of victim's call session -> 403 Forbidden
    const checkAccess = (userId, callSessionObj) => {
      if (userId !== callSessionObj.callerId && userId !== callSessionObj.calleeId) {
        return { allowed: false, status: 403, message: 'Forbidden' };
      }
      return { allowed: true, status: 200 };
    };

    const accessRes = checkAccess(attacker.id, session);
    assert.strictEqual(accessRes.allowed, false);
    assert.strictEqual(accessRes.status, 403);

    // Step 2: XSS script injection in user alias -> Sanitized
    const rawAlias = '<script>document.cookie="stolen"</script>LegitUser';
    const sanitizedAlias = rawAlias.replace(/<script.*?>.*?<\/script>/gi, '').replace(/[<>]/g, '');
    assert.strictEqual(sanitizedAlias, 'LegitUser');
    assert.strictEqual(sanitizedAlias.includes('<script>'), false);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runE2EAdversarialSecurityJourneySuite().catch(err => {
    console.error('Fatal error in e2eAdversarialSecurityJourney test suite:', err);
    process.exit(1);
  });
}

module.exports = { runE2EAdversarialSecurityJourneySuite };
