import { describe, it, expect } from 'vitest';
import { calculateMixedPlanDuration, getRetentionDaysForPlan, getPlansConfig, updatePlansConfig } from '../services/plan';

describe('Plan & Duration Service', () => {
  it('calculates mixed-plan duration granting max(limitA, limitB)', () => {
    // FREE (15m) vs FREE (15m) -> 15m
    expect(calculateMixedPlanDuration('FREE', 'FREE')).toBe(15);

    // FREE (15m) vs PLUS (30m) -> 30m
    expect(calculateMixedPlanDuration('FREE', 'PLUS')).toBe(30);

    // PLUS (30m) vs PRO (60m) -> 60m
    expect(calculateMixedPlanDuration('PLUS', 'PRO')).toBe(60);

    // FREE (15m) vs PRO (60m) -> 60m
    expect(calculateMixedPlanDuration('FREE', 'PRO')).toBe(60);
  });

  it('retrieves correct retention days per tier', () => {
    expect(getRetentionDaysForPlan('FREE')).toBe(1);
    expect(getRetentionDaysForPlan('PLUS')).toBe(7);
    expect(getRetentionDaysForPlan('PRO')).toBe(30);
  });

  it('allows dynamic updating of plan limits by admin', () => {
    updatePlansConfig({
      FREE: { maxDuration: 20, dailyLimit: 5, retentionDays: 2, starsPrice: 0 },
    });

    expect(getPlansConfig().FREE.maxDuration).toBe(20);
    expect(calculateMixedPlanDuration('FREE', 'FREE')).toBe(20);

    // Reset to defaults
    updatePlansConfig({
      FREE: { maxDuration: 15, dailyLimit: 3, retentionDays: 1, starsPrice: 0 },
    });
  });

  describe('Single Pending Payment Request Invariant', () => {
    it('blocks creating a second manual payment request while one is PENDING', async () => {
      const { createManualPaymentRequest, approveManualPaymentRequest, rejectManualPaymentRequest } = await import('../services/plan');
      const { prisma } = await import('../config/database');

      const user = await prisma.user.create({
        data: {
          telegramId: BigInt(888123456),
          alias: 'PendingTester',
          plan: 'FREE',
          subscriptionStatus: 'INACTIVE',
        },
      });

      // First request succeeds
      const req1 = await createManualPaymentRequest({
        userId: user.id,
        telegramId: user.telegramId,
        alias: user.alias,
        plan: 'PLUS',
        uzsAmount: 15000,
      });

      expect(req1.success).toBe(true);
      expect(req1.request?.status).toBe('PENDING');

      // Second request while first is PENDING is blocked
      const req2 = await createManualPaymentRequest({
        userId: user.id,
        telegramId: user.telegramId,
        alias: user.alias,
        plan: 'PRO',
        uzsAmount: 55000,
      });

      expect(req2.success).toBe(false);
      expect(req2.error?.code).toBe('PAYMENT_ALREADY_PENDING');

      // Rejection frees the user to submit a new request
      await rejectManualPaymentRequest({
        requestId: req1.request!.id,
        adminId: 'admin_test',
        note: 'Invalid receipt',
      });

      const req3 = await createManualPaymentRequest({
        userId: user.id,
        telegramId: user.telegramId,
        alias: user.alias,
        plan: 'PRO',
        uzsAmount: 55000,
      });

      expect(req3.success).toBe(true);
      expect(req3.request?.plan).toBe('PRO');
      expect(req3.request?.status).toBe('PENDING');
    });
  });
});
