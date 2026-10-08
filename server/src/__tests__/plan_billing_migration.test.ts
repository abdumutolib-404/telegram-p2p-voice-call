import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { prisma } from '../config/database';
import {
  getPlansConfig,
  updatePlansConfig,
  getEffectiveEntitlement,
  getPaidUserProfile,
  getUserRecordingsUsedThisPeriod,
  isDowngrade,
  PLAN_WEIGHTS,
} from '../services/plan';
import { env } from '../config/env';

describe('Authoritative Plan, Entitlement, Billing & Recording Migration Test Suite', () => {
  let adminJwt: string;

  beforeEach(async () => {
    // Authenticate as Admin
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({
        token: 'test_admin_token',
        masterPassword: env.MASTER_PASSWORD,
      });
    adminJwt = loginRes.body.jwtToken;
  });

  describe('1. Authoritative Plan Specifications & Pricing', () => {
    it('1.1 FREE plan has exact canonical limits and zero price', () => {
      const config = getPlansConfig().FREE;
      expect(config.uzsPrice).toBe(0);
      expect(config.starsPrice).toBe(0);
      expect(config.dailyLimit).toBe(3);
      expect(config.callsLimit).toBe(3);
      expect(config.maxDuration).toBe(15);
      expect(config.recordingLimit).toBe(1);
      expect(config.retentionDays).toBe(1);
      expect(config.active).toBe(true);
    });

    it('1.2 PLUS plan has exact canonical limits and 15,000 UZS / 79 XTR price', () => {
      const config = getPlansConfig().PLUS;
      expect(config.uzsPrice).toBe(15000);
      expect(config.starsPrice).toBe(79);
      expect(config.dailyLimit).toBe(10);
      expect(config.callsLimit).toBe(10);
      expect(config.maxDuration).toBe(30);
      expect(config.recordingLimit).toBe(3);
      expect(config.retentionDays).toBe(7);
      expect(config.active).toBe(true);
    });

    it('1.3 PRO plan has exact canonical limits and 55,000 UZS / 255 XTR price', () => {
      const config = getPlansConfig().PRO;
      expect(config.uzsPrice).toBe(55000);
      expect(config.starsPrice).toBe(255);
      expect(config.dailyLimit).toBe(25);
      expect(config.callsLimit).toBe(25);
      expect(config.maxDuration).toBe(60);
      expect(config.recordingLimit).toBe(7);
      expect(config.retentionDays).toBe(30);
      expect(config.active).toBe(true);
    });

    it('1.4 BOSS plan has exact canonical limits and 149,000 UZS / 679 XTR price', () => {
      const config = getPlansConfig().BOSS;
      expect(config.uzsPrice).toBe(149000);
      expect(config.starsPrice).toBe(679);
      expect(config.dailyLimit).toBe(50);
      expect(config.callsLimit).toBe(50);
      expect(config.maxDuration).toBe(90);
      expect(config.recordingLimit).toBe(15);
      expect(config.retentionDays).toBe(90);
      expect(config.active).toBe(true);
    });
  });

  describe('2. Single Authoritative Entitlement Resolver', () => {
    it('2.1 Resolves all required properties for all 4 plan tiers', () => {
      for (const tier of ['FREE', 'PLUS', 'PRO', 'BOSS'] as const) {
        const ent = getEffectiveEntitlement({ plan: tier });
        expect(ent.plan).toBe(tier);
        expect(ent.planName).toBeDefined();
        expect(ent.callLimit).toBeGreaterThan(0);
        expect(ent.maxCallDuration).toBeGreaterThan(0);
        expect(ent.recordingLimit).toBeGreaterThan(0);
        expect(ent.recordingRetention).toBeGreaterThan(0);
        expect(ent.source).toBe('PLAN_DEFAULT');
        expect(ent.overrideSource).toBe('PLAN_DEFAULT');
      }
    });

    it('2.2 Expired paid subscriptions automatically fall back to FREE tier', () => {
      const expiredUser = {
        plan: 'BOSS',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() - 10000), // in the past
      };
      const ent = getEffectiveEntitlement(expiredUser);
      expect(ent.plan).toBe('FREE');
      expect(ent.maxCallDuration).toBe(15);
      expect(ent.callLimit).toBe(3);
      expect(ent.recordingLimit).toBe(1);
      expect(ent.recordingRetention).toBe(1);
    });

    it('2.3 Distinguishes between PLAN_DEFAULT and ADMIN_OVERRIDE', () => {
      const customUser = {
        plan: 'PLUS',
        maxDuration: 45, // custom 45m override
        retentionOverride: 14, // custom 14d override
      };
      const ent = getEffectiveEntitlement(customUser);
      expect(ent.plan).toBe('PLUS');
      expect(ent.maxCallDuration).toBe(45);
      expect(ent.recordingRetention).toBe(14);
      expect(ent.overrideSource).toBe('ADMIN_OVERRIDE');
    });
  });

  describe('3. Recording Quota Accounting & Call Isolation', () => {
    it('3.1 Accurately counts recordings created within billing period', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 9911223344n,
          alias: 'QuotaTester',
          plan: 'PLUS',
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        },
      });

      // Initially 0 recordings
      let count = await getUserRecordingsUsedThisPeriod(user.id, user);
      expect(count).toBe(0);

      // Create 2 call sessions with recordings
      await recordedFixture({
        data: {
          roomName: `rec_test_room_${Date.now()}_1`,
          userAId: user.id,
          userBId: 'dummy_partner_id',
          status: 'COMPLETED',
          recordingUrl: 'recordings/test_rec_1.mp3',
          duration: 300,
        },
      });
      await recordedFixture({
        data: {
          roomName: `rec_test_room_${Date.now()}_2`,
          userAId: 'dummy_partner_id',
          userBId: user.id,
          status: 'COMPLETED',
          recordingUrl: 'recordings/test_rec_2.mp3',
          duration: 450,
        },
      });

      count = await getUserRecordingsUsedThisPeriod(user.id, user);
      expect(count).toBe(2);

      // Profile calculates remaining recordings accurately (PLUS has 3 limit -> 1 remaining)
      const profile = getPaidUserProfile({ ...user, recordingsUsed: count });
      expect(profile.recordingsRemaining).toBe('1 / 3');
    });
  });

  describe('4. Historical Retention & BOSS 90-Day Survival Invariant', () => {
    it('4.1 Preserves 90-day retention on created call session even after BOSS plan expires', async () => {
      const bossUser = await prisma.user.create({
        data: {
          telegramId: 8877665544n,
          alias: 'BossSubscriber',
          plan: 'BOSS',
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // expires in 5 days
        },
      });

      const sessionCreatedAt = new Date();
      const bossRetentionMs = 90 * 24 * 60 * 60 * 1000;
      const recordingExpiresAt = new Date(sessionCreatedAt.getTime() + bossRetentionMs);

      const session = await recordedFixture({
        data: {
          roomName: `boss_survival_room_${Date.now()}`,
          userAId: bossUser.id,
          userBId: 'partner_id_123',
          status: 'COMPLETED',
          recordingUrl: 'recordings/boss_call.mp3',
          recordingExpiresAt,
          duration: 1200,
          createdAt: sessionCreatedAt,
        },
      });

      expect(session.recordingExpiresAt).toBeDefined();
      const retainedDays = Math.round(
        (session.recordingExpiresAt!.getTime() - session.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      );
      expect(retainedDays).toBe(90);

      // Fast forward: User's subscription expires
      await prisma.user.update({
        where: { id: bossUser.id },
        data: { plan: 'FREE', subscriptionStatus: 'EXPIRED', subscriptionExpiresAt: new Date(Date.now() - 1000) },
      });

      // Ensure historical session recording retention is untouched and still 90 days
      const preservedSession = await prisma.callSession.findUnique({ where: { id: session.id } });
      expect(preservedSession?.recordingExpiresAt).toEqual(recordingExpiresAt);
    });
  });

  describe('5. Admin Plan Editor GET / PUT Endpoints', () => {
    it('5.1 Exposes and persists all four plan configurations via admin REST API', async () => {
      const getRes = await request(app)
        .get('/api/admin/plans')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.FREE).toBeDefined();
      expect(getRes.body.PLUS).toBeDefined();
      expect(getRes.body.PRO).toBeDefined();
      expect(getRes.body.BOSS).toBeDefined();

      const original=structuredClone(getPlansConfig());
      try {
      // Update a plan setting (e.g. modify PLUS price to test dynamic persistence)
      const putRes = await request(app)
        .put('/api/admin/plans')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({
          PLUS: {
            ...getRes.body.PLUS,
            starsPrice: 85,
            uzsPrice: 15000,
          },
        });

      expect(putRes.status).toBe(200);
      expect(getPlansConfig().PLUS.starsPrice).toBe(85);
      expect(getPlansConfig().PLUS.uzsPrice).toBe(15000);

      } finally { updatePlansConfig(original); }
      expect(getPlansConfig()).toEqual(original);
    });
  });

  describe('6. Plan Hierarchy & Downgrade Prevention', () => {
    it('6.1 Prohibits downgrading active higher tiers to lower tiers', () => {
      expect(isDowngrade('BOSS', 'PRO')).toBe(true);
      expect(isDowngrade('BOSS', 'PLUS')).toBe(true);
      expect(isDowngrade('PRO', 'PLUS')).toBe(true);
      expect(isDowngrade('PLUS', 'FREE')).toBe(true);
      expect(isDowngrade('PLUS', 'PRO')).toBe(false);
      expect(isDowngrade('PRO', 'BOSS')).toBe(false);
    });
  });
});

async function recordedFixture(args: Parameters<typeof prisma.callSession.create>[0]) {
  const call=await prisma.callSession.create(args);
  const marker=call.recordedByUserId;
  const owners=!marker || marker==='BOTH' ? [call.userAId,call.userBId] : marker.split(',');
  for(const userId of owners) await prisma.recordingUsage.create({data:{callId:call.id,userId}});
  return call;
}
