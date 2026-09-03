import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { logger, clearRecentErrors } from '../utils/logger';
import { roomServiceClient } from '../config/livekit';

describe('Milestone M5 Challenger: Admin Telemetry & Concurrency Stress Matrix', () => {
  let adminJwtToken: string;
  let adminTelegramId: string;

  beforeEach(() => {
    adminTelegramId = env.ADMIN_TELEGRAM_IDS[0] || '12345678';
    adminJwtToken = jwt.sign(
      { role: 'admin', telegramId: adminTelegramId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
  });

  // =========================================================================
  // Section 1: Rapid Concurrent Telemetry Probing (Load & Race Resistance)
  // =========================================================================
  describe('1. Rapid Concurrency & High-Throughput Load Simulation', () => {
    it('handles 80 rapid concurrent requests across /health, /queue, /active-calls, and /errors without dropouts or crashes', async () => {
      const endpoints = [
        '/api/admin/telemetry/health',
        '/api/admin/telemetry/queue',
        '/api/admin/telemetry/active-calls',
        '/api/admin/telemetry/errors?limit=10',
      ];

      const requestPromises = Array.from({ length: 80 }, async (_, idx) => {
        const targetEndpoint = endpoints[idx % endpoints.length];
        const res = await request(app)
          .get(targetEndpoint)
          .set('Authorization', `Bearer ${adminJwtToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();

        if (targetEndpoint.includes('health')) {
          expect(['ok', 'degraded', 'error']).toContain(res.body.status);
          expect(res.body.api).toBeDefined();
        } else if (targetEndpoint.includes('queue')) {
          expect(typeof res.body.waitingCount).toBe('number');
          expect(res.body.buckets).toBeDefined();
        } else if (targetEndpoint.includes('active-calls')) {
          expect(typeof res.body.activeCallsCount).toBe('number');
          expect(Array.isArray(res.body.rooms)).toBe(true);
        } else if (targetEndpoint.includes('errors')) {
          expect(res.body.success).toBe(true);
          expect(Array.isArray(res.body.recentErrors)).toBe(true);
        }

        return res.body;
      });

      const results = await Promise.all(requestPromises);
      expect(results.length).toBe(80);
    });

    it('consistently reads active calls roster across 40 concurrent readers during live state changes', async () => {
      const userAlpha = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 1001),
          alias: 'Concurrent User A',
          band: 7.5,
          plan: 'PRO',
        },
      });

      const userBeta = await prisma.user.create({
        data: {
          telegramId: BigInt(Date.now() + 1002),
          alias: 'Concurrent User B',
          band: 6.5,
          plan: 'FREE',
        },
      });

      const activeSession = await prisma.callSession.create({
        data: {
          roomName: `m5-stress-room-${Date.now()}`,
          status: 'ACTIVE',
          userAId: userAlpha.id,
          userBId: userBeta.id,
          egressId: 'egress_stress_test_456',
        },
      });

      const readers = Array.from({ length: 40 }, async () => {
        const res = await request(app)
          .get('/api/admin/telemetry/active-calls')
          .set('Authorization', `Bearer ${adminJwtToken}`);

        expect(res.status).toBe(200);
        expect(res.body.activeCallsCount).toBeGreaterThanOrEqual(1);
        const room = res.body.rooms.find((r: any) => r.roomName === activeSession.roomName);
        expect(room).toBeDefined();
        expect(room.userA).toContain('Concurrent User A (Band 7.5)');
        expect(room.userB).toContain('Concurrent User B (Band 6.5)');
        expect(room.recording).toBe(true);
        expect(typeof room.durationSec).toBe('number');
      });

      await Promise.all(readers);

      // Clean up session
      await prisma.callSession.update({
        where: { id: activeSession.id },
        data: { status: 'ENDED' },
      });
    });

    it('safely handles concurrent error logging and buffer reading without race or corruption', async () => {
      clearRecentErrors();

      const writers = Array.from({ length: 30 }, async (_, i) => {
        logger.error(`Concurrent error write ${i}`, {
          service: 'stress_test',
          event: 'concurrent_write',
          index: i,
        });
      });

      const readers = Array.from({ length: 30 }, async () => {
        const res = await request(app)
          .get('/api/admin/telemetry/errors?limit=50')
          .set('Authorization', `Bearer ${adminJwtToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.recentErrors)).toBe(true);
      });

      await Promise.all([...writers, ...readers]);

      const finalCheck = await request(app)
        .get('/api/admin/telemetry/errors?limit=100')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(finalCheck.status).toBe(200);
      expect(finalCheck.body.recentErrors.length).toBeGreaterThanOrEqual(30);
    });
  });

  // =========================================================================
  // Section 2: Whole-Band Queue Aggregation & Redis Key Variance
  // =========================================================================
  describe('2. Whole-Band Queue Aggregation & Redis Key Variance Matrix', () => {
    it('aggregates candidate counts correctly across integer and decimal band keys with deduplication', async () => {
      const redis = getRedis();

      // Clean test keys
      await Promise.all([
        redis.del('match_queue:band:5.0'),
        redis.del('match_queue:band:5'),
        redis.del('match_queue:band:6.0'),
        redis.del('match_queue:band:6'),
        redis.del('match_queue:band:7.0'),
        redis.del('match_queue:band:7'),
        redis.del('match_queue:band:8.0'),
        redis.del('match_queue:band:8'),
        redis.del('match_queue:band:9.0'),
        redis.del('match_queue:band:9'),
      ]);

      // Seed candidate matrix:
      // Band 5: user_5a (5.0), user_5b (5), user_5_dup (both 5.0 and 5) -> Bucket 5 = 3
      await redis.sadd('match_queue:band:5.0', 'user_5a', 'user_5_dup');
      await redis.sadd('match_queue:band:5', 'user_5b', 'user_5_dup');

      // Band 6: user_6a (6.0), user_6b (6) -> Bucket 6 = 2
      await redis.sadd('match_queue:band:6.0', 'user_6a');
      await redis.sadd('match_queue:band:6', 'user_6b');

      // Band 7: user_7a (7.0) -> Bucket 7 = 1
      await redis.sadd('match_queue:band:7.0', 'user_7a');

      // Band 8: user_8a (8) -> Bucket 8 = 1
      await redis.sadd('match_queue:band:8', 'user_8a');

      // Band 9: user_9a (9.0) -> Bucket 9 = 1
      await redis.sadd('match_queue:band:9.0', 'user_9a');

      // Seed TTL waiting keys:
      // user_5a: TTL 850 (waited 50s)
      // user_6a: TTL 600 (waited 300s)
      // user_7a: TTL 100 (waited 800s) -> OLDEST
      // user_8a: TTL 900 (waited 0s)
      // user_9a: TTL -1 (no expire / abnormal) -> Ignored
      await redis.set('user_queue:user_5a', '1', 'EX', 850);
      await redis.set('user_queue:user_6a', '1', 'EX', 600);
      await redis.set('user_queue:user_7a', '1', 'EX', 100);
      await redis.set('user_queue:user_8a', '1', 'EX', 900);
      await redis.set('user_queue:user_9a', '1'); // No TTL (-1)

      const res = await request(app)
        .get('/api/admin/telemetry/queue')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.buckets['5']).toBe(3);
      expect(res.body.buckets['6']).toBe(2);
      expect(res.body.buckets['7']).toBe(1);
      expect(res.body.buckets['8']).toBe(1);
      expect(res.body.buckets['9']).toBe(1);
      expect(res.body.waitingCount).toBe(8); // user_5a, user_5b, user_5_dup, user_6a, user_6b, user_7a, user_8a, user_9a
      expect(res.body.oldestWaitingSec).toBe(800); // 900 - 100 = 800s

      // Clean up test keys
      await Promise.all([
        redis.del('match_queue:band:5.0'),
        redis.del('match_queue:band:5'),
        redis.del('match_queue:band:6.0'),
        redis.del('match_queue:band:6'),
        redis.del('match_queue:band:7.0'),
        redis.del('match_queue:band:7'),
        redis.del('match_queue:band:8.0'),
        redis.del('match_queue:band:8'),
        redis.del('match_queue:band:9.0'),
        redis.del('match_queue:band:9'),
        redis.del('user_queue:user_5a'),
        redis.del('user_queue:user_6a'),
        redis.del('user_queue:user_7a'),
        redis.del('user_queue:user_8a'),
        redis.del('user_queue:user_9a'),
      ]);
    });

    it('returns zero counts and zero wait time on completely empty queue', async () => {
      const redis = getRedis();
      await Promise.all([
        redis.del('match_queue:band:5.0'),
        redis.del('match_queue:band:5'),
        redis.del('match_queue:band:6.0'),
        redis.del('match_queue:band:6'),
        redis.del('match_queue:band:7.0'),
        redis.del('match_queue:band:7'),
        redis.del('match_queue:band:8.0'),
        redis.del('match_queue:band:8'),
        redis.del('match_queue:band:9.0'),
        redis.del('match_queue:band:9'),
      ]);

      const res = await request(app)
        .get('/api/admin/telemetry/queue')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.waitingCount).toBe(0);
      expect(res.body.buckets['5']).toBe(0);
      expect(res.body.buckets['6']).toBe(0);
      expect(res.body.buckets['7']).toBe(0);
      expect(res.body.buckets['8']).toBe(0);
      expect(res.body.buckets['9']).toBe(0);
      expect(res.body.oldestWaitingSec).toBe(0);
    });
  });

  // =========================================================================
  // Section 3: Authentication Security & Bypass Resilience
  // =========================================================================
  describe('3. Adversarial Authentication & Privilege Escalation Challenges', () => {
    it('rejects unauthenticated requests without session cookie or bearer token (401)', async () => {
      const testEndpoints = [
        '/api/admin/telemetry/health',
        '/api/admin/telemetry/queue',
        '/api/admin/telemetry/active-calls',
        '/api/admin/telemetry/errors',
      ];

      for (const ep of testEndpoints) {
        const res = await request(app).get(ep);
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('Unauthorized');
      }
    });

    it('rejects expired JWT token (401)', async () => {
      const expiredToken = jwt.sign(
        { role: 'admin', telegramId: adminTelegramId },
        env.JWT_SECRET,
        { expiresIn: '-1s', algorithm: 'HS256' }
      );

      const res = await request(app)
        .get('/api/admin/telemetry/health')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('rejects JWT signed with an invalid/untrusted secret (401)', async () => {
      const forgedSecretToken = jwt.sign(
        { role: 'admin', telegramId: adminTelegramId },
        'an_attacker_controlled_secret_key_123456789',
        { expiresIn: '1h', algorithm: 'HS256' }
      );

      const res = await request(app)
        .get('/api/admin/telemetry/health')
        .set('Authorization', `Bearer ${forgedSecretToken}`);

      expect(res.status).toBe(401);
    });

    it('rejects forged role (e.g. role: user, moderator, superuser) (403)', async () => {
      const forgedUserToken = jwt.sign(
        { role: 'user', telegramId: adminTelegramId },
        env.JWT_SECRET,
        { expiresIn: '1h', algorithm: 'HS256' }
      );

      const res = await request(app)
        .get('/api/admin/telemetry/queue')
        .set('Authorization', `Bearer ${forgedUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('rejects valid admin role with non-whitelisted Telegram ID (403)', async () => {
      const unauthorizedTgIdToken = jwt.sign(
        { role: 'admin', telegramId: '9876543210' },
        env.JWT_SECRET,
        { expiresIn: '1h', algorithm: 'HS256' }
      );

      const res = await request(app)
        .get('/api/admin/telemetry/active-calls')
        .set('Authorization', `Bearer ${unauthorizedTgIdToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('whitelist');
    });

    it('rejects malformed telegramId (e.g. 0, negative, alphanumeric, null) (403 or 401)', async () => {
      const malformedPayloads = [
        { role: 'admin', telegramId: 0 },
        { role: 'admin', telegramId: '0' },
        { role: 'admin', telegramId: -12345 },
        { role: 'admin', telegramId: 'admin_injection_id' },
        { role: 'admin', telegramId: null },
      ];

      for (const payload of malformedPayloads) {
        const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
        const res = await request(app)
          .get('/api/admin/telemetry/errors')
          .set('Authorization', `Bearer ${token}`);

        expect([401, 403]).toContain(res.status);
      }
    });

    it('authenticates successfully via HttpOnly admin_session cookie', async () => {
      const res = await request(app)
        .get('/api/admin/telemetry/health')
        .set('Cookie', [`admin_session=${adminJwtToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
    });
  });

  // =========================================================================
  // Section 4: Degradation & Fault Injection Resilience
  // =========================================================================
  describe('4. Subsystem Degradation & Fault Injection Resilience', () => {
    it('gracefully reports database down status without unhandled 500 crash when DB query fails', async () => {
      const findFirstSpy = vi.spyOn(prisma.user, 'findFirst').mockRejectedValueOnce(new Error('DB Connection Refused'));

      const res = await request(app)
        .get('/api/admin/telemetry/health')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.database.status).toBe('down');
      expect(res.body.status).toBe('error');

      findFirstSpy.mockRestore();
    });

    it('gracefully reports degraded database when query latency exceeds 500ms', async () => {
      const findFirstSpy = vi.spyOn(prisma.user, 'findFirst').mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 520));
        return { id: 'test_user_id' } as any;
      });

      const res = await request(app)
        .get('/api/admin/telemetry/health')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.database.status).toBe('degraded');
      expect(res.body.status).toBe('degraded');

      findFirstSpy.mockRestore();
    });

    it('gracefully reports redis down status when Redis ping fails during health probe', async () => {
      const redis = getRedis();
      const setSpy = vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('Redis Socket Closed'));

      const res = await request(app)
        .get('/api/admin/telemetry/health')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.redis.status).toBe('down');
      expect(res.body.status).toBe('error');

      setSpy.mockRestore();
    });

    it('handles Redis failure in /queue probe gracefully with empty bucket array without crashing', async () => {
      const redis = getRedis();
      const smembersSpy = vi.spyOn(redis, 'smembers').mockRejectedValue(new Error('Redis Cluster Unavailable'));

      const res = await request(app)
        .get('/api/admin/telemetry/queue')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.waitingCount).toBe(0);
      expect(res.body.buckets['5']).toBe(0);
      expect(res.body.buckets['6']).toBe(0);

      smembersSpy.mockRestore();
    });

    it('gracefully handles LiveKit room service errors without crashing and reports degraded livekit status', async () => {
      if (roomServiceClient) {
        const listRoomsSpy = vi.spyOn(roomServiceClient, 'listRooms').mockRejectedValueOnce(new Error('LiveKit gRPC timeout'));

        const res = await request(app)
          .get('/api/admin/telemetry/health')
          .set('Authorization', `Bearer ${adminJwtToken}`);

        expect(res.status).toBe(200);
        expect(res.body.livekit.status).toBe('degraded');

        listRoomsSpy.mockRestore();
      }
    });

    it('clamps /errors limit parameter cleanly on negative, zero, or overflow values', async () => {
      // 1. Negative limit -> Clamped to min 1
      const resNeg = await request(app)
        .get('/api/admin/telemetry/errors?limit=-50')
        .set('Authorization', `Bearer ${adminJwtToken}`);
      expect(resNeg.status).toBe(200);
      expect(resNeg.body.recentErrors.length).toBeLessThanOrEqual(1);

      // 2. Huge limit -> Clamped to max 100
      const resHuge = await request(app)
        .get('/api/admin/telemetry/errors?limit=99999')
        .set('Authorization', `Bearer ${adminJwtToken}`);
      expect(resHuge.status).toBe(200);
      expect(resHuge.body.recentErrors.length).toBeLessThanOrEqual(100);

      // 3. Malformed string limit -> Defaults to 50
      const resMalformed = await request(app)
        .get('/api/admin/telemetry/errors?limit=invalid_nan')
        .set('Authorization', `Bearer ${adminJwtToken}`);
      expect(resMalformed.status).toBe(200);
      expect(resMalformed.body.recentErrors.length).toBeLessThanOrEqual(50);
    });
  });

  // =========================================================================
  // Section 5: Schema and Audit Log Immutability Verification
  // =========================================================================
  describe('5. Schema Integrity & Concurrent Audit Log Persistence', () => {
    it('records concurrent audit logs cleanly without transaction aborts or schema errors', async () => {
      const concurrentMutations = Array.from({ length: 15 }, async (_, i) => {
        const res = await request(app)
          .post('/api/admin/contest')
          .set('Authorization', `Bearer ${adminJwtToken}`)
          .send({
            title: `Stress Contest ${i} - ${Date.now()}`,
            description: `Concurrency stress test iteration ${i}`,
            prizes: '1st: VIP',
            durationDays: 7,
          });

        expect(res.status).toBe(200);
        return res.body.contest.id;
      });

      const contestIds = await Promise.all(concurrentMutations);
      expect(contestIds.length).toBe(15);

      const logs = await prisma.auditLog.findMany({
        where: {
          action: 'CONTEST_MUTATION',
          targetId: { in: contestIds },
        },
      });

      expect(logs.length).toBe(15);
      for (const log of logs) {
        expect(log.adminId).toBe(adminTelegramId);
        expect(log.createdAt).toBeDefined();
        expect(log.afterState).toBeDefined();
      }
    });
  });
});
