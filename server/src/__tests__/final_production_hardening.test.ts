import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { prisma } from '../config/database';
import { env } from '../config/env';
import {
  getPlansConfig,
  updatePlansConfig,
  getEffectiveEntitlement,
  isDowngrade,
  PLAN_WEIGHTS,
  createManualPaymentRequest,
  rejectManualPaymentRequest,
} from '../services/plan';
import { generateAdminToken } from '../bot/commands/admin';

describe('Final Production Hardening Suite', () => {
  let adminJwt: string;
  const adminTelegramId = 7200560574;

  beforeEach(async () => {
    if (!env.ADMIN_TELEGRAM_IDS.includes(String(adminTelegramId))) {
      env.ADMIN_TELEGRAM_IDS.push(String(adminTelegramId));
    }

    const token = await generateAdminToken(adminTelegramId);
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ masterPassword: env.MASTER_PASSWORD, token });
    adminJwt = loginRes.body.jwtToken;
  });

  describe('1. BOSS Plan Tier & Anti-Downgrade Invariants', () => {
    it('1.1 Includes BOSS in default plans configuration with first-class limits', () => {
      const plans = getPlansConfig();
      expect(plans.BOSS).toBeDefined();
      expect(plans.BOSS.name).toBe('Executive Boss');
      expect(plans.BOSS.maxDuration).toBe(90);
      expect(plans.BOSS.dailyLimit).toBe(50);
      expect(plans.BOSS.recordingLimit).toBe(15);
      expect(plans.BOSS.retentionDays).toBe(90);
      expect(plans.BOSS.starsPrice).toBe(899);
      expect(plans.BOSS.uzsPrice).toBe(149000);
    });

    it('1.2 Enforces BOSS rank hierarchy (FREE < PLUS < PRO < BOSS)', () => {
      expect(PLAN_WEIGHTS.FREE).toBe(0);
      expect(PLAN_WEIGHTS.PLUS).toBe(1);
      expect(PLAN_WEIGHTS.PRO).toBe(2);
      expect(PLAN_WEIGHTS.BOSS).toBe(3);

      expect(isDowngrade('BOSS', 'PRO')).toBe(true);
      expect(isDowngrade('BOSS', 'PLUS')).toBe(true);
      expect(isDowngrade('BOSS', 'FREE')).toBe(true);
      expect(isDowngrade('PRO', 'BOSS')).toBe(false);
    });

    it('1.3 Resolves BOSS entitlements correctly via getEffectiveEntitlement', () => {
      const user = {
        plan: 'BOSS',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
      const entitlement = getEffectiveEntitlement(user);
      expect(entitlement.plan).toBe('BOSS');
      expect(entitlement.maxDurationMinutes).toBe(90);
      expect(entitlement.dailyLimit).toBe(50);
      expect(entitlement.recordingLimit).toBe(15);
      expect(entitlement.retentionDays).toBe(90);
    });

    it('1.4 Automatically reverts expired paid plan to FREE', () => {
      const expiredUser = {
        plan: 'BOSS',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() - 1000), // Expired in past
      };
      const entitlement = getEffectiveEntitlement(expiredUser);
      expect(entitlement.plan).toBe('FREE');
      expect(entitlement.maxDurationMinutes).toBe(15);
      expect(entitlement.dailyLimit).toBe(3);
      expect(entitlement.retentionDays).toBe(1);
    });

    it('1.5 Admin PUT /api/admin/plans dynamically updates BOSS configuration', async () => {
      const res = await request(app)
        .put('/api/admin/plans')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({
          BOSS: {
            name: 'Executive Boss VIP',
            maxDuration: 60,
            dailyLimit: 999,
            retentionDays: 90,
            starsPrice: 1200,
            uzsPrice: 180000,
            active: true,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.BOSS.retentionDays).toBe(90);
      expect(res.body.BOSS.starsPrice).toBe(1200);
    });
  });

  describe('2. Manual Payment Rejection & Notification', () => {
    it('2.1 Rejects manual payment request with note and returns rejected status', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now()),
          alias: 'RejectionTestUser',
          band: 6.5,
          plan: 'FREE',
        },
      });

      const paymentRes = await createManualPaymentRequest({
        userId: user.id,
        telegramId: user.telegramId,
        alias: user.alias,
        plan: 'PLUS',
        uzsAmount: 25000,
      });

      expect(paymentRes.success).toBe(true);
      const requestId = paymentRes.request!.id;

      const rejectRes = await request(app)
        .post(`/api/admin/payments/manual/${requestId}/reject`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ note: 'Receipt blurred. Please re-upload clear transaction receipt.' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.success).toBe(true);
      expect(rejectRes.body.request.status).toBe('REJECTED');
    });
  });

  describe('3. Public Support Username Integrity', () => {
    it('3.1 Ensures default manual payment admin username is PairTalkSupport', () => {
      expect(env.MANUAL_PAYMENT_ADMIN_USERNAME).toContain('PairTalkSupport');
    });
  });
});
