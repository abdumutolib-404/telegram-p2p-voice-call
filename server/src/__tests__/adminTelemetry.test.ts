import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

describe('Milestone M5: Operations Control Plane & Admin Telemetry API', () => {
  let adminJwtToken: string;
  let nonAdminJwtToken: string;

  beforeAll(async () => {
    // Generate valid admin token
    const adminTgId = env.ADMIN_TELEGRAM_IDS[0] || '12345678';
    adminJwtToken = jwt.sign(
      { role: 'admin', telegramId: adminTgId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    // Generate non-admin token
    nonAdminJwtToken = jwt.sign(
      { role: 'user', telegramId: '99999999' },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
  });

  describe('1. Security & Authentication Guards', () => {
    it('rejects /health probe without authentication (401)', async () => {
      const res = await request(app).get('/api/admin/telemetry/health');
      expect(res.status).toBe(401);
    });

    it('rejects /queue probe with non-admin token (403)', async () => {
      const res = await request(app)
        .get('/api/admin/telemetry/queue')
        .set('Authorization', `Bearer ${nonAdminJwtToken}`);
      expect(res.status).toBe(403);
    });

    it('rejects /active-calls with malformed token (401)', async () => {
      const res = await request(app)
        .get('/api/admin/telemetry/active-calls')
        .set('Authorization', 'Bearer invalid_token_xyz');
      expect(res.status).toBe(401);
    });

    it('rejects /errors without authentication (401)', async () => {
      const res = await request(app).get('/api/admin/telemetry/errors');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Health Telemetry Probe (`GET /api/admin/telemetry/health`)', () => {
    it('returns 200 with full subsystem probe metrics', async () => {
      const res = await request(app)
        .get('/api/admin/telemetry/health')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(['ok', 'degraded', 'error']).toContain(res.body.status);

      // API Process Metrics
      expect(res.body.api).toBeDefined();
      expect(typeof res.body.api.uptime).toBe('number');
      expect(res.body.api.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof res.body.api.memoryMb).toBe('number');
      expect(res.body.api.memoryMb).toBeGreaterThan(0);

      // PostgreSQL Database Metrics
      expect(res.body.database).toBeDefined();
      expect(['healthy', 'degraded', 'down']).toContain(res.body.database.status);
      expect(typeof res.body.database.latencyMs).toBe('number');

      // Redis Cache Metrics
      expect(res.body.redis).toBeDefined();
      expect(['healthy', 'degraded', 'down']).toContain(res.body.redis.status);
      expect(typeof res.body.redis.latencyMs).toBe('number');

      // LiveKit Metrics
      expect(res.body.livekit).toBeDefined();
      expect(['healthy', 'degraded', 'down']).toContain(res.body.livekit.status);
      expect(typeof res.body.livekit.activeRooms).toBe('number');

      // Bot Engine Metrics
      expect(res.body.bot).toBeDefined();
      expect(['healthy', 'degraded', 'down']).toContain(res.body.bot.status);
      expect(typeof res.body.bot.polling).toBe('boolean');
      expect(res.body.bot.lastUpdateTs).toBeDefined();
    });
  });

  describe('3. Matchmaking Queue Telemetry (`GET /api/admin/telemetry/queue`)', () => {
    it('returns candidate counts per whole-band bucket (5-9) and oldest waiting duration', async () => {
      const redis = getRedis();

      // Seed candidate in band 6.0 and band 7.0
      await redis.sadd('match_queue:band:6.0', 'cand_user_m5_1');
      await redis.sadd('match_queue:band:7.0', 'cand_user_m5_2');
      await redis.set('user_queue:cand_user_m5_1', '1', 'EX', 850); // 50s waiting

      const res = await request(app)
        .get('/api/admin/telemetry/queue')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.waitingCount).toBe('number');
      expect(res.body.waitingCount).toBeGreaterThanOrEqual(2);
      expect(res.body.buckets).toBeDefined();
      expect(res.body.buckets['5']).toBeDefined();
      expect(res.body.buckets['6']).toBeGreaterThanOrEqual(1);
      expect(res.body.buckets['7']).toBeGreaterThanOrEqual(1);
      expect(res.body.buckets['8']).toBeDefined();
      expect(res.body.buckets['9']).toBeDefined();
      expect(typeof res.body.oldestWaitingSec).toBe('number');
      expect(res.body.oldestWaitingSec).toBeGreaterThanOrEqual(0);

      // Clean up test redis keys
      await redis.srem('match_queue:band:6.0', 'cand_user_m5_1');
      await redis.srem('match_queue:band:7.0', 'cand_user_m5_2');
      await redis.del('user_queue:cand_user_m5_1');
    });
  });

  describe('4. Active Calls Telemetry (`GET /api/admin/telemetry/active-calls`)', () => {
    it('returns active call sessions with participants, duration, and recording status', async () => {
      // Seed two users and an active call session
      const userA = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 101),
          alias: 'Candidate Alpha',
          band: 7.0,
          plan: 'PLUS',
        },
      });

      const userB = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 102),
          alias: 'Candidate Beta',
          band: 6.5,
          plan: 'FREE',
        },
      });

      const activeSession = await prisma.callSession.create({
        data: {
          roomName: `m5-telemetry-room-${Date.now()}`,
          status: 'ACTIVE',
          userAId: userA.id,
          userBId: userB.id,
          egressId: 'egress_live_test_123',
        },
      });

      const res = await request(app)
        .get('/api/admin/telemetry/active-calls')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.activeCallsCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.rooms)).toBe(true);

      const targetRoom = res.body.rooms.find((r: any) => r.roomName === activeSession.roomName);
      expect(targetRoom).toBeDefined();
      expect(targetRoom.userA).toContain('Candidate Alpha');
      expect(targetRoom.userB).toContain('Candidate Beta');
      expect(targetRoom.recording).toBe(true);
      expect(typeof targetRoom.durationSec).toBe('number');

      // Clean up session
      await prisma.callSession.update({
        where: { id: activeSession.id },
        data: { status: 'ENDED' },
      });
    });
  });

  describe('5. Error Telemetry Ring Buffer (`GET /api/admin/telemetry/errors`)', () => {
    it('returns recent structured errors with timestamp, requestId, and level', async () => {
      const uniqueErrorId = 'm5_unique_err_' + Math.floor(Math.random() * 100000);
      const testErrorMessage = `M5 telemetry test error for ${uniqueErrorId}`;
      logger.error(testErrorMessage, {
        service: 'test_telemetry',
        event: 'm5_test_event',
      });

      const res = await request(app)
        .get('/api/admin/telemetry/errors?limit=20')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(1);

      const errorEntry = res.body.recentErrors.find((e: any) => e.message === testErrorMessage);
      expect(errorEntry).toBeDefined();
      expect(errorEntry.timestamp).toBeDefined();
      expect(errorEntry.level).toBeDefined();
    });
  });

  describe('6. Immutable Administrative Audit Logging Across All Mutations', () => {
    it('records GLOBAL_PLANS_UPDATE on PUT /api/admin/plans', async () => {
      const putRes = await request(app)
        .put('/api/admin/plans')
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .send({
          PLUS: { maxDuration: 30, dailyLimit: 12, retentionDays: 7, starsPrice: 79 },
        });

      expect(putRes.status).toBe(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'GLOBAL_PLANS_UPDATE' },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.targetId).toBe('plans_config');
      expect(auditLog?.beforeState).toBeDefined();
      expect(auditLog?.afterState).toBeDefined();
    });

    it('records USER_PLAN_UPDATE on PATCH /api/admin/users/:id/plan', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 201),
          alias: 'Plan Test Candidate',
          band: 6.0,
          plan: 'FREE',
          dailyLimit: 3,
        },
      });

      const patchRes = await request(app)
        .patch(`/api/admin/users/${user.id}/plan`)
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .send({
          plan: 'BOSS',
          dailyLimit: 50,
          maxDuration: 90,
          customPlanName: 'VIP Boss Plan',
          durationDays: 60,
        });

      expect(patchRes.status).toBe(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'USER_PLAN_UPDATE', targetId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.adminId).toBeDefined();
      expect(auditLog?.beforeState).toContain('FREE');
      expect(auditLog?.afterState).toContain('BOSS');
    });

    it('records USER_BAN on POST /api/admin/users/:id/ban', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 301),
          alias: 'Ban Test Candidate',
          band: 5.5,
          plan: 'FREE',
        },
      });

      const banRes = await request(app)
        .post(`/api/admin/users/${user.id}/ban`)
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .send({
          permanent: true,
          reason: 'Severe violation of conduct guidelines',
        });

      expect(banRes.status).toBe(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'USER_BAN', targetId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.reason).toContain('Severe violation');
      expect(auditLog?.afterState).toContain('"isPermanentlyBanned":true');
    });

    it('records USER_MODERATION on POST /api/admin/users/:id/moderate', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 401),
          alias: 'Moderate Candidate',
          band: 7.0,
          plan: 'PLUS',
          dailyCallsUsed: 5,
        },
      });

      const modRes = await request(app)
        .post(`/api/admin/users/${user.id}/moderate`)
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .send({
          action: 'reset-calls',
          reason: 'Good behavior compensation',
        });

      expect(modRes.status).toBe(200);
      expect(modRes.body.dailyCallsUsed).toBe(0);

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'USER_MODERATION', targetId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.reason).toContain('Good behavior compensation');
      expect(auditLog?.afterState).toContain('"dailyCallsUsed":0');
    });

    it('records APPEAL_APPROVED on POST /api/admin/appeals/:id/approve', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 501),
          alias: 'Appeal Approved User',
          band: 6.0,
          plan: 'FREE',
          isBanned: true,
          isPermanentlyBanned: true,
        },
      });

      const appeal = await prisma.unblockAppeal.create({
        data: {
          userId: user.id,
          telegramId: user.telegramId,
          alias: user.alias,
          banReason: 'Inappropriate conduct',
          appealText: 'I apologize and promise to uphold guidelines.',
          status: 'PENDING',
        },
      });

      const approveRes = await request(app)
        .post(`/api/admin/appeals/${appeal.id}/approve`)
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(approveRes.status).toBe(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'APPEAL_APPROVED', targetId: appeal.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.afterState).toContain('APPROVED');
    });

    it('records APPEAL_REJECTED on POST /api/admin/appeals/:id/reject', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 601),
          alias: 'Appeal Rejected User',
          band: 5.0,
          plan: 'FREE',
          isBanned: true,
          isPermanentlyBanned: true,
        },
      });

      const appeal = await prisma.unblockAppeal.create({
        data: {
          userId: user.id,
          telegramId: user.telegramId,
          alias: user.alias,
          banReason: 'Repeated harassment',
          appealText: 'Please unban me now.',
          status: 'PENDING',
        },
      });

      const rejectRes = await request(app)
        .post(`/api/admin/appeals/${appeal.id}/reject`)
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(rejectRes.status).toBe(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'APPEAL_REJECTED', targetId: appeal.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.afterState).toContain('REJECTED');
    });

    it('records CONTEST_MUTATION on POST /api/admin/contest', async () => {
      const contestRes = await request(app)
        .post('/api/admin/contest')
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .send({
          title: 'IELTS Autumn Speaking Sprint',
          description: 'Top referrers receive 60-day VIP plan upgrades.',
          prizes: '🥇 1st: 60-Day BOSS\n🥈 2nd: 30-Day BOSS\n🥉 3rd: 14-Day PRO',
          durationDays: 14,
        });

      expect(contestRes.status).toBe(200);
      const contestId = contestRes.body.contest.id;

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'CONTEST_MUTATION', targetId: contestId },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.afterState).toContain('IELTS Autumn Speaking Sprint');
    });

    it('records CONTEST_TOGGLE on POST /api/admin/contest/toggle', async () => {
      const toggleRes = await request(app)
        .post('/api/admin/contest/toggle')
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .send({
          isActive: true,
        });

      expect(toggleRes.status).toBe(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'CONTEST_TOGGLE' },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.afterState).toContain('"isActive":true');
    });

    it('fetches audit logs via GET /api/admin/audit-logs with valid admin JWT', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const sampleLog = res.body[0];
      expect(sampleLog).toHaveProperty('id');
      expect(sampleLog).toHaveProperty('action');
      expect(sampleLog).toHaveProperty('adminId');
      expect(sampleLog).toHaveProperty('createdAt');
    });
  });
});
