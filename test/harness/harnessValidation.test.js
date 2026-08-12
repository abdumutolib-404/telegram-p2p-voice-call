/**
 * test/harness/harnessValidation.test.js
 * Verification test for harness helpers: webappAuth, socketClient, dbHelper, botMock.
 */

const assert = require('assert');
const { generateInitData, generateInvalidInitData, verifyInitData, parseInitData } = require('./webappAuth');
const { MockSocketHub, waitForEvent } = require('./socketClient');
const { db, MemoryDatabase, resolveMixedPlanDuration, resolveHigherPlanTier } = require('./dbHelper');
const { botMock, TelegramBotMock } = require('./botMock');

async function testWebappAuth() {
  console.log('Testing webappAuth...');
  const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const userData = { id: 987654321, first_name: 'TestUser', username: 'testuser' };

  // Valid initData
  const validInitData = generateInitData(userData, botToken);
  assert.ok(validInitData.includes('hash='), 'InitData should contain hash');
  
  const verifyResult = verifyInitData(validInitData, botToken);
  assert.strictEqual(verifyResult.valid, true, 'Valid initData should pass verification');
  assert.strictEqual(verifyResult.user.id, 987654321, 'User ID should match');

  // Invalid hash
  const invalidHashData = generateInvalidInitData(userData, botToken, 'invalid_hash');
  const verifyInvalidHash = verifyInitData(invalidHashData, botToken);
  assert.strictEqual(verifyInvalidHash.valid, false, 'Invalid hash should fail verification');

  // Expired
  const expiredData = generateInvalidInitData(userData, botToken, 'expired');
  const verifyExpired = verifyInitData(expiredData, botToken, 3600);
  assert.strictEqual(verifyExpired.valid, false, 'Expired initData should fail verification');

  console.log('✅ webappAuth tests passed.');
}

async function testSocketClient() {
  console.log('Testing socketClient...');
  const hub = new MockSocketHub();
  const socketA = hub.createClient('user_1');
  const socketB = hub.createClient('user_2');

  let matchReceived = false;
  socketA.on('match_found', (data) => {
    matchReceived = true;
    assert.strictEqual(data.roomName, 'room_test');
  });

  hub.onServerEvent('join_queue', (socket, data) => {
    if (data.userId === 'user_1') {
      socket.receive('match_found', { roomName: 'room_test', partnerAlias: 'Partner_B' });
    }
  });

  socketA.emit('join_queue', { userId: 'user_1', band: 6.5, weakSkill: 'FC', strongSkill: 'P' });
  await new Promise(r => setTimeout(r, 20));

  assert.strictEqual(matchReceived, true, 'Socket A should receive match_found event');
  socketA.disconnect();
  socketB.disconnect();
  hub.clear();
  console.log('✅ socketClient tests passed.');
}

async function testDbHelper() {
  console.log('Testing dbHelper...');
  const testDb = new MemoryDatabase();

  // User seeding
  const user1 = testDb.seedUser({ alias: 'User_1', plan: 'FREE', band: 6.5 });
  const user2 = testDb.seedUser({ alias: 'User_2', plan: 'PRO', band: 7.0 });
  assert.strictEqual(testDb.users.size, 2, 'DB should store 2 users');

  // Mixed plan call duration resolution
  const duration = resolveMixedPlanDuration(user1.plan, user2.plan);
  assert.strictEqual(duration, 30, 'Mixed plan (FREE + PRO) should resolve to PRO duration (30 mins)');

  // Redis bucket matchmaking
  testDb.pushToQueue(6.5, 'FC', 'P', { userId: user1.id });
  const match = testDb.popComplementaryMatch(6.5, 'P', 'FC');
  assert.ok(match, 'Should find complementary match in Redis bucket queue');
  assert.strictEqual(match.userId, user1.id);

  // Storage retention purge simulation
  const oldDate = new Date(Date.now() - 86400 * 1000 * 2); // 2 days ago
  const session = testDb.seedCallSession({
    callerId: user1.id,
    calleeId: user2.id,
    recordingPath: '/recordings/rec_1.mp4',
    recordingExpiresAt: oldDate
  });

  const purgeRes = testDb.purgeExpiredRecordings(new Date());
  assert.strictEqual(purgeRes.purgedCount, 1, 'Purge cron should delete 1 expired recording');
  assert.strictEqual(testDb.getCallSession(session.id).recordingPath, null, 'Recording path should be cleared');

  console.log('✅ dbHelper tests passed.');
}

async function testBotMock() {
  console.log('Testing botMock...');
  const bot = new TelegramBotMock({ adminTelegramIds: ['999'] });

  // Onboarding
  const onboardRes = bot.simulateStartOnboarding('1001', { FC: 6.5, LR: 7.0, GRA: 6.0, P: 6.5 });
  assert.ok(onboardRes.user, 'Should onboard user');
  assert.strictEqual(onboardRes.user.band, 6.5, 'Band should average to 6.5');

  // Stealth /admin command
  const unauthorizedRes = bot.simulateAdminCommand('1001');
  assert.strictEqual(unauthorizedRes.isAuthorized, false);
  assert.ok(unauthorizedRes.message.text.includes('Unknown command'), 'Non-admin gets unrecognized command');

  const authorizedRes = bot.simulateAdminCommand('999');
  assert.strictEqual(authorizedRes.isAuthorized, true);
  assert.ok(authorizedRes.token, 'Authorized admin receives token');

  // Stars invoice & payment
  const invRes = bot.simulateStarsInvoice('1001', 'PRO');
  const payRes = bot.simulateSuccessfulPayment('1001', { planTier: 'PRO', amount: 500 });
  assert.strictEqual(payRes.success, true);
  assert.strictEqual(bot.db.getUserByTelegramId('1001').plan, 'PRO', 'User plan should be upgraded to PRO');

  console.log('✅ botMock tests passed.');
}

async function runHarnessTests() {
  try {
    await testWebappAuth();
    await testSocketClient();
    await testDbHelper();
    await testBotMock();
    console.log('\n🎉 ALL HARNESS HELPERS VERIFIED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Harness validation failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runHarnessTests();
}

module.exports = { runHarnessTests };
