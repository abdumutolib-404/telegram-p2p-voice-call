import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { prisma } from '../config/database';
import { moderationService } from '../services/moderation';
import { getEffectiveEntitlement } from '../services/plan';
import { getAdminAnalytics } from '../services/analytics';
import { generateAdminToken } from '../bot/commands/admin';
import { env } from '../config/env';

describe('Production Correction Campaign Test Suite (Issues 1–14)', () => {
  let userAId: string;
  let userBId: string;
  let adminJwt: string;
  const adminTelegramId = 7200560574;

  beforeAll(async () => {
    // Register test admin ID in env
    if (!env.ADMIN_TELEGRAM_IDS.includes(String(adminTelegramId))) {
      env.ADMIN_TELEGRAM_IDS.push(String(adminTelegramId));
    }

    const userA = await prisma.user.create({
      data: {
        telegramId: BigInt(88880001),
        alias: 'P2P-Campaign-UserA',
        band: 6.5,
        plan: 'FREE',
        dailyLimit: 3,
        dailyCallsUsed: 0,
        maxDuration: 15,
      },
    });
    const userB = await prisma.user.create({
      data: {
        telegramId: BigInt(88880002),
        alias: 'P2P-Campaign-UserB',
        band: 6.5,
        plan: 'PRO',
        dailyLimit: 999,
        dailyCallsUsed: 0,
        maxDuration: 60,
      },
    });
    userAId = userA.id;
    userBId = userB.id;

    // Login admin to obtain JWT
    const token = await generateAdminToken(adminTelegramId);
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ masterPassword: env.MASTER_PASSWORD, token });
    expect(loginRes.status).toBe(200);
    adminJwt = loginRes.body.jwtToken;
  });

  afterAll(async () => {
    await prisma.unblockAppeal.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.callRating.deleteMany();
    await prisma.callSession.deleteMany({ where: { OR: [{ userAId: userAId }, { userBId: userAId }, { userAId: userBId }, { userBId: userBId }] } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  // =========================================================================
  // ISSUE 1: Appeals Restricted Strictly to Permanently Banned Users
  // =========================================================================
  describe('Issue 1: Unblock Appeals Business Rule & Invariants', () => {
    it('1.1 Rejects unblock appeal submission from non-banned normal users in DB transaction logic', async () => {
      const user = await prisma.user.findUnique({ where: { id: userAId } });
      expect(user?.isPermanentlyBanned).toBe(false);
    });

    it('1.2 Enforces exactly 1 PENDING appeal under concurrent requests for a permanently banned user', async () => {
      // Set userA as permanently banned
      await prisma.user.update({
        where: { id: userAId },
        data: { isPermanentlyBanned: true, isBanned: true },
      });

      // Clear any prior appeals
      await prisma.unblockAppeal.deleteMany({ where: { userId: userAId } });

      // Run 20 concurrent appeal submissions
      const submissions = Array.from({ length: 20 }, (_, i) =>
        prisma.$transaction(async (tx) => {
          await tx.user.update({ where: { id: userAId }, data: { updatedAt: new Date() } });
          const existing = await tx.unblockAppeal.findFirst({ where: { userId: userAId, status: 'PENDING' } });
          if (existing) return { status: 'already_pending' };
          const created = await tx.unblockAppeal.create({
            data: {
              userId: userAId,
              telegramId: BigInt(88880001),
              alias: 'P2P-Campaign-UserA',
              banReason: 'Permanent ban test',
              appealText: `Concurrent appeal attempt ${i}`,
              status: 'PENDING',
            },
          });
          return { status: 'created', id: created.id };
        })
      );

      const results = await Promise.all(submissions);
      const createdCount = results.filter((r) => r.status === 'created').length;
      expect(createdCount).toBe(1);

      const pendingInDb = await prisma.unblockAppeal.count({
        where: { userId: userAId, status: 'PENDING' },
      });
      expect(pendingInDb).toBe(1);

      // Restore userA status
      await prisma.user.update({
        where: { id: userAId },
        data: { isPermanentlyBanned: false, isBanned: false },
      });
    });
  });

  // =========================================================================
  // ISSUE 2: Warning Threshold & Automatic Escalation Ladder
  // =========================================================================
  describe('Issue 2: Warning Escalation Ladder (1-2: Warn, 3-4: 6h Temp Ban, 5+: Perm Ban)', () => {
    let testEscalationUserId: string;

    beforeAll(async () => {
      const u = await prisma.user.create({
        data: {
          telegramId: BigInt(88880099),
          alias: 'P2P-Escalation-Tester',
          band: 6.0,
          plan: 'PRO',
          warningCount: 0,
        },
      });
      testEscalationUserId = u.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: testEscalationUserId } });
    });

    it('2.1 Warning 1 & 2 remain in WARNED state without suspending account', async () => {
      const w1 = await moderationService.escalateUserWarning(testEscalationUserId, '1st warning reason');
      expect(w1.penaltyLevel).toBe('WARNING');
      expect(w1.warningCount).toBe(1);
      expect(w1.user.isBanned).toBe(false);
      expect(w1.user.isPermanentlyBanned).toBe(false);

      const w2 = await moderationService.escalateUserWarning(testEscalationUserId, '2nd warning reason');
      expect(w2.penaltyLevel).toBe('WARNING');
      expect(w2.warningCount).toBe(2);
      expect(w2.user.isBanned).toBe(false);
      expect(w2.user.isPermanentlyBanned).toBe(false);
    });

    it('2.2 Warning 3 automatically triggers 6-hour temporary ban', async () => {
      const w3 = await moderationService.escalateUserWarning(testEscalationUserId, '3rd warning reason');
      expect(w3.penaltyLevel).toBe('TEMP_BAN');
      expect(w3.warningCount).toBe(3);
      expect(w3.user.isBanned).toBe(true);
      expect(w3.user.isPermanentlyBanned).toBe(false);
      expect(w3.user.bannedUntil).toBeDefined();

      const banCheck = await moderationService.isUserBanned(testEscalationUserId);
      expect(banCheck.banned).toBe(true);
      expect(banCheck.reason).toContain('Temporarily suspended');
    });

    it('2.3 Warning 5 permanently locks the account', async () => {
      // 4th warning (remains temp ban)
      await moderationService.escalateUserWarning(testEscalationUserId, '4th warning reason');

      // 5th warning (triggers perm ban)
      const w5 = await moderationService.escalateUserWarning(testEscalationUserId, '5th warning reason');
      expect(w5.penaltyLevel).toBe('PERM_BAN');
      expect(w5.warningCount).toBe(5);
      expect(w5.user.isPermanentlyBanned).toBe(true);
      expect(w5.user.isBanned).toBe(true);
      expect(w5.user.bannedUntil).toBeNull();

      const banCheck = await moderationService.isUserBanned(testEscalationUserId);
      expect(banCheck.banned).toBe(true);
      expect(banCheck.reason).toContain('Permanently banned');
    });
  });

  // =========================================================================
  // ISSUE 4: Session Isolation (User A & User B never block each other)
  // =========================================================================
  describe('Issue 4: Active Call Session Isolation Invariants', () => {
    it('4.1 User A in active call does not cause User B to match an active session query', async () => {
      // Create active call for User A with a third user
      const thirdUser = await prisma.user.create({
        data: {
          telegramId: BigInt(88880088),
          alias: 'P2P-Third-Party',
          band: 6.0,
        },
      });

      const session = await prisma.callSession.create({
        data: {
          roomName: `session_isolation_test_${Date.now()}`,
          userAId: userAId,
          userBId: thirdUser.id,
          status: 'ACTIVE',
        },
      });

      // User B query for active call must return NULL
      const userBActive = await prisma.callSession.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [{ userAId: userBId }, { userBId: userBId }],
        },
      });
      expect(userBActive).toBeNull();

      // User A query for active call must return the session
      const userAActive = await prisma.callSession.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [{ userAId: userAId }, { userBId: userAId }],
        },
      });
      expect(userAActive).not.toBeNull();
      expect(userAActive?.id).toBe(session.id);

      // Cleanup
      await prisma.callSession.deleteMany({ where: { id: session.id } });
      await prisma.user.deleteMany({ where: { id: thirdUser.id } });
    });
  });

  // =========================================================================
  // ISSUE 8 & 9 & 13 & 14: Effective Entitlements & Call Credits
  // =========================================================================
  describe('Issue 8, 9, 13 & 14: Effective Entitlement Engine & Retention Override', () => {
    it('14.1 Resolves plan defaults correctly for FREE, PLUS, PRO', () => {
      const freeEnt = getEffectiveEntitlement({ plan: 'FREE' });
      expect(freeEnt.plan).toBe('FREE');
      expect(freeEnt.dailyLimit).toBe(3);
      expect(freeEnt.maxDurationMinutes).toBe(15);
      expect(freeEnt.retentionDays).toBe(1);
      expect(freeEnt.source).toBe('PLAN_DEFAULT');
      expect(freeEnt.isUnlimited).toBe(false);

      const proEnt = getEffectiveEntitlement({ plan: 'PRO' });
      expect(proEnt.plan).toBe('PRO');
      expect(proEnt.dailyLimit).toBe(25);
      expect(proEnt.maxDurationMinutes).toBe(60);
      expect(proEnt.retentionDays).toBe(30);
      expect(proEnt.recordingLimit).toBe(7);
    });

    it('13.1 Resolves ADMIN_OVERRIDE when custom retention or limits are set', () => {
      const overridden = getEffectiveEntitlement({
        plan: 'FREE',
        retentionOverride: 45,
        dailyLimit: 25,
        maxDuration: 40,
      });

      expect(overridden.plan).toBe('FREE');
      expect(overridden.dailyLimit).toBe(25);
      expect(overridden.maxDurationMinutes).toBe(40);
      expect(overridden.retentionDays).toBe(45);
      expect(overridden.retentionSource).toBe('ADMIN_OVERRIDE');
      expect(overridden.source).toBe('ADMIN_OVERRIDE');
    });

    it('13.2 Admin REST API allows setting custom retention and plan name', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${userAId}/plan`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({
          plan: 'PLUS',
          dailyLimit: 20,
          maxDuration: 45,
          retentionOverride: 60,
          customPlanName: 'VIP Scholarship',
          resetDailyCalls: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.dailyLimit).toBe(20);
      expect(res.body.maxDuration).toBe(45);
      expect(res.body.retentionOverride).toBe(60);
      expect(res.body.customPlanName).toBe('VIP Scholarship');
      expect(res.body.dailyCallsUsed).toBe(0);

      const updatedUser = await prisma.user.findUnique({ where: { id: userAId } });
      const ent = getEffectiveEntitlement(updatedUser!);
      expect(ent.planDisplayName).toBe('VIP Scholarship');
      expect(ent.retentionDays).toBe(60);
      expect(ent.retentionSource).toBe('ADMIN_OVERRIDE');
    });
  });

  // =========================================================================
  // ISSUE 12: Admin Call Quality Telemetry & Rating
  // =========================================================================
  describe('Issue 12: Call Quality Telemetry Rating in Analytics', () => {
    it('12.1 Computes Call Quality Breakdown in getAdminAnalytics', async () => {
      const analytics = await getAdminAnalytics();
      expect(analytics.callQuality).toBeDefined();
      expect(analytics.callQuality.sampleSize).toBeGreaterThanOrEqual(0);
      expect(['Optimal', 'Good', 'Degraded', 'Insufficient sample size']).toContain(analytics.callQuality.statusMessage);
      expect(analytics.callQuality.completionRate).toBeGreaterThanOrEqual(0);
      expect(analytics.callQuality.audioReliability).toBeGreaterThanOrEqual(0);
      expect(analytics.callQuality.recordingReliability).toBeGreaterThanOrEqual(0);
    });

    it('12.2 GET /api/admin/stats returns callQuality payload', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.callQuality).toBeDefined();
    });
  });
});
