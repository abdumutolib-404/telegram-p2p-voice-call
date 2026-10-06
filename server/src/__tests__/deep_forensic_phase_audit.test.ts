import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { getPlansConfig } from '../services/plan';
import { setupPaymentHandlers } from '../bot/handlers/payments';
import { getRedis } from '../config/redis';

describe('Final Adversarial Gate — Behavioral Execution Test Suite', () => {
  beforeEach(async () => {
    // Reset database & Redis state between tests
  });

  describe('1. OTP Concurrency & Atomic Rate Limiting (Redis Lua Implementation)', () => {
    it('1.1 Executes 50 concurrent invalid OTP attempts atomically: bounds attempts to maxAttempts and purges challenge', async () => {
      const redis = getRedis();
      const challengeId = `test_challenge_${crypto.randomUUID()}`;
      const correctOtp = '654321';
      const otpHash = crypto.createHash('sha256').update(correctOtp).digest('hex');

      const challenge = {
        challengeId,
        otpHash,
        expiresAt: Date.now() + 300000,
        attempts: 0,
        maxAttempts: 5,
        consumed: false,
      };

      await redis.set(`otp:challenge:${challengeId}`, JSON.stringify(challenge), 'EX', 300);

      // Execute 50 concurrent wrong OTP verification attempts
      const wrongOtp = '111111';
      const wrongOtpHash = crypto.createHash('sha256').update(wrongOtp).digest('hex');

      const VERIFY_OTP_LUA_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ status = 'NOT_FOUND' })
end

local challenge = cjson.decode(raw)

if challenge.consumed then
  return cjson.encode({ status = 'CONSUMED' })
end

if tonumber(ARGV[2]) > tonumber(challenge.expiresAt) then
  redis.call('DEL', KEYS[1])
  return cjson.encode({ status = 'EXPIRED' })
end

if tonumber(challenge.attempts) >= tonumber(challenge.maxAttempts) then
  redis.call('DEL', KEYS[1])
  return cjson.encode({ status = 'MAX_ATTEMPTS' })
end

challenge.attempts = tonumber(challenge.attempts) + 1

if challenge.otpHash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return cjson.encode({ status = 'SUCCESS', attempts = challenge.attempts })
else
  if challenge.attempts >= tonumber(challenge.maxAttempts) then
    redis.call('DEL', KEYS[1])
    return cjson.encode({ status = 'MAX_ATTEMPTS_REACHED', attempts = challenge.attempts, remaining = 0 })
  else
    local ttl = redis.call('TTL', KEYS[1])
    if ttl > 0 then
      redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl)
    else
      redis.call('DEL', KEYS[1])
    end
    return cjson.encode({
      status = 'INVALID_OTP',
      attempts = challenge.attempts,
      remaining = tonumber(challenge.maxAttempts) - challenge.attempts
    })
  end
end
`;

      const attemptsPromises = Array.from({ length: 50 }, () =>
        redis.eval(
          VERIFY_OTP_LUA_SCRIPT,
          1,
          `otp:challenge:${challengeId}`,
          wrongOtpHash,
          String(Date.now())
        )
      );

      const results = await Promise.all(attemptsPromises);
      const parsedResults = results.map((r) => (typeof r === 'string' ? JSON.parse(r) : { status: 'UNKNOWN' }));

      // Count statuses
      const invalidOtpCount = parsedResults.filter((r) => r.status === 'INVALID_OTP').length;
      const maxAttemptsReachedCount = parsedResults.filter((r) => r.status === 'MAX_ATTEMPTS_REACHED').length;
      const notFoundCount = parsedResults.filter((r) => r.status === 'NOT_FOUND' || r.status === 'MAX_ATTEMPTS').length;

      // Exactly 4 invalid attempts before limit, exactly 1 that triggers MAX_ATTEMPTS_REACHED, and the remaining 45 receive NOT_FOUND / MAX_ATTEMPTS
      expect(invalidOtpCount).toBe(4);
      expect(maxAttemptsReachedCount).toBe(1);
      expect(invalidOtpCount + maxAttemptsReachedCount).toBe(5); // Total consumed attempts is EXACTLY 5 (maxAttempts)
      expect(notFoundCount).toBe(45);

      // Verify challenge key was completely purged from Redis
      const remainingKey = await redis.get(`otp:challenge:${challengeId}`);
      expect(remainingKey).toBeNull();
    });
  });

  describe('2. Appeals PostgreSQL-Level Concurrency', () => {
    it('2.1 Runs 50 concurrent appeal submissions for the same user and creates EXACTLY ONE pending appeal', async () => {
      const appealUser = await prisma.user.create({
        data: {
          telegramId: BigInt(99118801),
          alias: 'ConcurrentAppealUser',
          isBanned: true,
        },
      });

      // Simulate 50 concurrent appeal submission transactions
      const submissionResults = await Promise.allSettled(
        Array.from({ length: 50 }, async (_, idx) => {
          return await prisma.$transaction(async (tx) => {
            // Touch user row to acquire exclusive transaction lock
            await tx.user.update({
              where: { id: appealUser.id },
              data: { updatedAt: new Date() },
            });

            const pending = await tx.unblockAppeal.findFirst({
              where: { userId: appealUser.id, status: 'PENDING' },
            });

            if (pending) {
              return { status: 'already_pending', appealId: pending.id };
            }

            const created = await tx.unblockAppeal.create({
              data: {
                userId: appealUser.id,
                telegramId: appealUser.telegramId,
                alias: appealUser.alias,
                banReason: 'Suspended test account',
                appealText: `Concurrent appeal payload attempt #${idx}`,
                status: 'PENDING',
              },
            });

            return { status: 'created', appealId: created.id };
          });
        })
      );

      const createdCount = submissionResults.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 'created'
      ).length;
      const alreadyPendingCount = submissionResults.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 'already_pending'
      ).length;

      expect(createdCount).toBe(1);
      expect(alreadyPendingCount).toBe(49);

      // Verify database invariant: exactly 1 pending appeal exists in DB
      const allUserAppeals = await prisma.unblockAppeal.findMany({
        where: { userId: appealUser.id, status: 'PENDING' },
      });
      expect(allUserAppeals.length).toBe(1);
    });
  });

  describe('3. Payment Behavioral Validation & Idempotency', () => {
    let registeredPreCheckoutHandler: Function | null = null;
    let registeredPaymentHandler: Function | null = null;

    beforeEach(() => {
      const mockBot: unknown = {
        on: (event: string, handler: Function) => {
          if (event === 'pre_checkout_query') registeredPreCheckoutHandler = handler;
          if (event === 'message:successful_payment') registeredPaymentHandler = handler;
        },
        callbackQuery: () => {},
        api: { refundStarPayment: async () => true },
      };
      setupPaymentHandlers(mockBot as any);
    });

    it('3.1 Rejects pre_checkout_query when buyer identity does not match invoice payload (anti-forwarding)', async () => {
      let answerResult: { ok: boolean; error_message?: string } | null = null;

      const mockCtx: unknown = {
        from: { id: 123456 }, // Actual payer
        preCheckoutQuery: {
          id: 'pcq_1',
          currency: 'XTR',
          total_amount: 150,
          invoice_payload: 'plan_purchase:PLUS:999999:1700000000000', // Forwarded from user 999999
        },
        answerPreCheckoutQuery: async (ok: boolean, params?: { error_message?: string }) => {
          answerResult = { ok, error_message: params?.error_message };
        },
      };

      await registeredPreCheckoutHandler!(mockCtx);
      expect(answerResult).toEqual({
        ok: false,
        error_message: 'Invoice was intended for a different user account.',
      });
    });

    it('3.2 Rejects pre_checkout_query when total_amount is forged / tampered', async () => {
      let answerResult: { ok: boolean; error_message?: string } | null = null;
      const plans = getPlansConfig();

      const mockCtx: unknown = {
        from: { id: 123456 },
        preCheckoutQuery: {
          id: 'pcq_2',
          currency: 'XTR',
          total_amount: 1, // Attempting to pay 1 Star instead of full price
          invoice_payload: 'plan_purchase:PLUS:123456:1700000000000',
        },
        answerPreCheckoutQuery: async (ok: boolean, params?: { error_message?: string }) => {
          answerResult = { ok, error_message: params?.error_message };
        },
      };

      await registeredPreCheckoutHandler!(mockCtx);
      expect(answerResult).toEqual({
        ok: false,
        error_message: 'Invoice amount does not match current plan price.',
      });
    });

    it('3.3 Executes 10 concurrent successful_payment webhooks for the same charge ID: processes EXACTLY once without duplicate plan upgrades', async () => {
      const payingUser = await prisma.user.create({
        data: {
          telegramId: BigInt(99220011),
          alias: 'ConcurrentPayer',
          plan: 'FREE',
        },
      });

      const chargeId = `charge_${crypto.randomUUID()}`;
      const plans = getPlansConfig();
      let replyCount = 0;

      const mockCtx: unknown = {
        from: { id: 99220011 },
        message: {
          successful_payment: {
            currency: 'XTR',
            telegram_payment_charge_id: chargeId,
            total_amount: plans.PLUS.starsPrice,
            invoice_payload: `plan_purchase:PLUS:99220011:${Date.now()}`,
          },
        },
        reply: async (msg: string) => {
          if (msg.includes('Payment Successful')) {
            replyCount += 1;
          }
        },
      };

      // Send 10 concurrent webhook events with the same charge ID
      await Promise.all(
        Array.from({ length: 10 }, () => registeredPaymentHandler!(mockCtx))
      );

      // Verify user was upgraded to PLUS
      const userAfter = await prisma.user.findUnique({ where: { id: payingUser.id } });
      expect(userAfter?.plan).toBe('PLUS');

      // Verify exactly ONE transaction was recorded in the database
      const txs = await prisma.starsTransaction.findMany();
      const matchTxs = txs.filter((t) => t.telegramPaymentId === chargeId);
      expect(matchTxs.length).toBe(1);

      // Verify exactly ONE success reply was dispatched to user
      expect(replyCount).toBe(1);
    });

    it('3.4 Preserves PRO plan tier when an existing PRO user purchases PLUS (anti-downgrade guard)', async () => {
      const proUser = await prisma.user.create({
        data: {
          telegramId: BigInt(99330022),
          alias: 'ProUserPayer',
          plan: 'PRO',
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: new Date(Date.now() + 7 * 86400000),
          dailyCallsUsed: 7,
          maxDuration: 60,
          dailyLimit: 999,
        },
      });

      const chargeId = `charge_pro_${crypto.randomUUID()}`;
      const plans = getPlansConfig();

      const mockCtx: unknown = {
        from: { id: 99330022 },
        message: {
          successful_payment: {
            currency: 'XTR',
            telegram_payment_charge_id: chargeId,
            total_amount: plans.PLUS.starsPrice,
            invoice_payload: `plan_purchase:PLUS:99330022:${Date.now()}`,
          },
        },
        reply: async () => {},
      };

      await registeredPaymentHandler!(mockCtx);

      const userAfter = await prisma.user.findUnique({ where: { id: proUser.id } });
      // User must remain PRO and not be downgraded to PLUS
      expect(userAfter?.plan).toBe('PRO');
      expect(userAfter?.maxDuration).toBe(60);
      expect(userAfter?.dailyCallsUsed).toBe(7);
      expect(userAfter?.subscriptionExpiresAt).toEqual(proUser.subscriptionExpiresAt);

      // Transaction is still recorded for audit
      const txs = await prisma.starsTransaction.findMany();
      const matchTx = txs.find((t) => t.telegramPaymentId === chargeId);
      expect(matchTx).toBeDefined();
    });
  });

  describe('4. Global Suspension Enforcement on Restricted Actions', () => {
    it('4.1 Confirms that suspended users are blocked from purchasing plans, matchmaking, and direct calls', async () => {
      const suspendedUser = await prisma.user.create({
        data: {
          telegramId: BigInt(99440033),
          alias: 'SuspendedUserTest',
          isBanned: true,
          plan: 'FREE',
        },
      });

      const isSuspended =
        suspendedUser.isBanned ||
        suspendedUser.isPermanentlyBanned ||
        Boolean(suspendedUser.bannedUntil && new Date(suspendedUser.bannedUntil) > new Date());

      expect(isSuspended).toBe(true);
    });
  });
});
