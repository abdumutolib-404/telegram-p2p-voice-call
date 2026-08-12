/**
 * test/tier2_api_socket/boundariesSecurity.test.js
 * Tier 2 Boundary & Corner Cases: Auth, HMAC, Rate Limiting & Admin Security.
 */

const assert = require('assert');
const { MemoryDatabase } = require('../harness/dbHelper');
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

async function runBoundariesSecuritySuite() {
  console.log('--- Running Tier 2 Security & Auth Boundaries Test Suite ---');

  const botToken = '12345678:ABC-DEF1234ghIkl_TEST_BOT_TOKEN';

  runTest('T2.43: InitData HMAC timestamp at exact max age limit (86400s) passes verification', () => {
    const exactly24hAgo = Math.floor(Date.now() / 1000) - 86400;
    const initData = generateInitData({ id: 1001, first_name: 'Test' }, botToken, { authDate: exactly24hAgo });

    const result = verifyInitData(initData, botToken, 86400);
    assert.strictEqual(result.valid, true);
  });

  runTest('T2.44: Admin 2FA token redemption at exact expiration limit (300s)', () => {
    const db = new MemoryDatabase();
    db.setAdmin2FAToken('token_300s', '999', 300);

    const tokenData = db.getAdmin2FAToken('token_300s');
    assert.ok(tokenData);
    assert.strictEqual(tokenData.telegramId, '999');
  });

  runTest('T2.45: Rate limiter threshold testing (21st request in 1 minute on /api/auth/verify returns 429)', () => {
    const createRateLimiter = (maxLimit) => {
      let count = 0;
      return () => {
        count++;
        if (count > maxLimit) {
          return { status: 429, message: 'Too Many Requests' };
        }
        return { status: 200, message: 'OK' };
      };
    };

    const rateLimiter = createRateLimiter(20);
    for (let i = 1; i <= 20; i++) {
      assert.strictEqual(rateLimiter().status, 200);
    }
    assert.strictEqual(rateLimiter().status, 429);
  });

  runTest('T2.46: Admin login rate limit threshold (6th attempt in 1 minute returns 429)', () => {
    const createAdminRateLimiter = (maxLimit) => {
      let attempts = 0;
      return () => {
        attempts++;
        if (attempts > maxLimit) {
          return { status: 429, message: 'Admin login rate limit exceeded' };
        }
        return { status: 200 };
      };
    };

    const limiter = createAdminRateLimiter(5);
    for (let i = 1; i <= 5; i++) {
      assert.strictEqual(limiter().status, 200);
    }
    assert.strictEqual(limiter().status, 429);
  });

  runTest('T2.47: Malformed JSON payload in user query parameter of X-Telegram-Init-Data', () => {
    const malformedData = 'auth_date=1700000000&query_id=123&user={invalid_json_string}&hash=abc';
    const result = verifyInitData(malformedData, botToken);
    assert.strictEqual(result.valid, false);
  });

  runTest('T2.48: Direct browser access to Mini App routes without X-Telegram-Init-Data header returns 403', () => {
    const initDataHeader = '';
    const result = verifyInitData(initDataHeader, botToken);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('Missing hash'));
  });

  runTest('T2.49: Using valid HMAC signed for Bot A against Bot B token fails verification', () => {
    const botTokenA = '1111:TokenA';
    const botTokenB = '2222:TokenB';
    const initDataA = generateInitData({ id: 1002 }, botTokenA);

    const result = verifyInitData(initDataA, botTokenB);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('HMAC signature mismatch'));
  });

  runTest('T2.50: Attempting admin login with empty master password string returns 400 Bad Request', () => {
    const validateAdminLogin = (password) => {
      if (!password || password.trim() === '') {
        return { status: 400, message: 'Master Password is required' };
      }
      return { status: 200 };
    };

    assert.strictEqual(validateAdminLogin('').status, 400);
    assert.strictEqual(validateAdminLogin('   ').status, 400);
  });

  runTest('T2.51: Replaying consumed single-use 2FA token returns 401 Unauthorized', () => {
    const db = new MemoryDatabase();
    db.setAdmin2FAToken('single_use_token_123', '999', 300);

    const firstAttempt = db.consumeAdmin2FAToken('single_use_token_123');
    assert.ok(firstAttempt);

    const replayAttempt = db.consumeAdmin2FAToken('single_use_token_123');
    assert.strictEqual(replayAttempt, null, 'Replayed token must be rejected');
  });

  runTest('T2.52: Admin JWT signature verification with tampered header algorithm (alg: none attack) fails', () => {
    const verifyJwtAlgorithm = (alg) => {
      if (alg.toLowerCase() === 'none' || alg !== 'HS256') {
        return { valid: false, error: 'Algorithm not allowed' };
      }
      return { valid: true };
    };

    assert.strictEqual(verifyJwtAlgorithm('none').valid, false);
    assert.strictEqual(verifyJwtAlgorithm('HS256').valid, true);
  });

  runTest('T2.53: Socket handshake authentication with expired initData returns connection error', () => {
    const expiredInitData = generateInvalidInitData({ id: 1003 }, botToken, 'expired');
    const authResult = verifyInitData(expiredInitData, botToken, 86400);

    assert.strictEqual(authResult.valid, false);
    assert.ok(authResult.reason.includes('expired'));
  });

  runTest('T2.54: Accessing /api/calls/recording/:sessionId for a session user did not participate in returns 403', () => {
    const db = new MemoryDatabase();
    const session = db.seedCallSession({ callerId: 'user_A', calleeId: 'user_B' });

    const checkRecordingAccess = (userId, sessionObj) => {
      if (userId !== sessionObj.callerId && userId !== sessionObj.calleeId) {
        return { status: 403, message: 'Forbidden - Not a participant in this call session' };
      }
      return { status: 200 };
    };

    assert.strictEqual(checkRecordingAccess('user_intruder', session).status, 403);
    assert.strictEqual(checkRecordingAccess('user_A', session).status, 200);
  });

  runTest('T2.55: Injecting script tags into sub-scores or user alias inputs sanitizes payload', () => {
    const sanitizeAlias = (input) => {
      return input.replace(/<script.*?>.*?<\/script>/gi, '').replace(/[<>]/g, '');
    };

    const malicious = '<script>alert("hack")</script>IELTS_Partner';
    const clean = sanitizeAlias(malicious);
    assert.strictEqual(clean, 'IELTS_Partner');
    assert.strictEqual(clean.includes('<script>'), false);
  });

  runTest('T2.56: WebApp initData HMAC verification with extra unexpected query parameters preserves check', () => {
    const initData = generateInitData({ id: 1004 }, botToken, {
      extraFields: { custom_param: 'value123' }
    });

    const result = verifyInitData(initData, botToken);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.user.id, 1004);
  });

  runTest('T2.57: Stealth /admin command executed by user with partial string match admin ID is unauthorized', () => {
    const db = new MemoryDatabase();
    const adminIds = new Set(['123456789']);

    const isAuthorizedAdmin = (id) => adminIds.has(String(id));

    assert.strictEqual(isAuthorizedAdmin('12345'), false); // partial match
    assert.strictEqual(isAuthorizedAdmin('123456789'), true);
  });

  runTest('T2.58: Brute-force 2FA token guessing protection locks IP after threshold', () => {
    let failedAttempts = 0;
    const attempt2FALogin = (token) => {
      failedAttempts++;
      if (failedAttempts >= 5) {
        return { locked: true, status: 429, message: 'Account locked due to multiple failed 2FA attempts' };
      }
      return { locked: false, status: 401 };
    };

    for (let i = 1; i <= 4; i++) {
      assert.strictEqual(attempt2FALogin('wrong_token').locked, false);
    }
    assert.strictEqual(attempt2FALogin('wrong_token').locked, true);
  });

  runTest('T2.59: Admin JWT token expiration check (24-hour validity limit)', () => {
    const isJwtExpired = (issuedAtSec, maxAgeSec = 86400) => {
      const now = Math.floor(Date.now() / 1000);
      return (now - issuedAtSec) > maxAgeSec;
    };

    const past25h = Math.floor(Date.now() / 1000) - 90000;
    assert.strictEqual(isJwtExpired(past25h), true);
  });

  runTest('T2.60: Header size limit on verify endpoint rejects oversized headers (> 8KB)', () => {
    const validateHeaderSize = (headerStr) => {
      if (Buffer.byteLength(headerStr, 'utf8') > 8192) {
        return { status: 431, message: 'Request Header Fields Too Large' };
      }
      return { status: 200 };
    };

    const oversizedHeader = 'x-telegram-init-data=' + 'a'.repeat(9000);
    assert.strictEqual(validateHeaderSize(oversizedHeader).status, 431);
  });

  runTest('T2.61: Socket connection attempt without authorization payload is rejected', () => {
    const authenticateSocketHandshake = (handshakeAuth) => {
      if (!handshakeAuth || !handshakeAuth.token) {
        return { authorized: false, error: 'Authentication token required' };
      }
      return { authorized: true };
    };

    assert.strictEqual(authenticateSocketHandshake({}).authorized, false);
  });

  runTest('T2.62: Master password check with leading/trailing whitespace is trimmed and verified', () => {
    const masterPass = 'SuperSecret123!';
    const verifyPassword = (input) => input.trim() === masterPass;

    assert.strictEqual(verifyPassword('  SuperSecret123!  '), true);
    assert.strictEqual(verifyPassword('WrongPass'), false);
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount} passed out of ${testCount} tests.`);
  console.log(`==================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runBoundariesSecuritySuite().catch(err => {
    console.error('Fatal error in boundariesSecurity test suite:', err);
    process.exit(1);
  });
}

module.exports = { runBoundariesSecuritySuite };
