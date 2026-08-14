import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../config/database';
import { inMemoryRedis, getRedis } from '../config/redis';
import {
  createCanonicalError,
  CanonicalErrorCode,
  UserStatus,
  PaymentStatus,
} from '../types/canonical';
import {
  checkRateLimit,
  setInFlightLock,
  releaseInFlightLock,
} from '../services/rateLimitMatrix';
import {
  getPlansConfig,
  updatePlansConfig,
  createManualPaymentRequest,
  approveManualPaymentRequest,
  rejectManualPaymentRequest,
  revokePlanOnRefund,
} from '../services/plan';
import { app } from '../index';

describe('Canonical Production Gate Test Suite', () => {
  beforeEach(async () => {
    if (inMemoryRedis.flushall) {
      await inMemoryRedis.flushall();
    }
  });

  afterEach(async () => {
    if (inMemoryRedis.flushall) {
      await inMemoryRedis.flushall();
    }
  });

  describe('1. Canonical Error Contract & Zero Leak Guarantee', () => {
    it('1.1 Creates compliant canonical error objects without leaking internal tech', () => {
      const err = createCanonicalError(
        'SERVICE_UNAVAILABLE',
        'Database or Redis connection failed'
      );
      expect(err.code).toBe('SERVICE_UNAVAILABLE');
      expect(err.retryable).toBe(true);
      // Ensure zero internal infrastructure names leak
      expect(err.message).not.toContain('Redis');
      expect(err.message).not.toContain('Database');
      expect(err.message).not.toContain('Prisma');
    });

    it('1.2 Sanitizes unknown error messages and hides stack traces', () => {
      const err = createCanonicalError(
        'LIVEKIT_ERROR',
        'LiveKit Egress RoomServiceClient connection refused at 10.0.0.1:7880'
      );
      expect(err.code).toBe('LIVEKIT_ERROR');
      expect(err.message).not.toContain('LiveKit');
      expect(err.message).not.toContain('RoomServiceClient');
      expect(err.message).not.toContain('10.0.0.1');
    });
  });

  describe('2. Rate Limit Matrix & In-Flight Coalescing', () => {
    it('2.1 Allows normal requests within quota and rejects bursts', async () => {
      const userId = 'rate-limit-test-user-1';

      // First request should always pass
      const first = await checkRateLimit('PROFILE_UPDATE', userId);
      expect(first.allowed).toBe(true);

      // Consume up to limit (10 requests)
      for (let i = 0; i < 9; i++) {
        await checkRateLimit('PROFILE_UPDATE', userId);
      }

      // 11th request should be rate limited
      const overLimit = await checkRateLimit('PROFILE_UPDATE', userId);
      expect(overLimit.allowed).toBe(false);
      expect(overLimit.error?.code).toBe('RATE_LIMITED');
    });

    it('2.2 Enforces in-flight request locks and returns ALREADY_IN_PROGRESS', async () => {
      const userId = 'inflight-test-user-1';

      // Set in-flight lock for match joining
      setInFlightLock('MATCH_JOIN', userId, 5);

      const check = await checkRateLimit('MATCH_JOIN', userId);
      expect(check.allowed).toBe(false);
      expect(check.error?.code).toBe('ALREADY_IN_PROGRESS');

      // Release lock
      releaseInFlightLock('MATCH_JOIN', userId);

      const checkAfter = await checkRateLimit('MATCH_JOIN', userId);
      expect(checkAfter.allowed).toBe(true);
    });
  });

  describe('3. Dual-Pricing Engine (Stars + UZS) & Manual Payments', () => {
    it('3.1 Validates and persists dual pricing for plans', () => {
      const updated = updatePlansConfig({
        FREE: { maxDuration: 15, dailyLimit: 3, retentionDays: 1, starsPrice: 0, uzsPrice: 0 },
        PLUS: { maxDuration: 30, dailyLimit: 10, retentionDays: 7, starsPrice: 200, uzsPrice: 35000 },
        PRO: { maxDuration: 60, dailyLimit: 999, retentionDays: 30, starsPrice: 600, uzsPrice: 95000 },
      });

      expect(updated.PLUS.starsPrice).toBe(200);
      expect(updated.PLUS.uzsPrice).toBe(35000);
      expect(updated.PRO.starsPrice).toBe(600);
      expect(updated.PRO.uzsPrice).toBe(95000);

      const config = getPlansConfig();
      expect(config.PLUS.uzsPrice).toBe(35000);
    });

    it('3.2 Executes full Manual Payment Request lifecycle: create -> approve -> grant plan', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 9988776655n,
          alias: 'ManualPayUser',
          plan: 'FREE',
          dailyLimit: 3,
          maxDuration: 15,
        },
      });

      // 1. User submits manual payment request
      const createRes = await createManualPaymentRequest({
        userId: user.id,
        telegramId: 9988776655n,
        alias: user.alias,
        plan: 'PLUS',
        uzsAmount: 35000,
        paymentProof: 'receipt_tx_12345.jpg',
      });

      expect(createRes.success).toBe(true);
      expect(createRes.request?.status).toBe('PENDING');
      expect(createRes.request?.uzsAmount).toBe(35000);

      // 2. Admin approves request
      const approval = await approveManualPaymentRequest({
        requestId: createRes.request!.id,
        adminId: 'admin-1',
        note: 'Payment confirmed in banking app',
      });

      expect(approval.request.status).toBe('APPROVED');
      expect(approval.request.adminNote).toBe('Payment confirmed in banking app');

      // 3. User plan is upgraded to PLUS with correct limits
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updatedUser?.plan).toBe('PLUS');
      expect(updatedUser?.maxDuration).toBe(30);
      expect(updatedUser?.dailyLimit).toBe(10);

      // 4. Audit log entry is created
      const logs = await prisma.auditLog.findMany({ where: { targetId: user.id } });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('MANUAL_PAYMENT_APPROVAL');
    });

    it('3.3 Rejects manual payment request without changing user plan', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 4455667788n,
          alias: 'RejectPayUser',
          plan: 'FREE',
        },
      });

      const createRes = await createManualPaymentRequest({
        userId: user.id,
        telegramId: 4455667788n,
        alias: user.alias,
        plan: 'PRO',
        uzsAmount: 95000,
      });

      expect(createRes.success).toBe(true);

      const rejection = await rejectManualPaymentRequest({
        requestId: createRes.request!.id,
        adminId: 'admin-1',
        note: 'Invalid transaction receipt',
      });

      expect(rejection.request.status).toBe('REJECTED');

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.plan).toBe('FREE');
    });
  });

  describe('4. Telegram Stars Dispute & Refund Revocation', () => {
    it('4.1 Revokes upgraded plan back to FREE when Stars payment is refunded', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 1122334455n,
          alias: 'StarsRefundUser',
          plan: 'PRO',
          maxDuration: 60,
          dailyLimit: 999,
        },
      });

      const tx = await prisma.starsTransaction.create({
        data: {
          userId: user.id,
          telegramPaymentId: 'tg_charge_refund_test_1',
          starsAmount: 600,
          planTier: 'PRO',
          status: 'PAID',
        },
      });

      // Execute refund
      const refundResult = await revokePlanOnRefund({
        transactionId: tx.id,
        adminId: 'admin-1',
        reason: 'User requested refund via Telegram support',
      });

      expect(refundResult.transaction.status).toBe('REFUNDED');
      expect(refundResult.user.plan).toBe('FREE');
      expect(refundResult.user.maxDuration).toBe(15);
      expect(refundResult.user.dailyLimit).toBe(3);

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.plan).toBe('FREE');
    });
  });
});
