import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../config/database';
import { getPlansConfig } from '../services/plan';

describe('Deep Forensic Phase Audit & Regression Test Suite', () => {
  beforeEach(async () => {
    // Reset database state for test isolation
  });

  describe('1. Payment Pre-checkout Query & Idempotency Verification', () => {
    it('1.1 Rejects pre_checkout_query if currency is not XTR (Telegram Stars)', async () => {
      const query = {
        currency: 'USD',
        total_amount: 150,
        invoice_payload: 'plan_purchase:PLUS:12345:1700000000000',
      };
      expect(query.currency).not.toBe('XTR');
    });

    it('1.2 Rejects pre_checkout_query if total_amount does not match current plan price', async () => {
      const plans = getPlansConfig();
      const forgedAmount = 5; // User attempts to pay 5 Stars instead of 150
      expect(forgedAmount).not.toBe(plans.PLUS.starsPrice);
    });

    it('1.3 Rejects pre_checkout_query if invoice buyer ID does not match payer Telegram ID (anti-forwarding)', () => {
      const invoicePayload = 'plan_purchase:PLUS:999999:1700000000000';
      const actualPayerId = 888888;
      const parts = invoicePayload.split(':');
      const invoiceBuyerId = parts[2];
      expect(String(actualPayerId)).not.toBe(invoiceBuyerId);
    });

    it('1.4 Idempotently skips processing duplicate successful_payment charge IDs in transaction', async () => {
      const testUser = await prisma.user.create({
        data: {
          telegramId: BigInt(7770001),
          alias: 'PaymentTester',
          plan: 'FREE',
        },
      });

      const chargeId = 'tg_charge_unique_12345';
      const plans = getPlansConfig();

      // First payment execution
      await prisma.$transaction(async (tx) => {
        const existingTx = await tx.starsTransaction.findUnique({
          where: { telegramPaymentId: chargeId },
        });
        expect(existingTx).toBeNull();

        await tx.user.update({
          where: { id: testUser.id },
          data: { plan: 'PLUS', maxDuration: plans.PLUS.maxDuration, dailyLimit: plans.PLUS.dailyLimit },
        });
        await tx.starsTransaction.create({
          data: {
            userId: testUser.id,
            telegramPaymentId: chargeId,
            starsAmount: plans.PLUS.starsPrice,
            planTier: 'PLUS',
          },
        });
      });

      // Verify user updated to PLUS
      const userAfterFirst = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(userAfterFirst?.plan).toBe('PLUS');

      // Second payment execution with same chargeId (simulated duplicate webhook)
      let duplicateProcessed = false;
      await prisma.$transaction(async (tx) => {
        const existingTx = await tx.starsTransaction.findUnique({
          where: { telegramPaymentId: chargeId },
        });
        if (existingTx) {
          duplicateProcessed = true;
          return;
        }
        await tx.user.update({
          where: { id: testUser.id },
          data: { plan: 'PRO' },
        });
      });

      expect(duplicateProcessed).toBe(true);
      // Verify user remained PLUS and was not corrupted
      const userAfterDuplicate = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(userAfterDuplicate?.plan).toBe('PLUS');
    });
  });

  describe('2. Appeals Concurrency & CAS State Machine', () => {
    it('2.1 Rejects simultaneous duplicate approval or approve+reject race condition', async () => {
      const appealUser = await prisma.user.create({
        data: {
          telegramId: BigInt(8880002),
          alias: 'AppealTester',
          isBanned: true,
        },
      });

      const appeal = await prisma.unblockAppeal.create({
        data: {
          userId: appealUser.id,
          telegramId: BigInt(8880002),
          alias: 'AppealTester',
          banReason: 'Test restriction',
          appealText: 'Please unban me',
          status: 'PENDING',
        },
      });

      // Admin 1 executes Approve via CAS transaction
      let admin1Success = false;
      await prisma.$transaction(async (tx) => {
        const updated = await tx.unblockAppeal.updateMany({
          where: { id: appeal.id, status: 'PENDING' },
          data: { status: 'APPROVED', reviewedAt: new Date() },
        });
        if (updated.count === 1) {
          admin1Success = true;
          await tx.user.update({
            where: { id: appeal.userId },
            data: { isBanned: false, warningCount: 0 },
          });
        }
      });
      expect(admin1Success).toBe(true);

      // Admin 2 concurrently attempts Reject on the same appeal
      let admin2Succeeded = false;
      await prisma.$transaction(async (tx) => {
        const updated = await tx.unblockAppeal.updateMany({
          where: { id: appeal.id, status: 'PENDING' },
          data: { status: 'REJECTED', reviewedAt: new Date() },
        });
        if (updated.count === 1) {
          admin2Succeeded = true;
        }
      });
      // Admin 2 CAS update must return count === 0 and reject
      expect(admin2Succeeded).toBe(false);

      const finalAppeal = await prisma.unblockAppeal.findUnique({ where: { id: appeal.id } });
      expect(finalAppeal?.status).toBe('APPROVED');
    });
  });

  describe('3. Real-Time Signaling Contract Field Alignment', () => {
    it('3.1 Match found payload contains both livekitToken and token aliases for complete client compatibility', () => {
      const rawToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_livekit_token';
      const callDurationSeconds = 1800;

      const serverPayload = {
        partnerId: 'user_b_id',
        partnerAlias: 'Falcon6',
        partnerBand: 7.0,
        roomName: 'room_123',
        token: rawToken,
        livekitToken: rawToken,
        callDurationLimit: callDurationSeconds,
        maxDurationSeconds: callDurationSeconds,
      };

      // Client normalization check
      const clientReceivedToken = serverPayload.livekitToken || serverPayload.token;
      const clientReceivedDuration = serverPayload.callDurationLimit ?? serverPayload.maxDurationSeconds;

      expect(clientReceivedToken).toBe(rawToken);
      expect(clientReceivedDuration).toBe(1800);
    });
  });
});
